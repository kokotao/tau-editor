<script setup lang="ts">
/**
 * MindmapContextMenu（UX-1：思维导图右键菜单）
 *
 * 职责：
 * 1. 作为「受控」的通用右键菜单：位置 / 显隐 / 菜单项全部由上层决定，
 *    组件只负责渲染、定位翻转与键盘导航，不直接执行任何命令、不改文档；
 * 2. 通过 teleport 挂到 body，避免被画布 / 面板的 overflow 裁剪；
 * 3. 超出视口时自动翻转（右下方向放不下就往左上翻），并夹紧到视口内；
 * 4. 关闭途径：点击菜单外部、再次右键外部、Esc、选中某项后由上层置 visible=false；
 * 5. 键盘：↑ / ↓ 在「可点击项」之间循环移动，Enter 触发当前项。
 *
 * 配色一律使用 Tau 主题 token（--panel-elevated / --border-strong / --text-primary …），
 * 因此明暗主题与皮肤切换下都保持可读，不写死任何颜色。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

/** 一条菜单项；`separator: true` 时渲染为分隔线（其余字段忽略）。 */
interface MindmapContextMenuItem {
  id: string;
  label: string;
  /** 右侧快捷键提示，纯展示。 */
  shortcut?: string;
  disabled?: boolean;
  /** 危险操作（删除等）用 --state-danger 着色。 */
  danger?: boolean;
  /** 分隔线。 */
  separator?: boolean;
}

const props = withDefaults(
  defineProps<{
    visible: boolean;
    /** 视口坐标（clientX / clientY）。 */
    x: number;
    y: number;
    items: MindmapContextMenuItem[];
    /** 菜单最小宽度（px）。 */
    minWidth?: number;
  }>(),
  { minWidth: 180 },
);

const emit = defineEmits<{
  (event: 'select', id: string): void;
  (event: 'close'): void;
}>();

/** 菜单与视口边缘的最小留白。 */
const VIEWPORT_MARGIN = 8;

const menuRef = ref<HTMLElement | null>(null);
/** 实际渲染位置（翻转 / 夹紧之后）。 */
const position = ref({ left: props.x, top: props.y });
/** 键盘高亮项在 items 中的下标（-1 表示没有）。 */
const activeIndex = ref(-1);

/** 可点击项（排除分隔线与禁用项）在 items 中的下标。 */
const selectableIndexes = computed<number[]>(() => props.items
  .map((item, index) => ({ item, index }))
  .filter(({ item }) => !item.separator && !item.disabled)
  .map(({ index }) => index));

/**
 * 量一次菜单尺寸并计算最终位置。
 *
 * 测试环境（happy-dom）里 getBoundingClientRect 全为 0，此时保持原始坐标即可，
 * 不做任何翻转，避免把菜单定位到负数坐标。
 */
async function reposition() {
  position.value = { left: props.x, top: props.y };
  await nextTick();
  const element = menuRef.value;
  if (!element || typeof window === 'undefined') return;
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth || 0;
  const viewportHeight = window.innerHeight || 0;
  if (rect.width <= 0 || rect.height <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return;

  let left = props.x;
  let top = props.y;
  // 右侧放不下 → 向左翻转；上方同理。翻转后仍夹紧到视口内。
  if (left + rect.width > viewportWidth - VIEWPORT_MARGIN) {
    left = props.x - rect.width;
  }
  if (top + rect.height > viewportHeight - VIEWPORT_MARGIN) {
    top = props.y - rect.height;
  }
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, viewportWidth - rect.width - VIEWPORT_MARGIN));
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, viewportHeight - rect.height - VIEWPORT_MARGIN));
  position.value = { left, top };
}

/* ------------------------------- 键盘导航 ------------------------------- */

function moveActive(step: number) {
  const indexes = selectableIndexes.value;
  if (indexes.length === 0) return;
  const current = indexes.indexOf(activeIndex.value);
  const next = current < 0
    ? (step > 0 ? 0 : indexes.length - 1)
    : (current + step + indexes.length) % indexes.length;
  activeIndex.value = indexes[next] as number;
}

/** 选中某项：禁用项与分隔线不触发，交由上层决定后续动作。 */
function choose(item: MindmapContextMenuItem) {
  if (item.separator || item.disabled) return;
  emit('select', item.id);
}

