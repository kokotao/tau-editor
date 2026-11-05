/**
 * @description 云存储扩容方案面板：
 *              既有 6 条断言（用量换算 / 三档位 + 永久包 / 签到规则文案 / emit / quota=0 / visible=false）
 *              保持不回归；新增容量构成、档位来自 store、签到调用、支付降级与扫码流程、微信入口 emit。
 *
 * 数据层 mock 策略：真实 `useCloudQuotaStore()` + mock `@/services/cloudQuotaService`，
 * 因此既覆盖「接口成功」也覆盖「未登录/接口不可用」两条降级分支，且不会真的发 Tauri 命令。
 * `qrcode` 也做 mock：真实实现依赖 canvas/png 渲染，单测里只验证 codeUrl → dataURL 的接线。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 15:30
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const mocks = vi.hoisted(() => ({
  getQuotaSummary: vi.fn(),
  getQuotaPlans: vi.fn(),
  createQuotaOrder: vi.fn(),
  getQuotaOrder: vi.fn(),
  payQuotaOrder: vi.fn(),
  getCheckinStatus: vi.fn(),
  checkinNow: vi.fn(),
  getPoints: vi.fn(),
  isPayChannelUnavailable: vi.fn(),
  qrToDataUrl: vi.fn(),
}));

vi.mock('@/services/cloudQuotaService', () => ({
  getQuotaSummary: mocks.getQuotaSummary,
  getQuotaPlans: mocks.getQuotaPlans,
  createQuotaOrder: mocks.createQuotaOrder,
  getQuotaOrder: mocks.getQuotaOrder,
  payQuotaOrder: mocks.payQuotaOrder,
  getCheckinStatus: mocks.getCheckinStatus,
  checkinNow: mocks.checkinNow,
  getPoints: mocks.getPoints,
  isPayChannelUnavailable: mocks.isPayChannelUnavailable,
  createClientOrderNo: () => 'client-order-test',
}));

// 注意：`qrcode` 装在 frontend/node_modules（根目录没有），所以裸 'qrcode' 在测试文件里解析不到；
// 必须按组件实际解析到的文件路径 mock，否则 mock 不生效、会跑真实二维码渲染（canvas/pngjs，慢且与环境相关）。
vi.mock('../../../frontend/node_modules/qrcode/lib/index.js', () => ({
  default: { toDataURL: mocks.qrToDataUrl },
}));

import CloudUpgradePlanDialog from '@/components/editor/CloudUpgradePlanDialog.vue';
import { useCloudSyncStore } from '@/stores/cloudSync';

const q = (id: string) => document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const WEB_UNSUPPORTED = '当前是 Web 构建，会员与签到功能仅在 Tauri 桌面端可用。';
const PAY_CHANNEL_PATTERN = /支付通道|未开通|未配置|商户|pay.?channel/i;

/** 接口不可用（未登录 / Web 构建）：组件必须走降级分支。 */
const unsupported = () =>
  Promise.resolve({ ok: false as const, kind: 'unsupported', message: WEB_UNSUPPORTED });

const summaryFixture = {
  usedBytes: 5 * MB,
  permanentBytes: GB,
  planBytes: 10 * GB,
  rewardBytes: 70 * MB,
  quotaBytes: 11 * GB + 70 * MB,
  tier: 'PLUS',
  tierName: 'Plus 个人版',
  renewAt: null,
  rewardCapBytes: 10 * GB,
  rewardLifetimeBytes: 140 * MB,
  points: 40,
};

const planFixture = [
  { planId: 101, code: 'CLOUD_PLUS_MONTH', tier: 'PLUS', name: 'Plus', bytes: 10 * GB, cycle: 'MONTH', price: 600 },
  { planId: 102, code: 'CLOUD_PLUS_YEAR', tier: 'PLUS', name: 'Plus', bytes: 10 * GB, cycle: 'YEAR', price: 5800 },
  { planId: 103, code: 'CLOUD_PRO_MONTH', tier: 'PRO', name: 'Pro', bytes: 50 * GB, cycle: 'MONTH', price: 1800 },
  { planId: 104, code: 'CLOUD_PRO_YEAR', tier: 'PRO', name: 'Pro', bytes: 50 * GB, cycle: 'YEAR', price: 16800 },
  { planId: 105, code: 'CLOUD_PACK_10G', tier: 'PACK', name: 'Pack', bytes: 10 * GB, cycle: 'ONE_TIME', price: 3900 },
];

