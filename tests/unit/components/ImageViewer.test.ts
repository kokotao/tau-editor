import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import ImageViewer from '@/components/editor/ImageViewer.vue';

function mountViewer(props: Record<string, unknown> = {}) {
  return mount(ImageViewer, {
    props: {
      visible: true,
      src: 'https://example.com/photo.png',
      alt: '示例图片',
      ...props,
    },
    global: { stubs: { teleport: true } },
  });
}

describe('ImageViewer', () => {
  it('visible 为 false 时不渲染，visible 为 true 时展示可访问图片', () => {
    const hidden = mountViewer({ visible: false });
    expect(hidden.find('[data-testid="image-viewer"]').exists()).toBe(false);

    const wrapper = mountViewer();
    const image = wrapper.get('[data-testid="image-viewer-image"]');
    expect(wrapper.get('[data-testid="image-viewer"]').attributes('role')).toBe('dialog');
    expect(wrapper.get('[data-testid="image-viewer"]').attributes('aria-modal')).toBe('true');
    expect(image.attributes('src')).toBe('https://example.com/photo.png');
    expect(image.attributes('alt')).toBe('示例图片');
  });

  it('关闭按钮、遮罩点击和 Escape 都派发 close', async () => {
    const wrapper = mountViewer();

    await wrapper.get('[data-testid="image-viewer-close"]').trigger('click');
    await wrapper.get('[data-testid="image-viewer-backdrop"]').trigger('click');
    await wrapper.get('[data-testid="image-viewer"]').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('close')).toHaveLength(3);
  });

  it('点击图片周围的视口空白区和窗口级 Escape 都可以关闭', async () => {
    const wrapper = mountViewer();

    await wrapper.get('[data-testid="image-viewer-viewport"]').trigger('click');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('close')).toHaveLength(2);
  });

  it('双击切换缩放，滚轮缩放并限制在合理范围内', async () => {
    const wrapper = mountViewer();
    const getImage = () => wrapper.get('[data-testid="image-viewer-image"]');

    expect(getImage().attributes('style')).toContain('scale(1)');
    await getImage().trigger('dblclick');
    expect(getImage().attributes('style')).toContain('scale(2)');

    await wrapper.get('[data-testid="image-viewer-viewport"]').trigger('wheel', { deltaY: -100 });
    expect(getImage().attributes('style')).toContain('scale(2.25)');
    for (let index = 0; index < 10; index += 1) {
      await wrapper.get('[data-testid="image-viewer-viewport"]').trigger('wheel', { deltaY: 1000 });
    }
    expect(getImage().attributes('style')).toContain('scale(0.5)');
  });

  it('旋转按钮、重置按钮和键盘快捷键更新图片变换', async () => {
    const wrapper = mountViewer();
    const getImage = () => wrapper.get('[data-testid="image-viewer-image"]');

    await wrapper.get('[data-testid="image-viewer-rotate-clockwise"]').trigger('click');
    expect(getImage().attributes('style')).toContain('rotate(90deg)');
    await wrapper.get('[data-testid="image-viewer-rotate-counterclockwise"]').trigger('click');
    expect(getImage().attributes('style')).toContain('rotate(0deg)');

    await wrapper.get('[data-testid="image-viewer"]').trigger('keydown', { key: '+' });
    expect(getImage().attributes('style')).toContain('scale(1.25)');
    await wrapper.get('[data-testid="image-viewer"]').trigger('keydown', { key: '0' });
    expect(getImage().attributes('style')).toContain('scale(1)');
    await wrapper.get('[data-testid="image-viewer"]').trigger('keydown', { key: '-' });
    expect(getImage().attributes('style')).toContain('scale(0.75)');
  });

  it('拖拽图片时更新平移位置且图片不超出弹层尺寸', async () => {
    const wrapper = mountViewer();
    const image = wrapper.get('[data-testid="image-viewer-image"]');
    const viewport = wrapper.get('[data-testid="image-viewer-viewport"]');

    expect(viewport.classes()).toContain('image-viewer__viewport');
    await image.trigger('pointerdown', { clientX: 100, clientY: 120, button: 0 });
    await image.trigger('pointermove', { clientX: 140, clientY: 160 });
    await image.trigger('pointerup');

    expect(wrapper.get('[data-testid="image-viewer-image"]').attributes('style')).toContain('translate(40px, 40px)');
    expect(wrapper.get('[data-testid="image-viewer-image"]').classes()).toContain('image-viewer__image');
  });
});
