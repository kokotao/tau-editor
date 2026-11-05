<template>
  <div ref="rootRef" class="status-select-control">
    <button
      :id="triggerId"
      ref="triggerRef"
      type="button"
      class="status-select"
      :data-testid="testId"
      :data-value="value"
      :aria-label="title"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-controls="menuId"
      :title="title"
      @click="toggleMenu"
      @keydown.down.prevent="openMenu"
      @keydown.enter.prevent="openMenu"
      @keydown.space.prevent="openMenu"
    >
      <span>{{ selectedLabel }}</span>
      <svg class="status-select-chevron" viewBox="0 0 12 12" aria-hidden="true">
        <path d="m3 4.5 3 3 3-3" />
      </svg>
    </button>

    <!-- 渲染到 body：脱离状态栏（及祖先 transform）的层叠上下文，避免 fixed 定位被裁切/错位 -->
    <Teleport to="body">
      <Transition
        enter-active-class="animate__animated animate__faster animate__fadeIn"
        leave-active-class="animate__animated animate__faster animate__fadeOut"
      >
        <div
          v-if="isOpen"
          :id="menuId"
          ref="menuRef"
          class="status-select-menu"
          :data-testid="`${testId}-menu`"
          :data-placement="placement"
          :style="menuStyle"
          role="listbox"
          :aria-label="title"
          @keydown="handleMenuKeydown"
        >
          <button
            v-for="option in options"
            :key="option.value"
            :data-testid="`${testId}-option-${option.value}`"
            :data-value="option.value"
            type="button"
            class="status-select-option"
            :class="{ selected: option.value === value }"
            role="option"
            :aria-selected="option.value === value"
            @click="selectOption(option.value)"
          >
            <span class="status-select-option-label">{{ option.label }}</span>
            <svg v-if="option.value === value" class="status-select-check" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m3.5 8.2 3 3 6-6.4" />
            </svg>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, type CSSProperties } from 'vue';

interface SelectOption {
  value: string;
  label: string;
}

const props = defineProps<{
  title: string;
  value: string;
  options: SelectOption[];
  testId: string;
}>();

const emit = defineEmits<{
  change: [value: string];
}>();

const EDGE = 12;
const MENU_GAP = 9;
const MENU_MAX_HEIGHT = 360;
const MENU_MIN_HEIGHT = 120;
const MENU_FALLBACK_WIDTH = 196;
const MENU_OPTION_HEIGHT = 32;

const rootRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const placement = ref<'top' | 'bottom'>('top');
const menuStyle = ref<CSSProperties>({
  position: 'fixed',
  left: '0px',
  top: '0px',
  visibility: 'hidden',
});
const triggerId = computed(() => `${props.testId}-trigger`);
const menuId = computed(() => `${props.testId}-menu`);
const selectedLabel = computed(
  () => props.options.find((option) => option.value === props.value)?.label ?? props.value,
);

/** 未渲染时按选项数估算高度，保证首次定位就能算对展开方向。 */
const estimateMenuHeight = () => Math.min(MENU_MAX_HEIGHT, props.options.length * MENU_OPTION_HEIGHT + 10);

const positionMenu = () => {
  const trigger = triggerRef.value;
  if (!trigger) {
    return;
  }
  const menu = menuRef.value;
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth || 1024;
  const viewportHeight = window.innerHeight || 768;

  const menuWidth = Math.min(
    menu?.offsetWidth || MENU_FALLBACK_WIDTH,
    Math.max(MENU_MIN_HEIGHT, viewportWidth - EDGE * 2),
  );
  const wantedHeight = menu?.offsetHeight || estimateMenuHeight();
  const spaceAbove = Math.max(0, rect.top - EDGE * 2);
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - EDGE * 2);

  // 靠近底部（状态栏在窗口最下方）优先向上展开；上下都不够时选空间更大的一侧。
  const preferTop = wantedHeight <= spaceAbove || spaceAbove >= spaceBelow;
  const nextPlacement: 'top' | 'bottom' = preferTop ? 'top' : 'bottom';
  const available = preferTop ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(
    MENU_MIN_HEIGHT,
    Math.min(MENU_MAX_HEIGHT, available > 0 ? Math.floor(available) : MENU_MAX_HEIGHT),
  );
  const height = Math.min(wantedHeight, maxHeight);
  const rawTop = preferTop ? rect.top - height - MENU_GAP : rect.bottom + MENU_GAP;
  const top = Math.min(
    Math.max(EDGE, rawTop),
    Math.max(EDGE, viewportHeight - height - EDGE),
  );
  const left = Math.min(
    Math.max(EDGE, rect.right - menuWidth),
    Math.max(EDGE, viewportWidth - menuWidth - EDGE),
  );

  placement.value = nextPlacement;
  menuStyle.value = {
    position: 'fixed',
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    maxHeight: `${Math.floor(maxHeight)}px`,
    visibility: 'visible',
  };
};

