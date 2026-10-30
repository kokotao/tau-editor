<script setup lang="ts">
/**
 * MindmapPropertiesPanel（思维导图 阶段 4B：节点属性面板）
 *
 * 职责：
 * 1. 展示并编辑单个主题节点的备注（notes）、链接（link）与标签（labels）；
 * 2. 链接做白名单校验：仅允许 http://、https://、mailto:，非法值不向上抛出；
 * 3. 标签以逗号分隔输入，提交时规范化为「去空、去重、保序」的字符串数组。
 *
 * 说明：本组件保持「受控」——不直接修改文档，所有改动经 `update` 事件交给上层命令层，
 * 由上层决定是否写入 store 与历史；`topic` 为 null 时不渲染任何内容。
 *
 * 对外契约：
 * - props：`{ topic: { id, text, notes?, link?, labels? } | null; readonly?: boolean }`
 * - emits：`update(payload: { notes?: string; link?: string; labels?: string[] })`、`close()`
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 当前选中节点；null 表示不展示面板。 */
    topic: {
      id: string;
      text: string;
      notes?: string;
      link?: string;
      labels?: string[];
    } | null;
    /** 只读模式：禁用输入并隐藏提交按钮。 */
    readonly?: boolean;
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  (event: 'update', payload: { notes?: string; link?: string; labels?: string[] }): void;
  (event: 'close'): void;
}>();

/** 链接允许的协议白名单（mailto 之外一律拒绝）。 */
const LINK_PATTERN = /^(?:https?:\/\/|mailto:)\S+$/i;

const notesDraft = ref('');
const linkDraft = ref('');
const labelsDraft = ref('');
/** 链接是否已被用户「确认过」（失焦或点过提交），用于避免输入过程中就报错。 */
const linkTouched = ref(false);

const isReadonly = computed(() => props.readonly === true);

/** 从 props.topic 重置草稿；仅在节点内容真正变化时执行，避免打断输入。 */
function resetDraft() {
  notesDraft.value = props.topic?.notes ?? '';
  linkDraft.value = props.topic?.link ?? '';
  labelsDraft.value = (props.topic?.labels ?? []).join(', ');
  linkTouched.value = false;
}

watch(
  () => [
    props.topic?.id ?? '',
    props.topic?.notes ?? '',
    props.topic?.link ?? '',
    (props.topic?.labels ?? []).join('\u0000'),
  ].join('\u0001'),
  () => resetDraft(),
  { immediate: true },
);

/** 链接非空且不匹配白名单时为非法。 */
const linkInvalid = computed(() => {
  const value = linkDraft.value.trim();
  return value.length > 0 && !LINK_PATTERN.test(value);
});

/** 是否展示链接错误提示（失焦/提交后才提示，输入中不打扰）。 */
const showLinkError = computed(() => linkInvalid.value && linkTouched.value);

/** 逗号分隔标签 → 去空、去重、保序的数组（兼容中英文逗号）。 */
function parseLabels(raw: string): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const part of String(raw ?? '').split(/[,，]/)) {
    const value = part.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    labels.push(value);
  }
  return labels;
}

function onNotesInput(event: Event) {
  notesDraft.value = (event.target as HTMLTextAreaElement | null)?.value ?? '';
}

function onLinkInput(event: Event) {
  linkDraft.value = (event.target as HTMLInputElement | null)?.value ?? '';
}

function onLabelsInput(event: Event) {
  labelsDraft.value = (event.target as HTMLInputElement | null)?.value ?? '';
}

/** 提交：非法链接时只提示、不 emit，保证上层不会拿到脏数据。 */
function submit() {
  if (isReadonly.value) return;
  if (linkInvalid.value) {
    linkTouched.value = true;
    return;
  }
  emit('update', {
    notes: notesDraft.value.trim(),
    link: linkDraft.value.trim(),
    labels: parseLabels(labelsDraft.value),
  });
}

function onEscape() {
  emit('close');
}
</script>

