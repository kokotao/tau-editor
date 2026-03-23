<template>
  <div
    ref="previewScrollRef"
    class="markdown-preview"
    data-testid="markdown-preview"
    @contextmenu.prevent="handleContextMenu"
  >
    <div ref="previewRef" class="markdown-preview-content" v-html="html"></div>
    <div
      v-if="contextMenu.visible"
      ref="menuRef"
      class="preview-context-menu"
      data-testid="markdown-preview-context-menu"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      @click.stop
      @contextmenu.prevent.stop
    >
      <template v-for="item in contextMenu.items" :key="item.id">
        <div v-if="item.dividerBefore" class="preview-context-menu-divider"></div>
        <button
          type="button"
          class="preview-context-menu-item"
          :class="{ disabled: item.disabled }"
          :disabled="item.disabled"
          :data-testid="`preview-menu-${item.id}`"
          @click="runMenuItem(item)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { renderMarkdown, renderMermaidDiagrams } from '@/services/markdownService';

interface MarkdownPreviewProps {
  content: string;
  theme: 'dark' | 'light';
  sourceFilePath?: string | null;
  editorScrollState?: { top: number; height: number; scrollHeight: number } | null;
}

type MarkdownPreviewContextTarget =
  | { kind: 'blank'; sourceFilePath?: string | null }
  | { kind: 'selection'; text: string; sourceFilePath?: string | null }
  | { kind: 'link'; href: string; resolvedHref: string | null; text?: string; sourceFilePath?: string | null }
  | { kind: 'image'; src: string; resolvedSrc: string | null; alt?: string; sourceFilePath?: string | null }
  | { kind: 'code-block'; language?: string; code?: string; sourceFilePath?: string | null };

interface PreviewMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  dividerBefore?: boolean;
  visible?: boolean;
  run: () => void | Promise<void>;
}

const MENU_MARGIN = 8;
const MENU_ESTIMATED_WIDTH = 220;
const MENU_ITEM_HEIGHT = 36;

const props = withDefaults(defineProps<MarkdownPreviewProps>(), {
  sourceFilePath: null,
  editorScrollState: null,
});
const emit = defineEmits<{
  'request-preview-mode-change': [mode: 'edit' | 'split' | 'preview'];
}>();

const previewRef = ref<HTMLElement | null>(null);
const previewScrollRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const html = ref('');
let renderTimer: ReturnType<typeof setTimeout> | null = null;
const latestEditorScrollState = ref<{ top: number; height: number; scrollHeight: number } | null>(null);
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  target: { kind: 'blank', sourceFilePath: props.sourceFilePath } as MarkdownPreviewContextTarget,
  items: [] as PreviewMenuItem[],
});

const closeContextMenu = () => {
  contextMenu.value.visible = false;
  contextMenu.value.items = [];
};

const copyToClipboard = async (text: string) => {
  if (!text) {
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const isAbsoluteAddress = (value: string) => /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) || value.startsWith('//');
const isWindowsDrivePath = (value: string) => /^[a-zA-Z]:[\\/]/.test(value);

const buildSourceBaseUrl = (sourceFilePath?: string | null) => {
  if (!sourceFilePath) {
    return null;
  }

  const normalized = sourceFilePath.trim().replace(/\\/g, '/');
  if (!normalized) {
    return null;
  }

  if (isWindowsDrivePath(normalized)) {
    const directory = normalized.slice(0, Math.max(0, normalized.lastIndexOf('/') + 1));
    return directory ? `file:///${directory}` : null;
  }

  if (isAbsoluteAddress(normalized)) {
    try {
      const url = new URL(normalized);
      url.hash = '';
      url.search = '';
      url.pathname = url.pathname.replace(/[^/]*$/, '');
      return url.toString();
    } catch {
      return null;
    }
  }

  if (!normalized.startsWith('/')) {
    return null;
  }

  const directory = normalized.slice(0, Math.max(0, normalized.lastIndexOf('/') + 1));
  return directory ? `file://${directory}` : null;
};

const resolveAddress = (rawAddress: string, sourceFilePath?: string | null) => {
  const address = rawAddress.trim();
  if (!address) {
    return null;
  }

  if (address.startsWith('#')) {
    try {
      return new URL(address, window.location.href).toString();
    } catch {
      return null;
    }
  }

  if (isAbsoluteAddress(address)) {
    try {
      if (address.startsWith('//')) {
        return `${window.location.protocol}${address}`;
      }
      return new URL(address).toString();
    } catch {
      return null;
    }
  }

  const baseUrl = buildSourceBaseUrl(sourceFilePath);
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(address, baseUrl).toString();
  } catch {
    return null;
  }
};

