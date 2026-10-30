/**
 * MindmapStage 组件契约测试：
 * 画布渲染、键盘新增/改名/删除确认/撤销、change 事件回写，以及 UX-3B 后
 * 「右侧大纲 / 属性面板外移」的接线（Stage 只保留画布 + 工作表条）。
 *
 * 说明：大纲与属性面板的渲染/编辑细节见 MindmapRightPanel.test.ts；
 * 这里验证 Stage 不再内嵌面板、开关只驱动 store 两列显隐、命令仍走 change。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MindmapStage from '@/components/editor/mindmap/MindmapStage.vue';
import { useMindmapStore } from '@/stores/mindmap';
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';
import type { MindMapDocument } from '@/types/mindmap';

function treeDocument(): MindMapDocument {
  const doc = createEmptyMindMapDocument('组件测试');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: ['a1'], text: 'A' };
  doc.topics.a1 = { id: 'a1', parentId: 'a', childIds: [], text: 'A1' };
  doc.topics.b = { id: 'b', parentId: root, childIds: [], text: 'B' };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['a', 'b'];
  return doc;
}

function mountStage(content: string) {
  return mount(MindmapStage, {
    props: {
      tabId: 'tab-mm',
      documentJson: content,
      fileName: 'test.taumap',
      documentKind: 'mindmap' as const,
    },
  });
}

/** Stage 根节点（键盘事件统一在这里派发）。 */
function stageRoot(wrapper: ReturnType<typeof mountStage>) {
  return wrapper.find('[data-testid="mindmap-stage"]');
}

/**
 * Stage 通过 defineExpose 暴露给外壳（全局工具栏，UX-3C）的方法子集。
 *
 * 工具栏按钮已外移到 App 顶部 Toolbar，Stage 里不再有 mm-* 按钮，
 * 因此原「点按钮」的用例改为直接调用这些方法，验证的仍是同一套业务行为。
 */
type StageExpose = {
  addChild: () => void;
  addSibling: () => void;
  startRename: (topicId: string) => void;
  duplicateSelected: () => void;
  requestDelete: () => void;
  moveSelected: (offset: -1 | 1) => void;
  doUndo: () => void;
  doRedo: () => void;
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  runLayoutCommand: (mode: 'mindmap' | 'logic' | 'tree' | 'org') => boolean;
  applyTheme: (themeId: string) => boolean;
  requestReset: () => void;
  handleImportPick: () => Promise<void>;
  openExportDialog: () => void;
  handlePrint: () => Promise<void>;
  toggleOutlinePanel: () => boolean;
  togglePropertiesPanel: () => boolean;
};

function stageExpose(wrapper: ReturnType<typeof mountStage>): StageExpose {
  return wrapper.vm as unknown as StageExpose;
}

