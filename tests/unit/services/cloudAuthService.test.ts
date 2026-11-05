import {
  buildRegisterUrl, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cloudMocks = vi.hoisted(() => ({
  isTauri: { value: false },
  login: vi.fn(),
  logout: vi.fn(),
  session: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => cloudMocks.isTauri.value,
    cloudCommands: {
      ...actual.cloudCommands,
      login: cloudMocks.login,
      logout: cloudMocks.logout,
      session: cloudMocks.session,
    },
  };
});

import {
  buildRegisterUrl, TauriError } from '@/lib/tauri';
import {
  buildRegisterUrl,
  DEFAULT_CLOUD_BASE_URL,
  loginToLizi,
  logoutFromLizi,
  normalizeCloudBaseUrl,
  restoreCloudSession,
} from '@/services/cloudAuthService';

const storage = new Map<string, string>();
const fetchMock = vi.fn();

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
  } as unknown as Response;
}

describe('cloudAuthService normalizeCloudBaseUrl', () => {
  it('未填写地址时使用默认服务器', () => {
    expect(normalizeCloudBaseUrl()).toBe(DEFAULT_CLOUD_BASE_URL);
    expect(normalizeCloudBaseUrl(null)).toBe(DEFAULT_CLOUD_BASE_URL);
    expect(normalizeCloudBaseUrl('   ')).toBe(DEFAULT_CLOUD_BASE_URL);
  });

  it('应去掉尾部斜杠并保留端口与子路径', () => {
    expect(normalizeCloudBaseUrl('https://note.lizipro.cn/lizi/'))
      .toBe('https://note.lizipro.cn/lizi');
    expect(normalizeCloudBaseUrl('  http://127.0.0.1:8080/lizi/  '))
      .toBe('http://127.0.0.1:8080/lizi');
  });

  it('缺少 http(s) scheme 时应报错', () => {
    expect(() => normalizeCloudBaseUrl('note.lizipro.cn/lizi')).toThrow();
    expect(() => normalizeCloudBaseUrl('ftp://note.lizipro.cn')).toThrow();
  });
});

describe('cloudAuthService Web 分支', () => {
  beforeEach(async () => {
    cloudMocks.isTauri.value = false;
    cloudMocks.login.mockResolvedValue({
      signedIn: true,
      userId: null,
      username: null,
      baseUrl: DEFAULT_CLOUD_BASE_URL,
    });
    cloudMocks.logout.mockResolvedValue(undefined);
    cloudMocks.session.mockResolvedValue({
      signedIn: false,
      userId: null,
      username: null,
      baseUrl: DEFAULT_CLOUD_BASE_URL,
    });

    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, String(value));
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });

    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    // 清掉上一个用例可能残留的内存会话。
    await logoutFromLizi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('登录成功时读取响应头令牌并只在内存中保留会话', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(
        { success: true, code: 200, data: null },
        { headers: { 'X-Authorization-Lizi': 'token-1' } },
      ))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        code: 200,
        data: { userId: '42', usedBytes: 1, quotaBytes: 2, fileCount: 0, maxVersionPerFile: 30 },
      }));

    const outcome = await loginToLizi({
      baseUrl: 'https://note.lizipro.cn/lizi/',
      username: ' alice ',
      password: 'secret',
    });

    expect(outcome).toEqual({
      ok: true,
      data: {
        signedIn: true,
        userId: '42',
        username: 'alice',
        baseUrl: 'https://note.lizipro.cn/lizi',
      },
    });

    const loginCall = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    expect(loginCall?.[0]).toBe('https://note.lizipro.cn/lizi/user/login');
    expect(loginCall?.[1]?.method).toBe('POST');
    expect(String(loginCall?.[1]?.body)).toBe('username=alice&password=secret');

    const meCall = fetchMock.mock.calls[1] as [string, RequestInit] | undefined;
    expect(meCall?.[0]).toBe('https://note.lizipro.cn/lizi/miniProgram/cloud/docs/me');
    expect((meCall?.[1]?.headers as Record<string, string> | undefined)?.['X-Authorization-Lizi'])
      .toBe('token-1');

    // 绝不写 localStorage/sessionStorage。
    expect(storage.size).toBe(0);

    // token 只存在于模块内存，同一会话内可恢复。
    const restored = await restoreCloudSession();
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.data?.signedIn).toBe(true);
      expect(restored.data?.userId).toBe('42');
    }
  });

  it('服务端返回 401 时应归类为 unauthorized 且不留下会话', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(
      { success: false, code: 401, message: '未登录或登录已过期' },
      { status: 401 },
    ));

    const outcome = await loginToLizi({ username: 'alice', password: 'bad' });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('unauthorized');
      expect(outcome.message).toBe('未登录或登录已过期');
    }
    expect(storage.size).toBe(0);
    expect(await restoreCloudSession()).toEqual({ ok: true, data: null });
  });

  it('密码错误（HTTP 200 + body.code=300）应保留服务端文案且不判为登录过期', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(
      { success: false, code: 300, message: '密码错误' },
      { status: 200 },
    ));

    const outcome = await loginToLizi({ username: 'alice', password: 'bad' });

    expect(outcome).toEqual({ ok: false, kind: 'unknown', message: '密码错误' });
    expect(storage.size).toBe(0);
  });

  it('缺少授权令牌时应提示服务器地址可能不正确', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, code: 200, data: null }));

    const outcome = await loginToLizi({ username: 'alice', password: 'secret' });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('unknown');
      expect(outcome.message).toContain('授权令牌');
    }
  });

  it('网络异常应归类为 network', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const outcome = await loginToLizi({ username: 'alice', password: 'secret' });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('network');
    }
  });

  it('非法服务器地址应在发起请求前失败', async () => {
    const outcome = await loginToLizi({
      baseUrl: 'note.lizipro.cn/lizi',
      username: 'alice',
      password: 'secret',
    });

    expect(outcome.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('未登录时恢复会话返回 null，登出后内存会话被清空', async () => {
    expect(await restoreCloudSession()).toEqual({ ok: true, data: null });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(
        { success: true, code: 200, data: null },
        { headers: { 'X-Authorization-Lizi': 'token-2' } },
      ))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        code: 200,
        data: { userId: '7' },
      }));

    expect((await loginToLizi({ username: 'bob', password: 'pw' })).ok).toBe(true);
    expect((await restoreCloudSession()).ok).toBe(true);

    expect(await logoutFromLizi()).toEqual({ ok: true, data: undefined });
    expect(await restoreCloudSession()).toEqual({ ok: true, data: null });
  });
});

