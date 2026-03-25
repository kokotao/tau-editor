<template>
  <n-config-provider class="settings-provider" :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
    <div
      class="settings-panel animate__animated animate__fadeIn animate__faster"
      :class="`settings-panel--${mode}`"
      data-testid="settings-panel"
    >
      <div class="settings-header">
        <div class="settings-header-main">
          <h3 class="settings-title">{{ panelTitle }}</h3>
          <p class="settings-subtitle">{{ panelSubtitle }}</p>
        </div>

        <div class="settings-header-actions">
          <button
            v-if="isDrawerMode"
            class="settings-action-btn"
            data-testid="open-full-settings-btn"
            @click="emit('open-workspace')"
          >
            {{ copy.openFullSettings }}
          </button>
          <button class="settings-close" data-testid="settings-close-btn" @click="emit('close')" :title="copy.close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="isWorkspaceMode" class="settings-workspace" data-testid="settings-workspace">
        <aside class="settings-nav" data-testid="settings-nav">
          <button
            v-for="category in categories"
            :key="category.id"
            class="settings-nav-item"
            :class="{ active: activeCategoryValue === category.id }"
            :data-testid="`settings-nav-${category.id}`"
            @click="setActiveCategory(category.id)"
          >
            {{ category.label }}
          </button>
        </aside>

        <section class="settings-detail">
          <div class="settings-overview">
            <div class="settings-overview-item">
              <span>{{ copy.currentVersion }}</span>
              <strong data-testid="settings-current-version">{{ currentVersionLabel }}</strong>
            </div>
            <div class="settings-overview-item">
              <span>{{ copy.latestVersion }}</span>
              <strong>{{ latestVersionLabel }}</strong>
            </div>
            <div class="settings-overview-item">
              <span>{{ copy.deviceInfo }}</span>
              <strong>{{ deviceLabel }}</strong>
            </div>
          </div>

          <div
            v-if="activeCategoryValue === 'general'"
            class="settings-section animate__animated animate__fadeInUp animate__faster"
            data-testid="settings-general-section"
          >
            <h4 class="settings-section-title">{{ copy.appearance }}</h4>

            <div class="settings-item">
              <label class="settings-label">{{ copy.language }}</label>
              <n-select
                class="settings-nselect"
                data-testid="select-ui-language"
                :value="settingsStore.uiLanguage"
                :options="uiLanguageOptions"
                :consistent-menu-width="false"
                @update:value="setUiLanguage"
              />
            </div>

            <div class="settings-item">
              <label class="settings-label">{{ copy.themeMode }}</label>
              <div class="theme-selector">
                <button class="theme-btn" :class="{ active: settingsStore.theme === 'light' }" @click="setTheme('light')">{{ copy.themeLight }}</button>
                <button class="theme-btn" :class="{ active: settingsStore.theme === 'dark' }" @click="setTheme('dark')">{{ copy.themeDark }}</button>
                <button class="theme-btn" :class="{ active: settingsStore.theme === 'system' }" @click="setTheme('system')">{{ copy.themeSystem }}</button>
              </div>
            </div>

            <div class="settings-item">
              <label class="settings-label">{{ copy.themeStyle }}</label>
              <n-select
                class="settings-nselect"
                data-testid="select-theme-skin"
                :value="settingsStore.themeSkin"
                :options="themeSkinOptions"
                :consistent-menu-width="false"
                @update:value="setThemeSkin"
              />
            </div>

            <div class="settings-item">
              <label class="settings-label">{{ copy.editorTheme }}</label>
              <n-select
                class="settings-nselect"
                data-testid="select-monaco-theme"
                :value="settingsStore.monacoTheme"
                :options="monacoThemeOptions"
                :consistent-menu-width="false"
                @update:value="setMonacoTheme"
              />
            </div>

            <div class="settings-item custom-theme-settings animate__animated animate__fadeInUp animate__fast">
              <label class="settings-label">{{ copy.customTheme }}</label>
              <p class="custom-theme-desc">{{ copy.customThemeDesc }}</p>

              <div class="custom-theme-grid">
                <div
                  v-for="(field, index) in customThemeColorFields"
                  :key="field.key"
                  class="custom-theme-item animate__animated animate__fadeInUp animate__faster"
                  :style="{ '--animate-delay': `${index * 36}ms` }"
                >
                  <span>{{ field.label }}</span>
                  <div class="custom-theme-control">
                    <input
                      class="custom-color-input"
                      :data-testid="`custom-color-${field.key}`"
                      type="color"
                      :value="getCustomThemeColorValue(field.key)"
                      @input="setCustomThemeColor(field.key, ($event.target as HTMLInputElement).value)"
                    />
                    <code>{{ getCustomThemeColorValue(field.key) }}</code>
                  </div>
                </div>
              </div>

              <div class="custom-theme-actions">
                <button class="settings-action-btn" data-testid="export-custom-theme-btn" @click="handleExportCustomTheme">
                  {{ copy.customThemeExport }}
                </button>
                <button class="settings-action-btn" data-testid="import-custom-theme-btn" @click="handleImportCustomTheme">
                  {{ copy.customThemeImport }}
                </button>
                <button class="settings-action-btn" data-testid="reset-custom-theme-btn" @click="handleResetCustomTheme">
                  {{ copy.customThemeReset }}
                </button>
              </div>

              <textarea
                v-model="customThemeImportText"
                class="custom-theme-import"
                data-testid="custom-theme-import-textarea"
                :placeholder="copy.customThemeImportPlaceholder"
              />
              <p v-if="customThemeStatusText" class="custom-theme-status">{{ customThemeStatusText }}</p>
            </div>
          </div>

          <div
            v-if="activeCategoryValue === 'editor'"
            class="settings-section animate__animated animate__fadeInUp animate__faster"
            data-testid="settings-editor-section"
          >
            <h4 class="settings-section-title">{{ copy.editor }}</h4>

            <div class="settings-item">
              <label class="settings-label">{{ copy.fontSize }}</label>
              <div class="font-size-control">
                <button class="font-size-btn" data-testid="decrease-font-btn" @click="decreaseFontSize">-</button>
                <span class="font-size-value">{{ settingsStore.fontSize }}px</span>
                <button class="font-size-btn" data-testid="increase-font-btn" @click="increaseFontSize">+</button>
                <button class="font-size-reset" @click="resetFontSize">{{ copy.reset }}</button>
              </div>
            </div>

            <div class="settings-item">
              <label class="settings-label">{{ copy.fontFamily }}</label>
              <n-select
                class="settings-nselect"
                data-testid="select-font-family"
                :value="settingsStore.fontFamily"
                :options="fontFamilyOptions"
                :consistent-menu-width="false"
                @update:value="setFontFamily"
              />
            </div>

            <div class="settings-item">
              <label class="settings-label">{{ copy.preview }}</label>
              <div class="font-preview" :style="{ fontSize: `${settingsStore.fontSize}px`, fontFamily: settingsStore.fontFamily }">
                {{ copy.fontPreviewLine1 }}
                <br>
                {{ copy.fontPreviewLine2 }}
              </div>
            </div>

            <div class="settings-item">
              <label class="settings-label">{{ copy.autoSave }}</label>
              <label class="settings-checkbox">
                <input data-testid="toggle-auto-save" type="checkbox" :checked="settingsStore.autoSaveEnabled" @change="setAutoSave($event)" />
                <span class="checkbox-text">{{ copy.autoSaveEnabled }}</span>
              </label>
            </div>

            <div class="settings-item" v-if="settingsStore.autoSaveEnabled">
              <label class="settings-label">{{ copy.autoSaveInterval }}</label>
              <n-select
                class="settings-nselect"
                data-testid="select-auto-save-interval"
                :value="settingsStore.autoSaveInterval"
                :options="autoSaveIntervalOptions"
                :consistent-menu-width="false"
                @update:value="setAutoSaveInterval"
              />
            </div>

            <div class="settings-item">
              <label class="settings-label">{{ copy.maxOpenTabs }}</label>
              <n-select
                class="settings-nselect"
                data-testid="select-max-open-tabs"
                :value="settingsStore.maxOpenTabs"
                :options="maxOpenTabsOptions"
                :consistent-menu-width="false"
                @update:value="setMaxOpenTabs"
              />
              <p class="settings-item-hint">{{ copy.maxOpenTabsHint }}</p>
            </div>

            <div class="settings-item">
              <label class="settings-label">{{ copy.memoryLimitMB }}</label>
              <n-select
                class="settings-nselect"
                data-testid="select-memory-limit"
                :value="settingsStore.memoryLimitMB"
                :options="memoryLimitOptions"
                :consistent-menu-width="false"
                @update:value="setMemoryLimitMB"
              />
              <p class="settings-item-hint">{{ copy.memoryLimitHint }}</p>
            </div>

            <div class="settings-item">
              <label class="settings-label">{{ copy.indent }}</label>
              <n-select
                class="settings-nselect"
                data-testid="select-tab-size"
                :value="settingsStore.tabSize"
                :options="tabSizeOptions"
                :consistent-menu-width="false"
                @update:value="setTabSize"
              />
            </div>

            <div class="settings-item">
              <label class="settings-label">{{ copy.minimap }}</label>
              <label class="settings-checkbox">
                <input data-testid="toggle-minimap" type="checkbox" :checked="settingsStore.minimap" @change="setMinimap($event)" />
                <span class="checkbox-text">{{ copy.minimapEnabled }}</span>
              </label>
            </div>

            <div class="settings-item">
              <label class="settings-label">{{ copy.wordWrap }}</label>
              <label class="settings-checkbox">
                <input data-testid="toggle-word-wrap" type="checkbox" :checked="settingsStore.wordWrap" @change="setWordWrap($event)" />
                <span class="checkbox-text">{{ copy.wordWrapEnabled }}</span>
              </label>
            </div>
          </div>

          <div
            v-if="activeCategoryValue === 'updates'"
            class="settings-section settings-section-update animate__animated animate__fadeInUp animate__faster"
            data-testid="settings-update-section"
          >
            <h4 class="settings-section-title">{{ copy.softwareUpdate }}</h4>

            <div class="settings-update-grid">
              <div class="settings-update-item">
                <span>{{ copy.currentVersion }}</span>
                <strong>{{ currentVersionLabel }}</strong>
              </div>
              <div class="settings-update-item">
                <span>{{ copy.latestVersion }}</span>
                <strong>{{ latestVersionLabel }}</strong>
              </div>
              <div class="settings-update-item">
                <span>{{ copy.deviceInfo }}</span>
                <strong>{{ deviceLabel }}</strong>
              </div>
              <div class="settings-update-item" v-if="releaseDateLabel">
                <span>{{ copy.releaseDate }}</span>
                <strong>{{ releaseDateLabel }}</strong>
              </div>
              <div class="settings-update-item settings-update-item-wide" v-if="selectedAsset">
                <span>{{ copy.packageName }}</span>
                <strong>{{ selectedAsset.name }}</strong>
              </div>
            </div>

            <p class="settings-update-status">{{ updateStatusText }}</p>
            <p class="settings-update-message" v-if="installMessage">{{ installMessage }}</p>
            <p class="settings-update-notes" v-if="releaseNotesPreview">
              <span>{{ copy.releaseNotes }}</span>
              <span>{{ releaseNotesPreview }}</span>
            </p>

            <div class="settings-update-actions">
              <button
                class="settings-update-btn"
                data-testid="check-updates-btn"
                @click="checkForUpdate(false)"
                :disabled="isCheckingUpdate || isInstallingUpdate"
              >
                {{ isCheckingUpdate ? copy.checkingForUpdates : copy.checkForUpdates }}
              </button>
              <button
                class="settings-update-btn settings-update-btn-primary"
                data-testid="install-update-btn"
                @click="installUpdate"
                :disabled="!canInstallUpdate"
              >
                {{ isInstallingUpdate ? copy.installingUpdate : copy.installUpdate }}
              </button>
              <button
                class="settings-update-btn settings-update-btn-link"
                data-testid="open-release-btn"
                @click="handleOpenReleasePage"
              >
                {{ copy.openReleasePage }}
              </button>
            </div>
          </div>

          <div
            v-if="activeCategoryValue === 'about'"
            class="settings-section animate__animated animate__fadeInUp animate__faster"
            data-testid="settings-author-section"
          >
            <h4 class="settings-section-title">{{ authorCopy.modalTitle }}</h4>
            <div class="settings-author-inline">
              <p>{{ authorCopy.nameLabel }}albert_luo</p>
              <p>{{ authorCopy.emailLabel }}480199976@qq.com</p>
              <p>
                {{ authorCopy.githubLabel }}
                <a
                  class="settings-author-link"
                  :href="projectHomepageUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  @click.prevent="handleOpenProjectHomepage"
                >
                  {{ projectHomepageUrl }}
                </a>
              </p>
              <p>{{ authorCopy.qqGroupLabel }}1091775563</p>
              <section class="settings-author-donation">
                <h5>{{ authorCopy.donationTitle }}</h5>
                <p class="settings-author-donation-desc">{{ authorCopy.donationDesc }}</p>
                <div class="settings-author-qr-grid">
                  <figure class="settings-author-qr-card">
                    <img :src="wechatDonateQr" :alt="authorCopy.wechatLabel" loading="lazy" />
                    <figcaption>{{ authorCopy.wechatLabel }}</figcaption>
                  </figure>
                  <figure class="settings-author-qr-card">
                    <img :src="alipayDonateQr" :alt="authorCopy.alipayLabel" loading="lazy" />
                    <figcaption>{{ authorCopy.alipayLabel }}</figcaption>
                  </figure>
                </div>
                <p class="settings-author-donation-tip">{{ authorCopy.donationTip }}</p>
              </section>
            </div>
          </div>
        </section>
      </div>

      <div
        v-else
        class="settings-drawer-content animate__animated animate__fadeInUp animate__faster"
        data-testid="settings-quick-drawer"
      >
        <p class="settings-drawer-tip">{{ copy.quickSettingsDesc }}</p>

        <div class="settings-section">
          <div class="settings-item">
            <label class="settings-label">{{ copy.language }}</label>
            <n-select
              class="settings-nselect"
              data-testid="drawer-select-ui-language"
              :value="settingsStore.uiLanguage"
              :options="uiLanguageOptions"
              :consistent-menu-width="false"
              @update:value="setUiLanguage"
            />
          </div>

          <div class="settings-item">
            <label class="settings-label">{{ copy.themeMode }}</label>
            <div class="theme-selector">
              <button class="theme-btn" :class="{ active: settingsStore.theme === 'light' }" @click="setTheme('light')">{{ copy.themeLight }}</button>
              <button class="theme-btn" :class="{ active: settingsStore.theme === 'dark' }" @click="setTheme('dark')">{{ copy.themeDark }}</button>
              <button class="theme-btn" :class="{ active: settingsStore.theme === 'system' }" @click="setTheme('system')">{{ copy.themeSystem }}</button>
            </div>
          </div>

          <div class="settings-item">
            <label class="settings-label">{{ copy.themeStyle }}</label>
            <n-select
              class="settings-nselect"
              data-testid="drawer-select-theme-skin"
              :value="settingsStore.themeSkin"
              :options="themeSkinOptions"
              :consistent-menu-width="false"
              @update:value="setThemeSkin"
            />
          </div>

          <div class="settings-item">
            <label class="settings-label">{{ copy.fontSize }}</label>
            <div class="font-size-control">
              <button class="font-size-btn" data-testid="drawer-decrease-font-btn" @click="decreaseFontSize">-</button>
              <span class="font-size-value">{{ settingsStore.fontSize }}px</span>
              <button class="font-size-btn" data-testid="drawer-increase-font-btn" @click="increaseFontSize">+</button>
            </div>
          </div>

          <div class="settings-item">
            <label class="settings-label">{{ copy.autoSave }}</label>
            <label class="settings-checkbox">
              <input
                data-testid="drawer-toggle-auto-save"
                type="checkbox"
                :checked="settingsStore.autoSaveEnabled"
                @change="setAutoSave($event)"
              />
              <span class="checkbox-text">{{ copy.autoSaveEnabled }}</span>
            </label>
          </div>

          <button class="settings-action-btn settings-action-btn-block" @click="emit('open-workspace')">
            {{ copy.openFullSettings }}
          </button>
        </div>
      </div>
    </div>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { darkTheme, NConfigProvider, NSelect, type GlobalThemeOverrides, type SelectOption } from 'naive-ui';
