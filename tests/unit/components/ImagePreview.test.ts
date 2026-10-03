import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import ImagePreview from '@/components/editor/ImagePreview.vue';
import { isImageFilePath } from '@/utils/fileTypes';

describe('ImagePreview', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('在 Tauri 中应将图片文件路径转换为 asset URL 并直接渲染图片', () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: { convertFileSrc: (path: string) => `asset://${path}` },
      configurable: true,
    });
    const wrapper = mount(ImagePreview, {
      props: {
        filePath: '/workspace/assets/image.png',
        fileName: 'image.png',
      },
    });

    const image = wrapper.get('[data-testid="image-file-preview"]');
    expect(image.attributes('src')).toBe('asset:///workspace/assets/image.png');
    expect(image.attributes('alt')).toBe('image.png');
    expect(wrapper.find('[data-testid="image-source-preview"]').exists()).toBe(false);
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it.each(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])('应识别 %s 图片扩展名', (extension) => {
    expect(isImageFilePath(`diagram.${extension}`)).toBe(true);
  });

  it('不应把代码或普通文本文件识别为图片', () => {
    expect(isImageFilePath('/workspace/App.vue')).toBe(false);
    expect(isImageFilePath('/workspace/README.md')).toBe(false);
  });

  it('支持直接传入 src/alt，并在双击图片时派发 open 与 open-image 事件', async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        src: 'https://example.com/large-image.png',
        alt: '大图',
      },
    });

    const image = wrapper.get('[data-testid="image-file-preview"]');
    expect(image.attributes('src')).toBe('https://example.com/large-image.png');
    expect(image.attributes('alt')).toBe('大图');

    await image.trigger('dblclick');

    expect(wrapper.emitted('open')).toEqual([[{
      src: 'https://example.com/large-image.png',
      alt: '大图',
    }]]);
    expect(wrapper.emitted('open-image')).toEqual([[{
      src: 'https://example.com/large-image.png',
      alt: '大图',
    }]]);
  });
});
