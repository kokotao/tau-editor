/**
 * @description 分享统计弹窗：总数卡片、近 30 天 SVG、最近访问列表，以及空/失败/无权限状态。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 21:50
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  fetchStats: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return { ...actual, isTauriApp: () => true };
});

vi.mock('@/services/cloudShareStatsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudShareStatsService')>();
  return { ...actual, fetchShareStats: mocks.fetchStats };
});

import ShareStatsDialog from '@/components/editor/ShareStatsDialog.vue';

/**
 * 生成「相对今天」的日期串（YYYY-MM-DD）。
 *
 * 图表按 days 窗口过滤 daily，若这里写死日期，测试会在真实时间走过窗口后必然失败
 * （曾出现：fixture 写 2026-10-25，到了 11-01 跑 7 天窗口就没有数据了）。因此统一用相对日期。
 */
const dayOffset = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** 相对今天的 ISO 时间串（展示用，不参与窗口过滤）。 */
const isoDaysAgo = (offset: number): string => `${dayOffset(offset)}T10:00:00Z`;

const STATS = {
  shareUrl: 'https://note.lizipro.cn/s/tok',
  totalViews: 12,
  uniqueVisitors: 5,
  firstViewAt: isoDaysAgo(6),
  lastViewAt: isoDaysAgo(1),
  daily: [
    { date: dayOffset(1), views: 4, visitors: 2 },
    { date: dayOffset(2), views: 8, visitors: 3 },
  ],
  recent: [
    {
      time: isoDaysAgo(1),
      ipMasked: '1.2.*.*',
      fingerprintShort: 'ab12cd',
      ua: 'Mozilla/5.0 Chrome/120',
      referer: '',
      isNewVisitor: true,
    },
  ],
};

const mountDialog = (props: Record<string, unknown> = {}) =>
  mount(ShareStatsDialog, {
    props: { visible: true, fileId: 42, fileName: 'a.md', ...props },
  });

describe('ShareStatsDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.fetchStats.mockResolvedValue({ ok: true, data: STATS });
  });
  afterEach(() => vi.clearAllMocks());

  it('打开时拉取统计并展示总数卡片', async () => {
    const wrapper = mountDialog();
    await flushPromises();

    expect(mocks.fetchStats).toHaveBeenCalledWith(42, 30);
    expect(wrapper.get('[data-testid="share-stats-total-views"]').text()).toBe('12');
    expect(wrapper.get('[data-testid="share-stats-unique-visitors"]').text()).toBe('5');
    expect(wrapper.get('[data-testid="share-stats-first-view"]').text()).not.toBe('—');
  });

  it('渲染近 30 天图表与最近访问列表', async () => {
    const wrapper = mountDialog();
    await flushPromises();

    const bars = wrapper.get('[data-testid="share-stats-chart"]').findAll('rect');
    expect(bars).toHaveLength(30);
    const recent = wrapper.get('[data-testid="share-stats-recent"]');
    expect(recent.text()).toContain('1.2.*.*');
    expect(recent.text()).toContain('ab12cd');
    expect(recent.text()).toContain('Chrome');
    expect(recent.text()).toContain('新访客');
  });

  it('柱宽随统计天数自适应：days>30 时柱子不互相覆盖', async () => {
    const wrapper = mountDialog({ days: 90 });
    await flushPromises();

    const bars = wrapper.get('[data-testid="share-stats-chart"]').findAll('rect');
    expect(bars).toHaveLength(90);
    const step = 300 / 90;
    const width = Number.parseFloat(bars[0]!.attributes('width') ?? '0');
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(step);
    // 后一根柱子的 x 必须在上一次之后（不重叠）
    const xs = bars.map((bar) => Number.parseFloat(bar.attributes('x') ?? '0'));
    for (let index = 1; index < xs.length; index += 1) {
      expect(xs[index]!).toBeGreaterThan(xs[index - 1]!);
    }
    // 7 天窗口也不会把柱子压成 8px 窄条
    const weekly = mountDialog({ days: 7 });
    await flushPromises();
    const weeklyWidth = Number.parseFloat(
      weekly.get('[data-testid="share-stats-chart"]').findAll('rect')[0]!.attributes('width') ?? '0',
    );
    expect(weeklyWidth).toBeGreaterThan(8);
    wrapper.unmount();
    weekly.unmount();
  });

  it('空数据给出可读状态', async () => {
    mocks.fetchStats.mockResolvedValue({
      ok: true,
      data: { totalViews: 0, uniqueVisitors: 0, daily: [], recent: [] },
    });
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.find('[data-testid="share-stats-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="share-stats-summary"]').exists()).toBe(false);
  });

  it('加载失败展示原因', async () => {
    mocks.fetchStats.mockResolvedValue({ ok: false, kind: 'network', message: '连不上服务器' });
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.get('[data-testid="share-stats-error"]').text()).toContain('连不上服务器');
  });

  it('无权限（非 owner）给专用文案', async () => {
    mocks.fetchStats.mockResolvedValue({ ok: false, kind: 'unauthorized', message: '403' });
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.get('[data-testid="share-stats-error"]').text()).toContain('只有文档所有者');
  });

  it('刷新按钮重新拉取', async () => {
    const wrapper = mountDialog();
    await flushPromises();
    await wrapper.get('[data-testid="share-stats-refresh"]').trigger('click');
    await flushPromises();

    expect(mocks.fetchStats).toHaveBeenCalledTimes(2);
  });
});
