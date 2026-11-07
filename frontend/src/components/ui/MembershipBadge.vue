<template>
  <span
    v-if="normalizedTier"
    class="membership-badge"
    :class="[
      `membership-badge--${normalizedTier.toLowerCase()}`,
      { 'membership-badge--compact': compact },
    ]"
    :aria-label="accessibleLabel"
    :title="accessibleLabel"
    :data-testid="testId"
    :data-tier="normalizedTier"
    role="status"
  >
    <span class="membership-badge__cube" aria-hidden="true">
      <svg viewBox="0 0 128 128" fill="none" focusable="false">
        <defs>
          <linearGradient :id="`${gradientId}-top`" x1="20" y1="18" x2="107" y2="65" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FFF2B2" />
            <stop offset=".48" stop-color="#E7B83F" />
            <stop offset="1" stop-color="#C78A1D" />
          </linearGradient>
          <linearGradient :id="`${gradientId}-left`" x1="20" y1="42" x2="66" y2="116" gradientUnits="userSpaceOnUse">
            <stop stop-color="#E7B944" />
            <stop offset="1" stop-color="#B87412" />
          </linearGradient>
          <linearGradient :id="`${gradientId}-right`" x1="65" y1="64" x2="111" y2="111" gradientUnits="userSpaceOnUse">
            <stop stop-color="#D89A24" />
            <stop offset="1" stop-color="#8F570C" />
          </linearGradient>
          <linearGradient :id="`${gradientId}-mark`" x1="46" y1="48" x2="78" y2="87" gradientUnits="userSpaceOnUse">
            <stop stop-color="#80500D" />
            <stop offset="1" stop-color="#A66A12" />
          </linearGradient>
        </defs>
        <path d="M64 12 112 39.5 64 67 16 39.5 64 12Z" :fill="`url(#${gradientId}-top)`" />
        <path d="M16 39.5 64 67v53L16 92.5v-53Z" :fill="`url(#${gradientId}-left)`" />
        <path d="m112 39.5-48 27.5v53l48-27.5v-53Z" :fill="`url(#${gradientId}-right)`" />
        <path
          d="M43 47h42v8H69v24.5c0 3.7 2.1 5.8 6.1 5.8h3.3v8h-4.2c-8.5 0-13.3-4.6-13.3-13.2V55H43v-8Z"
          :fill="`url(#${gradientId}-mark)`"
        />
      </svg>
    </span>
    <span class="membership-badge__tier">{{ normalizedTier }}</span>
    <span v-if="expiresLabel" class="membership-badge__expiry">{{ expiresLabel }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * @description 会员金标：仅 PLUS/PRO 渲染，显示具体等级与到期日，用于标题栏和账号区域。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-11-06 15:00
 */
import { computed, useId } from 'vue';

type MembershipTier = 'PLUS' | 'PRO';

const props = withDefaults(defineProps<{
  /** 云配额档位；FREE、空值和未知值均不渲染，避免误显示会员身份。 */
  tier?: string | null;
  /** 紧凑模式只显示 VIP，适合工具栏和窄侧栏。 */
  compact?: boolean;
  /** 订阅到期时间；无到期日时只显示等级。 */
  expiresAt?: string | null;
  testId?: string;
}>(), {
  tier: null,
  compact: false,
  expiresAt: null,
  testId: 'membership-badge',
});

const gradientId = `membership-gold-${useId().replace(/:/g, '')}`;

function normalizeTier(value: string | null | undefined): MembershipTier | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'PLUS' || normalized === 'PRO' ? normalized : null;
}

const normalizedTier = computed(() => normalizeTier(props.tier));
const expiresLabel = computed(() => {
  const raw = props.expiresAt?.trim();
  if (!raw) {
    return '';
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    return raw;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
});
const accessibleLabel = computed(() => {
  const tierLabel = normalizedTier.value === 'PRO' ? 'Pro 会员' : 'Plus 会员';
  return expiresLabel.value ? `${tierLabel}，到期 ${expiresLabel.value}` : tierLabel;
});
</script>

<style scoped>
.membership-badge {
  --vip-gold: #bd861c;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  padding: 0;
  color: var(--vip-gold);
  white-space: nowrap;
  vertical-align: middle;
}

.membership-badge--pro {
  --vip-gold: #a96c10;
}

.membership-badge--compact {
  gap: 4px;
  min-height: 19px;
}

.membership-badge__cube {
  display: inline-flex;
  width: 17px;
  height: 17px;
}

.membership-badge__cube svg {
  width: 100%;
  height: 100%;
}

.membership-badge__tier {
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.membership-badge__expiry {
  padding-left: 6px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  border-left: 1px solid currentColor;
  opacity: 0.8;
}

.membership-badge--compact .membership-badge__tier {
  font-size: 9px;
}

.membership-badge--compact .membership-badge__cube {
  width: 15px;
  height: 15px;
}
</style>
