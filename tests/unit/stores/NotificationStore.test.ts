/**
 * NotificationStore 单元测试
 * 测试通知的添加、移除、类型化通知等功能
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useNotificationStore, type Notification } from '@/stores/notification';

describe('NotificationStore', () => {
  let pinia: ReturnType<typeof createPinia>;
  let notification: ReturnType<typeof useNotificationStore>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    notification = useNotificationStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('添加通知', () => {
    it('应添加通知并生成唯一 ID', () => {
      const id = notification.add({
        type: 'info',
        title: '测试通知',
        message: '这是一条测试消息',
      });

      expect(id).toMatch(/notif_\d+_[a-z0-9]+/);
      expect(notification.notifications).toHaveLength(1);
      expect(notification.notifications[0].id).toBe(id);
    });

    it('应设置默认持续时间为 5 秒', () => {
      notification.add({
        type: 'info',
        title: '测试',
      });

      expect(notification.notifications[0].duration).toBe(5000);
    });

    it('应支持自定义持续时间', () => {
      notification.add({
        type: 'info',
        title: '测试',
        duration: 10000,
      });

      expect(notification.notifications[0].duration).toBe(10000);
    });

    it('应支持不自动消失 (duration=0)', () => {
      notification.add({
        type: 'info',
        title: '持久通知',
        duration: 0,
      });

      expect(notification.notifications[0].duration).toBe(0);
    });

    it('应支持可选消息', () => {
      notification.add({
        type: 'info',
        title: '仅标题',
      });

      expect(notification.notifications[0].message).toBeUndefined();
    });
  });

  describe('类型化通知方法', () => {
    it('应创建成功通知', () => {
      const id = notification.success('操作成功', '文件已保存');

      expect(notification.notifications).toHaveLength(1);
      expect(notification.notifications[0]).toEqual({
        id,
        type: 'success',
        title: '操作成功',
        message: '文件已保存',
        duration: 5000,
      });
    });

    it('应创建错误通知', () => {
      const id = notification.error('操作失败', '文件不存在');

      expect(notification.notifications).toHaveLength(1);
      expect(notification.notifications[0]).toEqual({
        id,
        type: 'error',
        title: '操作失败',
        message: '文件不存在',
        duration: 5000,
      });
    });

    it('应创建警告通知', () => {
      const id = notification.warning('注意', '磁盘空间不足');

      expect(notification.notifications).toHaveLength(1);
      expect(notification.notifications[0]).toEqual({
        id,
        type: 'warning',
        title: '注意',
        message: '磁盘空间不足',
        duration: 5000,
      });
    });

    it('应创建信息通知', () => {
      const id = notification.info('提示', '新版本可用');

      expect(notification.notifications).toHaveLength(1);
      expect(notification.notifications[0]).toEqual({
        id,
        type: 'info',
        title: '提示',
        message: '新版本可用',
        duration: 5000,
      });
    });

    it('应创建加载通知 (不自动消失)', () => {
      const id = notification.loading('处理中', '正在保存文件...');

      expect(notification.notifications).toHaveLength(1);
      expect(notification.notifications[0]).toEqual({
        id,
        type: 'info',
        title: '处理中',
        message: '正在保存文件...',
        duration: 0,
      });
    });

    it('错误通知应支持操作按钮', () => {
      const actionHandler = vi.fn();
      
      notification.error('失败', '请重试', {
        label: '重试',
        handler: actionHandler,
      });

      expect(notification.notifications[0].action).toEqual({
        label: '重试',
        handler: actionHandler,
      });
    });
  });

  describe'移除通知', () => {
    it('应移除指定 ID 的通知', () => {
      const id1 = notification.add({ type: 'info', title: '通知 1' });
      const id2 = notification.add({ type: 'info', title: '通知 2' });
      const id3 = notification.add({ type: 'info', title: '通知 3' });

      expect(notification.notifications).toHaveLength(3);

      notification.dismiss(id2);

      expect(notification.notifications).toHaveLength(2);
      expect(notification.notifications.map(n => n.id)).toEqual([id1, id3]);
    });

    it('移除不存在的通知应无副作用', () => {
      notification.add({ type: 'info', title: '通知 1' });

      expect(notification.notifications).toHaveLength(1);

      notification.dismiss('nonexistent');

      expect(notification.notifications).toHaveLength(1);
    });

    it('应清除所有通知', () => {
      notification.add({ type: 'info', title: '通知 1' });
      notification.add({ type: 'success', title: '通知 2' });
      notification.add({ type: 'error', title: '通知 3' });

      expect(notification.notifications).toHaveLength(3);

      notification.clearAll();

      expect(notification.notifications).toHaveLength(0);
    });

    it('应清除指定类型的通知', () => {
      notification.add({ type: 'info', title: '信息 1' });
      notification.add({ type: 'success', title: '成功 1' });
      notification.add({ type: 'info', title: '信息 2' });
      notification.add({ type: 'error', title: '错误 1' });

      notification.clearByType('info');

      expect(notification.notifications).toHaveLength(2);
      expect(notification.notifications.map(n => n.type)).toEqual(['success', 'error']);
    });
  });

  describe'自动消失功能', () => {
    it'应在指定时间后自动消失', () => {
      notification.add({
        type: 'info',
        title: '临时通知',
        duration: 3000,
      });

      expect(notification.notifications).toHaveLength(1);

      // 快进 2.9 秒 - 通知应该还在
      vi.advanceTimersByTime(2900);
      expect(notification.notifications).toHaveLength(1);

      // 快进 0.2 秒 - 通知应该消失
      vi.advanceTimersByTime(200);
      expect(notification.notifications).toHaveLength(0);
    });

    it'不应自动消失 duration=0 的通知', () => {
      notification.add({
        type: 'info',
        title: '持久通知',
        duration: 0,
      });

      vi.advanceTimersByTime(60000); // 快进 1 分钟

      expect(notification.notifications).toHaveLength(1);
    });

    it'应为不同通知创建独立的定时器', () => {
      notification.add({ type: 'info', title: '通知 1', duration: 1000 });
      notification.add({ type: 'info', title: '通知 2', duration: 3000 });

      expect(notification.notifications).toHaveLength(2);

      // 快进 1 秒 - 第一个通知消失
      vi.advanceTimersByTime(1000);
      expect(notification.notifications).toHaveLength(1);
      expect(notification.notifications[0].title).toBe('通知 2');

      // 再快进 2 秒 - 第二个通知消失
      vi.advanceTimersByTime(2000);
      expect(notification.notifications).toHaveLength(0);
    });
  });

  describe'通知操作', () => {
    it'应支持执行操作并移除通知', () => {
      const actionHandler = vi.fn();
      
      const id = notification.add({
        type: 'error',
        title: '错误',
        action: {
          label: '重试',
          handler: actionHandler,
        },
      });

      // 模拟处理操作
      const notif = notification.notifications.find(n => n.id === id);
      if (notif?.action?.handler) {
        notif.action.handler();
      }

      expect(actionHandler).toHaveBeenCalledTimes(1);
      expect(notification.notifications).toHaveLength(0); // 操作后应移除
    });
  });

  describe'状态管理', () => {
    it'应保持通知的顺序', () => {
      notification.add({ type: 'info', title: '第一个' });
      notification.add({ type: 'info', title: '第二个' });
      notification.add({ type: 'info', title: '第三个' });

      expect(notification.notifications.map(n => n.title)).toEqual([
        '第一个',
        '第二个',
        '第三个',
      ]);
    });

    it'应支持多个相同类型的通知', () => {
      notification.success('成功 1');
      notification.success('成功 2');
      notification.success('成功 3');

      expect(notification.notifications).toHaveLength(3);
      expect(notification.notifications.every(n => n.type === 'success')).toBe(true);
    });
  });
});
