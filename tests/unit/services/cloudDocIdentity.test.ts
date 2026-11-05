/**
 * @description 云端文档身份解析（resolveCloudDocIdentity）：显式 cloudPath → 标签 cloudFileId → 本地路径推导。
 * 这层判定的意义：跨工作区文档被落到系统临时区后，本地路径已无法反推出 tau/<workspace>/…，
 * 若仍按本地路径推导，「更新同一篇文档」会被误判成「新建文档」（旧文档留在原分类）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 14:00
 */
import { describe, expect, it } from 'vitest';
import { resolveCloudDocIdentity, resolveEditorSyncIdentity } from '@/services/cloudSyncService';

const docMap = {
  'tau/分享/notes/a.md': { fileId: 42, version: 7, contentHash: 'sha256:a', category: '分享子项', categoryId: '1790000000000000001' },
  'tau/学习/量化学习路线.md': { fileId: 99, version: 2, contentHash: 'sha256:b', category: '未分类', categoryId: null },
};

describe('resolveCloudDocIdentity 身份优先级', () => {
  it('显式 cloudPath 最高优先：即便本地路径能推导出别的路径也用显式值', () => {
    const identity = resolveCloudDocIdentity({
      filePath: 'D:/AppData/Local/Temp/tau-scratch/分享/notes/a.md',
      cloudPath: 'tau/分享/notes/a.md',
      cloudFileId: 42,
      docMap,
      workspaceName: '我的工作区',
      workspacePath: 'D:/my-workspace',
    });

    expect(identity.cloudPath).toBe('tau/分享/notes/a.md');
    expect(identity.fileId).toBe(42);
    expect(identity.meta?.category).toBe('分享子项');
  });

  it('只有 cloudFileId 时按 docMap 反查云端路径（临时区落位场景）', () => {
    const identity = resolveCloudDocIdentity({
      // 临时区路径，任何工作区推导都得不到 tau/分享/notes/a.md
      filePath: 'D:/AppData/Local/Temp/tau-scratch/分享/notes/a.md',
      cloudFileId: 42,
      docMap,
      workspaceName: '学习',
      workspacePath: 'D:/study',
    });

    expect(identity.cloudPath).toBe('tau/分享/notes/a.md');
    expect(identity.fileId).toBe(42);
    expect(identity.meta?.version).toBe(7);
  });

  it('cloudFileId 未命中时回退到本地路径推导（老场景：文档就在当前工作区）', () => {
    const identity = resolveCloudDocIdentity({
      filePath: 'D:/study/量化学习路线.md',
      cloudFileId: 12345,
      docMap,
      workspaceName: '学习',
      workspacePath: 'D:/study',
    });

    expect(identity.cloudPath).toBe('tau/学习/量化学习路线.md');
    // 推导出的路径在 docMap 里有记录 → fileId 以记录为准
    expect(identity.fileId).toBe(99);
  });

  it('完全无身份信息时返回推导路径与 null fileId（首次上传）', () => {
    const identity = resolveCloudDocIdentity({
      filePath: 'D:/study/new-draft.md',
      docMap,
      workspaceName: '学习',
      workspacePath: 'D:/study',
    });

    expect(identity.cloudPath).toBe('tau/学习/new-draft.md');
    expect(identity.fileId).toBeNull();
    expect(identity.meta).toBeNull();
  });

  it('路径归一化：反斜杠与冗余段被压成 / 分隔的规范形式', () => {
    const identity = resolveCloudDocIdentity({
      cloudPath: 'tau\\分享\\notes\\a.md',
      docMap,
    });

    expect(identity.cloudPath).toBe('tau/分享/notes/a.md');
    expect(identity.fileId).toBe(42);
  });

  it('显式 cloudPath 不在 docMap 里但给了 fileId：路径用显式值，meta 按 fileId 兜底', () => {
    const identity = resolveCloudDocIdentity({
      cloudPath: 'tau/分享/renamed/a.md',
      cloudFileId: 42,
      docMap,
    });

    expect(identity.cloudPath).toBe('tau/分享/renamed/a.md');
    expect(identity.fileId).toBe(42);
    expect(identity.meta?.fileId).toBe(42);
  });
});

describe('resolveEditorSyncIdentity 编辑器入口的云端身份回显', () => {
  it('临时区路径 + cloudFileId：按 docMap 找回云端路径与分类（修分类不回显）', () => {
    const identity = resolveEditorSyncIdentity({
      cloudFileId: 42,
      // 临时落位文件，按路径推导不出 tau/分享/notes/a.md
      filePath: 'C:/Users/x/AppData/Local/Temp/tau-scratch/分享/notes/a.md',
      docMap,
      workspaceName: '我的工作区',
      workspacePath: 'D:/my-workspace',
    });

    expect(identity.cloudFileId).toBe(42);
    expect(identity.cloudPath).toBe('tau/分享/notes/a.md');
    expect(identity.category).toBe('分享子项');
    expect(identity.categoryId).toBe('1790000000000000001');
  });

  it('无 cloudFileId 且是临时区路径：不误报分类', () => {
    const identity = resolveEditorSyncIdentity({
      cloudFileId: null,
      filePath: 'C:/Users/x/AppData/Local/Temp/tau-scratch/随手记.md',
      docMap,
      workspaceName: '我的工作区',
      workspacePath: 'D:/my-workspace',
    });

    expect(identity.cloudFileId).toBeNull();
    expect(identity.category).toBeNull();
    expect(identity.categoryId).toBeNull();
  });

  it('cloudFileId 不在 docMap 时保留身份但不猜云端路径', () => {
    const identity = resolveEditorSyncIdentity({
      cloudFileId: 777,
      filePath: 'C:/Users/x/AppData/Local/Temp/tau-scratch/未知.md',
      docMap,
      workspaceName: '我的工作区',
      workspacePath: 'D:/my-workspace',
    });

    expect(identity.cloudFileId).toBe(777);
    expect(identity.cloudPath).toBeNull();
    expect(identity.category).toBeNull();
  });

  it('老场景（文件就在当前工作区）：路径推导命中 docMap 后回显分类', () => {
    const identity = resolveEditorSyncIdentity({
      cloudFileId: null,
      filePath: 'D:/study/量化学习路线.md',
      docMap,
      workspaceName: '学习',
      workspacePath: 'D:/study',
    });

    expect(identity.cloudFileId).toBe(99);
    expect(identity.cloudPath).toBe('tau/学习/量化学习路线.md');
    expect(identity.category).toBe('未分类');
    expect(identity.categoryId).toBeNull();
  });
});