import {
  CUSTOM_THEME_COLOR_FALLBACKS,
  type CustomThemeColorKey,
  useSettingsStore,
} from '@/stores/settings';
import {
  appCommands,
  settingsCommands,
  type AppVersionInfo,
  type GithubUpdateInfo,
  type ReleaseAssetInfo,
} from '@/lib/tauri';
import type { ThemeSkinId } from '@/utils/themeResolver';
import { getAuthorInfoI18n, getSettingsPanelI18n, type MonacoThemeValue, type UiLanguage } from '@/i18n/ui';
import wechatDonateQr from '@/assets/donation/WeChatPay.jpg';
import alipayDonateQr from '@/assets/donation/AliPay.jpg';

export type SettingsCategory = 'general' | 'editor' | 'updates' | 'about';
type SettingsMode = 'workspace' | 'drawer';
type UpdateStatus = 'idle' | 'checking' | 'upToDate' | 'available' | 'installing' | 'installTriggered' | 'error';

const props = withDefaults(defineProps<{
  mode?: SettingsMode;
  activeCategory?: SettingsCategory;
}>(), {
  mode: 'workspace',
  activeCategory: 'general',
});

const emit = defineEmits<{
  close: [];
  'open-workspace': [];
  'update:activeCategory': [category: SettingsCategory];
}>();

