<script setup lang="ts">
/**
 * MindmapPropertiesPanel（思维导图 阶段 4B/4C：节点属性面板）
 *
 * 职责：
 * 1. 展示并编辑单个主题节点的备注（notes）、链接（link）与标签（labels）；
 * 2. 链接做白名单校验：仅允许 http://、https://、mailto:，非法值不向上抛出；
 * 3. 标签以逗号分隔输入，提交时规范化为「去空、去重、保序」的字符串数组；
 * 4. 阶段 4C：样式（文字色 / 填充 / 形状）、标记（多选徽章）、
 *    关系（列出当前节点相关关系 + 选择目标节点添加 + 逐条删除）。
 *
 * 说明：本组件保持「受控」——不直接修改文档，所有改动经事件交给上层命令层，
 * 由上层决定是否写入 store 与历史；`topic` 为 null 时不渲染任何内容。
 * 备注/链接/标签沿用「应用」按钮提交；样式/标记/关系即改即发（交互控件本身就是确认动作）。
 *
 * 对外契约：
 * - props：`{ topic: { id, text, notes?, link?, labels?, style?, markers? } | null;
 *            readonly?: boolean;
 *            relations?: { id, label?, targetId, targetText, direction }[];
 *            relationTargets?: { id, text }[] }`
 * - emits：
 *   - `update(payload: { notes?, link?, labels? })`、`close()`（阶段 4B，保持不变）
 *   - `update-style(style: { color?, fill?, shape? })`
 *   - `update-markers(markers: string[])`
 *   - `add-relation({ targetId })`
 *   - `remove-relation({ relationId })`
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { computed, ref, watch } from 'vue';
import { MINDMAP_MARKER_DEFINITIONS } from '@/stores/mindmap';
import type { MindMapTopicStyle } from '@/types/mindmap';

/** 与当前节点相关的一条关系线（展示用，已由上层补齐目标文本）。 */
interface PanelRelation {
  id: string;
  sourceId: string;
  targetId: string;
  targetText: string;
  label?: string;
}

/** 可作为关系终点的候选节点。 */
interface PanelRelationTarget {
  id: string;
  text: string;
}

const props = withDefaults(
  defineProps<{
    /** 当前选中节点；null 表示不展示面板。 */
    topic: {
      id: string;
      text: string;
      notes?: string;
      link?: string;
      labels?: string[];
      style?: MindMapTopicStyle;
      markers?: string[];
    } | null;
    /** 只读模式：禁用输入并隐藏提交按钮。 */
    readonly?: boolean;
    /** 与当前节点相关的关系线（源或目标为当前节点）。 */
    relations?: PanelRelation[];
    /** 可添加关系的候选目标（已排除自身）。 */
    relationTargets?: PanelRelationTarget[];
  }>(),
  {
    readonly: false,
    relations: () => [],
    relationTargets: () => [],
  },
);

const emit = defineEmits<{
  (event: 'update', payload: { notes?: string; link?: string; labels?: string[] }): void;
  (event: 'close'): void;
  (event: 'update-style', style: MindMapTopicStyle): void;
  (event: 'update-markers', markers: string[]): void;
  (event: 'add-relation', payload: { targetId: string }): void;
  (event: 'remove-relation', payload: { relationId: string }): void;
}>();

/** 链接允许的协议白名单（mailto 之外一律拒绝）。 */
const LINK_PATTERN = /^(?:https?:\/\/|mailto:)\S+$/i;

/** 文字色候选（空值表示「默认」，由上层清除该键）。 */
const TEXT_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '默认' },
  { value: '#1f2329', label: '深灰' },
  { value: '#1f5fbf', label: '蓝' },
  { value: '#2f7d4f', label: '绿' },
  { value: '#c0451c', label: '橙红' },
  { value: '#7a3fb8', label: '紫' },
];

/** 填充色候选。 */
const FILL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '默认' },
  { value: '#ffffff', label: '白' },
  { value: '#e8f1ff', label: '浅蓝' },
  { value: '#e7f7ec', label: '浅绿' },
  { value: '#fff6e0', label: '浅黄' },
  { value: '#ffe8e6', label: '浅红' },
];

/** 形状候选：rounded / rect / pill（空值回落到默认圆角）。 */
const SHAPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '默认' },
  { value: 'rounded', label: '圆角' },
  { value: 'rect', label: '直角' },
  { value: 'pill', label: '胶囊' },
];

const notesDraft = ref('');
const linkDraft = ref('');
const labelsDraft = ref('');
/** 链接是否已被用户「确认过」（失焦或点过提交），用于避免输入过程中就报错。 */
const linkTouched = ref(false);

/* 阶段 4C：样式与关系草稿 */
const styleColorDraft = ref('');
const styleFillDraft = ref('');
const styleShapeDraft = ref('');
const relationTargetDraft = ref('');

