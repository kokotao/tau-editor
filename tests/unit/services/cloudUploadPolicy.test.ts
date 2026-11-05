/**
 * UX-3A：云端上传/新建的文本类型白名单单测
 *
 * 白名单是三端（前端 / Rust / Java）的唯一对齐点：新增 `.mm` / `.opml` 后，
 * 前端应放行这两个导图文本格式，同时继续拒绝二进制与无扩展名文件。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { describe, expect, it } from 'vitest';
import {
  TEXT_DOC_EXTENSIONS,
  describeExtension,
  extensionOfPath,
  isTextDocPath,
} from '@/services/cloudUploadPolicy';

describe('cloudUploadPolicy 文本白名单', () => {
  it('包含 Tau 支持的三种导图文本格式 taumap / mm / opml', () => {
    expect(TEXT_DOC_EXTENSIONS).toContain('taumap');
    expect(TEXT_DOC_EXTENSIONS).toContain('mm');
    expect(TEXT_DOC_EXTENSIONS).toContain('opml');
  });

  it('isTextDocPath 放行导图文本格式（大小写不敏感）', () => {
    expect(isTextDocPath('notes/a.md')).toBe(true);
    expect(isTextDocPath('notes/a.taumap')).toBe(true);
    expect(isTextDocPath('notes/freemind.mm')).toBe(true);
    expect(isTextDocPath('notes/outline.OPML')).toBe(true);
  });

  it('仍然拒绝二进制与无扩展名文件', () => {
    expect(isTextDocPath('notes/a.png')).toBe(false);
    expect(isTextDocPath('notes/a.pdf')).toBe(false);
    expect(isTextDocPath('notes/README')).toBe(false);
    expect(describeExtension('notes/a.png')).toBe('.png');
    expect(describeExtension('notes/README')).toBe('无扩展名');
  });

  it('extensionOfPath 与后端口径一致（点开头按扩展名处理）', () => {
    expect(extensionOfPath('notes/Mixed.Md')).toBe('md');
    expect(extensionOfPath('notes/.env')).toBe('env');
    expect(extensionOfPath('notes/README')).toBe('');
    expect(extensionOfPath('notes/README.')).toBe('');
  });
});
