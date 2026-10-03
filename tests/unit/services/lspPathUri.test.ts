/**
 * @description 验证 LSP 文档 URI 与本地路径的跨平台转换。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:45
 */

import { describe, expect, it } from 'vitest';
import {
  isFileUri,
  isUntitledUri,
  pathToUri,
  untitledUri,
  uriToPath,
} from '@/services/lsp/pathUri';

describe('LSP pathUri', () => {
  it('converts POSIX paths and reserved characters to file URI', () => {
    const uri = pathToUri('/workspace/my file/#entry.ts', { platform: 'posix' });
    expect(uri).toBe('file:///workspace/my%20file/%23entry.ts');
    expect(uriToPath(uri, { platform: 'posix' })).toBe('/workspace/my file/#entry.ts');
    expect(isFileUri(uri)).toBe(true);
  });

  it('converts Windows drive and UNC paths', () => {
    const driveUri = pathToUri('C:\\Work\\main.ts', { platform: 'win32' });
    expect(driveUri).toBe('file:///C:/Work/main.ts');
    expect(uriToPath(driveUri, { platform: 'win32' })).toBe('C:/Work/main.ts');

    const uncUri = pathToUri('\\\\server\\share\\main.ts', { platform: 'win32' });
    expect(uncUri).toBe('file://server/share/main.ts');
    expect(uriToPath(uncUri, { platform: 'win32' })).toBe('//server/share/main.ts');
  });

  it('keeps untitled document IDs stable and distinguishes protocols', () => {
    const uri = untitledUri('tab/123');
    expect(uri).toBe('untitled://tab%2F123');
    expect(isUntitledUri(uri)).toBe(true);
    expect(uriToPath(uri)).toBeNull();
    expect(isFileUri(uri)).toBe(false);
  });

  it('returns null for invalid or unsupported URIs', () => {
    expect(uriToPath('not a URI')).toBeNull();
    expect(uriToPath('untitled://draft')).toBeNull();
  });
});