const isReadonly = computed(() => props.readonly === true);

/**
 * 在候选表后追加「当前值不在候选表内」的临时项。
 *
 * 导入的文档可能带来任意 style 值；若不追加，下拉会显示第一项（默认）而文档里
 * 仍保留原值，造成「看起来被重置了」的误解。
 */
function withCurrentOption(
  options: { value: string; label: string }[],
  current: string,
): { value: string; label: string }[] {
  if (!current || options.some((option) => option.value === current)) return options;
  return [...options, { value: current, label: `自定义（${current}）` }];
}

const colorOptions = computed(() => withCurrentOption(TEXT_COLOR_OPTIONS, styleColorDraft.value));
const fillOptions = computed(() => withCurrentOption(FILL_OPTIONS, styleFillDraft.value));
const shapeOptions = computed(() => withCurrentOption(SHAPE_OPTIONS, styleShapeDraft.value));

/** 当前节点的标记集合（受控：直接跟随 props，便于父级回写后立即反映）。 */
const activeMarkers = computed<string[]>(() => props.topic?.markers ?? []);

/** 可添加关系的候选目标。 */
const availableRelationTargets = computed<PanelRelationTarget[]>(() => props.relationTargets);

/** 从 props.topic 重置草稿；仅在节点内容真正变化时执行，避免打断输入。 */
function resetDraft() {
  notesDraft.value = props.topic?.notes ?? '';
  linkDraft.value = props.topic?.link ?? '';
  labelsDraft.value = (props.topic?.labels ?? []).join(', ');
  linkTouched.value = false;
  styleColorDraft.value = props.topic?.style?.color ?? '';
  styleFillDraft.value = props.topic?.style?.fill ?? '';
  styleShapeDraft.value = props.topic?.style?.shape ?? '';
  relationTargetDraft.value = '';
}

