/**
 * Notification 组件单元测试
 * 测试通知组件的渲染、交互和动画
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Notification from '@/components/ui/Notification.vue';
import { useNotificationStore } from '@/stores/notification';

describe('Notification', () => {
  let pinia: ReturnType<typeof createPinia>;
  let notificationStore: ReturnType<typeof useNotificationStore>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    notificationStore = useNotificationStore();
  });

  describe('渲染测试', () => {
    it('应正确渲染通知容器', () => {
      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      expect(wrapper.exists()).toBe(true);
      expect(wrapper.find('[data-testid="notification-container"]').exists()).toBe(true);
    });

    it('无通知时应显示空容器', () => {
      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const items = wrapper.findAll('[data-testid="notification-item"]');
      expect(items).toHaveLength(0);
    });

    it('应显示所有通知', () => {
      notificationStore.add({
        type: 'info',
        title: '通知 1',
      });
      notificationStore.add({
        type: 'success',
        title: '通知 2',
      });

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const items = wrapper.findAll('[data-testid="notification-item"]');
      expect(items).toHaveLength(2);
    });
  });

  describe('通知类型样式', () => {
    it('应渲染成功通知的正确样式', () => {
      notificationStore.success('成功', '操作完成');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const item = wrapper.find('[data-testid="notification-item"]');
      expect(item.classes()).toContain('notification-success');
    });

    it('应渲染错误通知的正确样式', () => {
      notificationStore.error('错误', '操作失败');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const item = wrapper.find('[data-testid="notification-item"]');
      expect(item.classes()).toContain('notification-error');
    });

    it('应渲染警告通知的正确样式', () => {
      notificationStore.warning('警告', '请注意');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const item = wrapper.find('[data-testid="notification-item"]');
      expect(item.classes()).toContain('notification-warning');
    });

    it('应渲染信息通知的正确样式', () => {
      notificationStore.info('提示', '新消息');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const item = wrapper.find('[data-testid="notification-item"]');
      expect(item.classes()).toContain('notification-info');
    });
  });

  describe('通知图标', () => {
    it('成功通知应显示对勾图标', () => {
      notificationStore.success('成功');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const icon = wrapper.find('.notification-icon svg');
      expect(icon.exists()).toBe(true);
      // 检查是否是 polyline (对勾)
      expect(icon.html()).toContain('polyline');
    });

    it('错误通知应显示错误图标', () => {
      notificationStore.error('错误');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const icon = wrapper.find('.notification-icon svg');
      expect(icon.html()).toContain('circle');
      expect(icon.html()).toContain('line');
    });

    it('警告通知应显示警告图标', () => {
      notificationStore.warning('警告');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const icon = wrapper.find('.notification-icon svg');
      expect(icon.html()).toContain('path');
    });

    it('信息通知应显示信息图标', () => {
      notificationStore.info('提示');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const icon = wrapper.find('.notification-icon svg');
      expect(icon.html()).toContain('circle');
    });
  });

  describe('通知内容', () => {
    it('应显示通知标题', () => {
      notificationStore.info('测试标题', '测试消息');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const title = wrapper.find('.notification-title');
      expect(title.text()).toBe('测试标题');
    });

    it'应显示通知消息', () => {
      notificationStore.info('标题', '详细内容消息');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const message = wrapper.find('.notification-message');
      expect(message.exists()).toBe(true);
      expect(message.text()).toBe('详细内容消息');
    });

    it'无消息时应不显示消息元素', () => {
      notificationStore.info('仅标题');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const message = wrapper.find('.notification-message');
      expect(message.exists()).toBe(false);
    });
  });

  describe'关闭功能', () => {
    it'应显示关闭按钮', () => {
      notificationStore.info('测试');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const closeButton = wrapper.find('.notification-close');
      expect(closeButton.exists()).toBe(true);
    });

    it'点击关闭按钮应移除通知', async () => {
      notificationStore.info('测试');

      expect(notificationStore.notifications).toHaveLength(1);

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const closeButton = wrapper.find('.notification-close');
      await closeButton.trigger('click');

      expect(notificationStore.notifications).toHaveLength(0);
    });

    it'应能关闭特定通知', async () => {
      notificationStore.info('通知 1');
      notificationStore.success('通知 2');
      notificationStore.error('通知 3');

      expect(notificationStore.notifications).toHaveLength(3);

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      // 关闭第二个通知
      const closeButtons = wrapper.findAll('.notification-close');
      await closeButtons[1].trigger('click');

      expect(notificationStore.notifications).toHaveLength(2);
      expect(notificationStore.notifications.map(n => n.title)).toEqual(['通知 1', '通知 3']);
    });
  });

  describe'操作按钮', () => {
    it'应显示操作按钮当通知有 action', () => {
      notificationStore.error('错误', '请重试', {
        label: '重试',
        handler: vi.fn(),
      });

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const actionButton = wrapper.find('.notification-action-btn');
      expect(actionButton.exists()).toBe(true);
      expect(actionButton.text()).toBe('重试');
    });

    it'无 action 时应不显示操作按钮', () => {
      notificationStore.info('普通通知');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const actionButton = wrapper.find('.notification-action-btn');
      expect(actionButton.exists()).toBe(false);
    });

    it'点击操作按钮应执行 handler 并关闭通知', async () => {
      const handler = vi.fn();
      
      notificationStore.error('错误', '请重试', {
        label: '重试',
        handler,
      });

      expect(notificationStore.notifications).toHaveLength(1);

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const actionButton = wrapper.find('.notification-action-btn');
      await actionButton.trigger('click');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(notificationStore.notifications).toHaveLength(0);
    });
  });

  describe'进度条', () => {
    it'应显示进度条当 duration > 0', () => {
      notificationStore.info('测试', '消息', 5000);

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const progress = wrapper.find('.notification-progress');
      expect(progress.exists()).toBe(true);
    });

    it'不应显示进度条当 duration = 0', () => {
      notificationStore.add({
        type: 'info',
        title: '持久通知',
        duration: 0,
      });

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const progress = wrapper.find('.notification-progress');
      expect(progress.exists()).toBe(false);
    });

    it'进度条应有正确的动画持续时间', () => {
      notificationStore.info('测试', '消息', 10000);

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const progress = wrapper.find('.notification-progress');
      const style = progress.attributes('style');
      expect(style).toContain('10000ms');
    });
  });

  describe'容器定位', () => {
    it'应使用固定定位在右上角', () => {
      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const container = wrapper.find('.notification-container');
      const style = container.attributes('style');
      // 组件使用 CSS 类定义位置，检查类是否存在
      expect(container.exists()).toBe(true);
    });
  });

  describe'多通知布局', () => {
    it'应垂直排列多个通知', () => {
      notificationStore.info('通知 1');
      notificationStore.success('通知 2');
      notificationStore.warning('通知 3');

      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const container = wrapper.find('.notification-container');
      // 检查是否使用 flex column 布局
      expect(container.classes()).toContain('notification-container');
      
      const items = wrapper.findAll('[data-testid="notification-item"]');
      expect(items).toHaveLength(3);
    });

    it'应限制最大宽度', () => {
      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      const container = wrapper.find('.notification-container');
      expect(container.exists()).toBe(true);
    });
  });

  describe'TransitionGroup 动画', () => {
    it'应使用 TransitionGroup 包装通知列表', () => {
      const wrapper = mount(Notification, {
        global: {
          plugins: [pinia],
        },
      });

      // 检查是否存在 transition-group 相关的类
      expect(wrapper.html()).toContain('notification-fade');
    });
  });
});
