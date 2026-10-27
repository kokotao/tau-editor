/**
 * @description 云文档可编辑打开落位服务：路径解析/拼接纯逻辑 + 落位 I/O 分支
 * （happy path / 取详情失败 / 无正文 / 建目录失败 / 写盘失败 / 幂等覆盖）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 10:20
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  scratchWorkspace: vi.fn(),
  writeFile: vi.fn(),
  getCloudDoc: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    cloudCommands: { ...actual.cloudCommands, scratchWorkspace: mocks.scratchWorkspace },
    fileCommands: { ...actual.fileCommands, writeFile: mocks.writeFile },
  };
});

vi.mock('@/services/cloudDocService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudDocService')>();
  return { ...actual, getCloudDoc: mocks.getCloudDoc };
});

import {
  joinScratchPath,
  materializeCloudDocForEdit,
  parseCloudDocEditPath,
} from '@/services/cloudDocEditOpen';

/** Rust 侧 cloud_scratch_workspace 的真实返回形态（Windows：反斜杠绝对路径） */
const WIN_SCRATCH_ROOT = 'C:\\Users\\Admin\\AppData\\Local\\Temp\\tau-scratch\\分享';

function detail(overrides: Record<string, unknown> = {}) {
  return {
    fileId: 42,
    path: 'tau/分享/docs/a.md',
    title: 'a.md',
    contentHash: 'sha256:abc',
    size: 12,
    version: 7,
    category: null,
    categoryId: null,
    tags: null,
    visibility: 'PRIVATE',
    publishedArticleId: null,
    updatedAt: null,
    content: '# 云端正文',
    createdAt: null,
    ...overrides,
  };
}

const INPUT = { fileId: 42, cloudPath: 'tau/分享/docs/a.md', title: 'a.md' };

beforeEach(() => {
  mocks.scratchWorkspace.mockResolvedValue(WIN_SCRATCH_ROOT);
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.getCloudDoc.mockResolvedValue({ ok: true, data: detail() });
});

describe('parseCloudDocEditPath', () => {
  it('tau/{workspace}/{relative} 拆出工作区名、相对路径与归一化云端路径', () => {
    expect(parseCloudDocEditPath('tau/分享/a.md')).toEqual({
      workspaceName: '分享',
      relativePath: 'a.md',
      normalizedPath: 'tau/分享/a.md',
      fileName: 'a.md',
    });
  });

  it('深层 relative 全部保留（不丢中间目录）', () => {
    const parsed = parseCloudDocEditPath('tau/proj/src/app/main.ts');

    expect(parsed?.workspaceName).toBe('proj');
    expect(parsed?.relativePath).toBe('src/app/main.ts');
    expect(parsed?.fileName).toBe('main.ts');
    expect(parsed?.normalizedPath).toBe('tau/proj/src/app/main.ts');
  });

  it('反斜杠、首尾与重复斜杠都归一化成 /', () => {
    expect(parseCloudDocEditPath('\\tau\\分享\\docs\\a.md')?.relativePath).toBe('docs/a.md');
    expect(parseCloudDocEditPath('/tau/分享//a.md')?.normalizedPath).toBe('tau/分享/a.md');
  });

  it.each([
    ['没有 tau 前缀', 'other/分享/a.md'],
    ['只有工作区没有文件名', 'tau/分享'],
    ['只有前缀', 'tau'],
    ['空路径', ''],
    ['空白路径', '   '],
    ['目录穿越', 'tau/分享/../../etc/passwd'],
    ['工作区段是 ..', 'tau/../a.md'],
    ['盘符段', 'tau/分享/C:/Windows/a.md'],
  ])('非法路径返回 null：%s', (_label, cloudPath) => {
    expect(parseCloudDocEditPath(cloudPath)).toBeNull();
  });
});

describe('joinScratchPath', () => {
  it('Windows 根目录（反斜杠 + 尾斜杠）拼成统一的 / 分隔绝对路径', () => {
    expect(joinScratchPath('C:\\Users\\Admin\\AppData\\Local\\Temp\\tau-scratch\\分享\\', 'docs/a.md')).toBe(
      'C:/Users/Admin/AppData/Local/Temp/tau-scratch/分享/docs/a.md',
    );
  });

  it('POSIX 根目录与非 / 分隔的相对路径都能拼', () => {
    expect(joinScratchPath('/tmp/tau-scratch/proj', 'src\\app\\main.ts')).toBe(
      '/tmp/tau-scratch/proj/src/app/main.ts',
    );
  });

  it('空相对路径返回根目录本身，相对路径里的重复斜杠被压掉', () => {
    expect(joinScratchPath('/tmp/tau-scratch/proj/', '')).toBe('/tmp/tau-scratch/proj');
    expect(joinScratchPath('/tmp/tau-scratch/proj', '//a.md')).toBe('/tmp/tau-scratch/proj/a.md');
  });
});

