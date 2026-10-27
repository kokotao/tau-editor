<template>
  <Teleport to="body">
    <div v-if="visible" class="cd-backdrop cd-nocturne" data-testid="cloud-upgrade-overlay" @click.self="emit('close')">
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
          <button type="button" class="cd-icon-btn cd-icon-btn--close" :aria-label="copy.close" @click="emit('close')">×</button>
        </header>

        <div class="cloud-upgrade__body cd-scroll">
          <!-- 当前用量 -->
          <section class="cloud-upgrade__usage" data-testid="cloud-upgrade-usage">
            <div class="cloud-upgrade__usage-head">
              <span>{{ copy.usedLabel }}</span>
              <span class="cd-mono" data-testid="cloud-upgrade-usage-value">{{ usedLabel }} / {{ quotaLabel }}</span>
            </div>
            <div class="cd-progress">
              <div class="cd-progress__bar" :style="{ width: `${usedPercent}%` }" />
            </div>
            <p class="cloud-upgrade__usage-note cd-mono">
              {{ copy.remainingLabel }}: {{ remainingLabel }} · {{ copy.quotaNote }}
            </p>
          </section>

          <!-- 档位 -->
          <h3 class="cloud-upgrade__section-title">{{ copy.tiersTitle }}</h3>
          <div class="cloud-upgrade__tiers" data-testid="cloud-upgrade-tiers">
            <article
              v-for="tier in copy.tiers"
              :key="tier.id"
              class="cloud-upgrade__tier"
              :class="{ 'cloud-upgrade__tier--current': tier.current, 'cloud-upgrade__tier--featured': tier.featured }"
              :data-testid="`cloud-upgrade-tier-${tier.id}`"
            >
              <header class="cloud-upgrade__tier-head">
                <span class="cloud-upgrade__tier-name">{{ tier.name }}</span>
                <span v-if="tier.current" class="cd-pill cd-pill--success">{{ copy.currentPlan }}</span>
                <span v-else-if="tier.featured" class="cd-pill cd-pill--warning">{{ copy.recommended }}</span>
              </header>
              <p class="cloud-upgrade__tier-bytes cd-mono">{{ tier.bytes }}</p>
              <p class="cloud-upgrade__tier-price">{{ tier.price }}</p>
              <p class="cloud-upgrade__tier-price-note cd-mono">{{ tier.priceNote }}</p>
              <ul class="cloud-upgrade__perks">
                <li v-for="perk in tier.perks" :key="perk">{{ perk }}</li>
              </ul>
            </article>
          </div>

          <!-- 永久扩容包 -->
          <section class="cloud-upgrade__pack" data-testid="cloud-upgrade-pack">
            <div>
              <h4 class="cloud-upgrade__pack-title">{{ copy.packTitle }}</h4>
              <p class="cloud-upgrade__pack-desc">{{ copy.packDesc }}</p>
            </div>
            <span class="cd-pill">{{ copy.packPrice }}</span>
          </section>

          <!-- 签到与奖励 -->
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
          <button type="button" class="cd-btn cd-btn--ghost" data-testid="cloud-upgrade-close" @click="emit('close')">
            {{ copy.close }}
          </button>
          <button type="button" class="cd-btn cd-btn--primary" data-testid="cloud-upgrade-contact" @click="emit('contact')">
            {{ copy.contact }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @description 云存储「扩容方案」面板（设计提案版）：
 * - 用量部分接真实数据（/me 的 usedBytes / quotaBytes）；
 * - 档位、定价、签到奖励来自 docs/plan/20261027150000000_云存储扩容与会员体系方案.md 的提案数值；
 * - 支付 / 积分 / 签到后端接口尚未提供，因此这里只做方案展示与「联系管理员」，
 *   不提供假的购买或签到按钮（点了没反应比没有更糟）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 15:10
 */
import { computed } from 'vue';
import { getCloudUpgradePlanI18n } from '@/i18n/ui';
import { useSettingsStore } from '@/stores/settings';

const props = withDefaults(defineProps<{
  visible?: boolean;
  usedBytes?: number | null;
  quotaBytes?: number | null;
}>(), {
  visible: false,
  usedBytes: 0,
  quotaBytes: 0,
});

const emit = defineEmits<{ close: []; contact: [] }>();

const settingsStore = useSettingsStore();
const copy = computed(() => getCloudUpgradePlanI18n(settingsStore.uiLanguage));

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
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[index]}`;
}

const usedLabel = computed(() => formatBytes(props.usedBytes));
const quotaLabel = computed(() => formatBytes(props.quotaBytes));
const remainingLabel = computed(() => {
  const used = typeof props.usedBytes === 'number' ? props.usedBytes : 0;
  const quota = typeof props.quotaBytes === 'number' ? props.quotaBytes : 0;
  return formatBytes(Math.max(0, quota - used));
});
const usedPercent = computed(() => {
  const used = typeof props.usedBytes === 'number' ? props.usedBytes : 0;
  const quota = typeof props.quotaBytes === 'number' ? props.quotaBytes : 0;
  if (quota <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((used / quota) * 100)));
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

.cloud-upgrade__section-title {
  margin: 0 0 10px;
  font-size: var(--cd-fs-title);
  font-weight: 600;
  color: var(--cd-text);
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

.cloud-upgrade__pack {
  display: flex;
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
  font-size: var(--cd-fs-label);
  color: var(--cd-text-2);
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

@media (max-width: 860px) {
  .cloud-upgrade__tiers {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cloud-upgrade__rewards {
    grid-template-columns: 1fr;
  }
}
</style>
