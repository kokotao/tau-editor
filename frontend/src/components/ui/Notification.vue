<template>
  <div class="notification-container" data-testid="notification-container">
    <TransitionGroup name="notification-fade">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        class="notification"
        :class="[`notification-${notification.type}`]"
        data-testid="notification-item"
      >
        <div class="notification-icon">
          <svg v-if="notification.type === 'success'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20,6 9,17 4,12" />
          </svg>
          <svg v-else-if="notification.type === 'error'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <svg v-else-if="notification.type === 'warning'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <div class="notification-content">
          <div class="notification-title">{{ notification.title }}</div>
          <div class="notification-message" v-if="notification.message">{{ notification.message }}</div>
          <div class="notification-action" v-if="notification.action">
            <button class="notification-action-btn" @click="handleAction(notification)">
              {{ notification.action.label }}
            </button>
          </div>
        </div>
        <button class="notification-close" @click="dismiss(notification.id)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div class="notification-progress" v-if="(notification.duration ?? 0) > 0" :style="{ animationDuration: (notification.duration ?? 0) + 'ms' }"></div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useNotificationStore } from '@/stores/notification';

const notificationStore = useNotificationStore();

const notifications = notificationStore.notifications;

const dismiss = (id: string) => {
  notificationStore.dismiss(id);
};

const handleAction = (notification: any) => {
  if (notification.action?.handler) {
    notification.action.handler();
  }
  notificationStore.dismiss(notification.id);
};
</script>

<style scoped>
.notification-container {
  position: fixed;
  top: 60px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 400px;
  pointer-events: none;
}

.notification {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background: var(--n-color, #252526);
  border: 1px solid var(--n-border-color, #333);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
  position: relative;
  overflow: hidden;
  animation: slideIn 0.3s ease;
}

.notification-success {
  border-left: 4px solid #4caf50;
}

.notification-error {
  border-left: 4px solid #f44336;
}

.notification-warning {
  border-left: 4px solid #ff9800;
}

.notification-info {
  border-left: 4px solid #2196f3;
}

.notification-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  color: inherit;
}

.notification-success .notification-icon {
  color: #4caf50;
}

.notification-error .notification-icon {
  color: #f44336;
}

.notification-warning .notification-icon {
  color: #ff9800;
}

.notification-info .notification-icon {
  color: #2196f3;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--n-text-color, #fff);
  margin-bottom: 4px;
}

.notification-message {
  font-size: 13px;
  color: var(--n-text-color, #ccc);
  line-height: 1.4;
}

.notification-action {
  margin-top: 8px;
}

.notification-action-btn {
  padding: 4px 12px;
  background: var(--n-active-color, #37373d);
  border: none;
  border-radius: 4px;
  color: var(--n-text-color, #fff);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.notification-action-btn:hover {
  background: var(--n-hover-color, #2a2d2e);
}

.notification-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--n-text-color, #999);
  opacity: 0.7;
  transition: opacity 0.15s, background 0.15s;
}

.notification-close:hover {
  opacity: 1;
  background: var(--n-hover-color, #2a2d2e);
}

.notification-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.3);
  animation: progress linear forwards;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes progress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

.notification-fade-enter-active,
.notification-fade-leave-active {
  transition: all 0.3s ease;
}

.notification-fade-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.notification-fade-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
