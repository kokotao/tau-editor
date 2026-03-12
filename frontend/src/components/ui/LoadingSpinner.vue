<template>
  <div class="loading-spinner" :class="[`loading-spinner-${size}`]" data-testid="loading-spinner">
    <div class="spinner"></div>
    <span v-if="text" class="spinner-text">{{ text }}</span>
  </div>
</template>

<script setup lang="ts">
interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
}

withDefaults(defineProps<LoadingSpinnerProps>(), {
  size: 'medium',
  text: undefined,
});
</script>

<style scoped>
.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.spinner {
  border: 3px solid var(--n-border-color, #333);
  border-top-color: #007acc;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-spinner-small .spinner {
  width: 20px;
  height: 20px;
  border-width: 2px;
}

.loading-spinner-medium .spinner {
  width: 40px;
  height: 40px;
  border-width: 3px;
}

.loading-spinner-large .spinner {
  width: 60px;
  height: 60px;
  border-width: 4px;
}

.spinner-text {
  color: var(--n-text-color, #ccc);
  font-size: 13px;
}

.loading-spinner-small .spinner-text {
  font-size: 11px;
}

.loading-spinner-large .spinner-text {
  font-size: 14px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
