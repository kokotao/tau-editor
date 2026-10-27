/**
 * @description 云配额 Store：扩容方案弹窗的唯一数据源（summary / plans / 签到 / 积分 / 支付轮询）。
 * - 所有网络调用都走 `cloudQuotaService`（Rust 侧带 JWT），失败只记 error，不抛异常；
 * - 支付轮询在组件卸载时通过 `closePay()` 终止，避免弹窗关掉后仍在打接口；
 * - 不做本地假数据：接口不可用时由 UI 降级到「联系管理员开通」。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 17:10
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  CloudCheckinResult,
  CloudCheckinStatus,
  CloudPoints,
  CloudQuotaOrder,
  CloudQuotaPlan,
  CloudQuotaSummary,
} from '@/lib/tauri';
import {
  checkinNow,
  createQuotaOrder,
  getCheckinStatus,
  getPoints,
  getQuotaOrder,
  getQuotaPlans,
  getQuotaSummary,
  isPayChannelUnavailable,
  payQuotaOrder,
  type CloudQuotaSnapshot,
} from '@/services/cloudQuotaService';
import type { CloudOutcome } from '@/services/cloudDocService';

/** 订单轮询间隔与总时长：微信 Native 订单默认 30 分钟有效，这里只等 3 分钟避免长期占资源。 */
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;
/** 同一份数据 30 秒内不重复拉，弹窗反复开关时不打接口。 */
const SUMMARY_TTL_MS = 30_000;

export type CloudPayPollResult = 'paid' | 'closed' | 'timeout';