const resolveContextTarget = (eventTarget: EventTarget | null): MarkdownPreviewContextTarget => {
  const sourceFilePath = props.sourceFilePath;
  const target = eventTarget instanceof Element ? eventTarget : null;
  const preview = previewRef.value;

  if (target && preview?.contains(target)) {
    const imageEl = target.closest('img[src]');
    if (imageEl instanceof HTMLImageElement) {
      const rawSrc = imageEl.getAttribute('src') ?? '';
      return {
        kind: 'image',
        src: rawSrc,
        resolvedSrc: resolveAddress(rawSrc, sourceFilePath),
        alt: imageEl.getAttribute('alt') ?? undefined,
        sourceFilePath,
      };
    }

    const linkEl = target.closest('a[href]');
    if (linkEl instanceof HTMLAnchorElement) {
      const rawHref = linkEl.getAttribute('href') ?? '';
      return {
        kind: 'link',
        href: rawHref,
        resolvedHref: resolveAddress(rawHref, sourceFilePath),
        text: linkEl.textContent?.trim() || undefined,
        sourceFilePath,
      };
    }
  }

  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? '';
  if (selection && selectedText) {
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    const isAnchorInside = !!(anchorNode && preview?.contains(anchorNode));
    const isFocusInside = !!(focusNode && preview?.contains(focusNode));
    if (isAnchorInside || isFocusInside) {
      return {
        kind: 'selection',
        text: selectedText,
        sourceFilePath,
      };
    }
  }

  if (target && preview?.contains(target)) {
    const codeRoot = target.closest('pre');
    if (codeRoot) {
      const codeElement = codeRoot.querySelector('code');
      const className = codeElement?.className ?? '';
      const language = className.startsWith('language-') ? className.replace(/^language-/, '') : undefined;
      return {
        kind: 'code-block',
        language,
        code: codeElement?.textContent ?? codeRoot.textContent ?? undefined,
        sourceFilePath,
      };
    }
  }

  return {
    kind: 'blank',
    sourceFilePath,
  };
};

const openAddress = (address: string, openInNewWindow: boolean) => {
  if (!address) {
    return;
  }
  if (openInNewWindow) {
    window.open(address, '_blank', 'noopener,noreferrer');
    return;
  }
  window.open(address, '_self');
};

const requestPreviewModeChange = (mode: 'edit' | 'split' | 'preview') => {
  emit('request-preview-mode-change', mode);
};

const buildMenuItems = (target: MarkdownPreviewContextTarget): PreviewMenuItem[] => {
  const items: PreviewMenuItem[] = [];

  if (target.kind === 'selection' && target.text) {
    items.push({
      id: 'copy-selection',
      label: '复制选中文本',
      run: () => copyToClipboard(target.text),
    });
  }

  items.push(
    {
      id: 'copy-markdown',
      label: '复制全文 Markdown',
      dividerBefore: items.length > 0,
      run: () => copyToClipboard(props.content || ''),
    },
    {
      id: 'refresh-preview',
      label: '刷新预览',
      run: () => scheduleRender(),
    },
    {
      id: 'set-preview-mode-edit',
      label: '切换为仅编辑',
      dividerBefore: true,
      run: () => requestPreviewModeChange('edit'),
    },
    {
      id: 'set-preview-mode-split',
      label: '切换为分栏',
      run: () => requestPreviewModeChange('split'),
    },
    {
      id: 'set-preview-mode-preview',
      label: '切换为仅预览',
      run: () => requestPreviewModeChange('preview'),
    },
  );

  if (target.kind === 'link' && target.resolvedHref) {
    items.push(
      {
        id: 'open-link',
        label: '打开链接',
        dividerBefore: true,
        run: () => openAddress(target.resolvedHref!, false),
      },
      {
        id: 'open-link-new-tab',
        label: '在新窗口打开链接',
        run: () => openAddress(target.resolvedHref!, true),
      },
      {
        id: 'copy-link',
        label: '复制链接地址',
        run: () => copyToClipboard(target.resolvedHref!),
      },
    );
  }

  if (target.kind === 'image' && target.resolvedSrc) {
    items.push(
      {
        id: 'open-image',
        label: '打开图片',
        dividerBefore: true,
        run: () => openAddress(target.resolvedSrc!, false),
      },
      {
        id: 'open-image-new-tab',
        label: '在新窗口查看图片',
        run: () => openAddress(target.resolvedSrc!, true),
      },
      {
        id: 'copy-image-src',
        label: '复制图片地址',
        run: () => copyToClipboard(target.resolvedSrc!),
      },
    );
  }

  return items.filter((item) => item.visible !== false);
};

const clampMenuPosition = (x: number, y: number, width: number, height: number) => {
  const maxX = Math.max(MENU_MARGIN, window.innerWidth - width - MENU_MARGIN);
  const maxY = Math.max(MENU_MARGIN, window.innerHeight - height - MENU_MARGIN);
  return {
    x: Math.max(MENU_MARGIN, Math.min(x, maxX)),
    y: Math.max(MENU_MARGIN, Math.min(y, maxY)),
  };
};