const settingsStore = useSettingsStore();
const copy = computed(() => getSettingsPanelI18n(settingsStore.uiLanguage));
const authorCopy = computed(() => getAuthorInfoI18n(settingsStore.uiLanguage));
const projectHomepageUrl = 'https://github.com/kokotao/tau-editor';
const naiveTheme = computed(() => (settingsStore.resolvedTheme === 'dark' ? darkTheme : null));
const isWorkspaceMode = computed(() => props.mode === 'workspace');
const isDrawerMode = computed(() => props.mode === 'drawer');

const appVersionInfo = ref<AppVersionInfo | null>(null);
const updateInfo = ref<GithubUpdateInfo | null>(null);
const updateStatus = ref<UpdateStatus>('idle');
const updateError = ref('');
const installMessage = ref('');
const isCheckingUpdate = ref(false);
const isInstallingUpdate = ref(false);

const categories = computed<Array<{ id: SettingsCategory; label: string }>>(() => [
  { id: 'general', label: copy.value.settingsGeneral },
  { id: 'editor', label: copy.value.settingsEditor },
  { id: 'updates', label: copy.value.settingsUpdates },
  { id: 'about', label: copy.value.settingsAbout },
]);

const panelTitle = computed(() => (isWorkspaceMode.value ? copy.value.title : copy.value.quickSettingsTitle));
const panelSubtitle = computed(() => (isWorkspaceMode.value ? copy.value.title : copy.value.quickSettingsDesc));
const activeCategoryValue = computed<SettingsCategory>(() => props.activeCategory || 'general');
const selectedAsset = computed<ReleaseAssetInfo | null>(() => updateInfo.value?.selectedAsset ?? null);
const customThemeImportText = ref('');
const customThemeStatusText = ref('');

const naiveThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#38bdf8',
    primaryColorHover: '#7dd3fc',
    primaryColorPressed: '#0ea5e9',
    borderRadius: '14px',
  },
  Select: {
    peers: {
      InternalSelection: {
        color: 'rgba(255, 255, 255, 0.04)',
        colorActive: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        borderActive: '1px solid rgba(56, 189, 248, 0.9)',
        borderFocus: '1px solid rgba(56, 189, 248, 0.9)',
        boxShadowFocus: '0 0 0 3px rgba(56, 189, 248, 0.2)',
      },
      InternalSelectMenu: {
        color: '#111a2f',
      },
    },
  },
};

const uiLanguageOptions = computed<SelectOption[]>(() => [
  { label: copy.value.languageZh, value: 'zh-CN' },
  { label: copy.value.languageEn, value: 'en-US' },
]);

const monacoThemeOptions = computed<SelectOption[]>(() =>
  settingsStore.monacoThemeOptions.map((option) => ({
    label: `${option.label}${option.recommended ? ` (${copy.value.recommended})` : ''}`,
    value: option.value,
  })),
);
const themeSkinOptions = computed<SelectOption[]>(() =>
  settingsStore.themeSkinOptions.map((option) => ({
    label: option.label,
    value: option.value,
  })),
);
const customThemeColorFields = computed<Array<{ key: CustomThemeColorKey; label: string }>>(() => [
  { key: 'bgApp', label: copy.value.customColorBgApp },
  { key: 'panelBase', label: copy.value.customColorPanelBase },
  { key: 'textPrimary', label: copy.value.customColorTextPrimary },
  { key: 'textSecondary', label: copy.value.customColorTextSecondary },
  { key: 'accentBrand', label: copy.value.customColorAccentBrand },
  { key: 'accentBrandStrong', label: copy.value.customColorAccentBrandStrong },
  { key: 'stateSuccess', label: copy.value.customColorSuccess },
  { key: 'stateDanger', label: copy.value.customColorDanger },
]);

