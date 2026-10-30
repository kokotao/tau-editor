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
 * UX-2 扩展：新增「边界」与「概要」两个区块——
 * - 边界：label / color 输入 + 应用 / 清除，emit `update-boundary({label,color})` 或 `update-boundary(null)`；
 * - 概要：多行文本 + 应用 / 清除，emit `update-summary(text)` 或 `update-summary(null)`；
 * 均为受控 + readonly 兼容，组件自身不写文档。
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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { MINDMAP_MARKER_DEFINITIONS } from '@/stores/mindmap';
import type { MindMapTopicBoundary, MindMapTopicStyle } from '@/types/mindmap';

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
      /** 边界（可选）：包住该主题 + 可见后代的框。 */
      boundary?: MindMapTopicBoundary;
      /** 概要（可选）：子节点范围的括线文本。 */
      summary?: string;
    } | null;
    /** 只读模式：禁用输入并隐藏提交按钮。 */
    readonly?: boolean;
    /** 与当前节点相关的关系线（源或目标为当前节点）。 */
    relations?: PanelRelation[];
    /** 可添加关系的候选目标（已排除自身）。 */
    relationTargets?: PanelRelationTarget[];
    /** 初始宽度（px），拖动 resizer 后由组件内部维护。 */
    initialWidth?: number;
  }>(),
  {
    readonly: false,
    relations: () => [],
    relationTargets: () => [],
    initialWidth: 260,
  },
);

const emit = defineEmits<{
  (event: 'update', payload: { notes?: string; link?: string; labels?: string[] }): void;
  (event: 'close'): void;
  (event: 'update-style', style: MindMapTopicStyle): void;
  (event: 'update-markers', markers: string[]): void;
  (event: 'add-relation', payload: { targetId: string }): void;
  (event: 'remove-relation', payload: { relationId: string }): void;
  /** 设置/清除边界：null 或字段全空表示清除。 */
  (event: 'update-boundary', boundary: MindMapTopicBoundary | null): void;
  /** 设置/清除概要：null 或空白表示清除。 */
  (event: 'update-summary', text: string | null): void;
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

/** 边界颜色预设：点一下即写文档（默认色为「留空，跟随主题强调色」）。 */
const BOUNDARY_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: '', label: '主题色' },
  { value: '#2563eb', label: '蓝' },
  { value: '#16a34a', label: '绿' },
  { value: '#d97706', label: '橙' },
  { value: '#dc2626', label: '红' },
  { value: '#7c3aed', label: '紫' },
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
/** UX-2：边界 / 概要草稿（应用按钮提交，避免每次按键都记一条撤销历史）。 */
const boundaryLabelDraft = ref('');
const boundaryColorDraft = ref('');
const summaryDraft = ref('');

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
  boundaryLabelDraft.value = props.topic?.boundary?.label ?? '';
  boundaryColorDraft.value = props.topic?.boundary?.color ?? '';
  summaryDraft.value = props.topic?.summary ?? '';
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
    props.topic?.boundary?.label ?? '',
    props.topic?.boundary?.color ?? '',
    props.topic?.summary ?? '',
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

/* ------------------------- UX-2：边界 / 概要 ------------------------- */

function onBoundaryLabelInput(event: Event) {
  boundaryLabelDraft.value = (event.target as HTMLInputElement | null)?.value ?? '';
}

function onBoundaryColorInput(event: Event) {
  boundaryColorDraft.value = (event.target as HTMLInputElement | null)?.value ?? '';
}

function onSummaryInput(event: Event) {
  summaryDraft.value = (event.target as HTMLTextAreaElement | null)?.value ?? '';
}

/** 应用边界：字段全空等价于清除（由 store 统一处理空值语义）。 */
function applyBoundary() {
  if (isReadonly.value) return;
  emit('update-boundary', {
    label: boundaryLabelDraft.value.trim(),
    color: boundaryColorDraft.value.trim(),
  });
}

