<!--
  /**
   * @description 云存储「扩容方案」弹窗（支付 / 积分 / 签到落地版）。
   *
   * 数据来源：`stores/cloudQuota`（唯一数据源，接口由 Rust 侧带 JWT 调用）
   * - summary：真实用量 + 容量构成 + 当前档位 + 积分
   * - plans：Plus/Pro 按月/按年 SKU + 永久扩容包
   * - checkin / points：签到状态与积分余额
   *
   * 降级策略（不造假按钮）：
   * - 未登录 / 接口不可用 → 用量回退 props 的 usedBytes/quotaBytes，档位回退 i18n 静态文案，
   *   购买与签到按钮 disabled 并提示登录或联系管理员；
   * - 支付通道不可用（503/未配置）→ 不弹二维码，直接提示「支付通道暂未开通」+「联系管理员开通」；
   * - 签到重复请求（409）→ 静默转「今天已签到」，不报错。
   *
   * @author Albert_Luo
   * @email 480199976@qq.com
   * @date 2026-10-27 17:20
   */
-->
<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="cd-backdrop cd-nocturne"
      data-testid="cloud-upgrade-overlay"
      @click.self="emit('close')"
    >
      <section
        class="cloud-upgrade cd-dialog"
        data-testid="cloud-upgrade-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="copy.title"
      >
        <header class="cloud-upgrade__header">
          <div class="cloud-upgrade__heading">
            <h2 class="cloud-upgrade__title" data-testid="cloud-upgrade-title">{{ copy.title }}</h2>
            <p class="cloud-upgrade__subtitle">{{ copy.subtitle }}</p>
          </div>
          <button
            type="button"
            class="cd-icon-btn cd-icon-btn--close"
            :aria-label="copy.close"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <div class="cloud-upgrade__body cd-scroll">
          <!-- 当前用量：进度条 + 容量构成（永久 / 档位 / 签到临时） -->
          <section class="cloud-upgrade__usage" data-testid="cloud-upgrade-usage">
            <div class="cloud-upgrade__usage-head">
              <span>{{ copy.usedLabel }}</span>
              <span class="cd-mono" data-testid="cloud-upgrade-usage-value">
                {{ usedLabel }} / {{ quotaLabel }}
              </span>
            </div>
            <div class="cd-progress">
              <div class="cd-progress__bar" :style="{ width: `${usedPercent}%` }" />
            </div>
            <p class="cloud-upgrade__usage-note cd-mono">
              {{ copy.remainingLabel }}: {{ remainingLabel }} · {{ copy.quotaNote }}
            </p>
            <div class="cloud-upgrade__breakdown" data-testid="cloud-upgrade-breakdown">
              <span class="cloud-upgrade__breakdown-item">
                <span class="cloud-upgrade__dot" data-tone="permanent" aria-hidden="true" />
                {{ copy.breakdown.permanent }}: <strong class="cd-mono">{{ permanentLabel }}</strong>
              </span>
              <span class="cloud-upgrade__breakdown-item">
                <span class="cloud-upgrade__dot" data-tone="plan" aria-hidden="true" />
                {{ copy.breakdown.plan }}: <strong class="cd-mono">{{ planBytesLabel }}</strong>
              </span>
              <span class="cloud-upgrade__breakdown-item">
                <span class="cloud-upgrade__dot" data-tone="reward" aria-hidden="true" />
                {{ copy.breakdown.reward }}: <strong class="cd-mono">{{ rewardBytesLabel }}</strong>
              </span>
            </div>
          </section>

          <!-- 档位：Free 只读，Plus/Pro 支持按月/按年切换 + 立即开通 -->
          <h3 class="cloud-upgrade__section-title">{{ copy.tiersTitle }}</h3>
          <p v-if="quotaFailed" class="cloud-upgrade__login-hint" data-testid="cloud-upgrade-quota-unavailable">
            {{ copy.quotaUnavailable }}
          </p>
          <p v-else-if="!signedIn" class="cloud-upgrade__login-hint" data-testid="cloud-upgrade-login-hint">
            {{ copy.loginRequired }}
          </p>
          <div class="cloud-upgrade__tiers" data-testid="cloud-upgrade-tiers">
            <article
              v-for="view in tierViews"
              :key="view.id"
              class="cloud-upgrade__tier"
              :class="{
                'cloud-upgrade__tier--current': view.current,
                'cloud-upgrade__tier--featured': view.featured,
              }"
              :data-testid="`cloud-upgrade-tier-${view.id}`"
            >
              <header class="cloud-upgrade__tier-head">
                <span class="cloud-upgrade__tier-name">{{ view.name }}</span>
                <span v-if="view.current" class="cd-pill cd-pill--success">{{ copy.currentPlan }}</span>
                <span v-else-if="view.featured" class="cd-pill cd-pill--warning">{{ copy.recommended }}</span>
              </header>
              <p class="cloud-upgrade__tier-bytes cd-mono">{{ view.bytesLabel }}</p>
              <p class="cloud-upgrade__tier-price">{{ view.priceLabel }}</p>
              <p class="cloud-upgrade__tier-price-note cd-mono">{{ view.priceNote }}</p>
              <ul class="cloud-upgrade__perks">
                <li v-for="perk in view.perks" :key="perk">{{ perk }}</li>
              </ul>

              <div v-if="view.paid" class="cloud-upgrade__tier-buy">
                <div class="cloud-upgrade__cycle" role="group" :aria-label="copy.tiersTitle">
                  <button
                    type="button"
                    class="cloud-upgrade__cycle-btn"
                    :class="{ 'cloud-upgrade__cycle-btn--active': view.cycle === 'MONTH' }"
                    :aria-pressed="view.cycle === 'MONTH'"
                    :data-testid="`cloud-upgrade-cycle-${view.id}-month`"
                    @click="setCycle(view.id, 'MONTH')"
                  >
                    {{ copy.cycleMonth }}
                  </button>
                  <button
                    type="button"
                    class="cloud-upgrade__cycle-btn"
                    :class="{ 'cloud-upgrade__cycle-btn--active': view.cycle === 'YEAR' }"
                    :aria-pressed="view.cycle === 'YEAR'"
                    :data-testid="`cloud-upgrade-cycle-${view.id}-year`"
                    @click="setCycle(view.id, 'YEAR')"
                  >
                    {{ copy.cycleYear }}
                  </button>
                </div>
                <button
                  type="button"
                  class="cd-btn cd-btn--primary cloud-upgrade__buy"
                  :data-testid="`cloud-upgrade-buy-${view.id}`"
                  :disabled="!view.planId || buying || !signedIn"
                  @click="handleBuy(view.planId)"
                >
                  {{ buying ? copy.buying : copy.buyNow }}
                </button>
              </div>
            </article>
          </div>

          <!-- 支付通道不可用：不弹二维码，直接给人工通道 -->
          <section
            v-if="payChannelDown"
            class="cloud-upgrade__pay-unavailable"
            data-testid="cloud-upgrade-pay-unavailable"
          >
            <div class="cloud-upgrade__pay-unavailable-text">
              <strong>{{ copy.pay.channelUnavailable }}</strong>
              <span>{{ copy.pay.channelUnavailableHint }}</span>
            </div>
            <button
              type="button"
              class="cd-btn cd-btn--secondary"
              data-testid="cloud-upgrade-pay-contact"
              @click="emit('contact')"
            >
              {{ copy.pay.contactAdmin }}
            </button>
          </section>
          <p
            v-else-if="payError && !payVisible"
            class="cloud-upgrade__pay-error"
            data-testid="cloud-upgrade-pay-error"
          >
            {{ payError }}
          </p>

          <!-- 永久扩容包 -->
          <section class="cloud-upgrade__pack" data-testid="cloud-upgrade-pack">
            <div>
              <h4 class="cloud-upgrade__pack-title">{{ copy.packTitle }}</h4>
              <p class="cloud-upgrade__pack-desc">{{ copy.packDesc }}</p>
            </div>
            <div class="cloud-upgrade__pack-buy">
              <span class="cd-pill">{{ packPriceLabel }}</span>
              <button
                type="button"
                class="cd-btn cd-btn--secondary"
                data-testid="cloud-upgrade-buy-pack"
                :disabled="!packPlan || buying || !signedIn"
                @click="handleBuy(packPlan?.planId ?? null)"
              >
                {{ buying ? copy.buying : copy.buyPack }}
              </button>
            </div>
          </section>

          <!-- 签到：今日状态 / 连签 / 临时容量 / 终身累计封顶 -->
          <section class="cloud-upgrade__checkin" data-testid="cloud-upgrade-checkin">
            <header class="cloud-upgrade__checkin-head">
              <h3 class="cloud-upgrade__checkin-title">{{ copy.checkin.title }}</h3>
              <span class="cd-pill" :class="{ 'cd-pill--success': todayChecked }">
                {{ todayChecked ? copy.checkin.todayChecked : copy.checkin.todayPending }}
              </span>
            </header>
            <dl class="cloud-upgrade__checkin-grid cd-mono">
              <div class="cloud-upgrade__checkin-cell">
                <dt>{{ copy.checkin.streak }}</dt>
                <dd>{{ streakDays }}</dd>
              </div>
              <div class="cloud-upgrade__checkin-cell">
                <dt>{{ copy.checkin.active }}</dt>
                <dd>{{ activeRewardLabel }}</dd>
              </div>
              <div class="cloud-upgrade__checkin-cell">
                <dt>{{ copy.checkin.lifetime }}</dt>
                <dd>{{ lifetimeLabel }} / {{ capLabel }}</dd>
              </div>
            </dl>
            <div
              class="cd-progress cloud-upgrade__checkin-progress"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="capPercent"
            >
              <div class="cd-progress__bar" :style="{ width: `${capPercent}%` }" />
            </div>
            <div class="cloud-upgrade__checkin-actions">
              <button
                type="button"
                class="cd-btn cd-btn--primary"
                data-testid="cloud-upgrade-checkin-btn"
                :disabled="checkinBusy || !signedIn"
                @click="handleCheckin"
              >
                {{ checkinBusy ? copy.checkin.busy : todayChecked ? copy.checkin.todayChecked : copy.checkin.button }}
              </button>
              <span v-if="!signedIn" class="cloud-upgrade__checkin-hint">{{ copy.checkin.loginHint }}</span>
              <span
                v-else-if="checkinMessage"
                class="cloud-upgrade__checkin-message"
                data-testid="cloud-upgrade-checkin-message"
              >
                {{ checkinMessage }}
              </span>
            </div>
          </section>

          <!-- 积分 -->
          <section class="cloud-upgrade__points" data-testid="cloud-upgrade-points">
            <span class="cloud-upgrade__points-label">{{ copy.pointsLabel }}</span>
            <span class="cloud-upgrade__points-value cd-mono">{{ pointsBalance }}</span>
            <span class="cloud-upgrade__points-unit cd-mono">{{ copy.pointsUnit }}</span>
          </section>

          <!-- 签到规则说明（机制与用户收益，不做内部进度承诺） -->
          <h3 class="cloud-upgrade__section-title">{{ copy.rewardsTitle }}</h3>
          <ul class="cloud-upgrade__rewards" data-testid="cloud-upgrade-rewards">
            <li v-for="reward in copy.rewards" :key="reward.title" class="cloud-upgrade__reward">
              <span class="cloud-upgrade__reward-title">{{ reward.title }}</span>
              <span class="cloud-upgrade__reward-desc">{{ reward.desc }}</span>
            </li>
          </ul>

          <p class="cloud-upgrade__notice" data-testid="cloud-upgrade-notice">{{ copy.notice }}</p>
        </div>

        <footer class="cloud-upgrade__actions">
          <button
            type="button"
            class="cd-btn cd-btn--ghost"
            data-testid="cloud-upgrade-close"
            @click="emit('close')"
          >
            {{ copy.close }}
          </button>
          <button
            type="button"
            class="cd-btn cd-btn--primary"
            data-testid="cloud-upgrade-contact"
            @click="emit('contact')"
          >
            {{ copy.contact }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>

  <!-- 微信 Native 扫码支付弹层：codeUrl 由 qrcode 渲染成 dataURL，轮询订单状态 -->
  <Teleport to="body">
    <div
      v-if="visible && payVisible"
      class="cd-backdrop cd-nocturne cloud-upgrade__pay-backdrop"
      data-testid="cloud-upgrade-pay-overlay"
      @click.self="closePayDialog"
    >
      <section
        class="cd-dialog cd-dialog--compact cloud-upgrade__pay"
        data-testid="cloud-upgrade-pay-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="copy.pay.title"
      >
        <header class="cloud-upgrade__pay-head">
          <h3 class="cloud-upgrade__pay-title">{{ copy.pay.title }}</h3>
          <button
            type="button"
            class="cd-icon-btn cd-icon-btn--close"
            :aria-label="copy.pay.close"
            @click="closePayDialog"
          >
            ×
          </button>
        </header>
        <div class="cloud-upgrade__pay-body">
          <div class="cloud-upgrade__pay-qr-frame">
            <img
              v-if="payQrDataUrl"
              class="cloud-upgrade__pay-qr"
              data-testid="cloud-upgrade-pay-qr"
              :src="payQrDataUrl"
              :alt="copy.pay.qrAlt"
            />
            <p v-else class="cloud-upgrade__pay-qr-fallback">{{ copy.pay.qrFailed }}</p>
          </div>
          <p class="cloud-upgrade__pay-hint">{{ copy.pay.hint }}</p>
          <p
            class="cloud-upgrade__pay-status cd-mono"
            data-testid="cloud-upgrade-pay-status"
            aria-live="polite"
          >
            {{ payStatusLabel }}
          </p>
          <div class="cloud-upgrade__pay-actions">
            <button
              v-if="payStatus === 'timeout' || payStatus === 'closed'"
              type="button"
              class="cd-btn cd-btn--secondary"
              data-testid="cloud-upgrade-pay-retry"
              :disabled="payRetrying"
              @click="handleRetryPay"
            >
              {{ copy.pay.retry }}
            </button>
            <button
              type="button"
              class="cd-btn cd-btn--primary"
              data-testid="cloud-upgrade-pay-close"
              @click="closePayDialog"
            >
              {{ payStatus === 'paid' ? copy.pay.done : copy.pay.close }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import QRCode from 'qrcode';
import type { CloudQuotaCycle, CloudQuotaPlan } from '@/lib/tauri';
import { getCloudUpgradePlanI18n, type CloudUpgradeTierText } from '@/i18n/ui';
import { useCloudQuotaStore } from '@/stores/cloudQuota';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useNotificationStore } from '@/stores/notification';
import { useSettingsStore } from '@/stores/settings';

const props = withDefaults(
  defineProps<{
    visible?: boolean;
    usedBytes?: number | null;
    quotaBytes?: number | null;
  }>(),
  {
    visible: false,
    usedBytes: 0,
    quotaBytes: 0,
  },
);

const emit = defineEmits<{ close: []; contact: [] }>();

const settingsStore = useSettingsStore();
const notificationStore = useNotificationStore();
const store = useCloudQuotaStore();
const cloudSyncStore = useCloudSyncStore();

const copy = computed(() => getCloudUpgradePlanI18n(settingsStore.uiLanguage));

// ------------------------------------------------------------------
// 尺寸换算（保持两位小数：1 MB → 1.00 MB，8 GB → 8.00 GB）
// ------------------------------------------------------------------
function formatBytes(bytes: number | null | undefined): string {
  const value = typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0 ? bytes : 0;
  if (value < 1024) {
    return `${value} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[index] ?? 'B'}`;
}

/** 安全取数：null / undefined / NaN / Infinity 一律按 0 处理。 */
function toFiniteNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 容量（整 GB 不显示 .0：10 GB 而不是 10.0 GB）。 */
function formatCapacity(bytes: number | null | undefined): string {
  return formatBytes(bytes).replace(/\.0(?= [KMGTP]?B$)/, '');
}

/** 价格（后端单位是分）：600 → ¥6，5800 → ¥58。 */
function formatPrice(fen: number): string {
  const cents = Number.isFinite(fen) && fen > 0 ? fen : 0;
  const yuan = cents / 100;
  return `¥${Number.isInteger(yuan) ? yuan.toFixed(0) : yuan.toFixed(2)}`;
}

// ------------------------------------------------------------------
// 用量：store 优先，接口/登录失败时回退 props（保持既有展示口径）
// ------------------------------------------------------------------
const summary = computed(() => store.summary);
/**
 * 登录态以 cloudSync 会话为准（/me 成功也能间接证明已登录）：
 * 不能用「summary 是否存在」判断，否则接口不可用时会把已登录用户提示成「请先登录」。
 */
const signedIn = computed(() => cloudSyncStore.signedIn || !!summary.value);
/**
 * 已登录但配额接口不可用（后端未部署 / 网络失败）：给人工通道提示，不再误导成登录问题。
 */
const quotaFailed = computed(() => !summary.value && !!store.error && signedIn.value);

const usedBytesValue = computed(() =>
  summary.value ? summary.value.usedBytes : toFiniteNumber(props.usedBytes),
);
const quotaBytesValue = computed(() =>
  summary.value ? summary.value.quotaBytes : toFiniteNumber(props.quotaBytes),
);

const usedLabel = computed(() => formatBytes(usedBytesValue.value));
const quotaLabel = computed(() => formatBytes(quotaBytesValue.value));
const remainingLabel = computed(() => formatBytes(Math.max(0, quotaBytesValue.value - usedBytesValue.value)));
const usedPercent = computed(() => {
  const quota = quotaBytesValue.value;
  if (!Number.isFinite(quota) || quota <= 0) {
    return 0;
  }
  const ratio = (usedBytesValue.value / quota) * 100;
  return Number.isFinite(ratio) ? Math.min(100, Math.max(0, Math.round(ratio))) : 0;
});

const permanentLabel = computed(() =>
  summary.value ? formatCapacity(summary.value.permanentBytes) : formatCapacity(quotaBytesValue.value),
);
const planBytesLabel = computed(() =>
  summary.value ? formatCapacity(summary.value.planBytes) : copy.value.breakdown.unknown,
);
const rewardBytesLabel = computed(() =>
  summary.value ? formatCapacity(summary.value.rewardBytes) : copy.value.breakdown.unknown,
);

// ------------------------------------------------------------------
// 档位：store.plans 分组；接口不可用时回退 i18n 静态文案
// ------------------------------------------------------------------
type TierId = 'free' | 'plus' | 'pro';
type PaidTierId = 'plus' | 'pro';

interface TierView {
  id: TierId;
  paid: boolean;
  name: string;
  bytesLabel: string;
  priceLabel: string;
  priceNote: string;
  perks: string[];
  current: boolean;
  featured: boolean;
  planId: number | null;
  cycle: CloudQuotaCycle;
}

const cycle = reactive<Record<PaidTierId, 'MONTH' | 'YEAR'>>({ plus: 'MONTH', pro: 'MONTH' });

const TIER_CODES: Record<TierId, 'FREE' | 'PLUS' | 'PRO'> = { free: 'FREE', plus: 'PLUS', pro: 'PRO' };

function setCycle(id: TierId, next: 'MONTH' | 'YEAR'): void {
  if (id === 'free') {
    return;
  }
  cycle[id] = next;
}

function staticTier(id: TierId): CloudUpgradeTierText | undefined {
  return copy.value.tiers.find((tier) => tier.id === id);
}

function planFor(id: PaidTierId, selected: 'MONTH' | 'YEAR'): CloudQuotaPlan | null {
  const code = TIER_CODES[id];
  return store.plans.find((plan) => plan.tier === code && plan.cycle === selected) ?? null;
}

function cycleSuffix(selected: CloudQuotaCycle): string {
  return selected === 'YEAR' ? copy.value.perYear : copy.value.perMonth;
}

const tierViews = computed<TierView[]>(() => {
  const freeStatic = staticTier('free');
  const free: TierView = {
    id: 'free',
    paid: false,
    name: freeStatic?.name ?? copy.value.currentPlan,
    bytesLabel: freeStatic?.bytes ?? formatCapacity(quotaBytesValue.value),
    priceLabel: freeStatic?.price ?? '',
    priceNote: freeStatic?.priceNote ?? '',
    perks: freeStatic?.perks ?? [],
    current: store.tier === 'FREE',
    featured: false,
    planId: null,
    cycle: 'MONTH',
  };

  const paid = (['plus', 'pro'] as PaidTierId[]).map<TierView>((id) => {
    const stat = staticTier(id);
    const selected = cycle[id];
    const plan = planFor(id, selected);
    const otherCycle: 'MONTH' | 'YEAR' = selected === 'MONTH' ? 'YEAR' : 'MONTH';
    const otherPlan = planFor(id, otherCycle);
    return {
      id,
      paid: true,
      name: stat?.name ?? id,
      bytesLabel: plan ? formatCapacity(plan.bytes) : stat?.bytes ?? '',
      priceLabel: plan ? `${formatPrice(plan.price)} ${cycleSuffix(selected)}` : stat?.price ?? '',
      priceNote: plan
        ? otherPlan
          ? `${formatPrice(otherPlan.price)} ${cycleSuffix(otherCycle)}`
          : ''
        : stat?.priceNote ?? '',
      perks: stat?.perks ?? [],
      current: store.tier === TIER_CODES[id],
      featured: stat?.featured ?? false,
      planId: plan ? plan.planId : null,
      cycle: selected,
    };
  });

  return [free, ...paid];
});

const packPlan = computed<CloudQuotaPlan | null>(
  () => store.plans.find((plan) => plan.tier === 'PACK') ?? null,
);
const packPriceLabel = computed(() =>
  packPlan.value ? formatPrice(packPlan.value.price) : copy.value.packPrice,
);

// ------------------------------------------------------------------
// 签到 / 积分
// ------------------------------------------------------------------
const todayChecked = computed(() => store.todayChecked);
const streakDays = computed(() => store.streakDays);
const activeRewardLabel = computed(() =>
  formatCapacity(store.checkinStatus?.rewardActiveBytes ?? summary.value?.rewardBytes ?? 0),
);
const lifetimeLabel = computed(() => formatCapacity(store.rewardLifetimeBytes));
const capLabel = computed(() => formatCapacity(store.rewardCapBytes));
const capPercent = computed(() => {
  const cap = store.rewardCapBytes;
  if (!Number.isFinite(cap) || cap <= 0) {
    return 0;
  }
  const ratio = (store.rewardLifetimeBytes / cap) * 100;
  return Number.isFinite(ratio) ? Math.min(100, Math.max(0, Math.round(ratio))) : 0;
});
const pointsBalance = computed(() => store.pointsBalance);

const checkinBusy = ref(false);
const checkinMessage = ref('');

async function handleCheckin(): Promise<void> {
  if (checkinBusy.value) {
    return;
  }
  if (!signedIn.value) {
    checkinMessage.value = copy.value.checkin.loginHint;
    return;
  }
  checkinBusy.value = true;
  checkinMessage.value = '';
  try {
    const outcome = await store.checkin();
    if (!outcome.ok) {
      checkinMessage.value = copy.value.checkin.failed(outcome.message ?? '');
      notificationStore.error(copy.value.checkin.title, outcome.message ?? '');
      return;
    }
    const result = outcome.result;
    if (!result) {
      // 409：今天已经签到过了 —— 转已签到态即可，不当失败报错
      checkinMessage.value = copy.value.checkin.already;
      return;
    }
    checkinMessage.value =
      result.grantedBytes > 0
        ? copy.value.checkin.success(formatCapacity(result.grantedBytes))
        : copy.value.checkin.capReached;
    notificationStore.success(copy.value.checkin.title, checkinMessage.value);
  } finally {
    checkinBusy.value = false;
  }
}

// ------------------------------------------------------------------
// 支付：下单 → 取二维码 → 轮询；通道不可用直接降级人工
// ------------------------------------------------------------------
type PayStatus = 'idle' | 'waiting' | 'paid' | 'timeout' | 'closed';

const buying = ref(false);
const payVisible = ref(false);
const payRetrying = ref(false);
const payStatus = ref<PayStatus>('idle');
const payQrDataUrl = ref('');
const payError = ref('');
const payChannelDown = ref(false);
const payOrderNo = ref<string | null>(null);

let pollSeq = 0;
let qrSeq = 0;

const payStatusLabel = computed(() => {
  switch (payStatus.value) {
    case 'waiting':
      return copy.value.pay.waiting;
    case 'paid':
      return copy.value.pay.paid;
    case 'timeout':
      return copy.value.pay.timeout;
    case 'closed':
      return copy.value.pay.closed;
    default:
      return copy.value.pay.hint;
  }
});

/** codeUrl（weixin://…）→ dataURL；codeUrl 变化即重绘，避免旧二维码残留。 */
const payingQrSource = computed(() => store.payingQr ?? '');

watch(
  () => payingQrSource.value,
  async (codeUrl) => {
    // 支付成功/关闭时 store 会清空 payingQr：保留最后一张二维码，
    // 由状态文案（支付成功/超时）给出结论，避免二维码在结果出来那一刻闪没。
    // 注意：这里**不能**自增 qrSeq，否则会作废还在等待 toDataURL 的那一次渲染。
    if (!codeUrl) {
      return;
    }
    const seq = ++qrSeq;
    try {
      const dataUrl = await QRCode.toDataURL(codeUrl, {
        width: 220,
        margin: 1,
        color: { dark: '#0b1220', light: '#ffffff' },
      });
      if (seq === qrSeq) {
        payQrDataUrl.value = dataUrl;
      }
    } catch {
      if (seq === qrSeq) {
        payQrDataUrl.value = '';
      }
    }
  },
  { immediate: true },
);

async function pollPay(orderNo: string): Promise<void> {
  const seq = ++pollSeq;
  payStatus.value = 'waiting';
  const result = await store.pollOrder(orderNo);
  if (seq !== pollSeq) {
    return;
  }
  if (result === 'paid') {
    payStatus.value = 'paid';
    notificationStore.success(copy.value.pay.title, copy.value.pay.paid);
    return;
  }
  payStatus.value = result === 'timeout' ? 'timeout' : 'closed';
}

async function beginPay(orderNo: string): Promise<void> {
  payOrderNo.value = orderNo;
  payChannelDown.value = false;
  payError.value = '';
  const outcome = await store.startPay(orderNo);
  if (!outcome.ok) {
    // 通道不可用（503 / 未配置）：不弹二维码，直接给「联系管理员开通」
    if (outcome.channelUnavailable) {
      payChannelDown.value = true;
      payError.value = copy.value.pay.channelUnavailable;
      payVisible.value = false;
      return;
    }
    payError.value = copy.value.pay.failed(outcome.message ?? '');
    notificationStore.error(copy.value.pay.title, outcome.message ?? '');
    return;
  }
  payStatus.value = 'waiting';
  payVisible.value = true;
  void pollPay(orderNo);
}

async function handleBuy(planId: number | null): Promise<void> {
  if (!planId || buying.value) {
    return;
  }
  if (!signedIn.value) {
    notificationStore.info(copy.value.title, copy.value.loginRequired);
    return;
  }
  buying.value = true;
  payError.value = '';
  payChannelDown.value = false;
  try {
    const outcome = await store.createOrder(planId);
    if (!outcome.ok) {
      payError.value = copy.value.pay.orderFailed(outcome.message);
      notificationStore.error(copy.value.pay.title, outcome.message);
      return;
    }
    await beginPay(outcome.data.orderNo);
  } finally {
    buying.value = false;
  }
}

async function handleRetryPay(): Promise<void> {
  const orderNo = payOrderNo.value;
  if (!orderNo || payRetrying.value) {
    return;
  }
  payRetrying.value = true;
  try {
    await beginPay(orderNo);
  } finally {
    payRetrying.value = false;
  }
}

function closePayDialog(): void {
  pollSeq += 1;
  qrSeq += 1;
  payVisible.value = false;
  payStatus.value = 'idle';
  payQrDataUrl.value = '';
  payError.value = '';
  store.closePay();
}

// ------------------------------------------------------------------
// 生命周期：打开即拉数据（失败不阻塞），关闭即释放支付轮询
// ------------------------------------------------------------------
function resetTransientState(): void {
  closePayDialog();
  checkinBusy.value = false;
  checkinMessage.value = '';
  payChannelDown.value = false;
  payOrderNo.value = null;
}

watch(
  () => props.visible,
  (visible) => {
    resetTransientState();
    if (visible) {
      void store.loadAll().catch(() => undefined);
    }
  },
  { immediate: true },
);

function onKeydown(event: KeyboardEvent): void {
  if (!props.visible || event.key !== 'Escape') {
    return;
  }
  event.preventDefault();
  if (payVisible.value) {
    closePayDialog();
    return;
  }
  emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  store.closePay();
});
</script>

<style scoped>
.cloud-upgrade {
  width: min(960px, calc(100vw - 32px));
  max-height: min(88vh, 900px);
  border-radius: var(--cd-r-window);
}

.cloud-upgrade__header {
  display: flex;
  flex: 0 0 auto;
  gap: 12px;
  align-items: flex-start;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--cd-border-soft);
}

