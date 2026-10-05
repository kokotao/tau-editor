<template>
  <section class="theme-marketplace" data-testid="theme-marketplace-panel">
    <div class="theme-marketplace-header">
      <div>
        <h4 class="theme-marketplace-title">{{ labels.title }}</h4>
        <p class="theme-marketplace-subtitle">{{ labels.subtitle }}</p>
      </div>
      <div class="theme-marketplace-header-actions">
        <button class="theme-marketplace-button" type="button" :disabled="loading" @click="loadCatalog">
          <span class="theme-marketplace-button-icon" aria-hidden="true">↻</span>{{ labels.refresh }}
        </button>
        <button class="theme-marketplace-button" type="button" @click="openRepository(repositoryUrl())">
          <span class="theme-marketplace-button-icon" aria-hidden="true">↗</span>{{ labels.publish }}
        </button>
      </div>
    </div>

    <div class="theme-marketplace-overview" data-testid="theme-marketplace-overview">
      <div class="theme-marketplace-overview-row">
        <span>{{ labels.marketStatus }}</span>
        <strong :class="{ danger: Boolean(errorMessage) }">{{ overviewStatus }}</strong>
      </div>
      <div class="theme-marketplace-overview-row">
        <span>{{ labels.remoteThemes }}</span>
        <strong>{{ catalog?.items.length ?? 0 }}</strong>
      </div>
      <div class="theme-marketplace-overview-row">
        <span>{{ labels.installed }}</span>
        <strong>{{ installedIds.length }}</strong>
      </div>
      <div class="theme-marketplace-overview-row">
        <span>{{ labels.localThemes }}</span>
        <strong>{{ activeId ? labels.enabled : labels.disabled }}</strong>
      </div>
    </div>

    <div class="theme-marketplace-toolbar">
      <input
        v-model="query"
        class="theme-marketplace-search"
        type="search"
        :placeholder="labels.search"
        :aria-label="labels.search"
      />
      <select v-model="typeFilter" class="theme-marketplace-filter" :aria-label="labels.typeFilter">
        <option value="all">{{ labels.all }}</option>
        <option value="theme">{{ labels.theme }}</option>
        <option value="palette">{{ labels.palette }}</option>
      </select>
    </div>

    <div class="theme-marketplace-status" :class="{ error: Boolean(errorMessage) }" role="status">
      <span v-if="loading">{{ labels.loading }}</span>
      <span v-else-if="errorMessage">{{ errorMessage }}</span>
      <span v-else-if="source === 'cache'">{{ labels.cached }}</span>
      <span v-else>{{ labels.online }}</span>
      <button class="theme-marketplace-source" type="button" @click="openRepository(repositoryUrl())">
        <span class="theme-marketplace-button-icon" aria-hidden="true">↗</span>{{ labels.source }}
      </button>
    </div>

    <div v-if="!loading && filteredItems.length === 0" class="theme-marketplace-empty">
      {{ query ? labels.noMatch : labels.empty }}
    </div>

    <div v-else class="theme-marketplace-grid">
      <article v-for="item in filteredItems" :key="`${item.type}-${item.id}`" class="theme-marketplace-card">
        <div
          class="theme-marketplace-preview"
          data-testid="theme-marketplace-preview"
          :style="previewStyle(item)"
          :aria-label="`${item.name} ${labels.preview}`"
          role="img"
        >
          <img
            v-if="item.preview && !previewErrorIds.has(item.id)"
            class="theme-marketplace-preview-image"
            :src="previewUrl(item)"
            :alt="`${item.name} ${labels.preview}`"
            loading="lazy"
            @error="handlePreviewError(item.id)"
          />
          <div v-else class="theme-preview-fallback" aria-hidden="true">
            <div class="theme-preview-toolbar">
              <span class="theme-preview-dots"><i></i><i></i><i></i></span>
              <span class="theme-preview-tab">workspace.md</span>
              <span class="theme-preview-state">●</span>
            </div>
            <div class="theme-preview-content">
              <div class="theme-preview-sidebar"><i></i><i></i><i></i><i></i></div>
              <div class="theme-preview-editor">
                <div class="theme-preview-line"><b>01</b><span class="syntax-muted">#</span><span> { {{ item.name }} }</span></div>
                <div class="theme-preview-line"><b>02</b><span class="syntax-accent">const</span><span> editor = </span><span class="syntax-strong">ready</span></div>
                <div class="theme-preview-line"><b>03</b><span class="syntax-muted">// calm workspace</span></div>
                <div class="theme-preview-line"><b>04</b><span class="syntax-success">saved</span><span> · Markdown</span></div>
              </div>
            </div>
            <div class="theme-preview-statusbar"><span>{{ item.type === 'theme' ? labels.theme : labels.palette }}</span><span>Ln 4 · 12</span></div>
          </div>
        </div>
        <div class="theme-marketplace-card-main">
          <div class="theme-marketplace-card-title-row">
            <h5>{{ item.name }}</h5>
            <span class="theme-marketplace-type">{{ item.type === 'theme' ? labels.theme : labels.palette }}</span>
          </div>
          <p class="theme-marketplace-meta">{{ item.author }} · v{{ item.version }} · {{ item.license }}</p>
          <div v-if="item.tags?.length" class="theme-marketplace-tags">
            <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
          </div>
        </div>
        <div class="theme-marketplace-actions">
          <button
            class="theme-marketplace-button primary"
            type="button"
            :disabled="busyId === item.id"
            @click="install(item)"
          >
            {{ busyId === item.id ? labels.installing : installedIds.includes(item.id) ? labels.reinstall : labels.install }}
          </button>
          <button
            v-if="installedIds.includes(item.id)"
            class="theme-marketplace-button"
            type="button"
            :disabled="activeId === item.id || busyId === item.id"
            @click="$emit('apply', item.id)"
          >
            {{ activeId === item.id ? labels.active : labels.apply }}
          </button>
          <button
            class="theme-marketplace-icon-button"
            type="button"
            :title="labels.viewSource"
            :aria-label="`${labels.viewSource}: ${item.name}`"
            @click="$emit('view-source', { item })"
          >
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { appCommands } from '@/lib/tauri';
import {
  DEFAULT_THEME_MARKETPLACE_CATALOG_URL,
  ThemeMarketplaceService,
  type MarketplacePackageType,
  type ThemeMarketplaceCatalogItem,
  type ThemeMarketplaceCatalog,
  type ThemeMarketplacePackage,
} from '@/services/themeMarketplaceService';

