<script setup lang="ts">
/**
 * MindmapImportPreviewDialog（阶段 3）
 *
 * 在真正替换文档前展示：格式、版本、支持等级、有损字段、结构告警与失败原因。
 * 用户确认后才由上层执行替换；取消/失败时当前文档、选中与历史保持不变。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import type { MindmapImportPreview } from '@/services/mindmap/importExportService';

const props = defineProps<{
  visible: boolean;
  fileName: string;
  preview: MindmapImportPreview | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'confirm'): void;
}>();

const SUPPORT_LABEL: Record<string, string> = {
  native: '原生无损',
  compatible: '可编辑（可能有损）',
  'read-only': '只读',
  unsupported: '不支持',
};
</script>

<template>
  <div v-if="props.visible" class="mm-dialog-backdrop" data-testid="mm-import-backdrop" @click.self="emit('close')">
    <section class="mm-dialog" role="dialog" aria-modal="true" data-testid="mm-import-dialog">
      <h2 class="mm-dialog-title">导入思维导图</h2>
      <p class="mm-dialog-file">{{ props.fileName }}</p>

      <div v-if="props.preview" class="mm-import-body">
        <dl class="mm-import-meta">
          <div><dt>格式</dt><dd data-testid="mm-import-format">{{ props.preview.formatName }}</dd></div>
          <div><dt>版本</dt><dd>{{ props.preview.version ?? '未声明' }}</dd></div>
          <div>
            <dt>支持等级</dt>
            <dd>
              <span class="mm-badge" :data-level="props.preview.supportLevel">
                {{ SUPPORT_LABEL[props.preview.supportLevel] ?? props.preview.supportLevel }}
              </span>
            </dd>
          </div>
        </dl>

        <div v-if="props.preview.ok && props.preview.lossy.length" class="mm-import-section">
          <div class="mm-import-section-title">导入后会丢失/改写</div>
          <ul class="mm-import-list">
            <li v-for="item in props.preview.lossy" :key="item">{{ item }}</li>
          </ul>
        </div>

        <div v-if="props.preview.ok && props.preview.warnings.length" class="mm-import-section">
          <div class="mm-import-section-title">结构告警</div>
          <ul class="mm-import-list">
            <li v-for="(warning, index) in props.preview.warnings" :key="index">
              {{ warning.message }}
            </li>
          </ul>
        </div>

        <div v-if="!props.preview.ok" class="mm-import-error" data-testid="mm-import-error">
          <strong>无法导入：</strong>{{ props.preview.error?.message ?? '未知错误' }}
        </div>

        <p v-if="props.preview.ok" class="mm-import-hint">
          确认后将替换当前导图（可撤销）；不会修改源文件。
        </p>
      </div>

      <div class="mm-dialog-actions">
        <button type="button" class="mm-btn" data-testid="mm-import-cancel" @click="emit('close')">取消</button>
        <button
          type="button"
          class="mm-btn primary"
          data-testid="mm-import-confirm"
          :disabled="!props.preview?.ok || props.busy"
          @click="emit('confirm')"
        >
          {{ props.busy ? '导入中…' : '导入并替换' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 配色使用 Tau 主题 token：浮层用 --panel-elevated，状态色用 --state-* */
.mm-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: var(--bg-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}
.mm-dialog {
  width: min(520px, 92vw);
  max-height: 82vh;
  overflow: auto;
  background: var(--panel-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-dialog);
  padding: 18px 20px;
  box-shadow: var(--shadow-overlay);
  font-family: var(--font-ui);
}
.mm-dialog-title { margin: 0 0 6px; font-size: 16px; color: var(--text-primary); }
.mm-dialog-file { margin: 0 0 12px; font-size: 12px; color: var(--text-muted); word-break: break-all; }
.mm-import-meta { display: grid; gap: 6px; margin: 0 0 12px; }
.mm-import-meta > div { display: flex; gap: 10px; font-size: 13px; }
.mm-import-meta dt { width: 68px; color: var(--text-secondary); }
.mm-import-meta dd { margin: 0; color: var(--text-primary); }
.mm-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  background: var(--surface-active);
  color: var(--accent-brand-strong);
}
.mm-badge[data-level='native'] {
  background: var(--surface-active);
  color: var(--state-success);
}
.mm-badge[data-level='unsupported'] {
  background: var(--surface-active);
  color: var(--state-danger);
}
.mm-import-section { margin: 10px 0; }
.mm-import-section-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text-secondary);
}
.mm-import-list { margin: 0; padding-left: 18px; font-size: 12px; color: var(--text-secondary); }
.mm-import-error {
  margin: 10px 0;
  padding: 10px 12px;
  border-radius: var(--radius-card);
  background: var(--surface-active);
  color: var(--state-danger);
  font-size: 13px;
}
.mm-import-hint { font-size: 12px; color: var(--text-muted); margin: 10px 0 0; }
.mm-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.mm-btn {
  padding: 6px 14px;
  border-radius: var(--radius-control);
  border: 1px solid var(--border-soft);
  background: var(--panel-base);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 13px;
  cursor: pointer;
}
.mm-btn:hover:not(:disabled) { background: var(--surface-hover); }
.mm-btn.primary {
  background: var(--accent-brand);
  border-color: var(--accent-brand);
  color: var(--bg-app);
  font-weight: 600;
}
.mm-btn.primary:hover:not(:disabled) { background: var(--accent-brand-strong); }
.mm-btn:disabled { opacity: 0.5; cursor: default; }
</style>
