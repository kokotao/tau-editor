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