const openContextMenu = async (x: number, y: number, target: MarkdownPreviewContextTarget) => {
  const items = buildMenuItems(target);
  const estimatedHeight = items.length * MENU_ITEM_HEIGHT + 12;
  const estimated = clampMenuPosition(x, y, MENU_ESTIMATED_WIDTH, estimatedHeight);

  contextMenu.value = {
    visible: true,
    x: estimated.x,
    y: estimated.y,
    target,
    items,
  };

  await nextTick();

  if (!contextMenu.value.visible || !menuRef.value) {
    return;
  }

  const rect = menuRef.value.getBoundingClientRect();
  const adjusted = clampMenuPosition(x, y, rect.width, rect.height);
  contextMenu.value.x = adjusted.x;
  contextMenu.value.y = adjusted.y;
};

const handleContextMenu = (event: MouseEvent) => {
  const target = resolveContextTarget(event.target);
  void openContextMenu(event.clientX, event.clientY, target);
};

const handleGlobalPointerDown = (event: MouseEvent) => {
  if (!contextMenu.value.visible) {
    return;
  }

  const eventTarget = event.target as Node | null;
  if (eventTarget && menuRef.value?.contains(eventTarget)) {
    return;
  }

  closeContextMenu();
};

const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeContextMenu();
  }
};

const runMenuItem = async (item: PreviewMenuItem) => {
  if (item.disabled) {
    return;
  }

  closeContextMenu();

  try {
    await item.run();
  } catch {
    // 当前阶段仅保证失败不伪装成功，不额外弹提示
  }
};

const syncPreviewScroll = (state: { top: number; height: number; scrollHeight: number }) => {
  const previewContainer = previewScrollRef.value;
  if (!previewContainer) {
    return;
  }

  const editorScrollable = Math.max(0, state.scrollHeight - state.height);
  const previewScrollable = Math.max(0, previewContainer.scrollHeight - previewContainer.clientHeight);

  if (previewScrollable <= 0 || editorScrollable <= 0) {
    previewContainer.scrollTop = 0;
    return;
  }

  const ratio = Math.min(1, Math.max(0, state.top / editorScrollable));
  previewContainer.scrollTop = previewScrollable * ratio;
};

const scheduleRender = () => {
  if (renderTimer) {
    clearTimeout(renderTimer);
  }

  renderTimer = setTimeout(async () => {
    html.value = renderMarkdown(props.content || '');
    await nextTick();
    if (previewRef.value) {
      await renderMermaidDiagrams(previewRef.value, props.theme);
    }
    if (latestEditorScrollState.value) {
      syncPreviewScroll(latestEditorScrollState.value);
    }
  }, 150);
};

watch(
  () => [props.content, props.theme],
  () => {
    closeContextMenu();
    scheduleRender();
  },
  { immediate: true },
);

watch(
  () => props.editorScrollState,
  (state) => {
    if (!state) {
      return;
    }
    latestEditorScrollState.value = state;
    syncPreviewScroll(state);
  },
  { deep: true },
);

onMounted(() => {
  document.addEventListener('mousedown', handleGlobalPointerDown);
  window.addEventListener('keydown', handleGlobalKeydown);
});

onBeforeUnmount(() => {
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }
  document.removeEventListener('mousedown', handleGlobalPointerDown);
  window.removeEventListener('keydown', handleGlobalKeydown);
  closeContextMenu();
});
</script>

<style scoped>
.markdown-preview {
  position: relative;
  height: 100%;
  overflow: auto;
  background: var(--panel, #101726);
}

.markdown-preview-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
  color: var(--text-primary, #ecf2ff);
  line-height: 1.65;
}

.markdown-preview-content :deep(h1),
.markdown-preview-content :deep(h2),
.markdown-preview-content :deep(h3) {
  line-height: 1.3;
  margin-top: 1.3em;
  margin-bottom: 0.45em;
}

.markdown-preview-content :deep(code) {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--surface-muted, rgba(255, 255, 255, 0.06));
}

.markdown-preview-content :deep(pre) {
  overflow: auto;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.2));
  background: rgba(9, 14, 26, 0.45);
}

.markdown-preview-content :deep(.markdown-mermaid-error) {
  margin: 12px 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(248, 113, 113, 0.45);
  background: rgba(248, 113, 113, 0.12);
  color: #fecaca;
}

.markdown-preview-content :deep(.markdown-mermaid-diagram) {
  margin: 12px 0;
  overflow: auto;
}

.preview-context-menu {
  position: fixed;
  z-index: 60;
  min-width: 220px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.2));
  background: var(--surface-raised, #1b2436);
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.35);
}

.preview-context-menu-divider {
  height: 1px;
  margin: 6px 4px;
  background: var(--border-soft, rgba(148, 163, 184, 0.2));
}

.preview-context-menu-item {
  display: block;
  width: 100%;
  margin: 0;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  text-align: left;
  color: var(--text-secondary, #cbd5e1);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}

.preview-context-menu-item:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #f8fafc);
}

.preview-context-menu-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
