<template>
  <section class="image-file-preview" data-testid="image-file-preview-shell" aria-label="图片预览">
    <div v-if="loading" class="image-file-preview-state">正在加载图片…</div>
    <div v-else-if="error" class="image-file-preview-state image-file-preview-error">{{ error }}</div>
    <img
      v-else
      :src="sourceUrl"
      :alt="imageAlt"
      class="image-file-preview-image"
      data-testid="image-file-preview"
      draggable="false"
      @dblclick="handleDoubleClick"
    >
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { isTauriApp } from '@/lib/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';

const props = defineProps<{
  filePath?: string;
  fileName?: string;
  src?: string;
  alt?: string;
}>();

const emit = defineEmits<{
  open: [payload: { src: string; alt: string }];
  'open-image': [payload: { src: string; alt: string }];
}>();

const imageAlt = computed(() => props.alt || props.fileName || props.filePath?.split(/[\\/]/).pop() || '图片');
const sourceUrl = computed(() => {
  const directSrc = props.src?.trim();
  if (directSrc) {
    return directSrc;
  }

  const filePath = props.filePath?.trim() ?? '';
  if (!filePath) return '';
  try {
    return isTauriApp()
      ? convertFileSrc(filePath)
      : (filePath.startsWith('file://') ? filePath : `file://${encodeURI(filePath)}`);
  } catch {
    return '';
  }
});
const loading = computed(() => !sourceUrl.value);
const error = computed(() => sourceUrl.value ? '' : '图片路径为空或当前环境无法读取本地图片');

const handleDoubleClick = () => {
  const src = sourceUrl.value;
  if (!src) {
    return;
  }

  const payload = { src, alt: imageAlt.value };
  emit('open', payload);
  // 保留语义化别名，方便 Markdown 预览与文件图片统一接入图片查看器。
  emit('open-image', payload);
};
</script>

<style scoped>
.image-file-preview {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 240px;
  min-width: 0;
  overflow: auto;
  padding: 32px;
  box-sizing: border-box;
  background: var(--panel-base, #1e1e1e);
}

.image-file-preview-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
  cursor: zoom-in;
}

.image-file-preview-state {
  color: var(--text-secondary, #9ca3af);
  font-size: 14px;
}

.image-file-preview-error {
  color: var(--accent-red, #f87171);
}
</style>