.cloud-upgrade__heading {
  flex: 1;
  min-width: 0;
}

.cloud-upgrade__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--cd-text);
}

.cloud-upgrade__subtitle {
  margin: 4px 0 0;
  font-size: var(--cd-fs-sm);
  line-height: 1.6;
  color: var(--cd-text-2);
}

.cloud-upgrade__body {
  flex: 1 1 auto;
  padding: 16px 20px;
  overflow-y: auto;
}

.cloud-upgrade__usage {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  margin-bottom: 18px;
  background: var(--cd-bg-card);
  border: 1px solid var(--cd-border-soft);
  border-radius: var(--cd-r-dialog);
}

.cloud-upgrade__usage-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: var(--cd-fs-sm);
  color: var(--cd-text-2);
}

.cloud-upgrade__usage-note {
  margin: 0;
  font-size: var(--cd-fs-label);
  color: var(--cd-text-3);
}

.cloud-upgrade__breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding-top: 8px;
  margin-top: 2px;
  font-size: var(--cd-fs-label);
  color: var(--cd-text-2);
  border-top: 1px dashed var(--cd-border-soft);
}

.cloud-upgrade__breakdown-item {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.cloud-upgrade__breakdown-item strong {
  font-weight: 500;
  color: var(--cd-text);
}

.cloud-upgrade__dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: var(--cd-text-3);
}

