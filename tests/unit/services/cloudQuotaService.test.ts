/**
 * @description 云配额服务：Tauri 命令包装层（未登录/未上桌面端/支付通道不可用）的降级契约。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 17:20
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({
  isTauri: { value: true },
  summary: vi.fn(),
  plans: vi.fn(),
  createOrder: vi.fn(),
  orderStatus: vi.fn(),
  payQr: vi.fn(),
  checkinStatus: vi.fn(),
  checkin: vi.fn(),
  points: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => tauriMocks.isTauri.value,
    cloudQuotaCommands: {
      summary: tauriMocks.summary,
      plans: tauriMocks.plans,
      createOrder: tauriMocks.createOrder,
      orderStatus: tauriMocks.orderStatus,
      payQr: tauriMocks.payQr,
      checkinStatus: tauriMocks.checkinStatus,
      checkin: tauriMocks.checkin,
      points: tauriMocks.points,
    },
  };
});

import {
  checkinNow,
  cloudQuotaService,
  createClientOrderNo,
  createQuotaOrder,
  getQuotaPlans,
  getQuotaSummary,
  isPayChannelUnavailable,
  payQuotaOrder,
} from '@/services/cloudQuotaService';

const SUMMARY = {
  usedBytes: 1024,
  permanentBytes: 8 * 1024 ** 3,
  planBytes: 0,
  rewardBytes: 0,
  quotaBytes: 8 * 1024 ** 3,
  tier: 'FREE' as const,
  tierName: '免费版',
  renewAt: null,
  rewardCapBytes: 10 * 1024 ** 3,
  rewardLifetimeBytes: 0,
  points: 0,
};

beforeEach(() => {
  tauriMocks.isTauri.value = true;
  vi.clearAllMocks();
});

describe('cloudQuotaService', () => {
  it('summary 成功时返回 ok + 数据', async () => {
    tauriMocks.summary.mockResolvedValue(SUMMARY);
    const outcome = await getQuotaSummary();
    expect(outcome).toEqual({ ok: true, data: SUMMARY });
  });

  it('Web 构建（非 Tauri）不发请求，直接 unsupported', async () => {
    tauriMocks.isTauri.value = false;
    const outcome = await getQuotaSummary();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('unsupported');
      expect(outcome.message).toContain('Tauri');
    }
    expect(tauriMocks.summary).not.toHaveBeenCalled();
  });

  it('plans 返回非数组时收敛成空数组，避免弹窗渲染崩', async () => {
    tauriMocks.plans.mockResolvedValue(null);
    const outcome = await getQuotaPlans();
    expect(outcome).toEqual({ ok: true, data: [] });
  });

  it('下单带上幂等键（UUID 形态，非空）', async () => {
    tauriMocks.createOrder.mockResolvedValue({
      orderNo: 'CLQ1',
      amount: 600,
      status: 'PENDING_PAY',
    });
    const outcome = await createQuotaOrder(101);
    expect(outcome.ok).toBe(true);
    const [planId, clientOrderNo] = tauriMocks.createOrder.mock.calls[0]!;
    expect(planId).toBe(101);
    expect(typeof clientOrderNo).toBe('string');
    expect((clientOrderNo as string).length).toBeGreaterThan(8);
  });

  it('未登录（UNAUTHORIZED）归一化为 unauthorized，并保留服务端 message', async () => {
    tauriMocks.checkin.mockRejectedValue(
      Object.assign(new Error('尚未登录 lizi 账号，请先登录'), { code: 'UNAUTHORIZED' }),
    );
    const outcome = await checkinNow();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('unauthorized');
      expect(outcome.message).toContain('尚未登录');
    }
  });

  it('支付通道 503 被识别为「需降级到联系管理员」', async () => {
    tauriMocks.payQr.mockRejectedValue(
      Object.assign(new Error('支付通道未开通，请联系管理员开通'), { code: 'SECURITY_UNAVAILABLE' }),
    );
    const outcome = await payQuotaOrder('CLQ1');
    expect(isPayChannelUnavailable(outcome)).toBe(true);
  });

  it('普通网络失败不会被误判成支付通道不可用', async () => {
    tauriMocks.payQr.mockRejectedValue(
      Object.assign(new Error('网络连接超时'), { code: 'NETWORK_ERROR' }),
    );
    const outcome = await payQuotaOrder('CLQ1');
    expect(isPayChannelUnavailable(outcome)).toBe(false);
  });

  it('createClientOrderNo 稳定返回可作幂等键的字符串', () => {
    const first = createClientOrderNo();
    const second = createClientOrderNo();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9-]+$/);
  });

  it('导出对象与具名函数指向同一实现（UI 两种用法都成立）', () => {
    expect(cloudQuotaService.summary).toBe(getQuotaSummary);
  });
});