<template>
  <aside
    v-if="topic"
    class="mm-props"
    data-testid="mm-props"
    role="complementary"
    aria-label="节点属性"
    @keydown.esc="onEscape"
  >
    <header class="mm-props-header">
      <span class="mm-props-heading">节点属性</span>
      <button
        type="button"
        class="mm-props-close"
        data-testid="mm-props-close"
        aria-label="关闭属性面板"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <p class="mm-props-topic" data-testid="mm-props-topic-title" :title="topic.text">
      {{ topic.text || '（空主题）' }}
    </p>

    <div class="mm-props-body">
      <label class="mm-props-field">
        <span class="mm-props-label">备注</span>
        <textarea
          class="mm-props-textarea"
          data-testid="mm-props-notes"
          rows="3"
          placeholder="补充说明（可多行）"
          :value="notesDraft"
          :disabled="isReadonly"
          @input="onNotesInput"
        />
      </label>

      <label class="mm-props-field">
        <span class="mm-props-label">链接</span>
        <input
          class="mm-props-input"
          :class="{ 'is-invalid': showLinkError }"
          data-testid="mm-props-link"
          type="text"
          autocomplete="off"
          placeholder="https:// 或 mailto:"
          :value="linkDraft"
          :disabled="isReadonly"
          :aria-invalid="showLinkError"
          @input="onLinkInput"
          @blur="linkTouched = true"
        />
        <span
          v-if="showLinkError"
          class="mm-props-error"
          data-testid="mm-props-link-error"
          role="alert"
        >
          链接需以 http://、https:// 或 mailto: 开头
        </span>
      </label>

      <label class="mm-props-field">
        <span class="mm-props-label">标签</span>
        <input
          class="mm-props-input"
          data-testid="mm-props-labels"
          type="text"
          autocomplete="off"
          placeholder="逗号分隔，如：重点, 待办"
          :value="labelsDraft"
          :disabled="isReadonly"
          @input="onLabelsInput"
        />
        <span class="mm-props-hint">多个标签用逗号分隔，重复与空项会自动去除</span>
      </label>
    </div>

    <footer class="mm-props-footer">
      <button
        v-if="!isReadonly"
        type="button"
        class="mm-props-apply"
        data-testid="mm-props-apply"
        @click="submit"
      >
        应用
      </button>
      <span v-else class="mm-props-hint">只读模式：不可编辑节点属性</span>
    </footer>
  </aside>
</template>

<style scoped>
.mm-props {
  width: 260px;
  flex: 0 0 260px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 0 10px;
  border-left: 1px solid var(--border, #e5e7eb);
  background: var(--surface, #ffffff);
  color: inherit;
  overflow: auto;
}
.mm-props-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.mm-props-heading { font-size: 12px; font-weight: 600; opacity: 0.7; }
.mm-props-close {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0.65;
}
.mm-props-close:hover { opacity: 1; background: var(--hover, rgba(0, 0, 0, 0.06)); }
.mm-props-topic {
  margin: 0;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;
}
.mm-props-body { display: flex; flex-direction: column; gap: 10px; padding: 0 12px; }
.mm-props-field { display: flex; flex-direction: column; gap: 4px; }
.mm-props-label { font-size: 11px; opacity: 0.65; }
.mm-props-input,
.mm-props-textarea {
  width: 100%;
  box-sizing: border-box;
  font-size: 12px;
  font-family: inherit;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid var(--border, #d8dee9);
  background: var(--surface-input, #fff);
  color: inherit;
  outline: none;
}
.mm-props-textarea { resize: vertical; min-height: 62px; }
.mm-props-input:focus,
.mm-props-textarea:focus { border-color: rgba(74, 144, 226, 0.8); }
.mm-props-input.is-invalid { border-color: #d9534f; }
.mm-props-input:disabled,
.mm-props-textarea:disabled { opacity: 0.6; cursor: not-allowed; }
.mm-props-error { font-size: 11px; color: #d9534f; }
.mm-props-hint { font-size: 11px; opacity: 0.55; }
.mm-props-footer { padding: 4px 12px 0; }
.mm-props-apply {
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid rgba(74, 144, 226, 0.55);
  background: rgba(74, 144, 226, 0.12);
  color: inherit;
  cursor: pointer;
}
.mm-props-apply:hover { background: rgba(74, 144, 226, 0.2); }
</style>