.cloud-upgrade__dot[data-tone='permanent'] {
  background: var(--cd-accent);
}

.cloud-upgrade__dot[data-tone='plan'] {
  background: var(--cd-accent-2);
}

.cloud-upgrade__dot[data-tone='reward'] {
  background: var(--cd-success);
}

.cloud-upgrade__section-title {
  margin: 0 0 10px;
  font-size: var(--cd-fs-title);
  font-weight: 600;
  color: var(--cd-text);
}

.cloud-upgrade__login-hint {
  margin: -4px 0 10px;
  font-size: var(--cd-fs-label);
  color: var(--cd-warning);
}

.cloud-upgrade__tiers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.cloud-upgrade__tier {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  background: var(--cd-bg-card);
  border: 1px solid var(--cd-border-soft);
  border-radius: var(--cd-r-dialog);
}

.cloud-upgrade__tier--featured {
  border-color: color-mix(in srgb, var(--cd-accent) 45%, transparent);
  box-shadow: 0 0 24px -12px rgba(56, 189, 248, 0.6);
}

.cloud-upgrade__tier--current {
  background: var(--cd-active);
}

.cloud-upgrade__tier-head {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
}

.cloud-upgrade__tier-name {
  font-size: var(--cd-fs-sm);
  font-weight: 600;
  color: var(--cd-text);
}