const checkinFixture = {
  todayChecked: false,
  streakDays: 3,
  rewardActiveBytes: 70 * MB,
  rewardLifetimeBytes: 140 * MB,
  rewardCapBytes: 10 * GB,
  points: 40,
};

const pointsFixture = { balance: 40, lifetimeEarned: 40, recent: [] };

/** 让 store 拿到「已登录 + 接口正常」的数据。 */
function stubSignedIn(): void {
  mocks.getQuotaSummary.mockImplementation(() => Promise.resolve({ ok: true, data: summaryFixture }));
  mocks.getQuotaPlans.mockImplementation(() => Promise.resolve({ ok: true, data: planFixture }));
  mocks.getCheckinStatus.mockImplementation(() => Promise.resolve({ ok: true, data: checkinFixture }));
  mocks.getPoints.mockImplementation(() => Promise.resolve({ ok: true, data: pointsFixture }));
}

const wrappers: VueWrapper[] = [];

function mountDialog(props: Record<string, unknown> = {}) {
  const wrapper = mount(CloudUpgradePlanDialog, {
    props: { visible: true, usedBytes: 1024 * 1024, quotaBytes: 8 * 1024 * 1024 * 1024, ...props },
  });
  wrappers.push(wrapper);
  return wrapper;
}

/** 挂载 + 等 store.loadAll() 落地。 */
async function mountDialogLoaded(props: Record<string, unknown> = {}) {
  const wrapper = mountDialog(props);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.getQuotaSummary.mockImplementation(unsupported);
  mocks.getQuotaPlans.mockImplementation(unsupported);
  mocks.createQuotaOrder.mockImplementation(unsupported);
  mocks.getQuotaOrder.mockImplementation(unsupported);
  mocks.payQuotaOrder.mockImplementation(unsupported);
  mocks.getCheckinStatus.mockImplementation(unsupported);
  mocks.checkinNow.mockImplementation(unsupported);
  mocks.getPoints.mockImplementation(unsupported);
  mocks.isPayChannelUnavailable.mockImplementation((outcome: { ok: boolean; kind?: string; message?: string }) =>
    !outcome.ok &&
    (outcome.kind === 'unsupported' || PAY_CHANNEL_PATTERN.test(outcome.message ?? '')),
  );
  mocks.qrToDataUrl.mockImplementation(async () => 'data:image/png;base64,QRDATA');
});

afterEach(() => {
  while (wrappers.length > 0) {
    wrappers.pop()?.unmount();
  }
  document.body.innerHTML = '';
});

