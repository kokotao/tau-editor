<template>
  <teleport to="body">
    <div
      v-if="visible"
      ref="viewerRef"
      class="image-viewer"
      data-testid="image-viewer"
      role="dialog"
      aria-modal="true"
      :aria-label="`${alt || '图片'}预览`"
      tabindex="0"
      @keydown="handleKeydown"
    >
      <div
        class="image-viewer__backdrop"
        data-testid="image-viewer-backdrop"
        aria-hidden="true"
        @click="closeViewer"
      ></div>

      <section class="image-viewer__panel" @click.stop>
        <header class="image-viewer__toolbar" data-testid="image-viewer-toolbar">
          <span class="image-viewer__title" :title="alt || '图片预览'">{{ alt || '图片预览' }}</span>
          <span class="image-viewer__zoom" aria-live="polite">{{ zoomPercent }}%</span>
          <div class="image-viewer__actions" aria-label="图片预览工具栏">
            <button
              type="button"
              class="image-viewer__button"
              data-testid="image-viewer-zoom-out"
              aria-label="缩小"
              title="缩小 (−)"
              @click="zoomOut"
            >−</button>
            <button
              type="button"
              class="image-viewer__button"
              data-testid="image-viewer-zoom-in"
              aria-label="放大"
              title="放大 (+)"
              @click="zoomIn"
            >+</button>
            <button
              type="button"
              class="image-viewer__button"
              data-testid="image-viewer-rotate-counterclockwise"
              aria-label="逆时针旋转"
              title="逆时针旋转"
              @click="rotateCounterclockwise"
            >↺</button>
            <button
              type="button"
              class="image-viewer__button"
              data-testid="image-viewer-rotate-clockwise"
              aria-label="顺时针旋转"
              title="顺时针旋转"
              @click="rotateClockwise"
            >↻</button>
            <button
              type="button"
              class="image-viewer__button"
              data-testid="image-viewer-reset"
              aria-label="重置图片"
              title="重置 (0)"
              @click="resetView"
            >重置</button>
            <button
              type="button"
              class="image-viewer__button image-viewer__button--close"
              data-testid="image-viewer-close"
              aria-label="关闭图片预览"
              title="关闭 (Esc)"
              @click="closeViewer"
            >×</button>
          </div>
        </header>

        <div
          ref="viewportRef"
          class="image-viewer__viewport"
          data-testid="image-viewer-viewport"
          :class="{ 'is-dragging': isDragging }"
          @wheel.prevent="handleWheel"
        >
          <img
            :src="src"
            :alt="alt"
            class="image-viewer__image"
            data-testid="image-viewer-image"
            draggable="false"
            :style="imageStyle"
            @dblclick="toggleZoom"
            @pointerdown="handlePointerDown"
            @pointermove="handlePointerMove"
            @pointerup="handlePointerUp"
            @pointercancel="handlePointerUp"
          >
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
/**
 * @description 可访问的沉浸式图片预览，支持缩放、平移、旋转、重置与键盘操作。
 * @author Albert_Luo
 * @date 2026-10-03
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

interface ImageViewerProps {
  visible: boolean;
  src: string;
  alt?: string;
}

const props = withDefaults(defineProps<ImageViewerProps>(), {
  alt: '图片',
});

const emit = defineEmits<{
  close: [];
}>();

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

const viewerRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);
const scale = ref(1);
const rotation = ref(0);
const translateX = ref(0);
const translateY = ref(0);
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);
const dragOriginX = ref(0);
const dragOriginY = ref(0);

const imageStyle = computed(() => {
  return {
    transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value}) rotate(${rotation.value}deg)`,
  };
});

const zoomPercent = computed(() => `${Math.round(scale.value * 100)}`);

const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));

const setScale = (nextScale: number) => {
  scale.value = clampScale(nextScale);
};

const zoomIn = () => setScale(scale.value + SCALE_STEP);
const zoomOut = () => setScale(scale.value - SCALE_STEP);

const toggleZoom = () => {
  if (scale.value > 1) {
    resetView();
    return;
  }
  setScale(2);
};

const handleWheel = (event: WheelEvent) => {
  setScale(scale.value + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
};

const rotateClockwise = () => {
  rotation.value = (rotation.value + 90) % 360;
};

const rotateCounterclockwise = () => {
  rotation.value = (rotation.value - 90 + 360) % 360;
};

const resetView = () => {
  scale.value = 1;
  rotation.value = 0;
  translateX.value = 0;
  translateY.value = 0;
};

const closeViewer = () => emit('close');

const handlePointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  isDragging.value = true;
  dragStartX.value = event.clientX;
  dragStartY.value = event.clientY;
  dragOriginX.value = translateX.value;
  dragOriginY.value = translateY.value;
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
};

const handlePointerMove = (event: PointerEvent) => {
  if (!isDragging.value) return;
  translateX.value = dragOriginX.value + event.clientX - dragStartX.value;
  translateY.value = dragOriginY.value + event.clientY - dragStartY.value;
};

const handlePointerUp = (event?: PointerEvent) => {
  isDragging.value = false;
  if (event) {
    (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      closeViewer();
      break;
    case '+':
    case '=':
      event.preventDefault();
      zoomIn();
      break;
    case '-':
    case '_':
      event.preventDefault();
      zoomOut();
      break;
    case '0':
      event.preventDefault();
      resetView();
      break;
    case '[':
      event.preventDefault();
      rotateCounterclockwise();
      break;
    case ']':
      event.preventDefault();
      rotateClockwise();
      break;
    default:
      break;
  }
};

const focusViewer = async () => {
  await nextTick();
  viewerRef.value?.focus();
};

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      resetView();
      void focusViewer();
    } else {
      isDragging.value = false;
    }
  },
  { immediate: true },
);

watch(
  () => props.src,
  () => {
    if (props.visible) resetView();
  },
);

onBeforeUnmount(() => {
  isDragging.value = false;
});
</script>

<style scoped>
.image-viewer {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  color: var(--text-primary, #f5f7fb);
}

.image-viewer__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(5, 8, 15, 0.86);
  backdrop-filter: blur(4px);
}

.image-viewer__panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(96vw, 1400px);
  height: min(94vh, 1000px);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(21, 25, 35, 0.96);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
}

.image-viewer__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 8px 12px 8px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
}

.image-viewer__title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-viewer__zoom {
  flex: 0 0 auto;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.image-viewer__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.image-viewer__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  line-height: 1;
}

.image-viewer__button:hover,
.image-viewer__button:focus-visible {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  outline: none;
}

.image-viewer__button--close {
  margin-left: 4px;
  font-size: 24px;
}

.image-viewer__viewport {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 24px;
  cursor: grab;
  user-select: none;
}

.image-viewer__viewport.is-dragging {
  cursor: grabbing;
}

.image-viewer__image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center center;
  user-select: none;
  -webkit-user-drag: none;
  will-change: transform;
  cursor: inherit;
}

@media (max-width: 640px) {
  .image-viewer__panel {
    width: 100vw;
    height: 100vh;
    border: 0;
    border-radius: 0;
  }

  .image-viewer__toolbar {
    gap: 4px;
    padding-inline: 8px;
  }

  .image-viewer__title {
    display: none;
  }

  .image-viewer__viewport {
    padding: 12px;
  }
}
</style>