describe('materializeCloudDocForEdit', () => {
  it('happy path：落到临时工作区、写入云端正文，并带回版本与哈希', async () => {
    const result = await materializeCloudDocForEdit(INPUT);

    expect(mocks.scratchWorkspace).toHaveBeenCalledWith('分享');
    expect(mocks.getCloudDoc).toHaveBeenCalledWith(42);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      'C:/Users/Admin/AppData/Local/Temp/tau-scratch/分享/docs/a.md',
      '# 云端正文',
    );
    expect(result).toEqual({
      ok: true,
      target: {
        fileId: 42,
        // 云端路径原样保留（保存时按它回写，不能因为落位到临时目录就“搬家”）
        cloudPath: 'tau/分享/docs/a.md',
        title: 'a.md',
        absolutePath: 'C:/Users/Admin/AppData/Local/Temp/tau-scratch/分享/docs/a.md',
        version: 7,
        contentHash: 'sha256:abc',
      },
    });
  });

  it('重复打开同一文档是幂等的：同一绝对路径、直接覆盖写', async () => {
    const first = await materializeCloudDocForEdit(INPUT);
    const second = await materializeCloudDocForEdit(INPUT);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.target.absolutePath).toBe(first.target.absolutePath);
    }
    expect(mocks.writeFile).toHaveBeenCalledTimes(2);
    expect(mocks.writeFile.mock.calls[0]?.[0]).toBe(mocks.writeFile.mock.calls[1]?.[0]);
  });

  it('标题为空时回落到云端标题', async () => {
    const result = await materializeCloudDocForEdit({ ...INPUT, title: '   ' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.title).toBe('a.md');
    }
  });

  it('取云端详情失败：kind/message 原样透传，不建目录也不写盘', async () => {
    mocks.getCloudDoc.mockResolvedValue({ ok: false, kind: 'conflict', message: '云端版本已更新' });

    const result = await materializeCloudDocForEdit(INPUT);

    expect(result).toEqual({ ok: false, kind: 'conflict', message: '云端版本已更新' });
    expect(mocks.scratchWorkspace).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('云端没有正文（content === null）：unsupported，不建目录也不写盘', async () => {
    mocks.getCloudDoc.mockResolvedValue({ ok: true, data: detail({ content: null }) });

    const result = await materializeCloudDocForEdit(INPUT);

    expect(result).toEqual({ ok: false, kind: 'unsupported', message: '该文档没有可下载的文本内容' });
    expect(mocks.scratchWorkspace).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('临时工作区建不出来：workspace-failed，不写盘', async () => {
    mocks.scratchWorkspace.mockRejectedValue(
      Object.assign(new Error('无法创建云文档临时工作区：拒绝访问'), { code: 'SCRATCH_UNAVAILABLE' }),
    );

    const result = await materializeCloudDocForEdit(INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('workspace-failed');
      expect(result.message).toContain('拒绝访问');
    }
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('写盘失败：write-failed 且带后端原因', async () => {
    mocks.writeFile.mockRejectedValue(new Error('磁盘已满'));

    const result = await materializeCloudDocForEdit(INPUT);

    expect(result).toEqual({ ok: false, kind: 'write-failed', message: '磁盘已满' });
  });

  it('写盘抛非 Error（Tauri 字符串错误）也能归类成 write-failed', async () => {
    mocks.writeFile.mockRejectedValue('拒绝访问');

    const result = await materializeCloudDocForEdit(INPUT);

    expect(result).toEqual({ ok: false, kind: 'write-failed', message: '拒绝访问' });
  });

  it('非法云端路径：invalid-path，且不发起任何 IPC', async () => {
    const result = await materializeCloudDocForEdit({ ...INPUT, cloudPath: 'other/分享/a.md' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('invalid-path');
      expect(result.message).toContain('other/分享/a.md');
    }
    expect(mocks.getCloudDoc).not.toHaveBeenCalled();
    expect(mocks.scratchWorkspace).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('非法 fileId：invalid-path，且不发起任何 IPC', async () => {
    const result = await materializeCloudDocForEdit({ ...INPUT, fileId: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('invalid-path');
    }
    expect(mocks.getCloudDoc).not.toHaveBeenCalled();
  });
});