const props = withDefaults(
  defineProps<{
    catalogUrl?: string;
    installedIds?: string[];
    activeId?: string | null;
    autoLoad?: boolean;
    labels?: Partial<typeof defaultLabels>;
  }>(),
  { catalogUrl: DEFAULT_THEME_MARKETPLACE_CATALOG_URL, installedIds: () => [], activeId: null, autoLoad: true },
);

const emit = defineEmits<{
  (event: 'install', payload: { item: ThemeMarketplaceCatalogItem; package: ThemeMarketplacePackage }): void;
  (event: 'apply', packageId: string): void;
  (event: 'error', message: string): void;
  (event: 'loaded', catalog: ThemeMarketplaceCatalog): void;
  (event: 'view-source', payload: { item: ThemeMarketplaceCatalogItem }): void;
}>();

const defaultLabels = {
  title: '主题市场',
  subtitle: '从 GitHub 浏览、安装和切换社区主题',
  refresh: '刷新主题市场',
  publish: '发布主题',
  search: '搜索名称、作者或标签',
  typeFilter: '筛选主题类型',
  all: '全部',
  theme: '完整主题',
  palette: '快速配色',
  loading: '正在刷新主题市场…',
  cached: '当前使用最近一次缓存',
  online: '主题市场已连接',
  source: '查看仓库',
  empty: '暂无可用主题',
  noMatch: '没有匹配的主题',
  install: '安装',
  reinstall: '重新安装',
  installing: '下载中…',
  apply: '应用',
  active: '已应用',
  viewSource: '源码',
  preview: '预览',
  marketStatus: '市场状态',
  remoteThemes: '远程主题',
  installed: '已安装',
  localThemes: '本地整体',
  enabled: '开启',
  disabled: '未启用',
};