.cloud-upgrade__tier-bytes {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--cd-accent);
}

.cloud-upgrade__tier-price {
  margin: 0;
  font-size: var(--cd-fs-body);
  color: var(--cd-text);
}

.cloud-upgrade__tier-price-note {
  margin: 0;
  font-size: var(--cd-fs-label);
  color: var(--cd-text-3);
}

.cloud-upgrade__perks {
  margin: 6px 0 0;
  padding-left: 16px;
  font-size: var(--cd-fs-label);
  line-height: 1.7;
  color: var(--cd-text-2);
}

.cloud-upgrade__tier-buy {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 10px;
}

.cloud-upgrade__cycle {
  display: inline-flex;
  padding: 2px;
  background: var(--cd-bg-sunken);
  border: 1px solid var(--cd-border-soft);
  border-radius: var(--cd-r-ctl);
}

.cloud-upgrade__cycle-btn {
  height: 24px;
  padding: 0 10px;
  font-family: var(--cd-font-ui);
  font-size: var(--cd-fs-label);
  color: var(--cd-text-2);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.cloud-upgrade__cycle-btn--active {
  color: var(--cd-text);
  background: var(--cd-bg-overlay);
}

.cloud-upgrade__buy {
  height: 28px;
  font-size: var(--cd-fs-label);
}

.cloud-upgrade__pay-unavailable {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 18px;
  font-size: var(--cd-fs-label);
  color: var(--cd-text-2);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.32);
  border-radius: var(--cd-r-dialog);
}

