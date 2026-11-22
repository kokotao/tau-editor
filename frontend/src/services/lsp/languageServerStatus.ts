/**
 * @description 语言服务器本机探测与前端状态模型。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 11:20
 */

import {
  isTauriApp,
  lspCommands,
  type LspServerProbe,
  type ManagedLspProbeResponse,
  type ManagedLspServerProbe,
} from '@/lib/tauri';
import {
  getManagedRuntimeAsset,
  LANGUAGE_SERVER_DESCRIPTORS,
  type LanguageServerDescriptor,
  type ManagedLspAsset,
} from './languageServerRegistry';
import type { ManagedLspProvisionResult } from '@/lib/tauri';

export interface LanguageServerStatus extends LanguageServerDescriptor {
  installed: boolean;
  available: boolean;
  path: string | null;
  version: string | null;
  reason: string | null;
  managedState: ManagedLspServerProbe['state'] | 'unsupported';
  managedPath: string | null;
  source: 'managed' | 'path' | 'unavailable';
  managedConfigured: boolean;
}

export const LSP_ASSET_MIRROR_BASE_URL = 'https://taueditor.lizipro.cn/tau-editor/lsp-assets/';

export function buildManagedAssetMirrorUrl(
  serverId: string,
  platformKey: string,
  asset: ManagedLspAsset,
): string {
  const filename = new URL(asset.downloadUrl).pathname.split('/').pop();
  if (!filename) throw new Error(`无法从下载地址解析资产文件名：${asset.downloadUrl}`);
  return new URL(`${platformKey}/${serverId}/${asset.version}/${filename}`, LSP_ASSET_MIRROR_BASE_URL).toString();
}

function unavailableReason(descriptor: LanguageServerDescriptor, managedConfigured: boolean): string {
  if (!managedConfigured) {
    return `${descriptor.command} 未在 PATH 中找到，当前平台暂无应用托管包；请安装后重新检测`;
  }
  return `语言服务尚未准备，打开对应项目时 Tau Editor 会自动下载；也可在设置中立即准备`;
}

export function mergeLanguageServerProbe(
  descriptor: LanguageServerDescriptor,
  probe?: LspServerProbe,
  managedProbe?: ManagedLspServerProbe,
  managedConfigured = Boolean(descriptor.managedAsset || descriptor.managedAssets),
): LanguageServerStatus {
  const managedReady = managedProbe?.state === 'ready' && Boolean(managedProbe.executablePath);
  const path = managedReady ? managedProbe?.executablePath ?? null : probe?.path ?? null;
  const available = managedReady || (probe?.available ?? false);
  return {
    ...descriptor,
    installed: managedReady || (probe?.installed ?? false),
    available,
    path,
    version: managedReady ? (managedProbe?.version ?? null) : (probe?.version ?? null),
    reason: managedReady ? null : (probe?.reason ?? (managedProbe?.reason ?? unavailableReason(descriptor, managedConfigured))),
    managedState: managedProbe?.state ?? 'unsupported',
    managedPath: managedProbe?.executablePath ?? null,
    source: managedReady ? 'managed' : (probe?.available ? 'path' : 'unavailable'),
    managedConfigured,
  };
}

async function probeManagedLanguageServers(): Promise<Map<string, ManagedLspServerProbe>> {
  try {
    const response: ManagedLspProbeResponse = await lspCommands.probeManaged();
    return new Map(response.servers.map((probe) => [probe.id, probe]));
  } catch {
    // 兼容尚未升级的后端：托管接口不可用时继续使用 PATH 探测。
    return new Map();
  }
}

async function managedPlatformKey(): Promise<string | null> {
  try {
    const platform = await lspCommands.platformInfo();
    return `${platform.platform}-${platform.arch}`;
  } catch {
    return null;
  }
}

export async function probeLanguageServers(): Promise<LanguageServerStatus[]> {
  if (!isTauriApp()) {
    return LANGUAGE_SERVER_DESCRIPTORS.map((descriptor) => mergeLanguageServerProbe(descriptor, {
      id: descriptor.id,
      languageIds: descriptor.languageIds,
      command: descriptor.command,
      installed: false,
      available: false,
      reason: 'Web 构建不支持探测本机语言服务器',
    }, undefined, false));
  }

  const [response, managed] = await Promise.all([
    lspCommands.probeServers(),
    probeManagedLanguageServers(),
  ]);
  const platformKey = await managedPlatformKey();
  const probes = new Map(response.servers.map((probe) => [probe.id, probe]));
  return LANGUAGE_SERVER_DESCRIPTORS.map((descriptor) => mergeLanguageServerProbe(
    descriptor,
    probes.get(descriptor.id),
    managed.get(descriptor.managedId ?? descriptor.id),
    Boolean(descriptor.managedAsset || (platformKey && descriptor.managedAssets?.[platformKey])),
  ));
}

export async function provisionLanguageServer(serverId: string): Promise<ManagedLspProvisionResult> {
  const descriptor = LANGUAGE_SERVER_DESCRIPTORS.find((item) => (item.managedId ?? item.id) === serverId);
  const platformKey = await managedPlatformKey();
  const asset: ManagedLspAsset | undefined = descriptor?.managedAssets?.[platformKey ?? ''] ?? descriptor?.managedAsset;
  if (!descriptor || !asset) {
    throw new Error(`语言服务器 ${serverId} 尚未配置受信任的应用资产，当前继续使用系统 PATH 或轻量导航`);
  }
  if (descriptor.managedRuntimeId) {
    const runtimeAsset = getManagedRuntimeAsset(descriptor.managedRuntimeId, platformKey ?? '');
    if (!runtimeAsset) throw new Error(`运行时 ${descriptor.managedRuntimeId} 尚未配置受信任资产`);
    await installManagedAsset(
      descriptor.managedRuntimeId,
      runtimeAsset,
      `准备 ${descriptor.displayName} 的运行时`,
      platformKey ?? '',
    );
  }
  for (const dependency of descriptor.managedDependencies ?? []) {
    const dependencyAsset = dependency.assets[platformKey ?? ''];
    if (!dependencyAsset) throw new Error(`依赖 ${dependency.id} 尚未配置当前平台资产`);
    await installManagedAsset(
      dependency.id,
      dependencyAsset,
      `准备 ${descriptor.displayName} 的依赖 ${dependency.id}`,
      platformKey ?? '',
    );
  }
  return installManagedAsset(
    descriptor.managedId ?? descriptor.id,
    asset,
    `准备 ${descriptor.displayName}`,
    platformKey ?? '',
  );
}

/**
 * @description 安装托管语言服务资产并保留阶段上下文，避免用户只能看到底层网络错误。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-04 00:00
 */
async function installManagedAsset(
  serverId: string,
  asset: ManagedLspAsset,
  stage: string,
  platformKey: string,
): Promise<ManagedLspProvisionResult> {
  const mirrorUrl = buildManagedAssetMirrorUrl(serverId, platformKey, asset);
  let lastError = '';
  for (const downloadUrl of [mirrorUrl, asset.downloadUrl]) {
    try {
      const result = await lspCommands.installServer({ serverId, ...asset, downloadUrl });
      if (result.state === 'failed' || result.installed === false || !result.executablePath) {
        const detail = result.error ?? result.message ?? '安装后未生成可执行文件';
        throw new Error(detail);
      }
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`${stage}失败：缓存源与官方源均未成功；${lastError}`);
}
