<template>
  <div
    v-if="text"
    class="status-notice"
    :class="[`status-notice--${tone}`, { 'status-notice--strong': tone === 'error' || tone === 'success' }]"
    :role="tone === 'error' ? 'alert' : 'status'"
    :data-testid="testId"
    :data-tone="tone"
  >
    <span class="status-notice__icon" aria-hidden="true">{{ icon }}</span>
    <div class="status-notice__body">
      <p class="status-notice__text">
        <slot>{{ text }}</slot>
      </p>
      <template v-if="details && details.length > 0">
        <button
          v-if="collapsible"
          type="button"
          class="status-notice__toggle"
          :aria-expanded="expanded"
          :data-testid="`${testId}-toggle`"
          @click="expanded = !expanded"
        >
          {{ expanded ? collapseLabel : `${expandLabel}（${details.length}）` }}
        </button>
        <ul
          v-if="expanded || !collapsible"
          class="status-notice__details"
          :data-testid="`${testId}-details`"
        >
          <li v-for="(detail, index) in details" :key="`${index}-${detail}`">{{ detail }}</li>
        </ul>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 统一状态提示：分级着色 + 图标 + 失败加粗 + 可展开原因。
 * 同步弹窗 / 分享弹窗 / 图片统计共用，颜色全部走主题变量（深浅主题都可读）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 19:35
 */
import { computed, ref } from 'vue';

export type StatusNoticeTone = 'success' | 'error' | 'warning' | 'info';

const props = withDefaults(defineProps<{
  tone?: StatusNoticeTone;
  text?: string;
  /** 失败原因等可展开明细 */
  details?: string[];
  /** 明细是否折叠（默认展开，失败原因多时收起） */
  collapsible?: boolean;
  expandLabel?: string;
  collapseLabel?: string;
  testId?: string;
}>(), {
  tone: 'info',
  text: '',
  details: () => [],
  collapsible: false,
  expandLabel: '展开原因',
  collapseLabel: '收起',
  testId: 'status-notice',
});

const expanded = ref(false);

const icon = computed(() => {
  switch (props.tone) {
    case 'success':
      return '✓';
    case 'error':
      return '✕';
    case 'warning':
      return '!';
    default:
      return 'i';
  }
});
</script>

<style scoped>
.status-notice {
  display: flex;
  gap: 8px;
  padding: 6px 9px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-secondary, #a8b3c5);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border-left: 3px solid var(--border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--radius-control, 5px);
}

.status-notice--success {
  color: var(--state-success, #16a34a);
  border-left-color: var(--state-success, #16a34a);
  background: color-mix(in srgb, var(--state-success, #16a34a) 12%, transparent);
}

.status-notice--error {
  color: var(--state-danger, #dc2626);
  border-left-color: var(--state-danger, #dc2626);
  background: color-mix(in srgb, var(--state-danger, #dc2626) 14%, transparent);
}

.status-notice--warning {
  color: var(--state-warning, #d97706);
  border-left-color: var(--state-warning, #d97706);
  background: color-mix(in srgb, var(--state-warning, #d97706) 12%, transparent);
}

.status-notice__icon {
  flex-shrink: 0;
  width: 14px;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.status-notice__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.status-notice__text {
  margin: 0;
  word-break: break-word;
}

/* 失败与成功都加粗，失败更醒目 */
.status-notice--strong .status-notice__text {
  font-weight: 700;
}

.status-notice__toggle {
  align-self: flex-start;
  padding: 0;
  font-size: 10.5px;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  background: transparent;
  border: 0;
  opacity: 0.9;
}

.status-notice__details {
  margin: 2px 0 0;
  padding-left: 16px;
  font-size: 10.5px;
  font-weight: 400;
  color: var(--text-secondary, #a8b3c5);
}

.status-notice__details li {
  word-break: break-word;
}
</style>