describe('cloudAuthService 桌面端分支', () => {
  beforeEach(() => {
    cloudMocks.isTauri.value = true;
    cloudMocks.login.mockResolvedValue({
      signedIn: true,
      userId: '7',
      username: 'alice',
      baseUrl: DEFAULT_CLOUD_BASE_URL,
    });
    cloudMocks.logout.mockResolvedValue(undefined);
    cloudMocks.session.mockResolvedValue({
      signedIn: true,
      userId: '7',
      username: 'alice',
      baseUrl: DEFAULT_CLOUD_BASE_URL,
    });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('桌面端登录应只调用 Rust 命令，前端不发 fetch', async () => {
    const outcome = await loginToLizi({
      baseUrl: 'https://note.lizipro.cn/lizi/',
      username: 'alice',
      password: 'pw',
    });

    expect(outcome.ok).toBe(true);
    expect(cloudMocks.login).toHaveBeenCalledWith(
      'https://note.lizipro.cn/lizi',
      'alice',
      'pw',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Rust 返回 UNAUTHORIZED 时应归类为 unauthorized', async () => {
    cloudMocks.login.mockRejectedValue(
      new TauriError('用户名或密码错误', 'cloud_login', null, 'UNAUTHORIZED'),
    );

    const outcome = await loginToLizi({ username: 'alice', password: 'bad' });

    expect(outcome).toEqual({
      ok: false,
      kind: 'unauthorized',
      message: '用户名或密码错误',
    });
  });

  it('桌面端会话恢复与登出都走 Rust 命令', async () => {
    const restored = await restoreCloudSession();
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.data?.signedIn).toBe(true);
    }

    expect(await logoutFromLizi()).toEqual({ ok: true, data: undefined });
    expect(cloudMocks.logout).toHaveBeenCalledTimes(1);
  });

  it('未登录的桌面会话应恢复为 null', async () => {
    cloudMocks.session.mockResolvedValue({
      signedIn: false,
      userId: null,
      username: null,
      baseUrl: DEFAULT_CLOUD_BASE_URL,
    });

    expect(await restoreCloudSession()).toEqual({ ok: true, data: null });
  });
});

describe('buildRegisterUrl 注册入口', () => {
  it('用服务器地址的 origin 拼注册页并带 source=tau', () => {
    expect(buildRegisterUrl('https://note.lizipro.cn/lizi')).toBe(
      'https://note.lizipro.cn/lizi/newUser/register?source=tau',
    );
    expect(buildRegisterUrl('https://note.lizipro.cn/lizi/some/path')).toBe(
      'https://note.lizipro.cn/lizi/newUser/register?source=tau',
    );
  });

  it('地址缺失或非法时回落到默认站点', () => {
    expect(buildRegisterUrl('')).toBe('https://note.lizipro.cn/lizi/newUser/register?source=tau');
    expect(buildRegisterUrl(null)).toBe('https://note.lizipro.cn/lizi/newUser/register?source=tau');
    expect(buildRegisterUrl('note.lizipro.cn/lizi')).toBe(
      'https://note.lizipro.cn/lizi/newUser/register?source=tau',
    );
  });
});