<template>
  <div v-if="visible" class="share-dialog-backdrop" data-testid="share-dialog" @click.self="requestClose">
    <section class="share-dialog" role="dialog" aria-modal="true" @keydown.esc.prevent="requestClose">
      <header class="share-dialog__header">
        <h3>{{ copy.title }}</h3>
        <span class="share-dialog__file" :title="filePath ?? ''">{{ fileName || filePath }}</span>
        <button type="button" class="share-dialog__close" data-testid="share-dialog-close" @click="requestClose">×</button>
      </header>

      <div class="share-dialog__body">
        <p v-if="phase === 'syncing'" class="share-dialog__hint" data-testid="share-dialog-syncing">
          {{ copy.syncing }}
        </p>

        <div v-else-if="needsOverwrite" class="share-dialog__block share-dialog__block--warn" data-testid="share-dialog-conflict">
          <p class="share-dialog__block-title">{{ copy.conflictTitle }}</p>
          <p class="share-dialog__hint">{{ copy.conflictHint }}</p>
          <div class="share-dialog__actions">
            <button type="button" class="share-dialog__button" data-testid="share-dialog-overwrite" :disabled="busy" @click="startSync(true)">
              {{ copy.overwrite }}
            </button>
            <button type="button" class="share-dialog__button" data-testid="share-dialog-conflict-cancel" :disabled="busy" @click="requestClose">
              {{ copy.cancel }}
            </button>
          </div>
        </div>

        <template v-else>
          <section v-if="!shared" class="share-dialog__section">
            <label class="share-dialog__label">{{ copy.expiryLabel }}</label>
            <div class="share-dialog__expiry-row">
              <button
                v-for="preset in expiryPresets"
                :key="String(preset.days)"
                type="button"
                class="share-dialog__chip"
                :class="{ 'is-selected': expiryChoice === preset.days }"
                :data-testid="`share-dialog-expiry-${preset.key}`"
                :disabled="busy"
                @click="selectExpiry(preset.days)"
              >
                {{ preset.label }}
              </button>
              <button
                type="button"
                class="share-dialog__chip"
                :class="{ 'is-selected': isCustomExpiry }"
                data-testid="share-dialog-expiry-custom-chip"
                :disabled="busy"
                @click="selectExpiry('custom')"
              >
                {{ copy.expiryCustom }}
              </button>
              <input
                v-model="customDays"
                class="share-dialog__input share-dialog__input--short"
                data-testid="share-dialog-expiry-custom"
                type="number"
                min="1"
                :max="maxExpireDays"
                :disabled="busy || !isCustomExpiry"
              />
              <span class="share-dialog__hint">{{ copy.customDaysHint }}</span>
            </div>

            <label class="share-dialog__label">
              <input
                v-model="passwordEnabled"
                data-testid="share-dialog-password-toggle"
                type="checkbox"
                :disabled="busy"
              />
              {{ copy.passwordLabel }}
            </label>
            <input
              v-if="passwordEnabled"
              v-model="password"
              class="share-dialog__input"
              data-testid="share-dialog-password"
              type="text"
              :placeholder="copy.passwordPlaceholder"
              :disabled="busy"
            />

            <button
              type="button"
              class="share-dialog__button share-dialog__button--primary"
              data-testid="share-dialog-generate"
              :disabled="busy || !fileId"
              @click="generate(false)"
            >
              {{ busy ? copy.working : copy.generate }}
            </button>
          </section>

          <section v-else class="share-dialog__section">
            <label class="share-dialog__label">{{ copy.linkLabel }}</label>
            <div class="share-dialog__link-row">
              <input
                class="share-dialog__input"
                data-testid="share-dialog-url"
                type="text"
                readonly
                :value="shareUrl"
                @focus="($event.target as HTMLInputElement).select()"
              />
              <button type="button" class="share-dialog__button" data-testid="share-dialog-copy" :disabled="busy" @click="copyLink">{{ copy.copy }}</button>
              <button type="button" class="share-dialog__button" data-testid="share-dialog-open" :disabled="busy || !shareUrl" @click="openLink">{{ copy.open }}</button>
            </div>

            <div v-if="statsViews !== null" class="share-dialog__stats" data-testid="share-dialog-stats">
              <span data-testid="share-dialog-stats-line">{{ statsCopy.statsLine(statsViews, statsVisitors ?? 0) }}</span>
              <button
                type="button"
                class="share-dialog__button"
                data-testid="share-dialog-stats-btn"
                @click="openStats()"
              >
                {{ statsCopy.openStats }}
              </button>
            </div>

            <dl class="share-dialog__meta">
              <div>
                <dt>{{ copy.visits }}</dt>
                <dd data-testid="share-dialog-visits">{{ visitCount }}</dd>
              </div>
              <div>
                <dt>{{ copy.createdAt }}</dt>
                <dd>{{ formatTime(createdAt) }}</dd>
              </div>
              <div>
                <dt>{{ copy.expiresAt }}</dt>
                <dd data-testid="share-dialog-expiry">
                  {{ expiresAt ? formatTime(expiresAt) : copy.permanent }}
                </dd>
              </div>
              <div v-if="hasPassword">
                <dt>{{ copy.passwordState }}</dt>
                <dd>{{ copy.passwordOn }}</dd>
              </div>
            </dl>

            <div class="share-dialog__actions">
              <button type="button" class="share-dialog__button" data-testid="share-dialog-regenerate" :disabled="busy" @click="generate(true)">
                {{ copy.regenerate }}
              </button>
              <button type="button" class="share-dialog__button share-dialog__button--danger" data-testid="share-dialog-revoke" :disabled="busy" @click="revoke">
                {{ copy.revoke }}
              </button>
            </div>
          </section>
        </template>

        <p v-if="fileKindLabel" class="share-dialog__hint" data-testid="share-dialog-file-kind">
          {{ copy.fileTypeLabel }}：{{ fileKindLabel }}
        </p>
        <p v-if="binaryMode" class="share-dialog__hint" data-testid="share-dialog-binary-info">
          {{ copy.fileTypeLabel }}：{{ binaryKindLabel || fileKindLabel }}
          <template v-if="binarySize">· {{ copy.binarySizeLabel }} {{ formatBinarySize(binarySize) }}</template>
        </p>
        <p v-if="binaryMode" class="share-dialog__hint" data-testid="share-dialog-binary-preview">
          {{ copy.binaryPreviewOnly }}
        </p>
        <p v-if="!binaryMode && imageTotal > 0" class="share-dialog__hint" data-testid="share-dialog-images-status">
          {{ copy.imagesStatus(imageTotal, imageSynced) }}
        </p>
        <p
          v-if="!binaryMode && imageTotal > 0 && imagesDisabled"
          class="share-dialog__hint share-dialog__hint--warn"
          data-testid="share-dialog-images-disabled"
        >
          {{ copy.imagesSyncDisabled }}
        </p>
        <p
          v-else-if="!binaryMode && imageTotal > imageSynced"
          class="share-dialog__hint share-dialog__hint--warn"
          data-testid="share-dialog-images-unsynced"
        >
          {{ copy.imagesUnsynced(imageTotal - imageSynced) }}
        </p>
        <p
          v-if="!shareBaseUrl"
          class="share-dialog__hint share-dialog__hint--warn"
          data-testid="share-dialog-base-missing"
        >
          {{ copy.baseUrlMissing }}
        </p>
        <StatusNotice v-if="notice" tone="success" :text="notice" test-id="share-dialog-notice" />
        <StatusNotice v-if="errorText" tone="error" :text="errorText" test-id="share-dialog-error" />
      </div>

      <footer class="share-dialog__footer">
        <button type="button" class="share-dialog__button" data-testid="share-dialog-close-footer" @click="requestClose">
          {{ copy.close }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 一键分享弹窗：先自动同步（沿用分类 / 无分类归入默认分享分类），再生成或复用分享链接。
 * 支持有效期与访问密码、复制/打开/撤销/重新生成，链接生成后自动复制到剪贴板。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 16:25
 */
import { computed, ref, watch } from 'vue';
import { appCommands, cloudCommands } from '@/lib/tauri';
import {
  resolveShareBaseUrl,
  buildShareUrl,
  copyTextToClipboard,
  createShare,
  fetchShareConfig,
  getShareStatus,
  normalizeExpiresInDays,
  revokeShare,
  SHARE_EXPIRY_PRESET_DAYS,
} from '@/services/cloudShareService';
import { isMarkdownPath, resolveCloudDocPathForFile, syncDocumentByPath } from '@/services/cloudSyncService';
import { parseMarkdownImageRefs } from '@/services/cloudAssetService';
import {
  binaryDocKind,
  ensureBinaryDocumentUploaded,
  formatBinarySize,
  isBinaryDocPath,
} from '@/services/cloudBinaryService';
import { getCloudShareI18n, getShareStatsI18n } from '@/i18n/ui';
import { fetchShareStats } from '@/services/cloudShareStatsService';
import StatusNotice from '@/components/ui/StatusNotice.vue';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';

const props = withDefaults(defineProps<{
  visible?: boolean;
  filePath?: string | null;
  fileName?: string;
}>(), { visible: false, filePath: null, fileName: '' });

const emit = defineEmits<{
  close: [];
  /** 分享成功后上层刷新云端文档树（分类可能变化） */
  shared: [];
  /** 打开分享统计弹窗（由 App 承载 ShareStatsDialog） */
  'open-stats': [payload: { fileId: number; fileName: string }];
}>();

const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const cloudSyncStore = useCloudSyncStore();
const copy = computed(() => getCloudShareI18n(settingsStore.uiLanguage));
const statsCopy = computed(() => getShareStatsI18n(settingsStore.uiLanguage));
const statsViews = ref<number | null>(null);
const statsVisitors = ref<number | null>(null);

type Phase = 'syncing' | 'ready';

const phase = ref<Phase>('syncing');
const busy = ref(false);
const needsOverwrite = ref(false);
const errorText = ref('');
const notice = ref('');
const fileId = ref<number | null>(null);
const shared = ref(false);
const token = ref('');
const shareUrl = ref('');
const createdAt = ref<string | null>(null);
const expiresAt = ref<string | null>(null);
const hasPassword = ref(false);
const visitCount = ref(0);
/** 分享页渲染类型与扩展名（后端 share 响应补充） */
const fileKind = ref('');
const fileExt = ref('');
/** 二进制文档（pdf/doc/xls/ppt）分享：只预览不下载，不需要图片统计 */
const binaryMode = computed(() => isBinaryDocPath(props.filePath));
const binarySize = ref<number | null>(null);
const binaryAlreadyUploaded = ref(false);
const binaryKindLabel = computed(() => {
  const kind = binaryDocKind(props.filePath);
  if (kind === 'pdf') {
    return copy.value.kindPdf;
  }
  if (kind === 'office') {
    return copy.value.kindOffice;
  }
  return '';
});

/** 文档引用图片总数 / 已同步张数 / 图片同步开关 */
const imageTotal = ref(0);
const imageSynced = ref(0);
const imagesDisabled = ref(false);
const shareBaseUrl = ref('');
const defaultCategory = ref<string | null>(null);
const maxExpireDays = ref(3650);

/** 过期预设：null = 永久；'custom' 表示自定义天数。 */
type ExpiryChoice = number | null | 'custom';
const expiryChoice = ref<ExpiryChoice>(null);
const customDays = ref('30');
const passwordEnabled = ref(false);
const password = ref('');

const isCustomExpiry = computed(() => expiryChoice.value === 'custom');

const fileKindLabel = computed(() => {
  const kind = fileKind.value.trim().toLowerCase();
  if (!kind) {
    return '';
  }
  const names: Record<string, string> = {
    markdown: copy.value.kindMarkdown,
    code: copy.value.kindCode,
    text: copy.value.kindText,
    image: copy.value.kindImage,
    pdf: copy.value.kindPdf,
    office: copy.value.kindOffice,
    other: copy.value.kindOther,
  };
  const label = names[kind] ?? copy.value.kindOther;
  const ext = fileExt.value.trim();
  return ext ? `${label}（.${ext}）` : label;
});

const expiryPresets = computed(() => [
  { key: 'permanent', days: null as number | null, label: copy.value.expiryPermanent },
  { key: '1', days: 1 as number | null, label: copy.value.expiryDays(1) },
  { key: '7', days: 7 as number | null, label: copy.value.expiryDays(7) },
  { key: '30', days: 30 as number | null, label: copy.value.expiryDays(30) },
]);

function selectExpiry(choice: ExpiryChoice): void {
  expiryChoice.value = choice;
}

function resolvedExpiresInDays(): number | null {
  if (isCustomExpiry.value) {
    return normalizeExpiresInDays(Number(customDays.value), maxExpireDays.value);
  }
  return normalizeExpiresInDays(expiryChoice.value as number | null, maxExpireDays.value);
}

function resolvedPassword(): string | null {
  const value = password.value.trim();
  return passwordEnabled.value && value ? value : null;
}

function formatTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(settingsStore.uiLanguage) : value;
}

