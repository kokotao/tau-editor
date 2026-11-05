<script setup lang="ts">
/**
 * 画布样式面板。
 *
 * 结构布局与主题属于导图正文，可撤销并回写；背景、网格和中心主题显隐属于当前视图偏好。
 *
 * @author Albert_Luo
 * @date 2026-11-04
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMindmapStore } from '@/stores/mindmap';
import { listMindmapThemes } from '@/services/mindmapThemeService';
import type { MindmapTheme } from '@/services/mindmapThemeService';
import type { MindMapArrowStyle, MindMapLayoutMode, MindMapLineStyle, MindMapTopicStyle } from '@/types/mindmap';

const emit = defineEmits<{
  (event: 'change', json: string): void;
}>();

const store = useMindmapStore();
const document = computed(() => store.document);
const styleTarget = computed(() => store.styleTarget);
const activeTopic = computed(() => {
  const target = styleTarget.value;
  return target.kind === 'topic' ? document.value?.topics[target.topicId] ?? null : null;
});
const activeRelation = computed(() => {
  const target = styleTarget.value;
  return target.kind === 'relation'
    ? document.value?.relations?.find((relation) => relation.id === target.relationId) ?? null
    : null;
});
const themes = listMindmapThemes();
const themePicker = ref<HTMLElement | null>(null);
const stylePanel = ref<HTMLElement | null>(null);
const themeMenuOpen = ref(false);
const backgroundDraft = ref('');
const activePanelTab = ref<'canvas' | 'topic'>('canvas');
const customStyleOpen = ref(false);
const advancedStyleOpen = ref(false);
const bulkStyleLevel = ref<'root' | 'branch' | 'child'>('branch');
const tierPresetIds = ref<Record<'root' | 'branch' | 'child', string>>({ root: '', branch: '', child: '' });
const spacingDraft = ref({ hGap: 56, vGap: 18 });
let spacingCommitTimer: ReturnType<typeof setTimeout> | undefined;

const selectedTheme = computed<MindmapTheme>(() => themes.find((theme) => theme.id === document.value?.themeId) ?? themes[0] as MindmapTheme);

function themeSwatches(theme: typeof themes[number]) {
  return theme.branchPalette?.length ? theme.branchPalette : [theme.rootFill, theme.accent, theme.edge, theme.nodeStroke, theme.rootStroke, theme.nodeFill];
}

function toggleThemeMenu() {
  themeMenuOpen.value = !themeMenuOpen.value;
}

function chooseTheme(themeId: string) {
  setTheme(themeId);
  themeMenuOpen.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!(event.target instanceof Node) || !themePicker.value?.contains(event.target)) {
    themeMenuOpen.value = false;
  }
}

onMounted(() => {
  globalThis.document.addEventListener('pointerdown', onDocumentPointerDown);
  if (stylePanel.value) stylePanel.value.scrollTop = 0;
});
onBeforeUnmount(() => {
  globalThis.document.removeEventListener('pointerdown', onDocumentPointerDown);
  if (spacingCommitTimer) clearTimeout(spacingCommitTimer);
});

watch(() => store.styleVisible, (visible) => {
  if (visible) void nextTick(() => { if (stylePanel.value) stylePanel.value.scrollTop = 0; });
});

watch(() => document.value?.id, () => {
  if (stylePanel.value) stylePanel.value.scrollTop = 0;
});

watch(() => store.canvasBackground, (value) => {
  backgroundDraft.value = value;
}, { immediate: true });

watch(styleTarget, (target) => {
  if (target.kind === 'topic' || target.kind === 'edge' || target.kind === 'relation') activePanelTab.value = 'topic';
  else if (target.kind === 'canvas') activePanelTab.value = 'canvas';
}, { immediate: true });

watch(() => document.value?.opaqueExtensions?.tauLayoutSpacing, (value) => {
  const spacing = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  spacingDraft.value = {
    hGap: typeof spacing.hGap === 'number' ? spacing.hGap : 56,
    vGap: typeof spacing.vGap === 'number' ? spacing.vGap : 18,
  };
}, { immediate: true });

watch(() => document.value?.opaqueExtensions?.tauTopicStylePresets, (value) => {
  const presets = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  tierPresetIds.value = {
    root: typeof presets.root === 'string' ? presets.root : '',
    branch: typeof presets.branch === 'string' ? presets.branch : '',
    child: typeof presets.child === 'string' ? presets.child : '',
  };
}, { immediate: true });

const layoutOptions: Array<{ id: MindMapLayoutMode; label: string; hint: string }> = [
  { id: 'mindmap', label: '两侧', hint: '中心主题向左右展开' },
  { id: 'logic', label: '逻辑图', hint: '主题统一向右展开' },
  { id: 'tree', label: '树形', hint: '正交连线的树形结构' },
  { id: 'org', label: '组织图', hint: '自上而下展开' },
];
const backgroundPresets = [
  { color: '#ffffff', name: '纯白' },
  { color: '#f4f7fb', name: '雾灰' },
  { color: '#eaf2ff', name: '浅天蓝' },
  { color: '#e8f5ee', name: '薄荷白' },
  { color: '#fff3e8', name: '暖杏' },
  { color: '#fff0f3', name: '浅玫瑰' },
  { color: '#f4efff', name: '淡薰衣草' },
  { color: '#e9f7f7', name: '浅青' },
  { color: '#202936', name: '石墨' },
  { color: '#111827', name: '深夜蓝' },
];

function emitIfChanged(before: string) {
  const after = store.serialized;
  if (after && after !== before) emit('change', after);
}

function setLayout(mode: MindMapLayoutMode) {
  const before = store.serialized;
  if (store.setLayoutMode(mode)) emitIfChanged(before);
}

function setTheme(themeId: string) {
  const before = store.serialized;
  if (store.setTheme(themeId)) emitIfChanged(before);
}

function setPanelTab(tab: 'canvas' | 'topic') {
  activePanelTab.value = tab;
  if (tab === 'canvas') store.showStyleTarget({ kind: 'canvas' });
  else if (store.selectedTopicId && document.value?.topics[store.selectedTopicId]) {
    store.showStyleTarget({ kind: 'topic', topicId: store.selectedTopicId });
  }
}

function updateSpacingDraft(key: 'hGap' | 'vGap', value: number) {
  spacingDraft.value = { ...spacingDraft.value, [key]: value };
  if (spacingCommitTimer) clearTimeout(spacingCommitTimer);
  spacingCommitTimer = setTimeout(commitSpacing, 250);
}

function commitSpacing() {
  if (spacingCommitTimer) clearTimeout(spacingCommitTimer);
  spacingCommitTimer = undefined;
  const doc = document.value;
  if (!doc) return;
  const next = {
    ...doc,
    opaqueExtensions: { ...doc.opaqueExtensions, tauLayoutSpacing: { ...spacingDraft.value } },
  };
  const before = store.serialized;
  if (store.commitDocumentChange('调整主题间距', next)) emitIfChanged(before);
}

function applySpacingPreset() {
  spacingDraft.value = { hGap: 56, vGap: 18 };
  commitSpacing();
}

const nodeStylePresets = [
  { id: 'classic', name: '经典推荐', fill: '#ffffff', color: '#20242b', shape: 'rounded', edgeColor: '#4a90e2' },
  { id: 'coral', name: '复古彩虹', fill: '#cf6651', color: '#ffffff', shape: 'rounded', edgeColor: '#d89465' },
  { id: 'fresh', name: '活力彩条', fill: '#65b79a', color: '#ffffff', shape: 'pill', edgeColor: '#ef8b56' },
  { id: 'business', name: '简约商务', fill: '#dce4ee', color: '#263746', shape: 'rect', edgeColor: '#526779' },
  { id: 'elegant', name: '柔和雅韵', fill: '#eadde4', color: '#493743', shape: 'rounded', edgeColor: '#ad426f' },
  { id: 'neon', name: '活力对撞', fill: '#34234e', color: '#ffffff', shape: 'rect', edgeColor: '#ec5eae' },
];
const bulkPresetId = ref('');

function applySelectedBulkPreset() {
  const preset = nodeStylePresets.find((item) => item.id === bulkPresetId.value);
  if (!preset) return;
  applyStyleToLevel(preset);
  bulkPresetId.value = '';
}

function setTierPreset(level: 'root' | 'branch' | 'child', presetId: string) {
  tierPresetIds.value = { ...tierPresetIds.value, [level]: presetId };
  const doc = document.value;
  if (!doc) return;
  const before = store.serialized;
  const tauTopicStylePresets = { ...tierPresetIds.value };
  if (store.commitDocumentChange('设置层级样式模板', {
    ...doc,
    opaqueExtensions: { ...doc.opaqueExtensions, tauTopicStylePresets },
  })) emitIfChanged(before);
}

function applyTierPreset(level: 'root' | 'branch' | 'child') {
  const preset = nodeStylePresets.find((item) => item.id === tierPresetIds.value[level]);
  if (!preset) return;
  const doc = document.value;
  if (!doc) return;
  const depthOf = (topicId: string): number => {
    let depth = 0;
    let topic = doc.topics[topicId];
    const seen = new Set<string>();
    while (topic?.parentId && !seen.has(topic.id)) {
      seen.add(topic.id);
      depth += 1;
      topic = doc.topics[topic.parentId];
    }
    return depth;
  };
  const depth = level === 'root' ? 0 : level === 'branch' ? 1 : 2;
  const targets = Object.values(doc.topics).filter((topic) => level === 'child'
    ? depthOf(topic.id) >= depth
    : depthOf(topic.id) === depth);
  if (targets.length === 0) return;
  const topics = { ...doc.topics };
  for (const topic of targets) {
    topics[topic.id] = {
      ...topic,
      style: { ...topic.style, fill: preset.fill, color: preset.color, shape: preset.shape, edgeColor: preset.edgeColor },
    };
  }
  const before = store.serialized;
  if (store.commitDocumentChange(`应用${level === 'root' ? '中心主题' : level === 'branch' ? '分支主题' : '子主题'}模板`, { ...doc, topics })) emitIfChanged(before);
}

function applyNodeStylePreset(preset: typeof nodeStylePresets[number]) {
  if (styleTarget.value.kind !== 'topic') return;
  updateTopicStyle({ fill: preset.fill, color: preset.color, shape: preset.shape, edgeColor: preset.edgeColor });
}

function applyStyleToLevel(preset: typeof nodeStylePresets[number]) {
  const doc = document.value;
  if (!doc) return;
  const depthOf = (topicId: string): number => {
    let depth = 0;
    let topic = doc.topics[topicId];
    const seen = new Set<string>();
    while (topic?.parentId && !seen.has(topic.id)) {
      seen.add(topic.id);
      depth += 1;
      topic = doc.topics[topic.parentId];
    }
    return depth;
  };
  const expectedDepth = bulkStyleLevel.value === 'root' ? 0 : bulkStyleLevel.value === 'branch' ? 1 : 2;
  const targets = Object.values(doc.topics).filter((topic) => (
    bulkStyleLevel.value === 'child' ? depthOf(topic.id) >= expectedDepth : depthOf(topic.id) === expectedDepth
  ));
  if (targets.length === 0) return;
  const topics = { ...doc.topics };
  for (const topic of targets) {
    topics[topic.id] = {
      ...topic,
      style: { ...topic.style, fill: preset.fill, color: preset.color, shape: preset.shape, edgeColor: preset.edgeColor },
    };
  }
  const before = store.serialized;
  if (store.commitDocumentChange(`批量应用${preset.name}`, { ...doc, topics })) emitIfChanged(before);
}

function setTopicSummary(text: string) {
  if (styleTarget.value.kind !== 'topic') return;
  const before = store.serialized;
  if (store.setTopicSummary(styleTarget.value.topicId, text)) emitIfChanged(before);
}

function setTopicBoundaryLabel(label: string) {
  if (styleTarget.value.kind !== 'topic' || !activeTopic.value) return;
  const before = store.serialized;
  if (store.setTopicBoundary(styleTarget.value.topicId, { ...activeTopic.value.boundary, label })) emitIfChanged(before);
}

function setTopicBoundaryColor(color: string) {
  if (styleTarget.value.kind !== 'topic' || !activeTopic.value) return;
  const before = store.serialized;
  if (store.setTopicBoundary(styleTarget.value.topicId, { ...activeTopic.value.boundary, color })) emitIfChanged(before);
}

function clearTopicExtras() {
  if (styleTarget.value.kind !== 'topic') return;
  const before = store.serialized;
  const boundaryChanged = store.setTopicBoundary(styleTarget.value.topicId, null);
  const summaryChanged = store.setTopicSummary(styleTarget.value.topicId, null);
  if (boundaryChanged || summaryChanged) emitIfChanged(before);
}

function applyThemeThumbnail(themeId: string) {
  setTheme(themeId);
}

function applyBackground(color = backgroundDraft.value) {
  if (/^#[0-9a-f]{6}$/i.test(color)) store.setCanvasBackground(color);
}

function commitBackgroundText() {
  if (backgroundDraft.value === '') return resetBackground();
  applyBackground();
}

function resetBackground() {
  store.setCanvasBackground('');
}

function updateTopicStyle(patch: MindMapTopicStyle) {
  const topic = activeTopic.value;
  if (!topic) return;
  const before = store.serialized;
  if (store.updateTopicStyle(topic.id, patch)) emitIfChanged(before);
}

function updateEdgeColor(color: string) {
  if (styleTarget.value.kind !== 'edge') return;
  const before = store.serialized;
  if (store.updateTopicStyle(styleTarget.value.childId, { edgeColor: color })) emitIfChanged(before);
}

function resetEdgeColor() {
  updateEdgeColor('');
}

function updateEdgeStyle(patch: MindMapTopicStyle) {
  if (styleTarget.value.kind !== 'edge') return;
  const before = store.serialized;
  if (store.updateTopicStyle(styleTarget.value.childId, patch)) emitIfChanged(before);
}

function updateRelationStyle(patch: { lineStyle?: MindMapLineStyle; startArrow?: MindMapArrowStyle; endArrow?: MindMapArrowStyle }) {
  const doc = document.value;
  const relation = activeRelation.value;
  if (!doc || !relation) return;
  const before = store.serialized;
  const relations = doc.relations?.map((item) => item.id === relation.id ? { ...item, ...patch } : item);
  if (relations && store.commitDocumentChange('更新关系线样式', { ...doc, relations })) emitIfChanged(before);
}

const targetTitle = computed(() => {
  if (styleTarget.value.kind === 'topic') return '节点样式';
  if (styleTarget.value.kind === 'edge') return '连接线样式';
  if (styleTarget.value.kind === 'relation') return '关系线样式';
  return '画布样式';
});
</script>

<template>
  <aside v-if="document && store.styleVisible" ref="stylePanel" class="mm-style-panel" data-testid="mm-canvas-style-panel" aria-label="画布样式">
    <div class="mm-style-sticky-header">
    <header class="mm-style-header">
      <div>
          <h2>{{ targetTitle }}</h2>
        <p>布局与配色会保存到导图</p>
      </div>
      <button type="button" class="mm-style-close" aria-label="关闭画布样式" title="关闭画布样式" @click="store.setStyleVisible(false)">×</button>
    </header>

    <nav class="mm-style-tabs" aria-label="样式面板">
      <button type="button" :class="{ 'is-active': activePanelTab === 'canvas' }" :aria-pressed="activePanelTab === 'canvas'" @click="setPanelTab('canvas')">画布样式</button>
      <button type="button" :class="{ 'is-active': activePanelTab === 'topic' }" :aria-pressed="activePanelTab === 'topic'" :disabled="!store.selectedTopicId" @click="setPanelTab('topic')">主题样式</button>
    </nav>
    </div>

    <template v-if="activePanelTab === 'canvas' && styleTarget.kind === 'canvas'">
    <section class="mm-style-section">
      <h3>骨架</h3>
      <div class="mm-layout-grid" role="radiogroup" aria-label="导图方向">
        <button
          v-for="option in layoutOptions"
          :key="option.id"
          type="button"
          class="mm-layout-card"
          :class="{ 'is-active': document.layoutMode === option.id }"
          :aria-pressed="document.layoutMode === option.id"
          :title="option.hint"
          @click="setLayout(option.id)"
        >
          <span class="mm-layout-preview" :class="`is-${option.id}`"><i></i><b></b><em></em></span>
          <span>{{ option.label }}</span>
        </button>
      </div>
    </section>

    <section class="mm-style-section">
      <h3>配色</h3>
      <div ref="themePicker" class="mm-theme-picker" @keydown.esc.stop="themeMenuOpen = false">
        <button
          type="button"
          class="mm-theme-trigger"
          aria-haspopup="listbox"
          :aria-expanded="themeMenuOpen"
          title="选择配色方案"
          data-testid="mm-theme-trigger"
          @click.stop="toggleThemeMenu"
        >
          <span class="mm-theme-swatch mm-theme-swatch--trigger" aria-hidden="true">
            <i v-for="(color, index) in themeSwatches(selectedTheme)" :key="`${selectedTheme.id}-trigger-${index}`" :style="{ backgroundColor: color }"></i>
          </span>
          <span class="mm-theme-current-name">{{ selectedTheme.name }}</span>
          <span class="mm-theme-chevron" aria-hidden="true">⌄</span>
        </button>
        <div v-if="themeMenuOpen" class="mm-theme-menu" role="listbox" aria-label="配色方案">
          <button
            v-for="theme in themes"
            :key="theme.id"
            type="button"
            role="option"
            class="mm-theme-option"
            :class="{ 'is-active': document.themeId === theme.id }"
            :aria-selected="document.themeId === theme.id"
            :title="`应用${theme.name}主题`"
            @click="chooseTheme(theme.id)"
          >
            <span v-if="document.themeId === theme.id" class="mm-theme-check" aria-hidden="true">✓</span>
            <span v-else class="mm-theme-check mm-theme-check--empty" aria-hidden="true"></span>
            <span class="mm-theme-swatch mm-theme-swatch--option" aria-hidden="true">
              <i v-for="(color, index) in themeSwatches(theme)" :key="`${theme.id}-${index}`" :style="{ backgroundColor: color }"></i>
            </span>
            <span class="mm-theme-option-name">{{ theme.name }}</span>
          </button>
        </div>
      </div>
      <div class="mm-theme-thumbnails" aria-label="主题样式预览">
        <button
          v-for="theme in themes"
          :key="`preview-${theme.id}`"
          type="button"
          class="mm-theme-thumbnail"
          :class="{ 'is-active': document.themeId === theme.id }"
          :title="`应用${theme.name}样式`"
          :aria-label="`应用${theme.name}样式`"
          :aria-pressed="document.themeId === theme.id"
          @click="applyThemeThumbnail(theme.id)"
        >
          <span class="mm-mini-map" :style="{ '--mini-root': theme.rootFill, '--mini-node': theme.nodeFill, '--mini-edge': theme.accent, '--mini-text': theme.text }">
            <i class="mm-mini-edge mm-mini-edge-left"></i><i class="mm-mini-edge mm-mini-edge-right"></i>
            <b class="mm-mini-node mm-mini-node-left"></b><b class="mm-mini-node mm-mini-node-right"></b>
            <em class="mm-mini-node mm-mini-node-leaf-left"></em><em class="mm-mini-node mm-mini-node-leaf-right"></em>
            <strong class="mm-mini-root"></strong>
          </span>
        </button>
      </div>
    </section>

    <section class="mm-style-section">
      <h3>画布背景</h3>
      <div class="mm-background-row">
        <input :value="backgroundDraft || '#ffffff'" type="color" aria-label="画布背景颜色" @input="backgroundDraft = ($event.target as HTMLInputElement).value; applyBackground()">
        <input v-model="backgroundDraft" class="mm-background-text" maxlength="7" placeholder="跟随应用主题" aria-label="画布背景十六进制颜色" @change="commitBackgroundText()">
        <button type="button" class="mm-reset-background" title="恢复应用主题背景" @click="resetBackground">重置</button>
      </div>
      <div class="mm-background-presets">
        <button v-for="preset in backgroundPresets" :key="preset.color" type="button" :style="{ background: preset.color }" :title="`${preset.name} ${preset.color}`" :aria-label="`画布背景：${preset.name}`" @click="backgroundDraft = preset.color; applyBackground(preset.color)"></button>
      </div>
    </section>

    <section class="mm-style-section mm-view-section">
      <h3>视图</h3>
      <label><input type="checkbox" :checked="store.canvasGridVisible" @change="store.setCanvasGridVisible(($event.target as HTMLInputElement).checked)"> 显示点阵网格</label>
      <label><input type="checkbox" :checked="store.canvasRootVisible" @change="store.setCanvasRootVisible(($event.target as HTMLInputElement).checked)"> 显示中心主题</label>
    </section>
    </template>

    <template v-if="activePanelTab === 'topic' && styleTarget.kind === 'topic' && activeTopic">
      <section class="mm-style-section">
        <h3>主题间距</h3>
        <label class="mm-spacing-field">横向间距 <output>{{ spacingDraft.hGap }}px</output>
          <input type="range" min="20" max="120" step="4" :value="spacingDraft.hGap" aria-label="主题横向间距" @input="updateSpacingDraft('hGap', Number(($event.target as HTMLInputElement).value))" @change="commitSpacing">
        </label>
        <label class="mm-spacing-field">纵向间距 <output>{{ spacingDraft.vGap }}px</output>
          <input type="range" min="4" max="80" step="2" :value="spacingDraft.vGap" aria-label="主题纵向间距" @input="updateSpacingDraft('vGap', Number(($event.target as HTMLInputElement).value))" @change="commitSpacing">
        </label>
        <button type="button" class="mm-reset-background" @click="applySpacingPreset">恢复默认间距</button>
      </section>
      <section class="mm-style-section">
        <h3>预置主题风格</h3>
        <div class="mm-tier-style-fields">
          <label v-for="tier in [{ id: 'root', label: '中心主题' }, { id: 'branch', label: '分支主题' }, { id: 'child', label: '子主题' }] as const" :key="tier.id" class="mm-tier-style-field">
            {{ tier.label }}
            <select :value="tierPresetIds[tier.id]" :aria-label="`${tier.label}样式模板`" @change="setTierPreset(tier.id, ($event.target as HTMLSelectElement).value)">
              <option value="">不应用模板</option>
              <option v-for="preset in nodeStylePresets" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
            </select>
            <button type="button" :disabled="!tierPresetIds[tier.id]" :aria-label="`应用${tier.label}模板`" @click="applyTierPreset(tier.id)">应用</button>
          </label>
        </div>
        <label class="mm-bulk-level-field">批量应用到
          <select v-model="bulkStyleLevel" aria-label="批量应用层级">
            <option value="root">所有中心主题</option>
            <option value="branch">所有分支主题</option>
            <option value="child">所有子主题</option>
          </select>
        </label>
        <div class="mm-node-style-presets">
          <button v-for="preset in nodeStylePresets" :key="preset.id" type="button" :title="`应用${preset.name}到所选节点`" @click="applyNodeStylePreset(preset)">
            <span :style="{ background: preset.fill, color: preset.color, borderColor: preset.edgeColor, borderRadius: preset.shape === 'pill' ? '999px' : preset.shape === 'rect' ? '0' : '5px' }">Aa</span>
            <small>{{ preset.name }}</small>
          </button>
        </div>
        <label class="mm-bulk-preset-field">批量预设
          <select v-model="bulkPresetId" aria-label="批量主题样式预设">
            <option value="" disabled>选择风格</option>
            <option v-for="preset in nodeStylePresets" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
          </select>
          <button type="button" class="mm-bulk-apply" :disabled="!bulkPresetId" @click="applySelectedBulkPreset">应用到所选层级</button>
        </label>
        <button type="button" class="mm-custom-style-toggle" :aria-expanded="customStyleOpen" @click="customStyleOpen = !customStyleOpen">{{ customStyleOpen ? '收起自定义' : '自定义风格' }}</button>
        <button type="button" class="mm-custom-style-toggle" :aria-expanded="advancedStyleOpen" @click="advancedStyleOpen = !advancedStyleOpen">{{ advancedStyleOpen ? '收起高级样式' : '节点边框、连接线、概要与外框' }}</button>
      </section>
    </template>

    <template v-if="activePanelTab === 'topic' && styleTarget.kind === 'topic' && activeTopic && customStyleOpen">
      <section class="mm-style-section">
        <h3>自定义节点样式</h3>
        <label class="mm-style-field">填充颜色
          <input type="color" :value="activeTopic.style?.fill || '#ffffff'" @input="updateTopicStyle({ fill: ($event.target as HTMLInputElement).value })">
        </label>
        <label class="mm-style-field">文字颜色
          <input type="color" :value="activeTopic.style?.color || '#20242b'" @input="updateTopicStyle({ color: ($event.target as HTMLInputElement).value })">
        </label>
        <label class="mm-style-field">节点形状
          <select :value="activeTopic.style?.shape || 'rounded'" @change="updateTopicStyle({ shape: ($event.target as HTMLSelectElement).value === 'rounded' ? '' : ($event.target as HTMLSelectElement).value })">
            <option value="rounded">圆角矩形</option>
            <option value="rect">直角矩形</option>
            <option value="pill">胶囊</option>
          </select>
        </label>
        <label class="mm-style-field">边框颜色
          <input type="color" :value="activeTopic.style?.borderColor || '#c7d2e2'" @input="updateTopicStyle({ borderColor: ($event.target as HTMLInputElement).value })">
        </label>
        <label class="mm-style-field">边框粗细
          <input type="number" min="0" max="8" step="0.5" :value="activeTopic.style?.borderWidth || '1.4'" @change="updateTopicStyle({ borderWidth: ($event.target as HTMLInputElement).value })">
        </label>
        <label class="mm-style-field">连接线颜色
          <input type="color" :value="activeTopic.style?.edgeColor || '#b7c4d8'" @input="updateTopicStyle({ edgeColor: ($event.target as HTMLInputElement).value })">
        </label>
        <label class="mm-style-field">连接线粗细
          <input type="number" min="0.5" max="8" step="0.5" :value="activeTopic.style?.edgeWidth || '1.6'" @change="updateTopicStyle({ edgeWidth: ($event.target as HTMLInputElement).value })">
        </label>
        <label class="mm-style-field">父子线型
          <select :value="activeTopic.style?.edgeStyle || 'solid'" @change="updateTopicStyle({ edgeStyle: ($event.target as HTMLSelectElement).value as MindMapLineStyle })">
            <option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option>
          </select>
        </label>
        <label class="mm-style-field">起始箭头
          <select :value="activeTopic.style?.edgeStartArrow || 'none'" @change="updateTopicStyle({ edgeStartArrow: ($event.target as HTMLSelectElement).value as MindMapArrowStyle })">
            <option value="none">无</option><option value="arrow">箭头</option>
          </select>
        </label>
        <label class="mm-style-field">结束箭头
          <select :value="activeTopic.style?.edgeEndArrow || 'none'" @change="updateTopicStyle({ edgeEndArrow: ($event.target as HTMLSelectElement).value as MindMapArrowStyle })">
            <option value="none">无</option><option value="arrow">箭头</option>
          </select>
        </label>
        <button type="button" class="mm-reset-background" @click="updateTopicStyle({ fill: '', color: '', shape: '' })">恢复主题样式</button>
      </section>
    </template>

    <template v-if="activePanelTab === 'topic' && styleTarget.kind === 'topic' && activeTopic && advancedStyleOpen">
      <section class="mm-style-section">
        <h3>概要与外框</h3>
        <label class="mm-style-field">概要文字
          <input type="text" :value="activeTopic.summary || ''" placeholder="输入概要" @change="setTopicSummary(($event.target as HTMLInputElement).value)">
        </label>
        <label class="mm-style-field">外框标签
          <input type="text" :value="activeTopic.boundary?.label || ''" placeholder="可选标签" @change="setTopicBoundaryLabel(($event.target as HTMLInputElement).value)">
        </label>
        <label class="mm-style-field">外框颜色
          <input type="color" :value="activeTopic.boundary?.color || '#4a90e2'" @input="setTopicBoundaryColor(($event.target as HTMLInputElement).value)">
        </label>
        <button type="button" class="mm-reset-background" @click="clearTopicExtras">清除概要与外框</button>
      </section>
    </template>

    <section v-if="styleTarget.kind === 'edge'" class="mm-style-section">
      <h3>父子连接线</h3>
      <label class="mm-style-field">线条颜色
        <input type="color" :value="document.topics[styleTarget.childId]?.style?.edgeColor || '#7c8798'" @input="updateEdgeColor(($event.target as HTMLInputElement).value)">
      </label>
      <label class="mm-style-field">线型
        <select aria-label="线型" :value="document.topics[styleTarget.childId]?.style?.edgeStyle || 'solid'" @change="updateEdgeStyle({ edgeStyle: ($event.target as HTMLSelectElement).value as MindMapLineStyle })">
          <option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option>
        </select>
      </label>
      <label class="mm-style-field">起始箭头
        <select aria-label="起始箭头" :value="document.topics[styleTarget.childId]?.style?.edgeStartArrow || 'none'" @change="updateEdgeStyle({ edgeStartArrow: ($event.target as HTMLSelectElement).value as MindMapArrowStyle })">
          <option value="none">无</option><option value="arrow">箭头</option>
        </select>
      </label>
      <label class="mm-style-field">结束箭头
        <select aria-label="结束箭头" :value="document.topics[styleTarget.childId]?.style?.edgeEndArrow || 'none'" @change="updateEdgeStyle({ edgeEndArrow: ($event.target as HTMLSelectElement).value as MindMapArrowStyle })">
          <option value="none">无</option><option value="arrow">箭头</option>
        </select>
      </label>
      <button type="button" class="mm-reset-background" @click="resetEdgeColor">恢复主题配色</button>
    </section>

    <section v-else-if="styleTarget.kind === 'relation'" class="mm-style-section">
      <h3>独立关系线</h3>
      <p v-if="activeRelation">{{ document?.topics[activeRelation.sourceTopicId]?.text }} → {{ document?.topics[activeRelation.targetTopicId]?.text }}</p>
      <label class="mm-style-field">线型
        <select aria-label="线型" :value="activeRelation?.lineStyle || 'dashed'" @change="updateRelationStyle({ lineStyle: ($event.target as HTMLSelectElement).value as MindMapLineStyle })">
          <option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option>
        </select>
      </label>
      <label class="mm-style-field">起始箭头
        <select aria-label="起始箭头" :value="activeRelation?.startArrow || 'none'" @change="updateRelationStyle({ startArrow: ($event.target as HTMLSelectElement).value as MindMapArrowStyle })">
          <option value="none">无</option><option value="arrow">箭头</option>
        </select>
      </label>
      <label class="mm-style-field">结束箭头
        <select aria-label="结束箭头" :value="activeRelation?.endArrow || 'arrow'" @change="updateRelationStyle({ endArrow: ($event.target as HTMLSelectElement).value as MindMapArrowStyle })">
          <option value="none">无</option><option value="arrow">箭头</option>
        </select>
      </label>
    </section>
  </aside>
</template>

<style scoped>
.mm-style-panel { position: sticky; top: 0; align-self: stretch; box-sizing: border-box; display: flex; flex-direction: column; width: 316px; height: 100%; min-height: 0; flex: 0 0 316px; min-width: 260px; margin: 0; overflow: auto; border-left: 1px solid var(--border-soft); background: var(--panel-elevated); color: var(--text-primary); font-family: var(--font-ui); }
.mm-style-sticky-header { position: sticky; top: 0; z-index: 3; flex: 0 0 auto; background: var(--panel-elevated); }
.mm-style-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 18px 14px; border-bottom: 1px solid var(--border-soft); background: var(--panel-elevated); }
.mm-style-header h2, .mm-style-section h3 { margin: 0; font-size: 15px; font-weight: 700; }
.mm-style-header p { margin: 5px 0 0; color: var(--text-muted); font-size: 12px; }
.mm-style-close { width: 30px; height: 30px; border: 0; background: transparent; color: var(--text-secondary); font-size: 28px; line-height: 1; cursor: pointer; }
.mm-style-close:hover { color: var(--text-primary); background: var(--surface-hover); }
.mm-style-tabs { display: flex; flex: 0 0 auto; border-bottom: 1px solid var(--border-soft); padding: 0 18px; background: var(--panel-elevated); }
.mm-style-tabs button { flex: 1; padding: 10px 4px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text-secondary); font: 13px var(--font-ui); cursor: pointer; }
.mm-style-tabs button.is-active { color: var(--text-primary); border-bottom-color: var(--accent-brand); }
.mm-style-tabs button:disabled { opacity: .5; cursor: default; }
.mm-spacing-field { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin: 14px 0; font-size: 13px; }
.mm-spacing-field input { grid-column: 1 / -1; width: 100%; accent-color: var(--accent-brand); }
.mm-node-style-presets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.mm-tier-style-fields { display: grid; gap: 6px; margin-bottom: 12px; }
.mm-tier-style-field { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; align-items: center; gap: 6px; font-size: 12px; }
.mm-tier-style-field select, .mm-tier-style-field button { min-width: 0; height: 30px; padding: 0 6px; border: 1px solid var(--border-soft); border-radius: 4px; background: var(--panel-base); color: var(--text-primary); }
.mm-tier-style-field button { cursor: pointer; }
.mm-tier-style-field button:disabled { opacity: .5; cursor: default; }
.mm-node-style-presets button { display: grid; gap: 6px; padding: 8px; border: 1px solid var(--border-soft); border-radius: 5px; background: var(--panel-base); color: var(--text-primary); cursor: pointer; }
.mm-node-style-presets button:hover { border-color: var(--accent-brand); }
.mm-node-style-presets button span { display: grid; place-items: center; height: 32px; border: 1px solid; font-weight: 600; }
.mm-node-style-presets small { font-size: 12px; }
.mm-custom-style-toggle { width: 100%; margin-top: 10px; padding: 8px; border: 1px solid var(--border-soft); border-radius: 4px; background: var(--panel-base); color: var(--text-primary); cursor: pointer; }
.mm-style-section { padding: 16px 18px; border-bottom: 1px solid var(--border-soft); }
.mm-style-section h3 { margin-bottom: 12px; color: var(--text-secondary); }
.mm-layout-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.mm-layout-card { display: grid; justify-items: start; gap: 7px; min-height: 92px; padding: 10px; border: 1px solid var(--border-soft); border-radius: var(--radius-card); background: var(--panel-base); color: var(--text-primary); font: 12px var(--font-ui); cursor: pointer; }
.mm-layout-card:hover { background: var(--surface-hover); }
.mm-layout-card.is-active { border-color: var(--accent-brand); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-brand) 44%, transparent); }
.mm-layout-preview, .mm-theme-swatch { position: relative; display: block; width: 100%; height: 44px; overflow: hidden; border-radius: 4px; background: color-mix(in srgb, var(--surface-muted) 72%, transparent); }
.mm-layout-preview i, .mm-layout-preview b, .mm-layout-preview em { position: absolute; display: block; height: 5px; border-radius: 4px; background: var(--accent-brand); content: ''; }
.mm-layout-preview i { width: 22px; left: calc(50% - 11px); top: 20px; }
.mm-layout-preview b { width: 17px; left: 8px; top: 8px; box-shadow: 0 14px 0 var(--accent-brand), 0 28px 0 var(--accent-brand); }
.mm-layout-preview em { width: 17px; right: 8px; top: 8px; box-shadow: 0 14px 0 var(--accent-brand), 0 28px 0 var(--accent-brand); }
.mm-layout-preview.is-logic b, .mm-layout-preview.is-tree b { display: none; }
.mm-layout-preview.is-logic i, .mm-layout-preview.is-tree i { left: 10px; }
.mm-layout-preview.is-org i { top: 7px; }
.mm-layout-preview.is-org b { left: calc(50% - 8px); top: 24px; box-shadow: -34px 12px 0 var(--accent-brand), 34px 12px 0 var(--accent-brand); }
.mm-layout-preview.is-org em { display: none; }
.mm-theme-picker { position: relative; }
.mm-theme-thumbnails { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.mm-theme-thumbnail { height: 64px; padding: 5px; overflow: hidden; border: 1px solid var(--border-soft); border-radius: 5px; background: var(--panel-base); cursor: pointer; }
.mm-theme-thumbnail:hover { border-color: var(--accent-brand); }
.mm-theme-thumbnail.is-active { border: 2px solid var(--accent-brand); }
.mm-mini-map { position: relative; display: block; width: 100%; height: 100%; background: var(--panel-base); }
.mm-mini-node, .mm-mini-root { position: absolute; display: block; z-index: 1; width: 22%; height: 9px; border: 1px solid var(--mini-edge); border-radius: 3px; background: var(--mini-node); }
.mm-mini-root { top: 25px; left: 40%; width: 21%; height: 14px; border: 0; border-radius: 4px; background: var(--mini-root); }
.mm-mini-node-left { top: 13px; left: 9%; }
.mm-mini-node-right { top: 13px; right: 9%; }
.mm-mini-node-leaf-left { top: 43px; left: 9%; height: 7px; }
.mm-mini-node-leaf-right { top: 43px; right: 9%; height: 7px; }
.mm-mini-edge { position: absolute; top: 31px; width: 33%; border-top: 1px solid var(--mini-edge); }
.mm-mini-edge-left { left: 9%; transform: rotate(18deg); transform-origin: right; }
.mm-mini-edge-right { right: 9%; transform: rotate(-18deg); transform-origin: left; }
.mm-bulk-level-field, .mm-bulk-preset-field { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 8px 0; font-size: 12px; }
.mm-bulk-level-field select, .mm-bulk-preset-field select { min-width: 130px; height: 30px; padding: 0 7px; border: 1px solid var(--border-soft); border-radius: 4px; background: var(--panel-base); color: var(--text-primary); }
.mm-bulk-apply { min-height: 30px; padding: 0 9px; border: 1px solid var(--border-soft); border-radius: 4px; background: var(--panel-base); color: var(--text-primary); cursor: pointer; }
.mm-bulk-apply:disabled { opacity: .5; cursor: default; }
.mm-theme-trigger { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 6px 9px; border: 1px solid var(--border-soft); border-radius: 6px; background: var(--panel-base); color: var(--text-primary); font: 13px var(--font-ui); text-align: left; cursor: pointer; }
.mm-theme-trigger:hover { background: var(--surface-hover); }
.mm-theme-swatch--trigger, .mm-theme-swatch--option { display: flex; flex: 0 0 auto; height: 24px; overflow: hidden; border-radius: 0; }
.mm-theme-swatch--trigger { width: 132px; }
.mm-theme-swatch--option { width: 112px; }
.mm-theme-swatch i { display: block; flex: 1 1 0; min-width: 0; height: 100%; }
.mm-theme-current-name, .mm-theme-option-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-theme-current-name { flex: 1; }
.mm-theme-chevron { color: var(--text-muted); font-size: 16px; line-height: 1; }
.mm-theme-menu { position: absolute; z-index: 20; top: calc(100% + 4px); right: 0; left: 0; max-height: 290px; overflow: auto; padding: 4px; border: 1px solid var(--border-soft); border-radius: 6px; background: var(--panel-elevated); box-shadow: var(--shadow-soft); }
.mm-theme-option { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 34px; padding: 4px 6px; border: 0; border-radius: 4px; background: transparent; color: var(--text-primary); font: 12px var(--font-ui); text-align: left; cursor: pointer; }
.mm-theme-option:hover, .mm-theme-option.is-active { background: var(--surface-hover); }
.mm-theme-check { display: grid; flex: 0 0 16px; place-items: center; color: var(--text-secondary); }
.mm-theme-check--empty { visibility: hidden; }
.mm-theme-option-name { flex: 1; }
.mm-background-row { display: flex; align-items: center; gap: 8px; }
.mm-background-row input[type='color'] { width: 34px; height: 32px; padding: 2px; border: 1px solid var(--border-soft); border-radius: var(--radius-control); background: var(--panel-base); }
.mm-background-text { flex: 1; min-width: 0; height: 32px; padding: 0 8px; border: 1px solid var(--border-soft); border-radius: var(--radius-control); background: var(--panel-base); color: var(--text-primary); font: 12px var(--font-ui); }
.mm-reset-background { border: 0; background: transparent; color: var(--accent-brand); font: 12px var(--font-ui); cursor: pointer; }
.mm-background-presets { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 10px; }
.mm-background-presets button { width: 24px; height: 24px; border: 2px solid var(--border-soft); border-radius: 4px; cursor: pointer; }
.mm-view-section { display: grid; gap: 11px; }
.mm-view-section h3 { margin-bottom: 0; }
.mm-view-section label { color: var(--text-primary); font-size: 13px; cursor: pointer; }
.mm-style-field { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px 0; color: var(--text-primary); font-size: 13px; }
.mm-style-field input[type='color'] { width: 36px; height: 30px; padding: 2px; border: 1px solid var(--border-soft); border-radius: var(--radius-control); background: var(--panel-base); }
.mm-style-field select { min-width: 132px; height: 30px; padding: 0 8px; border: 1px solid var(--border-soft); border-radius: var(--radius-control); background: var(--panel-base); color: var(--text-primary); }
</style>
