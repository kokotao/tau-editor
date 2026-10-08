<template>
  <n-config-provider class="settings-provider" :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
    <div
      class="settings-panel animate__animated animate__fadeIn animate__faster"
      :class="[`settings-panel--${mode}`, `settings-panel-theme--${settingsStore.resolvedTheme}`]"
      data-testid="settings-panel"
    >
      <div class="settings-header">
        <div class="settings-header-main">
          <div class="settings-title-row">
            <span v-if="isWorkspaceMode" class="settings-title-orb" aria-hidden="true"></span>
            <h3 class="settings-title">{{ panelTitle }}</h3>
            <span v-if="isWorkspaceMode" class="settings-title-badge">Preferences</span>
          </div>
          <p v-if="isDrawerMode" class="settings-subtitle">{{ panelSubtitle }}</p>
        </div>

        <div class="settings-header-actions">
          <div v-if="isWorkspaceMode" class="settings-save-state" data-testid="settings-save-state">
            <TauIcon class="settings-save-state-icon" name="icon-check-circle" :size="16" />
            <span>{{ copy.autoSaveEnabled }}</span>
          </div>
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
          <div class="settings-nav-heading">系统选项</div>
          <button
            v-for="category in categories"
            :key="category.id"
            class="settings-nav-item"
            :class="{ active: activeCategoryValue === category.id }"
            :aria-current="activeCategoryValue === category.id ? 'page' : undefined"
            :data-testid="`settings-nav-${category.id}`"
            @click="setActiveCategory(category.id)"
          >
            <TauIcon class="settings-nav-icon" :name="categoryIconNames[category.id]" />
            {{ category.label }}
            <span v-if="category.id === 'themes'" class="settings-nav-count">{{ settingsStore.themePackages.length || 0 }} 款</span>
            <span v-else-if="category.id === 'updates'" class="settings-nav-status" aria-hidden="true"></span>
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
            <div class="settings-section-heading">
              <div class="settings-section-heading-main">
                <TauIcon class="settings-section-icon" name="icon-brush" :size="21" />
                <h4 class="settings-section-title">{{ copy.appearance }}</h4>
              </div>
              <span class="settings-section-meta">即时生效 · 跨窗口同步</span>
            </div>

            <div class="settings-appearance-grid">
              <div class="settings-item">
                <label class="settings-label settings-label-with-meta">
                  <span>{{ copy.language }}</span>
                  <small>默认语言</small>
                </label>
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
                <label class="settings-label settings-label-with-meta">
                  <span>{{ copy.uiFont }}</span>
                  <small class="settings-label-positive">可变字重</small>
                </label>
                <n-select
                  class="settings-nselect"
                  data-testid="select-ui-font-family"
                  :value="settingsStore.uiFontFamily"
                  :options="uiFontFamilyOptions"
                  :consistent-menu-width="false"
                  @update:value="setUiFontFamily"
                />
              </div>
            </div>

            <div class="settings-item settings-font-size-item">
              <label class="settings-label">{{ copy.uiFontSize }}</label>
              <div class="font-size-control">
                <button class="font-size-btn" data-testid="decrease-ui-font-btn" @click="decreaseUiFontSize"><TauIcon name="icon-minus" :size="16" /></button>
                <span class="font-size-value">{{ settingsStore.uiFontSize }}px</span>
                <button class="font-size-btn" data-testid="increase-ui-font-btn" @click="increaseUiFontSize"><TauIcon name="icon-plus" :size="16" /></button>
                <button class="font-size-reset" data-testid="reset-ui-font-btn" @click="resetUiFontSize">{{ copy.reset }}</button>
              </div>
            </div>

            <div class="settings-theme-block">
              <div class="settings-item settings-theme-style-item">
                <label class="settings-label">{{ copy.themeStyle }}</label>
                <p class="settings-item-hint" data-testid="theme-background-summary">{{ themeBackgroundSummary }}</p>
                <div class="theme-swatch-grid" data-testid="theme-swatch-grid">
                <button
                  v-for="swatch in visibleThemeSwatches"
                  :key="`${swatch.mode}-${swatch.skin}`"
                  class="theme-swatch"
                  :class="{ active: isThemeSwatchActive(swatch) }"
                  :data-testid="`theme-swatch-${swatch.mode}-${swatch.skin}`"
                  :title="swatch.label"
                  @click="selectThemeSwatch(swatch)"
                >
                  <span class="theme-swatch-colors" aria-hidden="true">
                    <i :style="{ backgroundColor: swatch.bg }"></i>
                    <i :style="{ backgroundColor: swatch.accent }"></i>
                  </span>
                  <span class="theme-swatch-copy">
                    <strong>{{ swatch.label }}</strong>
                    <small>{{ swatch.bg }} · {{ swatch.panel }}</small>
                  </span>
                </button>
                </div>
                <div class="theme-style-fallback">
                  <span>{{ copy.themeStyleMore }}</span>
                  <n-select
                    class="settings-nselect"
                    data-testid="select-theme-skin"
                    :value="settingsStore.themeSkin"
                    :options="themeSkinOptions"
                    :consistent-menu-width="false"
                    @update:value="setThemeSkin"
                  />
                </div>
              </div>

              <div class="settings-item settings-editor-theme-item">
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

            <div class="settings-item theme-json-examples" data-testid="theme-json-examples">
              <label class="settings-label">{{ copy.themeJsonExamples }}</label>
              <p class="custom-theme-desc">{{ copy.themeJsonExamplesDesc }}</p>
              <details class="theme-json-example">
                <summary>{{ copy.themeJsonThemeExample }}</summary>
                <pre><code>{{ themeJsonExample }}</code></pre>
                <button class="settings-action-btn" data-testid="copy-theme-json-example" @click="copyThemeExample(themeJsonExample)">{{ copy.themeJsonCopy }}</button>
              </details>
              <details class="theme-json-example">
                <summary>{{ copy.themeJsonPaletteExample }}</summary>
                <pre><code>{{ paletteJsonExample }}</code></pre>
                <button class="settings-action-btn" data-testid="copy-palette-json-example" @click="copyThemeExample(paletteJsonExample)">{{ copy.themeJsonCopy }}</button>
              </details>
            </div>

            <div class="settings-item theme-package-settings" data-testid="theme-package-settings">
              <label class="settings-label">{{ copy.themePackages }}</label>
              <p class="custom-theme-desc">{{ copy.themePackagesDesc }}</p>

              <div class="theme-package-list">
                <div
                  v-for="theme in settingsStore.themePackages"
                  :key="theme.id"
                  class="theme-package-item"
                  :class="{ active: settingsStore.activeThemePackageId === theme.id }"
                  :data-testid="`theme-package-${theme.id}`"
                >
                  <div class="theme-package-main">
                    <span class="theme-package-name">{{ theme.name }}</span>
                    <span class="theme-package-meta">{{ theme.id }} · v{{ theme.version }} · {{ theme.mode }}</span>
                  </div>
                  <div class="theme-package-actions">
                    <button
                      class="settings-action-btn"
                      :disabled="settingsStore.activeThemePackageId === theme.id"
                      @click="handleApplyThemePackage(theme.id)"
                    >
                      {{ settingsStore.activeThemePackageId === theme.id ? copy.themePackageActive : copy.themePackageApply }}
                    </button>
                    <button class="settings-action-btn" @click="handleExportThemePackage(theme.id)">
                      {{ copy.themePackageExport }}
                    </button>
                    <button class="settings-action-btn danger" @click="handleDeleteThemePackage(theme.id)">
                      {{ copy.themePackageDelete }}
                    </button>
                  </div>
                </div>
                <p v-if="settingsStore.themePackages.length === 0" class="theme-package-empty">
                  {{ copy.themePackageEmpty }}
                </p>
              </div>

              <div class="custom-theme-actions">
                <button class="settings-action-btn" data-testid="import-theme-package-btn" @click="handleImportThemePackage">
                  {{ copy.themePackageImport }}
                </button>
                <button class="settings-action-btn" data-testid="export-active-theme-package-btn" @click="handleExportThemePackage()">
                  {{ copy.themePackageExportCurrent }}
                </button>
                <button
                  v-if="settingsStore.activeThemePackageId"
                  class="settings-action-btn"
                  data-testid="revert-theme-package-btn"
                  @click="handleApplyThemePackage(null)"
                >
                  {{ copy.reset }}
                </button>
              </div>

              <textarea
                v-model="themePackageImportText"
                class="custom-theme-import"
                data-testid="theme-package-textarea"
                :placeholder="copy.themePackageImportPlaceholder"
              />
              <div class="custom-theme-actions">
                <button class="settings-action-btn" data-testid="paste-theme-package-btn" @click="handlePasteImportThemePackage">
                  {{ copy.themePackagePasteImport }}
                </button>
              </div>
              <p v-if="themePackageStatusText" class="custom-theme-status" data-testid="theme-package-status">
                {{ themePackageStatusText }}
              </p>
            </div>

          </div>

          <div
            v-if="activeCategoryValue === 'themes'"
            class="settings-section animate__animated animate__fadeInUp animate__faster"
            data-testid="settings-themes-section"
          >
            <h4 class="settings-section-title">{{ copy.themeMarketplace }}</h4>
            <div class="settings-item theme-marketplace-settings" data-testid="theme-marketplace-settings">
              <ThemeMarketplacePanel
                :installed-ids="installedMarketplaceIds"
                :active-id="activeMarketplaceId"
                @install="handleMarketplaceInstall"
                @apply="handleMarketplaceApply"
                @view-source="handleViewThemeSource"
              />
            </div>

            <div class="settings-item theme-ui-settings" data-testid="theme-ui-settings">
              <label class="settings-label">{{ copy.themeUiAppearance }}</label>
              <p class="custom-theme-desc">{{ copy.themeUiAppearanceDesc }}</p>
              <div class="custom-theme-grid">
                <div v-for="field in themeUiColorFields" :key="`${field.group}.${field.key}`" class="custom-theme-item">
                  <span>{{ field.label }}</span>
                  <div class="custom-theme-control">
                    <input
                      class="custom-color-input"
                      :data-testid="`theme-ui-color-${field.group}-${field.key}`"
                      type="color"
                      :value="getThemeUiColorValue(field.group, field.key)"
                      @input="setThemeUiColor(field.group, field.key, ($event.target as HTMLInputElement).value)"
                    />
                    <code>{{ getThemeUiColorValue(field.group, field.key) }}</code>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-item radius-settings" data-testid="corner-radius-settings">
              <label class="settings-label">{{ copy.cornerRadius }}</label>
              <div class="theme-selector">
                <button
                  v-for="preset in cornerRadiusPresets"
                  :key="preset.value"
                  class="theme-btn"
                  :class="{ active: settingsStore.cornerRadiusPreset === preset.value }"
                  :data-testid="`corner-radius-preset-${preset.value}`"
                  @click="settingsStore.setCornerRadiusPreset(preset.value)"
                >{{ preset.label }}</button>
              </div>
              <div class="radius-slider-row">
                <input
                  class="radius-slider"
                  data-testid="corner-radius-slider"
                  type="range"
                  min="0"
                  max="24"
                  step="0.5"
                  :value="settingsStore.cornerRadius"
                  @input="setCornerRadius(($event.target as HTMLInputElement).valueAsNumber)"
                />
                <output data-testid="corner-radius-value">{{ settingsStore.cornerRadius }}px</output>
              </div>
              <details class="radius-advanced" data-testid="corner-radius-advanced">
                <summary>高级分类细节</summary>
                <div class="radius-detail-grid">
                  <label v-for="field in cornerRadiusFields" :key="field.key" class="radius-detail-item">
                    <span>{{ field.label }}</span>
                    <input
                      :data-testid="`corner-radius-${field.key}`"
                      type="range"
                      min="0"
                      :max="field.key === 'badge' ? 999 : 24"
                      step="0.5"
                      :value="getCornerRadius(field.key)"
                      @input="setCornerRadiusField(field.key, ($event.target as HTMLInputElement).valueAsNumber)"
                    />
                    <output>{{ formatRadius(getCornerRadius(field.key)) }}px</output>
                  </label>
                </div>
              </details>
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
                <button class="font-size-btn" data-testid="decrease-font-btn" @click="decreaseFontSize"><TauIcon name="icon-minus" :size="16" /></button>
                <span class="font-size-value">{{ settingsStore.fontSize }}px</span>
                <button class="font-size-btn" data-testid="increase-font-btn" @click="increaseFontSize"><TauIcon name="icon-plus" :size="16" /></button>
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
              <label class="settings-label">{{ copy.markdownPreviewTheme }}</label>
              <n-select
                class="settings-nselect"
                data-testid="select-markdown-preview-theme"
                :value="settingsStore.markdownPreviewTheme"
                :options="markdownPreviewThemeOptions"
                :consistent-menu-width="false"
                @update:value="setMarkdownPreviewTheme"
              />
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

            <div class="settings-item keybinding-settings" data-testid="keybinding-settings">
              <label class="settings-label">{{ copy.keybindings }}</label>
              <p class="custom-theme-desc">{{ copy.keybindingsDesc }}</p>

              <div class="keybinding-list">
                <div
                  v-for="item in keybindingRows"
                  :key="item.commandId"
                  class="keybinding-row"
                  :data-testid="`keybinding-row-${item.commandId}`"
                >
                  <div class="keybinding-main">
                    <span class="keybinding-title">{{ item.title }}</span>
                    <span class="keybinding-meta">{{ item.commandId }}</span>
                  </div>
                  <button
                    class="keybinding-recorder"
                    :class="{ recording: recordingCommandId === item.commandId, unbound: !item.label }"
                    :data-testid="`keybinding-record-${item.commandId}`"
                    @click="toggleKeybindingRecording(item.commandId)"
                  >
                    {{ recordingCommandId === item.commandId ? copy.keybindingRecording : (item.label || copy.keybindingUnbound) }}
                  </button>
                  <button
                    class="settings-action-btn"
                    :disabled="!item.isCustom"
                    :data-testid="`keybinding-reset-${item.commandId}`"
                    @click="handleResetKeybinding(item.commandId)"
                  >
                    {{ copy.reset }}
                  </button>
                </div>
              </div>

              <div class="custom-theme-actions">
                <button class="settings-action-btn" data-testid="reset-all-keybindings-btn" @click="handleResetAllKeybindings">
                  {{ copy.keybindingsResetAll }}
                </button>
              </div>
              <p v-if="keybindingStatusText" class="custom-theme-status" data-testid="keybinding-status">
                {{ keybindingStatusText }}
              </p>
            </div>

            <div class="settings-item provider-settings" data-testid="provider-settings">
              <label class="settings-label">{{ copy.providers }}</label>
              <p class="custom-theme-desc">{{ copy.providersDesc }}</p>
              <div class="provider-stats">
                <span data-testid="provider-theme-count">{{ copy.providerThemes }}: {{ providersStore.themeProviderCount }}</span>
                <span data-testid="provider-command-count">{{ copy.providerCommands }}: {{ providersStore.commandProviderCount }}</span>
                <span data-testid="provider-file-action-count">{{ copy.providerFileActions }}: {{ providersStore.fileActionProviderCount }}</span>
              </div>
              <p v-if="providersStore.errorCount > 0" class="custom-theme-status provider-error" data-testid="provider-errors">
                {{ providersStore.errors.map((error) => `${error.providerId}: ${error.message}`).join('；') }}
              </p>
            </div>

            <div class="settings-item lsp-server-settings" data-testid="lsp-server-settings">
              <div class="settings-label-row">
                <label class="settings-label">{{ settingsStore.uiLanguage === 'en-US' ? 'Language servers' : '语言服务器' }}</label>
                <button
                  class="settings-action-btn"
                  data-testid="refresh-lsp-servers-btn"
                  :disabled="lspServersStore.loading"
                  @click="lspServersStore.refresh()"
                >
                  {{ lspServersStore.loading ? (settingsStore.uiLanguage === 'en-US' ? 'Checking…' : '检测中…') : (settingsStore.uiLanguage === 'en-US' ? 'Check again' : '重新检测') }}
                </button>
              </div>
              <p class="custom-theme-desc">
                {{ settingsStore.uiLanguage === 'en-US' ? 'Tau Editor uses managed servers when a verified asset is configured, then PATH, and finally lightweight navigation.' : 'Tau Editor 会优先使用应用托管且已校验的语言服务器，其次使用 PATH，最后回退到轻量导航。' }}
              </p>
              <div v-if="lspServersStore.error" class="custom-theme-status provider-error" data-testid="lsp-server-error">
                {{ lspServersStore.error }}
              </div>
              <div v-if="lspServersStore.servers.length" class="lsp-server-list">
                <div v-for="server in lspServersStore.servers" :key="server.id" class="lsp-server-row" :data-testid="`lsp-server-${server.id}`">
                  <div class="lsp-server-main">
                    <span class="lsp-server-name">{{ server.displayName }}</span>
                    <span class="lsp-server-command">{{ server.command }}</span>
                  </div>
                  <div class="lsp-server-state" :class="server.available ? 'is-ready' : 'is-missing'">
                    <strong>{{ lspServerStateLabel(server) }}</strong>
                    <small v-if="server.version">{{ server.version }}</small>
                    <small v-else-if="server.reason">{{ server.reason }}</small>
                    <button
                      v-if="!server.available && server.managedConfigured"
                      class="settings-action-btn lsp-server-provision-btn"
                      :disabled="Boolean(lspServersStore.provisioning[server.id])"
                      :data-testid="`provision-lsp-server-${server.id}`"
                      @click="lspServersStore.provision(server.id)"
                    >
                      {{ lspServersStore.provisioning[server.id] ? (settingsStore.uiLanguage === 'en-US' ? 'Preparing…' : '准备中…') : (settingsStore.uiLanguage === 'en-US' ? 'Prepare automatically' : '自动准备') }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="activeCategoryValue === 'fileAssociations'"
            class="settings-section animate__animated animate__fadeInUp animate__faster"
            data-testid="settings-file-associations-section"
          >
            <h4 class="settings-section-title">{{ copy.fileAssociations }}</h4>
            <p class="settings-item-hint">{{ copy.fileAssociationsApplyHint }}</p>

            <div v-if="associationStatus.text" class="settings-item-hint" :class="{ error: associationStatus.error }">
              {{ associationStatus.text }}
            </div>

            <div v-if="associationLoading" class="settings-item-hint">{{ copy.fileAssociationsLoading }}</div>

            <template v-else>
              <div v-for="group in associationGroups" :key="group.category" class="association-group">
                <div class="association-group-title">{{ group.label }}</div>
                <div class="association-list">
                  <label
                    v-for="item in group.items"
                    :key="item.ext"
                    class="settings-checkbox association-item"
                    :data-testid="`file-association-${item.ext}`"
                  >
                    <input
                      type="checkbox"
                      :checked="item.registered"
                      @change="toggleFileAssociation(item, $event)"
                      :disabled="!isWindows"
                    />
                    <span class="checkbox-text">
                      <code>.{{ item.ext }}</code>
                      <span v-if="item.executable" class="association-script-badge">{{ copy.fileAssociationsScriptHint }}</span>
                    </span>
                    <span class="association-state">{{ item.registered ? copy.fileAssociationsOn : copy.fileAssociationsOff }}</span>
                  </label>
                </div>
              </div>
            </template>
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
            <div
              v-if="releaseNotesHtml || releaseNotesPreview"
              class="settings-update-notes"
              data-testid="settings-release-notes"
            >
              <span class="settings-update-notes-label">{{ copy.releaseNotes }}</span>
              <div
                v-if="releaseNotesHtml"
                class="settings-update-notes-content"
                v-html="releaseNotesHtml"
                @click="handleReleaseNotesClick"
              ></div>
              <span v-else class="settings-update-notes-fallback">{{ releaseNotesPreview }}</span>
            </div>

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

      <div v-if="sourceDialog.open" class="theme-source-backdrop" data-testid="theme-source-backdrop" @click.self="closeSourceDialog">
        <section class="theme-source-dialog" role="dialog" aria-modal="true" :aria-label="copy.themeSourceTitle" data-testid="theme-source-dialog">
          <header class="theme-source-header">
            <div>
              <h4>{{ copy.themeSourceTitle }}</h4>
              <p>{{ sourceDialog.item?.name }}</p>
            </div>
            <button class="settings-close" data-testid="theme-source-close" :title="copy.close" @click="closeSourceDialog">×</button>
          </header>
          <div v-if="sourceDialog.loading" class="theme-source-state" data-testid="theme-source-loading">{{ copy.themeSourceLoading }}</div>
          <div v-else-if="sourceDialog.error" class="theme-source-state theme-source-error" data-testid="theme-source-error">
            <p>{{ sourceDialog.error }}</p>
            <button class="settings-action-btn" data-testid="theme-source-retry" @click="loadThemeSource">{{ copy.themeSourceRetry }}</button>
          </div>
          <pre v-else class="theme-source-pre" data-testid="theme-source-content"><code>{{ sourceDialog.raw }}</code></pre>
          <footer class="theme-source-actions">
            <button v-if="sourceDialog.raw" class="settings-action-btn" data-testid="theme-source-copy" @click="copyThemeSource">{{ copy.themeSourceCopy }}</button>
            <button class="settings-action-btn" data-testid="theme-source-close-bottom" @click="closeSourceDialog">{{ copy.close }}</button>
          </footer>
        </section>
      </div>

      <div
        v-if="!isWorkspaceMode"
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
            <label class="settings-label">{{ copy.uiFont }}</label>
            <n-select
              class="settings-nselect"
              data-testid="drawer-select-ui-font-family"
              :value="settingsStore.uiFontFamily"
              :options="uiFontFamilyOptions"
              :consistent-menu-width="false"
              @update:value="setUiFontFamily"
            />
          </div>

          <div class="settings-item">
            <label class="settings-label">{{ copy.uiFontSize }}</label>
            <div class="font-size-control">
              <button class="font-size-btn" data-testid="drawer-decrease-ui-font-btn" @click="decreaseUiFontSize"><TauIcon name="icon-minus" :size="16" /></button>
              <span class="font-size-value">{{ settingsStore.uiFontSize }}px</span>
              <button class="font-size-btn" data-testid="drawer-increase-ui-font-btn" @click="increaseUiFontSize"><TauIcon name="icon-plus" :size="16" /></button>
              <button class="font-size-reset" data-testid="drawer-reset-ui-font-btn" @click="resetUiFontSize">{{ copy.reset }}</button>
            </div>
          </div>

          <div class="settings-item">
            <label class="settings-label">{{ copy.fontSize }}</label>
            <div class="font-size-control">
              <button class="font-size-btn" data-testid="drawer-decrease-font-btn" @click="decreaseFontSize"><TauIcon name="icon-minus" :size="16" /></button>
              <span class="font-size-value">{{ settingsStore.fontSize }}px</span>
              <button class="font-size-btn" data-testid="drawer-increase-font-btn" @click="increaseFontSize"><TauIcon name="icon-plus" :size="16" /></button>
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { darkTheme, NConfigProvider, NSelect, type GlobalThemeOverrides, type SelectOption } from 'naive-ui';
import {
  CUSTOM_THEME_COLOR_FALLBACKS,
  CUSTOM_THEME_COLOR_VAR_MAP,
  DEFAULT_UI_FONT_FAMILY,
  type MarkdownPreviewTheme,
  type CustomThemeColorKey,
  useSettingsStore,
} from '@/stores/settings';
import { useProvidersStore } from '@/stores/providers';
import { useLspServersStore } from '@/stores/lspServers';
import {
  appCommands,
  settingsCommands,
  type AppVersionInfo,
  type FileAssociationState,
  type GithubUpdateInfo,
  type ReleaseAssetInfo,
} from '@/lib/tauri';
import { isTauriApp } from '@/lib/tauri';
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { ThemeSkinId } from '@/utils/themeResolver';
import TauIcon from '@/components/icons/TauIcon.vue';
import {
  getAuthorInfoI18n,
  getCommandText,
  getSettingsPanelI18n,
  type CommandId,
  type MonacoThemeValue,
  type UiLanguage,
} from '@/i18n/ui';
import {
  DEFAULT_KEYBINDINGS,
  findConflictsForKey,
  formatKeybinding,
  keybindingFromEvent,
  resolveKeybindings,
} from '@/services/keybindingService';
import wechatDonateQr from '@/assets/donation/WeChatPay.jpg';
import alipayDonateQr from '@/assets/donation/AliPay.jpg';
import ThemeMarketplacePanel from './ThemeMarketplacePanel.vue';
import { ThemeMarketplaceService, type ThemeMarketplaceCatalogItem, type ThemeMarketplacePackage } from '@/services/themeMarketplaceService';
import type { ThemeUiOverrides } from '@/utils/themePackage';

export type SettingsCategory = 'general' | 'themes' | 'editor' | 'fileAssociations' | 'updates' | 'about';
type SettingsMode = 'workspace' | 'drawer';

const categoryIconNames: Record<SettingsCategory, string> = {
  general: 'icon-settings',
  themes: 'icon-palette',
  editor: 'icon-code',
  fileAssociations: 'icon-list',
  updates: 'icon-cloud-download',
  about: 'icon-info',
};
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
  'update-availability': [state: {
    available: boolean;
    canInstall: boolean;
    latestVersion: string;
    releaseName: string;
    releaseNotes: string;
    releaseUrl: string;
  }];
}>();