const query = ref('');
const typeFilter = ref<'all' | MarketplacePackageType>('all');
const loading = ref(false);
const errorMessage = ref('');
const source = ref<'network' | 'cache' | null>(null);
const catalog = ref<ThemeMarketplaceCatalog | null>(null);
const busyId = ref<string | null>(null);
const previewErrorIds = ref(new Set<string>());
const service = new ThemeMarketplaceService();

const labels = computed(() => ({ ...defaultLabels, ...props.labels }));
const installedIds = computed(() => props.installedIds ?? []);
const overviewStatus = computed(() => {
  if (loading.value) return labels.value.loading;
  if (errorMessage.value) return errorMessage.value;
  if (source.value === 'cache') return labels.value.cached;
  return labels.value.online;
});

const filteredItems = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return (catalog.value?.items ?? []).filter((item) => {
    if (typeFilter.value !== 'all' && item.type !== typeFilter.value) return false;
    if (!needle) return true;
    return [item.name, item.author, item.id, ...(item.tags ?? [])].some((value) => value.toLowerCase().includes(needle));
  });
});

async function loadCatalog() {
  loading.value = true;
  errorMessage.value = '';
  const result = await service.fetchCatalog(props.catalogUrl);
  loading.value = false;
  if (!result.ok) {
    errorMessage.value = result.error.message;
    emit('error', result.error.message);
    return;
  }
  source.value = result.source;
  catalog.value = result.value;
  emit('loaded', result.value);
}

async function install(item: ThemeMarketplaceCatalogItem) {
  busyId.value = item.id;
  errorMessage.value = '';
  const result = await service.fetchPackage(item, props.catalogUrl);
  busyId.value = null;
  if (!result.ok) {
    errorMessage.value = result.error.message;
    emit('error', result.error.message);
    return;
  }
  emit('install', { item, package: result.value });
}

function repositoryUrl(): string {
  try {
    const catalog = new URL(props.catalogUrl);
    if (catalog.hostname === 'raw.githubusercontent.com') {
      const [owner, repository] = catalog.pathname.split('/').filter(Boolean);
      if (owner && repository) return `https://github.com/${owner}/${repository}`;
    }
  } catch {
    // 交给外链处理器使用原始地址兜底。
  }
  return props.catalogUrl;
}

async function openRepository(url: string): Promise<void> {
  try {
    await appCommands.openExternalLink(url);
  } catch (error) {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    emit('error', error instanceof Error ? error.message : String(error));
  }
}

function previewUrl(item: ThemeMarketplaceCatalogItem): string {
  if (!item.preview) return '';
  try {
    const previewPath = item.preview.replace(/^\/+/, '');
    return new URL(`../${previewPath}`, props.catalogUrl).toString();
  } catch {
    return '';
  }
}

function handlePreviewError(id: string): void {
  previewErrorIds.value = new Set(previewErrorIds.value).add(id);
}