/** 清除边界。 */
function clearBoundary() {
  if (isReadonly.value) return;
  boundaryLabelDraft.value = '';
  boundaryColorDraft.value = '';
  emit('update-boundary', null);
}

/** 预设颜色：立即写文档，便于一键得到可见边界。 */
function pickBoundaryColor(color: string) {
  if (isReadonly.value) return;
  boundaryColorDraft.value = color;
  emit('update-boundary', {
    label: boundaryLabelDraft.value.trim(),
    color: color.trim(),
  });
}

/** 应用概要：空白等价于清除。 */
function applySummary() {
  if (isReadonly.value) return;
  emit('update-summary', summaryDraft.value.trim());
}

/** 清除概要。 */
function clearSummary() {
  if (isReadonly.value) return;
  summaryDraft.value = '';
  emit('update-summary', null);
}

/* ---------------------------- 面板宽度（本地 state） ---------------------------- */

/** 面板宽度上下限（与任务约定一致：180–420px）。 */
const PANEL_MIN_WIDTH = 180;
const PANEL_MAX_WIDTH = 420;

/** 面板宽度：只影响视图，不写入文档、不进历史。 */
const panelWidth = ref(clampPanelWidth(props.initialWidth ?? 260));

function clampPanelWidth(value: number): number {
  return Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, Math.round(value)));
}

let resizeStartX = 0;
let resizeStartWidth = 0;
let resizing = false;

