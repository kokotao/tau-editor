/**
 * 文件对比服务（v0.4.0）
 *
 * 负责构造只读 Diff 会话：
 * - 单侧内容大小守卫（2 MB）；
 * - 二进制内容识别；
 * - 语言推断；
 * - 会话 id 生成。
 *
 * 读文件的具体实现由调用方注入，便于单测与复用。
 */

export type DiffLayout = 'side-by-side' | 'inline';

export interface DiffSide {
  label: string;
  filePath?: string | null;
  content: string;
}

export interface DiffSession {
  id: string;
  left: DiffSide;
  right: DiffSide;
  layout: DiffLayout;
  readOnly: true;
  language: string;
}

export type DiffErrorCode =
  | 'DIFF_TOO_LARGE'
  | 'DIFF_BINARY'
  | 'DIFF_READ_FAILED'
  | 'DIFF_UNSUPPORTED';

export interface DiffError {
  code: DiffErrorCode;
  message: string;
}

export type DiffSessionResult =
  | { ok: true; session: DiffSession }
  | { ok: false; error: DiffError };

/** 单侧内容上限，避免把超大文件塞进 Monaco Diff。 */
export const DIFF_MAX_BYTES = 2 * 1024 * 1024;

const BINARY_SNIFF_LENGTH = 8192;

export const DIFF_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'vue',
  py: 'python',
  java: 'java',
  rs: 'rust',
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  bat: 'shell',
  cmd: 'shell',
  go: 'go',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  toml: 'ini',
  ini: 'ini',
  conf: 'ini',
};

export function textByteLength(content: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(content).length;
  }
  // 兜底：非 ASCII 按 UTF-8 三字节估算，仅用于守卫。
  return content.length * 2;
}

export function looksBinary(content: string): boolean {
  const sample = content.slice(0, BINARY_SNIFF_LENGTH);
  return sample.includes('\u0000') || /[\u0001-\u0008\u000E-\u001F]/.test(sample);
}

export function detectDiffLanguage(filePath?: string | null, fallback = 'plaintext'): string {
  if (!filePath) {
    return fallback;
  }
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : '';
  return DIFF_LANGUAGE_BY_EXTENSION[extension] ?? fallback;
}

function createSessionId(): string {
  return `diff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 构造 Diff 会话；任一侧超限或为二进制时返回结构化错误。
 */
export function createDiffSession(input: {
  left: DiffSide;
  right: DiffSide;
  language?: string;
  layout?: DiffLayout;
}): DiffSessionResult {
  const sides: Array<{ side: DiffSide; name: string }> = [
    { side: input.left, name: '左侧' },
    { side: input.right, name: '右侧' },
  ];

  for (const { side, name } of sides) {
    const bytes = textByteLength(side.content);
    if (bytes > DIFF_MAX_BYTES) {
      return {
        ok: false,
        error: {
          code: 'DIFF_TOO_LARGE',
          message: `${name}内容 ${(bytes / 1024 / 1024).toFixed(2)} MB 超过 ${DIFF_MAX_BYTES / 1024 / 1024} MB 上限`,
        },
      };
    }
    if (looksBinary(side.content)) {
      return {
        ok: false,
        error: { code: 'DIFF_BINARY', message: `${name}内容疑似二进制文件，无法对比` },
      };
    }
  }

  const language =
    input.language ||
    (input.right.filePath ? detectDiffLanguage(input.right.filePath) : '') ||
    (input.left.filePath ? detectDiffLanguage(input.left.filePath) : '') ||
    'plaintext';

  return {
    ok: true,
    session: {
      id: createSessionId(),
      left: input.left,
      right: input.right,
      layout: input.layout ?? 'side-by-side',
      readOnly: true,
      language,
    },
  };
}

export interface DiffLoaders {
  readFile: (filePath: string) => Promise<string>;
  gitShowFile: (workspaceId: string, relativePath: string, revision?: string) => Promise<string>;
}

/**
 * 「当前文件 vs 工作区文件」对比：右侧为当前编辑内容，左侧为磁盘文件内容。
 */
export async function loadWorkspaceFileDiffSession(
  loaders: DiffLoaders,
  input: {
    compareFilePath: string;
    compareLabel?: string;
    currentLabel: string;
    currentFilePath?: string | null;
    currentContent: string;
    currentIsDirty?: boolean;
    layout?: DiffLayout;
  },
): Promise<DiffSessionResult> {
  let leftContent: string;
  try {
    leftContent = await loaders.readFile(input.compareFilePath);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DIFF_READ_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const suffix = input.currentIsDirty ? '（未保存）' : '';
  return createDiffSession({
    left: {
      label: input.compareLabel ?? input.compareFilePath,
      filePath: input.compareFilePath,
      content: leftContent,
    },
    right: {
      label: `${input.currentLabel}${suffix}`,
      filePath: input.currentFilePath ?? null,
      content: input.currentContent,
    },
    language: detectDiffLanguage(input.compareFilePath || input.currentFilePath),
    layout: input.layout,
  });
}

/**
 * 「Git 变更差异」：左侧为 HEAD 版本，右侧为工作区当前磁盘内容。
 * 新文件（HEAD 中不存在）左侧为空，仍然可对比。
 */
export async function loadGitDiffSession(
  loaders: DiffLoaders,
  input: {
    workspaceId: string;
    rootPath: string;
    relativePath: string;
    currentContent?: string;
    staged?: boolean;
    layout?: DiffLayout;
  },
): Promise<DiffSessionResult> {
  // staged 与否都对比 HEAD，工作区内容始终取磁盘实时内容。
  const revision = 'HEAD';
  let leftContent = '';

  try {
    leftContent = await loaders.gitShowFile(input.workspaceId, input.relativePath, revision);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 新文件不在 HEAD 中属于正常情况，左侧留空；其他错误继续抛出为读取失败。
    const notInRevision = /not in|exists on disk|unknown revision|fatal: path/i.test(message);
    if (!notInRevision) {
      return {
        ok: false,
        error: { code: 'DIFF_READ_FAILED', message },
      };
    }
  }

  let rightContent = input.currentContent;
  if (rightContent === undefined) {
    const absolutePath = `${input.rootPath.replace(/[\\/]+$/, '')}/${input.relativePath}`;
    try {
      rightContent = await loaders.readFile(absolutePath);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'DIFF_READ_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  return createDiffSession({
    left: {
      label: `${input.relativePath} @ HEAD`,
      filePath: input.relativePath,
      content: leftContent,
    },
    right: {
      label: `${input.relativePath}（工作区）`,
      filePath: input.relativePath,
      content: rightContent,
    },
    language: detectDiffLanguage(input.relativePath),
    layout: input.layout,
  });
}
