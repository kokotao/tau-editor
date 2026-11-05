<template>
  <div v-if="visible" class="share-stats-backdrop" data-testid="share-stats-dialog" @click.self="emit('close')">
    <section class="share-stats" role="dialog" aria-modal="true" @keydown.esc.prevent="emit('close')">
      <header class="share-stats__header">
        <div class="share-stats__titles">
          <h3 data-testid="share-stats-title">{{ copy.title }}</h3>
          <p class="share-stats__subtitle">{{ copy.subtitle(fileName) }}</p>
        </div>
        <button type="button" class="share-stats__close" data-testid="share-stats-close" @click="emit('close')">×</button>
      </header>

      <p v-if="loading" class="share-stats__hint" data-testid="share-stats-loading">{{ copy.loading }}</p>
      <p v-else-if="errorText" class="share-stats__hint share-stats__hint--error" data-testid="share-stats-error">{{ errorText }}</p>
      <p v-else-if="empty" class="share-stats__hint" data-testid="share-stats-empty">{{ copy.empty }}</p>

      <template v-else>
        <div class="share-stats__cards" data-testid="share-stats-summary">
          <div class="share-stats__card">
            <span class="share-stats__card-label">{{ copy.totalViews }}</span>
            <span class="share-stats__card-value" data-testid="share-stats-total-views">{{ stats?.totalViews ?? 0 }}</span>
          </div>
          <div class="share-stats__card">
            <span class="share-stats__card-label">{{ copy.uniqueVisitors }}</span>
            <span class="share-stats__card-value" data-testid="share-stats-unique-visitors">{{ stats?.uniqueVisitors ?? 0 }}</span>
          </div>
          <div class="share-stats__card">
            <span class="share-stats__card-label">{{ copy.firstView }}</span>
            <span class="share-stats__card-text" data-testid="share-stats-first-view">{{ formatTime(stats?.firstViewAt) }}</span>
          </div>
          <div class="share-stats__card">
            <span class="share-stats__card-label">{{ copy.lastView }}</span>
            <span class="share-stats__card-text" data-testid="share-stats-last-view">{{ formatTime(stats?.lastViewAt) }}</span>
          </div>
        </div>

        <section class="share-stats__section">
          <p class="share-stats__section-title">{{ copy.chartTitle(days) }}</p>
          <p v-if="maxViews <= 1 && everyZero" class="share-stats__hint" data-testid="share-stats-chart-empty">{{ copy.chartEmpty }}</p>
          <svg
            v-else
            class="share-stats__chart"
            viewBox="0 0 300 80"
            preserveAspectRatio="none"
            role="img"
            :aria-label="copy.chartTitle(days)"
            data-testid="share-stats-chart"
          >
            <rect
              v-for="(point, index) in series"
              :key="point.date"
              :x="barX(index)"
              :y="barY(point.views)"
              :width="barWidth"
              :height="barHeight(point.views)"
              rx="1"
              class="share-stats__bar"
            >
              <title>{{ point.date }}: {{ copy.viewsUnit(point.views) }}</title>
            </rect>
          </svg>
        </section>

        <section class="share-stats__section">
          <p class="share-stats__section-title">{{ copy.recentTitle }}</p>
          <p v-if="(stats?.recent?.length ?? 0) === 0" class="share-stats__hint" data-testid="share-stats-recent-empty">{{ copy.recentEmpty }}</p>
          <ul v-else class="share-stats__recent" data-testid="share-stats-recent">
            <li v-for="(visit, index) in stats?.recent ?? []" :key="`${index}-${visit.time}`" class="share-stats__recent-row">
              <span class="share-stats__recent-time">{{ formatTime(visit.time) }}</span>
              <span class="share-stats__recent-ip">{{ visit.ipMasked || copy.unknownIp }}</span>
              <span class="share-stats__recent-fp">{{ visit.fingerprintShort || copy.unknownFingerprint }}</span>
              <span class="share-stats__recent-ua">{{ shortenUserAgent(visit.ua) }}</span>
              <span
                class="share-stats__badge"
                :class="visit.isNewVisitor ? 'is-new' : 'is-returning'"
              >
                {{ visit.isNewVisitor ? copy.newVisitor : copy.returningVisitor }}
              </span>
            </li>
          </ul>
        </section>

        <div class="share-stats__actions">
          <button type="button" class="share-stats__button" data-testid="share-stats-refresh" :disabled="loading" @click="load()">
            {{ copy.refresh }}
          </button>
          <button type="button" class="share-stats__button" data-testid="share-stats-close-bottom" @click="emit('close')">
            {{ copy.close }}
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 分享统计弹窗：总计卡片 + 近 N 天 SVG 柱状图 + 最近访问列表；空/失败/无权限都有可读状态。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 21:35
 */
import { computed, ref, watch } from 'vue';
import type { CloudShareStats } from '@/lib/tauri';
import {
  buildDailySeries,
  fetchShareStats,
  formatStatTime,
  isEmptyStats,
  seriesMax,
  shortenUserAgent,
} from '@/services/cloudShareStatsService';
import { getShareStatsI18n } from '@/i18n/ui';
import { useSettingsStore } from '@/stores/settings';

