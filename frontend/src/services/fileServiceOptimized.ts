/**
 * 优化的文件服务
 * 
 * 支持大文件分块加载、流式读取、缓存等优化
 */

import { fileCommands } from '@/lib/tauri';
import type { PerformanceMonitor } from '@/utils/performance';

// 分块大小配置
const CHUNK_SIZE = 1024 * 1024; // 1MB per chunk
const MAX_INITIAL_CHUNKS = 5;   // 初始加载最多 5 个 chunk

// 文件内容缓存
const fileCache = new Map<string, {
  content: string;
  timestamp: number;
  size: number;
}>();

// 缓存配置
const CACHE_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface LoadFileOptions {
  useCache?: boolean;
  chunked?: boolean;
  onProgress?: (loaded: number, total: number) => void;
  performanceMonitor?: PerformanceMonitor;
}

interface FileLoadResult {
  content: string;
  size: number;
  loadTime: number;
  chunked: boolean;
}

/**
 * 优化的文件加载函数
 * 
 * @param filePath 文件路径
 * @param options 加载选项
 * @returns 文件内容和元数据
 */
export async function loadFileOptimized(
  filePath: string,
  options: LoadFileOptions = {}
): Promise<FileLoadResult> {
  const {
    useCache = true,
    chunked = true,
    onProgress,
    performanceMonitor,
  } = options;
  
  const startTime = performance.now();
  
  // 1. 检查缓存
  if (useCache) {
    const cached = fileCache.get(filePath);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TTL) {
        console.log('[FileService] Cache hit:', filePath);
        return {
          content: cached.content,
          size: cached.size,
          loadTime: 0,
          chunked: false,
        };
      } else {
        // 缓存过期，删除
        fileCache.delete(filePath);
      }
    }
  }
  
  // 2. 获取文件大小
  let fileSize = 0;
  try {
    const fileInfo = await fileCommands.getFileInfo(filePath);
    fileSize = fileInfo.size;
  } catch (error) {
    console.warn('[FileService] Failed to get file size:', error);
  }
  
  // 3. 根据文件大小选择加载策略
  const shouldUseChunked = chunked && fileSize > CHUNK_SIZE;
  
  let content: string;
  
  if (shouldUseChunked) {
    // 分块加载大文件
    content = await loadFileChunked(filePath, fileSize, onProgress);
  } else {
    // 直接加载小文件
    content = await fileCommands.readFile(filePath);
  }
  
  const loadTime = performance.now() - startTime;
  
  // 4. 更新缓存
  if (useCache) {
    addToCache(filePath, content, fileSize);
  }
  
  // 5. 记录性能数据
  if (performanceMonitor) {
    performanceMonitor.recordFileLoadTime(filePath, fileSize / 1024, loadTime);
  }
  
  console.log(`[FileService] Loaded ${filePath} (${(fileSize / 1024).toFixed(2)}KB) in ${loadTime.toFixed(2)}ms`);
  
  return {
    content,
    size: fileSize,
    loadTime,
    chunked: shouldUseChunked,
  };
}

/**
 * 分块加载大文件
 */
async function loadFileChunked(
  filePath: string,
  totalSize: number,
  onProgress?: (loaded: number, total: number) => void
): Promise<string> {
  // 注意：当前 Tauri 后端不支持分块读取，这里先实现前端分片处理
  // TODO: 在 Tauri 后端实现 read_file_chunked 命令
  
  // 临时方案：一次性读取，但分片处理以支持进度回调
  const content = await fileCommands.readFile(filePath);
  
  if (onProgress && totalSize > 0) {
    // 模拟进度更新
    const chunks = Math.ceil(content.length / CHUNK_SIZE);
    for (let i = 0; i < chunks; i++) {
      const loaded = Math.min((i + 1) * CHUNK_SIZE, content.length);
      onProgress(loaded, content.length);
      // 让出主线程，避免阻塞 UI
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return content;
}

/**
 * 添加到缓存
 */
function addToCache(filePath: string, content: string, size: number) {
  // 检查缓存大小
  let currentSize = 0;
  fileCache.forEach(entry => {
    currentSize += entry.content.length;
  });
  
  // 如果缓存超限，清除最旧的条目
  while (currentSize + content.length > CACHE_MAX_SIZE && fileCache.size > 0) {
    const firstKey = fileCache.keys().next().value;
    if (firstKey) {
      const removed = fileCache.get(firstKey);
      if (removed) {
        currentSize -= removed.content.length;
      }
      fileCache.delete(firstKey);
    }
  }
  
  fileCache.set(filePath, {
    content,
    timestamp: Date.now(),
    size,
  });
}

/**
 * 清除文件缓存
 */
export function clearFileCache(filePath?: string) {
  if (filePath) {
    fileCache.delete(filePath);
  } else {
    fileCache.clear();
  }
}

/**
 * 预加载文件到缓存
 */
export async function preloadFile(filePath: string) {
  try {
    await loadFileOptimized(filePath, { useCache: true });
  } catch (error) {
    console.warn('[FileService] Preload failed:', filePath, error);
  }
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats() {
  let totalSize = 0;
  fileCache.forEach(entry => {
    totalSize += entry.content.length;
  });
  
  return {
    fileCount: fileCache.size,
    totalSizeKB: Math.round(totalSize / 1024),
    maxSizeKB: Math.round(CACHE_MAX_SIZE / 1024),
  };
}