describe('MindmapStage 阶段 1', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('渲染画布节点并默认选中中心主题', () => {
    const doc = treeDocument();
    const wrapper = mountStage(serializeMindMapDocument(doc));
    expect(wrapper.findAll('.mm-node')).toHaveLength(4);
    const selected = wrapper.find('.mm-node.is-selected');
    expect(selected.exists()).toBe(true);
    expect(selected.attributes('data-node-id')).toBe(doc.rootTopicId);
  });

  it('Tab 添加子主题并 emit change', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await stageRoot(wrapper).trigger('keydown', { key: 'Tab' });

    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    const json = emitted![emitted!.length - 1]![0] as string;
    expect(JSON.parse(json).topics).toBeTypeOf('object');
    expect(wrapper.findAll('.mm-node')).toHaveLength(5);
  });

  it('F2 进入画布内联改名并提交后 emit change', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await stageRoot(wrapper).trigger('keydown', { key: 'F2' });
    await wrapper.vm.$nextTick();

    const editor = wrapper.find('[data-testid="mm-inline-editor"]');
    expect(editor.exists()).toBe(true);
    await editor.setValue('中心新名');
    await editor.trigger('keydown', { key: 'Enter' });

    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    const json = emitted![emitted!.length - 1]![0] as string;
    expect(json).toContain('中心新名');
  });

  it('删除含子树的节点先弹确认，确认后才 emit change', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));

    // 画布选中 A（有 1 个子节点）
    await wrapper.find('.mm-node[data-node-id="a"]').trigger('click');
    await stageRoot(wrapper).trigger('keydown', { key: 'Delete' });

    expect(wrapper.find('[data-testid="mindmap-confirm"]').exists()).toBe(true);
    expect(wrapper.emitted('change')).toBeFalsy();

    await wrapper.find('[data-testid="mm-confirm-ok"]').trigger('click');
    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    const json = emitted![emitted!.length - 1]![0] as string;
    const parsed = JSON.parse(json) as MindMapDocument;
    expect(parsed.topics.a).toBeUndefined();
    expect(parsed.topics.a1).toBeUndefined();
  });

  it('Ctrl+Z 撤销后 emit 回退后的内容', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));

    await stageRoot(wrapper).trigger('keydown', { key: 'Tab' });
    expect(wrapper.findAll('.mm-node')).toHaveLength(5);

    await stageRoot(wrapper).trigger('keydown', { key: 'z', ctrlKey: true });
    expect(wrapper.findAll('.mm-node')).toHaveLength(4);

    const emitted = wrapper.emitted('change')!;
    const lastJson = emitted[emitted.length - 1]![0] as string;
    expect(JSON.parse(lastJson).topics.a1).toBeDefined();
  });

  it('外部格式只显示提示，不进入编辑画布', () => {
    const external = mount(MindmapStage, {
      props: {
        tabId: 'tab-x',
        documentJson: 'PK fake',
        fileName: 'plan.xmind',
        documentKind: 'mindmap-external' as const,
      },
    });
    expect(external.find('[data-testid="mindmap-external-notice"]').exists()).toBe(true);
    expect(external.find('[data-testid="mindmap-canvas"]').exists()).toBe(false);
  });

  it('损坏 JSON 显示安全失败提示，不渲染画布', () => {
    const wrapper = mountStage('{ broken json');
    expect(wrapper.find('[data-testid="mindmap-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mindmap-canvas"]').exists()).toBe(false);
  });

  it('阶段 2：画布渲染，大纲/属性面板已外移（Stage 内不再出现）', () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    expect(wrapper.find('[data-testid="mindmap-canvas"]').exists()).toBe(true);
    expect(wrapper.findAll('.mm-node')).toHaveLength(4);
    // UX-3B：面板由 App 外壳右侧的 MindmapRightPanel 渲染
    expect(wrapper.find('[data-testid="mindmap-outline"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mm-props"]').exists()).toBe(false);
  });

  it('阶段 2：画布点击选中同步 store 选中态', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const store = useMindmapStore();
    const nodeB = wrapper.find('.mm-node[data-node-id="b"]');
    expect(nodeB.exists()).toBe(true);
    await nodeB.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mm-node.is-selected').attributes('data-node-id')).toBe('b');
    expect(store.selectedTopicId).toBe('b');
  });

  it('阶段 2：视口操作不触发 change 且不影响 dirty', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mindmap-canvas"]').trigger('wheel', {
      deltaY: -120,
      clientX: 200,
      clientY: 200,
    });
    expect(wrapper.emitted('change')).toBeFalsy();
  });

  it('UX-3B：大纲/属性开关只驱动 store 两列显隐，不写文档', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const stage = stageExpose(wrapper);
    const store = useMindmapStore();
    expect(store.outlineVisible).toBe(true);
    expect(store.propertiesVisible).toBe(false);

    // 当前大纲已开 → 再 toggle 一次收起（开关在全局 Toolbar，这里直接调暴露方法）
    expect(stage.toggleOutlinePanel()).toBe(false);
    expect(store.outlineVisible).toBe(false);

    // 属性列独立打开（不影响已收起的大纲列）
    expect(stage.togglePropertiesPanel()).toBe(true);
    expect(store.propertiesVisible).toBe(true);
    expect(store.outlineVisible).toBe(false);

    // 大纲列可再打开，两列互不影响
    expect(stage.toggleOutlinePanel()).toBe(true);
    expect(store.outlineVisible).toBe(true);
    expect(store.propertiesVisible).toBe(true);

    // 面板开关是视图偏好：不产生 change
    expect(wrapper.emitted('change')).toBeFalsy();
  });

  it('UX-3B：Ctrl+Alt+O / Ctrl+Alt+P 切换对应列（各自独立）', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const store = useMindmapStore();

    await stageRoot(wrapper).trigger('keydown', { key: 'o', ctrlKey: true, altKey: true });
    expect(store.outlineVisible).toBe(false);
    expect(store.propertiesVisible).toBe(false);

    await stageRoot(wrapper).trigger('keydown', { key: 'p', ctrlKey: true, altKey: true });
    expect(store.propertiesVisible).toBe(true);
    expect(store.outlineVisible).toBe(false);

    await stageRoot(wrapper).trigger('keydown', { key: 'o', ctrlKey: true, altKey: true });
    expect(store.outlineVisible).toBe(true);
    expect(store.propertiesVisible).toBe(true);

    await stageRoot(wrapper).trigger('keydown', { key: 'p', ctrlKey: true, altKey: true });
    expect(store.propertiesVisible).toBe(false);

    expect(wrapper.emitted('change')).toBeFalsy();
  });

  it('阶段 2：画布折叠按钮隐藏子节点并 emit change', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const nodeA = wrapper.find('.mm-node[data-node-id="a"]');
    await nodeA.find('.mm-toggle').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mm-node[data-node-id="a1"]').exists()).toBe(false);
    expect(wrapper.emitted('change')).toBeTruthy();
  });
});

