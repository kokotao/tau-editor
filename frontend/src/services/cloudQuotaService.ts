/**
 * @description 云配额 / 签到 / 积分服务：把 Rust 会员体系命令包装成统一的 CloudOutcome。
 *              与 cloudDocService 共用错误归一化（TauriError.code → 业务错误类型），
 *              前端不直接持有令牌，全部由 Rust 侧带 JWT 请求。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 17:05
 */
import {
  cloudQuotaCommands,
  isTauriApp,
  type CloudCheckinResult,
  type CloudCheckinStatus,
  type CloudPoints,
  type CloudQuotaOrder,
  type CloudQuotaPay,
  type CloudQuotaPlan,
  type CloudQuotaSummary,
} from '@/lib/tauri';
import { normalizeCloudError, type CloudOutcome } from '@/services/cloudDocService';

const WEB_UNSUPPORTED_MESSAGE = '当前是 Web 构建，会员与签到功能仅在 Tauri 桌面端可用。';

/** 支付通道未开通 / 微信商户未配置：前端据此降级到「联系管理员」。 */
export const PAY_CHANNEL_UNAVAILABLE_PATTERN = /支付通道|未开通|未配置|商户|pay.?channel/i;

function unsupported<T>(): CloudOutcome<T> {
  return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
}

function failure<T>(error: unknown): CloudOutcome<T> {
  const normalized = normalizeCloudError(error);
  return { ok: false, kind: normalized.kind, message: normalized.message };
}

/** 云配额一次性拉取：summary + plans + 签到状态 + 积分（各接口互不阻塞）。 */
export interface CloudQuotaSnapshot {
  summary: CloudQuotaSummary;
  plans: CloudQuotaPlan[];
  checkin: CloudCheckinStatus;
  points: CloudPoints;
}

async function guarded<T>(run: () => Promise<T>): Promise<CloudOutcome<T>> {
  if (!isTauriApp()) {
    return unsupported<T>();
  }
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return failure<T>(error);
  }
}

export function getQuotaSummary(): Promise<CloudOutcome<CloudQuotaSummary>> {
  return guarded(() => cloudQuotaCommands.summary());
}

export function getQuotaPlans(): Promise<CloudOutcome<CloudQuotaPlan[]>> {
  return guarded(async () => {
    const plans = await cloudQuotaCommands.plans();
    return Array.isArray(plans) ? plans : [];
  });
}

export function createQuotaOrder(planId: number): Promise<CloudOutcome<CloudQuotaOrder>> {
  return guarded(() => cloudQuotaCommands.createOrder(planId, createClientOrderNo()));
}

export function getQuotaOrder(orderNo: string): Promise<CloudOutcome<CloudQuotaOrder>> {
  return guarded(() => cloudQuotaCommands.orderStatus(orderNo));
}

export function payQuotaOrder(orderNo: string): Promise<CloudOutcome<CloudQuotaPay>> {
  return guarded(() => cloudQuotaCommands.payQr(orderNo));
}

export function getCheckinStatus(): Promise<CloudOutcome<CloudCheckinStatus>> {
  return guarded(() => cloudQuotaCommands.checkinStatus());
}

export function checkinNow(): Promise<CloudOutcome<CloudCheckinResult>> {
  return guarded(() => cloudQuotaCommands.checkin());
}

export function getPoints(): Promise<CloudOutcome<CloudPoints>> {
  return guarded(() => cloudQuotaCommands.points());
}

/**
 * 下单幂等键：同一次点击只生成一个 UUID，服务端 `uk_client_order_no` 兜底重复下单。
 * crypto.randomUUID 在 Tauri（Chromium/WebKit）与 happy-dom 之外的环境都可用，
 * 缺失时退化成时间戳 + 随机串，仍满足「同一秒内不碰撞」的要求。
 */
export function createClientOrderNo(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `clq-${Date.now().toString(36)}-${random}`;
}

/** 支付通道是否不可用（用于把 503 之类降级成「联系管理员开通」）。 */
export function isPayChannelUnavailable(outcome: CloudOutcome<unknown>): boolean {
  if (outcome.ok) {
    return false;
  }
  return PAY_CHANNEL_UNAVAILABLE_PATTERN.test(outcome.message) || outcome.kind === 'unsupported';
}

/** 汇总接口（UI 里按 module 方式调用更顺手）。 */
export const cloudQuotaService = {
  summary: getQuotaSummary,
  plans: getQuotaPlans,
  createOrder: createQuotaOrder,
  orderStatus: getQuotaOrder,
  payQr: payQuotaOrder,
  checkinStatus: getCheckinStatus,
  checkin: checkinNow,
  points: getPoints,
};