const settingsStore = useSettingsStore();
const marketplaceService = new ThemeMarketplaceService();
const providersStore = useProvidersStore();
const lspServersStore = useLspServersStore();
const copy = computed(() => getSettingsPanelI18n(settingsStore.uiLanguage));
const authorCopy = computed(() => getAuthorInfoI18n(settingsStore.uiLanguage));
const projectHomepageUrl = 'https://github.com/kokotao/tau-editor';
const naiveTheme = computed(() => (settingsStore.resolvedTheme === 'dark' ? darkTheme : null));
const isWorkspaceMode = computed(() => props.mode === 'workspace');
const isDrawerMode = computed(() => props.mode === 'drawer');

/**
 * Naive UI 的颜色解析器需要具体颜色值，不能直接接收 var()/color-mix()。
 * 主题系统内部仍使用 CSS 变量，这里只在组件边界将当前主题解析为最终值。
 */
const resolveThemeColor = (variable: string, fallback: string): string => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return fallback;
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  if (!value || value.includes('var(') || value.includes('color-mix(')) {
    return fallback;
  }
  return value;
};

const toThemeRgba = (color: string, alpha: number, fallback: string): string => {
  const normalized = color.trim();
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) {
    return fallback;
  }

  const expanded = hex.length === 3 ? hex.split('').map((part) => `${part}${part}`).join('') : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const lspServerStateLabel = (server: {
  available: boolean;
  source: string;
  managedState: string;
  installed: boolean;
}) => {
  const english = settingsStore.uiLanguage === 'en-US';
  if (server.available) return server.source === 'managed' ? (english ? 'Ready (managed)' : '可用（应用托管）') : (english ? 'Ready' : '可用');
  if (server.managedState === 'preparing') return english ? 'Preparing…' : '准备中…';
  if (server.installed) return english ? 'Installed, unavailable' : '已安装但不可用';
  return english ? 'Not prepared' : '尚未准备';
};

