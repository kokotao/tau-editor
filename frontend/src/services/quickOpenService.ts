export interface QuickOpenFile {
  path: string;
  name: string;
}

export function rankQuickOpenFiles(files: QuickOpenFile[], query: string): QuickOpenFile[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [...files].sort((left, right) => left.name.localeCompare(right.name));
  }

  return files
    .map((file) => {
      const name = file.name.toLowerCase();
      const path = file.path.toLowerCase();
      const nameIndex = name.indexOf(normalizedQuery);
      const pathIndex = path.indexOf(normalizedQuery);
      const score = nameIndex >= 0 ? nameIndex : pathIndex >= 0 ? 100 + pathIndex : Number.POSITIVE_INFINITY;
      return { file, score };
    })
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => left.score - right.score || left.file.name.localeCompare(right.file.name))
    .map((item) => item.file);
}
