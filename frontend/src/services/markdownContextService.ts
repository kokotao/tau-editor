import {
  markdownCommands,
  type MarkdownLinkStatus,
  type WorkspaceTaskFile,
  type WorkspaceTaskResponse,
} from '@/lib/tauri';
import type { MarkdownLink } from '@/services/markdownService';

export interface MarkdownLinkSummary {
  ok: number;
  missing: number;
  outside: number;
  external: number;
  anchor: number;
  unsupported: number;
  invalid: number;
  broken: number;
}

export interface WorkspaceTaskEntry {
  id: string;
  relativePath: string;
  line: number;
  label: string;
  completed: boolean;
}

const createEmptySummary = (): MarkdownLinkSummary => ({
  ok: 0,
  missing: 0,
  outside: 0,
  external: 0,
  anchor: 0,
  unsupported: 0,
  invalid: 0,
  broken: 0,
});

/** 只把非外部、非锚点的链接交给后端校验，避免无意义的工作区查询。 */
export const collectLinkTargets = (links: MarkdownLink[]): string[] => {
  const targets = new Set<string>();
  for (const link of links) {
    const target = link.target.trim();
    if (!target || link.external || target.startsWith('#')) {
      continue;
    }
    targets.add(target);
  }
  return [...targets];
};

export const indexLinkStatuses = (statuses: MarkdownLinkStatus[]): Record<string, MarkdownLinkStatus> =>
  Object.fromEntries(statuses.map((status) => [status.target, status]));

export const summarizeMarkdownLinkStates = (
  links: MarkdownLink[],
  statuses: Record<string, MarkdownLinkStatus | undefined>,
): MarkdownLinkSummary => {
  const summary = createEmptySummary();

  for (const link of links) {
    if (link.external) {
      summary.external += 1;
      continue;
    }

    const state = statuses[link.target.trim()]?.status;
    switch (state) {
      case 'missing':
        summary.missing += 1;
        break;
      case 'outside':
        summary.outside += 1;
        break;
      case 'anchor':
        summary.anchor += 1;
        break;
      case 'unsupported':
        summary.unsupported += 1;
        break;
      case 'invalid':
        summary.invalid += 1;
        break;
      case 'ok':
      default:
        summary.ok += 1;
        break;
    }
  }

  summary.broken = summary.missing + summary.outside + summary.unsupported + summary.invalid;
  return summary;
};

export const flattenWorkspaceTasks = (response: WorkspaceTaskResponse | null): WorkspaceTaskEntry[] => {
  if (!response) {
    return [];
  }

  return response.files.flatMap((file: WorkspaceTaskFile) =>
    file.tasks.map((task) => ({
      id: `${file.relativePath}:${task.line}`,
      relativePath: file.relativePath,
      line: task.line,
      label: task.label,
      completed: task.completed,
    })),
  );
};

export const loadMarkdownLinkStatuses = async (
  workspaceId: string,
  documentRelativePath: string,
  links: MarkdownLink[],
): Promise<Record<string, MarkdownLinkStatus>> => {
  const targets = collectLinkTargets(links);
  if (targets.length === 0) {
    return {};
  }

  const statuses = await markdownCommands.checkLinks(workspaceId, documentRelativePath, targets);
  return indexLinkStatuses(statuses);
};

export const loadWorkspaceTasks = async (workspaceId: string): Promise<WorkspaceTaskResponse> =>
  markdownCommands.workspaceTasks(workspaceId);

export const importMarkdownAsset = async (
  workspaceId: string,
  documentRelativePath: string,
  sourcePath: string,
) => markdownCommands.importAsset(workspaceId, documentRelativePath, sourcePath);

export const isBrokenLink = (status: string | undefined): boolean =>
  status === 'missing' || status === 'outside' || status === 'unsupported' || status === 'invalid';
