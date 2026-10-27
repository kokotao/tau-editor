<!--
  /**
   * @description 设置页「云同步」分区（设计稿二：Stitch「Tau Editor 偏好设置 - 云端同步」）。
   *
   * 版式：页头（面包屑 + H1 + 版本胶囊 + 诊断节点链路 + TLS 胶囊）
   *      → 12 列双栏（左 span7：账号与配额 / 文档调度中心 / 同步队列遥测；
   *                    右 span5：自动化触发策略 / 媒体资产与附件同步 / 安全徽标）。
   * 说明：原页头下方的 Bento 遥测 4 卡（运行版本 / 集群版本 / 环境架构 / 往返时延）
   *      已按需求整块移除——本软件没有对应功能；「诊断节点链路」的结果改在按钮文案上短暂显示。
   *
   * 视觉层全部消费 `assets/clouddoc-nocturne.css` 的 `.cd-*` 原语与 `--cd-*` token（本文件不改它）。
   * 状态来源仍是 `stores/cloudSync`（signedIn / quota / queue / error），行为与抽离前一致；
   * `previewState` 仅给设计预览页用：传了就走本地 mock 渲染，绝不触发真实网络 / Tauri 调用。
   *
   * @author Albert_Luo
   * @email 480199976@qq.com
   * @date 2026-10-27 00:20
   */