const appVersionInfo = ref<AppVersionInfo | null>(null);
const updateInfo = ref<GithubUpdateInfo | null>(null);
const releaseNotesHtml = ref('');
const updateStatus = ref<UpdateStatus>('idle');
const updateError = ref('');
const installMessage = ref('');
const isCheckingUpdate = ref(false);
let releaseNotesRenderToken = 0;
const isInstallingUpdate = ref(false);

const fileAssociations = ref<FileAssociationState[]>([]);
const associationLoading = ref(false);
const associationStatus = ref<{ text: string; error: boolean }>({ text: '', error: false });
const associationsLoaded = ref(false);
const isWindows = computed(() => {
  const os = appVersionInfo.value?.os || '';
  return os === 'windows';
});

const categories = computed<Array<{ id: SettingsCategory; label: string }>>(() => {
  const list: Array<{ id: SettingsCategory; label: string }> = [
    { id: 'general', label: copy.value.settingsGeneral },
    { id: 'themes', label: copy.value.themeMarketplace },
    { id: 'editor', label: copy.value.settingsEditor },
  ];
  if (isWindows.value) {
    list.push({ id: 'fileAssociations', label: copy.value.fileAssociations });
  }
  list.push(
    { id: 'updates', label: copy.value.settingsUpdates },
    { id: 'about', label: copy.value.settingsAbout },
  );
  return list;
});

const workspaceTitle = computed(() => (settingsStore.uiLanguage === 'en-US' ? 'Preferences' : '偏好设置'));
const panelTitle = computed(() => (isWorkspaceMode.value ? workspaceTitle.value : copy.value.quickSettingsTitle));
const panelSubtitle = computed(() => (isWorkspaceMode.value ? copy.value.title : copy.value.quickSettingsDesc));
const activeCategoryValue = computed<SettingsCategory>(() => props.activeCategory || 'general');
const selectedAsset = computed<ReleaseAssetInfo | null>(() => updateInfo.value?.selectedAsset ?? null);
const customThemeImportText = ref('');
const customThemeStatusText = ref('');
const themePackageImportText = ref('');
const themePackageStatusText = ref('');
const isImportingThemePackage = ref(false);
const recordingCommandId = ref<string | null>(null);
const keybindingStatusText = ref('');
const sourceDialog = ref<{ open: boolean; loading: boolean; raw: string; error: string; item: ThemeMarketplaceCatalogItem | null }>({
  open: false,
  loading: false,
  raw: '',
  error: '',
  item: null,
});

const themeUiColorFields = computed(() => [
  { group: 'sidebar', key: 'bg', label: copy.value.themeUiSidebarBg },
  { group: 'sidebar', key: 'text', label: copy.value.themeUiSidebarText },
  { group: 'sidebar', key: 'activeBg', label: copy.value.themeUiSidebarActiveBg },
  { group: 'sidebar', key: 'activeText', label: copy.value.themeUiSidebarActiveText },
  { group: 'sidebar', key: 'activeIndicator', label: copy.value.themeUiSidebarIndicator },
  { group: 'panel', key: 'bg', label: copy.value.themeUiPanelBg },
  { group: 'panel', key: 'raisedBg', label: copy.value.themeUiPanelRaised },
  { group: 'panel', key: 'border', label: copy.value.themeUiPanelBorder },
  { group: 'tabs', key: 'activeBg', label: copy.value.themeUiTabsActiveBg },
  { group: 'tabs', key: 'activeText', label: copy.value.themeUiTabsActiveText },
  { group: 'tabs', key: 'activeIndicator', label: copy.value.themeUiTabsIndicator },
  { group: 'tabs', key: 'hoverBg', label: copy.value.themeUiTabsHover },
] as Array<{ group: keyof Omit<ThemeUiOverrides, 'radius'>; key: string; label: string }>);

const cornerRadiusPresets = computed(() => [
  { value: 'sharp' as const, label: copy.value.cornerRadiusSharp },
  { value: 'compact' as const, label: copy.value.cornerRadiusCompact },
  { value: 'standard' as const, label: copy.value.cornerRadiusStandard },
  { value: 'soft' as const, label: copy.value.cornerRadiusSoft },
  { value: 'round' as const, label: copy.value.cornerRadiusRound },
]);

type CornerRadiusKey = 'base' | 'control' | 'card' | 'panel' | 'tab' | 'dialog' | 'badge';
const cornerRadiusFields = computed<Array<{ key: Exclude<CornerRadiusKey, 'base'>; label: string }>>(() => [
  { key: 'control', label: '控件' },
  { key: 'card', label: '卡片' },
  { key: 'panel', label: '面板' },
  { key: 'tab', label: '标签页' },
  { key: 'dialog', label: '弹窗' },
  { key: 'badge', label: '徽标' },
]);

const associationGroups = computed(() => {
  const groups = new Map<string, FileAssociationState[]>();
  for (const item of fileAssociations.value) {
    const bucket = groups.get(item.category) ?? [];
    bucket.push(item);
    groups.set(item.category, bucket);
  }
  const labelFor = (category: string): string => {
    switch (category) {
      case 'text': return copy.value.fileAssociationsGroupText;
      case 'markdown': return copy.value.fileAssociationsGroupMarkdown;
      case 'json': return copy.value.fileAssociationsGroupJson;
      case 'yaml': return copy.value.fileAssociationsGroupYaml;
      case 'toml': return copy.value.fileAssociationsGroupToml;
      case 'code': return copy.value.fileAssociationsGroupCode;
      case 'script': return copy.value.fileAssociationsGroupScript;
      default: return category;
    }
  };
  return Array.from(groups.entries()).map(([category, items]) => ({
    category,
    label: labelFor(category),
    items,
  }));
});