/* --------------------------- 阶段 4A：结构布局切换 --------------------------- */

describe('MindmapStage 阶段 4A', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** 取最近一次 change 事件里的文档。 */
  function lastChangedDocument(wrapper: ReturnType<typeof mountStage>): MindMapDocument {
    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    return JSON.parse(emitted![emitted!.length - 1]![0] as string) as MindMapDocument;
  }

  it('UX-3C：Stage 不再内嵌工具栏，布局/主题/视口等方法经 defineExpose 暴露', () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    // 工具栏整块已外移到全局 Toolbar，Stage 里不应再出现
    expect(wrapper.find('[data-testid="mindmap-toolbar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mm-layout-mindmap"]').exists()).toBe(false);
    // 统计条保留（E2E-MM-005/007 依赖 .mm-stats）
    expect(wrapper.find('.mm-stats').exists()).toBe(true);

    const stage = stageExpose(wrapper);
    for (const method of [
      'addChild',
      'addSibling',
      'startRename',
      'duplicateSelected',
      'requestDelete',
      'moveSelected',
      'doUndo',
      'doRedo',
      'fitView',
      'zoomIn',
      'zoomOut',
      'resetView',
      'runLayoutCommand',
      'applyTheme',
      'requestReset',
      'handleImportPick',
      'openExportDialog',
      'handlePrint',
      'toggleOutlinePanel',
      'togglePropertiesPanel',
    ] as const) {
      expect(typeof stage[method]).toBe('function');
    }
  });

  it('调用 runLayoutCommand(org)：emit change 且布局写入文档', () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    expect(stageExpose(wrapper).runLayoutCommand('org')).toBe(true);

    expect(lastChangedDocument(wrapper).layoutMode).toBe('org');
    expect(useMindmapStore().document?.layoutMode).toBe('org');
  });

  it('切换为 org 后画布节点数不变，连线变为竖直方向', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    expect(wrapper.findAll('.mm-edge[data-orientation="horizontal"]')).toHaveLength(3);

    stageExpose(wrapper).runLayoutCommand('org');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.mm-node')).toHaveLength(4);
    expect(wrapper.findAll('.mm-edge[data-orientation="vertical"]')).toHaveLength(3);
    expect(wrapper.findAll('.mm-edge[data-orientation="horizontal"]')).toHaveLength(0);
  });

  it('切换到当前模式不产生 change（幂等）', () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    expect(stageExpose(wrapper).runLayoutCommand('mindmap')).toBe(false);
    expect(wrapper.emitted('change')).toBeFalsy();
  });

  it('布局切换可通过 Ctrl+Z 撤销并回写文档', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));

    stageExpose(wrapper).runLayoutCommand('logic');
    expect(lastChangedDocument(wrapper).layoutMode).toBe('logic');

    await stageRoot(wrapper).trigger('keydown', { key: 'z', ctrlKey: true });
    expect(lastChangedDocument(wrapper).layoutMode).toBe('mindmap');
    expect(useMindmapStore().document?.layoutMode).toBe('mindmap');

    // 重做回到 logic
    await stageRoot(wrapper).trigger('keydown', { key: 'z', ctrlKey: true, shiftKey: true });
    expect(lastChangedDocument(wrapper).layoutMode).toBe('logic');
    expect(useMindmapStore().document?.layoutMode).toBe('logic');
  });

  it('切换主题（applyTheme）：emit change、画布换色、可撤销', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const canvas = wrapper.find('[data-testid="mindmap-canvas"]');
    expect(canvas.attributes('data-theme-id')).toBe('default');

    expect(stageExpose(wrapper).applyTheme('ocean')).toBe(true);
    await wrapper.vm.$nextTick();

    expect(lastChangedDocument(wrapper).themeId).toBe('ocean');
    expect(wrapper.find('[data-testid="mindmap-canvas"]').attributes('data-theme-id')).toBe('ocean');
    expect(wrapper.find('[data-testid="mindmap-canvas"]').attributes('style')).toContain('--mindmap-node-bg');

    await stageRoot(wrapper).trigger('keydown', { key: 'z', ctrlKey: true });
    await wrapper.vm.$nextTick();
    expect(lastChangedDocument(wrapper).themeId).toBe('default');
    expect(wrapper.find('[data-testid="mindmap-canvas"]').attributes('data-theme-id')).toBe('default');
  });

  it('主题切换是幂等的：应用当前主题不产生 change', () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    expect(stageExpose(wrapper).applyTheme('default')).toBe(false);
    expect(wrapper.emitted('change')).toBeFalsy();
  });

  it('视口方法可经暴露接口调用且不写文档', () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const stage = stageExpose(wrapper);
    stage.fitView();
    stage.zoomIn();
    stage.zoomOut();
    stage.resetView();
    expect(wrapper.emitted('change')).toBeFalsy();
  });
});

