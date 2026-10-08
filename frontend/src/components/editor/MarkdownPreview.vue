<template>
  <div
    ref="previewScrollRef"
    class="markdown-preview"
    :class="`markdown-preview--${settingsStore.markdownPreviewTheme}`"
    data-testid="markdown-preview"
    @contextmenu.prevent="handleContextMenu"
    @click="handlePreviewClick"
    @dblclick="handlePreviewDoubleClick"
  >
    <div ref="previewRef" class="markdown-preview-content" v-html="html"></div>
  </div>
  <teleport to="body">
    <div
      v-if="contextMenu.visible"
      ref="menuRef"
      class="preview-context-menu"
      :class="`markdown-preview--${settingsStore.markdownPreviewTheme}`"
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
/**
 * 渲染重依赖（marked / DOMPurify / mermaid）按需加载：
 * 只有真正打开 Markdown 预览时才会拉取这个 chunk。
 */
let markdownRenderModule: typeof import('@/services/markdownRenderService') | null = null;
const loadMarkdownRenderer = async () => {
  if (!markdownRenderModule) {
    markdownRenderModule = await import('@/services/markdownRenderService');
  }
  return markdownRenderModule;
};
import { useSettingsStore } from '@/stores/settings';
import { getMarkdownPreviewI18n } from '@/i18n/ui';
import { appCommands, isTauriApp } from '@/lib/tauri';

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
  value: 'docs-clean' | 'paper-soft' | 'editorial-warm' | 'graphite-night' | 'mint-grove' | 'lavender-letter' | 'deep-ocean';
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
  'open-image': [payload: { src: string; alt?: string; resolvedSrc: string }];
}>();

const previewRef = ref<HTMLElement | null>(null);
const previewScrollRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const settingsStore = useSettingsStore();
const copy = computed(() => getMarkdownPreviewI18n(settingsStore.uiLanguage));
const html = ref('');
let renderTimer: ReturnType<typeof setTimeout> | null = null;
let isPreviewReady = false;
let isRenderingMermaid = false;
let renderVersion = 0;
let activeRenderTasks = 0;
let completedRenderVersion: number | null = null;
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

