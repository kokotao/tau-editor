/**
 * 阶段 4B：节点属性面板单测
 *
 * 覆盖：空节点不渲染、既有值回填、提交时字段规范化、非法链接拦截与提示、
 * 合法链接放行、关闭事件、只读模式、切换节点重置草稿。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MindmapPropertiesPanel from '@/components/editor/mindmap/MindmapPropertiesPanel.vue';

interface PanelTopic {
  id: string;
  text: string;
  notes?: string;
  link?: string;
  labels?: string[];
  /** UX-2：边界 / 概要（可选）。 */
  boundary?: { label?: string; color?: string };
  summary?: string;
}

const baseTopic: PanelTopic = {
  id: 't1',
  text: '中心主题',
  notes: '原有备注',
  link: 'https://example.com/a',
  labels: ['重点', '待办'],
};

function mountPanel(topic: PanelTopic | null, readonly = false) {
  return mount(MindmapPropertiesPanel, { props: { topic, readonly } });
}

function valueOf(wrapper: ReturnType<typeof mountPanel>, testid: string): string {
  const element = wrapper.find(`[data-testid="${testid}"]`).element as HTMLInputElement | HTMLTextAreaElement;
  return element.value;
}

describe('MindmapPropertiesPanel', () => {
  it('topic 为 null 时不渲染', () => {
    const wrapper = mountPanel(null);
    expect(wrapper.find('[data-testid="mm-props"]').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('渲染既有备注、链接与标签', () => {
    const wrapper = mountPanel(baseTopic);
    expect(wrapper.find('[data-testid="mm-props"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mm-props-topic-title"]').text()).toBe('中心主题');
    expect(valueOf(wrapper, 'mm-props-notes')).toBe('原有备注');
    expect(valueOf(wrapper, 'mm-props-link')).toBe('https://example.com/a');
    expect(valueOf(wrapper, 'mm-props-labels')).toBe('重点, 待办');
  });

  it('缺失字段回落为空值', () => {
    const wrapper = mountPanel({ id: 't2', text: '仅文本' });
    expect(valueOf(wrapper, 'mm-props-notes')).toBe('');
    expect(valueOf(wrapper, 'mm-props-link')).toBe('');
    expect(valueOf(wrapper, 'mm-props-labels')).toBe('');
  });

  it('提交时规范化备注、链接与标签（去空/去重/保序）', async () => {
    const wrapper = mountPanel({ id: 't3', text: '节点' });
    await wrapper.find('[data-testid="mm-props-notes"]').setValue('  多行备注\n第二行  ');
    await wrapper.find('[data-testid="mm-props-link"]').setValue(' https://tau.dev/doc ');
    await wrapper.find('[data-testid="mm-props-labels"]').setValue(' 重点, 待办 ,重点,, ');
    await wrapper.find('[data-testid="mm-props-apply"]').trigger('click');

    const emitted = wrapper.emitted('update');
    expect(emitted).toHaveLength(1);
    expect(emitted?.[0]?.[0]).toEqual({
      notes: '多行备注\n第二行',
      link: 'https://tau.dev/doc',
      labels: ['重点', '待办'],
    });
  });

  it('标签兼容中文逗号并允许清空', async () => {
    const wrapper = mountPanel(baseTopic);
    await wrapper.find('[data-testid="mm-props-labels"]').setValue('甲，乙，甲');
    await wrapper.find('[data-testid="mm-props-apply"]').trigger('click');
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual({
      notes: '原有备注',
      link: 'https://example.com/a',
      labels: ['甲', '乙'],
    });

    const second = mountPanel(baseTopic);
    await second.find('[data-testid="mm-props-labels"]').setValue('');
    await second.find('[data-testid="mm-props-apply"]').trigger('click');
    expect(second.emitted('update')?.[0]?.[0]).toMatchObject({ labels: [] });
  });

  it('非法链接不 emit，并显示提示', async () => {
    const wrapper = mountPanel({ id: 't4', text: '节点' });
    await wrapper.find('[data-testid="mm-props-link"]').setValue('ftp://example.com');
    await wrapper.find('[data-testid="mm-props-apply"]').trigger('click');

    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.find('[data-testid="mm-props-link-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mm-props-link-error"]').text()).toContain('http');
    expect(wrapper.find('[data-testid="mm-props-link"]').attributes('aria-invalid')).toBe('true');
  });

  it('失焦后提示非法链接，但输入过程中不提示', async () => {
    const wrapper = mountPanel({ id: 't5', text: '节点' });
    const linkInput = wrapper.find('[data-testid="mm-props-link"]');
    await linkInput.setValue('javascript:alert(1)');
    expect(wrapper.find('[data-testid="mm-props-link-error"]').exists()).toBe(false);
    await linkInput.trigger('blur');
    expect(wrapper.find('[data-testid="mm-props-link-error"]').exists()).toBe(true);
  });

  it('修正非法链接后可以正常提交', async () => {
    const wrapper = mountPanel({ id: 't6', text: '节点' });
    const linkInput = wrapper.find('[data-testid="mm-props-link"]');
    await linkInput.setValue('www.example.com');
    await wrapper.find('[data-testid="mm-props-apply"]').trigger('click');
    expect(wrapper.emitted('update')).toBeUndefined();

    await linkInput.setValue('mailto:tau@example.com');
    await wrapper.find('[data-testid="mm-props-apply"]').trigger('click');
    expect(wrapper.emitted('update')?.[0]?.[0]).toMatchObject({ link: 'mailto:tau@example.com' });
  });

  it('接受 http、https 与 mailto 三种协议', async () => {
    for (const link of ['http://a.cn', 'https://a.cn', 'mailto:a@b.cn']) {
      const wrapper = mountPanel({ id: link, text: '节点' });
      await wrapper.find('[data-testid="mm-props-link"]').setValue(link);
      await wrapper.find('[data-testid="mm-props-apply"]').trigger('click');
      expect(wrapper.emitted('update')?.[0]?.[0]).toMatchObject({ link });
    }
  });

  it('关闭按钮与 Esc 均触发 close 事件', async () => {
    const wrapper = mountPanel(baseTopic);
    await wrapper.find('[data-testid="mm-props-close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

    await wrapper.find('[data-testid="mm-props"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(2);
  });

  it('只读模式禁用输入且不显示提交按钮', () => {
    const wrapper = mountPanel(baseTopic, true);
    expect(wrapper.find('[data-testid="mm-props-notes"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="mm-props-link"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="mm-props-labels"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="mm-props-apply"]').exists()).toBe(false);
  });

  it('切换节点时重置草稿，回到原节点恢复原值', async () => {
    const wrapper = mountPanel(baseTopic);
    await wrapper.find('[data-testid="mm-props-notes"]').setValue('临时输入');
    expect(valueOf(wrapper, 'mm-props-notes')).toBe('临时输入');

    await wrapper.setProps({ topic: { id: 't9', text: '另一个节点', notes: '新备注' } });
    expect(valueOf(wrapper, 'mm-props-notes')).toBe('新备注');
    expect(valueOf(wrapper, 'mm-props-link')).toBe('');
    expect(wrapper.find('[data-testid="mm-props-topic-title"]').text()).toBe('另一个节点');

    await wrapper.setProps({ topic: baseTopic });
    expect(valueOf(wrapper, 'mm-props-notes')).toBe('原有备注');
    expect(valueOf(wrapper, 'mm-props-labels')).toBe('重点, 待办');
  });

  it('受控组件不自行修改 props.topic', async () => {
    const topic = { ...baseTopic, labels: [...(baseTopic.labels ?? [])] };
    const wrapper = mountPanel(topic);
    await wrapper.find('[data-testid="mm-props-notes"]').setValue('改了');
    await wrapper.find('[data-testid="mm-props-apply"]').trigger('click');
    expect(topic.notes).toBe('原有备注');
    expect(topic.labels).toEqual(['重点', '待办']);
  });
});

/* ------------------ 阶段 4C：样式 / 标记 / 关系区块 ------------------ */

interface PanelRelationRow {
  id: string;
  sourceId: string;
  targetId: string;
  targetText: string;
  label?: string;
}

const styleTopic: PanelTopic & { style?: { color?: string; fill?: string; shape?: string }; markers?: string[] } = {
  id: 's1',
  text: '样式节点',
  style: { color: '#1f5fbf', fill: '#e8f1ff', shape: 'rect' },
  markers: ['star', 'flag'],
};

const relationTargets = [
  { id: 'a', text: '分支 A' },
  { id: 'b', text: '分支 B' },
];

/** 带关系与新区块 props 的面板挂载。 */
function mountRichPanel(options: {
  topic?: typeof styleTopic | null;
  readonly?: boolean;
  relations?: PanelRelationRow[];
  relationTargets?: { id: string; text: string }[];
} = {}) {
  return mount(MindmapPropertiesPanel, {
    props: {
      topic: options.topic === undefined ? styleTopic : options.topic,
      readonly: options.readonly ?? false,
      relations: options.relations ?? [],
      relationTargets: options.relationTargets ?? relationTargets,
    },
  });
}

describe('MindmapPropertiesPanel 阶段 4C', () => {
  it('样式控件回填既有 style', () => {
    const wrapper = mountRichPanel();
    expect(valueOf(wrapper, 'mm-props-style-color')).toBe('#1f5fbf');
    expect(valueOf(wrapper, 'mm-props-style-fill')).toBe('#e8f1ff');
    expect(valueOf(wrapper, 'mm-props-style-shape')).toBe('rect');
  });

  it('改变填充即发出完整 style（受控，不改文档）', async () => {
    const wrapper = mountRichPanel();
    await wrapper.find('[data-testid="mm-props-style-fill"]').setValue('#e7f7ec');
    expect(wrapper.emitted('update-style')?.[0]?.[0]).toEqual({
      color: '#1f5fbf',
      fill: '#e7f7ec',
      shape: 'rect',
    });
    expect(styleTopic.style?.fill).toBe('#e8f1ff');
  });

  it('改变文字色与形状分别发出 update-style，空值表示清除', async () => {
    const wrapper = mountRichPanel();
    await wrapper.find('[data-testid="mm-props-style-color"]').setValue('#c0451c');
    expect(wrapper.emitted('update-style')?.[0]?.[0]).toMatchObject({ color: '#c0451c' });

    await wrapper.find('[data-testid="mm-props-style-shape"]').setValue('');
    const emitted = wrapper.emitted('update-style')!;
    expect(emitted[emitted.length - 1]?.[0]).toMatchObject({ shape: '' });
  });

  it('缺失 style 时样式控件为空值（默认档）', () => {
    const wrapper = mountRichPanel({ topic: { id: 'p1', text: '无样式' } });
    expect(valueOf(wrapper, 'mm-props-style-color')).toBe('');
    expect(valueOf(wrapper, 'mm-props-style-fill')).toBe('');
    expect(valueOf(wrapper, 'mm-props-style-shape')).toBe('');
  });

  it('标记徽章按钮：未选中点击加入，已选中点击移除', async () => {
    const empty = mountRichPanel({ topic: { id: 'm1', text: '标记节点' } });
    expect(empty.find('[data-testid="mm-props-markers"]').exists()).toBe(true);
    await empty.find('[data-testid="mm-props-marker-star"]').trigger('click');
    expect(empty.emitted('update-markers')?.[0]?.[0]).toEqual(['star']);

    const selected = mountRichPanel();
    expect(selected.find('[data-testid="mm-props-marker-star"]').classes()).toContain('is-active');
    expect(selected.find('[data-testid="mm-props-marker-star"]').attributes('aria-pressed')).toBe('true');
    await selected.find('[data-testid="mm-props-marker-star"]').trigger('click');
    expect(selected.emitted('update-markers')?.[0]?.[0]).toEqual(['flag']);

    await selected.find('[data-testid="mm-props-marker-question"]').trigger('click');
    expect(selected.emitted('update-markers')?.[1]?.[0]).toEqual(['star', 'flag', 'question']);
  });

  it('内置标记按钮齐全（优先级 1-3 / 星标 / 旗标 / 疑问）', () => {
    const wrapper = mountRichPanel();
    for (const id of ['priority-1', 'priority-2', 'priority-3', 'star', 'flag', 'question']) {
      expect(wrapper.find(`[data-testid="mm-props-marker-${id}"]`).exists()).toBe(true);
    }
  });

  it('关系区块：列出现有关系并可逐条删除', async () => {
    const wrapper = mountRichPanel({
      relations: [
        { id: 'rel_1', sourceId: 's1', targetId: 'a', targetText: '分支 A', label: '依赖' },
        { id: 'rel_2', sourceId: 's1', targetId: 'b', targetText: '分支 B' },
      ],
    });
    const rows = wrapper.findAll('[data-testid="mm-props-relation"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain('依赖');
    expect(rows[0]?.text()).toContain('分支 A');

    await wrapper.find('[data-testid="mm-props-relation-remove-rel_1"]').trigger('click');
    expect(wrapper.emitted('remove-relation')?.[0]?.[0]).toEqual({ relationId: 'rel_1' });
  });

  it('无关系时显示空提示', () => {
    const wrapper = mountRichPanel();
    expect(wrapper.find('[data-testid="mm-props-relation-empty"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="mm-props-relation"]')).toHaveLength(0);
  });

  it('选择目标节点后点「添加」发出 add-relation', async () => {
    const wrapper = mountRichPanel();
    const addButton = wrapper.find('[data-testid="mm-props-relation-add"]');
    // 未选择目标时不可添加
    expect(addButton.attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="mm-props-relation-target"]').setValue('a');
    expect(wrapper.find('[data-testid="mm-props-relation-add"]').attributes('disabled')).toBeUndefined();

    await wrapper.find('[data-testid="mm-props-relation-add"]').trigger('click');
    expect(wrapper.emitted('add-relation')?.[0]?.[0]).toEqual({ targetId: 'a' });
  });

  it('候选目标为空时下拉与添加按钮不可用', () => {
    const wrapper = mountRichPanel({ relationTargets: [] });
    expect(wrapper.find('[data-testid="mm-props-relation-target"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="mm-props-relation-add"]').attributes('disabled')).toBeDefined();
  });

  it('只读模式禁用新交互（样式/标记/关系）且不发事件', async () => {
    const wrapper = mount(MindmapPropertiesPanel, {
      props: {
        topic: styleTopic,
        readonly: true,
        relations: [{ id: 'rel_1', sourceId: 's1', targetId: 'a', targetText: '分支 A' }],
        relationTargets,
      },
    });
    expect(wrapper.find('[data-testid="mm-props-style-fill"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="mm-props-marker-star"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="mm-props-relation-remove-rel_1"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="mm-props-relation-add"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="mm-props-marker-star"]').trigger('click');
    expect(wrapper.emitted('update-markers')).toBeUndefined();
  });

  it('切换节点时样式草稿重置', async () => {
    const wrapper = mountRichPanel();
    await wrapper.find('[data-testid="mm-props-style-fill"]').setValue('#e7f7ec');
    await wrapper.setProps({
      topic: { id: 'other', text: '另一个节点', style: { color: '#2f7d4f', fill: '#fff6e0', shape: 'pill' } },
    });
    expect(valueOf(wrapper, 'mm-props-style-color')).toBe('#2f7d4f');
    expect(valueOf(wrapper, 'mm-props-style-fill')).toBe('#fff6e0');
    expect(valueOf(wrapper, 'mm-props-style-shape')).toBe('pill');
  });
});

describe('MindmapPropertiesPanel 阶段 4C：非候选样式值', () => {
  it('导入的自定义样式值保留在候选中并原样回填', async () => {
    const wrapper = mountRichPanel({
      topic: {
        id: 'custom',
        text: '自定义样式',
        style: { color: '#123abc', fill: '#abcdef', shape: 'diamond' },
      },
    });
    expect(valueOf(wrapper, 'mm-props-style-color')).toBe('#123abc');
    expect(valueOf(wrapper, 'mm-props-style-fill')).toBe('#abcdef');
    expect(valueOf(wrapper, 'mm-props-style-shape')).toBe('diamond');
    // 自定义项以「自定义（…）」展示，避免误认为已被重置为默认
    const colorSelect = wrapper.find('[data-testid="mm-props-style-color"]');
    expect(colorSelect.text()).toContain('自定义（#123abc）');
  });
});

/* ---------------------- UX-1：面板右边缘拖拽调宽 ---------------------- */

/** 在 window 上派发指针事件（拖动的 move/up 由 window 监听）。 */
function dispatchPanelPointer(type: string, clientX: number) {
  window.dispatchEvent(new MouseEvent(type, {
    clientX,
    clientY: 0,
    button: 0,
    bubbles: true,
    cancelable: true,
  }));
}

describe('MindmapPropertiesPanel UX-1：面板宽度', () => {
  it('拖动 resizer 改变宽度并 clamp 在 180–420，不派发任何编辑事件', async () => {
    const wrapper = mountPanel(baseTopic);
    const panel = () => wrapper.find('[data-testid="mm-props"]');
    expect(panel().attributes('style')).toContain('width: 260px');

    await wrapper.find('[data-testid="mm-props-resizer"]').trigger('pointerdown', {
      button: 0,
      clientX: 500,
    });
    // 面板在右侧：向左拖 50px → 310px
    dispatchPanelPointer('pointermove', 450);
    await wrapper.vm.$nextTick();
    expect(panel().attributes('style')).toContain('width: 310px');

    // 继续向左 → 上限 420
    dispatchPanelPointer('pointermove', -2000);
    await wrapper.vm.$nextTick();
    expect(panel().attributes('style')).toContain('width: 420px');

    // 向右 → 下限 180
    dispatchPanelPointer('pointermove', 5000);
    await wrapper.vm.$nextTick();
    expect(panel().attributes('style')).toContain('width: 180px');

    dispatchPanelPointer('pointerup', 5000);
    // 宽度只是本地视图状态：不产生任何编辑事件
    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.emitted('update-style')).toBeUndefined();
    expect(wrapper.emitted('update-markers')).toBeUndefined();
    wrapper.unmount();
  });
});

/* ---------------------- UX-2：边界（boundary）/ 概要（summary） ---------------------- */

describe('MindmapPropertiesPanel UX-2：边界', () => {
  it('渲染边界区块并回填既有 label/color', () => {
    const wrapper = mountPanel({
      ...baseTopic,
      boundary: { label: '分组', color: '#2563eb' },
    });
    const section = wrapper.find('[data-testid="mm-props-boundary"]');
    expect(section.exists()).toBe(true);
    expect(valueOf(wrapper, 'mm-props-boundary-label')).toBe('分组');
    expect(valueOf(wrapper, 'mm-props-boundary-color')).toBe('#2563eb');
  });

  it('应用边界：trim 后 emit update-boundary', async () => {
    const wrapper = mountPanel(baseTopic);
    await wrapper.find('[data-testid="mm-props-boundary-label"]').setValue('  阶段一  ');
    await wrapper.find('[data-testid="mm-props-boundary-color"]').setValue(' #2563eb ');
    await wrapper.find('[data-testid="mm-props-boundary-apply"]').trigger('click');

    expect(wrapper.emitted('update-boundary')?.[0]).toEqual([
      { label: '阶段一', color: '#2563eb' },
    ]);
  });

  it('清除边界：emit null 并清空草稿', async () => {
    const wrapper = mountPanel({ ...baseTopic, boundary: { label: '旧边界' } });
    await wrapper.find('[data-testid="mm-props-boundary-clear"]').trigger('click');

    expect(wrapper.emitted('update-boundary')?.[0]).toEqual([null]);
    expect(valueOf(wrapper, 'mm-props-boundary-label')).toBe('');
  });

  it('预设颜色一键 emit update-boundary（带当前标签）', async () => {
    const wrapper = mountPanel({ ...baseTopic, boundary: { label: '分组' } });
    await wrapper.find('[data-testid="mm-props-boundary-color-#16a34a"]').trigger('click');
    expect(wrapper.emitted('update-boundary')?.[0]).toEqual([
      { label: '分组', color: '#16a34a' },
    ]);
  });

  it('只读模式下边界输入与按钮禁用，点击不 emit', async () => {
    const wrapper = mountPanel({ ...baseTopic, boundary: { label: '分组' } }, true);
    expect(wrapper.find('[data-testid="mm-props-boundary-label"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="mm-props-boundary-color"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="mm-props-boundary-apply"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="mm-props-boundary-clear"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="mm-props-boundary-clear"]').trigger('click');
    expect(wrapper.emitted('update-boundary')).toBeUndefined();
  });
});

describe('MindmapPropertiesPanel UX-2：概要', () => {
  it('渲染概要区块并回填文本', () => {
    const wrapper = mountPanel({ ...baseTopic, summary: '这是一组子主题' });
    expect(wrapper.find('[data-testid="mm-props-summary"]').exists()).toBe(true);
    expect(valueOf(wrapper, 'mm-props-summary-text')).toBe('这是一组子主题');
  });

  it('应用概要：trim 后 emit update-summary', async () => {
    const wrapper = mountPanel(baseTopic);
    await wrapper.find('[data-testid="mm-props-summary-text"]').setValue('  概括文本  ');
    await wrapper.find('[data-testid="mm-props-summary-apply"]').trigger('click');
    expect(wrapper.emitted('update-summary')?.[0]).toEqual(['概括文本']);
  });

  it('清除概要：emit null 并清空草稿', async () => {
    const wrapper = mountPanel({ ...baseTopic, summary: '旧概要' });
    await wrapper.find('[data-testid="mm-props-summary-clear"]').trigger('click');
    expect(wrapper.emitted('update-summary')?.[0]).toEqual([null]);
    expect(valueOf(wrapper, 'mm-props-summary-text')).toBe('');
  });

  it('只读模式下概要禁用', async () => {
    const wrapper = mountPanel({ ...baseTopic, summary: '旧概要' }, true);
    expect(wrapper.find('[data-testid="mm-props-summary-text"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="mm-props-summary-apply"]').trigger('click');
    expect(wrapper.emitted('update-summary')).toBeUndefined();
  });

  it('切换节点时边界/概要草稿随之重置', async () => {
    const wrapper = mountPanel({
      ...baseTopic,
      boundary: { label: '甲边界', color: '#dc2626' },
      summary: '甲的概要',
    });
    await wrapper.setProps({
      topic: {
        id: 't2',
        text: '另一个节点',
        boundary: { label: '乙边界' },
        summary: '乙的概要',
      },
    });
    expect(valueOf(wrapper, 'mm-props-boundary-label')).toBe('乙边界');
    expect(valueOf(wrapper, 'mm-props-boundary-color')).toBe('');
    expect(valueOf(wrapper, 'mm-props-summary-text')).toBe('乙的概要');
  });
});