const naiveThemeOverrides = computed<GlobalThemeOverrides>(() => {
  // 依赖主题相关状态，使切换主题风格、主题包或圆角后重新读取 root 上的最终颜色。
  void settingsStore.resolvedTheme;
  void settingsStore.themeSkin;
  void settingsStore.activeThemePackageId;
  void settingsStore.customThemeColors;
  void settingsStore.customThemeUiOverrides;
  void settingsStore.cornerRadius;
  void settingsStore.cornerRadii;
  const primaryColor = resolveThemeColor('--accent-brand', '#2563eb');
  const primaryColorPressed = resolveThemeColor('--accent-brand-strong', '#1d4ed8');
  const panelBase = resolveThemeColor('--panel-base', '#f7f9ff');
  const isLightTheme = settingsStore.resolvedTheme === 'light';
  const selectSurface = isLightTheme
    ? resolveThemeColor('--bg-app', '#eef3ff')
    : panelBase;
  const menuSurface = isLightTheme
    ? selectSurface
    : resolveThemeColor('--panel-elevated', '#151d2d');
  const borderSoft = resolveThemeColor('--border-soft', 'rgba(51, 65, 85, 0.12)');
  const textPrimary = resolveThemeColor('--text-primary', isLightTheme ? '#162033' : '#ecf2ff');
  const textSecondary = resolveThemeColor('--text-secondary', isLightTheme ? '#49566d' : '#b6c2d9');
  const textMuted = resolveThemeColor('--text-muted', isLightTheme ? '#7b879d' : '#75829e');
  const surfaceHover = resolveThemeColor(
    '--surface-hover',
    isLightTheme ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.08)',
  );
  const surfaceActive = resolveThemeColor(
    '--surface-active',
    isLightTheme ? 'rgba(37, 99, 235, 0.1)' : 'rgba(124, 199, 255, 0.14)',
  );

  return {
    common: {
      primaryColor,
      primaryColorHover: primaryColor,
      primaryColorPressed,
      borderRadius: `${Math.max(0, settingsStore.cornerRadii.control ?? settingsStore.cornerRadius)}px`,
    },
    Select: {
      peers: {
        InternalSelection: {
          color: selectSurface,
          colorActive: selectSurface,
          textColor: textPrimary,
          textColorDisabled: textMuted,
          border: `1px solid ${borderSoft}`,
          borderActive: `1px solid ${primaryColor}`,
          borderFocus: `1px solid ${primaryColor}`,
          boxShadowFocus: `0 0 0 3px ${toThemeRgba(primaryColor, 0.2, 'rgba(37, 99, 235, 0.2)')}`,
        },
        InternalSelectMenu: {
          color: menuSurface,
          optionTextColor: textSecondary,
          optionTextColorPressed: textPrimary,
          optionTextColorActive: textPrimary,
          optionCheckColor: primaryColor,
          optionColorPending: surfaceHover,
          optionColorActive: surfaceActive,
          optionColorActivePending: surfaceActive,
        },
      },
    },
  };
});

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
  { key: 'textPrimary', label: copy.value.customColorTextPrimary },
  { key: 'textSecondary', label: copy.value.customColorTextSecondary },
  { key: 'accentBrand', label: copy.value.customColorAccentBrand },
  { key: 'accentBrandStrong', label: copy.value.customColorAccentBrandStrong },
  { key: 'stateSuccess', label: copy.value.customColorSuccess },
  { key: 'stateDanger', label: copy.value.customColorDanger },
]);

type ThemeSwatch = {
  skin: ThemeSkinId;
  mode: 'light' | 'dark';
  label: string;
  bg: string;
  panel: string;
  accent: string;
};

const THEME_SWATCHES: ThemeSwatch[] = [
  { skin: 'deep-ocean', mode: 'dark', label: '深海蓝调 · 深色', bg: '#0b1020', panel: '#101726', accent: '#7cc7ff' },
  { skin: 'deep-ocean', mode: 'light', label: '深海蓝调 · 浅色', bg: '#eef3ff', panel: '#ffffff', accent: '#2563eb' },
  { skin: 'forest-moss', mode: 'dark', label: '森林苔原 · 深色', bg: '#0d1511', panel: '#13201a', accent: '#4fd28e' },
  { skin: 'forest-moss', mode: 'light', label: '森林苔原 · 浅色', bg: '#edf6f0', panel: '#ffffff', accent: '#1f9d64' },
  { skin: 'solar-sand', mode: 'dark', label: '暖日砂岩 · 深色', bg: '#16110a', panel: '#241a0f', accent: '#f59e0b' },
  { skin: 'solar-sand', mode: 'light', label: '暖日砂岩 · 浅色', bg: '#fff7eb', panel: '#ffffff', accent: '#c96b0c' },
  { skin: 'graphite-ink', mode: 'dark', label: '石墨墨影 · 深色', bg: '#101216', panel: '#171b22', accent: '#8ea0bf' },
  { skin: 'graphite-ink', mode: 'light', label: '石墨墨影 · 浅色', bg: '#f3f5f9', panel: '#ffffff', accent: '#4b5f83' },
  { skin: 'rose-dawn', mode: 'dark', label: '玫瑰夜色 · 深色', bg: '#171018', panel: '#251824', accent: '#ff8ab3' },
  { skin: 'rose-dawn', mode: 'light', label: '玫瑰晨曦 · 浅色', bg: '#fff1f5', panel: '#fffafd', accent: '#d94675' },
];

const visibleThemeSwatches = computed(() => THEME_SWATCHES);
const themeBackgroundSummary = computed(() => {
  if (typeof window === 'undefined') return '背景跟随当前主题风格';
  const styles = window.getComputedStyle(document.documentElement);
  return `背景 ${styles.getPropertyValue('--bg-app').trim() || '跟随主题'} · 面板 ${styles.getPropertyValue('--panel-base').trim() || '跟随主题'}`;
});

const installedMarketplaceIds = computed(() => settingsStore.themePackages.map((theme) =>
  theme.id.startsWith('user:') ? theme.id.slice('user:'.length) : theme.id,
));
const activeMarketplaceId = computed(() => {
  const active = settingsStore.activeThemePackageId;
  return active?.startsWith('user:') ? active.slice('user:'.length) : active;
});

const themeJsonExample = JSON.stringify({
  schemaVersion: 2,
  type: 'theme',
  id: 'ocean-mist',
  name: 'Ocean Mist',
  version: '1.0.0',
  defaultMode: 'light',
  modes: {
    light: { colors: { bgApp: '#eef3ff', panelBase: '#ffffff', textPrimary: '#162033', textSecondary: '#49566d', accentBrand: '#2563eb' } },
    dark: { colors: { bgApp: '#0b1020', panelBase: '#101726', textPrimary: '#ecf2ff', textSecondary: '#b6c2d9', accentBrand: '#7cc7ff' } },
  },
}, null, 2);
const paletteJsonExample = JSON.stringify({
  schemaVersion: 2,
  type: 'palette',
  id: 'mint-contrast',
  name: 'Mint Contrast',
  version: '1.0.0',
  modes: {
    light: { textPrimary: '#10261b', textSecondary: '#365c47', accentBrand: '#16865a', accentBrandStrong: '#0f6945', stateSuccess: '#15803d', stateDanger: '#b91c1c' },
    dark: { textPrimary: '#edfff4', textSecondary: '#b9e3c8', accentBrand: '#55d991', accentBrandStrong: '#29b86f', stateSuccess: '#4ade80', stateDanger: '#fb7185' },
  },
}, null, 2);

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

const uiFontFamilyOptions = computed<SelectOption[]>(() => [
  { label: 'Manrope Variable', value: DEFAULT_UI_FONT_FAMILY },
  { label: copy.value.systemUiFont, value: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif" },
  { label: 'PingFang SC', value: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif" },
  { label: 'Microsoft YaHei', value: "'Microsoft YaHei', 'PingFang SC', sans-serif" },
  { label: 'Helvetica Neue', value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
]);

const autoSaveIntervalOptions = computed<SelectOption[]>(() => [
  { label: copy.value.seconds10, value: 10 },
  { label: copy.value.seconds30, value: 30 },
  { label: copy.value.minute1, value: 60 },
  { label: copy.value.minutes5, value: 300 },
]);
const markdownPreviewThemeOptions = computed<SelectOption[]>(() => [
  { label: copy.value.markdownPreviewThemeDocsClean, value: 'docs-clean' },
  { label: copy.value.markdownPreviewThemePaperSoft, value: 'paper-soft' },
  { label: copy.value.markdownPreviewThemeEditorialWarm, value: 'editorial-warm' },
  { label: copy.value.markdownPreviewThemeGraphiteNight, value: 'graphite-night' },
  { label: copy.value.markdownPreviewThemeMintGrove, value: 'mint-grove' },
  { label: copy.value.markdownPreviewThemeLavenderLetter, value: 'lavender-letter' },
  { label: copy.value.markdownPreviewThemeDeepOcean, value: 'deep-ocean' },
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

const renderReleaseNotes = async (markdown: string): Promise<void> => {
  const token = ++releaseNotesRenderToken;
  if (!markdown.trim()) {
    releaseNotesHtml.value = '';
    return;
  }

  try {
    // Keep marked/DOMPurify out of the settings entry chunk; the renderer is
    // only loaded after GitHub returns release notes.
    const { renderMarkdown } = await import('@/services/markdownRenderService');
    if (token !== releaseNotesRenderToken) {
      return;
    }
    releaseNotesHtml.value = renderMarkdown(markdown);
  } catch (error) {
    if (token !== releaseNotesRenderToken) {
      return;
    }
    releaseNotesHtml.value = '';
    console.warn('[Settings] 更新说明 Markdown 渲染失败：', error);
  }
};

/**
 * 更新说明中的 Markdown 链接必须在系统默认浏览器中打开，禁止 WebView 内导航。
 * @author Albert_Luo
 * @date 2026-10-07
 */
const handleReleaseNotesClick = (event: MouseEvent) => {
  const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(target instanceof HTMLAnchorElement)) {
    return;
  }

  const href = target.href?.trim() || target.getAttribute('href')?.trim() || '';
  if (!/^https?:\/\//i.test(href)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void appCommands.openExternalLink(href);
};

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

const themeUiFallbacks: Record<string, string> = {
  'sidebar.bg': '#111827', 'sidebar.text': '#cbd5e1', 'sidebar.activeBg': '#1e3a5f', 'sidebar.activeText': '#ffffff', 'sidebar.activeIndicator': '#38bdf8',
  'panel.bg': '#172033', 'panel.raisedBg': '#202c43', 'panel.border': '#334155',
  'tabs.activeBg': '#1e3a5f', 'tabs.activeText': '#ffffff', 'tabs.activeIndicator': '#38bdf8', 'tabs.hoverBg': '#243552',
};

const getThemeUiColorValue = (group: keyof Omit<ThemeUiOverrides, 'radius'>, key: string): string => {
  const mode = settingsStore.resolvedTheme;
  const override = settingsStore.customThemeUiOverrides?.[mode]?.[group] as Record<string, string> | undefined;
  const value = override?.[key];
  if (value) return value;
  if (typeof document !== 'undefined') {
    const css = getComputedStyle(document.documentElement).getPropertyValue(`--${group === 'sidebar' ? `sidebar-${key}` : group === 'panel' ? `panel-${key}` : `tab-${key}`}`).trim();
    if (/^#[0-9a-f]{6}$/i.test(css)) return css;
  }
  return themeUiFallbacks[`${group}.${key}`] ?? '#64748b';
};

const setThemeUiColor = (group: keyof Omit<ThemeUiOverrides, 'radius'>, key: string, color: string) => {
  settingsStore.setCustomThemeUiColor(group, key, color);
};

const setCornerRadius = (value: number) => settingsStore.setCornerRadius(value);

const handleViewThemeSource = async ({ item }: { item: ThemeMarketplaceCatalogItem }) => {
  sourceDialog.value = { open: true, loading: true, raw: '', error: '', item };
  await loadThemeSource();
};

const loadThemeSource = async () => {
  const item = sourceDialog.value.item;
  if (!item) return;
  sourceDialog.value.loading = true;
  sourceDialog.value.error = '';
  const result = await marketplaceService.fetchPackageSource(item);
  sourceDialog.value.loading = false;
  if (result.ok) sourceDialog.value.raw = result.value;
  else sourceDialog.value.error = result.error.message;
};

const closeSourceDialog = () => {
  sourceDialog.value.open = false;
};

const copyThemeSource = async () => {
  if (sourceDialog.value.raw && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(sourceDialog.value.raw);
  }
};

const setThemeSkin = (value: string | number | null) => {
  if (typeof value !== 'string') return;
  settingsStore.updateSettings({ themeSkin: value as ThemeSkinId });
};

const isThemeSwatchActive = (swatch: ThemeSwatch) =>
  swatch.skin === settingsStore.themeSkin && swatch.mode === settingsStore.theme;

const selectThemeSwatch = (swatch: ThemeSwatch) => {
  settingsStore.updateSettings({ theme: swatch.mode, themeSkin: swatch.skin });
};

const getCornerRadius = (key: CornerRadiusKey): number => {
  const radii = (settingsStore as typeof settingsStore & { cornerRadii?: Partial<Record<CornerRadiusKey, number>> }).cornerRadii;
  if (radii?.[key] !== undefined) return Number(radii[key]);
  if (key === 'base') return Number(settingsStore.cornerRadius);
  const base = Number(settingsStore.cornerRadius);
  if (key === 'badge') return 999;
  const factors: Record<Exclude<CornerRadiusKey, 'base' | 'badge'>, number> = {
    control: 0.85,
    card: 1.15,
    panel: 1.3,
    tab: 1,
    dialog: 1.5,
  };
  return Math.min(24, Math.max(0, Math.round(base * factors[key] * 2) / 2));
};

const formatRadius = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

const setCornerRadiusField = (key: CornerRadiusKey, value: number) => {
  const store = settingsStore as typeof settingsStore & {
    setCornerRadiusField?: (field: CornerRadiusKey, value: number) => void;
    setCornerRadiusDetail?: (field: CornerRadiusKey, value: number) => void;
  };
  if (key === 'base') {
    settingsStore.setCornerRadius(value);
  } else if (store.setCornerRadiusField) {
    store.setCornerRadiusField(key, value);
  } else if (store.setCornerRadiusDetail) {
    store.setCornerRadiusDetail(key, value);
  } else {
    settingsStore.setCornerRadius(value);
  }
};

const copyThemeExample = async (payload: string) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload);
    themePackageStatusText.value = copy.value.themeJsonCopied;
    return;
  }
  themePackageImportText.value = payload;
  themePackageStatusText.value = copy.value.themeJsonCopied;
};

const getCustomThemeColorValue = (key: CustomThemeColorKey): string => {
  const custom = settingsStore.customThemeColors[key];
  if (custom) {
    return custom;
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.getComputedStyle) {
    const themedDefault = window.getComputedStyle(document.documentElement)
      .getPropertyValue(CUSTOM_THEME_COLOR_VAR_MAP[key])
      .trim();
    if (/^#[0-9a-f]{6}$/i.test(themedDefault)) {
      return themedDefault;
    }
  }

  return CUSTOM_THEME_COLOR_FALLBACKS[key];
};

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

const pickThemePackageFileInBrowser = () =>
  new Promise<string | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => input.remove();
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        cleanup();
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => {
        cleanup();
        resolve(null);
      };
      reader.readAsText(file);
    });
    input.click();
  });

