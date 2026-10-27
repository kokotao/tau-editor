/**
 * @description 云端保存冲突（409）三选一对话框：文案/两个版本块渲染、三个动作各自 emit、busy 时禁用。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 10:20
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CloudDocConflictDialog from '@/components/editor/CloudDocConflictDialog.vue';

const q = (id: string) => document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(CloudDocConflictDialog, {
    props: { visible: true, fileName: '量化学习路线.md', message: '版本已过期', remoteVersion: 7, ...props },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CloudDocConflictDialog', () => {
  it('渲染冲突标题、文件名、本地/云端两个版本块与三条选项', () => {
    mountDialog();

    expect(q('cloud-doc-conflict-overlay')).not.toBeNull();
    expect(q('cloud-doc-conflict-dialog')).not.toBeNull();
    expect(q('cloud-doc-conflict-title')?.textContent).toContain('云端版本冲突');
    expect(q('cloud-doc-conflict-file')?.textContent).toContain('量化学习路线.md');
    expect(q('cloud-doc-conflict-message')?.textContent).toBe('版本已过期');

    const text = q('cloud-doc-conflict-dialog')?.textContent ?? '';
    expect(text).toContain('你的版本（本地）');
    expect(text).toContain('v7');
    expect(text).toContain('另存为副本');
    expect(text).toContain('保留我的修改');
    expect(text).toContain('用云端版本');
  });

  it('未知远端版本时不显示 vNaN', () => {
    mountDialog({ remoteVersion: null });
    expect(q('cloud-doc-conflict-dialog')?.textContent).not.toContain('vnull');
    expect(q('cloud-doc-conflict-dialog')?.textContent).not.toContain('vNaN');
  });

  it('三个动作各自 emit，取消 emit close', async () => {
    const wrapper = mountDialog();

    q('cloud-doc-conflict-save-copy')!.click();
    q('cloud-doc-conflict-keep-mine')!.click();
    q('cloud-doc-conflict-use-remote')!.click();
    q('cloud-doc-conflict-cancel')!.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('saveCopy')).toHaveLength(1);
    expect(wrapper.emitted('keepMine')).toHaveLength(1);
    expect(wrapper.emitted('useRemote')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('busy 时所有动作禁用，主按钮显示处理中', () => {
    mountDialog({ busy: true });

    for (const id of [
      'cloud-doc-conflict-save-copy',
      'cloud-doc-conflict-keep-mine',
      'cloud-doc-conflict-use-remote',
      'cloud-doc-conflict-cancel',
    ]) {
      expect(q(id)?.hasAttribute('disabled')).toBe(true);
    }
    expect(q('cloud-doc-conflict-save-copy')?.textContent).toContain('处理中');
  });

  it('visible=false 时不渲染任何节点', () => {
    mountDialog({ visible: false });
    expect(q('cloud-doc-conflict-overlay')).toBeNull();
  });
});