const fontFamilyOptions = computed<SelectOption[]>(() => [
  { label: 'JetBrains Mono Variable', value: "'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace" },
  { label: 'Fira Code', value: "'Fira Code', 'JetBrains Mono', monospace" },
  { label: 'Maple Mono', value: "'Maple Mono', 'JetBrains Mono', monospace" },
  { label: 'Cascadia Code', value: "'Cascadia Code', 'Consolas', monospace" },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', 'SF Mono', monospace" },
  { label: 'Monaspace Neon', value: "'Monaspace Neon', 'Monaco', monospace" },
  { label: 'SF Mono / Menlo', value: "'SF Mono', 'Menlo', 'Monaco', monospace" },
  { label: 'Source Code Pro', value: "'Source Code Pro', monospace" },
  { label: 'Consolas', value: "'Consolas', monospace" },
  { label: copy.value.systemMonospace, value: 'monospace' },
]);

const autoSaveIntervalOptions = computed<SelectOption[]>(() => [
  { label: copy.value.seconds10, value: 10 },
  { label: copy.value.seconds30, value: 30 },
  { label: copy.value.minute1, value: 60 },
  { label: copy.value.minutes5, value: 300 },
]);
const maxOpenTabsOptions = computed<SelectOption[]>(() => [
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '30', value: 30 },
  { label: '40', value: 40 },
  { label: '60', value: 60 },
  { label: '80', value: 80 },
  { label: '100', value: 100 },
]);
const memoryLimitOptions = computed<SelectOption[]>(() => [
  { label: '128 MB', value: 128 },
  { label: '192 MB', value: 192 },
  { label: '256 MB', value: 256 },
  { label: '384 MB', value: 384 },
  { label: '512 MB', value: 512 },
  { label: '768 MB', value: 768 },
  { label: '1024 MB', value: 1024 },
]);

const tabSizeOptions = computed<SelectOption[]>(() => [
  { label: copy.value.spaces2, value: 2 },
  { label: copy.value.spaces4, value: 4 },
  { label: copy.value.spaces8, value: 8 },
]);

const currentVersionLabel = computed(() => appVersionInfo.value?.version || '--');

const latestVersionLabel = computed(() => {
  if (!updateInfo.value) {
    return '--';
  }
  return updateInfo.value.latestVersion;
});

const deviceLabel = computed(() => {
  const os = updateInfo.value?.device.os || appVersionInfo.value?.os || 'unknown';
  const arch = updateInfo.value?.device.arch || appVersionInfo.value?.arch || 'unknown';
  return `${resolveOsLabel(os)} / ${arch}`;
});