const props = withDefaults(defineProps<{
  visible?: boolean;
  fileId?: number | null;
  fileName?: string;
  days?: number;
}>(), { visible: false, fileId: null, fileName: '', days: 30 });

const emit = defineEmits<{ close: [] }>();

const settingsStore = useSettingsStore();
const copy = computed(() => getShareStatsI18n(settingsStore.uiLanguage));

const stats = ref<CloudShareStats | null>(null);
const loading = ref(false);
const errorText = ref('');

const series = computed(() => buildDailySeries(stats.value?.daily ?? [], props.days));
const maxViews = computed(() => seriesMax(series.value, 'views'));
const everyZero = computed(() => series.value.every((point) => point.views === 0));
const empty = computed(() => !loading.value && !errorText.value && isEmptyStats(stats.value));

const barWidth = computed(() => {
  // 柱宽跟着实际天数走：固定 8 在 days>30 时会让柱子互相覆盖，days=7 时又过窄。
  const step = 300 / Math.max(1, series.value.length);
  return Math.max(1, Math.min(12, step - 2));
});

function barX(index: number): number {
  const step = 300 / Math.max(1, series.value.length);
  // 柱体在自己的槽位居中，避免右侧留白不均
  return index * step + Math.max(0, (step - barWidth.value) / 2);
}

function barY(views: number): number {
  const height = barHeight(views);
  return 78 - height;
}

function barHeight(views: number): number {
  if (views <= 0) {
    return 0;
  }
  return Math.max(1, (views / maxViews.value) * 74);
}

function formatTime(value: string | null | undefined): string {
  return formatStatTime(value, settingsStore.uiLanguage);
}

async function load(): Promise<void> {
  const fileId = props.fileId;
  stats.value = null;
  errorText.value = '';
  if (fileId === null || fileId === undefined) {
    return;
  }
  loading.value = true;
  try {
    const outcome = await fetchShareStats(fileId, props.days);
    if (!outcome.ok) {
      errorText.value = outcome.kind === 'unauthorized'
        ? copy.value.noPermission
        : copy.value.error(outcome.message);
      return;
    }
    stats.value = outcome.data;
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void load();
    }
  },
  { immediate: true },
);

defineExpose({ load });
</script>

<style scoped>
.share-stats-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5vh 5vw;
  background: var(--bg-backdrop, rgba(8, 13, 26, 0.78));
}

.share-stats {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(680px, 100%);
  max-height: 88vh;
  padding: 16px;
  overflow: auto;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-elevated, #151d2d);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--radius-dialog, 10px);
  box-shadow: var(--shadow-overlay, 0 24px 60px rgba(0, 0, 0, 0.45));
}

.share-stats__header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.share-stats__titles {
  flex: 1;
  min-width: 0;
}

.share-stats__titles h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.share-stats__subtitle {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--text-muted, #75829e);
}

.share-stats__close {
  padding: 0 4px;
  font-size: 16px;
  color: var(--text-secondary, #a8b3c5);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.share-stats__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted, #75829e);
}

.share-stats__hint--error {
  color: var(--state-danger, #dc2626);
}

.share-stats__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.share-stats__card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: var(--panel-base, #101726);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-card, 8px);
}

.share-stats__card-label {
  font-size: 11px;
  color: var(--text-muted, #75829e);
}

.share-stats__card-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent-brand, #7cc7ff);
}

.share-stats__card-text {
  font-size: 12px;
  color: var(--text-secondary, #a8b3c5);
}

.share-stats__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.share-stats__section-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #a8b3c5);
}

.share-stats__chart {
  width: 100%;
  height: 90px;
  background: var(--panel-base, #101726);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-card, 8px);
}

.share-stats__bar {
  fill: var(--accent-brand, #7cc7ff);
}

.share-stats__recent {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 200px;
  padding: 0;
  margin: 0;
  overflow: auto;
  list-style: none;
}

.share-stats__recent-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-secondary, #a8b3c5);
  border-radius: var(--radius-control, 5px);
}

.share-stats__recent-row:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.share-stats__recent-time {
  flex: 0 0 130px;
  color: var(--text-muted, #75829e);
}

.share-stats__recent-ip,
.share-stats__recent-fp {
  flex: 0 0 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-stats__recent-ua {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-stats__badge {
  flex-shrink: 0;
  padding: 0 6px;
  font-size: 10px;
  border-radius: var(--radius-badge, 999px);
}

.share-stats__badge.is-new {
  color: var(--state-success, #16a34a);
  border: 1px solid var(--state-success, #16a34a);
}

.share-stats__badge.is-returning {
  color: var(--text-muted, #75829e);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
}

.share-stats__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
}

.share-stats__button {
  padding: 5px 12px;
  font-size: 11.5px;
  color: var(--text-primary, #e5e9f0);
  cursor: pointer;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.share-stats__button:hover:not(:disabled) {
  color: var(--accent-brand, #7cc7ff);
  border-color: var(--accent-brand, #7cc7ff);
}
</style>
