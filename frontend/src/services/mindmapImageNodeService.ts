/**
 * Optional image-node extension for mind maps.
 *
 * Image nodes are intentionally stored under opaqueExtensions so the v1
 * canonical topic/store contracts stay unchanged. This module owns the
 * extension schema, membership gate, validation, and immutable commands.
 */
import {
  cloneMindMapDocument,
  generateTopicId,
} from "@/services/mindmapService";
import type { MindMapDocument } from "@/types/mindmap";

export const MINDMAP_IMAGE_NODES_EXTENSION = "tau.imageNodes";
export const MINDMAP_IMAGE_NODES_VERSION = 1;
export const MINDMAP_IMAGE_NODE_MIN_SIZE = 32;
export const MINDMAP_IMAGE_NODE_MAX_SIZE = 640;
export const MINDMAP_IMAGE_NODE_MAX_DATA_BYTES = 5 * 1024 * 1024;

export type MindmapMembershipTier = "FREE" | "PLUS" | "PRO";

export interface MindmapImageNode {
  id: string;
  topicId: string;
  src: string;
  alt?: string;
  width: number;
  height: number;
  objectFit?: "contain" | "cover";
}

export interface MindmapImageNodesExtension {
  version: typeof MINDMAP_IMAGE_NODES_VERSION;
  nodes: MindmapImageNode[];
}

export type MindmapImageNodeCommandErrorCode =
  | "MEMBERSHIP_REQUIRED"
  | "TOPIC_NOT_FOUND"
  | "INVALID_IMAGE"
  | "IMAGE_NOT_FOUND";

export interface MindmapImageNodeCommandError {
  code: MindmapImageNodeCommandErrorCode;
  message: string;
}

export type MindmapImageNodeCommandResult =
  | { ok: true; document: MindMapDocument; imageNode?: MindmapImageNode }
  | { ok: false; error: MindmapImageNodeCommandError };

/** Image nodes are a paid capability; FREE users can still open documents. */
export function canUseMindmapImageNodes(tier: MindmapMembershipTier): boolean {
  return tier === "PLUS" || tier === "PRO";
}