const importThemePackageFromText = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) {
    themePackageStatusText.value = copy.value.themePackageImportFailed('empty json');
    return false;
  }

  const result = settingsStore.importThemePackage(trimmed);
  if (result.success && result.theme) {
    themePackageImportText.value = '';
    themePackageStatusText.value = copy.value.themePackageImported(result.theme.name);
    return true;
  }

  themePackageStatusText.value = copy.value.themePackageImportFailed(result.error?.message ?? '');
  return false;
};

const handlePasteImportThemePackage = () => {
  importThemePackageFromText(themePackageImportText.value);
};

const handleImportThemePackage = async () => {
  if (isImportingThemePackage.value) {
    return;
  }

  isImportingThemePackage.value = true;
  try {
    let raw: string | null = null;
    if (isTauriApp()) {
      const selected = await openFileDialog({
        multiple: false,
        directory: false,
        filters: [{ name: 'Tau Theme', extensions: ['json'] }],
      });
      const path = typeof selected === 'string' ? selected : null;
      if (!path) {
        return;
      }
      raw = await readTextFile(path);
    } else {
      raw = await pickThemePackageFileInBrowser();
    }

    if (raw === null) {
      return;
    }
    importThemePackageFromText(raw);
  } catch (error) {
    themePackageStatusText.value = copy.value.themePackageImportFailed(
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    isImportingThemePackage.value = false;
  }
};

const downloadThemePackage = (payload: string, fileName: string) => {
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const handleExportThemePackage = async (packageId?: string) => {
  const payload = settingsStore.exportThemePackage(packageId);
  if (!payload) {
    themePackageStatusText.value = copy.value.themePackageImportFailed('no theme payload');
    return;
  }

  const id = packageId || settingsStore.activeThemePackageId || `skin-${settingsStore.themeSkin}`;
  const fileName = `${id.replace(/[^a-zA-Z0-9._-]/g, '-')}.tau-theme.json`;
  try {
    if (isTauriApp()) {
      const target = await saveFileDialog({
        defaultPath: fileName,
        filters: [{ name: 'Tau Theme', extensions: ['json'] }],
      });
      if (!target) {
        return;
      }
      await writeTextFile(target, payload);
    } else {
      downloadThemePackage(payload, fileName);
    }
    themePackageStatusText.value = copy.value.themePackageExported;
  } catch (error) {
    themePackageStatusText.value = copy.value.themePackageImportFailed(
      error instanceof Error ? error.message : String(error),
    );
  }
};

const handleApplyThemePackage = (packageId: string | null) => {
  const applied = settingsStore.applyThemePackage(packageId);
  if (packageId && !applied) {
    themePackageStatusText.value = copy.value.themePackageImportFailed(packageId);
    return;
  }
  themePackageStatusText.value = applied
    ? copy.value.themePackageImported(applied.name)
    : copy.value.themePackageReverted;
};

const handleMarketplaceInstall = (payload: { item: { id: string; name: string }; package: ThemeMarketplacePackage }) => {
  const result = settingsStore.importThemePackage(JSON.stringify(payload.package));
  themePackageStatusText.value = result.success && result.theme
    ? copy.value.themePackageImported(result.theme.name)
    : copy.value.themePackageImportFailed(result.error?.message ?? payload.item.name);
};

const handleMarketplaceApply = (packageId: string) => {
  handleApplyThemePackage(packageId.startsWith('user:') ? packageId : `user:${packageId}`);
};

const handleDeleteThemePackage = (packageId: string) => {
  const theme = settingsStore.themePackages.find((item) => item.id === packageId);
  if (!theme) {
    return;
  }
  const confirmed = typeof window === 'undefined'
    ? true
    : window.confirm(`${copy.value.themePackageDelete}: ${theme.name}`);
  if (!confirmed) {
    return;
  }
  if (settingsStore.removeThemePackage(packageId)) {
    themePackageStatusText.value = copy.value.themePackageDeleted;
  }
};

/** 设置面板展示命令标题；非内置命令回退到命令 id。 */
const keybindingCommandTitle = (commandId: string): string => {
  const isEnglish = settingsStore.uiLanguage === 'en-US';
  const extraTitles: Record<string, string> = {
    'workspace.search': isEnglish ? 'Search Workspace' : '工作区搜索',
    'workspace.quickOpen': isEnglish ? 'Quick Open' : '快速打开',
    'editor.zoomIn': isEnglish ? 'Zoom In' : '放大字号',
    'editor.zoomOut': isEnglish ? 'Zoom Out' : '缩小字号',
    'editor.zoomReset': isEnglish ? 'Reset Zoom' : '重置字号',
  };
  if (extraTitles[commandId]) {
    return extraTitles[commandId];
  }
  const text = getCommandText(settingsStore.uiLanguage, commandId as CommandId) as unknown as
    | { title?: string }
    | undefined;
  return text?.title ?? commandId;
};

const keybindingRows = computed(() =>
  resolveKeybindings(DEFAULT_KEYBINDINGS, settingsStore.keybindingOverrides).map((item) => ({
    ...item,
    title: keybindingCommandTitle(item.commandId),
    label: formatKeybinding(item.keys),
  })),
);

const handleKeybindingRecorderKeydown = (event: KeyboardEvent) => {
  if (!recordingCommandId.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();

  const commandId = recordingCommandId.value;
  if (event.key === 'Escape') {
    recordingCommandId.value = null;
    keybindingStatusText.value = copy.value.keybindingCancelled;
    return;
  }

  const keys = keybindingFromEvent(event);
  if (!keys) {
    return;
  }

  const conflicts = findConflictsForKey(
    DEFAULT_KEYBINDINGS,
    settingsStore.keybindingOverrides,
    commandId,
    keys,
  );
  if (conflicts.length > 0) {
    const labels = conflicts.map((id) => keybindingCommandTitle(id)).join('、');
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`${copy.value.keybindingConflict}: ${labels}`);
    if (!confirmed) {
      recordingCommandId.value = null;
      keybindingStatusText.value = copy.value.keybindingCancelled;
      return;
    }
    conflicts.forEach((id) => settingsStore.setKeybindingOverride(id, ''));
  }

  settingsStore.setKeybindingOverride(commandId, keys);
  keybindingStatusText.value = `${keybindingCommandTitle(commandId)}: ${formatKeybinding(keys)}`;
  recordingCommandId.value = null;
};

const toggleKeybindingRecording = (commandId: string) => {
  recordingCommandId.value = recordingCommandId.value === commandId ? null : commandId;
  keybindingStatusText.value = '';
};

const handleResetKeybinding = (commandId: string) => {
  settingsStore.resetKeybinding(commandId);
  keybindingStatusText.value = '';
};

const handleResetAllKeybindings = () => {
  settingsStore.resetAllKeybindings();
  keybindingStatusText.value = '';
};

watch(recordingCommandId, (commandId) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (commandId) {
    window.addEventListener('keydown', handleKeybindingRecorderKeydown, true);
  } else {
    window.removeEventListener('keydown', handleKeybindingRecorderKeydown, true);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeybindingRecorderKeydown, true);
  }
});

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

const increaseUiFontSize = () => {
  settingsStore.adjustUiFontSize(1);
};

const decreaseUiFontSize = () => {
  settingsStore.adjustUiFontSize(-1);
};

const resetUiFontSize = () => {
  settingsStore.resetUiFontSize();
};

