<template>
  <Teleport to="body">
    <!-- 遮罩层：既给视觉层次，也兜住「点空白处关闭」 -->
    <div
      v-if="visible"
      class="cloud-doc-overlay cd-nocturne"
      :data-testid="ids.overlay"
      @click.self="emit('close')"
    >
      <section
        class="cloud-doc-overlay__card"
        :class="`cloud-doc-overlay__card--${variant}`"
        :data-testid="ids.card"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <header class="cloud-doc-overlay__header">
          <h3 class="cloud-doc-overlay__title" :title="title" :data-testid="ids.title">{{ title }}</h3>
          <button
            ref="closeButtonRef"
            type="button"
            class="cloud-doc-overlay__close"
            :data-testid="ids.close"
            :aria-label="closeLabel"
            :title="closeLabel"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <!-- 文本类预览：等宽可滚动正文 -->
        <pre v-if="content" class="cloud-doc-overlay__body" :data-testid="ids.content">{{ content }}</pre>
        <!-- 非文本类 / 选择题说明：给一句可执行的提示，而不是一片空白 -->
        <p v-else-if="hint" class="cloud-doc-overlay__hint" :data-testid="ids.hint">{{ hint }}</p>

        <!-- 选择题按钮由调用方经默认插槽传入，事件仍留在 CloudDocTree 里 -->
        <div v-if="$slots.default" class="cloud-doc-overlay__actions">
          <slot />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @description 云文档浮层卡片（遮罩 + 居中面板 + 头部标题/关闭 + 正文）：承载「只读预览」与
 * 「预览 / 另存为 / 取消」选择题两种用法。此前预览浮层没有任何定位与遮罩样式，
 * 被 Teleport 到 body 尾部后表现为「点了没反应」，统一收到这里保证两处（侧栏、浏览弹窗）一致。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-26 23:30
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  visible?: boolean;
  title?: string;
  /** 文本类正文：有值时渲染可滚动 <pre> */
  content?: string;
  /** 非文本类提示 / 选择题说明 */
  hint?: string;
  /** preview：只读预览卡片；choice：跨工作区「预览 / 另存为 / 取消」选择卡片 */
  variant?: 'preview' | 'choice';
  /** 关闭按钮的无障碍文案 */
  closeLabel?: string;
}>(), {
  visible: false,
  title: '',
  content: '',
  hint: '',
  variant: 'preview',
  closeLabel: '关闭',
});

const emit = defineEmits<{ close: [] }>();

const closeButtonRef = ref<HTMLButtonElement | null>(null);

/** data-testid 按 variant 区分，避免两种卡片的正文/提示节点互相串味 */
const ids = computed(() => (props.variant === 'choice'
  ? {
    overlay: 'cloud-doc-choice-overlay',
    card: 'cloud-doc-choice-dialog',
    title: 'cloud-doc-choice-title',
    hint: 'cloud-doc-choice-hint',
    content: 'cloud-doc-choice-content',
    close: 'cloud-doc-choice-close',
  }
  : {
    overlay: 'cloud-doc-preview-overlay',
    card: 'cloud-doc-preview-dialog',
    title: 'cloud-doc-preview-title',
    hint: 'cloud-doc-preview-hint',
    content: 'cloud-doc-preview-content',
    close: 'cloud-doc-preview-close',
  }));

/**
 * Esc 关闭：卡片是 Teleport 出去的，焦点可能还在树行上，
 * 因此监听 window 而不是依赖卡片内的 keydown。
 */
function handleKeydown(event: KeyboardEvent): void {
  if (!props.visible || event.key !== 'Escape') {
    return;
  }
  event.preventDefault();
  emit('close');
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      window.addEventListener('keydown', handleKeydown);
      // 打开即聚焦关闭按钮：键盘用户不必再 Tab 找出口
      void nextTick(() => closeButtonRef.value?.focus());
      return;
    }
    window.removeEventListener('keydown', handleKeydown);
  },
  { immediate: true },
);

onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

defineExpose({ focusClose: () => closeButtonRef.value?.focus() });
</script>

<style scoped>
/* ---------- 遮罩：与历史版本/属性弹窗同一套视觉 ---------- */
.cloud-doc-overlay {
  position: fixed;
  inset: 0;
  z-index: 14000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  /* 与云文档设计稿同一层：遮罩吃点击，下层树不会误触 */
  background: rgba(5, 6, 10, 0.74);
  backdrop-filter: blur(6px);
}

.cloud-doc-overlay__card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 14px 16px;
  overflow: hidden;
  font-family: var(--cd-font-ui);
  color: var(--cd-text);
  background: var(--cd-bg-card);
  border: 1px solid var(--cd-border-strong);
  border-radius: var(--cd-r-dialog);
  box-shadow: var(--cd-shadow-dialog);
}

.cloud-doc-overlay__card--preview {
  width: min(720px, calc(100vw - 48px));
  max-height: min(680px, 84vh);
}

.cloud-doc-overlay__card--choice {
  width: min(420px, calc(100vw - 48px));
}

.cloud-doc-overlay__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.cloud-doc-overlay__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: var(--cd-fs-body);
  font-weight: 600;
  color: var(--cd-text);
  /* 防止极窄容器下标题逐字竖排 */
  white-space: nowrap;
  word-break: keep-all;
  text-overflow: ellipsis;
}

.cloud-doc-overlay__close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  color: var(--cd-text-2);
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--cd-r-panel);
}

.cloud-doc-overlay__close:hover {
  /* 设计稿：关闭按钮 hover 走危险色 */
  color: #fff;
  background: color-mix(in srgb, var(--cd-danger) 24%, transparent);
  border-color: color-mix(in srgb, var(--cd-danger) 40%, transparent);
}

/* 关闭按钮必须看得见焦点环：键盘用户靠它定位出口 */
.cloud-doc-overlay__close:focus-visible {
  outline: 2px solid var(--cd-accent);
  outline-offset: 2px;
}

.cloud-doc-overlay__body {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-family: var(--cd-font-mono);
  font-size: var(--cd-fs-meta);
  line-height: 1.65;
  color: var(--cd-text);
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--cd-bg-sunken);
  border: 1px solid var(--cd-border-soft);
  border-radius: var(--cd-r-panel);
}

.cloud-doc-overlay__hint {
  margin: 0;
  font-size: var(--cd-fs-sm);
  line-height: 1.6;
  color: var(--cd-text-2);
}

.cloud-doc-overlay__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
</style>
