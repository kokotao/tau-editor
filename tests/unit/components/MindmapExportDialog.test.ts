import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MindmapExportDialog from '@/components/editor/mindmap/MindmapExportDialog.vue';

describe('MindmapExportDialog membership export controls', () => {
  it('未确认会员档位时默认提示 TauEditor 水印并禁用彩色导出', async () => {
    const wrapper = mount(MindmapExportDialog, { props: { visible: true, defaultFormat: 'jpg' } });
    expect(wrapper.find('[data-testid="mm-export-watermark-notice"]').text()).toContain('TauEditor');
    expect((wrapper.find('[data-testid="mm-export-color-color"]').element as HTMLInputElement).disabled).toBe(true);
    await wrapper.find('[data-testid="mm-export-confirm"]').trigger('click');
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({ colorMode: 'monochrome' });
  });

  it('导出失败时在当前弹窗内部显示红色错误提示', () => {
    const wrapper = mount(MindmapExportDialog, {
      props: { visible: true, errorMessage: '导出尺寸 32768×2048 超出上限，请降低倍率' },
    });
    const error = wrapper.get('[data-testid="mm-export-error"]');
    expect(error.attributes('role')).toBe('alert');
    expect(error.text()).toContain('请降低倍率');
    expect(wrapper.get('[data-testid="mm-export-dialog"]').element.contains(error.element)).toBe(true);
  });

  it('PLUS / PRO 显示可用彩色选项且去除免费水印提示', async () => {
    for (const membershipTier of ['PLUS', 'PRO']) {
      const wrapper = mount(MindmapExportDialog, { props: { visible: true, defaultFormat: 'jpg', membershipTier } });
      expect(wrapper.find('[data-testid="mm-export-watermark-notice"]').exists()).toBe(false);
      expect((wrapper.find('[data-testid="mm-export-color-color"]').element as HTMLInputElement).disabled).toBe(false);
      await wrapper.find('[data-testid="mm-export-color-color"]').setValue();
      await wrapper.find('[data-testid="mm-export-confirm"]').trigger('click');
      expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({ colorMode: 'color' });
      wrapper.unmount();
    }
  });

  it('非视觉导出不声称有视觉水印或彩色选项', async () => {
    const wrapper = mount(MindmapExportDialog, { props: { visible: true, defaultFormat: 'jpg' } });
    await wrapper.find('[data-testid="mm-export-format-taumap"]').setValue();
    expect(wrapper.find('[data-testid="mm-export-watermark-notice"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mm-export-visual-options"]').exists()).toBe(false);
  });

  it('按会员档位限制格式，点击受限选项提示升级', async () => {
    const wrapper = mount(MindmapExportDialog, { props: { visible: true, membershipTier: 'FREE' } });
    expect((wrapper.get('[data-testid="mm-export-format-jpg"]').element as HTMLInputElement).disabled).toBe(false);
    expect((wrapper.get('[data-testid="mm-export-format-freemind"]').element as HTMLInputElement).disabled).toBe(true);
    await wrapper.get('[data-testid="mm-export-format-freemind"]').element.parentElement!.click();
    expect(wrapper.emitted('membership-required')).toHaveLength(1);
    await wrapper.setProps({ membershipTier: 'PLUS' });
    expect((wrapper.get('[data-testid="mm-export-format-freemind"]').element as HTMLInputElement).disabled).toBe(false);
    expect((wrapper.get('[data-testid="mm-export-format-png"]').element as HTMLInputElement).disabled).toBe(true);
    await wrapper.setProps({ membershipTier: 'PRO' });
    expect((wrapper.get('[data-testid="mm-export-format-png"]').element as HTMLInputElement).disabled).toBe(false);
  });

  it('Plus / Pro 均可提交自定义视觉水印', async () => {
    for (const membershipTier of ['PLUS', 'PRO']) {
      const wrapper = mount(MindmapExportDialog, { props: { visible: true, defaultFormat: 'jpg', membershipTier } });
      await wrapper.get('[data-testid="mm-export-custom-watermark"]').setValue(' 我的水印 ');
      await wrapper.get('[data-testid="mm-export-confirm"]').trigger('click');
      expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({ customWatermark: '我的水印' });
      wrapper.unmount();
    }
  });
});
