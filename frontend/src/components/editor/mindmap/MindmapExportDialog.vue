<script setup lang="ts">
/**
 * MindmapExportDialog（阶段 3）
 *
 * 选择导出格式；PNG 额外提供背景与倍率：
 * - 背景：透明 / 纯白；
 * - 倍率：1x / 2x / 3x（超限由导出管线给出错误提示）。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { computed, ref, watch } from 'vue';
import {
  MINDMAP_EXPORT_FORMATS,
  type MindmapExportFormatId,
} from '@/services/mindmap/importExportService';
import { canExportMindmapFormat } from '@/services/mindmapExportService';

const props = defineProps<{
  visible: boolean;
  defaultFormat?: MindmapExportFormatId;
  busy?: boolean;
  errorMessage?: string;
  /** 由调用方传入真实会员档位；缺省按 FREE 处理。 */
  membershipTier?: unknown;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'membership-required', payload: { feature: string; reason: string }): void;
  (event: 'confirm', payload: {
    formatId: MindmapExportFormatId;
    background: 'transparent' | string;
    scale: number;
    colorMode: 'monochrome' | 'color';
    customWatermark?: string;
  }): void;
}>();

const initialFormat = () => props.defaultFormat && canExportMindmapFormat(props.defaultFormat, props.membershipTier)
  ? props.defaultFormat : 'taumap';
const formatId = ref<MindmapExportFormatId>(initialFormat());
const background = ref<'transparent' | string>('transparent');
const scale = ref(2);
const colorMode = ref<'monochrome' | 'color'>('monochrome');
const customWatermark = ref('');
const canExportColor = computed(() => props.membershipTier === 'PLUS' || props.membershipTier === 'PRO');
const canCustomizeWatermark = computed(() => props.membershipTier === 'PLUS' || props.membershipTier === 'PRO');
const isVisualExport = computed(() => ['png', 'jpg', 'svg', 'pdf'].includes(formatId.value));
const watermarkEnabled = computed(() => isVisualExport.value && !canExportColor.value);
const isFormatAllowed = (id: MindmapExportFormatId) => canExportMindmapFormat(id, props.membershipTier);

watch(canExportColor, (allowed) => {
  if (!allowed) colorMode.value = 'monochrome';
});
watch(() => props.membershipTier, () => {
  if (!isFormatAllowed(formatId.value)) formatId.value = 'taumap';
});

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      formatId.value = initialFormat();
      background.value = 'transparent';
      scale.value = 2;
      colorMode.value = 'monochrome';
      customWatermark.value = '';
    }
  },
);

const isPng = computed(() => formatId.value === 'png' || formatId.value === 'jpg');
const selected = computed(() => MINDMAP_EXPORT_FORMATS.find((format) => format.id === formatId.value));
</script>

