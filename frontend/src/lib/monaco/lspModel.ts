/**
 * @description Monaco 模型与可选 LSP Bridge 的生命周期适配，未配置 Bridge 时保持 no-op。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 10:25
 */

import * as monaco from '@/lib/monaco/editor';
import { getMonacoLspBridge, type MonacoLspModelContext } from '@/services/lsp/monacoLspBridge';

/** 将 Monaco 模型登记到 LSP Bridge；返回稳定文档 URI。 */
export function registerMonacoLspModel(
  model: monaco.editor.ITextModel,
  context: MonacoLspModelContext = {},
): string {
  const bridge = getMonacoLspBridge();
  if (bridge) return bridge.registerModel(model, context);
  return model.uri?.toString?.() || context.uri || '';
}

/** 清理 Monaco 模型对应的 LSP 文档会话。 */
export function unregisterMonacoLspModel(model: monaco.editor.ITextModel): void {
  getMonacoLspBridge()?.unregisterModel(model);
}

/** 将 Monaco 当前文本同步到 LSP；Bridge 未配置时保持 no-op。 */
export function syncMonacoLspModel(
  model: monaco.editor.ITextModel,
  context: MonacoLspModelContext = {},
): void {
  const bridge = getMonacoLspBridge();
  if (!bridge) return;
  bridge.registerModel(model, context);
  void bridge.syncModel(model).catch((error) => {
    console.warn('[MonacoLspModel] LSP 文档同步失败，编辑器保持可用：', error);
  });
}

/** 将当前 Monaco 模型同步为 LSP didSave；未配置 Bridge 时保持 no-op。 */
export function saveMonacoLspModel(model: monaco.editor.ITextModel): void {
  const bridge = getMonacoLspBridge();
  if (!bridge) return;
  void bridge.saveModel(model).catch((error) => {
    console.warn('[MonacoLspModel] LSP 文档保存通知失败，编辑器保持可用：', error);
  });
}