export const useCloudQuotaStore = defineStore('cloudQuota', () => {
  const summary = ref<CloudQuotaSummary | null>(null);
  const plans = ref<CloudQuotaPlan[]>([]);
  const checkin = ref<CloudCheckinStatus | null>(null);
  const points = ref<CloudPoints | null>(null);

  const loading = ref(false);
  const loadingPlans = ref(false);
  const error = ref<string | null>(null);
  const lastLoadedAt = ref(0);

  /** 支付态：当前二维码属于哪个订单，paidOrderNo 用于 UI 展示成功态。 */
  const payingOrderNo = ref<string | null>(null);
  const payingPlanId = ref<number | null>(null);
  const payingQr = ref<string | null>(null);
  const payingExpireAt = ref<string | null>(null);
  const paidOrderNo = ref<string | null>(null);
  const paying = ref(false);

  let pollToken = 0;

  const tier = computed(() => summary.value?.tier ?? 'FREE');
  const pointsBalance = computed(() => points.value?.balance ?? summary.value?.points ?? 0);
  const rewardCapBytes = computed(
    () => summary.value?.rewardCapBytes ?? checkin.value?.rewardCapBytes ?? 0,
  );
  const rewardLifetimeBytes = computed(
    () => summary.value?.rewardLifetimeBytes ?? checkin.value?.rewardLifetimeBytes ?? 0,
  );
  const todayChecked = computed(() => checkin.value?.todayChecked ?? false);
  const streakDays = computed(() => checkin.value?.streakDays ?? 0);

  function applySummary(next: CloudQuotaSummary | null): void {
    if (!next) {
      return;
    }
    summary.value = next;
    // 签到/积分接口失败时，summary 里也带最小可用信息，避免弹窗出现空白
    if (!checkin.value) {
      checkin.value = {
        todayChecked: false,
        streakDays: 0,
        rewardActiveBytes: next.rewardBytes,
        rewardLifetimeBytes: next.rewardLifetimeBytes,
        rewardCapBytes: next.rewardCapBytes,
        points: next.points,
      };
    }
    if (!points.value) {
      points.value = { balance: next.points, lifetimeEarned: next.points, recent: [] };
    }
  }

  async function refreshSummary(): Promise<void> {
    const outcome = await getQuotaSummary();
    if (outcome.ok) {
      applySummary(outcome.data);
      error.value = null;
      lastLoadedAt.value = Date.now();
    } else {
      error.value = outcome.message;
    }
  }

  async function loadPlans(): Promise<void> {
    if (loadingPlans.value) {
      return;
    }
    loadingPlans.value = true;
    try {
      const outcome = await getQuotaPlans();
      if (outcome.ok) {
        plans.value = outcome.data;
      }
    } finally {
      loadingPlans.value = false;
    }
  }

  async function loadCheckin(): Promise<void> {
    const outcome = await getCheckinStatus();
    if (outcome.ok) {
      checkin.value = outcome.data;
    }
  }

  async function loadPoints(): Promise<void> {
    const outcome = await getPoints();
    if (outcome.ok) {
      points.value = outcome.data;
    }
  }

  /** 弹窗打开时一次拉齐（force=false 时 30 秒内复用缓存）。 */
  async function loadAll(force = false): Promise<void> {
    if (!force && lastLoadedAt.value > 0 && Date.now() - lastLoadedAt.value < SUMMARY_TTL_MS) {
      return;
    }
    if (loading.value) {
      return;
    }
    loading.value = true;
    try {
      const [summaryOutcome, checkinOutcome, pointsOutcome] = await Promise.all([
        getQuotaSummary(),
        getCheckinStatus(),
        getPoints(),
      ]);
      if (summaryOutcome.ok) {
        applySummary(summaryOutcome.data);
        lastLoadedAt.value = Date.now();
        error.value = null;
      } else {
        error.value = summaryOutcome.message;
      }
      if (checkinOutcome.ok) {
        checkin.value = checkinOutcome.data;
      }
      if (pointsOutcome.ok) {
        points.value = pointsOutcome.data;
      }
      if (plans.value.length === 0) {
        await loadPlans();
      }
    } finally {
      loading.value = false;
    }
  }

  /** 签到：成功后同步刷新 summary（容量与积分都变了）。 */
  async function doCheckin(): Promise<{ ok: boolean; message?: string; result?: CloudCheckinResult }> {
    const outcome = await checkinNow();
    if (!outcome.ok) {
      // 409「今天已经签到过了」按已签到处理，不出错误提示
      if (outcome.kind === 'conflict' || /已经签到/.test(outcome.message)) {
        await loadCheckin();
        return { ok: true };
      }
      return { ok: false, message: outcome.message };
    }
    const result = outcome.data;
    checkin.value = {
      todayChecked: true,
      streakDays: result.streakDays,
      rewardActiveBytes: result.rewardActiveBytes,
      rewardLifetimeBytes:
        (checkin.value?.rewardLifetimeBytes ?? 0) + Math.max(0, result.grantedBytes),
      rewardCapBytes: checkin.value?.rewardCapBytes ?? rewardCapBytes.value,
      nextResetAt: checkin.value?.nextResetAt ?? null,
      points: result.points,
    };
    points.value = {
      balance: result.points,
      lifetimeEarned: points.value?.lifetimeEarned ?? result.points,
      recent: points.value?.recent ?? [],
    };
    lastLoadedAt.value = 0;
    await refreshSummary();
    return { ok: true, result };
  }

  async function createOrder(planId: number): Promise<CloudOutcome<CloudQuotaOrder>> {
    const outcome = await createQuotaOrder(planId);
    if (outcome.ok) {
      payingPlanId.value = planId;
      paidOrderNo.value = null;
    }
    return outcome;
  }

  /** 下单并取二维码：返回失败时 UI 依据 isPayChannelUnavailable 决定是否降级。 */
  async function startPay(
    orderNo: string,
  ): Promise<{ ok: boolean; message?: string; channelUnavailable?: boolean }> {
    paying.value = true;
    payingQr.value = null;
    payingOrderNo.value = orderNo;
    try {
      const outcome = await payQuotaOrder(orderNo);
      if (!outcome.ok) {
        payingOrderNo.value = null;
        return {
          ok: false,
          message: outcome.message,
          channelUnavailable: isPayChannelUnavailable(outcome),
        };
      }
      payingQr.value = outcome.data.codeUrl;
      payingExpireAt.value = outcome.data.expireAt ?? null;
      return { ok: true };
    } finally {
      paying.value = false;
    }
  }

  /** 轮询支付结果：PAID → paid；CLOSED/REFUNDED → closed；超时 → timeout。 */
  async function pollOrder(
    orderNo: string,
    timeoutMs = POLL_TIMEOUT_MS,
  ): Promise<CloudPayPollResult> {
    const token = ++pollToken;
    const deadline = Date.now() + Math.max(5_000, timeoutMs);
    while (Date.now() < deadline) {
      if (token !== pollToken) {
        return 'closed';
      }
      const outcome = await getQuotaOrder(orderNo);
      if (token !== pollToken) {
        return 'closed';
      }
      if (outcome.ok) {
        const status = outcome.data.status;
        if (status === 'PAID') {
          paidOrderNo.value = orderNo;
          payingQr.value = null;
          lastLoadedAt.value = 0;
          await refreshSummary();
          return 'paid';
        }
        if (status === 'CLOSED' || status === 'REFUNDED' || status === 'PAY_FAILED') {
          payingQr.value = null;
          return 'closed';
        }
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return 'timeout';
  }

  /** 关闭支付弹层：中止轮询并清空二维码（已支付结果保留）。 */
  function closePay(): void {
    pollToken += 1;
    payingOrderNo.value = null;
    payingPlanId.value = null;
    payingQr.value = null;
    payingExpireAt.value = null;
  }

  function reset(): void {
    closePay();
    summary.value = null;
    plans.value = [];
    checkin.value = null;
    points.value = null;
    error.value = null;
    lastLoadedAt.value = 0;
    paidOrderNo.value = null;
  }

  return {
    // state
    summary,
    plans,
    /**
     * 签到状态。**不能叫 `checkin`**：下面 action 也叫 `checkin()`，
     * 同一个对象里重名会让 TS 报 TS1117 且运行时后者覆盖前者。
     */
    checkinStatus: checkin,
    points,
    loading,
    loadingPlans,
    error,
    lastLoadedAt,
    payingOrderNo,
    payingPlanId,
    payingQr,
    payingExpireAt,
    paidOrderNo,
    paying,
    // getters
    tier,
    pointsBalance,
    rewardCapBytes,
    rewardLifetimeBytes,
    todayChecked,
    streakDays,
    // actions
    loadAll,
    loadPlans,
    refreshSummary,
    checkin: doCheckin,
    createOrder,
    startPay,
    pollOrder,
    closePay,
    reset,
  };
});

export type CloudQuotaStore = ReturnType<typeof useCloudQuotaStore>;
export type { CloudQuotaSnapshot };