.cloud-upgrade__pay-unavailable-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cloud-upgrade__pay-unavailable-text strong {
  font-size: var(--cd-fs-sm);
  color: #fde68a;
}

.cloud-upgrade__pay-error {
  margin: 0 0 18px;
  font-size: var(--cd-fs-label);
  color: var(--cd-danger);
}

.cloud-upgrade__pack {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  margin-bottom: 18px;
  background: color-mix(in srgb, var(--cd-bg-card) 80%, transparent);
  border: 1px dashed var(--cd-border-strong);
  border-radius: var(--cd-r-dialog);
}

.cloud-upgrade__pack-title {
  margin: 0 0 4px;
  font-size: var(--cd-fs-sm);
  font-weight: 600;
  color: var(--cd-text);
}

.cloud-upgrade__pack-desc {
  margin: 0;
  max-width: 62ch;
  font-size: var(--cd-fs-label);
  line-height: 1.6;
  color: var(--cd-text-2);
}

.cloud-upgrade__pack-buy {
  display: flex;
  gap: 10px;
  align-items: center;
}

.cloud-upgrade__checkin {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  margin-bottom: 18px;
  background: var(--cd-bg-card);
  border: 1px solid var(--cd-border-soft);
  border-radius: var(--cd-r-dialog);
}

