<script setup lang="ts">
/**
 * Member-only image-node overlay.
 *
 * This layer deliberately sits outside MindmapCanvas' SVG. It consumes layout
 * output and viewport state, so it can be mounted by an integration shell
 * without changing MindmapStage or the mindmap store.
 */
import { computed } from "vue";
import type {
  MindmapLayout,
  MindmapViewport,
} from "@/services/mindmapLayoutService";
import {
  canUseMindmapImageNodes,
  type MindmapImageNode,
  type MindmapMembershipTier,
} from "@/services/mindmapImageNodeService";

const props = defineProps<{
  layout: MindmapLayout | null;
  viewport: MindmapViewport;
  imageNodes: readonly MindmapImageNode[];
  tier: MindmapMembershipTier;
}>();

const emit = defineEmits<{
  (event: "click", imageNode: MindmapImageNode): void;
  (event: "remove", imageNode: MindmapImageNode): void;
  (event: "error", imageNode: MindmapImageNode): void;
}>();

const visibleNodes = computed(() => {
  if (!canUseMindmapImageNodes(props.tier) || !props.layout) return [];
  const byTopic = new Map(props.layout.nodes.map((node) => [node.id, node]));
  const placed: Array<{ left: number; top: number; right: number; bottom: number }> =
    props.layout.nodes.map((node) => ({
      left: node.x - node.width / 2 - 6,
      right: node.x + node.width / 2 + 6,
      top: node.y - node.height / 2 - 6,
      bottom: node.y + node.height / 2 + 6,
    }));
  const result: Array<{ imageNode: MindmapImageNode; style: Record<string, string> }> = [];
  const gap = 12;
  for (const imageNode of props.imageNodes) {
    const anchor = byTopic.get(imageNode.topicId);
    if (!anchor) continue;
    const candidates = [
      { left: anchor.x - imageNode.width / 2, top: anchor.y + anchor.height / 2 + gap },
      { left: anchor.x + anchor.width / 2 + gap, top: anchor.y - imageNode.height / 2 },
      { left: anchor.x - anchor.width / 2 - gap - imageNode.width, top: anchor.y - imageNode.height / 2 },
      { left: anchor.x - imageNode.width / 2, top: anchor.y - anchor.height / 2 - gap - imageNode.height },
    ];
    let position = candidates.find((candidate) => !placed.some((box) =>
      candidate.left < box.right && candidate.left + imageNode.width > box.left &&
      candidate.top < box.bottom && candidate.top + imageNode.height > box.top,
    ));
    // If the local neighborhood is crowded, retain the image with a predictable offset
    // rather than silently hiding persisted content.
    position ??= {
      left: anchor.x + anchor.width / 2 + gap,
      top: anchor.y + anchor.height / 2 + gap + result.filter((item) => item.imageNode.topicId === imageNode.topicId).length * (imageNode.height + gap),
    };
    const box = {
      left: position.left,
      top: position.top,
      right: position.left + imageNode.width,
      bottom: position.top + imageNode.height,
    };
    placed.push(box);
    const scale = props.viewport.zoom;
    result.push({
      imageNode,
      style: {
        left: `${box.left * scale + props.viewport.x}px`,
        top: `${box.top * scale + props.viewport.y}px`,
        width: `${imageNode.width * scale}px`,
        height: `${imageNode.height * scale}px`,
      },
    });
  }
  return result;
});

function onImageError(imageNode: MindmapImageNode) {
  emit("error", imageNode);
}
</script>

<template>
  <div
    v-if="visibleNodes.length > 0"
    class="mindmap-image-node-layer"
    data-testid="mindmap-image-node-layer"
    aria-label="思维导图图片节点"
  >
    <div
      v-for="item in visibleNodes"
      :key="item.imageNode.id"
      class="mindmap-image-node"
      role="button"
      tabindex="0"
      :style="item.style"
      :aria-label="item.imageNode.alt || '图片节点'"
      :data-image-node-id="item.imageNode.id"
      @pointerdown.stop
      @click="emit('click', item.imageNode)"
      @keydown.enter.prevent="emit('click', item.imageNode)"
      @keydown.space.prevent="emit('click', item.imageNode)"
    >
      <span class="mindmap-image-node-actions">
        <span class="mindmap-image-node-label">{{ item.imageNode.alt || '主题图片' }}</span>
        <button
          type="button"
          class="mindmap-image-node-remove"
          :aria-label="`删除图片：${item.imageNode.alt || '主题图片'}`"
          :data-remove-image-node-id="item.imageNode.id"
          @pointerdown.stop
          @click.stop="emit('remove', item.imageNode)"
        >×</button>
      </span>
      <img
        :src="item.imageNode.src"
        :alt="item.imageNode.alt || ''"
        :style="{ objectFit: item.imageNode.objectFit || 'contain' }"
        draggable="false"
        @error="onImageError(item.imageNode)"
      />
    </div>
  </div>
</template>

<style scoped>
.mindmap-image-node-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.mindmap-image-node {
  position: absolute;
  display: block;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--panel-elevated);
  box-shadow: var(--shadow-soft);
  pointer-events: auto;
  cursor: pointer;
}

.mindmap-image-node:hover,
.mindmap-image-node:focus-visible {
  border-color: var(--accent-brand);
  outline: 2px solid color-mix(in srgb, var(--accent-brand) 30%, transparent);
  outline-offset: 2px;
}

.mindmap-image-node img {
  display: block;
  width: 100%;
  height: 100%;
}

.mindmap-image-node-actions {
  position: absolute;
  z-index: 1;
  inset: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 22px;
  padding: 2px 3px 2px 7px;
  background: color-mix(in srgb, var(--panel-base) 88%, transparent);
  opacity: 0;
  transition: opacity 120ms ease;
}

.mindmap-image-node:hover .mindmap-image-node-actions,
.mindmap-image-node:focus-visible .mindmap-image-node-actions {
  opacity: 1;
}

.mindmap-image-node-label {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mindmap-image-node-remove {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--state-danger);
  color: white;
  font: 700 14px/18px var(--font-ui);
  cursor: pointer;
}
</style>
