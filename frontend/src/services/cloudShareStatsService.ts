/**
 * @description 分享统计：拉取 stats、按天补零成连续序列（供简单 SVG 柱状图）、时间与 UA 展示纯函数。
 * 后端契约：GET /miniProgram/cloud/docs/{docId}/share/stats?days=30（owner 可读）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 21:30
 */
import { cloudCommands, isTauriApp, type CloudShareDailyPoint, type CloudShareStats } from '@/lib/tauri';
import { normalizeCloudError, type CloudOutcome } from '@/services/cloudDocService';

export interface DailySeriesPoint {
  /** YYYY-MM-DD */
  date: string;
  views: number;
  visitors: number;
}

/** 把后端按天数据补齐成连续 days 天（缺失补 0，按日期升序）。 */
export function buildDailySeries(
  daily: CloudShareDailyPoint[] | null | undefined,
  days = 30,
  today = new Date(),
): DailySeriesPoint[] {
  const window = Math.max(1, Math.min(days, 365));
  const byDate = new Map<string, CloudShareDailyPoint>();
  for (const point of daily ?? []) {
    if (point && typeof point.date === 'string' && point.date) {
      byDate.set(point.date.slice(0, 10), point);
    }
  }
  const series: DailySeriesPoint[] = [];
  for (let offset = window - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * 24 * 60 * 60 * 1000);
    const key = toDateKey(date);
    const point = byDate.get(key);
    series.push({
      date: key,
      views: Number(point?.views ?? 0) || 0,
      visitors: Number(point?.visitors ?? 0) || 0,
    });
  }
  return series;
}

/** 本地时区的 YYYY-MM-DD。 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 统计图表的最大值（全 0 时返回 1，避免除以 0）。 */
export function seriesMax(series: DailySeriesPoint[], key: 'views' | 'visitors' = 'views'): number {
  const max = series.reduce((acc, point) => Math.max(acc, point[key]), 0);
  return max > 0 ? max : 1;
}

/** 时间展示：失败/缺失返回占位符。 */
export function formatStatTime(value: string | null | undefined, locale = 'zh-CN'): string {
  if (!value) {
    return '—';
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleString(locale);
}

/** UA 简称：Chrome/Safari/Edge/Firefox/微信/其它。 */
export function shortenUserAgent(ua: string | null | undefined): string {
  const value = (ua ?? '').toLowerCase();
  if (!value) {
    return '未知';
  }
  if (value.includes('micromessenger')) {
    return '微信';
  }
  if (value.includes('edg/')) {
    return 'Edge';
  }
  if (value.includes('firefox/')) {
    return 'Firefox';
  }
  if (value.includes('chrome/')) {
    return 'Chrome';
  }
  if (value.includes('safari/')) {
    return 'Safari';
  }
  if (value.includes('curl') || value.includes('bot')) {
    return 'Bot';
  }
  return '其它';
}

/** 汇总是否为空（无任何访问）。 */
export function isEmptyStats(stats: CloudShareStats | null | undefined): boolean {
  if (!stats) {
    return true;
  }
  return (Number(stats.totalViews) || 0) === 0 && (stats.recent?.length ?? 0) === 0;
}

const WEB_UNSUPPORTED_MESSAGE = '当前是 Web 构建，云文档功能仅在 Tauri 桌面端可用。';

/** 拉取分享统计；失败返回可读 outcome（不抛出，避免阻塞分享主流程）。 */
export async function fetchShareStats(
  fileId: number,
  days = 30,
): Promise<CloudOutcome<CloudShareStats>> {
  if (!isTauriApp()) {
    return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
  }
  try {
    const stats = await cloudCommands.shareStats(fileId, days);
    return {
      ok: true,
      data: {
        shareUrl: stats.shareUrl ?? null,
        totalViews: Number(stats.totalViews ?? 0) || 0,
        uniqueVisitors: Number(stats.uniqueVisitors ?? 0) || 0,
        firstViewAt: stats.firstViewAt ?? null,
        lastViewAt: stats.lastViewAt ?? null,
        daily: Array.isArray(stats.daily) ? stats.daily : [],
        recent: Array.isArray(stats.recent) ? stats.recent : [],
      },
    };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }
}
