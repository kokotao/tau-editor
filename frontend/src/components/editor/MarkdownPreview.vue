<template>
  <div class="markdown-preview" data-testid="markdown-preview">
    <div ref="previewRef" class="markdown-preview-content" v-html="html"></div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { renderMarkdown, renderMermaidDiagrams } from '@/services/markdownService';

interface MarkdownPreviewProps {
  content: string;
  theme: 'dark' | 'light';
}

const props = defineProps<MarkdownPreviewProps>();
const previewRef = ref<HTMLElement | null>(null);
const html = ref('');
let renderTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleRender = () => {
  if (renderTimer) {
    clearTimeout(renderTimer);
  }

  renderTimer = setTimeout(async () => {
    html.value = renderMarkdown(props.content || '');
    await nextTick();
    if (previewRef.value) {
      await renderMermaidDiagrams(previewRef.value, props.theme);
    }
  }, 150);
};

watch(
  () => [props.content, props.theme],
  () => {
    scheduleRender();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }
});
</script>

<style scoped>
.markdown-preview {
  height: 100%;
  overflow: auto;
  background: var(--panel, #101726);
}

.markdown-preview-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
  color: var(--text-primary, #ecf2ff);
  line-height: 1.65;
}

.markdown-preview-content :deep(h1),
.markdown-preview-content :deep(h2),
.markdown-preview-content :deep(h3) {
  line-height: 1.3;
  margin-top: 1.3em;
  margin-bottom: 0.45em;
}

.markdown-preview-content :deep(code) {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--surface-muted, rgba(255, 255, 255, 0.06));
}

.markdown-preview-content :deep(pre) {
  overflow: auto;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.2));
  background: rgba(9, 14, 26, 0.45);
}

.markdown-preview-content :deep(.markdown-mermaid-error) {
  margin: 12px 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(248, 113, 113, 0.45);
  background: rgba(248, 113, 113, 0.12);
  color: #fecaca;
}

.markdown-preview-content :deep(.markdown-mermaid-diagram) {
  margin: 12px 0;
  overflow: auto;
}
</style>
