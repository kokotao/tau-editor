import { describe, expect, it } from 'vitest';
import {
  cloudWorkspaceNameFromPath,
  normalizeCloudPath,
  resolveCloudDocLanding,
  type LandingContext,
} from '@/services/cloudDocLanding';

const binding = (path: string) => ({ path, lastUsedAt: 1, origin: 'silent' as const });

function context(overrides: Partial<LandingContext> = {}): LandingContext {
  return {
    currentWorkspacePath: null,
    currentWorkspaceName: null,
    bindings: {},
    recentProjects: [],
    existingPaths: new Set<string>(),
    ...overrides,
  };
}

describe('cloudWorkspaceNameFromPath', () => {
  it('从 tau/{workspace}/... 取工作区名', () => {
    expect(cloudWorkspaceNameFromPath('tau/分享/分享子项/镜像管理提示词.md')).toBe('分享');
    expect(cloudWorkspaceNameFromPath('tau/lizi-tauEditor-project/src/App.vue')).toBe('lizi-tauEditor-project');
  });

  it('反斜杠与首尾斜杠都归一化', () => {
    expect(cloudWorkspaceNameFromPath('\\tau\\分享\\a.md')).toBe('分享');
    expect(cloudWorkspaceNameFromPath('/tau/分享/a.md')).toBe('分享');
  });

  it('非 tau/ 前缀或只有工作区目录时返回 null', () => {
    expect(cloudWorkspaceNameFromPath('other/分享/a.md')).toBeNull();
    expect(cloudWorkspaceNameFromPath('tau/分享')).toBeNull();
    expect(cloudWorkspaceNameFromPath('tau/')).toBeNull();
    expect(cloudWorkspaceNameFromPath('')).toBeNull();
  });
});

describe('normalizeCloudPath', () => {
  it('盘符路径转小写、分隔符统一、去尾斜杠', () => {
    expect(normalizeCloudPath('D:\\Work\\Proj\\')).toBe('d:/work/proj');
    expect(normalizeCloudPath('C:/Users/Administrator/Work/')).toBe('c:/users/administrator/work');
  });

  it('非盘符路径保持大小写', () => {
    expect(normalizeCloudPath('/home/Albert/Work/')).toBe('/home/Albert/Work');
  });
});

describe('resolveCloudDocLanding', () => {
  it('当前工作区同名 → inPlace', () => {
    const landing = resolveCloudDocLanding(
      'tau/分享/a.md',
      context({ currentWorkspacePath: 'D:\\ws\\分享', currentWorkspaceName: '分享' }),
    );

    expect(landing?.kind).toBe('inPlace');
    expect(landing?.source).toBe('current');
    expect(landing?.workspacePath).toBe('D:\\ws\\分享');
  });

  it('已有工作区但名字不同 → null（不劫持上下文）', () => {
    const landing = resolveCloudDocLanding(
      'tau/分享/a.md',
      context({ currentWorkspacePath: 'D:\\ws\\另一个', currentWorkspaceName: '另一个' }),
    );

    expect(landing).toBeNull();
  });

  it('绑定目录仍存在 → silentOpen(binding)', () => {
    const landing = resolveCloudDocLanding(
      'tau/分享/a.md',
      context({
        bindings: { 分享: binding('D:\\ws\\分享') },
        existingPaths: new Set([normalizeCloudPath('D:\\ws\\分享')]),
      }),
    );

    expect(landing?.kind).toBe('silentOpen');
    expect(landing?.source).toBe('binding');
    expect(landing?.workspacePath).toBe('D:\\ws\\分享');
  });

  it('绑定目录已消失 → scratch 且标记 staleBinding', () => {
    const landing = resolveCloudDocLanding(
      'tau/分享/a.md',
      context({ bindings: { 分享: binding('D:\\ws\\分享') } }),
    );

    expect(landing?.kind).toBe('scratch');
    expect(landing?.staleBinding).toBe(true);
    expect(landing?.stalePath).toBe('D:\\ws\\分享');
    expect(landing?.workspacePath).toBeNull();
  });

  it('最近项目恰好一个同名且存在 → silentOpen(recent)', () => {
    const landing = resolveCloudDocLanding(
      'tau/分享/a.md',
      context({
        recentProjects: [{ path: 'D:\\ws\\分享', name: '分享', openedAt: 2 }],
        existingPaths: new Set([normalizeCloudPath('D:\\ws\\分享')]),
      }),
    );

    expect(landing?.kind).toBe('silentOpen');
    expect(landing?.source).toBe('recent');
  });

  it('同名最近项目多个 → 不猜目录，落 scratch', () => {
    const landing = resolveCloudDocLanding(
      'tau/proj/a.md',
      context({
        recentProjects: [
          { path: 'D:\\a\\proj', name: 'proj', openedAt: 2 },
          { path: 'D:\\b\\proj', name: 'proj', openedAt: 3 },
        ],
        existingPaths: new Set([normalizeCloudPath('D:\\a\\proj'), normalizeCloudPath('D:\\b\\proj')]),
      }),
    );

    expect(landing?.kind).toBe('scratch');
    expect(landing?.staleBinding).toBe(false);
  });

  it('最近项目同名但目录已不在 → scratch', () => {
    const landing = resolveCloudDocLanding(
      'tau/proj/a.md',
      context({ recentProjects: [{ path: 'D:\\gone\\proj', name: 'proj', openedAt: 2 }] }),
    );

    expect(landing?.kind).toBe('scratch');
    expect(landing?.staleBinding).toBe(false);
  });

  it('毫无线索 → scratch（无 staleBinding）', () => {
    const landing = resolveCloudDocLanding('tau/新工作区/a.md', context());

    expect(landing?.kind).toBe('scratch');
    expect(landing?.workspaceName).toBe('新工作区');
    expect(landing?.staleBinding).toBe(false);
  });

  it('无法反查工作区的路径 → null', () => {
    expect(resolveCloudDocLanding('other/a.md', context())).toBeNull();
  });
});
