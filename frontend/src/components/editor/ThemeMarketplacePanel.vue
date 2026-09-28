<template>
  <section class="theme-marketplace" data-testid="theme-marketplace-panel">
    <div class="theme-marketplace-header">
      <div>
        <h4 class="theme-marketplace-title">{{ labels.title }}</h4>
        <p class="theme-marketplace-subtitle">{{ labels.subtitle }}</p>
      </div>
      <button
        class="theme-marketplace-refresh"
        type="button"
        :disabled="loading"
        :title="labels.refresh"
        @click="loadCatalog"
      >
        ↻
      </button>
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
      <a class="theme-marketplace-source" :href="catalogUrl" target="_blank" rel="noreferrer">{{ labels.source }}</a>
    </div>

    <div v-if="!loading && filteredItems.length === 0" class="theme-marketplace-empty">
      {{ query ? labels.noMatch : labels.empty }}
    </div>

    <div v-else class="theme-marketplace-grid">
      <article v-for="item in filteredItems" :key="`${item.type}-${item.id}`" class="theme-marketplace-card">
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
          <a
            class="theme-marketplace-link"
            :href="sourceUrl(item)"
            target="_blank"
            rel="noreferrer"
          >
            {{ labels.viewSource }}
          </a>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
}>();

const defaultLabels = {
  title: '主题市场',
  subtitle: '从 GitHub 浏览、安装和切换社区主题',
  refresh: '刷新主题市场',
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
};

const query = ref('');
const typeFilter = ref<'all' | MarketplacePackageType>('all');
const loading = ref(false);
const errorMessage = ref('');
const source = ref<'network' | 'cache' | null>(null);
const catalog = ref<ThemeMarketplaceCatalog | null>(null);
const busyId = ref<string | null>(null);
const service = new ThemeMarketplaceService();

const labels = computed(() => ({ ...defaultLabels, ...props.labels }));
const installedIds = computed(() => props.installedIds ?? []);

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

function sourceUrl(item: ThemeMarketplaceCatalogItem): string {
  try {
    const packagePath = item.file.replace(/^\/+/, '');
    return new URL(`../${packagePath}`, props.catalogUrl).toString();
  } catch {
    return props.catalogUrl;
  }
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
.theme-marketplace-title { margin: 0; color: var(--text-primary); font-size: 15px; }
.theme-marketplace-subtitle, .theme-marketplace-meta { margin: 3px 0 0; color: var(--text-secondary); font-size: 12px; }
.theme-marketplace-refresh { width: 30px; height: 30px; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--panel-raised); color: var(--text-primary); cursor: pointer; font-size: 18px; }
.theme-marketplace-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) 120px; gap: 8px; }
.theme-marketplace-search, .theme-marketplace-filter { min-width: 0; padding: 8px 10px; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--panel-base); color: var(--text-primary); }
.theme-marketplace-status { justify-content: space-between; gap: 8px; color: var(--text-secondary); font-size: 12px; }
.theme-marketplace-status.error { color: var(--state-danger); }
.theme-marketplace-source, .theme-marketplace-link { color: var(--accent-brand); text-decoration: none; }
.theme-marketplace-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
.theme-marketplace-card { display: grid; gap: 12px; min-height: 132px; padding: 12px; border: 1px solid var(--border-subtle); border-radius: 7px; background: var(--panel-raised); }
.theme-marketplace-card-title-row { justify-content: space-between; gap: 8px; }
.theme-marketplace-card h5 { margin: 0; color: var(--text-primary); font-size: 14px; }
.theme-marketplace-type, .theme-marketplace-tags span { border: 1px solid var(--border-subtle); border-radius: 999px; color: var(--text-secondary); font-size: 11px; padding: 2px 7px; }
.theme-marketplace-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.theme-marketplace-actions { flex-wrap: wrap; gap: 7px; }
.theme-marketplace-button { border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--panel-base); color: var(--text-primary); cursor: pointer; padding: 6px 9px; }
.theme-marketplace-button.primary { border-color: var(--accent-brand); background: var(--accent-brand); color: #fff; }
.theme-marketplace-button:disabled, .theme-marketplace-refresh:disabled { cursor: not-allowed; opacity: .55; }
.theme-marketplace-empty { padding: 24px 8px; text-align: center; color: var(--text-secondary); }
@media (max-width: 560px) { .theme-marketplace-toolbar { grid-template-columns: 1fr; } }
</style>