const releaseDateLabel = computed(() => {
  const publishedAt = updateInfo.value?.publishedAt;
  if (!publishedAt) {
    return '';
  }

  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) {
    return publishedAt;
  }

  return date.toLocaleString();
});

const releaseNotesPreview = computed(() => {
  const content = (updateInfo.value?.releaseNotes || '').replace(/\s+/g, ' ').trim();
  if (!content) {
    return '';
  }
  return content.length > 180 ? `${content.slice(0, 180)}...` : content;
});

const canInstallUpdate = computed(() => {
  return Boolean(updateInfo.value?.hasUpdate && selectedAsset.value && !isInstallingUpdate.value && !isCheckingUpdate.value);
});

const updateStatusText = computed(() => {
  switch (updateStatus.value) {
    case 'checking':
      return copy.value.statusChecking;
    case 'upToDate':
      return copy.value.statusUpToDate;
    case 'available':
      return selectedAsset.value
        ? copy.value.statusUpdateAvailable(updateInfo.value?.latestVersion || '--')
        : copy.value.statusNoMatchedAsset;
    case 'installing':
      return copy.value.statusInstalling;
    case 'installTriggered':
      return installMessage.value || copy.value.statusInstallTriggered;
    case 'error':
      return `${copy.value.statusErrorPrefix}：${updateError.value || 'unknown'}`;
    default:
      return copy.value.statusIdle;
  }
});

const setActiveCategory = (category: SettingsCategory) => {
  emit('update:activeCategory', category);
};

const setTheme = (theme: 'light' | 'dark' | 'system') => {
  settingsStore.updateSettings({ theme });
};

const setThemeSkin = (value: string | number | null) => {
  if (typeof value !== 'string') return;
  settingsStore.updateSettings({ themeSkin: value as ThemeSkinId });
};

const getCustomThemeColorValue = (key: CustomThemeColorKey): string =>
  settingsStore.customThemeColors[key] ?? CUSTOM_THEME_COLOR_FALLBACKS[key];

const setCustomThemeColor = (key: CustomThemeColorKey, value: string) => {
  settingsStore.setCustomThemeColor(key, value);
  customThemeStatusText.value = '';
};

const handleResetCustomTheme = () => {
  settingsStore.resetCustomThemeColors();
  customThemeStatusText.value = '';
};

const handleExportCustomTheme = async () => {
  const payload = settingsStore.exportCustomThemeColors();
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload);
    customThemeStatusText.value = copy.value.customThemeExported;
    return;
  }
  customThemeImportText.value = payload;
  customThemeStatusText.value = copy.value.customThemeExported;
};

const handleImportCustomTheme = () => {
  const result = settingsStore.importCustomThemeColors(customThemeImportText.value);
  customThemeStatusText.value = result.success
    ? copy.value.customThemeImported(result.applied)
    : `${copy.value.customThemeImportFailed} (${result.message})`;
};

const setUiLanguage = (value: string | number | null) => {
  if (typeof value !== 'string') return;
  settingsStore.updateSettings({ uiLanguage: value as UiLanguage });
};

const setMonacoTheme = (value: string | number | null) => {
  if (typeof value !== 'string') return;
  settingsStore.updateSettings({ monacoTheme: value as MonacoThemeValue });
};

const increaseFontSize = () => {
  settingsStore.adjustFontSize(1);
};

const decreaseFontSize = () => {
  settingsStore.adjustFontSize(-1);
};

const resetFontSize = () => {
  settingsStore.resetFontSize();
};

const setFontFamily = (value: string | number | null) => {
  if (typeof value !== 'string') return;
  settingsStore.updateSettings({ fontFamily: value });
};

const setAutoSave = (event: Event) => {
  settingsStore.updateSettings({ autoSaveEnabled: (event.target as HTMLInputElement).checked });
};

const setAutoSaveInterval = (value: string | number | null) => {
  if (value === null) return;
  settingsStore.updateSettings({ autoSaveInterval: Number(value) });
};

const setTabSize = (value: string | number | null) => {
  if (value === null) return;
  settingsStore.updateSettings({ tabSize: Number(value) });
};

const setMaxOpenTabs = (value: string | number | null) => {
  if (value === null) return;
  settingsStore.updateSettings({ maxOpenTabs: Number(value) });
};

const setMemoryLimitMB = (value: string | number | null) => {
  if (value === null) return;
  settingsStore.updateSettings({ memoryLimitMB: Number(value) });
};

const setMinimap = (event: Event) => {
  settingsStore.updateSettings({ minimap: (event.target as HTMLInputElement).checked });
};

const setWordWrap = (event: Event) => {
  settingsStore.updateSettings({ wordWrap: (event.target as HTMLInputElement).checked });
};