.cloud-upgrade__checkin-head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.cloud-upgrade__checkin-title {
  margin: 0;
  font-size: var(--cd-fs-sm);
  font-weight: 600;
  color: var(--cd-text);
}

.cloud-upgrade__checkin-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.cloud-upgrade__checkin-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cloud-upgrade__checkin-cell dt {
  font-size: var(--cd-fs-label);
  color: var(--cd-text-3);
}

.cloud-upgrade__checkin-cell dd {
  margin: 0;
  font-size: var(--cd-fs-sm);
  color: var(--cd-text);
}

.cloud-upgrade__checkin-progress {
  height: 6px;
  background: #33343d;
}

.cloud-upgrade__checkin-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.cloud-upgrade__checkin-hint,
.cloud-upgrade__checkin-message {
  font-size: var(--cd-fs-label);
  color: var(--cd-text-3);
}

.cloud-upgrade__checkin-message {
  color: var(--cd-success);
}

.cloud-upgrade__points {
  display: inline-flex;
  gap: 8px;
  align-items: baseline;
  padding: 8px 14px;
  margin-bottom: 18px;
  background: color-mix(in srgb, var(--cd-bg-card) 70%, transparent);
  border: 1px solid var(--cd-border-soft);
  border-radius: 9999px;
}

.cloud-upgrade__points-label {
  font-size: var(--cd-fs-label);
  color: var(--cd-text-3);
}