function resetState(): void {
  phase.value = 'syncing';
  busy.value = false;
  needsOverwrite.value = false;
  errorText.value = '';
  notice.value = '';
  fileId.value = null;
  shared.value = false;
  token.value = '';
  shareUrl.value = '';
  createdAt.value = null;
  expiresAt.value = null;
  hasPassword.value = false;
  visitCount.value = 0;
  expiryChoice.value = null;
  customDays.value = '30';
  passwordEnabled.value = false;
  password.value = '';
}

function cloudPathFor(filePath: string): string {
  return resolveCloudDocPathForFile(
    filePath,
    workspaceStore.currentWorkspaceName,
    workspaceStore.currentWorkspacePath,
  );
}

/** 分享前自动同步：沿用已有分类，无分类则归入默认「分享」分类。 */
async function startSync(overwrite: boolean): Promise<void> {
  const filePath = props.filePath;
  if (!filePath) {
    return;
  }
  busy.value = true;
  errorText.value = '';
  notice.value = '';
  phase.value = 'syncing';
  needsOverwrite.value = false;
  try {
    const cloudPath = cloudPathFor(filePath);

    // 二进制文档：不做文本同步，直接确保已上传（已存在则复用 fileId，V1 不支持覆盖）
    if (binaryMode.value) {
      const ensured = await ensureBinaryDocumentUploaded(
        { cloudPath, localPath: filePath, title: props.fileName || undefined },
        { fileSize: null },
      );
      phase.value = 'ready';
      if (!ensured.ok) {
        errorText.value = copy.value.failed(ensured.message);
        return;
      }
      fileId.value = ensured.data.fileId;
      binarySize.value = ensured.data.size;
      binaryAlreadyUploaded.value = ensured.data.alreadyUploaded;
      notice.value = ensured.data.alreadyUploaded
        ? copy.value.binaryAlreadySynced
        : copy.value.autoSynced(ensured.data.version ?? undefined);
      await loadStatus(ensured.data.fileId);
      return;
    }

    const category = cloudSyncStore.docMap[cloudPath]?.category
      ?? defaultCategory.value
      ?? copy.value.defaultCategoryFallback;

    const result = await syncDocumentByPath({
      filePath,
      category,
      overwrite,
    });

    if (result.status === 'conflict') {
      needsOverwrite.value = true;
      phase.value = 'ready';
      return;
    }
    if (result.status === 'failed') {
      errorText.value = copy.value.syncFailed(result.message ?? '');
      phase.value = 'ready';
      return;
    }

    fileId.value = result.fileId
      ?? cloudSyncStore.docMap[cloudPath]?.fileId
      ?? null;
    phase.value = 'ready';
    // 明确告诉用户「分享前已自动同步」，避免误以为只有已同步文档才能分享
    notice.value = copy.value.autoSynced(result.version);
    void loadImageStatus(filePath, fileId.value ?? 0);
    if (fileId.value !== null) {
      await loadStatus(fileId.value);
    } else {
      errorText.value = copy.value.noCloudFile;
    }
  } catch (syncError) {
    errorText.value = copy.value.syncFailed(syncError instanceof Error ? syncError.message : String(syncError));
    phase.value = 'ready';
  } finally {
    busy.value = false;
  }
}

