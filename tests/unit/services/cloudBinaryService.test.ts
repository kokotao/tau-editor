/**
 * @description 二进制文档上传：扩展名/宏格式/50MB 校验、409 与扫描类错误的可读文案、分享前复用 fileId。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 18:35
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTauri: { value: true },
  binaryUpload: vi.fn(),
  findByPath: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => mocks.isTauri.value,
    cloudCommands: { ...actual.cloudCommands, binaryUpload: mocks.binaryUpload },
  };
});

vi.mock('@/services/cloudDocService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudDocService')>();
  return { ...actual, findCloudDocByPath: mocks.findByPath };
});

import {
  BINARY_DOC_MAX_BYTES,
  binaryDocKind,
  describeBinaryUploadError,
  ensureBinaryDocumentUploaded,
  formatBinarySize,
  isBinaryDocPath,
  isMacroDocPath,
  uploadBinaryDocument,
  validateBinaryDocLocal,
} from '@/services/cloudBinaryService';

const UPLOAD_INPUT = {
  cloudPath: 'tau/ws/docs/report.pdf',
  localPath: '/ws/docs/report.pdf',
  title: 'report.pdf',
};

describe('二进制文档扩展名与格式判定', () => {
  it('白名单内格式可上传', () => {
    for (const ext of ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'PDF', 'Docx']) {
      expect(isBinaryDocPath(`/ws/a.${ext}`)).toBe(true);
    }
    expect(binaryDocKind('/ws/a.pdf')).toBe('pdf');
    expect(binaryDocKind('/ws/a.docx')).toBe('office');
  });

  it('非白名单格式不支持', () => {
    for (const ext of ['txt', 'md', 'png', 'zip', 'exe', 'svg']) {
      expect(isBinaryDocPath(`/ws/a.${ext}`)).toBe(false);
      expect(binaryDocKind(`/ws/a.${ext}`)).toBeNull();
    }
  });

  it('宏格式识别并给出可读拒绝原因', () => {
    for (const ext of ['docm', 'xlsm', 'pptm', 'ppsm', 'dotm', 'DOCM']) {
      expect(isMacroDocPath(`/ws/a.${ext}`)).toBe(true);
      const result = validateBinaryDocLocal(`/ws/a.${ext}`, 1024);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('宏');
    }
  });

  it('50MB 边界：等于放行、超过拒绝', () => {
    expect(validateBinaryDocLocal('/ws/a.pdf', BINARY_DOC_MAX_BYTES).eligible).toBe(true);
    const over = validateBinaryDocLocal('/ws/a.pdf', BINARY_DOC_MAX_BYTES + 1);
    expect(over.eligible).toBe(false);
    expect(over.reason).toContain('50 MB');
  });

  it('大小未知时只校验扩展名', () => {
    expect(validateBinaryDocLocal('/ws/a.pdf', null).eligible).toBe(true);
  });
});

describe('describeBinaryUploadError 错误文案', () => {
  it('409 提示不支持覆盖', () => {
    expect(describeBinaryUploadError('conflict', '')).toContain('暂不支持覆盖');
  });
  it('413 保留服务端配额文案', () => {
    expect(describeBinaryUploadError('quota', '云端空间不足')).toBe('云端空间不足');
  });
  it('422 扫描失败给出安全检查提示', () => {
    expect(describeBinaryUploadError('unsupported', '')).toContain('安全检查');
  });
  it('401 提示重新登录', () => {
    expect(describeBinaryUploadError('unauthorized', '')).toContain('重新登录');
  });
  it('其它错误保留服务端 message', () => {
    expect(describeBinaryUploadError('unknown', '服务端炸了')).toBe('服务端炸了');
  });
});

describe('uploadBinaryDocument', () => {
  beforeEach(() => {
    mocks.isTauri.value = true;
    mocks.binaryUpload.mockResolvedValue({
      fileId: 88,
      version: 1,
      contentHash: 'sha256:x',
      size: 2048,
      updatedAt: null,
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('本地校验不通过时不发请求（宏格式）', async () => {
    const outcome = await uploadBinaryDocument({
      cloudPath: 'tau/ws/a.docm',
      localPath: '/ws/a.docm',
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('unsupported');
      expect(outcome.message).toContain('宏');
    }
    expect(mocks.binaryUpload).not.toHaveBeenCalled();
  });

  it('超限时本地直接拒绝', async () => {
    const outcome = await uploadBinaryDocument(
      { cloudPath: 'tau/ws/a.pdf', localPath: '/ws/a.pdf' },
      { fileSize: BINARY_DOC_MAX_BYTES + 1 },
    );
    expect(outcome.ok).toBe(false);
    expect(mocks.binaryUpload).not.toHaveBeenCalled();
  });

  it('成功时透传上传结果', async () => {
    const outcome = await uploadBinaryDocument(UPLOAD_INPUT);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.fileId).toBe(88);
    }
    expect(mocks.binaryUpload).toHaveBeenCalledWith({
      path: 'tau/ws/docs/report.pdf',
      title: 'report.pdf',
      category: null,
      tags: null,
      localPath: '/ws/docs/report.pdf',
    });
  });

  it('409 映射成可读提示', async () => {
    mocks.binaryUpload.mockRejectedValue(Object.assign(new Error('文档已存在'), { code: 'CONFLICT' }));
    const outcome = await uploadBinaryDocument(UPLOAD_INPUT);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('conflict');
      expect(outcome.message).toContain('暂不支持覆盖');
    }
  });

  it('Web 构建直接 unsupported', async () => {
    mocks.isTauri.value = false;
    const outcome = await uploadBinaryDocument(UPLOAD_INPUT);
    expect(outcome.ok).toBe(false);
    expect(mocks.binaryUpload).not.toHaveBeenCalled();
  });
});

describe('ensureBinaryDocumentUploaded 分享前复用', () => {
  beforeEach(() => {
    mocks.isTauri.value = true;
    mocks.binaryUpload.mockResolvedValue({ fileId: 99, version: 2, size: 4096 });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('云端已存在同 path → 直接复用 fileId，不重复上传', async () => {
    mocks.findByPath.mockResolvedValue({
      ok: true,
      data: { fileId: 42, version: 3, size: 1024, path: 'tau/ws/docs/report.pdf' },
    });

    const outcome = await ensureBinaryDocumentUploaded(UPLOAD_INPUT);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data).toMatchObject({ fileId: 42, alreadyUploaded: true, version: 3 });
    }
    expect(mocks.binaryUpload).not.toHaveBeenCalled();
  });

  it('云端没有 → 上传后返回新 fileId', async () => {
    mocks.findByPath.mockResolvedValue({ ok: true, data: null });

    const outcome = await ensureBinaryDocumentUploaded(UPLOAD_INPUT);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data).toMatchObject({ fileId: 99, alreadyUploaded: false });
    }
    expect(mocks.binaryUpload).toHaveBeenCalledTimes(1);
  });

  it('上传失败时把可读原因透出', async () => {
    mocks.findByPath.mockResolvedValue({ ok: true, data: null });
    mocks.binaryUpload.mockRejectedValue(
      Object.assign(new Error('文件未通过病毒扫描'), { code: 'UNSUPPORTED' }),
    );

    const outcome = await ensureBinaryDocumentUploaded(UPLOAD_INPUT);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain('病毒扫描');
    }
  });
});

describe('formatBinarySize', () => {
  it('按量级展示', () => {
    expect(formatBinarySize(0)).toBe('');
    expect(formatBinarySize(1024)).toBe('1.0 KB');
    expect(formatBinarySize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