/* ---------------------- 阶段 4E：多工作表 / 多中心主题 ---------------------- */

describe('MindmapStage 阶段 4E', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** 取最近一次 change 事件里的文档。 */
  function lastDocument(wrapper: ReturnType<typeof mountStage>): MindMapDocument {
    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    return JSON.parse(emitted![emitted!.length - 1]![0] as string) as MindMapDocument;
  }

  /** 两张工作表的文档：工作表 1 = treeDocument 的根，工作表 2 = 独立根 + 一个子节点。 */
  function multiSheetDocument(): MindMapDocument {
    const doc = treeDocument();
    doc.topics.sheet2 = { id: 'sheet2', parentId: null, childIds: ['s2a'], text: '第二张' };
    doc.topics.s2a = { id: 's2a', parentId: 'sheet2', childIds: [], text: 'S2A' };
    doc.sheets = [
      { id: 'sheet-1', title: '工作表 1', rootTopicId: doc.rootTopicId },
      { id: 'sheet-2', title: '第二张', rootTopicId: 'sheet2' },
    ];
    return doc;
  }

  it('切换条渲染：旧文档兜底为单个工作表，仅剩一个时删除按钮禁用', () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));

    expect(wrapper.find('[data-testid="mm-sheet-bar"]').exists()).toBe(true);
    const tabs = wrapper.findAll('[data-testid^="mm-sheet-tab-"]');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.text()).toBe('工作表 1');
    expect(tabs[0]?.classes()).toContain('is-active');
    expect(tabs[0]?.attributes('aria-selected')).toBe('true');

    expect(wrapper.find('[data-testid="mm-sheet-add"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mm-sheet-remove"]').attributes('disabled')).toBeDefined();
  });

  it('点击工作表标签切换：emit change、激活态切换、画布渲染新工作表的根', async () => {
    const doc = multiSheetDocument();
    const wrapper = mountStage(serializeMindMapDocument(doc));
    expect(wrapper.find('[data-testid="mm-sheet-tab-0"]').classes()).toContain('is-active');

    await wrapper.find('[data-testid="mm-sheet-tab-1"]').trigger('click');
    await wrapper.vm.$nextTick();

    const changed = lastDocument(wrapper);
    expect(changed.rootTopicId).toBe('sheet2');
    expect(wrapper.find('[data-testid="mm-sheet-tab-1"]').classes()).toContain('is-active');
    expect(wrapper.find('[data-testid="mm-sheet-tab-0"]').classes()).not.toContain('is-active');
    // 画布只渲染当前工作表的子树（第二张：根 + 1 个子节点）
    expect(wrapper.findAll('.mm-node')).toHaveLength(2);
    expect(wrapper.find('.mm-node.is-selected').attributes('data-node-id')).toBe('sheet2');
  });

  it('切换工作表可撤销（Ctrl+Z 回到原工作表）', async () => {
    const doc = multiSheetDocument();
    const wrapper = mountStage(serializeMindMapDocument(doc));

    await wrapper.find('[data-testid="mm-sheet-tab-1"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).rootTopicId).toBe('sheet2');

    await stageRoot(wrapper).trigger('keydown', { key: 'z', ctrlKey: true });
    await wrapper.vm.$nextTick();

    expect(lastDocument(wrapper).rootTopicId).toBe(doc.rootTopicId);
    expect(wrapper.find('[data-testid="mm-sheet-tab-0"]').classes()).toContain('is-active');
  });

  it('mm-sheet-add 新增工作表：数量 +1、切到新根、emit change', async () => {
    const doc = treeDocument();
    const originalRoot = doc.rootTopicId;
    const wrapper = mountStage(serializeMindMapDocument(doc));
    expect(wrapper.findAll('[data-testid^="mm-sheet-tab-"]')).toHaveLength(1);

    await wrapper.find('[data-testid="mm-sheet-add"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('[data-testid^="mm-sheet-tab-"]')).toHaveLength(2);
    const changed = lastDocument(wrapper);
    expect(changed.sheets).toHaveLength(2);
    expect(changed.sheets?.[1]?.title).toBe('工作表 2');
    expect(changed.rootTopicId).not.toBe(originalRoot);
    // 新工作表只有中心主题本身
    expect(wrapper.findAll('.mm-node')).toHaveLength(1);
    expect(wrapper.find('[data-testid="mm-sheet-tab-1"]').classes()).toContain('is-active');
    // 已有两个工作表 → 删除按钮可用
    expect(wrapper.find('[data-testid="mm-sheet-remove"]').attributes('disabled')).toBeUndefined();
  });

  it('mm-sheet-remove 删除当前工作表：数量 -1、切回剩余工作表并 emit change', async () => {
    const doc = multiSheetDocument();
    const wrapper = mountStage(serializeMindMapDocument(doc));

    await wrapper.find('[data-testid="mm-sheet-tab-1"]').trigger('click');
    await wrapper.vm.$nextTick();

    await wrapper.find('[data-testid="mm-sheet-remove"]').trigger('click');
    await wrapper.vm.$nextTick();

    const changed = lastDocument(wrapper);
    expect(changed.sheets).toHaveLength(1);
    expect(changed.rootTopicId).toBe(doc.rootTopicId);
    expect(changed.topics.sheet2).toBeUndefined();
    expect(wrapper.findAll('[data-testid^="mm-sheet-tab-"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="mm-sheet-tab-0"]').classes()).toContain('is-active');
    expect(wrapper.find('[data-testid="mm-sheet-remove"]').attributes('disabled')).toBeDefined();
  });

  it('阶段 4：损坏/空 .taumap 可一键新建空白导图覆盖', async () => {
    const wrapper = mountStage('{ broken json');
    expect(wrapper.find('[data-testid="mindmap-error"]').exists()).toBe(true);

    const button = wrapper.find('[data-testid="mm-error-create-empty"]');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="mindmap-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mindmap-canvas"]').exists()).toBe(true);

    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    const json = JSON.parse(emitted![emitted!.length - 1]![0] as string);
    expect(json.format).toBe('tau-mindmap');
    expect(Object.keys(json.topics)).toHaveLength(1);
  });
});