/**
 * 统计文档引用图片的同步情况：总张数 vs 云端已有（按 relPath + contentHash 比对）。
 * 用于分享前提示「有 N 张未同步，分享页会显示占位」。
 */
async function loadImageStatus(filePath: string, docFileId: number): Promise<void> {
  imageTotal.value = 0;
  imageSynced.value = 0;
  imagesDisabled.value = false;
  if (!isMarkdownPath(filePath) || isBinaryDocPath(filePath)) {
    return;
  }
  imagesDisabled.value = settingsStore.syncDocumentImages === false;
  try {
    const source = await cloudCommands.readSyncSource(filePath, 12 * 1024 * 1024);
    const refs = parseMarkdownImageRefs(source.content, filePath);
    imageTotal.value = refs.length;
    if (refs.length === 0) {
      return;
    }
    const [localInfo, remoteAssets] = await Promise.all([
      cloudCommands.inspectAssetSources(refs.map((ref) => ref.localPath)).catch(() => []),
      cloudCommands.assetsList(docFileId).catch(() => []),
    ]);
    const localByPath = new Map(localInfo.map((item) => [item.path.replace(/\\/g, '/'), item]));
    const remoteByRel = new Map(remoteAssets.map((asset) => [asset.relPath, asset]));
    let synced = 0;
    for (const ref of refs) {
      const local = localByPath.get(ref.localPath.replace(/\\/g, '/'));
      const remote = remoteByRel.get(ref.relPath);
      if (remote && local?.contentHash && remote.contentHash === local.contentHash) {
        synced += 1;
      } else if (remote && !local?.contentHash) {
        // 本地无法算哈希但云端已有同 relPath：按已同步计
        synced += 1;
      }
    }
    imageSynced.value = synced;
  } catch {
    imageTotal.value = 0;
    imageSynced.value = 0;
  }
}