describe('CloudUpgradePlanDialog', () => {
  it('渲染真实用量（1 MB / 8 GB）与剩余容量', () => {
    mountDialog();
    const usage = q('cloud-upgrade-usage-value')?.textContent ?? '';
    expect(usage).toContain('1.00 MB');
    expect(usage).toContain('8.00 GB');

    const dialogText = q('cloud-upgrade-dialog')?.textContent ?? '';
    expect(dialogText).toContain('剩余');
    // 8 GB - 1 MB 仍是 8.00 GB（保留两位），这里断言的是"剩余行存在且数值合理"
    const note = document.body.querySelector('.cloud-upgrade__usage-note')?.textContent ?? '';
    expect(note).toContain('剩余');
    expect(note).toContain('GB');
  });

  it('渲染三个档位（不含团队版）与永久扩容包', () => {
    mountDialog();
    for (const id of ['free', 'plus', 'pro']) {
      expect(q(`cloud-upgrade-tier-${id}`)).not.toBeNull();
    }
    expect(q('cloud-upgrade-tier-team')).toBeNull();

    const tiers = q('cloud-upgrade-tiers')?.textContent ?? '';
    expect(tiers).toContain('免费版');
    expect(tiers).toContain('1 GB');
    expect(tiers).toContain('10 GB');
    expect(tiers).toContain('50 GB');
    expect(tiers).toContain('¥18 / 月');
    expect(q('cloud-upgrade-pack')?.textContent).toContain('+10 GB');
  });

  it('签到规则体现随机增量 + 滑动窗口 + 累计封顶 10 GB', () => {
    mountDialog();
    const rewards = q('cloud-upgrade-rewards')?.textContent ?? '';
    expect(rewards).toContain('随机');
    expect(rewards).toContain('滑动窗口');
    expect(rewards).toContain('10 GB');
    expect(rewards).toContain('连续签到');
  });

  it('关闭与联系管理员各自 emit', async () => {
    const wrapper = mountDialog();
    q('cloud-upgrade-close')!.click();
    q('cloud-upgrade-contact')!.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('contact')).toHaveLength(1);
  });

  it('配额为 0 时用量百分比不出现 NaN', () => {
    mountDialog({ usedBytes: 0, quotaBytes: 0 });
    const bar = document.body.querySelector('.cd-progress__bar') as HTMLElement | null;
    expect(bar?.style.width).toBe('0%');
  });

  it('visible=false 时不渲染', () => {
    mountDialog({ visible: false });
    expect(q('cloud-upgrade-dialog')).toBeNull();
  });

  it('接口不可用时降级：购买/签到按钮不可用并提示登录', async () => {
    await mountDialogLoaded();

    expect(q('cloud-upgrade-login-hint')).not.toBeNull();
    expect((q('cloud-upgrade-buy-plus') as HTMLButtonElement).disabled).toBe(true);
    expect((q('cloud-upgrade-buy-pro') as HTMLButtonElement).disabled).toBe(true);
    expect((q('cloud-upgrade-buy-pack') as HTMLButtonElement).disabled).toBe(true);
    expect((q('cloud-upgrade-checkin-btn') as HTMLButtonElement).disabled).toBe(true);
    // 人工通道始终可用
    expect(q('cloud-upgrade-contact')).not.toBeNull();
    // 用量仍回退 props，不出现 NaN
    expect(q('cloud-upgrade-usage-value')?.textContent).toContain('8.00 GB');
  });

  it('已登录但配额接口不可用：提示「自助开通暂不可用」而不是「请先登录」', async () => {
    // 后端未部署新接口时：会话是有效的，但 /quota/summary 404/网络失败
    useCloudSyncStore().signedIn = true;
    await mountDialogLoaded();

    expect(q('cloud-upgrade-quota-unavailable')).not.toBeNull();
    expect(q('cloud-upgrade-login-hint')).toBeNull();
    expect((q('cloud-upgrade-buy-plus') as HTMLButtonElement).disabled).toBe(true);
    expect(q('cloud-upgrade-contact')).not.toBeNull();
  });

  it('档位数据来自 store.plans，支持按月/按年切换', async () => {
    stubSignedIn();
    await mountDialogLoaded();

    const tiers = q('cloud-upgrade-tiers')?.textContent ?? '';
    expect(tiers).toContain('¥6 / 月');
    expect(tiers).toContain('10 GB');
    expect(tiers).toContain('50 GB');
    // 接口通了：购买按钮可用（已登录 + 有对应 SKU）
    expect((q('cloud-upgrade-buy-plus') as HTMLButtonElement).disabled).toBe(false);

    (q('cloud-upgrade-cycle-pro-year') as HTMLButtonElement).click();
    await nextTick();
    expect(q('cloud-upgrade-tier-pro')?.textContent).toContain('¥168 / 年');
  });

  it('渲染容量构成（永久 / 档位 / 签到临时）与积分', async () => {
    stubSignedIn();
    await mountDialogLoaded();

    const breakdown = q('cloud-upgrade-breakdown')?.textContent ?? '';
    expect(breakdown).toContain('永久配额');
    expect(breakdown).toContain('1.00 GB');
    expect(breakdown).toContain('档位容量');
    expect(breakdown).toContain('10 GB');
    expect(breakdown).toContain('签到临时');
    expect(breakdown).toContain('70 MB');

    expect(q('cloud-upgrade-points')?.textContent).toContain('40');
  });

  it('签到按钮调用 store.checkin 并回显本次容量', async () => {
    stubSignedIn();
    mocks.checkinNow.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        data: {
          grantedBytes: 70 * MB,
          doubled: false,
          streakDays: 4,
          points: 50,
          pointsDelta: 10,
          rewardActiveBytes: 140 * MB,
          expiresAt: null,
          checkinDate: '2026-10-27',
        },
      }),
    );
    await mountDialogLoaded();

    (q('cloud-upgrade-checkin-btn') as HTMLButtonElement).click();
    await flushPromises();

    expect(mocks.checkinNow).toHaveBeenCalledTimes(1);
    expect(q('cloud-upgrade-checkin-message')?.textContent).toContain('70 MB');
    // 签到成功后 summary 会刷新（容量与积分都变了）
    expect(mocks.getQuotaSummary).toHaveBeenCalled();
  });

  it('重复签到（409）按已签到处理，不报错', async () => {
    stubSignedIn();
    mocks.checkinNow.mockImplementation(() =>
      Promise.resolve({ ok: false, kind: 'conflict', message: '今天已经签到过了' }),
    );
    await mountDialogLoaded();

    (q('cloud-upgrade-checkin-btn') as HTMLButtonElement).click();
    await flushPromises();

    expect(q('cloud-upgrade-checkin-message')?.textContent).toContain('今天已经签到过了');
  });

  it('支付通道不可用时不弹二维码，降级为联系管理员', async () => {
    stubSignedIn();
    mocks.createQuotaOrder.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        data: { orderNo: 'CLQ2026', status: 'PENDING_PAY', amount: 600 },
      }),
    );
    mocks.payQuotaOrder.mockImplementation(() =>
      Promise.resolve({ ok: false, kind: 'business', message: '支付通道未开通，请联系管理员开通' }),
    );
    const wrapper = await mountDialogLoaded();

    (q('cloud-upgrade-buy-plus') as HTMLButtonElement).click();
    await flushPromises();

    expect(q('cloud-upgrade-pay-dialog')).toBeNull();
    const panel = q('cloud-upgrade-pay-unavailable')!;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('支付通道暂未开通');

    (q('cloud-upgrade-pay-contact') as HTMLButtonElement).click();
    await nextTick();
    expect(wrapper.emitted('contact')).toHaveLength(1);
  });

  it('支付流程：下单 → 二维码 → 轮询 PAID 显示成功', async () => {
    stubSignedIn();
    mocks.createQuotaOrder.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        data: { orderNo: 'CLQ-1', status: 'PENDING_PAY', amount: 600 },
      }),
    );
    mocks.payQuotaOrder.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        data: { orderNo: 'CLQ-1', codeUrl: 'weixin://wxpay/bizpayurl?pr=test', expireAt: null },
      }),
    );
    mocks.getQuotaOrder.mockImplementation(() =>
      Promise.resolve({ ok: true, data: { orderNo: 'CLQ-1', status: 'PAID', amount: 600 } }),
    );
    await mountDialogLoaded();

    (q('cloud-upgrade-buy-plus') as HTMLButtonElement).click();
    await flushPromises();

    expect(mocks.createQuotaOrder).toHaveBeenCalledWith(101);
    expect(mocks.payQuotaOrder).toHaveBeenCalledWith('CLQ-1');
    expect(q('cloud-upgrade-pay-dialog')).not.toBeNull();
    // codeUrl → dataURL 是异步渲染（真实 qrcode 会走 canvas/pngjs，比微任务慢），等它落地
    await vi.waitFor(() => {
      expect(q('cloud-upgrade-pay-qr')).not.toBeNull();
    });
    const qr = q('cloud-upgrade-pay-qr') as HTMLImageElement | null;
    expect(qr?.getAttribute('src')).toContain('data:image/png');
    expect(q('cloud-upgrade-pay-status')?.textContent).toContain('支付成功');
  });
});
