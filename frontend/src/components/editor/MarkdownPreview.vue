<template>
  <div
    ref="previewScrollRef"
    class="markdown-preview"
    :class="previewThemeClass"
    data-testid="markdown-preview"
    @contextmenu.prevent="handleContextMenu"
  >
    <div ref="previewRef" class="markdown-preview-content" v-html="html"></div>
  </div>
  <teleport to="body">
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
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { renderMarkdown, renderMermaidDiagrams } from '@/services/markdownService';
import { useSettingsStore } from '@/stores/settings';
import { getMarkdownPreviewI18n } from '@/i18n/ui';

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

type PreviewThemeOption = {
  value: 'docs-clean' | 'paper-soft' | 'editorial-warm' | 'graphite-night';
  label: string;
};

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
const settingsStore = useSettingsStore();
const copy = computed(() => getMarkdownPreviewI18n(settingsStore.uiLanguage));
const previewThemeClass = computed(() => `markdown-preview--${settingsStore.markdownPreviewTheme}`);
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

const getPreviewThemeOptions = (): PreviewThemeOption[] => [
  {
    value: 'docs-clean',
    label: copy.value.previewThemeDocsClean,
  },
  {
    value: 'paper-soft',
    label: copy.value.previewThemePaperSoft,
  },
  {
    value: 'editorial-warm',
    label: copy.value.previewThemeEditorialWarm,
  },
  {
    value: 'graphite-night',
    label: copy.value.previewThemeGraphiteNight,
  },
];