async function loadStatus(id: number): Promise<void> {
  const outcome = await getShareStatus(id);
  if (!outcome.ok) {
    errorText.value = copy.value.failed(outcome.message);
    return;
  }
  const status = outcome.data;
  shared.value = Boolean(status.shared && (status.shareUrl || status.token));
  shareUrl.value = buildShareUrl(shareBaseUrl.value, status.token, status.shareUrl);
  token.value = status.token ?? '';
  createdAt.value = status.createdAt ?? null;
  expiresAt.value = status.expiresAt ?? null;
  hasPassword.value = Boolean(status.hasPassword);
  visitCount.value = status.visitCount ?? 0;
  fileKind.value = status.fileKind ?? fileKind.value;
  fileExt.value = status.fileExt ?? fileExt.value;
  if (shared.value) {
    void loadShareStats(id);
  } else {
    statsViews.value = null;
    statsVisitors.value = null;
  }
}

/** 打开统计弹窗（由 App 承载 ShareStatsDialog）。 */
function openStats(): void {
  if (fileId.value === null) {
    return;
  }
  emit('open-stats', { fileId: fileId.value, fileName: props.fileName });
}

/** 统计拉取失败不影响分享主流程：仅不展示统计行。 */
async function loadShareStats(targetId: number): Promise<void> {
  statsViews.value = null;
  statsVisitors.value = null;
  const outcome = await fetchShareStats(targetId, 30);
  if (!outcome.ok) {
    return;
  }
  statsViews.value = outcome.data.totalViews;
  statsVisitors.value = outcome.data.uniqueVisitors;
}