const focusSelectedOption = () => {
  const selected = menuRef.value?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
  (selected ?? menuRef.value?.querySelector<HTMLButtonElement>('[role="option"]'))?.focus();
};

const reposition = () => {
  if (isOpen.value) {
    positionMenu();
  }
};

const openMenu = () => {
  if (isOpen.value) {
    return;
  }
  menuStyle.value = {
    position: 'fixed',
    left: '0px',
    top: '0px',
    visibility: 'hidden',
  };
  isOpen.value = true;
  void nextTick(() => {
    positionMenu();
    focusSelectedOption();
  });
};

const closeMenu = () => {
  isOpen.value = false;
};

const toggleMenu = () => {
  if (isOpen.value) {
    closeMenu();
    return;
  }
  openMenu();
};

const selectOption = (value: string) => {
  emit('change', value);
  closeMenu();
  triggerRef.value?.focus();
};

const handleMenuKeydown = (event: KeyboardEvent) => {
  const options = Array.from(menuRef.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
  const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);

  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu();
    triggerRef.value?.focus();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const focusedOption = options[currentIndex];
    if (focusedOption) {
      selectOption(focusedOption.dataset.value ?? props.value);
    }
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    options[nextIndex]?.focus();
    return;
  }

  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const target = event.key === 'Home' ? options[0] : options[options.length - 1];
    target?.focus();
  }
};

const handleDocumentPointerDown = (event: MouseEvent) => {
  const target = event.target;
  if (!isOpen.value || !(target instanceof Node)) {
    return;
  }
  // 菜单已 Teleport 到 body，需要单独判断，否则点选项会在 click 前先被关掉
  if (rootRef.value?.contains(target) || menuRef.value?.contains(target)) {
    return;
  }
  closeMenu();
};

/** 菜单是 fixed 浮层：窗口尺寸变化或任意容器滚动时要跟着重新定位。 */
const handleViewportChange = () => {
  reposition();
};

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown);
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown);
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
});
</script>

<style scoped>
.status-select-control {
  position: relative;
  display: inline-flex;
  min-width: 0;
}

.status-select {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 72px;
  max-width: 220px;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  outline: none;
}

.status-select:focus-visible {
  border-radius: 3px;
  box-shadow: 0 0 0 2px var(--accent-blue-strong, #4dabff);
}

.status-select-chevron {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  opacity: 0.55;
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.status-select[aria-expanded='true'] .status-select-chevron {
  transform: rotate(180deg);
  opacity: 0.9;
}

.status-select-menu {
  --animate-duration: 0.2s;
  /* 浮层统一层级：高于侧栏/状态栏/工具栏，低于全屏模态（9999） */
  z-index: 9000;
  display: flex;
  flex-direction: column;
  width: 196px;
  max-width: min(240px, calc(100vw - 24px));
  max-height: min(360px, calc(100vh - 24px));
  overflow: auto;
  padding: 5px;
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.26));
  border-radius: var(--radius-md, 8px);
  background: var(--surface-raised, #1b2436);
  color: var(--text-secondary, #cbd5e1);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.18);
  overscroll-behavior: contain;
  scrollbar-color: var(--text-muted, #64748b) transparent;
  scrollbar-width: thin;
}

.status-select-menu[data-placement='top'] {
  transform-origin: bottom center;
}

.status-select-menu[data-placement='bottom'] {
  transform-origin: top center;
}

.status-select-menu::-webkit-scrollbar {
  width: 7px;
}

.status-select-menu::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 8px;
  background: var(--text-muted, #64748b);
  background-clip: padding-box;
}

.status-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 32px;
  padding: 5px 9px;
  border: 0;
  border-radius: var(--radius-sm, 5px);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--font-size-ui-sm, 12px);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.14s ease, background-color 0.14s ease;
}

.status-select-option:hover,
.status-select-option:focus-visible {
  outline: none;
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #f8fafc);
}

.status-select-option.selected {
  background: color-mix(in srgb, var(--accent-blue-strong, #4dabff) 18%, transparent);
  color: var(--text-primary, #f8fafc);
}

.status-select-option.selected:hover,
.status-select-option.selected:focus-visible {
  background: color-mix(in srgb, var(--accent-blue-strong, #4dabff) 26%, transparent);
}

.status-select-check {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  fill: none;
  stroke: var(--accent-blue-strong, #4dabff);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (prefers-reduced-motion: reduce) {
  .status-select-menu.animate__animated {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
  }
}
</style>