.cloud-upgrade__points-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--cd-accent);
}

.cloud-upgrade__points-unit {
  font-size: var(--cd-fs-label);
  color: var(--cd-text-3);
}

.cloud-upgrade__rewards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
}

.cloud-upgrade__reward {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  background: var(--cd-bg-card);
  border: 1px solid var(--cd-border-soft);
  border-radius: var(--cd-r-panel);
}

.cloud-upgrade__reward-title {
  font-size: var(--cd-fs-sm);
  font-weight: 500;
  color: var(--cd-text);
}

.cloud-upgrade__reward-desc {
  font-size: var(--cd-fs-label);
  line-height: 1.6;
  color: var(--cd-text-2);
}

.cloud-upgrade__notice {
  margin: 0;
  padding: 10px 12px;
  font-size: var(--cd-fs-label);
  line-height: 1.7;
  color: var(--cd-text-2);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: var(--cd-r-panel);
}

.cloud-upgrade__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--cd-border-soft);
}

/* -------------------- 支付弹层 -------------------- */
.cloud-upgrade__pay-backdrop {
  z-index: 14100;
}

.cloud-upgrade__pay {
  width: min(380px, calc(100vw - 32px));
  border-radius: var(--cd-r-window);
}

.cloud-upgrade__pay-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 10px;
}

