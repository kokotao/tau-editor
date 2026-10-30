/**
 * @description 云端上传的扩展名策略（唯一事实来源）：与后端 `CloudDocPathValidator.TEXT_EXTENSIONS`
 * 逐项对齐的文本白名单，供「批量上传」(R2) 与「上传文件夹」(R3) 共用。
 *
 * 为什么必须对齐：后端 `validateTextFile` 只接受白名单内的扩展名（`.svelte`/`.lua`/无扩展名的
 * `Makefile` 都会被 400 拒绝）。前端若比后端宽松，这些文件会先显示「将上传」再逐条变成「失败」，
 * 用户无法区分「不支持该类型」与「上传出错」。提前按白名单跳过，才能给出可读的跳过原因。
 *
 * 维护约定：后端改白名单时这里必须同步（后端位置见上面的类名注释）。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28
 */

/**
 * 允许同步为云文档（文本）的扩展名，小写、不含点。
 * 与后端 `CloudDocPathValidator.TEXT_EXTENSIONS` 一一对应（54 项，含 Tau 支持的导图文本格式
 * `.taumap` / `.mm` / `.opml`）。
 */
export const TEXT_DOC_EXTENSIONS: readonly string[] = [
  'md', 'markdown', 'mdx', 'txt', 'json', 'yaml', 'yml', 'toml', 'ini', 'conf',
  'properties', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'py', 'java',
  'kt', 'go', 'rs', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php',
  'rb', 'sh', 'bash', 'zsh', 'bat', 'ps1', 'html', 'htm', 'css', 'scss',
  'sass', 'less', 'xml', 'sql', 'log', 'csv', 'tex', 'gradle', 'gitignore', 'env',
  'cfg',
  // Tau 原生思维导图（UTF-8 JSON 文本），需与 Rust / Java 白名单保持一致
  'taumap',
  // Tau 支持导入/只读打开的外部导图文本格式（FreeMind .mm / OPML .opml），三端白名单必须同步
  'mm', 'opml',
];

/**
 * 取小写扩展名（不含点），与后端 `CloudDocPathValidator.extension` 的行为保持一致：
 * 无点（`Makefile`）或以点结尾（`a.`）返回空串；点开头的文件名（`.env`）按后端口径取 `env`。
 */
export function extensionOfPath(filePath: string | null | undefined): string {
  const name = (filePath ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  const index = name.lastIndexOf('.');
  if (index < 0 || index === name.length - 1) {
    return '';
  }
  return name.slice(index + 1).toLowerCase();
}

/** 是否是后端认可的文本类扩展名（无扩展名一律不是）。 */
export function isTextDocPath(filePath: string | null | undefined): boolean {
  return TEXT_DOC_EXTENSIONS.includes(extensionOfPath(filePath));
}

/** 跳过文案里展示的类型：`.svelte` / `无扩展名`。 */
export function describeExtension(filePath: string | null | undefined): string {
  const extension = extensionOfPath(filePath);
  return extension ? `.${extension}` : '无扩展名';
}

/** 不支持类型的跳过原因（R2/R3 共用同一句话，避免两处漂移）。 */
export function unsupportedTextReason(filePath: string | null | undefined): string {
  return `不支持的文件类型（${describeExtension(filePath)}）`;
}