watch(
  () => [
    props.topic?.id ?? '',
    props.topic?.notes ?? '',
    props.topic?.link ?? '',
    (props.topic?.labels ?? []).join('\u0000'),
    props.topic?.style?.color ?? '',
    props.topic?.style?.fill ?? '',
    props.topic?.style?.shape ?? '',
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

/* ------------------------------- 阶段 4C 交互 ------------------------------- */

/** 样式控件变更：即改即发，空字符串交由上层清除对应键。 */
function emitStyle() {
  if (isReadonly.value) return;
  emit('update-style', {
    color: styleColorDraft.value,
    fill: styleFillDraft.value,
    shape: styleShapeDraft.value,
  });
}

function onColorChange(event: Event) {
  styleColorDraft.value = (event.target as HTMLSelectElement | null)?.value ?? '';
  emitStyle();
}

function onFillChange(event: Event) {
  styleFillDraft.value = (event.target as HTMLSelectElement | null)?.value ?? '';
  emitStyle();
}

function onShapeChange(event: Event) {
  styleShapeDraft.value = (event.target as HTMLSelectElement | null)?.value ?? '';
  emitStyle();
}

/** 标记开关：有则删、无则加，发出完整的新集合（保持顺序）。 */
function toggleMarker(markerId: string) {
  if (isReadonly.value) return;
  const current = activeMarkers.value;
  const next = current.includes(markerId)
    ? current.filter((item) => item !== markerId)
    : [...current, markerId];
  emit('update-markers', next);
}

function onTargetChange(event: Event) {
  relationTargetDraft.value = (event.target as HTMLSelectElement | null)?.value ?? '';
}

/** 添加关系：未选择目标时不发事件。 */
function addRelation() {
  if (isReadonly.value) return;
  const targetId = relationTargetDraft.value;
  if (!targetId) return;
  emit('add-relation', { targetId });
  relationTargetDraft.value = '';
}

function removeRelation(relationId: string) {
  if (isReadonly.value) return;
  emit('remove-relation', { relationId });
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
      <!-- 样式（阶段 4C）：文字色 / 填充 / 形状，均为即改即发 -->
      <section class="mm-props-section" data-testid="mm-props-style">
        <span class="mm-props-section-title">样式</span>
        <label class="mm-props-field">
          <span class="mm-props-label">文字色</span>
          <select
            class="mm-props-select"
            data-testid="mm-props-style-color"
            :value="styleColorDraft"
            :disabled="isReadonly"
            @change="onColorChange"
          >
            <option v-for="option in colorOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="mm-props-field">
          <span class="mm-props-label">填充</span>
          <select
            class="mm-props-select"
            data-testid="mm-props-style-fill"
            :value="styleFillDraft"
            :disabled="isReadonly"
            @change="onFillChange"
          >
            <option v-for="option in fillOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="mm-props-field">
          <span class="mm-props-label">形状</span>
          <select
            class="mm-props-select"
            data-testid="mm-props-style-shape"
            :value="styleShapeDraft"
            :disabled="isReadonly"
            @change="onShapeChange"
          >
            <option v-for="option in shapeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </section>

      <!-- 标记（阶段 4C）：多选徽章，点击即切换 -->
      <section class="mm-props-section" data-testid="mm-props-markers">
        <span class="mm-props-section-title">标记</span>
        <div class="mm-props-markers">
          <button
            v-for="marker in MINDMAP_MARKER_DEFINITIONS"
            :key="marker.id"
            type="button"
            class="mm-props-marker"
            :class="{ 'is-active': activeMarkers.includes(marker.id) }"
            :data-testid="`mm-props-marker-${marker.id}`"
            :aria-pressed="activeMarkers.includes(marker.id)"
            :title="marker.label"
            :disabled="isReadonly"
            @click="toggleMarker(marker.id)"
          >
            <span class="mm-props-marker-badge">{{ marker.badge }}</span>
            <span class="mm-props-marker-label">{{ marker.label }}</span>
          </button>
        </div>
      </section>

      <!-- 关系（阶段 4C）：列出现有关系 + 选择目标添加 + 逐条删除 -->
      <section class="mm-props-section" data-testid="mm-props-relations">
        <span class="mm-props-section-title">关系</span>
        <ul v-if="relations.length > 0" class="mm-props-relation-list">
          <li
            v-for="relation in relations"
            :key="relation.id"
            class="mm-props-relation"
            data-testid="mm-props-relation"
            :data-relation-id="relation.id"
          >
            <span class="mm-props-relation-text" :title="relation.targetText">
              {{ relation.label ? `${relation.label} · ` : '' }}{{ relation.targetText }}
            </span>
            <button
              type="button"
              class="mm-props-relation-remove"
              :data-testid="`mm-props-relation-remove-${relation.id}`"
              aria-label="删除该关系"
              :disabled="isReadonly"
              @click="removeRelation(relation.id)"
            >
              ×
            </button>
          </li>
        </ul>
        <span v-else class="mm-props-hint" data-testid="mm-props-relation-empty">
          暂无独立关系线
        </span>
        <div class="mm-props-relation-add-row">
          <select
            class="mm-props-select"
            data-testid="mm-props-relation-target"
            :value="relationTargetDraft"
            :disabled="isReadonly || availableRelationTargets.length === 0"
            @change="onTargetChange"
          >
            <option value="">选择目标节点…</option>
            <option v-for="candidate in availableRelationTargets" :key="candidate.id" :value="candidate.id">
              {{ candidate.text || '（空主题）' }}
            </option>
          </select>
          <button
            type="button"
            class="mm-props-relation-add"
            data-testid="mm-props-relation-add"
            :disabled="isReadonly || !relationTargetDraft"
            @click="addRelation"
          >
            添加
          </button>
        </div>
      </section>

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
.mm-props-textarea,
.mm-props-select {
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
.mm-props-textarea:focus,
.mm-props-select:focus { border-color: rgba(74, 144, 226, 0.8); }
.mm-props-input.is-invalid { border-color: #d9534f; }
.mm-props-input:disabled,
.mm-props-textarea:disabled,
.mm-props-select:disabled { opacity: 0.6; cursor: not-allowed; }
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
/* 阶段 4C：分区容器 */
.mm-props-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0 2px;
  border-top: 1px dashed var(--border, #e5e7eb);
}
.mm-props-section-title { font-size: 11px; font-weight: 600; opacity: 0.75; }
/* 标记多选徽章 */
.mm-props-markers { display: flex; flex-wrap: wrap; gap: 4px; }
.mm-props-marker {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  font-size: 11px;
  border-radius: 999px;
  border: 1px solid var(--border, #d8dee9);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.mm-props-marker:hover:not(:disabled) { background: var(--hover, rgba(74, 144, 226, 0.08)); }
.mm-props-marker.is-active {
  border-color: var(--accent, #4a90e2);
  background: var(--accent-soft, rgba(74, 144, 226, 0.14));
  font-weight: 600;
}
.mm-props-marker:disabled { opacity: 0.5; cursor: not-allowed; }
.mm-props-marker-badge { font-weight: 700; }
/* 关系列表 */
.mm-props-relation-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.mm-props-relation {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.mm-props-relation-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.8;
}
.mm-props-relation-remove {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 0 4px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.6;
}
.mm-props-relation-remove:hover:not(:disabled) { opacity: 1; background: var(--hover, rgba(0, 0, 0, 0.06)); }
.mm-props-relation-remove:disabled { opacity: 0.3; cursor: not-allowed; }
.mm-props-relation-add-row { display: flex; gap: 6px; }
.mm-props-relation-add {
  flex: 0 0 auto;
  padding: 5px 10px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid rgba(74, 144, 226, 0.55);
  background: rgba(74, 144, 226, 0.12);
  color: inherit;
  cursor: pointer;
}
.mm-props-relation-add:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
