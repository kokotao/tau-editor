<template>
  <nav
    v-if="segments.length"
    class="editor-breadcrumbs"
    data-testid="editor-breadcrumbs"
    :aria-label="label"
  >
    <template v-for="(segment, index) in segments" :key="`${segment.path ?? segment.label}-${index}`">
      <span v-if="index > 0" class="breadcrumb-separator" aria-hidden="true">/</span>
      <button
        type="button"
        class="breadcrumb-segment"
        :class="{ current: index === segments.length - 1 }"
        :disabled="!segment.navigable"
        :title="segment.path ?? segment.label"
        :aria-current="index === segments.length - 1 ? 'location' : undefined"
        :data-testid="`breadcrumb-${index}`"
        @click="emit('navigate', segment)"
      >
        {{ segment.label }}
      </button>
    </template>
  </nav>
</template>

<script setup lang="ts">
export interface EditorBreadcrumbSegment {
  label: string;
  path: string | null;
  kind: 'workspace' | 'folder' | 'file';
  navigable: boolean;
}

defineProps<{
  segments: EditorBreadcrumbSegment[];
  label: string;
}>();

const emit = defineEmits<{
  navigate: [segment: EditorBreadcrumbSegment];
}>();
</script>

<style scoped>
.editor-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 32px;
  min-width: 0;
  padding: 0 12px;
  overflow-x: auto;
  overflow-y: hidden;
  border-bottom: 1px solid var(--border-soft, rgba(148, 163, 184, .16));
  background: var(--breadcrumb-editor-background, var(--panel-base, var(--panel, #131b2c)));
  scrollbar-width: none;
}

.editor-breadcrumbs::-webkit-scrollbar {
  display: none;
}

.breadcrumb-segment {
  flex: 0 0 auto;
  max-width: 240px;
  padding: 3px 4px;
  overflow: hidden;
  border: 0;
  border-radius: var(--radius-ui-sm, var(--radius-sm, 4px));
  background: transparent;
  color: var(--text-secondary, #a8b3bd);
  font: inherit;
  font-size: var(--font-size-ui-sm, 12px);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breadcrumb-segment:not(:disabled) {
  cursor: pointer;
}

.breadcrumb-segment:not(:disabled):hover {
  background: var(--surface-hover, rgba(255, 255, 255, .06));
  color: var(--text-primary, #f8fafc);
}

.breadcrumb-segment:focus-visible {
  outline: 1px solid var(--focus-ring, var(--accent-blue-strong, #4dabff));
  outline-offset: 1px;
}

.breadcrumb-segment.current {
  color: var(--text-primary, #f8fafc);
  font-weight: 600;
}

.breadcrumb-segment:disabled {
  cursor: default;
}

.breadcrumb-separator {
  flex: 0 0 auto;
  color: var(--text-muted, #718096);
  font-size: 11px;
  user-select: none;
}
</style>