const buildMenuItems = (target: MarkdownPreviewContextTarget): PreviewMenuItem[] => {
  const items: PreviewMenuItem[] = [];

  if (target.kind === 'selection' && target.text) {
    items.push({
      id: 'copy-selection',
      label: copy.value.copySelection,
      run: () => copyToClipboard(target.text),
    });
  }

  items.push(
    {
      id: 'copy-markdown',
      label: copy.value.copyMarkdown,
      dividerBefore: items.length > 0,
      run: () => copyToClipboard(props.content || ''),
    },
    {
      id: 'refresh-preview',
      label: copy.value.refreshPreview,
      run: () => scheduleRender(),
    },
    ...getPreviewThemeOptions().map((themeOption, index) => ({
      id: `theme-${themeOption.value}`,
      label: themeOption.label,
      dividerBefore: index === 0,
      disabled: themeOption.value === settingsStore.markdownPreviewTheme,
      run: () => settingsStore.updateSettings({ markdownPreviewTheme: themeOption.value }),
    })),
    {
      id: 'set-preview-mode-edit',
      label: copy.value.setPreviewModeEdit,
      dividerBefore: true,
      run: () => requestPreviewModeChange('edit'),
    },
    {
      id: 'set-preview-mode-split',
      label: copy.value.setPreviewModeSplit,
      run: () => requestPreviewModeChange('split'),
    },
    {
      id: 'set-preview-mode-preview',
      label: copy.value.setPreviewModePreview,
      run: () => requestPreviewModeChange('preview'),
    },
  );

  if (target.kind === 'link' && target.resolvedHref) {
    items.push(
      {
        id: 'open-link',
        label: copy.value.openLink,
        dividerBefore: true,
        run: () => openAddress(target.resolvedHref!, false),
      },
      {
        id: 'open-link-new-tab',
        label: copy.value.openLinkNewWindow,
        run: () => openAddress(target.resolvedHref!, true),
      },
      {
        id: 'copy-link',
        label: copy.value.copyLink,
        run: () => copyToClipboard(target.resolvedHref!),
      },
    );
  }

  if (target.kind === 'image' && target.resolvedSrc) {
    items.push(
      {
        id: 'open-image',
        label: copy.value.openImage,
        dividerBefore: true,
        run: () => openAddress(target.resolvedSrc!, false),
      },
      {
        id: 'open-image-new-tab',
        label: copy.value.openImageNewWindow,
        run: () => openAddress(target.resolvedSrc!, true),
      },
      {
        id: 'copy-image-src',
        label: copy.value.copyImageSource,
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
  --preview-bg: #f6f8fc;
  --preview-surface: #ffffff;
  --preview-text: #243245;
  --preview-heading: #0f172a;
  --preview-heading-accent: rgba(59, 130, 246, 0.18);
  --preview-muted: #526176;
  --preview-border: rgba(148, 163, 184, 0.3);
  --preview-quote-border: #93c5fd;
  --preview-quote-bg: rgba(219, 234, 254, 0.55);
  --preview-inline-code-bg: rgba(37, 99, 235, 0.08);
  --preview-inline-code-text: #1d4ed8;
  --preview-code-bg: #f8fafc;
  --preview-code-text: #1e293b;
  --preview-code-border: rgba(148, 163, 184, 0.35);
  --preview-link: #2563eb;
  --preview-link-hover: #1d4ed8;
  --preview-table-header-bg: rgba(226, 232, 240, 0.7);
  --preview-table-row-alt: rgba(248, 250, 252, 0.95);
  --preview-mermaid-error-bg: rgba(254, 226, 226, 0.9);
  --preview-mermaid-error-border: rgba(248, 113, 113, 0.45);
  --preview-mermaid-error-text: #991b1b;
  --preview-menu-bg: rgba(255, 255, 255, 0.96);
  --preview-menu-border: rgba(148, 163, 184, 0.25);
  --preview-menu-shadow: 0 18px 36px rgba(15, 23, 42, 0.16);
  --preview-menu-text: #334155;
  --preview-menu-hover-bg: rgba(37, 99, 235, 0.08);
  --preview-menu-hover-text: #0f172a;
  --preview-menu-disabled-text: #94a3b8;
  position: relative;
  height: 100%;
  overflow: auto;
  background: var(--preview-bg);
  color: var(--preview-text);
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.markdown-preview--docs-clean {
  --preview-bg: #f5f8fc;
  --preview-surface: #ffffff;
  --preview-text: #243245;
  --preview-heading: #0f172a;
  --preview-heading-accent: rgba(96, 165, 250, 0.18);
  --preview-muted: #526176;
  --preview-border: rgba(148, 163, 184, 0.28);
  --preview-quote-border: #60a5fa;
  --preview-quote-bg: rgba(219, 234, 254, 0.62);
  --preview-inline-code-bg: rgba(59, 130, 246, 0.08);
  --preview-inline-code-text: #1d4ed8;
  --preview-code-bg: #eff6ff;
  --preview-code-text: #1e293b;
  --preview-code-border: rgba(148, 163, 184, 0.32);
  --preview-link: #2563eb;
  --preview-link-hover: #1d4ed8;
  --preview-table-header-bg: rgba(226, 232, 240, 0.9);
  --preview-table-row-alt: rgba(248, 250, 252, 0.92);
  --preview-mermaid-error-bg: rgba(254, 242, 242, 0.95);
  --preview-mermaid-error-border: rgba(248, 113, 113, 0.45);
  --preview-mermaid-error-text: #991b1b;
  --preview-menu-bg: rgba(255, 255, 255, 0.98);
  --preview-menu-border: rgba(203, 213, 225, 0.85);
  --preview-menu-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
  --preview-menu-text: #334155;
  --preview-menu-hover-bg: rgba(37, 99, 235, 0.08);
  --preview-menu-hover-text: #0f172a;
  --preview-menu-disabled-text: #94a3b8;
}

.markdown-preview--paper-soft {
  --preview-bg: #f4ecd8;
  --preview-surface: rgba(255, 251, 240, 0.96);
  --preview-text: #4d4438;
  --preview-heading: #342a21;
  --preview-heading-accent: rgba(191, 145, 91, 0.18);
  --preview-muted: #76695a;
  --preview-border: rgba(145, 123, 97, 0.28);
  --preview-quote-border: #bf915b;
  --preview-quote-bg: rgba(245, 228, 194, 0.68);
  --preview-inline-code-bg: rgba(166, 124, 82, 0.12);
  --preview-inline-code-text: #8c4b1f;
  --preview-code-bg: #f8efe1;
  --preview-code-text: #4b3b2d;
  --preview-code-border: rgba(145, 123, 97, 0.3);
  --preview-link: #9d5f26;
  --preview-link-hover: #7a4218;
  --preview-table-header-bg: rgba(233, 216, 189, 0.82);
  --preview-table-row-alt: rgba(255, 250, 242, 0.82);
  --preview-mermaid-error-bg: rgba(255, 239, 234, 0.9);
  --preview-mermaid-error-border: rgba(234, 88, 12, 0.35);
  --preview-mermaid-error-text: #9a3412;
  --preview-menu-bg: rgba(255, 251, 243, 0.97);
  --preview-menu-border: rgba(145, 123, 97, 0.32);
  --preview-menu-shadow: 0 18px 38px rgba(75, 59, 45, 0.18);
  --preview-menu-text: #5c4b3e;
  --preview-menu-hover-bg: rgba(191, 145, 91, 0.14);
  --preview-menu-hover-text: #342a21;
  --preview-menu-disabled-text: #a79885;
}

.markdown-preview--editorial-warm {
  --preview-bg: #fcf4ee;
  --preview-surface: rgba(255, 250, 246, 0.98);
  --preview-text: #45332d;
  --preview-heading: #2c1814;
  --preview-heading-accent: rgba(190, 92, 64, 0.18);
  --preview-muted: #735851;
  --preview-border: rgba(166, 120, 110, 0.3);
  --preview-quote-border: #c26b4f;
  --preview-quote-bg: rgba(249, 221, 212, 0.62);
  --preview-inline-code-bg: rgba(194, 107, 79, 0.12);
  --preview-inline-code-text: #9a3412;
  --preview-code-bg: #fff1eb;
  --preview-code-text: #4a2d25;
  --preview-code-border: rgba(166, 120, 110, 0.28);
  --preview-link: #b45309;
  --preview-link-hover: #92400e;
  --preview-table-header-bg: rgba(248, 221, 212, 0.85);
  --preview-table-row-alt: rgba(255, 247, 243, 0.9);
  --preview-mermaid-error-bg: rgba(254, 226, 226, 0.92);
  --preview-mermaid-error-border: rgba(220, 38, 38, 0.34);
  --preview-mermaid-error-text: #991b1b;
  --preview-menu-bg: rgba(255, 248, 244, 0.98);
  --preview-menu-border: rgba(166, 120, 110, 0.32);
  --preview-menu-shadow: 0 18px 42px rgba(78, 45, 37, 0.16);
  --preview-menu-text: #5b433c;
  --preview-menu-hover-bg: rgba(194, 107, 79, 0.12);
  --preview-menu-hover-text: #2c1814;
  --preview-menu-disabled-text: #b09a93;
}

.markdown-preview--graphite-night {
  --preview-bg: #13181f;
  --preview-surface: rgba(21, 28, 38, 0.96);
  --preview-text: #d6dde8;
  --preview-heading: #f8fafc;
  --preview-heading-accent: rgba(94, 234, 212, 0.18);
  --preview-muted: #9aa7bb;
  --preview-border: rgba(100, 116, 139, 0.34);
  --preview-quote-border: #5eead4;
  --preview-quote-bg: rgba(45, 212, 191, 0.08);
  --preview-inline-code-bg: rgba(45, 212, 191, 0.12);
  --preview-inline-code-text: #99f6e4;
  --preview-code-bg: #0f172a;
  --preview-code-text: #e2e8f0;
  --preview-code-border: rgba(71, 85, 105, 0.48);
  --preview-link: #7dd3fc;
  --preview-link-hover: #bae6fd;
  --preview-table-header-bg: rgba(30, 41, 59, 0.92);
  --preview-table-row-alt: rgba(15, 23, 42, 0.8);
  --preview-mermaid-error-bg: rgba(127, 29, 29, 0.32);
  --preview-mermaid-error-border: rgba(248, 113, 113, 0.4);
  --preview-mermaid-error-text: #fecaca;
  --preview-menu-bg: rgba(18, 24, 34, 0.98);
  --preview-menu-border: rgba(71, 85, 105, 0.54);
  --preview-menu-shadow: 0 20px 45px rgba(2, 6, 23, 0.45);
  --preview-menu-text: #d6dde8;
  --preview-menu-hover-bg: rgba(45, 212, 191, 0.12);
  --preview-menu-hover-text: #f8fafc;
  --preview-menu-disabled-text: #64748b;
}

.markdown-preview-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
  color: var(--preview-text);
  line-height: 1.65;
  background: var(--preview-surface);
  min-height: 100%;
}

.markdown-preview-content :deep(h1),
.markdown-preview-content :deep(h2),
.markdown-preview-content :deep(h3) {
  line-height: 1.3;
  margin-top: 1.3em;
  margin-bottom: 0.45em;
  color: var(--preview-heading);
}

.markdown-preview-content :deep(h1),
.markdown-preview-content :deep(h2) {
  padding-bottom: 0.18em;
  border-bottom: 1px solid var(--preview-heading-accent);
}

.markdown-preview-content :deep(p),
.markdown-preview-content :deep(li),
.markdown-preview-content :deep(td),
.markdown-preview-content :deep(th) {
  color: var(--preview-text);
}

.markdown-preview-content :deep(strong) {
  color: var(--preview-heading);
}

.markdown-preview-content :deep(code) {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--preview-inline-code-bg);
  color: var(--preview-inline-code-text);
}

.markdown-preview-content :deep(pre) {
  overflow: auto;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--preview-code-border);
  background: var(--preview-code-bg);
  color: var(--preview-code-text);
}

.markdown-preview-content :deep(pre code) {
  padding: 0;
  background: transparent;
  color: inherit;
}

.markdown-preview-content :deep(blockquote) {
  margin: 1.1rem 0;
  padding: 0.85rem 1rem;
  border-left: 4px solid var(--preview-quote-border);
  border-radius: 0 12px 12px 0;
  background: var(--preview-quote-bg);
  color: var(--preview-muted);
}

.markdown-preview-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--preview-border);
  margin: 1.75rem 0;
}

