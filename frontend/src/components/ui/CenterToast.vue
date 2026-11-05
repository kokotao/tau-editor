<template>
  <Teleport to="body">
    <Transition name="center-toast">
      <div
        v-if="toast.visible"
        class="center-toast"
        :class="`center-toast--${toast.tone}`"
        role="status"
        aria-live="polite"
        data-testid="center-toast"
        :data-tone="toast.tone"
      >
        <span class="center-toast__icon" aria-hidden="true">{{ icon }}</span>
        <span class="center-toast__text">{{ toast.message }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @description 居中 toast 容器：挂在 App 根部，任何地方通过 useCenterToastStore().show() 触发。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 21:05
 */
import { computed } from 'vue';
import { useCenterToastStore } from '@/stores/centerToast';

const toast = useCenterToastStore();

const icon = computed(() => (toast.tone === 'error' ? '✕' : toast.tone === 'info' ? 'i' : '✓'));
</script>

<style scoped>
.center-toast {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 20000;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(420px, calc(100vw - 48px));
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-overlay, #1b2436);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--radius-card, 10px);
  box-shadow: var(--shadow-overlay, 0 20px 48px rgba(0, 0, 0, 0.5));
  transform: translate(-50%, -50%);
}

.center-toast--success {
  color: var(--state-success, #16a34a);
  border-color: var(--state-success, #16a34a);
}

.center-toast--error {
  color: var(--state-danger, #dc2626);
  border-color: var(--state-danger, #dc2626);
}

.center-toast__icon {
  font-size: 12px;
  font-weight: 700;
}

.center-toast__text {
  color: var(--text-primary, #e5e9f0);
  word-break: break-word;
}

.center-toast-enter-active,
.center-toast-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.center-toast-enter-from,
.center-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -46%);
}
</style>