function onWindowKeydown(event: KeyboardEvent) {
  if (!props.visible) return;
  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      emit('close');
      break;
    case 'ArrowDown':
      event.preventDefault();
      moveActive(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      moveActive(-1);
      break;
    case 'Enter': {
      const item = props.items[activeIndex.value];
      if (!item) return;
      event.preventDefault();
      choose(item);
      break;
    }
    default:
      break;
  }
}

/* ------------------------------ 点击外部关闭 ------------------------------ */

/** 菜单内的事件都已被 @mousedown.stop 拦下，这里只看「是否点在菜单内」。 */
function isInsideMenu(target: EventTarget | null): boolean {
  const element = menuRef.value;
  return Boolean(element && target instanceof Node && element.contains(target));
}

function onDocumentPointerDown(event: Event) {
  if (!props.visible) return;
  if (isInsideMenu(event.target)) return;
  emit('close');
}

function onDocumentContextMenu(event: Event) {
  if (!props.visible) return;
  if (isInsideMenu(event.target)) {
    event.preventDefault();
    return;
  }
  emit('close');
}

let listening = false;

function addGlobalListeners() {
  if (listening || typeof window === 'undefined' || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('mousedown', onDocumentPointerDown, true);
  document.addEventListener('contextmenu', onDocumentContextMenu, true);
  window.addEventListener('keydown', onWindowKeydown);
}

function removeGlobalListeners() {
  if (!listening || typeof window === 'undefined' || typeof document === 'undefined') return;
  listening = false;
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('mousedown', onDocumentPointerDown, true);
  document.removeEventListener('contextmenu', onDocumentContextMenu, true);
  window.removeEventListener('keydown', onWindowKeydown);
}

watch(
  () => [props.visible, props.x, props.y] as const,
  ([visible]) => {
    activeIndex.value = -1;
    if (!visible) {
      removeGlobalListeners();
      return;
    }
    addGlobalListeners();
    void reposition();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  removeGlobalListeners();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.visible"
      ref="menuRef"
      class="mm-context-menu"
      data-testid="mm-context-menu"
      role="menu"
      aria-label="思维导图操作"
      :style="{
        left: `${position.left}px`,
        top: `${position.top}px`,
        minWidth: `${props.minWidth}px`,
      }"
      @contextmenu.prevent.stop
      @mousedown.stop
      @pointerdown.stop
      @click.stop
    >
      <template v-for="(item, index) in props.items" :key="item.id || `sep-${index}`">
        <div
          v-if="item.separator"
          class="mm-context-menu-separator"
          role="separator"
          :data-testid="`mm-context-separator-${index}`"
        ></div>
        <button
          v-else
          type="button"
          role="menuitem"
          class="mm-context-menu-item"
          :class="{
            'is-active': index === activeIndex,
            'is-danger': item.danger,
          }"
          :data-testid="`mm-context-item-${item.id}`"
          :disabled="item.disabled"
          :aria-disabled="item.disabled ? 'true' : undefined"
          @mouseenter="activeIndex = index"
          @click.stop="choose(item)"
        >
          <span class="mm-context-menu-label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="mm-context-menu-shortcut">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.mm-context-menu {
  position: fixed;
  z-index: 20000;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-strong);
  background: var(--panel-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-overlay);
  font-family: var(--font-ui);
  font-size: 12px;
  user-select: none;
}
.mm-context-menu-item {
  display: flex;
  align-items: center;
  gap: 18px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.mm-context-menu-item:hover:not(:disabled),
.mm-context-menu-item.is-active:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.mm-context-menu-item.is-danger { color: var(--state-danger); }
.mm-context-menu-item.is-danger:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--state-danger);
}
.mm-context-menu-item:disabled {
  color: var(--text-muted);
  opacity: 0.6;
  cursor: default;
}
.mm-context-menu-label {
  flex: 1;
  white-space: nowrap;
}
.mm-context-menu-shortcut {
  color: var(--text-muted);
  font-family: var(--font-code);
  font-size: 10px;
}
.mm-context-menu-separator {
  height: 1px;
  margin: 4px 6px;
  background: var(--border-soft);
}
</style>