-->
<template>
  <section class="cd-sync cd-nocturne">
    <!-- 0. 页头：面包屑 / H1 / 版本胶囊 / 诊断 / TLS -->
    <header class="cd-sync__hero">
      <div class="cd-sync__hero-main">
        <div class="cd-sync__crumb cd-mono">
          <span>Preferences</span>
          <span class="cd-sync__crumb-sep">/</span>
          <span class="cd-sync__crumb-current">Cloud Synchronization</span>
        </div>
        <div class="cd-sync__hero-title">
          <span class="cd-sync__pulse" :data-tone="heroTone" aria-hidden="true" />
          <h1 class="cd-sync__h1">{{ copyText.h1 }}</h1>
          <span class="cd-sync__core cd-mono">{{ copyText.corePill }}</span>
        </div>
        <p class="cd-sync__subtitle">{{ copyText.subtitle }}</p>
      </div>

      <div class="cd-sync__hero-actions">
        <button
          type="button"
          class="cd-btn cd-btn--secondary cd-sync__diag"
          data-testid="cloud-sync-diagnose-btn"
          :data-state="diagnoseState"
          :disabled="diagnoseBusy"
          @click="runDiagnostics"
        >
          <CdGlyph name="network" :size="16" class="cd-sync__diag-glyph" />
          <span aria-live="polite">{{ diagnoseLabel }}</span>
        </button>
        <span class="cd-sync__hero-divider" aria-hidden="true" />
        <span class="cd-sync__tls cd-mono">
          <TauIcon name="icon-shield-check" :size="15" class="cd-sync__tls-icon" />
          <span>{{ copyText.tlsPill }}</span>
        </span>
      </div>
    </header>

    <!-- 主栅格：左 span7 / 右 span5 -->
    <div class="cd-sync__grid">
      <div class="cd-sync__col">
        <!-- 1. 账号与配额（未登录时是登录卡片） -->
        <article class="cd-sync__card" data-testid="cloud-sync-account-card">
          <template v-if="signedIn">
            <div class="cd-sync__account" data-testid="cloud-sync-account">
              <div class="cd-sync__account-id">
                <div class="cd-sync__avatar" :data-tone="accountTone">
                  <span class="cd-sync__avatar-letter">{{ avatarLetter }}</span>
                  <span class="cd-sync__avatar-dot" :data-tone="accountTone" aria-hidden="true" />
                </div>
                <div class="cd-sync__account-text">
                  <div class="cd-sync__account-name-row">
                    <span class="cd-sync__account-name">{{ accountName }}</span>
                    <span class="cd-sync__plan cd-mono" :data-tone="accountTone">{{ planLabel }}</span>
                  </div>
                  <div class="cd-sync__account-meta cd-mono">
                    <span>{{ copyText.accountUid }}: <strong>{{ accountUid }}</strong></span>
                    <span class="cd-sync__sep">·</span>
                    <span class="cd-sync__account-credential">{{ copyText.accountCredential }}</span>
                  </div>
                </div>
              </div>
              <div class="cd-sync__account-actions">
                <button
                  type="button"
                  class="cd-btn cd-btn--secondary"
                  data-testid="cloud-sync-switch-account-btn"
                  :disabled="busy"
                  @click="handleSwitchAccount"
                >
                  {{ copyText.accountSwitch }}
                </button>
                <button
                  type="button"
                  class="cd-btn cd-btn--danger"
                  data-testid="cloud-sync-logout-btn"
                  :disabled="busy"
                  @click="handleLogout"
                >
                  <CdGlyph name="logout" :size="15" />
                  <span>{{ copy.cloudSyncLogout }}</span>
                </button>
              </div>
            </div>

            <!-- 配额：.cd-progress + 图例 + 扩容方案 -->
            <div class="cd-sync__quota" data-testid="cloud-sync-quota">
              <div class="cd-sync__quota-head">
                <span class="cd-sync__quota-title">
                  <TauIcon name="icon-cloud-sync" :size="16" class="cd-sync__quota-icon" />
                  <span>{{ copy.cloudSyncQuotaLabel }}</span>
                  <span v-if="quotaTotalLabel" class="cd-sync__quota-note cd-mono">
                    ({{ quotaTotalLabel }} {{ copyText.quotaPermanent }})
                  </span>
                </span>
                <span
                  v-if="quotaValueLabel"
                  class="cd-sync__quota-value cd-mono"
                  data-testid="cloud-sync-quota-label"
                >
                  {{ quotaValueLabel }}
                </span>
                <span
                  v-else
                  class="cd-sync__quota-issue cd-mono"
                  data-testid="cloud-sync-quota-issue"
                >
                  {{ quotaIssueLabel }}
                </span>
              </div>
              <div
                v-if="quotaValueLabel"
                class="cd-progress cd-sync__progress"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="quotaPercent"
                :aria-label="copy.cloudSyncQuotaLabel"
              >
                <span class="cd-progress__bar" :style="{ width: `${barWidth}%` }" />
              </div>
              <div class="cd-sync__quota-legend cd-mono">
                <div class="cd-sync__legend-left">
                  <span class="cd-sync__legend-item">
                    <span class="cd-sync__dot" data-tone="accent" aria-hidden="true" />
                    {{ copyText.quotaDocData }}: {{ usedLabel }}
                  </span>
                  <span class="cd-sync__legend-item">
                    <span class="cd-sync__dot" data-tone="success" aria-hidden="true" />
                    {{ copyText.quotaAttachments }}: {{ attachmentsLabel }}
                  </span>
                </div>
                <button type="button" class="cd-sync__legend-link" @click="openUpgradePlan">
                  <span>{{ copyText.quotaUpgrade }}</span>
                  <CdGlyph name="external" :size="12" />
                </button>
              </div>
            </div>
          </template>

          <!-- 未登录：登录 / 注册入口 -->
          <div v-else class="cd-sync__login">
            <div class="cd-sync__login-head">
              <h2 class="cd-sync__card-title">{{ copyText.signedOutTitle }}</h2>
              <p class="cd-sync__hint">{{ copyText.signedOutHint }}</p>
            </div>
            <div class="cd-sync__fields">
              <label class="cd-sync__field">
                <span class="cd-sync__field-label cd-mono">{{ copy.cloudSyncServerUrl }}</span>
                <input
                  v-model="form.baseUrl"
                  class="cd-input cd-sync__input"
                  data-testid="cloud-sync-base-url"
                  type="url"
                  autocomplete="off"
                  spellcheck="false"
                  :placeholder="DEFAULT_CLOUD_BASE_URL"
                  :disabled="loginBusy"
                />
              </label>
              <label class="cd-sync__field">
                <span class="cd-sync__field-label cd-mono">{{ copy.cloudSyncUsername }}</span>
                <input
                  v-model="form.username"
                  class="cd-input cd-sync__input"
                  data-testid="cloud-sync-username"
                  type="text"
                  autocomplete="username"
                  spellcheck="false"
                  :disabled="loginBusy"
                />
              </label>
              <label class="cd-sync__field">
                <span class="cd-sync__field-label cd-mono">{{ copy.cloudSyncPassword }}</span>
                <input
                  v-model="form.password"
                  class="cd-input cd-sync__input"
                  data-testid="cloud-sync-password"
                  type="password"
                  autocomplete="current-password"
                  :disabled="loginBusy"
                  @keydown.enter.prevent="handleLogin"
                />
              </label>
            </div>
            <div class="cd-sync__login-actions">
              <button
                type="button"
                class="cd-sync__cta"
                data-testid="cloud-sync-login-btn"
                :disabled="loginDisabled"
                @click="handleLogin"
              >
                {{ loginBusy ? copy.cloudSyncLoggingIn : copy.cloudSyncLogin }}
              </button>
              <p class="cd-sync__hint cd-sync__register" data-testid="cloud-sync-register-hint">
                <span>{{ copy.cloudSyncRegisterHint }}</span>
                <button
                  type="button"
                  class="cd-sync__link"
                  data-testid="cloud-sync-register-btn"
                  :disabled="loginBusy"
                  @click="handleRegister"
                >
                  {{ copy.cloudSyncRegisterAction }}
                </button>
              </p>
            </div>
          </div>
        </article>

        <!-- 2. 文档调度中心：三按钮 + 反馈条 -->
        <article class="cd-sync__card">
          <header class="cd-sync__card-head">
            <div class="cd-sync__card-title-row">
              <TauIcon name="icon-cloud-sync" :size="20" class="cd-sync__card-icon" />
              <h2 class="cd-sync__card-title">{{ copyText.schedulerTitle }}</h2>
            </div>
            <span class="cd-sync__state cd-mono" :data-tone="schedulerTone">{{ schedulerStateLabel }}</span>
          </header>
          <p class="cd-sync__hint cd-sync__hint--block">{{ copyText.schedulerHint }}</p>
          <div class="cd-sync__actions">
            <button
              type="button"
              class="cd-sync__cta cd-sync__cta--wide"
              data-testid="cloud-sync-now-btn"
              :disabled="syncDisabled"
              @click="handleSyncNow"
            >
              <TauIcon name="icon-cloud-sync" :size="19" class="cd-sync__cta-icon" />
              <span>{{ syncingActive ? copy.cloudSyncSyncing : copy.cloudSyncSyncNow }}</span>
            </button>
            <button
              type="button"
              class="cd-btn cd-btn--secondary cd-sync__action"
              data-testid="cloud-sync-pull-btn"
              :disabled="pullDisabled"
              @click="handlePullRequest"
            >
              <TauIcon name="icon-cloud-download" :size="19" class="cd-sync__action-icon" />
              <span>{{ pullBusy ? copy.cloudSyncPulling : copy.cloudSyncPull }}</span>
            </button>
            <button
              type="button"
              class="cd-btn cd-btn--secondary cd-sync__action"
              data-testid="cloud-sync-browse-btn"
              :disabled="busy"
              @click="handleBrowse"
            >
              <TauIcon name="icon-window-preview" :size="19" class="cd-sync__action-icon cd-sync__action-icon--dim" />
              <span>{{ copy.cloudSyncBrowse }}</span>
            </button>
          </div>

          <!-- 反馈条：同步中 spinner / 最近一次结果 -->
          <div
            v-if="feedbackText"
            class="cd-sync__feedback"
            :data-tone="feedbackTone"
            data-testid="cloud-sync-last-result"
            role="status"
          >
            <span class="cd-sync__feedback-main cd-mono">
              <span v-if="syncingActive" class="cd-spinner cd-sync__spinner" aria-hidden="true" />
              <CdGlyph v-else :name="feedbackGlyph" :size="15" />
              <span>{{ feedbackText }}</span>
            </span>
            <span v-if="feedbackTask" class="cd-sync__feedback-task cd-mono">{{ feedbackTask }}</span>
          </div>

          <!-- 从云端拉取：未保存修改的覆盖确认 -->
          <div
            v-if="pullConfirmVisible"
            class="cd-sync__confirm"
            data-testid="cloud-sync-pull-confirm"
          >
            <p class="cd-sync__confirm-title">{{ copy.cloudSyncPullConfirmTitle }}</p>
            <p class="cd-sync__hint">{{ copy.cloudSyncPullConfirmHint }}</p>
            <div class="cd-sync__confirm-actions">
              <button
                type="button"
                class="cd-btn cd-btn--danger"
                data-testid="cloud-sync-pull-confirm-ok"
                :disabled="pullBusy"
                @click="handlePullConfirm"
              >
                {{ copy.cloudSyncPullConfirmOk }}
              </button>
              <button
                type="button"
                class="cd-btn cd-btn--secondary"
                data-testid="cloud-sync-pull-confirm-cancel"
                :disabled="pullBusy"
                @click="handlePullCancel"
              >
                {{ copy.cloudSyncPullConfirmCancel }}
              </button>
            </div>
          </div>
        </article>

        <!-- 3. 同步队列遥测 -->
        <article class="cd-sync__card">
          <header class="cd-sync__card-head">
            <div class="cd-sync__card-title-row">
              <TauIcon name="icon-list" :size="19" class="cd-sync__card-icon cd-sync__card-icon--dim" />
              <h2 class="cd-sync__card-title">{{ copyText.queueTitle }}</h2>
            </div>
            <span
              class="cd-sync__badge cd-mono"
              :data-tone="queueTone"
              data-testid="cloud-sync-queue-status"
            >
              {{ queueCountsLabel }}
            </span>
          </header>

          <div class="cd-sync__queue" :data-tone="queueTone">
            <div class="cd-sync__queue-main">
              <span class="cd-sync__queue-icon" :data-tone="queueTone" aria-hidden="true">
                <TauIcon :name="queueEmpty ? 'icon-check-circle' : 'icon-cloud-sync'" :size="20" />
              </span>
              <div class="cd-sync__queue-text">
                <div class="cd-sync__queue-title">{{ queueTitleText }}</div>
                <div class="cd-sync__queue-hint">{{ queueHintText }}</div>
              </div>
            </div>
            <div class="cd-sync__queue-actions">
              <button
                type="button"
                class="cd-btn cd-btn--secondary cd-sync__retry"
                data-testid="cloud-sync-retry-btn"
                :disabled="retryDisabled"
                @click="handleRetryQueue"
              >
                <CdGlyph name="refresh" :size="15" />
                <span>{{ copy.cloudSyncRetryQueue }}</span>
              </button>
              <button
                type="button"
                class="cd-sync__icon-btn"
                data-testid="cloud-sync-queue-refresh"
                :title="copyText.queueRefresh"
                :aria-label="copyText.queueRefresh"
                :disabled="queueRefreshing"
                @click="handleRefreshQueue"
              >
                <CdGlyph name="refresh" :size="17" />
              </button>
            </div>
          </div>
        </article>
      </div>

      <div class="cd-sync__col">
        <!-- 4. 自动化触发策略 -->
        <article class="cd-sync__card">
          <header class="cd-sync__card-title-row cd-sync__card-title-row--solo">
            <TauIcon name="icon-sliders" :size="20" class="cd-sync__card-icon" />
            <h2 class="cd-sync__card-title">{{ copyText.automationTitle }}</h2>
          </header>

          <!-- 自动同步 -->
          <div class="cd-sync__option" data-testid="cloud-sync-auto">
            <div class="cd-sync__option-main">
              <div class="cd-sync__option-title-row">
                <span class="cd-sync__option-title">{{ copy.cloudSyncAutoLabel }}</span>
                <span v-if="autoSyncEnabled" class="cd-sync__badge cd-mono" data-tone="success">
                  {{ copyText.automationActive }}
                </span>
              </div>
              <p class="cd-sync__hint">{{ copyText.automationAutoHint }}</p>
              <p
                v-if="!autoSyncAvailable"
                class="cd-sync__hint cd-sync__hint--warn"
                data-testid="cloud-sync-auto-unavailable"
              >
                {{ copy.cloudSyncAutoUnavailable }}
              </p>
            </div>
            <button
              type="button"
              class="cd-switch"
              role="switch"
              :aria-checked="autoSyncEnabled ? 'true' : 'false'"
              :aria-label="copy.cloudSyncAutoLabel"
              data-testid="cloud-sync-auto-toggle"
              :disabled="!autoSyncAvailable || busy"
              @click="handleAutoSyncToggle"
            />
          </div>

          <!-- 保存后延迟防抖 -->
          <div class="cd-sync__option cd-sync__option--stack">
            <div class="cd-sync__option-head">
              <label class="cd-sync__option-title" for="cloud-sync-debounce-input">
                {{ copyText.automationDebounceLabel }}
              </label>
              <span class="cd-sync__mono-value cd-mono">{{ debounceDisplay }}</span>
            </div>
            <p class="cd-sync__hint">{{ copyText.automationDebounceHint }}</p>
            <div class="cd-sync__stepper">
              <button
                type="button"
                class="cd-sync__step-btn"
                data-testid="cloud-sync-debounce-decrease"
                :aria-label="'-1s'"
                :disabled="busy"
                @click="stepDebounce(-1)"
              >
                <TauIcon name="icon-minus" :size="16" />
              </button>
              <div class="cd-sync__step-field">
                <input
                  id="cloud-sync-debounce-input"
                  class="cd-sync__step-input cd-mono"
                  data-testid="cloud-sync-debounce"
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  :value="debounceSeconds"
                  :disabled="busy"
                  @change="handleDebounceChange"
                />
                <span class="cd-sync__step-unit cd-mono">{{ copyText.automationSec }}</span>
              </div>
              <button
                type="button"
                class="cd-sync__step-btn"
                data-testid="cloud-sync-debounce-increase"
                :aria-label="'+1s'"
                :disabled="busy"
                @click="stepDebounce(1)"
              >
                <TauIcon name="icon-plus" :size="16" />
              </button>
            </div>
          </div>

          <!-- 多端冲突解决机制 -->
          <div class="cd-sync__option cd-sync__option--stack cd-sync__option--last">
            <div class="cd-sync__option-head">
              <span class="cd-sync__option-title">{{ copyText.automationConflictTitle }}</span>
              <CdGlyph name="branch" :size="16" class="cd-sync__opt-glyph" />
            </div>
            <div class="cd-sync__radios">
              <label class="cd-sync__radio">
                <input
                  type="radio"
                  name="cd-conflict-strategy"
                  value="branch"
                  :checked="conflictStrategy === 'branch'"
                  @change="setConflictStrategy('branch')"
                />
                <span class="cd-sync__radio-text">
                  <span class="cd-sync__radio-title">{{ copyText.automationConflictBranch }}</span>
                  <span class="cd-sync__radio-hint">{{ copyText.automationConflictBranchHint }}</span>
                </span>
              </label>
              <label class="cd-sync__radio">
                <input
                  type="radio"
                  name="cd-conflict-strategy"
                  value="local"
                  :checked="conflictStrategy === 'local'"
                  @change="setConflictStrategy('local')"
                />
                <span class="cd-sync__radio-text">
                  <span class="cd-sync__radio-title">{{ copyText.automationConflictLocal }}</span>
                  <span class="cd-sync__radio-hint">{{ copyText.automationConflictLocalHint }}</span>
                </span>
              </label>
            </div>

            <!-- 真实冲突：保留两端 / cover -->
            <div v-if="conflictActive" class="cd-sync__confirm" data-testid="cloud-sync-conflict">
              <p class="cd-sync__confirm-title">{{ copy.cloudSyncConflictTitle }}</p>
              <p class="cd-sync__hint">{{ copy.cloudSyncConflictHint }}</p>
              <div class="cd-sync__confirm-actions">
                <button
                  type="button"
                  class="cd-btn cd-btn--secondary"
                  data-testid="cloud-sync-keep-local-btn"
                  :disabled="conflictBusy || busy"
                  @click="handleKeepLocal"
                >
                  {{ copy.cloudSyncKeepLocal }}
                </button>
                <button
                  type="button"
                  class="cd-btn cd-btn--secondary"
                  data-testid="cloud-sync-keep-remote-btn"
                  :disabled="conflictBusy || busy"
                  @click="handleKeepRemote"
                >
                  {{ copy.cloudSyncKeepRemote }}
                </button>
              </div>
            </div>
          </div>
        </article>

        <!-- 5. 媒体资产与附件同步 -->
        <article class="cd-sync__card">
          <header class="cd-sync__card-title-row cd-sync__card-title-row--solo">
            <CdGlyph name="image" :size="20" class="cd-sync__card-icon" />
            <h2 class="cd-sync__card-title">{{ copyText.mediaTitle }}</h2>
          </header>

          <label class="cd-sync__option cd-sync__option--check">
            <input
              type="checkbox"
              class="cd-sync__check"
              data-testid="cloud-sync-images-toggle"
              :checked="syncImages"
              :disabled="busy"
              @change="handleImagesToggle"
            />
            <span class="cd-sync__option-main">
              <span class="cd-sync__option-title">{{ copy.cloudSyncImagesLabel }}</span>
              <span class="cd-sync__hint" data-testid="cloud-sync-images-hint">
                {{ copy.cloudSyncImagesHint }}
              </span>
            </span>
          </label>

          <div class="cd-sync__cache">
            <div class="cd-sync__cache-row">
              <span class="cd-sync__cache-key">{{ copyText.mediaCacheLabel }}</span>
              <span class="cd-sync__cache-value cd-mono">{{ mediaCacheValue }}</span>
            </div>
            <div class="cd-sync__cache-row">
              <span class="cd-sync__cache-key">{{ copyText.mediaTranscodeLabel }}</span>
              <span class="cd-sync__cache-value cd-mono" data-tone="success">
                {{ copyText.mediaEnabled }}
              </span>
            </div>
            <div class="cd-sync__cache-foot">
              <button
                type="button"
                class="cd-btn cd-btn--secondary"
                data-testid="cloud-sync-clear-cache-btn"
                :disabled="cacheBusy"
                @click="handleClearCache"
              >
                <CdGlyph name="trash" :size="15" />
                <span>{{ cacheBusy ? copyText.mediaClearing : copyText.mediaClearCache }}</span>
              </button>
              <span class="cd-sync__cache-note cd-mono">{{ copyText.mediaAutoTidy }}</span>
            </div>
          </div>
        </article>

        <!-- 6. 安全徽标 -->
        <div class="cd-sync__security">
          <span class="cd-sync__security-icon" aria-hidden="true">
            <TauIcon name="icon-shield-check" :size="18" />
          </span>
          <p class="cd-sync__security-text">{{ copyText.securityText }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, reactive, ref, watch, type PropType } from 'vue';
