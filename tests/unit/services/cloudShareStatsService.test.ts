/**
 * @description 分享统计纯函数：按天补零、最大值、空数据、时间格式化、UA 简称。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 21:45
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTauri: { value: true },
  shareStats: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => mocks.isTauri.value,
    cloudCommands: { ...actual.cloudCommands, shareStats: mocks.shareStats },
  };
});

import {
  buildDailySeries,
  fetchShareStats,
  formatStatTime,
  isEmptyStats,
  seriesMax,
  shortenUserAgent,
  toDateKey,
} from '@/services/cloudShareStatsService';

const TODAY = new Date('2026-10-25T12:00:00+08:00');

describe('buildDailySeries 按天补零', () => {
  it('补齐缺失日期并保持升序', () => {
    const series = buildDailySeries(
      [
        { date: '2026-10-25', views: 3, visitors: 2 },
        { date: '2026-10-23', views: 1, visitors: 1 },
      ],
      4,
      TODAY,
    );

    expect(series.map((point) => point.date)).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(series.map((point) => point.views)).toEqual([0, 1, 0, 3]);
    expect(series.map((point) => point.visitors)).toEqual([0, 1, 0, 2]);
  });

  it('空数据返回全 0 序列', () => {
    const series = buildDailySeries([], 3, TODAY);
    expect(series).toHaveLength(3);
    expect(series.every((point) => point.views === 0 && point.visitors === 0)).toBe(true);
  });

  it('忽略脏数据（缺 date / 非数字）', () => {
    const series = buildDailySeries(
      [{ date: '', views: 9, visitors: 9 }, { date: '2026-10-25', views: Number.NaN as unknown as number, visitors: 1 }],
      2,
      TODAY,
    );
    expect(series.at(-1)).toMatchObject({ date: '2026-10-25', views: 0, visitors: 1 });
  });

  it('toDateKey 使用本地时区补零', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('seriesMax / isEmptyStats', () => {
  it('最大值用于图表缩放，全 0 时兜底 1', () => {
    expect(seriesMax([{ date: 'a', views: 2, visitors: 1 }, { date: 'b', views: 7, visitors: 3 }])).toBe(7);
    expect(seriesMax([{ date: 'a', views: 0, visitors: 0 }])).toBe(1);
  });

  it('空数据判定', () => {
    expect(isEmptyStats(null)).toBe(true);
    expect(isEmptyStats({ totalViews: 0, uniqueVisitors: 0, daily: [], recent: [] })).toBe(true);
    expect(isEmptyStats({ totalViews: 1, uniqueVisitors: 1, daily: [], recent: [] })).toBe(false);
  });
});

describe('formatStatTime / shortenUserAgent', () => {
  it('时间格式化与占位', () => {
    expect(formatStatTime(null)).toBe('—');
    expect(formatStatTime('')).toBe('—');
    expect(formatStatTime('不是时间')).toBe('不是时间');
    expect(formatStatTime('2026-10-25T10:00:00Z', 'zh-CN')).toContain('2026');
  });

  it('UA 简称', () => {
    expect(shortenUserAgent('Mozilla/5.0 Chrome/120 Safari/537')).toBe('Chrome');
    expect(shortenUserAgent('Mozilla/5.0 Edg/120')).toBe('Edge');
    expect(shortenUserAgent('Mozilla/5.0 Firefox/121')).toBe('Firefox');
    expect(shortenUserAgent('MicroMessenger/8.0')).toBe('微信');
    expect(shortenUserAgent('')).toBe('未知');
  });
});

describe('fetchShareStats', () => {
  beforeEach(() => {
    mocks.isTauri.value = true;
    mocks.shareStats.mockResolvedValue({
      shareUrl: 'https://note.lizipro.cn/s/tok',
      totalViews: 12,
      uniqueVisitors: 5,
      firstViewAt: '2026-10-20T10:00:00Z',
      lastViewAt: '2026-10-25T10:00:00Z',
      daily: [{ date: '2026-10-25', views: 3, visitors: 2 }],
      recent: [{ time: '2026-10-25T10:00:00Z', ipMasked: '1.2.*.*', fingerprintShort: 'ab12cd', ua: 'Chrome', isNewVisitor: true }],
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('归一化数字与数组', async () => {
    const outcome = await fetchShareStats(42);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.totalViews).toBe(12);
      expect(outcome.data.daily).toHaveLength(1);
      expect(outcome.data.recent[0]?.isNewVisitor).toBe(true);
    }
  });

  it('无权限返回 forbidden（供 UI 展示专用文案，不触发登出）', async () => {
    mocks.shareStats.mockRejectedValue(Object.assign(new Error('没有权限'), { code: 'FORBIDDEN' }));
    const outcome = await fetchShareStats(42);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('forbidden');
    }
  });

  it('Web 构建直接 unsupported', async () => {
    mocks.isTauri.value = false;
    const outcome = await fetchShareStats(42);
    expect(outcome.ok).toBe(false);
    expect(mocks.shareStats).not.toHaveBeenCalled();
  });
});