function previewStyle(item: ThemeMarketplaceCatalogItem): Record<string, string> {
  const source = `${item.id} ${(item.tags ?? []).join(' ')}`.toLowerCase();
  const palette = source.match(/rose|pink/) ? {
    bg: '#211923', panel: '#302431', text: '#f8e9f1', muted: '#c9a9b8', accent: '#f08db4', strong: '#ffb6d1', success: '#94dfb5',
  } : source.match(/amber|orange|sunset/) ? {
    bg: '#231d16', panel: '#34291c', text: '#fff1d4', muted: '#d7b98d', accent: '#f1ae4b', strong: '#ffd18a', success: '#a8df9b',
  } : source.match(/green|forest|mint/) ? {
    bg: '#14231e', panel: '#1e352c', text: '#e4f5eb', muted: '#a6c8b4', accent: '#72d6a0', strong: '#a4f0c2', success: '#b7e58f',
  } : source.match(/violet|purple/) ? {
    bg: '#1d1a2a', panel: '#2b263e', text: '#f0eaff', muted: '#bfb4df', accent: '#b69cff', strong: '#d5c5ff', success: '#9fe3c5',
  } : source.match(/light|paper|solarized/) ? {
    bg: '#f2f5f1', panel: '#ffffff', text: '#24332d', muted: '#6b7e75', accent: '#31956b', strong: '#207451', success: '#388b61',
  } : {
    bg: '#15232d', panel: '#213543', text: '#e6f2f5', muted: '#9ab4bd', accent: '#64c7e5', strong: '#9be5f6', success: '#8bd7a7',
  };

  return {
    '--preview-bg': palette.bg,
    '--preview-panel': palette.panel,
    '--preview-text': palette.text,
    '--preview-muted': palette.muted,
    '--preview-accent': palette.accent,
    '--preview-accent-strong': palette.strong,
    '--preview-success': palette.success,
  };
}

onMounted(() => {
  if (props.autoLoad) void loadCatalog();
});

defineExpose({ loadCatalog });
</script>