async function generate(regenerate: boolean): Promise<void> {
  const id = fileId.value;
  if (id === null || busy.value) {
    return;
  }
  busy.value = true;
  errorText.value = '';
  notice.value = '';
  try {
    const outcome = await createShare(id, {
      regenerate,
      expiresInDays: resolvedExpiresInDays(),
      password: regenerate ? null : resolvedPassword(),
    });
    if (!outcome.ok) {
      errorText.value = copy.value.failed(outcome.message);
      return;
    }
    const info = outcome.data;
    shared.value = true;
    token.value = info.token;
    shareUrl.value = buildShareUrl(shareBaseUrl.value, info.token, info.shareUrl);
    createdAt.value = info.createdAt;
    expiresAt.value = info.expiresAt;
    hasPassword.value = Boolean(info.hasPassword);
    visitCount.value = info.visitCount ?? 0;
    // 生成/复用分享后立即拉一次统计，弹窗内直接给出查看量与独立访客
    if (fileId.value !== null) {
      void loadShareStats(fileId.value);
    }
    fileKind.value = info.fileKind ?? fileKind.value;
    fileExt.value = info.fileExt ?? fileExt.value;
    emit('shared');
    if (!shareUrl.value) {
      // 域名没配好时不复制，避免把错误地址发给用户
      notice.value = copy.value.baseUrlMissing;
      return;
    }
    const copied = await copyTextToClipboard(shareUrl.value);
    notice.value = copied ? copy.value.copied : copy.value.copyManually;
  } catch (shareError) {
    errorText.value = copy.value.failed(shareError instanceof Error ? shareError.message : String(shareError));
  } finally {
    busy.value = false;
  }
}

async function copyLink(): Promise<void> {
  if (!shareUrl.value) {
    notice.value = copy.value.baseUrlMissing;
    return;
  }
  const copied = await copyTextToClipboard(shareUrl.value);
  notice.value = copied ? copy.value.copied : copy.value.copyManually;
}

async function openLink(): Promise<void> {
  if (!shareUrl.value) {
    return;
  }
  try {
    await appCommands.openExternalLink(shareUrl.value);
  } catch (openError) {
    errorText.value = copy.value.failed(openError instanceof Error ? openError.message : String(openError));
  }
}