.cloud-upgrade__pay-title {
  margin: 0;
  font-size: var(--cd-fs-title);
  font-weight: 600;
  color: var(--cd-text);
}

.cloud-upgrade__pay-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  padding: 4px 20px 18px;
}

/* 二维码必须白底 + 静区，否则微信扫不出来 */
.cloud-upgrade__pay-qr-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  background: #fff;
  border-radius: var(--cd-r-dialog);
}

.cloud-upgrade__pay-qr {
  display: block;
  width: 220px;
  height: 220px;
}

.cloud-upgrade__pay-qr-fallback {
  width: 220px;
  padding: 60px 12px;
  margin: 0;
  font-size: var(--cd-fs-label);
  color: #475569;
  text-align: center;
}

.cloud-upgrade__pay-hint {
  margin: 0;
  font-size: var(--cd-fs-label);
  line-height: 1.6;
  color: var(--cd-text-3);
  text-align: center;
}

.cloud-upgrade__pay-status {
  margin: 0;
  font-size: var(--cd-fs-sm);
  color: var(--cd-accent-strong);
  text-align: center;
}

.cloud-upgrade__pay-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
}

@media (max-width: 860px) {
  .cloud-upgrade__tiers {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cloud-upgrade__rewards {
    grid-template-columns: 1fr;
  }

  .cloud-upgrade__checkin-grid {
    grid-template-columns: 1fr;
  }
}
</style>
