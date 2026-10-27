/**
 * @description 云端文档身份解析（resolveCloudDocIdentity）：显式 cloudPath → 标签 cloudFileId → 本地路径推导。
 * 这层判定的意义：跨工作区文档被落到系统临时区后，本地路径已无法反推出 tau/<workspace>/…，
 * 若仍按本地路径推导，「更新同一篇文档」会被误判成「新建文档」（旧文档留在原分类）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 14:00
 */
import { describe, expect, it } from 'vitest';
import { resolveCloudDocIdentity } from '@/services/cloudSyncService';

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