/* ------------------- UX-1：右键菜单（面板 resizer 见 RightPanel 测试） ------------------- */

/** 当前文档中渲染出的右键菜单项 testid 列表。 */
function menuItemTestIds(): string[] {
  return [...document.querySelectorAll('[data-testid^="mm-context-item-"]')]
    .map((element) => element.getAttribute('data-testid') ?? '');
}

function clickMenuItem(id: string) {
  const element = document.querySelector(`[data-testid="mm-context-item-${id}"]`) as HTMLElement | null;
  if (!element) throw new Error(`右键菜单中不存在菜单项：${id}`);
  element.click();
}

describe('MindmapStage UX-1', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('画布空白右键打开空白菜单（≥4 项）并执行画布级命令', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mindmap-canvas"]').trigger('contextmenu', {
      clientX: 9999,
      clientY: 9999,
    });
    await wrapper.vm.$nextTick();

    const testIds = menuItemTestIds();
    expect(testIds.length).toBeGreaterThanOrEqual(4);
    expect(testIds).toContain('mm-context-item-add-root-child');
    expect(testIds).toContain('mm-context-item-fit-view');
    expect(testIds).toContain('mm-context-item-reset-view');

    clickMenuItem('add-root-child');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('change')).toBeTruthy();
    expect(wrapper.findAll('.mm-node')).toHaveLength(5);
    wrapper.unmount();
  });

  it('节点菜单（≥7 项）点击「新增子主题」执行命令并 emit change', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    // 右侧面板大纲行右键 → App 会把载荷转发到这里（defineExpose）
    wrapper.vm.openMindmapContextMenu({ nodeId: 'a', clientX: 200, clientY: 120 });
    await wrapper.vm.$nextTick();

    expect(document.querySelector('[data-testid="mm-context-menu"]')).toBeTruthy();
    const testIds = menuItemTestIds();
    expect(testIds.length).toBeGreaterThanOrEqual(7);
    expect(testIds).toContain('mm-context-item-add-child');
    expect(testIds).toContain('mm-context-item-rename');
    expect(testIds).toContain('mm-context-item-delete');

    clickMenuItem('add-child');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('change')).toBeTruthy();
    // 右键已把目标节点选中，新增子主题落在 a 之下
    expect(wrapper.findAll('.mm-node')).toHaveLength(5);
    expect(wrapper.find('.mm-node[data-node-id="a"]').exists()).toBe(true);
    // 执行后菜单关闭
    expect(document.querySelector('[data-testid="mm-context-menu"]')).toBeNull();
    wrapper.unmount();
  });

  it('节点菜单「折叠子主题」隐藏子树（走既有命令）', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    wrapper.vm.openMindmapContextMenu({ nodeId: 'a', clientX: 120, clientY: 90 });
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[data-testid="mm-context-item-toggle-collapse"]')).toBeTruthy();

    clickMenuItem('toggle-collapse');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mm-node[data-node-id="a1"]').exists()).toBe(false);
    expect(wrapper.emitted('change')).toBeTruthy();
    wrapper.unmount();
  });
});

