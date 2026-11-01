/**
 * 云文档 Markdown 图片「粘贴/导入即上传」：决策与执行单测。
 *
 * 覆盖：
 * - decideCloudImageUpload：非云文档跳过、相对路径归一/越界、扩展名白名单、大小上限、本地路径缺失；
 * - joinAssetAbsolutePath：根目录与相对路径拼接、越界/空值；
 * - performCloudImageUpload：跳过不发请求、成功、失败返回可读原因且不抛出；
 * - uploadMarkdownImageToCloud：本地文档 / 云文档成功 / 云文档失败三种链路。
 *
 * @author Albert_Luo
 * @date 2026-10-31
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CLOUD_ASSET_MAX_BYTES,
  isSupportedImageName,
} from '@/services/cloudAssetService';
import {
  buildMarkdownImageSnippet,
  cloudAssetUrlOf,
  decideCloudImageUpload,
  joinAssetAbsolutePath,
  performCloudImageUpload,
  resolveCloudAssetUrls,
  uploadMarkdownImageToCloud,
} from '@/services/markdownImagePasteService';

const CLOUD_DOC = {
  cloudFileId: 9001,
  relativePath: 'assets/pasted-image.png',
  absolutePath: '/ws/notes/assets/pasted-image.png',
  byteSize: 1024,
};

describe('decideCloudImageUpload', () => {
  it('非云文档（无 cloudFileId）一律跳过，保持原有本地行为', () => {
    for (const cloudFileId of [undefined, null, 0, -1, Number.NaN]) {
      expect(decideCloudImageUpload({ ...CLOUD_DOC, cloudFileId })).toEqual({
        action: 'skip',
        reason: 'no-cloud-doc',
      });
    }
  });

  it('云文档 + 合规图片：返回上传决策并归一化相对路径', () => {
    expect(decideCloudImageUpload({
      ...CLOUD_DOC,
      relativePath: '.\\assets\\pasted-image.png',
    })).toEqual({
      action: 'upload',
      cloudFileId: 9001,
      relativePath: 'assets/pasted-image.png',
      absolutePath: '/ws/notes/assets/pasted-image.png',
    });
  });

  it('相对路径越界（../ 或空）时不上传', () => {
    expect(decideCloudImageUpload({ ...CLOUD_DOC, relativePath: '../secret.png' }))
      .toEqual({ action: 'skip', reason: 'invalid-relative-path' });
    expect(decideCloudImageUpload({ ...CLOUD_DOC, relativePath: '   ' }))
      .toEqual({ action: 'skip', reason: 'invalid-relative-path' });
  });

  it('云端不支持的图片扩展名（svg/bmp/avif 等）跳过', () => {
    for (const name of ['a.svg', 'a.bmp', 'a.avif', 'a.txt', 'noext']) {
      expect(decideCloudImageUpload({ ...CLOUD_DOC, relativePath: `assets/${name}` }))
        .toEqual({ action: 'skip', reason: 'unsupported-extension' });
    }
    // 允许的格式大小写不敏感
    expect(isSupportedImageName('A.PNG')).toBe(true);
    expect(decideCloudImageUpload({ ...CLOUD_DOC, relativePath: 'assets/A.JPEG' }).action).toBe('upload');
  });

  it('超过云端单图上限时跳过，等于上限仍允许', () => {
    expect(decideCloudImageUpload({ ...CLOUD_DOC, byteSize: CLOUD_ASSET_MAX_BYTES + 1 }))
      .toEqual({ action: 'skip', reason: 'too-large' });
    expect(decideCloudImageUpload({ ...CLOUD_DOC, byteSize: CLOUD_ASSET_MAX_BYTES }).action).toBe('upload');
    // 未知大小（null）不拦，交给后端校验
    expect(decideCloudImageUpload({ ...CLOUD_DOC, byteSize: null }).action).toBe('upload');
  });

  it('拿不到本地绝对路径时跳过', () => {
    expect(decideCloudImageUpload({ ...CLOUD_DOC, absolutePath: null }))
      .toEqual({ action: 'skip', reason: 'missing-local-path' });
    expect(decideCloudImageUpload({ ...CLOUD_DOC, absolutePath: '  ' }))
      .toEqual({ action: 'skip', reason: 'missing-local-path' });
  });

  it('显式 fileName 优先于相对路径末段', () => {
    expect(decideCloudImageUpload({
      ...CLOUD_DOC,
      relativePath: 'assets/no-extension',
      fileName: 'pasted-image.webp',
    }).action).toBe('upload');
  });
});

describe('joinAssetAbsolutePath', () => {
  it('拼接根目录与相对路径（统一 / 分隔符、去尾斜杠）', () => {
    expect(joinAssetAbsolutePath('/ws/notes/', 'assets/a.png')).toBe('/ws/notes/assets/a.png');
    expect(joinAssetAbsolutePath('C:\\ws\\notes\\', 'assets/a.png')).toBe('C:/ws/notes/assets/a.png');
    expect(joinAssetAbsolutePath('/ws', './assets/a.png')).toBe('/ws/assets/a.png');
  });

  it('根目录缺失或相对路径越界返回 null', () => {
    expect(joinAssetAbsolutePath(null, 'assets/a.png')).toBeNull();
    expect(joinAssetAbsolutePath('', 'assets/a.png')).toBeNull();
    expect(joinAssetAbsolutePath('/ws', '../a.png')).toBeNull();
    expect(joinAssetAbsolutePath('/ws', '')).toBeNull();
  });
});

describe('performCloudImageUpload', () => {
  it('跳过决策不发请求', async () => {
    const upload = vi.fn();
    const result = await performCloudImageUpload({ action: 'skip', reason: 'no-cloud-doc' }, upload);
    expect(result.ok).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('上传成功：把 cloudFileId / relPath / 绝对路径原样交给上传函数', async () => {
    const upload = vi.fn().mockResolvedValue({ assetId: 1 });
    const result = await performCloudImageUpload(
      decideCloudImageUpload(CLOUD_DOC),
      upload,
    );
    // 旧后端不返回 url → url 为 null，调用方回退相对路径
    expect(result).toEqual({ ok: true, url: null });
    expect(upload).toHaveBeenCalledWith(9001, 'assets/pasted-image.png', '/ws/notes/assets/pasted-image.png');
  });

  it('上传成功且后端返回 url：透传签名直链', async () => {
    const upload = vi.fn().mockResolvedValue({ assetId: 1, url: 'https://note.lizipro.cn/lizi/miniProgram/cloud/file/1?sig=t1.x.y' });
    const result = await performCloudImageUpload(decideCloudImageUpload(CLOUD_DOC), upload);
    expect(result).toEqual({
      ok: true,
      url: 'https://note.lizipro.cn/lizi/miniProgram/cloud/file/1?sig=t1.x.y',
    });
  });

  it('上传失败：返回可读原因且不抛出', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('网络异常'));
    const result = await performCloudImageUpload(decideCloudImageUpload(CLOUD_DOC), upload);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('网络异常');
  });
});

describe('uploadMarkdownImageToCloud（完整链路）', () => {
  it('本地文档：不上传，调用方可继续走原有「图片已插入」提示', async () => {
    const upload = vi.fn();
    const outcome = await uploadMarkdownImageToCloud(
      { ...CLOUD_DOC, cloudFileId: null },
      upload,
    );
    expect(outcome.decision).toEqual({ action: 'skip', reason: 'no-cloud-doc' });
    expect(outcome.uploaded).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('云文档 + 上传成功', async () => {
    const upload = vi.fn().mockResolvedValue({ assetId: 7 });
    const outcome = await uploadMarkdownImageToCloud(CLOUD_DOC, upload);
    expect(outcome.decision.action).toBe('upload');
    expect(outcome.uploaded).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('云文档 + 上传失败：仍返回失败原因（插入流程由调用方保持不阻断）', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('需要登录'));
    const outcome = await uploadMarkdownImageToCloud(CLOUD_DOC, upload);
    expect(outcome.uploaded).toBe(false);
    expect(outcome.failureMessage).toContain('需要登录');
    expect(outcome.decision.action).toBe('upload');
  });

  it('云文档 + 不合规图片：跳过且不发请求', async () => {
    const upload = vi.fn();
    const outcome = await uploadMarkdownImageToCloud(
      { ...CLOUD_DOC, relativePath: 'assets/vector.svg' },
      upload,
    );
    expect(outcome.decision).toEqual({ action: 'skip', reason: 'unsupported-extension' });
    expect(outcome.uploaded).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('云文档 + 后端返回直链：链路透出 url 供调用方写 Markdown', async () => {
    const url = 'https://note.lizipro.cn/lizi/miniProgram/cloud/file/77?sig=t1.2108861396.abc';
    const upload = vi.fn().mockResolvedValue({ assetId: 77, url });
    const outcome = await uploadMarkdownImageToCloud(CLOUD_DOC, upload);
    expect(outcome.uploaded).toBe(true);
    expect(outcome.url).toBe(url);
  });
});

describe('cloudAssetUrlOf', () => {
  it('取出非空 url，空串/空白/null 一律返回 null', () => {
    expect(cloudAssetUrlOf({ url: 'https://x/a.png' })).toBe('https://x/a.png');
    expect(cloudAssetUrlOf({ url: '  https://x/a.png  ' })).toBe('https://x/a.png');
    expect(cloudAssetUrlOf({ url: '' })).toBeNull();
    expect(cloudAssetUrlOf({ url: '   ' })).toBeNull();
    expect(cloudAssetUrlOf({})).toBeNull();
    expect(cloudAssetUrlOf(null)).toBeNull();
    expect(cloudAssetUrlOf(undefined)).toBeNull();
  });
});

describe('buildMarkdownImageSnippet', () => {
  it('用直链生成标准 Markdown 图片片段', () => {
    expect(buildMarkdownImageSnippet('https://x/a.png', 'a.png')).toBe('![a.png](https://x/a.png)');
  });

  it('alt 里的方括号被剔除，空 alt 回退 image', () => {
    expect(buildMarkdownImageSnippet('https://x/a.png', '图[1].png')).toBe('![图1.png](https://x/a.png)');
    expect(buildMarkdownImageSnippet('https://x/a.png', '   ')).toBe('![image](https://x/a.png)');
  });
});

describe('resolveCloudAssetUrls', () => {
  it('把 relPath 映射到签名直链，跳过没有 url 的项', () => {
    const mapping = resolveCloudAssetUrls([
      { relPath: 'assets/a.png', url: 'https://x/a.png' },
      { relPath: 'assets/b.png', url: '' },
      { relPath: '', url: 'https://x/c.png' },
      { relPath: 'assets/c.png', url: null },
    ]);
    expect(mapping.size).toBe(1);
    expect(mapping.get('assets/a.png')).toBe('https://x/a.png');
    expect(mapping.has('assets/b.png')).toBe(false);
  });

  it('空输入返回空映射', () => {
    expect(resolveCloudAssetUrls(null).size).toBe(0);
    expect(resolveCloudAssetUrls(undefined).size).toBe(0);
    expect(resolveCloudAssetUrls([]).size).toBe(0);
  });
});