.markdown-preview-content :deep(a) {
  color: var(--preview-link);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--preview-link) 35%, transparent);
  text-underline-offset: 0.15em;
}

.markdown-preview-content :deep(a:hover) {
  color: var(--preview-link-hover);
}

.markdown-preview-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  border: 1px solid var(--preview-border);
  overflow: hidden;
}

.markdown-preview-content :deep(th),
.markdown-preview-content :deep(td) {
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--preview-border);
}

.markdown-preview-content :deep(th) {
  background: var(--preview-table-header-bg);
  color: var(--preview-heading);
}

.markdown-preview-content :deep(tr:nth-child(even) td) {
  background: var(--preview-table-row-alt);
}

.markdown-preview-content :deep(.markdown-mermaid-error) {
  margin: 12px 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--preview-mermaid-error-border);
  background: var(--preview-mermaid-error-bg);
  color: var(--preview-mermaid-error-text);
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
  border: 1px solid var(--preview-menu-border);
  background: var(--preview-menu-bg);
  box-shadow: var(--preview-menu-shadow);
  backdrop-filter: blur(14px);
}

.preview-context-menu-divider {
  height: 1px;
  margin: 6px 4px;
  background: var(--preview-border);
}

.preview-context-menu-item {
  display: block;
  width: 100%;
  margin: 0;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  text-align: left;
  color: var(--preview-menu-text);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.preview-context-menu-item:hover {
  background: var(--preview-menu-hover-bg);
  color: var(--preview-menu-hover-text);
}

.preview-context-menu-item.disabled {
  color: var(--preview-menu-disabled-text);
  opacity: 0.9;
  cursor: not-allowed;
}
</style>