const setUiFontFamily = (value: string | number | null) => {
  if (typeof value !== 'string') return;
  settingsStore.updateSettings({ uiFontFamily: value });
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

const setMarkdownPreviewTheme = (value: string | number | null) => {
  if (typeof value !== 'string') return;
  settingsStore.updateSettings({ markdownPreviewTheme: value as MarkdownPreviewTheme });
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

const loadFileAssociations = async () => {
  associationLoading.value = true;
  associationStatus.value = { text: '', error: false };
  try {
    const result = await settingsCommands.getFileAssociations();
    fileAssociations.value = result.items;
    associationsLoaded.value = true;
    if (!result.supported) {
      associationStatus.value = { text: copy.value.fileAssociationsPlatformHint, error: false };
    }
  } catch (error) {
    associationStatus.value = {
      text: error instanceof Error ? error.message : String(error),
      error: true,
    };
  } finally {
    associationLoading.value = false;
  }
};

const toggleFileAssociation = async (item: FileAssociationState, event: Event) => {
  if (!isWindows.value) {
    return;
  }
  const checked = (event.target as HTMLInputElement).checked;
  try {
    await settingsCommands.setFileAssociation(item.ext, checked);
    item.registered = checked;
    associationStatus.value = { text: '', error: false };
  } catch (error) {
    item.registered = !checked;
    associationStatus.value = {
      text: error instanceof Error ? error.message : String(error),
      error: true,
    };
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
    void renderReleaseNotes(result.releaseNotes || '');
    emit('update-availability', {
      available: result.hasUpdate,
      canInstall: Boolean(result.hasUpdate && result.selectedAsset),
      latestVersion: result.latestVersion,
      releaseName: result.releaseName,
      releaseNotes: result.releaseNotes,
      releaseUrl: result.releaseUrl,
    });

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

const installUpdate = async (): Promise<{ success: boolean; error?: string }> => {
  if (!selectedAsset.value || isInstallingUpdate.value) {
    return { success: false };
  }

  isInstallingUpdate.value = true;
  updateError.value = '';
  installMessage.value = '';
  updateStatus.value = 'installing';

  try {
    const result = await settingsCommands.downloadAndInstallUpdate(
      selectedAsset.value.browserDownloadUrl,
      selectedAsset.value.name,
      selectedAsset.value.size,
    );
    installMessage.value = result.message || copy.value.statusInstallTriggered;
    updateStatus.value = 'installTriggered';
    return { success: true };
  } catch (error) {
    updateStatus.value = 'error';
    updateError.value = error instanceof Error ? error.message : String(error);
    return { success: false, error: updateError.value };
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

watch(
  [() => activeCategoryValue.value, isWindows],
  ([category, win]) => {
    if (category === 'fileAssociations' && win && !associationsLoaded.value && !associationLoading.value) {
      loadFileAssociations();
    }
  },
);

onMounted(async () => {
  await loadVersionInfo();
  void lspServersStore.refresh();
  if (isWorkspaceMode.value) {
    await checkForUpdate(true);
  }
});

defineExpose({
  installUpdate: () => installUpdate(),
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
  background: var(--bg-app, var(--panel-base, #101726));
  transition: background-color 260ms ease, color 260ms ease;
}

.settings-panel-theme--light {
  color-scheme: light;
}

.settings-panel-theme--dark {
  color-scheme: dark;
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
  font-size: var(--font-size-ui-lg, 15px);
  font-weight: 700;
}

.settings-subtitle {
  margin: 0;
  font-size: var(--font-size-ui-sm, 12px);
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
  border-radius: var(--radius-sm);
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
  border-radius: var(--radius-sm);
  background: var(--surface-muted, rgba(15, 23, 42, 0.4));
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

.settings-detail,
.settings-drawer-content {
  background: var(--bg-app, var(--panel-base, #101726));
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 14px;
  border-right: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--surface-muted, rgba(15, 23, 42, 0.2));
}

.settings-nav-item {
  height: 38px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
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
  border-color: color-mix(in srgb, var(--accent-brand, #38bdf8) 45%, transparent);
  background: var(--surface-active, rgba(14, 165, 233, 0.2));
  color: var(--text-primary, #e0f2fe);
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
  font-size: var(--font-size-ui-md, 13px);
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
  border-radius: var(--radius-md);
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: var(--surface-muted, rgba(15, 23, 42, 0.35));
}

.settings-overview-item span {
  font-size: var(--font-size-ui-sm, 12px);
  color: var(--text-muted, #94a3b8);
}

.settings-overview-item strong {
  font-size: var(--font-size-ui-md, 13px);
  line-height: 1.4;
  color: var(--text-primary, #f8fafc);
  word-break: break-word;
}

.settings-section {
  margin: 0;
  padding: 16px;
  border-radius: var(--radius-md);
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
  font-size: var(--font-size-ui-sm, 12px);
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
  font-size: var(--font-size-ui-md, 13px);
}

.settings-item-hint {
  margin: 8px 0 0;
  color: var(--text-muted, #94a3b8);
  font-size: var(--font-size-ui-sm, 12px);
  line-height: 1.45;
}

.font-preview,
.theme-btn,
.font-size-control,
.settings-checkbox,
.settings-update-btn {
  border-radius: var(--radius-sm);
}

.font-size-control,
.settings-checkbox {
  border-radius: var(--radius-md);
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

.theme-swatch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.theme-swatch {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  border-radius: var(--radius-sm);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  color: var(--text-primary, #f8fafc);
  text-align: left;
  cursor: pointer;
  transition: border-color 180ms ease, transform 180ms ease, background-color 180ms ease;
}

.theme-swatch:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong, rgba(148, 163, 184, 0.3));
}

.theme-swatch.active {
  border-color: var(--accent-brand, #38bdf8);
  box-shadow: inset 0 0 0 1px var(--accent-brand, #38bdf8);
}

.theme-swatch-colors {
  display: flex;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  overflow: hidden;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  border-radius: 8px;
}

.theme-swatch-colors i {
  flex: 1;
}

.theme-swatch-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.theme-swatch-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-ui-sm, 12px);
}

.theme-swatch-copy small {
  color: var(--text-muted, #94a3b8);
  font-size: var(--font-size-ui-xs, 11px);
}

.theme-style-fallback {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  color: var(--text-muted, #94a3b8);
  font-size: var(--font-size-ui-sm, 12px);
}

.custom-theme-settings {
  border-top: 1px dashed var(--border-soft, rgba(148, 163, 184, 0.18));
  padding-top: 12px;
}

.custom-theme-desc {
  margin: 0 0 10px;
  color: var(--text-muted, #94a3b8);
  font-size: var(--font-size-ui-sm, 12px);
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
  border-radius: var(--radius-sm);
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
  font-size: var(--font-size-ui-sm, 12px);
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
  font-size: var(--font-size-ui-xs, 11px);
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
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  color: var(--text-primary, #f8fafc);
  resize: vertical;
  font-size: var(--font-size-ui-sm, 12px);
  line-height: 1.5;
}

.custom-theme-status {
  margin: 8px 0 0;
  font-size: var(--font-size-ui-sm, 12px);
  color: var(--text-secondary, #cbd5e1);
}

.theme-json-examples {
  margin-top: 14px;
  border-top: 1px dashed var(--border-soft, rgba(148, 163, 184, 0.18));
  padding-top: 12px;
}

.theme-json-example {
  margin-top: 8px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  border-radius: var(--radius-sm);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
}

.theme-json-example summary {
  padding: 9px 10px;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  font-size: var(--font-size-ui-sm, 12px);
}

.theme-json-example pre {
  max-height: 240px;
  margin: 0;
  overflow: auto;
  border-top: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  padding: 10px;
  color: var(--text-primary, #f8fafc);
  font-size: var(--font-size-ui-xs, 11px);
  line-height: 1.5;
  white-space: pre-wrap;
}

.theme-json-example .settings-action-btn {
  margin: 0 10px 10px;
}

.theme-package-settings {
  margin-top: 14px;
  border-top: 1px dashed var(--border-soft, rgba(148, 163, 184, 0.18));
  padding-top: 12px;
}

.theme-package-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-package-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  border-radius: var(--radius-sm);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
}

.theme-package-item.active {
  border-color: var(--accent-brand, #38bdf8);
  box-shadow: inset 0 0 0 1px var(--accent-brand, #38bdf8);
}

.theme-package-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.theme-package-name {
  font-size: var(--font-size-ui-md, 13px);
  color: var(--text-primary, #f8fafc);
}

.theme-package-meta {
  font-size: var(--font-size-ui-xs, 11px);
  color: var(--text-muted, #94a3b8);
  overflow-wrap: anywhere;
}

.theme-package-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.provider-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: var(--font-size-ui-sm, 12px);
  color: var(--text-secondary, #cbd5e1);
}

.settings-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lsp-server-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.lsp-server-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel-raised, #182235) 64%, transparent);
}

.lsp-server-main,
.lsp-server-state {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.lsp-server-name,
.lsp-server-command,
.lsp-server-state small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lsp-server-command,
.lsp-server-state small {
  color: var(--text-secondary, #8f9bb3);
  font-size: 11px;
}

.lsp-server-state {
  align-items: flex-end;
  text-align: right;
}

.lsp-server-state.is-ready strong {
  color: var(--state-success, #5bd19a);
}

.lsp-server-state.is-missing strong {
  color: var(--state-danger, #f28b8b);
}

.lsp-server-provision-btn {
  margin-top: 4px;
  padding: 3px 7px;
  font-size: 11px;
}

.provider-error {
  color: #fca5a5;
}

.theme-package-empty {
  margin: 0;
  font-size: var(--font-size-ui-sm, 12px);
  color: var(--text-muted, #94a3b8);
}

.theme-source-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(2, 6, 23, 0.62);
  backdrop-filter: blur(5px);
}

.theme-source-dialog {
  display: flex;
  width: min(860px, 100%);
  max-height: min(760px, 90vh);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--panel-border, rgba(148, 163, 184, 0.3));
  border-radius: var(--radius-dialog, var(--radius-ui-lg, 8px));
  background: var(--panel-raised, #202c43);
  color: var(--text-primary, #f8fafc);
  box-shadow: 0 24px 70px rgba(2, 6, 23, 0.45);
}

.theme-source-header,
.theme-source-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--panel-border, rgba(148, 163, 184, 0.2));
}

.theme-source-header h4,
.theme-source-header p { margin: 0; }
.theme-source-header p { margin-top: 3px; color: var(--text-muted, #94a3b8); font-size: 12px; }
.theme-source-pre { flex: 1; min-height: 220px; margin: 0; overflow: auto; padding: 16px; background: rgba(2, 6, 23, 0.25); font: 12px/1.6 var(--font-family-mono, monospace); white-space: pre-wrap; }
.theme-source-state { padding: 32px 16px; text-align: center; color: var(--text-secondary, #cbd5e1); }
.theme-source-error { color: #fca5a5; }
.theme-source-actions { justify-content: flex-end; border-top: 1px solid var(--panel-border, rgba(148, 163, 184, 0.2)); border-bottom: 0; }
.radius-slider-row { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.radius-slider { flex: 1; accent-color: var(--accent-brand, #38bdf8); }
.radius-slider-row output { min-width: 42px; color: var(--text-secondary, #cbd5e1); font-size: 12px; }
.radius-advanced { margin-top: 14px; border-top: 1px solid var(--border-soft); padding-top: 12px; }
.radius-advanced summary { cursor: pointer; color: var(--text-secondary); font-size: 12px; user-select: none; }
.radius-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin-top: 12px; }
.radius-detail-item { display: grid; grid-template-columns: minmax(48px, 1fr) minmax(90px, 1.6fr) auto; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 11px; }
.radius-detail-item input { width: 100%; accent-color: var(--accent-brand); }
.radius-detail-item output { min-width: 34px; color: var(--text-muted); text-align: right; }

.settings-action-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.settings-action-btn.danger {
  border-color: rgba(248, 113, 113, 0.42);
  color: #fca5a5;
}

.keybinding-settings {
  margin-top: 14px;
  border-top: 1px dashed var(--border-soft, rgba(148, 163, 184, 0.18));
  padding-top: 12px;
}

.keybinding-list {
  display: flex;
  max-height: 320px;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  padding-right: 2px;
}

.keybinding-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  border-radius: var(--radius-sm);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
}

.keybinding-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.keybinding-title {
  overflow: hidden;
  font-size: var(--font-size-ui-sm, 12px);
  color: var(--text-primary, #f8fafc);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keybinding-meta {
  overflow: hidden;
  font-size: var(--font-size-ui-xs, 10px);
  color: var(--text-muted, #94a3b8);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keybinding-recorder {
  min-width: 96px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: var(--radius-sm);
  background: var(--surface-muted, rgba(15, 23, 42, 0.4));
  color: var(--text-secondary, #cbd5e1);
  font-size: var(--font-size-ui-sm, 12px);
  cursor: pointer;
}

.keybinding-recorder.unbound {
  color: var(--text-muted, #94a3b8);
}

.keybinding-recorder.recording {
  border-color: var(--accent-brand, #38bdf8);
  color: var(--accent-brand, #38bdf8);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16);
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
  border-radius: var(--radius-sm);
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
  border-radius: var(--radius-md);
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.35);
}

.settings-update-item span {
  color: var(--text-muted, #94a3b8);
  font-size: var(--font-size-ui-sm, 12px);
}

.settings-update-item strong {
  font-size: var(--font-size-ui-md, 13px);
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
  font-size: var(--font-size-ui-md, 13px);
  line-height: 1.6;
}

.settings-update-status {
  color: var(--text-primary, #f8fafc);
}

.settings-update-message {
  color: #34d399;
}

.settings-update-notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-secondary, #cbd5e1);
}

.settings-update-notes-label {
  display: block;
  color: var(--text-muted, #94a3b8);
}

.settings-update-notes-content,
.settings-update-notes-fallback {
  display: block;
  min-width: 0;
  word-break: break-word;
}

.settings-update-notes-content :deep(*) {
  max-width: 100%;
}

.settings-update-notes-content :deep(:first-child) {
  margin-top: 0;
}

.settings-update-notes-content :deep(:last-child) {
  margin-bottom: 0;
}

.settings-update-notes-content :deep(h1),
.settings-update-notes-content :deep(h2),
.settings-update-notes-content :deep(h3),
.settings-update-notes-content :deep(h4),
.settings-update-notes-content :deep(h5),
.settings-update-notes-content :deep(h6) {
  margin: 8px 0 4px;
  color: var(--text-primary, #f8fafc);
  font-size: 1em;
  line-height: 1.45;
}

.settings-update-notes-content :deep(p),
.settings-update-notes-content :deep(ul),
.settings-update-notes-content :deep(ol),
.settings-update-notes-content :deep(pre),
.settings-update-notes-content :deep(blockquote) {
  margin: 4px 0;
}

.settings-update-notes-content :deep(ul),
.settings-update-notes-content :deep(ol) {
  padding-left: 20px;
}

.settings-update-notes-content :deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--surface-muted, rgba(148, 163, 184, 0.14));
  font-size: 0.92em;
}

.settings-update-notes-content :deep(a) {
  color: var(--accent-primary, #93c5fd);
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
  background: var(--surface-muted, rgba(15, 23, 42, 0.3));
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
  border-radius: var(--radius-md);
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
  font-size: var(--font-size-ui-md, 13px);
  color: var(--text-primary, #f8fafc);
}

.settings-author-donation-desc {
  margin: 0 0 10px;
  font-size: var(--font-size-ui-sm, 12px);
}

.settings-author-qr-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.settings-author-qr-card {
  margin: 0;
  padding: 8px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.03);
}

.settings-author-qr-card img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-sm);
}

.settings-author-qr-card figcaption {
  margin-top: 6px;
  font-size: var(--font-size-ui-sm, 12px);
  color: var(--text-secondary, #cbd5e1);
  text-align: center;
}

.settings-author-donation-tip {
  margin: 10px 0 0 !important;
  font-size: var(--font-size-ui-sm, 12px);
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

.association-group {
  margin-bottom: 14px;
}

.association-group-title {
  margin-bottom: 6px;
  font-size: var(--font-size-ui-sm, 12px);
  font-weight: 600;
  color: var(--text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.association-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.association-item {
  cursor: pointer;
}

.association-item input[type='checkbox'] {
  accent-color: var(--accent-brand, #38bdf8);
  cursor: pointer;
}

.association-item .checkbox-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.association-item code {
  font-size: var(--font-size-ui-sm, 12px);
}

.association-script-badge {
  font-size: var(--font-size-ui-xs, 10px);
  line-height: 1;
  padding: 3px 6px;
  border-radius: var(--radius-xs);
  background: rgba(250, 204, 21, 0.16);
  color: #fbbf24;
  white-space: nowrap;
}

.association-state {
  margin-left: auto;
  font-size: var(--font-size-ui-xs, 11px);
  color: var(--text-muted, #94a3b8);
}

.settings-item-hint.error {
  color: #f87171;
}


.settings-close:focus-visible,
.settings-action-btn:focus-visible,
.settings-nav-item:focus-visible,
.theme-btn:focus-visible,
.font-size-btn:focus-visible,
.font-size-reset:focus-visible {
  outline: 1px solid var(--accent-blue-strong, #4dabff);
  outline-offset: -2px;
}

/* Stitch / Nocturne Precision workspace treatment. Keep the existing controls
 * and selectors intact while giving the full settings view a quieter IDE shell. */
.settings-panel--workspace {
  /* Workspace surfaces must follow the active theme instead of maintaining a
   * second hard-coded dark palette. This prevents the detail area exposing a
   * light/white app background below dark preference cards. */
  --settings-bg: var(--bg-app, #101216);
  --settings-surface-lowest: color-mix(in srgb, var(--panel-base, #171b22) 86%, var(--bg-app, #101216));
  --settings-surface-low: color-mix(in srgb, var(--panel-base, #171b22) 94%, var(--bg-app, #101216));
  --settings-surface: var(--panel-base, #171b22);
  --settings-surface-high: color-mix(in srgb, var(--panel-elevated, #202631) 92%, var(--text-primary, #ecf2ff));
  --settings-surface-highest: color-mix(in srgb, var(--panel-elevated, #202631) 80%, var(--text-primary, #ecf2ff));
  --settings-text: var(--text-primary, #e3e1ed);
  --settings-text-muted: var(--text-secondary, #bdc8d1);
  --settings-outline: color-mix(in srgb, var(--text-secondary, #87929a) 78%, transparent);
  --settings-border: var(--border-soft, rgba(135, 146, 154, 0.2));
  --settings-primary: var(--accent-brand, #8ed5ff);
  --settings-primary-container: var(--accent-brand-strong, #38bdf8);
  --settings-success: var(--state-success, #56e5a9);
  --settings-header-bg: color-mix(in srgb, var(--panel-base, #171b22) 90%, var(--bg-app, #101216));
  --settings-nav-bg: color-mix(in srgb, var(--panel-base, #171b22) 88%, var(--bg-app, #101216));
  --settings-nav-hover: color-mix(in srgb, var(--panel-elevated, #202631) 76%, var(--accent-brand, #8ed5ff) 24%);
  --settings-nav-active: color-mix(in srgb, var(--accent-brand, #8ed5ff) 14%, var(--panel-base, #171b22));
  --settings-theme-bg: color-mix(in srgb, var(--panel-base, #171b22) 92%, var(--bg-app, #101216));
  --settings-shadow-color: color-mix(in srgb, var(--bg-app, #101216) 32%, transparent);
  --settings-border-subtle: color-mix(in srgb, var(--border-soft, rgba(135, 146, 154, 0.2)) 86%, transparent);
  background: var(--settings-bg);
  color: var(--settings-text);
  font-family: var(--font-family-ui, 'Manrope Variable', 'Manrope', system-ui, sans-serif);
}

.settings-panel--workspace.settings-panel-theme--light {
  --settings-bg: var(--bg-app, #eef3ff);
  --settings-surface-lowest: color-mix(in srgb, var(--settings-bg) 97%, var(--settings-text) 3%);
  --settings-surface-low: color-mix(in srgb, var(--settings-bg) 94%, var(--settings-text) 6%);
  --settings-surface: color-mix(in srgb, var(--settings-bg) 90%, var(--settings-text) 10%);
  --settings-surface-high: color-mix(in srgb, var(--settings-bg) 86%, var(--settings-text) 14%);
  --settings-surface-highest: color-mix(in srgb, var(--settings-bg) 82%, var(--settings-text) 18%);
  --settings-header-bg: var(--settings-bg);
  --settings-nav-bg: var(--settings-surface-low);
  --settings-nav-hover: color-mix(in srgb, var(--settings-bg) 90%, var(--settings-primary) 10%);
  --settings-nav-active: color-mix(in srgb, var(--settings-bg) 86%, var(--settings-primary) 14%);
  --settings-theme-bg: var(--settings-surface-low);
  --settings-shadow-color: color-mix(in srgb, var(--settings-bg) 12%, transparent);
}

.settings-panel--workspace .settings-header {
  min-height: 68px;
  padding: 16px 24px 14px 28px;
  border-bottom-color: var(--settings-border-subtle);
  background: var(--settings-header-bg);
}

.settings-panel--workspace .settings-workspace {
  grid-template-rows: minmax(0, 1fr);
}

.settings-panel--workspace .settings-nav {
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  align-items: stretch;
  justify-content: flex-start;
}

.settings-panel--workspace .settings-nav-item {
  flex: 0 0 auto;
}

.settings-panel--workspace .settings-header-main {
  gap: 6px;
}

.settings-title-row {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 28px;
}

.settings-title-orb {
  width: 10px;
  height: 10px;
  flex: 0 0 10px;
  border-radius: 999px;
  background: var(--settings-primary-container);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.72);
}

.settings-panel--workspace .settings-title {
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--settings-text);
}

.settings-title-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.1);
  color: var(--settings-primary);
  font-family: var(--font-family-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  letter-spacing: 0.02em;
}

.settings-save-state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid var(--settings-border-subtle);
  border-radius: 9px;
  background: var(--settings-surface);
  color: var(--settings-text-muted);
  font-family: var(--font-family-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
}

.settings-save-state-icon {
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  border-radius: 999px;
  background: rgba(86, 229, 169, 0.14);
  color: var(--settings-success);
  font-size: 11px;
  font-weight: 700;
}

.settings-panel--workspace .settings-close {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  color: var(--settings-text-muted);
}

.settings-panel--workspace .settings-close:hover {
  border-color: rgba(135, 146, 154, 0.18);
  background: var(--settings-surface-highest);
  color: var(--settings-text);
}

.settings-panel--workspace .settings-workspace {
  grid-template-columns: minmax(228px, 290px) minmax(0, 1fr);
  gap: 14px;
  padding: 16px 18px 22px;
  background: var(--settings-bg);
}

.settings-panel--workspace .settings-nav {
  gap: 5px;
  padding: 12px 9px;
  border: 1px solid var(--settings-border-subtle);
  border-radius: 14px;
  background: var(--settings-nav-bg);
  box-shadow: 0 16px 34px var(--settings-shadow-color);
  backdrop-filter: blur(12px);
}

.settings-nav-heading {
  padding: 3px 10px 10px;
  color: var(--settings-outline);
  font-family: var(--font-family-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.settings-panel--workspace .settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 42px;
  height: auto;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--settings-text-muted);
  font-size: 14px;
  font-weight: 520;
}

.settings-panel--workspace .settings-nav-item:hover {
  transform: none;
  background: var(--settings-nav-hover);
  color: var(--settings-text);
}

.settings-panel--workspace .settings-nav-item.active {
  border-color: color-mix(in srgb, var(--settings-primary) 22%, transparent);
  background: var(--settings-nav-active);
  color: var(--settings-primary);
  box-shadow: inset 2px 0 0 var(--settings-primary-container);
}

.settings-nav-icon {
  position: relative;
  display: inline-grid;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  place-items: center;
  color: currentColor;
}

.settings-nav-count,
.settings-nav-status {
  margin-left: auto;
}

.settings-nav-count {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(86, 229, 169, 0.08);
  color: var(--settings-success);
  font-family: var(--font-family-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
}

.settings-nav-status {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--settings-success);
  box-shadow: 0 0 8px rgba(86, 229, 169, 0.75);
}

.settings-panel--workspace .settings-detail {
  padding: 0;
  background: var(--settings-bg);
}

.settings-panel--workspace .settings-overview {
  gap: 10px;
  margin-bottom: 14px;
}

.settings-panel--workspace .settings-overview-item {
  position: relative;
  min-height: 76px;
  justify-content: space-between;
  overflow: hidden;
  padding: 13px 14px;
  border: 1px solid var(--settings-border-subtle);
  border-radius: 14px;
  background: var(--settings-surface-low);
  box-shadow: 0 9px 24px var(--settings-shadow-color);
}

.settings-panel--workspace .settings-overview-item::after {
  position: absolute;
  top: -26px;
  right: -22px;
  width: 74px;
  height: 74px;
  border-radius: 999px;
  background: rgba(142, 213, 255, 0.1);
  content: '';
  filter: blur(14px);
  pointer-events: none;
}

.settings-panel--workspace .settings-overview-item:nth-child(2)::after { background: rgba(86, 229, 169, 0.1); }
.settings-panel--workspace .settings-overview-item:nth-child(3)::after { background: rgba(192, 193, 255, 0.1); }

.settings-panel--workspace .settings-overview-item span {
  color: var(--settings-outline);
  font-family: var(--font-family-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
}

.settings-panel--workspace .settings-overview-item strong {
  color: var(--settings-text);
  font-size: 15px;
  font-weight: 650;
}

.settings-panel--workspace .settings-overview-item:first-child strong { color: var(--settings-primary); }

.settings-panel--workspace .settings-section {
  margin-bottom: 14px;
  padding: 20px 21px;
  border: 1px solid var(--settings-border-subtle);
  border-radius: 14px;
  background: var(--settings-surface-low);
  box-shadow: 0 12px 28px var(--settings-shadow-color);
}

.settings-panel--workspace .settings-section:hover {
  border-color: color-mix(in srgb, var(--settings-outline) 38%, transparent);
  box-shadow: 0 14px 32px var(--settings-shadow-color);
  transform: none;
}

.settings-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.settings-section-heading-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-section-icon {
  display: inline-grid;
  width: 21px;
  height: 21px;
  place-items: center;
  color: var(--settings-primary);
  font-size: 22px;
  line-height: 1;
}

.settings-panel--workspace .settings-section-title {
  margin: 0;
  color: var(--settings-text);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.015em;
  text-transform: none;
}

.settings-section-meta {
  padding-top: 3px;
  color: var(--settings-outline);
  font-family: var(--font-family-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
}

.settings-appearance-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.settings-panel--workspace .settings-item {
  margin-bottom: 12px;
}

.settings-panel--workspace .settings-label {
  margin-bottom: 7px;
  color: var(--settings-text-muted);
  font-size: 13px;
  font-weight: 520;
}

.settings-label-with-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.settings-label-with-meta small {
  color: var(--settings-outline);
  font-family: var(--font-family-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  font-weight: 500;
}

.settings-label-with-meta .settings-label-positive {
  color: var(--settings-success);
}

.settings-panel--workspace :deep(.n-base-selection) {
  min-height: 46px;
  border-radius: 9px;
  background: var(--settings-surface);
  border-color: var(--settings-border-subtle);
}

.settings-panel--workspace :deep(.n-base-selection-label) {
  align-self: stretch;
  min-height: inherit;
  box-sizing: border-box;
  color: var(--settings-text);
  font-size: 13px;
}

.settings-panel--workspace :deep(.n-base-selection:hover) {
  border-color: rgba(142, 213, 255, 0.44);
}

.settings-panel--workspace .settings-font-size-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 2px;
  margin-bottom: 0;
  padding: 14px;
  border-radius: 10px;
  background: var(--settings-surface);
}

.settings-panel--workspace .settings-font-size-item .settings-label {
  margin: 0;
}

.settings-panel--workspace .font-size-control {
  margin-left: auto;
  padding: 4px;
  border: 0;
  border-radius: 9px;
  background: var(--settings-surface-high);
}

.settings-panel--workspace .font-size-btn,
.settings-panel--workspace .font-size-reset {
  height: 31px;
  min-width: 31px;
  padding: 0 9px;
  border: 0;
  border-radius: 7px;
  color: var(--settings-text-muted);
}

.settings-panel--workspace .font-size-btn:hover,
.settings-panel--workspace .font-size-reset:hover {
  background: var(--settings-surface-highest);
  color: var(--settings-text);
}

.settings-panel--workspace .font-size-value {
  min-width: 52px;
  color: var(--settings-primary);
  font-family: var(--font-family-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
}

.settings-panel--workspace .settings-theme-block {
  margin-top: 14px;
  padding: 17px;
  border: 1px solid var(--settings-border-subtle);
  border-radius: 14px;
  background: var(--settings-theme-bg);
}

.settings-theme-block-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.settings-theme-block-heading .settings-label {
  margin-bottom: 0;
}

.settings-theme-block-heading .settings-item-hint {
  margin-top: 4px;
}

.settings-active-theme {
  max-width: 200px;
  padding: 6px 9px;
  border-radius: 6px;
  background: rgba(56, 189, 248, 0.1);
  color: var(--settings-primary);
  font-family: var(--font-family-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-panel--workspace .settings-theme-mode-item,
.settings-panel--workspace .settings-theme-style-item,
.settings-panel--workspace .settings-editor-theme-item {
  margin-bottom: 13px;
}

.settings-panel--workspace .settings-theme-mode-item .theme-selector {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  margin-top: 13px;
  padding: 4px;
  border-radius: 10px;
  background: var(--settings-surface);
}

.settings-panel--workspace .theme-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 46px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--settings-text-muted);
  font-size: 13px;
}

.settings-panel--workspace .theme-btn:hover {
  background: var(--settings-nav-hover);
  color: var(--settings-text);
  transform: none;
}

.settings-panel--workspace .theme-btn.active {
  background: linear-gradient(135deg, var(--settings-primary), var(--settings-primary-container));
  color: #00354a;
  box-shadow: 0 2px 14px rgba(56, 189, 248, 0.3);
}

.theme-btn-icon {
  font-size: 16px;
  line-height: 1;
}

.settings-panel--workspace .settings-theme-style-item .settings-label {
  margin-bottom: 10px;
}

.settings-panel--workspace .theme-swatch-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.settings-panel--workspace .theme-swatch {
  min-height: 68px;
  padding: 10px 11px;
  border-color: var(--settings-border-subtle);
  border-radius: 11px;
  background: var(--settings-surface);
}

.settings-panel--workspace .theme-swatch:hover {
  border-color: rgba(135, 146, 154, 0.38);
  background: var(--settings-surface-high);
  transform: none;
}

.settings-panel--workspace .theme-swatch.active {
  border-color: rgba(56, 189, 248, 0.75);
  background: var(--settings-surface-highest);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.22);
}

.settings-panel--workspace .theme-swatch-colors {
  width: 38px;
  height: 38px;
  flex-basis: 38px;
  border: 0;
  border-radius: 9px;
}

.settings-panel--workspace .theme-swatch-copy strong {
  font-size: 13px;
}

.settings-panel--workspace .theme-swatch-copy small {
  font-size: 10px;
}

.settings-panel--workspace .theme-style-fallback {
  margin-top: 10px;
}

.settings-panel--workspace .settings-editor-theme-item {
  display: grid;
  grid-template-columns: minmax(120px, 0.35fr) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding-top: 3px;
}

.settings-panel--workspace .settings-editor-theme-item .settings-label {
  margin: 0;
}

.settings-panel--workspace .settings-theme-block + .custom-theme-settings {
  margin-top: 18px;
}

.settings-panel--workspace .custom-theme-settings,
.settings-panel--workspace .theme-json-examples,
.settings-panel--workspace .theme-package-settings {
  border-top-color: rgba(62, 72, 79, 0.32);
}

.settings-panel--workspace .settings-action-btn {
  border-color: rgba(135, 146, 154, 0.24);
  border-radius: 8px;
  background: var(--settings-surface);
  color: var(--settings-text);
  font-family: inherit;
  transition: border-color 180ms ease, background-color 180ms ease, transform 180ms ease;
}

.settings-panel--workspace .settings-action-btn:hover:not(:disabled) {
  border-color: rgba(142, 213, 255, 0.52);
  background: var(--settings-surface-high);
  transform: translateY(-1px);
}

@media (max-width: 960px) {
  .settings-panel--workspace .settings-workspace {
    padding: 12px;
  }

  .settings-panel--workspace .settings-nav {
    padding: 8px;
  }

  .settings-nav-heading {
    display: none;
  }
}

@media (max-width: 680px) {
  .settings-panel--workspace .settings-header {
    padding-inline: 16px;
  }

  .settings-title-badge,
  .settings-save-state {
    display: none;
  }

  .settings-panel--workspace .settings-workspace {
    gap: 10px;
    padding: 10px;
  }

  .settings-appearance-grid,
  .settings-panel--workspace .theme-swatch-grid {
    grid-template-columns: 1fr;
  }

  .settings-panel--workspace .settings-font-size-item,
  .settings-panel--workspace .settings-theme-block-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .settings-panel--workspace .font-size-control {
    margin-left: 0;
    width: fit-content;
  }

  .settings-panel--workspace .settings-editor-theme-item {
    grid-template-columns: 1fr;
  }
}
</style>