<template>
  <div v-if="props.visible" class="mm-dialog-backdrop" data-testid="mm-export-backdrop" @click.self="emit('close')">
    <section class="mm-dialog" role="dialog" aria-modal="true" data-testid="mm-export-dialog">
      <h2 class="mm-dialog-title">导出思维导图</h2>

      <p v-if="props.errorMessage" class="mm-export-error" role="alert" data-testid="mm-export-error">{{ props.errorMessage }}</p>

      <div class="mm-export-formats" role="radiogroup" aria-label="导出格式">
        <label
          v-for="format in MINDMAP_EXPORT_FORMATS"
          :key="format.id"
          class="mm-export-option"
          :class="{ 'is-selected': format.id === formatId, 'is-locked': !isFormatAllowed(format.id) }"
          :title="isFormatAllowed(format.id) ? format.label : '当前会员等级暂不支持，点击查看升级权益'"
          @click="!isFormatAllowed(format.id) && emit('membership-required', { feature: `${format.extension.toUpperCase()} 导出`, reason: '升级会员即可解锁该导出格式。' })"
        >
          <input
            type="radio"
            name="mm-export-format"
            :value="format.id"
            :checked="format.id === formatId"
            :disabled="!isFormatAllowed(format.id)"
            :data-testid="`mm-export-format-${format.id}`"
            @change="formatId = format.id as MindmapExportFormatId"
          />
          <span>{{ format.label }}</span>
        </label>
      </div>

      <div v-if="isVisualExport" class="mm-export-visual-options" data-testid="mm-export-visual-options">
        <div class="mm-export-row">
          <span class="mm-export-label">颜色</span>
          <label class="mm-export-inline">
            <input type="radio" name="mm-export-color-mode" value="monochrome" :checked="colorMode === 'monochrome'" data-testid="mm-export-color-monochrome" @change="colorMode = 'monochrome'" />
            单色
          </label>
          <label class="mm-export-inline" :class="{ 'is-disabled': !canExportColor }" :title="canExportColor ? '' : '彩色导出仅限 PLUS / PRO 会员'" @click="!canExportColor && emit('membership-required', { feature: '彩色视觉导出', reason: 'Plus / Pro 支持无水印彩色 PNG、SVG 与 PDF 导出。' })">
            <input type="radio" name="mm-export-color-mode" value="color" :checked="colorMode === 'color'" :disabled="!canExportColor" data-testid="mm-export-color-color" @change="colorMode = 'color'" />
            彩色<span v-if="!canExportColor" class="mm-export-paid-tag">PLUS / PRO</span>
          </label>
        </div>
        <p v-if="watermarkEnabled" class="mm-export-hint" data-testid="mm-export-watermark-notice">免费档视觉导出会包含 TauEditor 水印。</p>
        <label v-if="canCustomizeWatermark" class="mm-export-watermark-field">
          <span class="mm-export-label">水印</span>
          <input v-model="customWatermark" class="mm-export-watermark-input" maxlength="40" placeholder="可选，例如：我的知识库" data-testid="mm-export-custom-watermark">
          <span class="mm-export-hint">留空则不添加水印；填写后使用自定义水印</span>
        </label>
      </div>

      <div v-if="isPng" class="mm-export-png-options" data-testid="mm-export-png-options">
        <div v-if="formatId === 'png'" class="mm-export-row">
          <span class="mm-export-label">背景</span>
          <label class="mm-export-inline">
            <input
              type="radio"
              name="mm-export-bg"
              value="transparent"
              :checked="background === 'transparent'"
              data-testid="mm-export-bg-transparent"
              @change="background = 'transparent'"
            />
            透明
          </label>
          <label class="mm-export-inline">
            <input
              type="radio"
              name="mm-export-bg"
              value="#ffffff"
              :checked="background === '#ffffff'"
              data-testid="mm-export-bg-white"
              @change="background = '#ffffff'"
            />
            纯白
          </label>
        </div>
        <div class="mm-export-row">
          <span class="mm-export-label">倍率</span>
          <label v-for="value in [1, 2, 3]" :key="value" class="mm-export-inline">
            <input
              type="radio"
              name="mm-export-scale"
              :value="value"
              :checked="scale === value"
              @change="scale = value"
            />
            {{ value }}x
          </label>
        </div>
        <p class="mm-export-hint">完整地图会按内容尺寸导出（不是当前视口裁切）；超大图会提示降倍率。</p>
      </div>

      <div class="mm-dialog-actions">
        <button type="button" class="mm-btn" data-testid="mm-export-cancel" @click="emit('close')">取消</button>
        <button
          type="button"
          class="mm-btn primary"
          data-testid="mm-export-confirm"
          :disabled="props.busy"
          @click="emit('confirm', { formatId, background, scale, colorMode: canExportColor ? colorMode : 'monochrome', customWatermark: canCustomizeWatermark ? customWatermark.trim() : undefined })"
        >
          {{ props.busy ? '导出中…' : `导出 ${selected?.extension ? '.' + selected.extension : ''}` }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 配色使用 Tau 主题 token：浮层用 --panel-elevated，边框/文字/强调全部取真实变量 */
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
  width: min(460px, 92vw);
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
.mm-dialog-title { margin: 0 0 12px; font-size: 16px; color: var(--text-primary); }
.mm-export-error { margin: 0 0 12px; padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--state-danger) 42%, transparent); border-radius: 5px; background: color-mix(in srgb, var(--state-danger) 10%, var(--panel-base)); color: var(--state-danger); font-size: 13px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.mm-export-formats { display: grid; gap: 6px; }
.mm-export-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-soft);
  background: var(--panel-base);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}
.mm-export-option:hover { background: var(--surface-hover); }
.mm-export-option.is-selected {
  border-color: var(--accent-brand);
  background: var(--surface-active);
  color: var(--text-primary);
}
.mm-export-option.is-locked { color: var(--text-muted); opacity: .72; }
.mm-export-option.is-locked:hover { background: var(--surface-active); }
.mm-export-visual-options { margin-top: 12px; display: grid; gap: 8px; }
.mm-export-paid-tag { margin-left: 3px; color: var(--text-muted); font-size: 10px; }
.mm-export-inline.is-disabled { color: var(--text-muted); cursor: not-allowed; }
.mm-export-png-options { margin-top: 12px; display: grid; gap: 8px; }
.mm-export-row { display: flex; align-items: center; gap: 12px; font-size: 13px; }
.mm-export-label { width: 40px; color: var(--text-secondary); }
.mm-export-inline { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
.mm-export-watermark-field { display: flex; align-items: center; gap: 8px; }
.mm-export-watermark-input { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--border-soft); border-radius: var(--radius-control); background: var(--panel-base); color: var(--text-primary); font: 12px var(--font-ui); }
.mm-export-hint { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
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