const loadVersionInfo = async () => {
  try {
    appVersionInfo.value = await settingsCommands.getAppVersionInfo();
  } catch (error) {
    console.warn('[Settings] 读取版本信息失败：', error);
  }
};

const checkForUpdate = async (silent: boolean) => {
  if (isCheckingUpdate.value) {
    return;
  }

  isCheckingUpdate.value = true;
  updateError.value = '';
  installMessage.value = '';
  updateStatus.value = 'checking';

  try {
    const result = await settingsCommands.checkGithubUpdate(projectHomepageUrl);
    if (!result || typeof result.hasUpdate !== 'boolean') {
      throw new Error('Invalid update response');
    }
    updateInfo.value = result;

    if (result.hasUpdate) {
      updateStatus.value = 'available';
    } else {
      updateStatus.value = 'upToDate';
    }
  } catch (error) {
    updateStatus.value = 'error';
    updateError.value = error instanceof Error ? error.message : String(error);
    if (silent) {
      console.warn('[Settings] 自动检查更新失败：', updateError.value);
    }
  } finally {
    isCheckingUpdate.value = false;
  }
};

const installUpdate = async () => {
  if (!selectedAsset.value || isInstallingUpdate.value) {
    return;
  }

  isInstallingUpdate.value = true;
  updateError.value = '';
  installMessage.value = '';
  updateStatus.value = 'installing';

  try {
    const result = await settingsCommands.downloadAndInstallUpdate(
      selectedAsset.value.browserDownloadUrl,
      selectedAsset.value.name,
    );
    installMessage.value = result.message || copy.value.statusInstallTriggered;
    updateStatus.value = 'installTriggered';
  } catch (error) {
    updateStatus.value = 'error';
    updateError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isInstallingUpdate.value = false;
  }
};

const handleOpenProjectHomepage = async () => {
  await appCommands.openProjectHomepage();
};

const handleOpenReleasePage = async () => {
  const releaseUrl = updateInfo.value?.releaseUrl || projectHomepageUrl;
  await appCommands.openExternalLink(releaseUrl);
};

const resolveOsLabel = (os: string): string => {
  if (os === 'windows') return 'Windows';
  if (os === 'macos') return 'macOS';
  if (os === 'linux') return 'Linux';
  return os;
};

onMounted(async () => {
  await loadVersionInfo();
  if (isWorkspaceMode.value) {
    await checkForUpdate(true);
  }
});
</script>

<style scoped>
.settings-provider {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.settings-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  --animate-duration: 320ms;
  background:
    radial-gradient(120% 120% at 10% -10%, rgba(56, 189, 248, 0.16), transparent 45%),
    radial-gradient(90% 90% at 90% 0%, rgba(14, 165, 233, 0.12), transparent 46%),
    var(--panel, #101726);
  transition: background-color 260ms ease, color 260ms ease;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
}

.settings-header-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.settings-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
}

.settings-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
}

.settings-close:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--border-soft, rgba(148, 163, 184, 0.18));
}

.settings-action-btn {
  height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.4);
  color: var(--text-primary, #f8fafc);
  cursor: pointer;
}

.settings-action-btn-block {
  width: 100%;
  margin-top: 4px;
}

.settings-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 14px;
  border-right: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.2);
}

.settings-nav-item {
  height: 38px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  text-align: left;
  padding: 0 12px;
  cursor: pointer;
  transition: transform 180ms ease, background-color 220ms ease, border-color 220ms ease, color 220ms ease;
}

.settings-nav-item:hover {
  background: rgba(148, 163, 184, 0.08);
  transform: translateY(-1px);
}

.settings-nav-item.active {
  border-color: rgba(56, 189, 248, 0.45);
  background: rgba(14, 165, 233, 0.2);
  color: #e0f2fe;
}

.settings-detail,
.settings-drawer-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px;
}

.settings-drawer-tip {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary, #cbd5e1);
}

.settings-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.settings-overview-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.35);
}

.settings-overview-item span {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
}

.settings-overview-item strong {
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-primary, #f8fafc);
  word-break: break-word;
}

.settings-section {
  margin: 0;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.015));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  --animate-duration: 280ms;
  transition: border-color 240ms ease, box-shadow 240ms ease, transform 220ms ease;
}

.settings-section:hover {
  border-color: rgba(148, 163, 184, 0.3);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 24px rgba(15, 23, 42, 0.16);
  transform: translateY(-1px);
}

.settings-section-title {
  margin: 0 0 14px;
  color: var(--text-muted, #94a3b8);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.settings-item {
  margin-bottom: 16px;
}

.settings-item:last-child {
  margin-bottom: 0;
}

.settings-label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-secondary, #cbd5e1);
  font-size: 13px;
}

