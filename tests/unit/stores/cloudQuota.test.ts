/**
 * @description 云配额 Store：拉取汇总、签到幂等、扫码支付轮询与关闭中止的契约。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 17:25
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const serviceMocks = vi.hoisted(() => ({
  getQuotaSummary: vi.fn(),
  getQuotaPlans: vi.fn(),
  createQuotaOrder: vi.fn(),
  getQuotaOrder: vi.fn(),
  payQuotaOrder: vi.fn(),
  getCheckinStatus: vi.fn(),
  checkinNow: vi.fn(),
  getPoints: vi.fn(),
  isPayChannelUnavailable: vi.fn(),
}));

vi.mock('@/services/cloudQuotaService', () => ({
  getQuotaSummary: serviceMocks.getQuotaSummary,
  getQuotaPlans: serviceMocks.getQuotaPlans,
  createQuotaOrder: serviceMocks.createQuotaOrder,
  getQuotaOrder: serviceMocks.getQuotaOrder,
  payQuotaOrder: serviceMocks.payQuotaOrder,
  getCheckinStatus: serviceMocks.getCheckinStatus,
  checkinNow: serviceMocks.checkinNow,
  getPoints: serviceMocks.getPoints,
  isPayChannelUnavailable: serviceMocks.isPayChannelUnavailable,
}));

import { useCloudQuotaStore } from '@/stores/cloudQuota';

const GB = 1024 ** 3;

const SUMMARY = {
  usedBytes: 2048,
  permanentBytes: 8 * GB,
  planBytes: 10 * GB,
  rewardBytes: 200 * 1024 ** 2,
  quotaBytes: 18 * GB + 200 * 1024 ** 2,
  tier: 'PLUS' as const,
  tierName: 'Plus 个人版',
  renewAt: '2026-11-27 17:00:00',
  rewardCapBytes: 10 * GB,
  rewardLifetimeBytes: 200 * 1024 ** 2,
  points: 30,
};

const CHECKIN = {
  todayChecked: false,
  streakDays: 6,
  rewardActiveBytes: 200 * 1024 ** 2,
  rewardLifetimeBytes: 200 * 1024 ** 2,
  rewardCapBytes: 10 * GB,
  nextResetAt: '2026-10-28 00:00:00',
  points: 30,
};

const PLANS = [
  {
    planId: 101,
    code: 'CLOUD_PLUS_MONTH',
    tier: 'PLUS' as const,
    name: 'Plus 个人版',
    bytes: 10 * GB,
    cycle: 'MONTH' as const,
    price: 600,
  },
];

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(message: string, kind = 'network') {
  return { ok: false as const, kind: kind as never, message };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  serviceMocks.getQuotaSummary.mockResolvedValue(ok(SUMMARY));
  serviceMocks.getQuotaPlans.mockResolvedValue(ok(PLANS));
  serviceMocks.getCheckinStatus.mockResolvedValue(ok(CHECKIN));
  serviceMocks.getPoints.mockResolvedValue(ok({ balance: 30, lifetimeEarned: 30, recent: [] }));
  serviceMocks.isPayChannelUnavailable.mockReturnValue(false);
});

describe('useCloudQuotaStore', () => {
  it('loadAll 拉齐 summary / 签到 / 积分 / 套餐', async () => {
    const store = useCloudQuotaStore();
    await store.loadAll();

    expect(store.summary?.quotaBytes).toBe(SUMMARY.quotaBytes);
    expect(store.checkinStatus?.streakDays).toBe(6);
    expect(store.pointsBalance).toBe(30);
    expect(store.plans).toHaveLength(1);
    expect(store.tier).toBe('PLUS');
    expect(store.error).toBeNull();
  });

  it('summary 失败时记 error，但不抛异常（弹窗可降级展示）', async () => {
    serviceMocks.getQuotaSummary.mockResolvedValue(fail('网络连接超时'));
    const store = useCloudQuotaStore();
    await expect(store.loadAll()).resolves.toBeUndefined();
    expect(store.error).toContain('网络连接超时');
    expect(store.summary).toBeNull();
  });

  it('30 秒 TTL 内重复调用不再打接口；force 强制刷新', async () => {
    const store = useCloudQuotaStore();
    await store.loadAll();
    await store.loadAll();
    expect(serviceMocks.getQuotaSummary).toHaveBeenCalledTimes(1);

    await store.loadAll(true);
    expect(serviceMocks.getQuotaSummary).toHaveBeenCalledTimes(2);
  });

  it('签到成功：更新签到态与积分，并刷新 summary', async () => {
    serviceMocks.checkinNow.mockResolvedValue(
      ok({
        grantedBytes: 70 * 1024 ** 2,
        doubled: false,
        streakDays: 7,
        points: 40,
        pointsDelta: 10,
        rewardActiveBytes: 270 * 1024 ** 2,
        expiresAt: '2026-11-26 17:00:00',
        checkinDate: '2026-10-27',
      }),
    );
    serviceMocks.getQuotaSummary.mockResolvedValue(
      ok({ ...SUMMARY, rewardBytes: 270 * 1024 ** 2, points: 40 }),
    );

    const store = useCloudQuotaStore();
    await store.loadAll();
    const result = await store.checkin();

    expect(result.ok).toBe(true);
    expect(store.todayChecked).toBe(true);
    expect(store.streakDays).toBe(7);
    expect(store.pointsBalance).toBe(40);
    expect(store.summary?.rewardBytes).toBe(270 * 1024 ** 2);
  });

  it('重复签到（409）按已签到处理，不弹错误', async () => {
    serviceMocks.checkinNow.mockResolvedValue(fail('今天已经签到过了', 'conflict'));
    serviceMocks.getCheckinStatus.mockResolvedValue(ok({ ...CHECKIN, todayChecked: true }));

    const store = useCloudQuotaStore();
    const result = await store.checkin();
    expect(result.ok).toBe(true);
    expect(store.todayChecked).toBe(true);
  });

  it('startPay 成功时保存二维码；通道不可用时回传 channelUnavailable', async () => {
    serviceMocks.payQuotaOrder.mockResolvedValue(
      ok({ orderNo: 'CLQ1', codeUrl: 'weixin://wxpay/bizpayurl?pr=abc', expireAt: null }),
    );
    const store = useCloudQuotaStore();
    const paid = await store.startPay('CLQ1');
    expect(paid.ok).toBe(true);
    expect(store.payingQr).toContain('weixin://');

    serviceMocks.payQuotaOrder.mockResolvedValue(fail('支付通道未开通'));
    serviceMocks.isPayChannelUnavailable.mockReturnValue(true);
    const blocked = await store.startPay('CLQ2');
    expect(blocked.ok).toBe(false);
    expect(blocked.channelUnavailable).toBe(true);
    expect(store.payingQr).toBeNull();
  });

  it('pollOrder：PAID 视为 paid 并刷新配额', async () => {
    serviceMocks.getQuotaOrder.mockResolvedValue(
      ok({ orderNo: 'CLQ1', amount: 600, status: 'PAID' }),
    );
    const store = useCloudQuotaStore();
    const outcome = await store.pollOrder('CLQ1', 10_000);
    expect(outcome).toBe('paid');
    expect(store.paidOrderNo).toBe('CLQ1');
    expect(store.payingQr).toBeNull();
  });

  it('pollOrder：CLOSED 视为 closed', async () => {
    serviceMocks.getQuotaOrder.mockResolvedValue(
      ok({ orderNo: 'CLQ1', amount: 600, status: 'CLOSED' }),
    );
    const store = useCloudQuotaStore();
    await expect(store.pollOrder('CLQ1', 10_000)).resolves.toBe('closed');
  });

  it('closePay 中止轮询：进行中的 pollOrder 返回 closed', async () => {
    serviceMocks.getQuotaOrder.mockResolvedValue(
      ok({ orderNo: 'CLQ1', amount: 600, status: 'PENDING_PAY' }),
    );
    const store = useCloudQuotaStore();
    const pending = store.pollOrder('CLQ1', 60_000);
    await Promise.resolve();
    store.closePay();
    await expect(pending).resolves.toBe('closed');
    expect(store.payingQr).toBeNull();
  });
});