/* ---------------------- UX-2：边界（boundary）/ 概要（summary） ---------------------- */

describe('MindmapStage UX-2', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** 取最近一次 change 事件里的文档。 */
  function lastDocument(wrapper: ReturnType<typeof mountStage>): MindMapDocument {
    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    return JSON.parse(emitted![emitted!.length - 1]![0] as string) as MindMapDocument;
  }

  it('节点菜单按「有无边界/概要」显示添加或清除', async () => {
    const plain = mountStage(serializeMindMapDocument(treeDocument()));
    plain.vm.openMindmapContextMenu({ nodeId: 'a', clientX: 10, clientY: 10 });
    await plain.vm.$nextTick();
    expect(document.querySelector('[data-testid="mm-context-item-add-boundary"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="mm-context-item-add-summary"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="mm-context-item-clear-boundary"]')).toBeNull();
    expect(document.querySelector('[data-testid="mm-context-item-clear-summary"]')).toBeNull();
    // 关闭菜单，避免 teleport 泄漏到后续用例
    clickMenuItem('add-summary');
    await plain.vm.$nextTick();
    plain.unmount();

    const doc = treeDocument();
    doc.topics.a = { ...doc.topics.a!, boundary: { label: '框' }, summary: '概要' };
    const wrapper = mountStage(serializeMindMapDocument(doc));
    wrapper.vm.openMindmapContextMenu({ nodeId: 'a', clientX: 10, clientY: 10 });
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[data-testid="mm-context-item-clear-boundary"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="mm-context-item-clear-summary"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="mm-context-item-add-boundary"]')).toBeNull();
    clickMenuItem('add-child');
    await wrapper.vm.$nextTick();
    wrapper.unmount();
  });

  it('菜单「添加边界…」打开右侧属性面板，不写文档', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const store = useMindmapStore();

    wrapper.vm.openMindmapContextMenu({ nodeId: 'a', clientX: 10, clientY: 10 });
    await wrapper.vm.$nextTick();
    clickMenuItem('add-boundary');
    await wrapper.vm.$nextTick();

    expect(store.propertiesVisible).toBe(true);
    expect(wrapper.emitted('change')).toBeFalsy();
    wrapper.unmount();
  });

  it('菜单「清除边界」写回文档（可撤销）且画布移除边界', async () => {
    const doc = treeDocument();
    doc.topics.a = { ...doc.topics.a!, boundary: { label: '框', color: '#2563eb' } };
    const wrapper = mountStage(serializeMindMapDocument(doc));
    expect(wrapper.findAll('[data-testid="mm-boundary"]')).toHaveLength(1);

    wrapper.vm.openMindmapContextMenu({ nodeId: 'a', clientX: 10, clientY: 10 });
    await wrapper.vm.$nextTick();
    clickMenuItem('clear-boundary');
    await wrapper.vm.$nextTick();

    expect(lastDocument(wrapper).topics.a?.boundary).toBeUndefined();
    expect(wrapper.findAll('[data-testid="mm-boundary"]')).toHaveLength(0);

    // 撤销后边界回来
    await stageRoot(wrapper).trigger('keydown', { key: 'z', ctrlKey: true });
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).topics.a?.boundary?.label).toBe('框');
    expect(wrapper.findAll('[data-testid="mm-boundary"]')).toHaveLength(1);
    wrapper.unmount();
  });
});