import TauIcon from '@/components/icons/TauIcon.vue';
import { getCloudSyncSettingsI18n, getSettingsPanelI18n } from '@/i18n/ui';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useFileConflictsStore } from '@/stores/fileConflicts';
import { useNotificationStore } from '@/stores/notification';
import { useSettingsStore } from '@/stores/settings';
import { useTabsStore } from '@/stores/tabs';
import { DEFAULT_CLOUD_BASE_URL } from '@/services/cloudAuthService';
import { pullCloudDocumentIntoLocal, type CloudSyncResult } from '@/services/cloudSyncService';
import { appCommands } from '@/lib/tauri';
import { isTauriApp } from '@/lib/tauri';

/**
 * 设计稿二预览态：只有设计预览页会传；传了就完全不碰 store / Tauri（纯本地 mock）。
 * `signed-out` 未登录 · `signed-in` 已登录 · `syncing` 同步中 · `error` 异常。
 */
export type CloudSyncPreviewState = 'signed-out' | 'signed-in' | 'syncing' | 'error';
type ConflictStrategy = 'branch' | 'local';
type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

const props = defineProps({
  previewState: {
    type: String as PropType<CloudSyncPreviewState>,
    default: undefined,
  },
});

const emit = defineEmits<{ 'open-cloud-browser': [] }>();

const settingsStore = useSettingsStore();
const cloudSyncStore = useCloudSyncStore();
const tabsStore = useTabsStore();
const fileConflictsStore = useFileConflictsStore();
const notificationStore = useNotificationStore();

const copy = computed(() => getSettingsPanelI18n(settingsStore.uiLanguage));
const copyText = computed(() => getCloudSyncSettingsI18n(settingsStore.uiLanguage));

// ------------------------------------------------------------------
// 预览 mock（仅 previewState 生效时读写）
// ------------------------------------------------------------------
const mock = reactive({
  /** 预览里点登录/退出时切到另一态，让预览页可交互 */
  signedInOverride: null as boolean | null,
  autoSync: true,
  debounceSeconds: 3,
  conflictStrategy: 'branch' as ConflictStrategy,
  syncImages: true,
  /** 预览里模拟挂起 / 阻塞项（syncing 态 1 挂起、error 态 1 阻塞） */
  pending: 0,
  failed: 0,
  syncBusy: false,
  pullBusy: false,
  loginPending: false,
  cacheBusy: false,
  queueBusy: false,
  feedback: '',
  feedbackTone: 'info' as FeedbackTone,
  taskId: '0942',
});

/**
 * 「诊断节点链路」的结果只在按钮文案上短暂停留：
 * 原先它还要写进「集群往返时延」遥测卡，卡片移除后按钮就是唯一反馈位，
 * 因此既要保证点了有反馈，又不能让结果一直挂在按钮上被误读成常驻状态。
 */
const DIAGNOSE_RESULT_HOLD_MS = 3200;
const diagnoseResultMs = ref<number | null>(null);
let diagnoseResetTimer: ReturnType<typeof setTimeout> | null = null;

function clearDiagnoseResult(): void {
  if (diagnoseResetTimer) {
    clearTimeout(diagnoseResetTimer);
    diagnoseResetTimer = null;
  }
  diagnoseResultMs.value = null;
}

function flashDiagnoseResult(ms: number): void {
  clearDiagnoseResult();
  diagnoseResultMs.value = ms;
  diagnoseResetTimer = setTimeout(() => {
    diagnoseResultMs.value = null;
    diagnoseResetTimer = null;
  }, DIAGNOSE_RESULT_HOLD_MS);
}

/** 是否已清理过本地媒体缓存（决定明细行显示 0 B） */
const cacheCleared = ref(false);

/** 真实模式（不传 previewState） */
const live = computed(() => !props.previewState);

/** 真实预览态：previewState 与本地覆盖合并出当前要渲染的状态 */
const state = computed<CloudSyncPreviewState | 'live'>(() => {
  if (!props.previewState) {
    return 'live';
  }
  if (mock.signedInOverride === false) {
    return 'signed-out';
  }
  if (mock.signedInOverride === true) {
    return 'signed-in';
  }
  return props.previewState;
});

watch(
  () => props.previewState,
  (next) => {
    // 预览页切换状态按钮时，清掉上一态遗留的交互覆盖与反馈
    if (next) {
      mock.signedInOverride = null;
      mock.feedback = '';
      mock.syncBusy = false;
      mock.pullBusy = false;
      mock.pending = next === 'syncing' ? 1 : 0;
      mock.failed = next === 'error' ? 1 : 0;
      clearDiagnoseResult();
      cacheCleared.value = false;
    }
  },
  { immediate: true },
);

// ------------------------------------------------------------------
// 真实模式：表单 / 同步 / 冲突 / 拉取（从 SettingsPanel 原样搬入）
// ------------------------------------------------------------------
const form = reactive({
  baseUrl: DEFAULT_CLOUD_BASE_URL,
  username: '',
  password: '',
});
const loginPending = ref(false);
const syncingLocally = ref(false);
const lastResult = ref<CloudSyncResult | null>(null);
const conflictBusy = ref(false);
const pullBusyRef = ref(false);
const pullConfirmVisible = ref(false);
const pullConfirmTabId = ref<string | null>(null);

