/**
 * @description 「联系管理员开通」微信二维码弹窗：二维码渲染、关闭 emit、遮罩/Esc 关闭、visible=false 不渲染。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 17:40
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WechatContactDialog from '@/components/editor/WechatContactDialog.vue';

const q = (id: string) => document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const wrappers: VueWrapper[] = [];

function mountDialog(props: Record<string, unknown> = {}) {
  const wrapper = mount(WechatContactDialog, { props: { visible: true, ...props } });
  wrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  while (wrappers.length > 0) {
    wrappers.pop()?.unmount();
  }
  document.body.innerHTML = '';
});

describe('WechatContactDialog', () => {
  it('渲染标题、提示文案与管理员微信二维码', () => {
    mountDialog();

    const dialog = q('wechat-contact-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('扫码添加微信开通');
    expect(dialog?.textContent).toContain('扫一扫');
    expect(dialog?.textContent).toContain('扩容');

    const qr = q('wechat-contact-qr') as HTMLImageElement | null;
    expect(qr).not.toBeNull();
    expect(qr?.getAttribute('src')).toBeTruthy();
    expect(qr?.getAttribute('alt')).toContain('二维码');
  });

  it('点关闭按钮 emit close', async () => {
    const wrapper = mountDialog();

    (q('wechat-contact-close') as HTMLButtonElement).click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('点遮罩 emit close', async () => {
    const wrapper = mountDialog();

    q('wechat-contact-overlay')!.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('Esc 关闭', async () => {
    const wrapper = mountDialog();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('visible=false 时不渲染', () => {
    mountDialog({ visible: false });
    expect(q('wechat-contact-dialog')).toBeNull();
    expect(q('wechat-contact-qr')).toBeNull();
  });
});