async function revoke(): Promise<void> {
  const id = fileId.value;
  if (id === null || busy.value) {
    return;
  }
  busy.value = true;
  errorText.value = '';
  try {
    const outcome = await revokeShare(id);
    if (!outcome.ok) {
      errorText.value = copy.value.failed(outcome.message);
      return;
    }
    shared.value = false;
    shareUrl.value = '';
    token.value = '';
    createdAt.value = null;
    expiresAt.value = null;
    hasPassword.value = false;
    visitCount.value = 0;
    notice.value = copy.value.revoked;
    emit('shared');
  } catch (revokeError) {
    errorText.value = copy.value.failed(revokeError instanceof Error ? revokeError.message : String(revokeError));
  } finally {
    busy.value = false;
  }
}

function requestClose(): void {
  if (busy.value) {
    return;
  }
  emit('close');
}

async function bootstrap(): Promise<void> {
  resetState();
  const configOutcome = await fetchShareConfig();
  if (configOutcome.ok) {
    defaultCategory.value = configOutcome.data.defaultCategory ?? null;
    maxExpireDays.value = configOutcome.data.maxExpireDays && configOutcome.data.maxExpireDays > 0
      ? configOutcome.data.maxExpireDays
      : 3650;
  }
  shareBaseUrl.value = resolveShareBaseUrl(
    configOutcome.ok ? configOutcome.data : null,
    cloudSyncStore.baseUrl,
  );
  await startSync(false);
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void bootstrap();
    }
  },
  { immediate: true },
);

defineExpose({ generate, revoke, startSync });
</script>

<style scoped>
.share-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6vh 6vw;
  background: var(--bg-backdrop, rgba(8, 13, 26, 0.78));
}

.share-dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(560px, 100%);
  max-height: 100%;
  min-height: 0;
  padding: 14px 16px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-elevated, #151d2d);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--radius-dialog, 10px);
  box-shadow: var(--shadow-overlay, 0 24px 60px rgba(0, 0, 0, 0.45));
}

.share-dialog__header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.share-dialog__header h3 {
  flex-shrink: 0;
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
}

.share-dialog__file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 11.5px;
  color: var(--text-muted, #75829e);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-dialog__close {
  padding: 0 4px;
  font-size: 16px;
  line-height: 1;
  color: var(--text-secondary, #a8b3c5);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.share-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: auto;
}

.share-dialog__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.share-dialog__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary, #a8b3c5);
}

.share-dialog__expiry-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.share-dialog__chip {
  padding: 3px 10px;
  font-size: 11.5px;
  color: var(--text-secondary, #a8b3c5);
  cursor: pointer;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-badge, 999px);
}

.share-dialog__chip.is-selected {
  color: var(--accent-brand, #7cc7ff);
  border-color: var(--accent-brand, #7cc7ff);
  background: var(--surface-active, rgba(124, 199, 255, 0.14));
}

.share-dialog__input {
  width: 100%;
  padding: 5px 9px;
  font-size: 12px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-base, #101726);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.share-dialog__input--short {
  width: 86px;
}

.share-dialog__input:focus {
  border-color: var(--accent-brand, #7cc7ff);
  outline: none;
}

.share-dialog__stats {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 9px;
  font-size: 11.5px;
  color: var(--text-secondary, #a8b3c5);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border-radius: var(--radius-control, 5px);
}

.share-dialog__link-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.share-dialog__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
  font-size: 11px;
}

.share-dialog__meta dt {
  color: var(--text-muted, #75829e);
}

.share-dialog__meta dd {
  margin: 0;
  color: var(--text-secondary, #a8b3c5);
}

.share-dialog__block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--panel-base, #101726);
  border-radius: var(--radius-card, 7px);
}

.share-dialog__block--warn {
  border: 1px solid var(--state-warning, #fbbf24);
}

.share-dialog__block-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}

.share-dialog__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted, #75829e);
}

.share-dialog__hint--warn {
  color: var(--state-warning, #fbbf24);
}

.share-dialog__hint--error {
  color: var(--state-danger, #dc2626);
}

.share-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.share-dialog__footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
  border-top: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
}

.share-dialog__button {
  padding: 5px 12px;
  font-size: 11.5px;
  color: var(--text-primary, #e5e9f0);
  cursor: pointer;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.share-dialog__button:hover:not(:disabled) {
  border-color: var(--accent-brand, #7cc7ff);
  color: var(--accent-brand, #7cc7ff);
}

.share-dialog__button--primary {
  color: var(--accent-brand, #7cc7ff);
  border-color: var(--accent-brand, #7cc7ff);
}

.share-dialog__button--danger {
  color: var(--state-danger, #dc2626);
  border-color: var(--state-danger, #dc2626);
}

.share-dialog__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