<style scoped>
.theme-marketplace { display: grid; gap: 12px; }
.theme-marketplace-header, .theme-marketplace-card-title-row, .theme-marketplace-status, .theme-marketplace-actions { display: flex; align-items: center; }
.theme-marketplace-header { justify-content: space-between; gap: 12px; }
.theme-marketplace-header-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.theme-marketplace-title { margin: 0; color: var(--text-primary); font-size: var(--font-size-ui-lg, 15px); }
.theme-marketplace-subtitle, .theme-marketplace-meta { margin: 3px 0 0; color: var(--text-secondary); font-size: var(--font-size-ui-sm, 12px); }
.theme-marketplace-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) 120px; gap: 8px; }
.theme-marketplace-search, .theme-marketplace-filter { min-width: 0; padding: 8px 10px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--panel-base); color: var(--text-primary); }
.theme-marketplace-status { justify-content: space-between; gap: 8px; color: var(--text-secondary); font-size: var(--font-size-ui-sm, 12px); }
.theme-marketplace-status.error { color: var(--state-danger); }
.theme-marketplace-source { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: none; color: var(--accent-brand); cursor: pointer; font: inherit; }
.theme-marketplace-source:hover, .theme-marketplace-source:focus-visible { text-decoration: underline; }
.theme-marketplace-overview { display: grid; gap: 0; border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); }
.theme-marketplace-overview-row { display: grid; grid-template-columns: minmax(110px, 32%) minmax(0, 1fr); gap: 12px; align-items: center; min-height: 52px; padding: 8px 0; border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent); }
.theme-marketplace-overview-row:last-child { border-bottom: 0; }
.theme-marketplace-overview-row span { color: var(--text-secondary); font-size: var(--font-size-ui-md, 13px); }
.theme-marketplace-overview-row strong { color: var(--text-primary); font-size: var(--font-size-ui-lg, 15px); }
.theme-marketplace-overview-row strong.danger { color: var(--state-danger); }
.theme-marketplace-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
.theme-marketplace-card { display: grid; gap: 12px; padding: 12px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--panel-raised); }
.theme-marketplace-preview { position: relative; overflow: hidden; aspect-ratio: 16 / 9; min-height: 104px; border: 1px solid color-mix(in srgb, var(--preview-accent, var(--accent-brand)) 35%, transparent); border-radius: var(--radius-sm); background: var(--preview-bg, var(--panel-base)); color: var(--preview-text, var(--text-primary)); }
.theme-marketplace-preview-image { display: block; width: 100%; height: 100%; object-fit: cover; }
.theme-preview-fallback { display: grid; grid-template-rows: 22px minmax(0, 1fr) 17px; height: 100%; overflow: hidden; background: var(--preview-bg); color: var(--preview-text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 8px; line-height: 1.45; }
.theme-preview-toolbar, .theme-preview-statusbar { display: flex; align-items: center; gap: 7px; padding: 0 8px; background: var(--preview-panel); color: var(--preview-muted); }
.theme-preview-toolbar { border-bottom: 1px solid color-mix(in srgb, var(--preview-muted) 18%, transparent); }
.theme-preview-statusbar { justify-content: space-between; border-top: 1px solid color-mix(in srgb, var(--preview-muted) 18%, transparent); font-size: 7px; }
.theme-preview-dots { display: inline-flex; gap: 3px; }
.theme-preview-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--preview-accent); opacity: .8; }
.theme-preview-tab { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--preview-text); }
.theme-preview-state { margin-left: auto; color: var(--preview-success); font-size: 9px; }
.theme-preview-content { display: grid; grid-template-columns: 24px minmax(0, 1fr); min-height: 0; }
.theme-preview-sidebar { display: grid; align-content: start; gap: 6px; padding: 9px 7px; background: color-mix(in srgb, var(--preview-panel) 82%, var(--preview-bg)); }
.theme-preview-sidebar i { display: block; width: 9px; height: 3px; border-radius: 2px; background: var(--preview-muted); opacity: .55; }
.theme-preview-sidebar i:first-child { width: 11px; background: var(--preview-accent); opacity: 1; }
.theme-preview-editor { display: grid; align-content: center; gap: 3px; min-width: 0; padding: 8px 9px; background: var(--preview-bg); }
.theme-preview-line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--preview-text); }
.theme-preview-line b { display: inline-block; width: 17px; margin-right: 4px; color: var(--preview-muted); font-weight: 400; text-align: right; }
.syntax-muted { color: var(--preview-muted); }
.syntax-accent { color: var(--preview-accent); }
.syntax-strong { color: var(--preview-accent-strong); }
.syntax-success { color: var(--preview-success); }
.theme-marketplace-card-title-row { justify-content: space-between; gap: 8px; }
.theme-marketplace-card h5 { margin: 0; color: var(--text-primary); font-size: 14px; }
.theme-marketplace-type, .theme-marketplace-tags span { border: 1px solid var(--border-subtle); border-radius: 999px; color: var(--text-secondary); font-size: var(--font-size-ui-xs, 11px); padding: 2px 7px; }
.theme-marketplace-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.theme-marketplace-actions { flex-wrap: wrap; gap: 7px; }
.theme-marketplace-button { border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--panel-base); color: var(--text-primary); cursor: pointer; padding: 6px 9px; }
.theme-marketplace-button.primary { border-color: var(--accent-brand); background: var(--accent-brand); color: #fff; }
.theme-marketplace-button:disabled { cursor: not-allowed; opacity: .55; }
.theme-marketplace-button-icon { display: inline-block; margin-right: 5px; font-size: 15px; line-height: 1; }
.theme-marketplace-icon-button { display: inline-grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--panel-base); color: var(--accent-brand); cursor: pointer; font-size: 18px; }
.theme-marketplace-icon-button:hover, .theme-marketplace-icon-button:focus-visible { border-color: var(--accent-brand); background: color-mix(in srgb, var(--accent-brand) 12%, var(--panel-base)); }
.theme-marketplace-empty { padding: 24px 8px; text-align: center; color: var(--text-secondary); }
@media (max-width: 560px) { .theme-marketplace-toolbar { grid-template-columns: 1fr; } }
</style>