const fileUrlToPath = (address: string): string | null => {
  try {
    const url = new URL(address);
    if (url.protocol !== 'file:') {
      return null;
    }

    let pathname = decodeURIComponent(url.pathname);
    if (/^\/[a-zA-Z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return pathname || null;
  } catch {
    return null;
  }
};

/**
 * 将 Markdown 中相对图片路径转换为 Tauri asset URL，避免 WebView 把它解析到应用资源目录。
 * @author Albert_Luo
 * @date 2026-10-01
 */
const resolveLocalImageSources = async () => {
  if (!isTauriApp() || !previewRef.value || !props.sourceFilePath) {
    return;
  }

  const { convertFileSrc } = await import('@tauri-apps/api/core');
  const images = Array.from(previewRef.value.querySelectorAll<HTMLImageElement>('img[src]'));
  for (const image of images) {
    const rawSrc = image.getAttribute('src')?.trim() ?? '';
    if (rawSrc) {
      image.dataset.markdownSrc = rawSrc;
    }
    if (
      !rawSrc
      || isAbsoluteAddress(rawSrc)
      || rawSrc.startsWith('#')
      || rawSrc.startsWith('data:')
      || rawSrc.startsWith('blob:')
    ) {
      continue;
    }

    const resolved = resolveAddress(rawSrc, props.sourceFilePath);
    const filePath = resolved ? fileUrlToPath(resolved) : null;
    if (filePath) {
      const tauriSrc = convertFileSrc(filePath);
      image.src = tauriSrc;
      image.dataset.markdownResolvedSrc = tauriSrc;
    } else if (resolved) {
      image.dataset.markdownResolvedSrc = resolved;
    }
  }
};

const getImageSourceParts = (image: HTMLImageElement) => {
  const rawSrc = image.dataset.markdownSrc?.trim()
    || image.getAttribute('src')?.trim()
    || '';
  const resolvedSrc = image.dataset.markdownResolvedSrc?.trim()
    || resolveAddress(rawSrc, props.sourceFilePath)
    || null;

  return { rawSrc, resolvedSrc };
};

const getImageInteractionPayload = (image: HTMLImageElement) => {
  const { rawSrc, resolvedSrc } = getImageSourceParts(image);

  return {
    src: rawSrc,
    alt: image.getAttribute('alt')?.trim() || undefined,
    resolvedSrc: resolvedSrc || rawSrc,
  };
};

const handlePreviewDoubleClick = (event: MouseEvent) => {
  const target = event.target instanceof Element ? event.target.closest('img[src]') : null;
  if (!(target instanceof HTMLImageElement) || !previewRef.value?.contains(target)) {
    return;
  }

  emit('open-image', getImageInteractionPayload(target));
};

const resolveContextTarget = (eventTarget: EventTarget | null): MarkdownPreviewContextTarget => {
  const sourceFilePath = props.sourceFilePath;
  const target = eventTarget instanceof Element ? eventTarget : null;
  const preview = previewRef.value;

  if (target && preview?.contains(target)) {
    const imageEl = target.closest('img[src]');
    if (imageEl instanceof HTMLImageElement) {
      const { rawSrc, resolvedSrc } = getImageSourceParts(imageEl);
      return {
        kind: 'image',
        src: rawSrc,
        resolvedSrc,
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

const isBrowserUrl = (address: string) => /^https?:\/\//i.test(address.trim());

/**
 * 所有 Markdown 网页链接统一交给系统默认浏览器，避免在 Tauri WebView 内导航。
 * @author Albert_Luo
 * @date 2026-10-07
 */
const openAddress = async (address: string) => {
  const normalized = address.trim();
  if (!isBrowserUrl(normalized)) {
    return;
  }

  await appCommands.openExternalLink(normalized);
};

const handlePreviewClick = (event: MouseEvent) => {
  const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(target instanceof HTMLAnchorElement) || !previewRef.value?.contains(target)) {
    return;
  }

  const rawHref = target.getAttribute('href')?.trim() ?? '';
  if (!rawHref || rawHref.startsWith('#')) {
    return;
  }

  // 禁止 WebView 处理 Markdown 链接；仅 http/https 地址交给系统浏览器。
  event.preventDefault();
  event.stopPropagation();
  const resolvedHref = resolveAddress(rawHref, props.sourceFilePath);
  if (resolvedHref && isBrowserUrl(resolvedHref)) {
    void openAddress(resolvedHref);
  }
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
  {
    value: 'mint-grove',
    label: copy.value.previewThemeMintGrove,
  },
  {
    value: 'lavender-letter',
    label: copy.value.previewThemeLavenderLetter,
  },
  {
    value: 'deep-ocean',
    label: copy.value.previewThemeDeepOcean,
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
        run: () => openAddress(target.resolvedHref!),
      },
      {
        id: 'open-link-new-tab',
        label: copy.value.openLinkNewWindow,
        run: () => openAddress(target.resolvedHref!),
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
        run: () => openAddress(target.resolvedSrc!),
      },
      {
        id: 'open-image-new-tab',
        label: copy.value.openImageNewWindow,
        run: () => openAddress(target.resolvedSrc!),
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

/**
 * 将超宽表格隔离到自己的横向滚动容器，避免撑破预览区域的布局边界。
 * @author Albert_Luo
 * @date 2026-10-03
 */
const wrapMarkdownTables = () => {
  const preview = previewRef.value;
  if (!preview) {
    return;
  }

  preview.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    const parent = table.parentElement;
    if (parent?.classList.contains('markdown-table-scroll')) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-table-scroll';
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });
};

const scheduleRender = () => {
  if (renderTimer) {
    clearTimeout(renderTimer);
  }

  const currentRenderVersion = ++renderVersion;
  isPreviewReady = false;
  completedRenderVersion = null;

  renderTimer = setTimeout(async () => {
    activeRenderTasks += 1;
    isRenderingMermaid = true;
    try {
      const renderer = await loadMarkdownRenderer();
      html.value = renderer.renderMarkdown(props.content || '');
      await nextTick();
      wrapMarkdownTables();
      await resolveLocalImageSources();
      if (previewRef.value) {
        await renderer.renderMermaidDiagrams(previewRef.value, props.theme);
      }
      if (currentRenderVersion === renderVersion && latestEditorScrollState.value) {
        syncPreviewScroll(latestEditorScrollState.value);
      }
    } finally {
      if (currentRenderVersion !== renderVersion) {
        activeRenderTasks -= 1;
        isRenderingMermaid = activeRenderTasks > 0;
        isPreviewReady = activeRenderTasks === 0 && completedRenderVersion === renderVersion;
        return;
      }
      completedRenderVersion = currentRenderVersion;
      activeRenderTasks -= 1;
      isRenderingMermaid = activeRenderTasks > 0;
      isPreviewReady = activeRenderTasks === 0 && completedRenderVersion === renderVersion;
    }
  }, 150);
};

defineExpose({
  scrollToSourceLine: (line: number) => {
    if (!isPreviewReady || isRenderingMermaid || !previewRef.value) {
      return;
    }

    const sourceLine = Number.isFinite(line) ? Math.max(1, Math.floor(line)) : 1;
    const target = previewRef.value.querySelector<HTMLElement>(`[data-source-line="${sourceLine}"]`);
    target?.scrollIntoView({ block: 'center' });
  },
});

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
  renderVersion += 1;
  completedRenderVersion = null;
  isPreviewReady = false;
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
  width: 100%;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
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

.markdown-preview--mint-grove {
  --preview-bg: #eaf2e9;
  --preview-surface: #f8fcf6;
  --preview-text: #30483a;
  --preview-heading: #193b2b;
  --preview-heading-accent: rgba(57, 132, 91, 0.26);
  --preview-muted: #587363;
  --preview-border: rgba(80, 125, 91, 0.28);
  --preview-quote-border: #4c9a69;
  --preview-quote-bg: rgba(220, 239, 222, 0.74);
  --preview-inline-code-bg: rgba(57, 132, 91, 0.12);
  --preview-inline-code-text: #276440;
  --preview-code-bg: #edf6ed;
  --preview-code-text: #263f31;
  --preview-code-border: rgba(80, 125, 91, 0.32);
  --preview-link: #287347;
  --preview-link-hover: #1b5934;
  --preview-table-header-bg: rgba(204, 229, 207, 0.86);
  --preview-table-row-alt: rgba(231, 243, 231, 0.82);
  --preview-mermaid-error-bg: #fff0ed;
  --preview-mermaid-error-border: rgba(220, 90, 75, 0.35);
  --preview-mermaid-error-text: #923c32;
  --preview-menu-bg: #f8fcf6;
  --preview-menu-border: rgba(80, 125, 91, 0.38);
  --preview-menu-shadow: 0 18px 40px rgba(35, 73, 46, 0.18);
  --preview-menu-text: #30483a;
  --preview-menu-hover-bg: #e2f0e3;
  --preview-menu-hover-text: #193b2b;
  --preview-menu-disabled-text: #758d7d;
}

.markdown-preview--mint-grove .markdown-preview-content :deep(h1),
.markdown-preview--mint-grove .markdown-preview-content :deep(h2) {
  padding-left: 0.65em;
  border-left: 3px solid var(--preview-quote-border);
}

.markdown-preview--lavender-letter {
  --preview-bg: #f0edf7;
  --preview-surface: #fbf9ff;
  --preview-text: #453d55;
  --preview-heading: #302544;
  --preview-heading-accent: rgba(123, 96, 171, 0.24);
  --preview-muted: #716783;
  --preview-border: rgba(117, 99, 149, 0.28);
  --preview-quote-border: #8a70b8;
  --preview-quote-bg: rgba(235, 228, 247, 0.78);
  --preview-inline-code-bg: rgba(123, 96, 171, 0.12);
  --preview-inline-code-text: #5e438e;
  --preview-code-bg: #f3effa;
  --preview-code-text: #413650;
  --preview-code-border: rgba(117, 99, 149, 0.3);
  --preview-link: #7048a3;
  --preview-link-hover: #523278;
  --preview-table-header-bg: rgba(223, 214, 240, 0.86);
  --preview-table-row-alt: rgba(244, 240, 250, 0.92);
  --preview-mermaid-error-bg: #fff0f2;
  --preview-mermaid-error-border: rgba(210, 90, 112, 0.34);
  --preview-mermaid-error-text: #8f3348;
  --preview-menu-bg: #fbf9ff;
  --preview-menu-border: rgba(117, 99, 149, 0.38);
  --preview-menu-shadow: 0 18px 40px rgba(58, 42, 83, 0.18);
  --preview-menu-text: #453d55;
  --preview-menu-hover-bg: #eee8f8;
  --preview-menu-hover-text: #302544;
  --preview-menu-disabled-text: #817892;
}

.markdown-preview--lavender-letter .markdown-preview-content :deep(h1),
.markdown-preview--lavender-letter .markdown-preview-content :deep(h2),
.markdown-preview--lavender-letter .markdown-preview-content :deep(h3) {
  font-family: Georgia, 'Noto Serif', 'Songti SC', serif;
  letter-spacing: 0.015em;
}

.markdown-preview--deep-ocean {
  --preview-bg: #0d1b2a;
  --preview-surface: #122337;
  --preview-text: #dce8f3;
  --preview-heading: #f1f7fc;
  --preview-heading-accent: rgba(74, 180, 218, 0.28);
  --preview-muted: #9bb1c4;
  --preview-border: rgba(105, 151, 180, 0.32);
  --preview-quote-border: #4bb8d8;
  --preview-quote-bg: rgba(31, 91, 119, 0.24);
  --preview-inline-code-bg: rgba(75, 184, 216, 0.16);
  --preview-inline-code-text: #8fe4f5;
  --preview-code-bg: #0a1725;
  --preview-code-text: #dce8f3;
  --preview-code-border: rgba(105, 151, 180, 0.38);
  --preview-link: #79d7ed;
  --preview-link-hover: #b2eff8;
  --preview-table-header-bg: rgba(30, 69, 94, 0.94);
  --preview-table-row-alt: rgba(18, 47, 68, 0.8);
  --preview-mermaid-error-bg: rgba(127, 29, 29, 0.38);
  --preview-mermaid-error-border: rgba(248, 113, 113, 0.45);
  --preview-mermaid-error-text: #fecaca;
  --preview-menu-bg: #122337;
  --preview-menu-border: rgba(105, 151, 180, 0.5);
  --preview-menu-shadow: 0 20px 48px rgba(2, 10, 20, 0.55);
  --preview-menu-text: #dce8f3;
  --preview-menu-hover-bg: rgba(75, 184, 216, 0.18);
  --preview-menu-hover-text: #f1f7fc;
  --preview-menu-disabled-text: #8ba2b5;
}

.markdown-preview--deep-ocean .markdown-preview-content :deep(h1),
.markdown-preview--deep-ocean .markdown-preview-content :deep(h2) {
  text-shadow: 0 0 22px rgba(75, 184, 216, 0.12);
}

.markdown-preview-content {
  width: 100%;
  max-width: none;
  min-width: 0;
  margin: 0;
  padding: 24px;
  box-sizing: border-box;
  color: var(--preview-text);
  line-height: 1.65;
  background: var(--preview-surface);
  min-height: 100%;
  overflow-wrap: anywhere;
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
  border-radius: var(--radius-xs);
  background: var(--preview-inline-code-bg);
  color: var(--preview-inline-code-text);
}

.markdown-preview-content :deep(pre) {
  overflow: auto;
  overflow-wrap: normal;
  word-break: normal;
  padding: 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--preview-code-border);
  background: var(--preview-code-bg);
  color: var(--preview-code-text);
}

.markdown-preview-content :deep(pre code) {
  padding: 0;
  overflow-wrap: normal;
  word-break: normal;
  background: transparent;
  color: inherit;
}

.markdown-preview-content :deep(blockquote) {
  margin: 1.1rem 0;
  padding: 0.85rem 1rem;
  border-left: 4px solid var(--preview-quote-border);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
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

.markdown-preview-content :deep(img),
.markdown-preview-content :deep(svg),
.markdown-preview-content :deep(video),
.markdown-preview-content :deep(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
  box-sizing: border-box;
}

.markdown-preview-content :deep(img) {
  object-fit: contain;
}

.markdown-preview-content :deep(.markdown-table-scroll) {
  width: 100%;
  max-width: 100%;
  margin: 1rem 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-inline: contain;
  -webkit-overflow-scrolling: touch;
}

.markdown-preview-content :deep(table) {
  width: max-content;
  min-width: 100%;
  white-space: nowrap;
  border-collapse: collapse;
  border: 1px solid var(--preview-border);
  border-radius: var(--radius-md);
  box-sizing: border-box;
}

.markdown-preview-content :deep(th),
.markdown-preview-content :deep(td) {
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--preview-border);
  overflow-wrap: anywhere;
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
  border-radius: var(--radius-sm);
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
  border-radius: var(--radius-md);
  border: 1px solid var(--preview-menu-border);
  background: var(--preview-menu-bg);
  box-shadow: var(--preview-menu-shadow);
  backdrop-filter: blur(14px);
}

.preview-context-menu.markdown-preview--docs-clean {
  --preview-menu-bg: #ffffff;
  --preview-menu-border: #cbd5e1;
  --preview-menu-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
  --preview-menu-text: #334155;
  --preview-menu-hover-bg: #eaf1ff;
  --preview-menu-hover-text: #0f172a;
  --preview-menu-disabled-text: #64748b;
  --preview-border: rgba(148, 163, 184, 0.45);
}

.preview-context-menu.markdown-preview--paper-soft {
  --preview-menu-bg: #fffbf3;
  --preview-menu-border: #c7b49b;
  --preview-menu-shadow: 0 18px 38px rgba(75, 59, 45, 0.2);
  --preview-menu-text: #5c4b3e;
  --preview-menu-hover-bg: #f3e6cf;
  --preview-menu-hover-text: #342a21;
  --preview-menu-disabled-text: #817360;
  --preview-border: rgba(145, 123, 97, 0.42);
}

.preview-context-menu.markdown-preview--editorial-warm {
  --preview-menu-bg: #fff8f4;
  --preview-menu-border: #c9a69d;
  --preview-menu-shadow: 0 18px 42px rgba(78, 45, 37, 0.2);
  --preview-menu-text: #5b433c;
  --preview-menu-hover-bg: #f8e7df;
  --preview-menu-hover-text: #2c1814;
  --preview-menu-disabled-text: #88736d;
  --preview-border: rgba(166, 120, 110, 0.42);
}

.preview-context-menu.markdown-preview--graphite-night {
  --preview-menu-bg: #121822;
  --preview-menu-border: #475569;
  --preview-menu-shadow: 0 20px 45px rgba(2, 6, 23, 0.45);
  --preview-menu-text: #d6dde8;
  --preview-menu-hover-bg: rgba(45, 212, 191, 0.16);
  --preview-menu-hover-text: #f8fafc;
  --preview-menu-disabled-text: #94a3b8;
  --preview-border: rgba(100, 116, 139, 0.48);
}

.preview-context-menu.markdown-preview--mint-grove {
  --preview-menu-bg: #f8fcf6;
  --preview-menu-border: rgba(80, 125, 91, 0.38);
  --preview-menu-shadow: 0 18px 40px rgba(35, 73, 46, 0.18);
  --preview-menu-text: #30483a;
  --preview-menu-hover-bg: #e2f0e3;
  --preview-menu-hover-text: #193b2b;
  --preview-menu-disabled-text: #758d7d;
  --preview-border: rgba(80, 125, 91, 0.42);
}

.preview-context-menu.markdown-preview--lavender-letter {
  --preview-menu-bg: #fbf9ff;
  --preview-menu-border: rgba(117, 99, 149, 0.38);
  --preview-menu-shadow: 0 18px 40px rgba(58, 42, 83, 0.18);
  --preview-menu-text: #453d55;
  --preview-menu-hover-bg: #eee8f8;
  --preview-menu-hover-text: #302544;
  --preview-menu-disabled-text: #817892;
  --preview-border: rgba(117, 99, 149, 0.42);
}

.preview-context-menu.markdown-preview--deep-ocean {
  --preview-menu-bg: #122337;
  --preview-menu-border: rgba(105, 151, 180, 0.5);
  --preview-menu-shadow: 0 20px 48px rgba(2, 10, 20, 0.55);
  --preview-menu-text: #dce8f3;
  --preview-menu-hover-bg: rgba(75, 184, 216, 0.18);
  --preview-menu-hover-text: #f1f7fc;
  --preview-menu-disabled-text: #8ba2b5;
  --preview-border: rgba(105, 151, 180, 0.48);
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
  border-radius: var(--radius-sm);
  text-align: left;
  color: var(--preview-menu-text);
  background: transparent;
  font-size: var(--font-size-ui-md, 13px);
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