/** 桌面端能力判断：测试环境可能只 mock 了 @/lib/tauri 的少数导出，这里必须容错。 */
const desktopAvailable = computed(() => {
  try {
    return typeof isTauriApp === 'function' ? isTauriApp() : false;
  } catch {
    return false;
  }
});

/** 云同步引擎状态（真实模式），预览时由 previewState 决定 */
const busy = computed(() => (live.value ? cloudSyncStore.isBusy : false));
const signedIn = computed(() => (live.value ? cloudSyncStore.signedIn : state.value !== 'signed-out'));
const syncingActive = computed(() =>
  live.value ? cloudSyncStore.isBusy || syncingLocally.value : state.value === 'syncing' || mock.syncBusy,
);

const isError = computed(() => {
  if (!live.value) {
    return state.value === 'error';
  }
  if (cloudSyncStore.spaceError || cloudSyncStore.lastError) {
    return true;
  }
  const result = lastResult.value;
  return Boolean(result && (result.status === 'failed' || result.status === 'conflict'));
});

const accountName = computed(() => {
  if (!live.value) {
    return 'albert';
  }
  return cloudSyncStore.username || cloudSyncStore.userId || '';
});
const accountUid = computed(() => {
  if (!live.value) {
    return '1747576500179';
  }
  return cloudSyncStore.userId || cloudSyncStore.baseUrl || copy.value.cloudSyncLoginRequired;
});
const avatarLetter = computed(() => (accountName.value.trim().charAt(0) || 'A').toUpperCase());
const accountTone = computed(() => (isError.value ? 'danger' : 'accent'));

/** 配额：真实值来自 store（/me），预览用设计稿示例值 */
const quotaLabel = computed(() => {
  if (!live.value) {
    return state.value === 'error' ? '' : '83.3 KB / 8.0 GB';
  }
  return cloudSyncStore.quotaLabel;
});
const quotaPercent = computed(() => {
  if (!live.value) {
    return state.value === 'error' ? 0 : 0.01;
  }
  const ratio = Number(cloudSyncStore.usedRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, ratio * 100));
});
/** 实际几乎不占容量时也要留一条可见细线（设计稿示例用量 4% 宽） */
const barWidth = computed(() => {
  if (!live.value) {
    return state.value === 'error' ? 0 : 4;
  }
  return quotaPercent.value > 0 ? Math.max(quotaPercent.value, 0.6) : 0;
});
const percentLabel = computed(() => `${quotaPercent.value < 0.01 ? 0.01 : quotaPercent.value.toFixed(2)}%`);
const quotaValueLabel = computed(() => (quotaLabel.value ? `${quotaLabel.value} (${percentLabel.value})` : ''));
const quotaIssueLabel = computed(() => {
  if (!live.value) {
    return copy.value.cloudSyncQuotaFailed('network', copyText.value.errorHint);
  }
  const issue = cloudSyncStore.spaceError;
  if (!issue) {
    return copy.value.cloudSyncQuotaReading;
  }
  return copy.value.cloudSyncQuotaFailed(issue.kind, issue.message);
});

