import { defineStore } from 'pinia';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;  // 毫秒，0 表示不自动消失
  action?: {
    label: string;
    handler: () => void;
  };
}

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    notifications: [] as Notification[],
  }),

  actions: {
    // 添加通知
    add(notification: Omit<Notification, 'id'>): string {
      const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newNotification: Notification = {
        ...notification,
        id,
        duration: notification.duration ?? 5000,  // 默认 5 秒
      };
      
      this.notifications.push(newNotification);
      
      // 如果设置了持续时间，自动消失
      const duration = newNotification.duration ?? 0;
      if (duration > 0) {
        setTimeout(() => {
          this.dismiss(id);
        }, duration);
      }
      
      return id;
    },

    // 成功通知
    success(title: string, message?: string, duration?: number): string {
      return this.add({
        type: 'success',
        title,
        message,
        duration,
      });
    },

    // 错误通知
    error(title: string, message?: string, action?: { label: string; handler: () => void }, duration?: number): string {
      return this.add({
        type: 'error',
        title,
        message,
        action,
        duration,
      });
    },

    // 警告通知
    warning(title: string, message?: string, duration?: number): string {
      return this.add({
        type: 'warning',
        title,
        message,
        duration,
      });
    },

    // 信息通知
    info(title: string, message?: string, duration?: number): string {
      return this.add({
        type: 'info',
        title,
        message,
        duration,
      });
    },

    // 加载通知（不自动消失）
    loading(title: string, message?: string): string {
      return this.add({
        type: 'info',
        title,
        message,
        duration: 0,  // 不自动消失
      });
    },

    // 移除通知
    dismiss(id: string) {
      const index = this.notifications.findIndex(n => n.id === id);
      if (index !== -1) {
        this.notifications.splice(index, 1);
      }
    },

    // 清除所有通知
    clearAll() {
      this.notifications = [];
    },

    // 清除指定类型的通知
    clearByType(type: Notification['type']) {
      this.notifications = this.notifications.filter(n => n.type !== type);
    },
  },
});