function fail(
  code: MindmapImageNodeCommandErrorCode,
  message: string,
): MindmapImageNodeCommandResult {
  return { ok: false, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampSize(value: unknown, fallback: number): number {
  const number =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.round(
    Math.max(
      MINDMAP_IMAGE_NODE_MIN_SIZE,
      Math.min(MINDMAP_IMAGE_NODE_MAX_SIZE, number),
    ),
  );
}

/** Only renderable image references are accepted by the extension. */
export function normalizeMindmapImageSource(value: unknown): string | null {
  const source = String(value ?? "").trim();
  if (!source || source.length > 4096 && !source.startsWith("data:")) return null;
  if (
    /^https?:\/\//i.test(source) ||
    /^data:image\/(?:png|jpe?g|gif|webp);/i.test(source)
  ) {
    return validateMindmapImageSourceSize(source) ? source : null;
  }
  // Relative paths are useful for local workspace assets and cloud asset URLs.
  const segments = source.replace(/\\/g, "/").split("/");
  if (
    !source.startsWith("/") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(source) &&
    !source.startsWith("\\") &&
    !segments.includes("..")
  ) {
    return source;
  }
  return null;
}

/** Reject oversized inline assets before they inflate the document JSON. */
export function validateMindmapImageSourceSize(source: string): boolean {
  if (!source.startsWith("data:")) return true;
  const comma = source.indexOf(",");
  if (comma < 0) return false;
  const header = source.slice(0, comma);
  const payload = source.slice(comma + 1);
  try {
    const bytes = /;base64/i.test(header)
      ? Math.floor((payload.length * 3) / 4) - (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0)
      : new TextEncoder().encode(decodeURIComponent(payload)).length;
    return bytes <= MINDMAP_IMAGE_NODE_MAX_DATA_BYTES;
  } catch {
    return false;
  }
}

function normalizeNode(value: unknown): MindmapImageNode | null {
  if (!isRecord(value)) return null;
  const id = String(value.id ?? "").trim();
  const topicId = String(value.topicId ?? "").trim();
  const src = normalizeMindmapImageSource(value.src);
  if (!id || !topicId || !src) return null;
  const objectFit = value.objectFit === "cover" ? "cover" : "contain";
  const alt = String(value.alt ?? "").trim();
  return {
    id,
    topicId,
    src,
    ...(alt ? { alt } : {}),
    width: clampSize(value.width, 160),
    height: clampSize(value.height, 120),
    objectFit,
  };
}

/** Read and sanitize extension data without mutating the source document. */
export function getMindmapImageNodes(
  document: MindMapDocument,
): MindmapImageNode[] {
  const raw = document.opaqueExtensions?.[MINDMAP_IMAGE_NODES_EXTENSION];
  if (
    !isRecord(raw) ||
    raw.version !== MINDMAP_IMAGE_NODES_VERSION ||
    !Array.isArray(raw.nodes)
  ) {
    return [];
  }
  const topicIds = new Set(Object.keys(document.topics));
  const seen = new Set<string>();
  return raw.nodes
    .map(normalizeNode)
    .filter((node): node is MindmapImageNode => {
      if (!node || seen.has(node.id) || !topicIds.has(node.topicId))
        return false;
      seen.add(node.id);
      return true;
    });
}

function withImageNodes(
  document: MindMapDocument,
  nodes: MindmapImageNode[],
): MindMapDocument {
  const next = cloneMindMapDocument(document);
  next.opaqueExtensions = { ...(next.opaqueExtensions ?? {}) };
  next.opaqueExtensions[MINDMAP_IMAGE_NODES_EXTENSION] = {
    version: MINDMAP_IMAGE_NODES_VERSION,
    nodes,
  } satisfies MindmapImageNodesExtension;
  return next;
}

function validateImageInput(
  document: MindMapDocument,
  topicId: string,
  src: string,
): MindmapImageNodeCommandError | null {
  if (!document.topics[topicId])
    return { code: "TOPIC_NOT_FOUND", message: `节点 ${topicId} 不存在` };
  if (!normalizeMindmapImageSource(src)) {
    return { code: "INVALID_IMAGE", message: "图片地址不是可渲染的图片引用" };
  }
  return null;
}

export function addMindmapImageNode(
  document: MindMapDocument,
  topicId: string,
  input: {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
    objectFit?: "contain" | "cover";
  },
  tier: MindmapMembershipTier,
): MindmapImageNodeCommandResult {
  if (!canUseMindmapImageNodes(tier)) {
    return fail("MEMBERSHIP_REQUIRED", "图片节点仅对 PLUS / PRO 会员开放");
  }
  const validationError = validateImageInput(document, topicId, input.src);
  if (validationError) return { ok: false, error: validationError };
  const nodes = getMindmapImageNodes(document);
  const imageNode: MindmapImageNode = {
    id: `img_${generateTopicId()}`,
    topicId,
    src: normalizeMindmapImageSource(input.src) as string,
    ...(input.alt?.trim() ? { alt: input.alt.trim() } : {}),
    width: clampSize(input.width, 160),
    height: clampSize(input.height, 120),
    objectFit: input.objectFit === "cover" ? "cover" : "contain",
  };
  return {
    ok: true,
    document: withImageNodes(document, [...nodes, imageNode]),
    imageNode,
  };
}

export function removeMindmapImageNode(
  document: MindMapDocument,
  imageNodeId: string,
  tier: MindmapMembershipTier,
): MindmapImageNodeCommandResult {
  if (!canUseMindmapImageNodes(tier)) {
    return fail("MEMBERSHIP_REQUIRED", "图片节点仅对 PLUS / PRO 会员开放");
  }
  const nodes = getMindmapImageNodes(document);
  if (!nodes.some((node) => node.id === imageNodeId)) {
    return fail("IMAGE_NOT_FOUND", `图片节点 ${imageNodeId} 不存在`);
  }
  return {
    ok: true,
    document: withImageNodes(
      document,
      nodes.filter((node) => node.id !== imageNodeId),
    ),
  };
}

/** Build a renderer-safe extension payload for persistence/integration code. */
export function serializeMindmapImageNodes(
  nodes: readonly MindmapImageNode[],
): MindmapImageNodesExtension {
  return {
    version: MINDMAP_IMAGE_NODES_VERSION,
    nodes: nodes.map((node) => ({ ...node })),
  };
}
