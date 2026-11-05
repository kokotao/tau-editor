/**
 * XML 文本工具（阶段 3）
 *
 * 导入安全约定：
 * - 只做文本级转义/反转义与简单标签读取，不执行任何外部实体、DTD 或网络访问；
 * - 解析限制在受支持的标签结构，遇到不支持的内容按「有损」记录而非执行。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(value: string): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => XML_ESCAPES[char] ?? char);
}

export function unescapeXml(value: string): string {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 提取某个属性的原始值（不处理实体，调用方按需 unescape）。 */
export function readXmlAttribute(attributeSource: string, name: string): string | null {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = attributeSource.match(pattern);
  if (!match) return null;
  return match[2] ?? match[3] ?? '';
}

/** 判断文本是否声明了外部实体/DTD（安全边界：直接拒绝解析）。 */
export function containsUnsafeXmlDoctype(source: string): boolean {
  return /<!DOCTYPE|<!ENTITY/i.test(source);
}

/** 去掉 XML 注释，避免注释内容被误当作结构解析。 */
export function stripXmlComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, '');
}