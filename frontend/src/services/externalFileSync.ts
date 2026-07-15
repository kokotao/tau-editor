export type ExternalFileSyncAction = 'noop' | 'flag' | 'reload';

export interface ExternalFileSyncDecisionInput {
  filePath: string | null;
  isUntitled: boolean;
  isLoadingContent?: boolean;
  isDirty: boolean;
  lastKnownModified?: number | null;
  externalModifiedAt?: number | null;
  observedModified: number | null;
}

export function normalizeModifiedTimestamp(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

export function resolveExternalFileSyncAction(input: ExternalFileSyncDecisionInput): ExternalFileSyncAction {
  if (!input.filePath || input.isUntitled || input.isLoadingContent || input.observedModified === null) {
    return 'noop';
  }

  if (!input.isDirty && input.externalModifiedAt !== null && input.externalModifiedAt !== undefined) {
    return 'reload';
  }

  if (input.lastKnownModified === null || input.lastKnownModified === undefined) {
    return 'noop';
  }

  if (
    input.observedModified === input.lastKnownModified
    || input.observedModified === input.externalModifiedAt
  ) {
    return 'noop';
  }

  return input.isDirty ? 'flag' : 'reload';
}