function restoreResizeCursor() {
  if (typeof document === 'undefined') return;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

function onResizePointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  resizing = true;
  resizeStartX = event.clientX;
  resizeStartWidth = panelWidth.value;
  window.addEventListener('pointermove', onResizePointerMove);
  window.addEventListener('pointerup', endResize, { once: true });
  window.addEventListener('pointercancel', endResize, { once: true });
  if (typeof document !== 'undefined') {
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
}

function onResizePointerMove(event: PointerEvent) {
  if (!resizing) return;
  // 面板位于右侧：向左拖（clientX 变小）应当变宽
  panelWidth.value = clampPanelWidth(resizeStartWidth + (resizeStartX - event.clientX));
}

function endResize() {
  resizing = false;
  window.removeEventListener('pointermove', onResizePointerMove);
  window.removeEventListener('pointerup', endResize);
  window.removeEventListener('pointercancel', endResize);
  restoreResizeCursor();
}

onBeforeUnmount(() => {
  endResize();
});
</script>

<template>
  <aside
    v-if="topic"
    class="mm-props"
    data-testid="mm-props"
    role="complementary"
    aria-label="节点属性"
    :style="{ width: `${panelWidth}px`, flex: `0 0 ${panelWidth}px` }"
    @keydown.esc="onEscape"
  >
    <div
      class="mm-panel-resizer"
      data-testid="mm-props-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整属性面板宽度"
      title="拖动调整宽度"
      @pointerdown="onResizePointerDown"
    ></div>
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

      <!-- 边界（UX-2）：包住该主题及其全部可见后代的框；标签/颜色均可留空 -->
      <section class="mm-props-section" data-testid="mm-props-boundary">
        <span class="mm-props-section-title">边界</span>
        <label class="mm-props-field">
          <span class="mm-props-label">标签</span>
          <input
            class="mm-props-input"
            data-testid="mm-props-boundary-label"
            type="text"
            autocomplete="off"
            placeholder="边界标签（可留空）"
            :value="boundaryLabelDraft"
            :disabled="isReadonly"
            @input="onBoundaryLabelInput"
          />
        </label>
        <label class="mm-props-field">
          <span class="mm-props-label">颜色</span>
          <input
            class="mm-props-input"
            data-testid="mm-props-boundary-color"
            type="text"
            autocomplete="off"
            placeholder="如 #2563eb（留空跟随主题色）"
            :value="boundaryColorDraft"
            :disabled="isReadonly"
            @input="onBoundaryColorInput"
          />
        </label>
        <div class="mm-props-color-presets">
          <button
            v-for="preset in BOUNDARY_COLOR_PRESETS"
            :key="preset.value || 'theme'"
            type="button"
            class="mm-props-color-preset"
            :class="{ 'is-active': boundaryColorDraft === preset.value }"
            :data-testid="`mm-props-boundary-color-${preset.value || 'theme'}`"
            :title="`边界颜色：${preset.label}`"
            :disabled="isReadonly"
            @click="pickBoundaryColor(preset.value)"
          >
            <span
              class="mm-props-color-dot"
              :style="{ background: preset.value || 'var(--accent-brand)' }"
            ></span>
            {{ preset.label }}
          </button>
        </div>
        <div class="mm-props-actions">
          <button
            type="button"
            class="mm-props-action"
            data-testid="mm-props-boundary-apply"
            :disabled="isReadonly"
            @click="applyBoundary"
          >
            应用
          </button>
          <button
            type="button"
            class="mm-props-action danger"
            data-testid="mm-props-boundary-clear"
            :disabled="isReadonly"
            @click="clearBoundary"
          >
            清除
          </button>
        </div>
      </section>

      <!-- 概要（UX-2）：该主题子节点范围的括线 + 文本 -->
      <section class="mm-props-section" data-testid="mm-props-summary">
        <span class="mm-props-section-title">概要</span>
        <textarea
          class="mm-props-textarea"
          data-testid="mm-props-summary-text"
          rows="2"
          placeholder="概括这组子主题（留空清除）"
          :value="summaryDraft"
          :disabled="isReadonly"
          @input="onSummaryInput"
        />
        <div class="mm-props-actions">
          <button
            type="button"
            class="mm-props-action"
            data-testid="mm-props-summary-apply"
            :disabled="isReadonly"
            @click="applySummary"
          >
            应用
          </button>
          <button
            type="button"
            class="mm-props-action danger"
            data-testid="mm-props-summary-clear"
            :disabled="isReadonly"
            @click="clearSummary"
          >
            清除
          </button>
        </div>
        <span class="mm-props-hint">概要绘制在该节点子主题旁；无可见子节点时不显示</span>
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
/* 配色使用 Tau 主题 token；按钮/输入框显式声明文字色，避免暗色主题下「白底浅字」 */
.mm-props {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 0 10px;
  border-left: 1px solid var(--border-soft);
  background: var(--panel-base);
  color: var(--text-primary);
  overflow: auto;
}
/* 可拖拽调宽的左边缘 */
.mm-panel-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 2;
  background: transparent;
}
.mm-panel-resizer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  background: transparent;
}
.mm-panel-resizer:hover::after,
.mm-panel-resizer:active::after {
  background: var(--accent-brand);
}
.mm-props-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-soft);
}
.mm-props-heading {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.mm-props-close {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: var(--radius-control);
  cursor: pointer;
}
.mm-props-close:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}
.mm-props-topic {
  margin: 0;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mm-props-body { display: flex; flex-direction: column; gap: 10px; padding: 0 12px; }
.mm-props-field { display: flex; flex-direction: column; gap: 4px; }
.mm-props-label { font-size: 11px; color: var(--text-secondary); }
.mm-props-input,
.mm-props-textarea,
.mm-props-select {
  width: 100%;
  box-sizing: border-box;
  font-size: 12px;
  font-family: var(--font-ui);
  padding: 5px 8px;
  border-radius: var(--radius-control);
  border: 1px solid var(--border-soft);
  background: var(--panel-elevated);
  color: var(--text-primary);
  outline: none;
}
.mm-props-input::placeholder,
.mm-props-textarea::placeholder { color: var(--text-muted); }
.mm-props-textarea { resize: vertical; min-height: 62px; }
.mm-props-input:focus,
.mm-props-textarea:focus,
.mm-props-select:focus { border-color: var(--accent-brand); }
.mm-props-input.is-invalid { border-color: var(--state-danger); }
.mm-props-input:disabled,
.mm-props-textarea:disabled,
.mm-props-select:disabled { opacity: 0.6; cursor: not-allowed; }
.mm-props-error { font-size: 11px; color: var(--state-danger); }
.mm-props-hint { font-size: 11px; color: var(--text-muted); }
.mm-props-footer { padding: 4px 12px 0; }
.mm-props-apply {
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  border-radius: var(--radius-control);
  border: 1px solid var(--accent-brand);
  background: var(--surface-active);
  color: var(--accent-brand-strong);
  cursor: pointer;
}
.mm-props-apply:hover {
  background: var(--accent-brand);
  color: var(--bg-app);
}
/* 阶段 4C：分区容器 */
.mm-props-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0 2px;
  border-top: 1px dashed var(--border-soft);
}
.mm-props-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
/* 标记多选徽章 */
.mm-props-markers { display: flex; flex-wrap: wrap; gap: 4px; }
.mm-props-marker {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  font-size: 11px;
  font-family: var(--font-ui);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-soft);
  background: var(--panel-elevated);
  color: var(--text-primary);
  cursor: pointer;
}
.mm-props-marker:hover:not(:disabled) { background: var(--surface-hover); }
.mm-props-marker.is-active {
  border-color: var(--accent-brand);
  background: var(--surface-active);
  color: var(--accent-brand-strong);
  font-weight: 600;
}
.mm-props-marker:disabled { opacity: 0.5; cursor: not-allowed; }
.mm-props-marker-badge { font-weight: 700; }
/* UX-2：边界 / 概要的按钮与颜色预设 */
.mm-props-actions { display: flex; gap: 6px; }
.mm-props-action {
  flex: 1;
  padding: 4px 8px;
  font-size: 11px;
  font-family: var(--font-ui);
  border-radius: var(--radius-control);
  border: 1px solid var(--border-soft);
  background: var(--panel-elevated);
  color: var(--text-primary);
  cursor: pointer;
}
.mm-props-action:hover:not(:disabled) { background: var(--surface-hover); }
.mm-props-action.danger {
  border-color: var(--state-danger);
  color: var(--state-danger);
}
.mm-props-action:disabled { opacity: 0.5; cursor: not-allowed; }
.mm-props-color-presets { display: flex; flex-wrap: wrap; gap: 4px; }
.mm-props-color-preset {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  font-size: 10px;
  font-family: var(--font-ui);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-soft);
  background: var(--panel-elevated);
  color: var(--text-secondary);
  cursor: pointer;
}
.mm-props-color-preset:hover:not(:disabled) { background: var(--surface-hover); }
.mm-props-color-preset.is-active {
  border-color: var(--accent-brand);
  color: var(--text-primary);
}
.mm-props-color-preset:disabled { opacity: 0.5; cursor: not-allowed; }
.mm-props-color-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid var(--border-soft);
}
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
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mm-props-relation-remove {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1;
  padding: 0 4px;
  border-radius: var(--radius-xs);
  cursor: pointer;
}
.mm-props-relation-remove:hover:not(:disabled) {
  color: var(--state-danger);
  background: var(--surface-hover);
}
.mm-props-relation-remove:disabled { opacity: 0.35; cursor: not-allowed; }
.mm-props-relation-add-row { display: flex; gap: 6px; }
.mm-props-relation-add {
  flex: 0 0 auto;
  padding: 5px 10px;
  font-size: 11px;
  font-family: var(--font-ui);
  border-radius: var(--radius-control);
  border: 1px solid var(--accent-brand);
  background: var(--surface-active);
  color: var(--accent-brand-strong);
  cursor: pointer;
}
.mm-props-relation-add:hover:not(:disabled) {
  background: var(--accent-brand);
  color: var(--bg-app);
}
.mm-props-relation-add:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