function formatBytes(bytes: number | undefined | null): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return copyText.value.telemetryUnknown;
  }
  if (bytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit] ?? 'B'}`;
}

const usedLabel = computed(() => {
  if (!live.value) {
    return state.value === 'error' ? copyText.value.telemetryUnknown : '70.9 KB';
  }
  return formatBytes(cloudSyncStore.space?.usedBytes);
});
const quotaTotalLabel = computed(() => {
  if (!live.value) {
    return '8.0 GB';
  }
  return cloudSyncStore.space ? formatBytes(cloudSyncStore.space.quotaBytes) : '';
});
/** 云端 /me 只返回总用量，文档与附件没有分项，如实标注而不是编造。 */
const attachmentsLabel = computed(() => {
  if (!live.value) {
    return state.value === 'error' ? copyText.value.telemetryUnknown : '12.4 KB';
  }
  return copyText.value.quotaSplitUnknown;
});
const planLabel = computed(() => {
  if (!live.value) {
    return 'PRO DEVELOPER';
  }
  return cloudSyncStore.space
    ? `${formatBytes(cloudSyncStore.space.quotaBytes)} ${copyText.value.planKnown}`
    : copyText.value.planUnknown;
});

/** 队列：store 的 pendingSyncCount 含失败项，这里做互斥拆分（原实现同款口径） */
const queuePending = computed(() => {
  if (!live.value) {
    return mock.pending;
  }
  return Math.max(0, cloudSyncStore.pendingSyncCount - cloudSyncStore.failedSyncCount);
});
const queueFailed = computed(() => (live.value ? cloudSyncStore.failedSyncCount : mock.failed));
const queueEmpty = computed(() => queuePending.value === 0 && queueFailed.value === 0);
const queueTone = computed(() => (queueFailed.value > 0 ? 'danger' : queueEmpty.value ? 'success' : 'accent'));
const queueCountsLabel = computed(() => copyText.value.queueCounts(queuePending.value, queueFailed.value));
const queueTitleText = computed(() =>
  queueEmpty.value
    ? copyText.value.queueEmptyTitle
    : copy.value.cloudSyncQueueStatus(queuePending.value, queueFailed.value),
);
const queueHintText = computed(() => {
  if (queueFailed.value > 0) {
    return copyText.value.queueBlockedHint(queueFailed.value);
  }
  if (queuePending.value > 0) {
    return copyText.value.queuePendingHint(queuePending.value);
  }
  return copyText.value.queueEmptyHint;
});

/** 自动化策略：自动同步 / 防抖 / 冲突策略 */
const autoSyncEnabled = computed(() => (live.value ? cloudSyncStore.autoSyncEnabled : mock.autoSync));
const autoSyncAvailable = computed(() => (live.value ? cloudSyncStore.autoSyncAvailable : true));
const debounceSeconds = computed(() =>
  live.value ? Math.max(1, Math.round(cloudSyncStore.syncDebounceMs / 1000)) : mock.debounceSeconds,
);
const debounceDisplay = computed(() => `${debounceSeconds.value.toFixed(2)}s`);
const syncImages = computed(() => (live.value ? settingsStore.syncDocumentImages : mock.syncImages));

/**
 * 冲突策略偏好：现有同步引擎固定生成分支副本，没有对应的设置字段，
 * 这里落在本机 localStorage（`tau-cloud-sync:conflict-strategy`），后续接管引擎时可直接读。
 */
const CONFLICT_STORAGE_KEY = 'tau-cloud-sync:conflict-strategy';
const storedConflictStrategy = ref<ConflictStrategy>(readConflictStrategy());
const conflictStrategy = computed<ConflictStrategy>(() =>
  live.value ? storedConflictStrategy.value : mock.conflictStrategy,
);

function readConflictStrategy(): ConflictStrategy {
  if (typeof localStorage === 'undefined') {
    return 'branch';
  }
  try {
    return localStorage.getItem(CONFLICT_STORAGE_KEY) === 'local' ? 'local' : 'branch';
  } catch {
    return 'branch';
  }
}

function writeConflictStrategy(next: ConflictStrategy): void {
  storedConflictStrategy.value = next;
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(CONFLICT_STORAGE_KEY, next);
  } catch (error) {
    console.warn('[CloudSync] 保存冲突策略失败:', error);
  }
}

const setConflictStrategy = (next: ConflictStrategy): void => {
  if (!live.value) {
    mock.conflictStrategy = next;
    return;
  }
  writeConflictStrategy(next);
};

/** 最近的同步结果 / 错误，转成反馈条文案 */
const feedbackTone = computed<FeedbackTone>(() => {
  if (!live.value) {
    if (mock.feedbackTone === 'error' || state.value === 'error') {
      return 'error';
    }
    return state.value === 'syncing' || mock.syncBusy ? 'info' : mock.feedbackTone;
  }
  const result = lastResult.value;
  if (result) {
    if (result.status === 'synced') return 'success';
    if (result.status === 'conflict') return 'warning';
    if (result.status === 'skipped') return 'info';
    return 'error';
  }
  return cloudSyncStore.lastError ? 'error' : 'info';
});

const feedbackText = computed(() => {
  if (!live.value) {
    if (state.value === 'error') {
      return copyText.value.errorHint;
    }
    if (state.value === 'syncing' || mock.syncBusy) {
      return copyText.value.feedbackSyncing;
    }
    return mock.feedback;
  }
  const result = lastResult.value;
  if (result) {
    if (result.status === 'synced') return copy.value.cloudSyncResultSynced(result.version);
    if (result.status === 'conflict') return copy.value.cloudSyncResultConflict;
    if (result.status === 'skipped') return copy.value.cloudSyncResultSkipped(result.message || '');
    return copy.value.cloudSyncResultFailed(result.message || '');
  }
  return cloudSyncStore.lastError ? copy.value.cloudSyncResultFailed(cloudSyncStore.lastError) : '';
});

const feedbackGlyph = computed(() => {
  if (feedbackTone.value === 'error') return 'refresh';
  if (feedbackTone.value === 'warning') return 'branch';
  return 'network';
});

/** 同步中的任务号只是给人看的，真实模式用本地时间戳末位，预览固定 0942 */
const feedbackTask = computed(() => {
  if (!feedbackText.value) {
    return '';
  }
  if (!live.value) {
    return state.value === 'error' ? '' : copyText.value.schedulerTask(mock.taskId);
  }
  return feedbackTone.value === 'info' && syncingActive.value
    ? copyText.value.schedulerTask(String(Date.now() % 10000).padStart(4, '0'))
    : '';
});

/** 调度中心右侧状态胶囊 */
const schedulerTone = computed(() => (isError.value ? 'danger' : syncingActive.value ? 'accent' : 'success'));
const schedulerStateLabel = computed(() => {
  if (isError.value) return copyText.value.schedulerError;
  return syncingActive.value ? copyText.value.schedulerSyncing : copyText.value.schedulerIdle;
});

// ------------------------------------------------------------------
// 页头「诊断节点链路」
//   原先诊断测得的往返时延还要写进 Bento 遥测卡；卡片整块移除后，
//   结果直接落在按钮文案上短暂显示（flashDiagnoseResult），点了必有反馈。
// ------------------------------------------------------------------
const diagnoseBusy = ref(false);

const diagnoseLabel = computed(() => {
  if (diagnoseBusy.value) {
    return copyText.value.diagnosing;
  }
  if (diagnoseResultMs.value !== null) {
    return copyText.value.diagnoseOk(diagnoseResultMs.value);
  }
  return copyText.value.diagnose;
});

/** 给按钮一个可样式化的状态位：idle / busy / result（result 用成功色短暂高亮） */
const diagnoseState = computed<'idle' | 'busy' | 'result'>(() => {
  if (diagnoseBusy.value) {
    return 'busy';
  }
  return diagnoseResultMs.value === null ? 'idle' : 'result';
});

const heroTone = computed(() => (isError.value ? 'danger' : 'success'));

/** 诊断节点链路：真实模式对云端做一次真实往返（refreshSpace = GET /me）并计时 */
const runDiagnostics = async (): Promise<void> => {
  if (diagnoseBusy.value) {
    return;
  }
  diagnoseBusy.value = true;
  try {
    if (!live.value) {
      await wait(700);
      flashDiagnoseResult(12 + Math.round(Math.random() * 8));
      return;
    }
    if (!cloudSyncStore.signedIn) {
      notificationStore.info(copy.value.settingsCloudSync, copyText.value.diagnoseFailed);
      return;
    }
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    await cloudSyncStore.refreshSpace();
    const elapsed = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started);
    if (cloudSyncStore.spaceError) {
      notificationStore.error(copy.value.settingsCloudSync, quotaIssueLabel.value);
      return;
    }
    flashDiagnoseResult(elapsed);
  } finally {
    diagnoseBusy.value = false;
  }
};

// ------------------------------------------------------------------
// 真实交互
// ------------------------------------------------------------------
const loginBusy = computed(() => (live.value ? loginPending.value : mock.loginPending));
/** 预览态允许空表单点击（只为演示态切换），真实模式必须填完用户名与密码。 */
const loginDisabled = computed(() =>
  live.value ? loginPending.value || !form.username.trim() || !form.password : mock.loginPending,
);

const syncDisabled = computed(() => !signedIn.value || busy.value || syncingActive.value);
const pullBusy = computed(() => (live.value ? pullBusyRef.value : mock.pullBusy));
const pullDisabled = computed(
  () => !signedIn.value || busy.value || pullBusy.value || (live.value && !desktopAvailable.value),
);
const retryDisabled = computed(() => busy.value || queueFailed.value === 0);
const queueRefreshing = computed(() => (live.value ? busy.value : mock.queueBusy));
const cacheClearBusy = ref(false);
const cacheBusy = computed(() => (live.value ? cacheClearBusy.value : mock.cacheBusy));
/** 清理过缓存后明细行显示 0 B（真实模式原本没有统计值，清完才确定为空） */
const mediaCacheValue = computed(() => {
  if (!live.value) {
    return cacheCleared.value ? '0 B (0 个资源)' : '12.4 MB (48 个资源)';
  }
  return cacheCleared.value ? '0 B' : copyText.value.mediaCacheUnknown;
});

const conflictActive = computed(() => {
  if (!live.value) {
    // 预览的异常态只演示「配额读取失败 / 队列阻塞」，不伪造冲突面板
    return false;
  }
  if (!desktopAvailable.value) {
    return false;
  }
  if (lastResult.value?.status === 'conflict') {
    return true;
  }
  const tab = tabsStore.activeTab;
  const record = tab?.filePath ? fileConflictsStore.find(tab.filePath) : null;
  return record?.source === 'cloud';
});

const notifyResult = (tone: FeedbackTone, message: string): void => {
  const title = copy.value.settingsCloudSync;
  if (tone === 'success') {
    notificationStore.success(title, message);
    return;
  }
  if (tone === 'warning') {
    notificationStore.warning(title, message);
    return;
  }
  if (tone === 'info') {
    notificationStore.info(title, message);
    return;
  }
  notificationStore.error(title, message);
};

/** 注册走系统浏览器：`{origin}/lizi/newUser/register?source=tau`（后端按 source 授予 Tau 角色）。 */
const resolveCloudOrigin = (): string => {
  const raw = (form.baseUrl || cloudSyncStore.baseUrl || DEFAULT_CLOUD_BASE_URL).trim();
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/lizi\/?$/, '').replace(/\/+$/, '') || 'https://note.lizipro.cn';
  }
};

const handleRegister = async (): Promise<void> => {
  if (!live.value) {
    mock.feedback = copyText.value.signedOutHint;
    mock.feedbackTone = 'info';
    return;
  }
  try {
    await appCommands.openExternalLink(`${resolveCloudOrigin()}/lizi/newUser/register?source=tau`);
  } catch (error) {
    notificationStore.error(
      copy.value.settingsCloudSync,
      error instanceof Error ? error.message : String(error),
    );
  }
};

const openUpgradePlan = async (): Promise<void> => {
  if (!live.value) {
    return;
  }
  try {
    await appCommands.openExternalLink(`${resolveCloudOrigin()}/lizi`);
  } catch (error) {
    notificationStore.error(
      copy.value.settingsCloudSync,
      error instanceof Error ? error.message : String(error),
    );
  }
};

const handleLogin = async (): Promise<void> => {
  if (loginDisabled.value) {
    return;
  }
  if (!live.value) {
    mock.loginPending = true;
    await wait(400);
    mock.loginPending = false;
    mock.signedInOverride = true;
    return;
  }
  loginPending.value = true;
  try {
    const outcome = await cloudSyncStore.login({
      baseUrl: form.baseUrl.trim() || null,
      username: form.username.trim(),
      password: form.password,
    });
    if (!outcome.ok) {
      notificationStore.error(copy.value.cloudSyncLogin, outcome.message);
      return;
    }
    form.password = '';
    lastResult.value = null;
    notificationStore.success(
      copy.value.settingsCloudSync,
      copy.value.cloudSyncSignedInAs(outcome.data.username || outcome.data.userId || ''),
    );
    await cloudSyncStore.refreshSpace();
  } finally {
    loginPending.value = false;
  }
};

const handleLogout = async (): Promise<void> => {
  if (!live.value) {
    mock.signedInOverride = false;
    mock.feedback = '';
    return;
  }
  lastResult.value = null;
  await cloudSyncStore.logout();
  form.password = '';
  notificationStore.info(copy.value.settingsCloudSync, copy.value.cloudSyncSignedOut);
};

/** 切换账号 = 退出当前会话回到登录卡片（凭据只在本机，不弹二次确认）。 */
const handleSwitchAccount = async (): Promise<void> => {
  if (!live.value) {
    mock.signedInOverride = false;
    return;
  }
  lastResult.value = null;
  await cloudSyncStore.logout();
  form.password = '';
  notificationStore.info(copy.value.settingsCloudSync, copy.value.cloudSyncSignedOut);
};

const handleSyncNow = async (): Promise<void> => {
  if (syncDisabled.value) {
    return;
  }
  if (!live.value) {
    mock.syncBusy = true;
    await wait(1200);
    mock.syncBusy = false;
    mock.feedback = copy.value.cloudSyncResultSynced(9);
    mock.feedbackTone = 'success';
    return;
  }
  syncingLocally.value = true;
  try {
    lastResult.value = await cloudSyncStore.syncCurrentDocument();
    if (feedbackText.value) {
      notifyResult(feedbackTone.value, feedbackText.value);
    }
  } finally {
    syncingLocally.value = false;
  }
};

const handleBrowse = (): void => {
  emit('open-cloud-browser');
};

const handleAutoSyncToggle = (): void => {
  if (!live.value) {
    mock.autoSync = !mock.autoSync;
    return;
  }
  cloudSyncStore.setAutoSyncEnabled(!cloudSyncStore.autoSyncEnabled);
};

const handleDebounceChange = (event: Event): void => {
  const target = event.target as HTMLInputElement | null;
  const seconds = Number(target?.value ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return;
  }
  const clamped = Math.min(60, Math.max(1, Math.round(seconds)));
  if (!live.value) {
    mock.debounceSeconds = clamped;
    return;
  }
  cloudSyncStore.setSyncDebounceMs(clamped * 1000);
};

const stepDebounce = (delta: number): void => {
  if (busy.value) {
    return;
  }
  const next = Math.min(60, Math.max(1, debounceSeconds.value + delta));
  if (!live.value) {
    mock.debounceSeconds = next;
    return;
  }
  cloudSyncStore.setSyncDebounceMs(next * 1000);
};

const handleImagesToggle = (event: Event): void => {
  const target = event.target as HTMLInputElement | null;
  const checked = Boolean(target?.checked);
  if (!live.value) {
    mock.syncImages = checked;
    return;
  }
  void settingsStore.updateSettings({ syncDocumentImages: checked });
};

const handleRetryQueue = async (): Promise<void> => {
  if (retryDisabled.value) {
    return;
  }
  if (!live.value) {
    mock.failed = 0;
    mock.pending = 0;
    return;
  }
  await cloudSyncStore.retryQueue();
};

/** 刷新状态：真实模式重新拉一次配额（同时把队列快照刷到最新）。 */
const handleRefreshQueue = async (): Promise<void> => {
  if (!live.value) {
    mock.queueBusy = true;
    await wait(500);
    mock.queueBusy = false;
    return;
  }
  if (!cloudSyncStore.signedIn) {
    return;
  }
  await cloudSyncStore.refreshSpace();
};

/**
 * 清理本地媒体缓存：项目尚未把媒体写进 Cache Storage，
 * 这里真实清一次 `tau-media-` 前缀的缓存桶（当前为 0 个），并把结果写回明细行。
 */
const handleClearCache = async (): Promise<void> => {
  if (cacheBusy.value) {
    return;
  }
  if (!live.value) {
    mock.cacheBusy = true;
    await wait(500);
    mock.cacheBusy = false;
    cacheCleared.value = true;
    return;
  }
  cacheClearBusy.value = true;
  try {
    let removed = 0;
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('tau-media-')).map(async (key) => {
          await caches.delete(key);
          removed += 1;
        }),
      );
    }
    cacheCleared.value = true;
    notificationStore.info(copy.value.settingsCloudSync, `${copyText.value.mediaCacheCleared} (${removed})`);
  } catch (error) {
    notificationStore.error(
      copy.value.settingsCloudSync,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    cacheClearBusy.value = false;
  }
};

// ------------------------------------------------------------------
// 从云端拉取 / 冲突处理（原实现语义不变）
// ------------------------------------------------------------------
const applyConflictResult = (result: CloudSyncResult, doneText: (version?: number) => string): void => {
  lastResult.value = result;
  const tab = tabsStore.activeTab;
  if (result.status === 'synced') {
    if (tab?.filePath) {
      fileConflictsStore.resolve(tab.filePath);
    }
    notificationStore.success(copy.value.settingsCloudSync, doneText(result.version));
    return;
  }
  if (result.status === 'conflict') {
    notificationStore.warning(copy.value.settingsCloudSync, copy.value.cloudSyncResultConflict);
    return;
  }
  if (result.status === 'skipped') {
    notificationStore.info(copy.value.settingsCloudSync, copy.value.cloudSyncResultSkipped(result.message || ''));
    return;
  }
  notificationStore.error(copy.value.settingsCloudSync, copy.value.cloudSyncResultFailed(result.message || ''));
};

const handleKeepLocal = async (): Promise<void> => {
  if (!live.value) {
    return;
  }
  const tab = tabsStore.activeTab;
  if (!tab || conflictBusy.value) {
    return;
  }
  conflictBusy.value = true;
  try {
    const result = await cloudSyncStore.forcePushCurrentDocument(tab.id);
    applyConflictResult(result, copy.value.cloudSyncKeepLocalDone);
  } finally {
    conflictBusy.value = false;
  }
};

const handleKeepRemote = async (): Promise<void> => {
  if (!live.value) {
    return;
  }
  const tab = tabsStore.activeTab;
  if (!tab || conflictBusy.value) {
    return;
  }
  conflictBusy.value = true;
  try {
    // 冲突面板里用户已明确选了「以云端为准」，这里不再二次确认。
    const result = await pullCloudDocumentIntoLocal(tab.id, { overwriteDirty: true });
    applyConflictResult(result, copy.value.cloudSyncKeepRemoteDone);
  } finally {
    conflictBusy.value = false;
  }
};

/**
 * 「从云端拉取」：普通场景的拉取入口。
 * 有未保存修改时先弹确认（不直接落盘），确认后才带 overwriteDirty 覆盖。
 */
const handlePullRequest = async (): Promise<void> => {
  if (pullDisabled.value) {
    return;
  }
  if (!live.value) {
    mock.pullBusy = true;
    await wait(700);
    mock.pullBusy = false;
    mock.feedback = copy.value.cloudSyncKeepRemoteDone(9);
    mock.feedbackTone = 'success';
    return;
  }
  const tab = tabsStore.activeTab;
  if (!tab || pullBusyRef.value) {
    return;
  }
  pullBusyRef.value = true;
  try {
    const result = await pullCloudDocumentIntoLocal(tab.id);
    if (result.needsDirtyConfirm) {
      pullConfirmTabId.value = tab.id;
      pullConfirmVisible.value = true;
      return;
    }
    applyConflictResult(result, copy.value.cloudSyncKeepRemoteDone);
  } finally {
    pullBusyRef.value = false;
  }
};

/** 取消覆盖：本地内容与未保存修改都原样保留，只给一条可读提示。 */
const handlePullCancel = (): void => {
  pullConfirmVisible.value = false;
  pullConfirmTabId.value = null;
  notificationStore.info(copy.value.settingsCloudSync, copy.value.cloudSyncPullCancelled);
};

const handlePullConfirm = async (): Promise<void> => {
  const tabId = pullConfirmTabId.value;
  pullConfirmVisible.value = false;
  pullConfirmTabId.value = null;
  if (!tabId || pullBusyRef.value) {
    return;
  }
  pullBusyRef.value = true;
  try {
    const result = await pullCloudDocumentIntoLocal(tabId, { overwriteDirty: true });
    applyConflictResult(result, copy.value.cloudSyncKeepRemoteDone);
  } finally {
    pullBusyRef.value = false;
  }
};

// ------------------------------------------------------------------
// 挂载：版本信息（真实模式）+ store 同步（沿用 SettingsPanel 既有 watch）
// ------------------------------------------------------------------
const timers = new Set<ReturnType<typeof setTimeout>>();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      resolve();
    }, ms);
    timers.add(timer);
  });
}

watch(
  () => cloudSyncStore.baseUrl,
  (value) => {
    if (value) {
      form.baseUrl = value;
    }
  },
  { immediate: true },
);

watch(
  () => cloudSyncStore.signedIn,
  (next) => {
    if (!next) {
      form.password = '';
    }
  },
);

onBeforeUnmount(() => {
  clearDiagnoseResult();
  for (const timer of timers) {
    clearTimeout(timer);
  }
  timers.clear();
});

/**
 * 极小内联图标（Lucide 线条风格，与 TauIcon 同 stroke 语义）：
 * 设计稿用的 Material Symbols 字体本机不可用，这里只保留用得到的几个形状。
 */
const GLYPH_PATHS: Record<string, string[]> = {
  network: [
    'M9 3h6v5H9z',
    'M2 16h6v5H2z',
    'M16 16h6v5h-6z',
    'M5 16v-2a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2',
    'M12 13V8',
  ],
  refresh: ['M21 12a9 9 0 1 1-3.2-6.9', 'M21 3.5V9h-5.5'],
  image: ['M4 4h16v16H4z', 'M8.5 10a1.5 1.5 0 1 0 0-.01', 'M20 15l-4.5-4.5L6 20'],
  trash: ['M3 6h18', 'M19 6v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  external: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14 21 3'],
  branch: ['M6 3v12', 'M18 6a3 3 0 1 0 0-.01', 'M6 21a3 3 0 1 0 0-.01', 'M18 9a9 9 0 0 1-9 9'],
};

const CdGlyph = defineComponent({
  name: 'CdGlyph',
  props: {
    name: { type: String, required: true },
    size: { type: Number, default: 16 },
  },
  setup(glyphProps) {
    return () =>
      h(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.75,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          width: glyphProps.size,
          height: glyphProps.size,
          'aria-hidden': 'true',
        },
        (GLYPH_PATHS[glyphProps.name] ?? GLYPH_PATHS.network ?? []).map((d) =>
          h('path', { d, key: d }),
        ),
      );
  },
});
</script>

<style scoped>
/* ------------------------------------------------------------------ */
/* 分区容器：只在 .cd-nocturne 作用域内取 --cd-* token                  */
/* ------------------------------------------------------------------ */
.cd-sync {
  --sx-gap-card: 24px;
  --sx-card-bg: var(--cd-bg-card);
  --sx-inner-bg: color-mix(in srgb, var(--cd-bg-card) 62%, var(--cd-bg-overlay));
  --sx-pill-bg: color-mix(in srgb, var(--cd-bg-card) 74%, var(--cd-bg-panel));
  --sx-card-shadow: 0 4px 18px -12px rgba(0, 0, 0, 0.75);
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1440px;
  gap: 0;
  min-width: 0;
  margin: 0 auto;
  color: var(--cd-text);
  font-family: var(--cd-font-ui);
}

.cd-sync__sep {
  margin: 0 4px;
  color: var(--cd-text-3);
}

.cd-sync__dot {
  display: inline-block;
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  background: var(--cd-accent);
  border-radius: 50%;
}

.cd-sync__dot[data-tone='success'] {
  background: var(--cd-success);
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
}

.cd-sync__dot[data-tone='danger'] {
  background: var(--cd-danger);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.45);
}

/* ------------------------------------------------------------------ */
/* 0. 页头                                                             */
/* ------------------------------------------------------------------ */
.cd-sync__hero {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 24px;
  margin-bottom: 32px;
}

.cd-sync__hero-main {
  min-width: 0;
}

.cd-sync__crumb {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
  font-size: var(--cd-fs-label);
  letter-spacing: 0.1em;
  color: var(--cd-text-3);
  text-transform: uppercase;
}

.cd-sync__crumb-current {
  font-weight: 500;
  letter-spacing: 0;
  color: var(--cd-accent);
  text-transform: none;
}

.cd-sync__hero-title {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.cd-sync__pulse {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  background: var(--cd-success);
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.7);
  animation: cd-sync-pulse 2.4s ease-in-out infinite;
}

.cd-sync__pulse[data-tone='danger'] {
  background: var(--cd-danger);
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.65);
}

.cd-sync__h1 {
  margin: 0;
  font-size: var(--cd-fs-h1);
  font-weight: 600;
  line-height: 36px;
  color: var(--cd-text);
  letter-spacing: -0.02em;
}

.cd-sync__core {
  padding: 2px 8px;
  font-size: var(--cd-fs-meta);
  font-weight: 500;
  color: var(--cd-accent);
  background: rgba(56, 189, 248, 0.1);
  border-radius: 9999px;
}

.cd-sync__subtitle {
  max-width: 720px;
  margin: 6px 0 0;
  font-size: var(--cd-fs-sm);
  line-height: 1.6;
  color: var(--cd-text-2);
}

.cd-sync__hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.cd-sync__diag {
  height: auto;
  padding: 6px 12px;
  background: var(--sx-inner-bg);
  border: 0;
  border-radius: var(--cd-r-panel);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  transition: background-color 0.18s ease, color 0.18s ease;
}

.cd-sync__diag-glyph {
  color: var(--cd-success);
}

/* 诊断结果短暂回来时，按钮整块染成成功色，避免「点了没反应」的错觉 */
.cd-sync__diag[data-state='result'] {
  color: var(--cd-success);
  background: color-mix(in srgb, var(--cd-success) 14%, var(--sx-inner-bg));
}

.cd-sync__diag[data-state='busy'] .cd-sync__diag-glyph {
  color: var(--cd-accent);
}

.cd-sync__diag:disabled {
  cursor: progress;
}

.cd-sync__hero-divider {
  width: 1px;
  height: 24px;
  background: color-mix(in srgb, var(--cd-border-strong) 80%, transparent);
}

.cd-sync__tls {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 6px 12px;
  font-size: var(--cd-fs-meta);
  color: var(--cd-text-2);
  background: var(--sx-pill-bg);
  border-radius: var(--cd-r-panel);
}

.cd-sync__tls-icon {
  color: var(--cd-accent);
}

/* ------------------------------------------------------------------ */
/* 主栅格：12 列 → 左 7 / 右 5                                          */
/* ------------------------------------------------------------------ */
.cd-sync__grid {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 32px;
  align-items: start;
}

.cd-sync__col {
  display: flex;
  flex-direction: column;
  gap: var(--sx-gap-card);
  min-width: 0;
}

.cd-sync__card {
  padding: 24px;
  background: var(--sx-card-bg);
  border-radius: var(--cd-r-window);
  box-shadow: var(--sx-card-shadow);
}

.cd-sync__card-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.cd-sync__card-title-row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.cd-sync__card-title-row--solo {
  margin-bottom: 16px;
}

.cd-sync__card-icon {
  color: var(--cd-accent);
}

.cd-sync__card-icon--dim {
  color: var(--cd-text-2);
}

.cd-sync__card-title {
  margin: 0;
  font-size: var(--cd-fs-title);
  font-weight: 600;
  color: var(--cd-text);
  letter-spacing: -0.01em;
}

.cd-sync__hint {
  margin: 0;
  font-size: var(--cd-fs-sm);
  line-height: 1.55;
  color: var(--cd-text-2);
}

.cd-sync__hint--block {
  margin-bottom: 20px;
}

.cd-sync__hint--warn {
  color: var(--cd-warning);
}

.cd-sync__state {
  font-size: var(--cd-fs-label);
  color: var(--cd-success);
}

.cd-sync__state[data-tone='danger'] {
  color: var(--cd-danger);
}

.cd-sync__state[data-tone='accent'] {
  color: var(--cd-accent);
}

/* ------------------------------------------------------------------ */
/* 2. 账号与配额                                                       */
/* ------------------------------------------------------------------ */
.cd-sync__account {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 20px;
}

.cd-sync__account-id {
  display: flex;
  gap: 14px;
  align-items: center;
  min-width: 0;
}

.cd-sync__avatar {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.3), var(--cd-accent-2));
  border-radius: 12px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
}

.cd-sync__avatar[data-tone='danger'] {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), var(--cd-bg-overlay));
}

.cd-sync__avatar-letter {
  font-size: 20px;
  font-weight: 700;
  color: #c4e7ff;
  line-height: 1;
}

.cd-sync__avatar-dot {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 11px;
  height: 11px;
  background: var(--cd-success);
  border: 3px solid var(--sx-card-bg);
  border-radius: 50%;
}

.cd-sync__avatar-dot[data-tone='danger'] {
  background: var(--cd-danger);
}

.cd-sync__account-text {
  min-width: 0;
}

.cd-sync__account-name-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.cd-sync__account-name {
  font-size: var(--cd-fs-title);
  font-weight: 600;
  color: var(--cd-text);
}

.cd-sync__plan {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: var(--cd-fs-label);
  font-weight: 500;
  color: var(--cd-success);
  background: rgba(16, 185, 129, 0.15);
  border-radius: 4px;
}

.cd-sync__plan[data-tone='danger'] {
  color: var(--cd-danger);
  background: rgba(239, 68, 68, 0.15);
}

.cd-sync__account-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
  margin-top: 3px;
  font-size: var(--cd-fs-meta);
  color: var(--cd-text-3);
}

.cd-sync__account-meta strong {
  font-weight: 400;
  color: var(--cd-text-2);
}

.cd-sync__account-credential {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-sync__account-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

/* 配额块 */
.cd-sync__quota {
  padding: 16px;
  margin-top: 8px;
  background: var(--sx-inner-bg);
  border-radius: var(--cd-r-dialog);
}

.cd-sync__quota-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.cd-sync__quota-title {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: var(--cd-fs-sm);
  color: var(--cd-text);
}

.cd-sync__quota-icon {
  color: var(--cd-accent);
}

.cd-sync__quota-note {
  font-size: var(--cd-fs-meta);
  color: var(--cd-text-3);
}

.cd-sync__quota-value {
  font-size: var(--cd-fs-meta);
  font-weight: 500;
  color: var(--cd-accent);
}

.cd-sync__quota-issue {
  font-size: var(--cd-fs-meta);
  color: var(--cd-danger);
}

.cd-sync__progress {
  margin-bottom: 12px;
}

.cd-sync__quota-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  font-size: var(--cd-fs-label);
  color: var(--cd-text-3);
}

.cd-sync__legend-left {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}

.cd-sync__legend-item {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.cd-sync__legend-link {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  padding: 0;
  font-family: var(--cd-font-mono);
  font-size: var(--cd-fs-label);
  color: var(--cd-accent);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.cd-sync__legend-link:hover {
  text-decoration: underline;
}

/* 未登录：登录卡片 */
.cd-sync__login {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cd-sync__login-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cd-sync__fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.cd-sync__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.cd-sync__field-label {
  font-size: var(--cd-fs-label);
  letter-spacing: 0.04em;
  color: var(--cd-text-3);
  text-transform: uppercase;
}

.cd-sync__input {
  width: 100%;
  height: 36px;
  box-sizing: border-box;
}

.cd-sync__login-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.cd-sync__register {
  display: flex;
  gap: 4px;
  align-items: center;
}

.cd-sync__link {
  padding: 0;
  font-size: var(--cd-fs-sm);
  color: var(--cd-accent);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.cd-sync__link:hover:not(:disabled) {
  text-decoration: underline;
}

.cd-sync__link:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* ------------------------------------------------------------------ */
/* 主 CTA / 三按钮条                                                    */
/* ------------------------------------------------------------------ */
.cd-sync__actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.cd-sync__cta {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 10px 16px;
  font-family: var(--cd-font-ui);
  font-size: var(--cd-fs-body);
  font-weight: 600;
  color: #004965;
  cursor: pointer;
  background: linear-gradient(90deg, #8ed5ff, var(--cd-accent));
  border: 0;
  border-radius: var(--cd-r-dialog);
  box-shadow: 0 0 0 rgba(56, 189, 248, 0);
  transition: box-shadow 0.2s ease, transform 0.12s ease;
}

.cd-sync__cta:hover:not(:disabled) {
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
}

.cd-sync__cta:active:not(:disabled) {
  transform: scale(0.98);
}

.cd-sync__cta:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  box-shadow: none;
}

.cd-sync__cta--wide {
  width: 100%;
}

.cd-sync__cta-icon {
  color: #004965;
}

.cd-sync__action {
  height: auto;
  min-height: 40px;
  padding: 10px 16px;
  font-size: var(--cd-fs-body);
  font-weight: 500;
  background: var(--sx-inner-bg);
  border: 0;
  border-radius: var(--cd-r-dialog);
}

.cd-sync__action:hover:not(:disabled) {
  background: var(--cd-bg-overlay);
}

.cd-sync__action-icon {
  color: var(--cd-accent);
}

.cd-sync__action-icon--dim {
  color: var(--cd-text-2);
}

/* 反馈条 */
.cd-sync__feedback {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  margin-top: 16px;
  font-size: var(--cd-fs-sm);
  background: color-mix(in srgb, var(--sx-inner-bg) 70%, transparent);
  border-radius: var(--cd-r-panel);
}

.cd-sync__feedback-main {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  color: var(--cd-text-2);
}

.cd-sync__feedback[data-tone='success'] .cd-sync__feedback-main {
  color: var(--cd-success);
}

.cd-sync__feedback[data-tone='warning'] .cd-sync__feedback-main {
  color: var(--cd-warning);
}

.cd-sync__feedback[data-tone='error'] .cd-sync__feedback-main {
  color: var(--cd-danger);
}

.cd-sync__feedback-task {
  font-size: var(--cd-fs-label);
  color: var(--cd-text-3);
}

.cd-sync__spinner {
  flex: 0 0 auto;
}

/* 拉取确认 / 冲突面板 */
.cd-sync__confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  margin-top: 16px;
  background: color-mix(in srgb, var(--cd-danger) 10%, var(--sx-inner-bg));
  border: 1px solid color-mix(in srgb, var(--cd-danger) 35%, transparent);
  border-radius: var(--cd-r-dialog);
}

.cd-sync__confirm-title {
  margin: 0;
  font-size: var(--cd-fs-sm);
  font-weight: 600;
  color: var(--cd-danger);
}

.cd-sync__confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

/* ------------------------------------------------------------------ */
/* 4. 同步队列                                                         */
/* ------------------------------------------------------------------ */
.cd-sync__badge {
  padding: 2px 8px;
  font-size: var(--cd-fs-meta);
  color: var(--cd-text-2);
  background: var(--sx-inner-bg);
  border-radius: 9999px;
}

.cd-sync__badge[data-tone='success'] {
  color: var(--cd-success);
  background: rgba(16, 185, 129, 0.12);
}

.cd-sync__badge[data-tone='danger'] {
  color: var(--cd-danger);
  background: rgba(239, 68, 68, 0.12);
}

.cd-sync__badge[data-tone='accent'] {
  color: var(--cd-accent);
  background: rgba(56, 189, 248, 0.12);
}

.cd-sync__queue {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--sx-inner-bg);
  border-radius: var(--cd-r-dialog);
}

.cd-sync__queue-main {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.cd-sync__queue-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--cd-success);
  background: rgba(16, 185, 129, 0.12);
  border-radius: var(--cd-r-panel);
}

.cd-sync__queue-icon[data-tone='danger'] {
  color: var(--cd-danger);
  background: rgba(239, 68, 68, 0.12);
}

.cd-sync__queue-icon[data-tone='accent'] {
  color: var(--cd-accent);
  background: rgba(56, 189, 248, 0.12);
}

.cd-sync__queue-text {
  min-width: 0;
}

.cd-sync__queue-title {
  font-size: var(--cd-fs-body);
  font-weight: 500;
  color: var(--cd-text);
}

.cd-sync__queue-hint {
  margin-top: 2px;
  font-size: var(--cd-fs-sm);
  color: var(--cd-text-3);
}

.cd-sync__queue-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.cd-sync__retry:disabled {
  color: var(--cd-text-3);
  cursor: not-allowed;
  background: color-mix(in srgb, var(--cd-border-strong) 70%, transparent);
  border-color: transparent;
  opacity: 0.6;
}

.cd-sync__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  color: var(--cd-text);
  cursor: pointer;
  background: var(--cd-bg-overlay);
  border: 0;
  border-radius: var(--cd-r-panel);
  transition: background-color 0.15s ease;
}

.cd-sync__icon-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--cd-bg-overlay) 70%, #ffffff);
}

.cd-sync__icon-btn:disabled {
  cursor: progress;
  opacity: 0.6;
}

/* ------------------------------------------------------------------ */
/* 5. 自动化触发策略                                                    */
/* ------------------------------------------------------------------ */
.cd-sync__option {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  margin-bottom: 16px;
  background: var(--sx-inner-bg);
  border-radius: var(--cd-r-dialog);
}

.cd-sync__option--stack {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.cd-sync__option--last {
  margin-bottom: 0;
}

.cd-sync__option--check {
  justify-content: flex-start;
  align-items: flex-start;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.cd-sync__option--check:hover {
  background: var(--cd-bg-overlay);
}

.cd-sync__option-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cd-sync__option-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.cd-sync__option-title {
  font-size: var(--cd-fs-body);
  font-weight: 500;
  color: var(--cd-text);
}

.cd-sync__option-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.cd-sync__opt-glyph {
  color: var(--cd-text-3);
}

.cd-sync__mono-value {
  font-size: var(--cd-fs-meta);
  font-weight: 500;
  color: var(--cd-accent);
}

/* 数字步进 */
.cd-sync__stepper {
  display: flex;
  gap: 8px;
  align-items: center;
}

.cd-sync__step-btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  color: var(--cd-text);
  cursor: pointer;
  background: var(--cd-bg-overlay);
  border: 0;
  border-radius: var(--cd-r-panel);
  transition: background-color 0.15s ease, transform 0.1s ease;
}

.cd-sync__step-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--cd-bg-overlay) 65%, #ffffff);
}

.cd-sync__step-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.cd-sync__step-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.cd-sync__step-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.cd-sync__step-input {
  width: 100%;
  height: 36px;
  padding: 0 34px 0 10px;
  font-size: var(--cd-fs-body);
  color: var(--cd-text);
  text-align: center;
  background: var(--cd-bg-sunken);
  border: 1px solid transparent;
  border-radius: var(--cd-r-panel);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
  appearance: textfield;
}

.cd-sync__step-input::-webkit-outer-spin-button,
.cd-sync__step-input::-webkit-inner-spin-button {
  margin: 0;
  appearance: none;
}

.cd-sync__step-input:focus {
  border-color: var(--cd-accent);
  outline: none;
  box-shadow: 0 0 0 1px var(--cd-accent);
}

.cd-sync__step-unit {
  position: absolute;
  top: 50%;
  right: 12px;
  font-size: var(--cd-fs-meta);
  color: var(--cd-text-3);
  pointer-events: none;
  transform: translateY(-50%);
}

/* 单选 */
.cd-sync__radios {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cd-sync__radio {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 8px;
  cursor: pointer;
  border-radius: var(--cd-r-panel);
  transition: background-color 0.15s ease;
}

.cd-sync__radio:hover {
  background: color-mix(in srgb, var(--cd-border-strong) 60%, transparent);
}

.cd-sync__radio input {
  flex: 0 0 auto;
  margin-top: 3px;
  accent-color: var(--cd-accent);
}

.cd-sync__radio-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cd-sync__radio-title {
  font-size: var(--cd-fs-sm);
  font-weight: 500;
  color: var(--cd-text);
}

.cd-sync__radio-hint {
  font-size: var(--cd-fs-meta);
  color: var(--cd-text-2);
}

/* ------------------------------------------------------------------ */
/* 6. 媒体资产                                                         */
/* ------------------------------------------------------------------ */
.cd-sync__check {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  cursor: pointer;
  accent-color: var(--cd-accent);
}

.cd-sync__cache {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--sx-inner-bg);
  border-radius: var(--cd-r-dialog);
}

.cd-sync__cache-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.cd-sync__cache-key {
  font-size: var(--cd-fs-sm);
  color: var(--cd-text-2);
}

.cd-sync__cache-value {
  font-size: var(--cd-fs-meta);
  font-weight: 500;
  color: var(--cd-text);
  overflow-wrap: anywhere;
}

.cd-sync__cache-value[data-tone='success'] {
  color: var(--cd-success);
}

.cd-sync__cache-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
}

.cd-sync__cache-note {
  font-size: var(--cd-fs-label);
  color: var(--cd-text-3);
}

/* ------------------------------------------------------------------ */
/* 7. 安全徽标                                                        */
/* ------------------------------------------------------------------ */
.cd-sync__security {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 16px;
  background: color-mix(in srgb, var(--sx-card-bg) 70%, transparent);
  border-radius: var(--cd-r-dialog);
}

.cd-sync__security-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--cd-accent);
  background: rgba(56, 189, 248, 0.1);
  border-radius: var(--cd-r-panel);
}

.cd-sync__security-text {
  margin: 0;
  font-size: var(--cd-fs-meta);
  line-height: 1.45;
  color: var(--cd-text-3);
}

/* ------------------------------------------------------------------ */
/* 动画与响应式                                                        */
/* ------------------------------------------------------------------ */
@keyframes cd-sync-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cd-sync__pulse {
    animation: none;
  }
}

@media (max-width: 1180px) {
  .cd-sync__grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
}

@media (max-width: 720px) {
  .cd-sync__card {
    padding: 16px;
  }

  .cd-sync__actions,
  .cd-sync__fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .cd-sync__h1 {
    font-size: 22px;
    line-height: 28px;
  }
}
</style>