.settings-item-hint {
  margin: 8px 0 0;
  color: var(--text-muted, #94a3b8);
  font-size: 12px;
  line-height: 1.45;
}

.font-preview,
.theme-btn,
.font-size-control,
.settings-checkbox,
.settings-update-btn {
  border-radius: 14px;
}

.font-preview {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  line-height: 1.7;
}

.theme-selector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.custom-theme-settings {
  border-top: 1px dashed var(--border-soft, rgba(148, 163, 184, 0.18));
  padding-top: 12px;
}

.custom-theme-desc {
  margin: 0 0 10px;
  color: var(--text-muted, #94a3b8);
  font-size: 12px;
  line-height: 1.5;
}

.custom-theme-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.custom-theme-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  border-radius: 10px;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  --animate-duration: 260ms;
  transition: transform 180ms ease, border-color 220ms ease, background-color 220ms ease;
}

.custom-theme-item:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong, rgba(148, 163, 184, 0.3));
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.custom-theme-item span {
  font-size: 12px;
  color: var(--text-secondary, #cbd5e1);
}

.custom-theme-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-color-input {
  width: 28px;
  height: 22px;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.custom-theme-control code {
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
}

.custom-theme-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.custom-theme-import {
  width: 100%;
  min-height: 92px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  color: var(--text-primary, #f8fafc);
  resize: vertical;
  font-size: 12px;
  line-height: 1.5;
}

.custom-theme-status {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-secondary, #cbd5e1);
}

.theme-btn {
  height: 42px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  transition: transform 180ms ease, border-color 220ms ease, background-color 220ms ease, color 220ms ease;
}

.theme-btn:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong, rgba(148, 163, 184, 0.3));
}

.theme-btn.active {
  border-color: transparent;
  background: linear-gradient(135deg, var(--accent-blue-strong, #4dabff), #38bdf8);
  color: #fff;
}

.font-size-control {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
}

.font-size-btn,
.font-size-reset {
  height: 34px;
  min-width: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary, #f8fafc);
  cursor: pointer;
}

.font-size-value {
  min-width: 62px;
  text-align: center;
}

.settings-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  color: var(--text-secondary, #cbd5e1);
}

.settings-update-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.settings-update-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.35);
}

.settings-update-item span {
  color: var(--text-muted, #94a3b8);
  font-size: 12px;
}

.settings-update-item strong {
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-primary, #f8fafc);
  word-break: break-word;
}

.settings-update-item-wide {
  grid-column: 1 / -1;
}

.settings-update-status,
.settings-update-message,
.settings-update-notes {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.6;
}

.settings-update-status {
  color: var(--text-primary, #f8fafc);
}

.settings-update-message {
  color: #34d399;
}

.settings-update-notes {
  color: var(--text-secondary, #cbd5e1);
}

.settings-update-notes span:first-child {
  display: inline-block;
  margin-right: 8px;
  color: var(--text-muted, #94a3b8);
}

.settings-update-actions {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.settings-update-btn {
  height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.3);
  color: var(--text-primary, #f8fafc);
  cursor: pointer;
  transition: transform 180ms ease, border-color 220ms ease, opacity 220ms ease;
}

.settings-update-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(148, 163, 184, 0.36);
}

.settings-update-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.settings-update-btn-primary {
  border-color: transparent;
  background: linear-gradient(135deg, #0ea5e9, #38bdf8);
  color: #fff;
}

.settings-update-btn-link {
  color: #93c5fd;
}

.settings-author-inline {
  padding: 14px 16px 18px;
  line-height: 1.7;
  border-radius: 14px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: rgba(255, 255, 255, 0.02);
}

.settings-author-inline p {
  margin: 0 0 8px;
}

.settings-author-donation {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

.settings-author-donation h5 {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text-primary, #f8fafc);
}

.settings-author-donation-desc {
  margin: 0 0 10px;
  font-size: 12px;
}

.settings-author-qr-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.settings-author-qr-card {
  margin: 0;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.03);
}

.settings-author-qr-card img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}

.settings-author-qr-card figcaption {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary, #cbd5e1);
  text-align: center;
}

.settings-author-donation-tip {
  margin: 10px 0 0 !important;
  font-size: 12px;
  color: var(--text-secondary, #cbd5e1);
}

.settings-author-link {
  color: var(--accent-blue, #7cc7ff);
  text-decoration: none;
  word-break: break-all;
}

.settings-author-link:hover {
  text-decoration: underline;
}

@media (max-width: 960px) {
  .settings-workspace {
    grid-template-columns: 1fr;
  }

  .settings-nav {
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  }

  .settings-nav-item {
    flex: 0 0 auto;
  }

  .settings-overview {
    grid-template-columns: 1fr;
  }

  .settings-update-grid {
    grid-template-columns: 1fr;
  }

  .custom-theme-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings-panel,
  .settings-panel :deep(.animate__animated),
  .settings-panel .animate__animated {
    animation: none !important;
    transition: none !important;
  }
}

@media (max-width: 520px) {
  .settings-author-qr-grid {
    grid-template-columns: 1fr;
  }
}
</style>
