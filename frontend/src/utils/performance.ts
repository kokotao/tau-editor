/**
 * 性能监控工具
 * 
 * 提供性能指标收集、分析和报告功能
 */

interface PerformanceMetrics {
  // 加载时间
  startupTime: number;          // 启动时间 (ms)
  firstPaint: number;           // 首次绘制 (ms)
  monacoLoadTime: number;       // Monaco 加载时间 (ms)
  
  // 文件加载
  fileLoadTime: Record<string, number>;  // 文件加载时间 (按大小分类)
  
  // 内存使用
  memoryUsage: {
    jsHeapSize: number;         // JS 堆大小 (MB)
    usedJSHeapSize: number;     // 已用 JS 堆 (MB)
  } | null;
  
  // 渲染性能
  frameDrops: number;           // 掉帧次数
  averageFPS: number;           // 平均 FPS
  
  // 打字延迟
  typingLatency: number[];      // 打字延迟样本 (ms)
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    startupTime: 0,
    firstPaint: 0,
    monacoLoadTime: 0,
    fileLoadTime: {},
    memoryUsage: null,
    frameDrops: 0,
    averageFPS: 60,
    typingLatency: [],
  };
  
  private startTime: number = Date.now();
  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private rafId: number | null = null;
  
  constructor() {
    this.startMonitoring();
  }
  
  /**
   * 开始性能监控
   */
  startMonitoring() {
    // 记录启动时间
    this.metrics.startupTime = Date.now() - this.startTime;
    
    // 监听首次绘制
    this.observeFirstPaint();
    
    // 开始 FPS 监控
    this.monitorFPS();
    
    // 定期收集内存数据
    this.collectMemoryUsage();
  }
  
  /**
   * 观察首次绘制
   */
  private observeFirstPaint() {
    if (typeof PerformanceObserver !== 'undefined') {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-paint' || entry.name === 'first-contentful-paint') {
            this.metrics.firstPaint = entry.startTime;
            console.log('[Performance] First Paint:', entry.startTime.toFixed(2), 'ms');
          }
        }
      });
      
      try {
        observer.observe({ entryTypes: ['paint'] });
      } catch (e) {
        // 浏览器不支持
      }
    }
  }
  
  /**
   * 监控 FPS
   */
  private monitorFPS() {
    let frames = 0;
    let prevTime = performance.now();
    
    const measureFrame = (currentTime: number) => {
      frames++;
      
      if (currentTime - prevTime >= 1000) {
        const fps = Math.round((frames * 1000) / (currentTime - prevTime));
        this.metrics.averageFPS = fps;
        
        // 检测掉帧 (低于 30 FPS)
        if (fps < 30) {
          this.metrics.frameDrops++;
        }
        
        frames = 0;
        prevTime = currentTime;
      }
      
      this.rafId = requestAnimationFrame(measureFrame);
    };
    
    this.rafId = requestAnimationFrame(measureFrame);
  }
  
  /**
   * 收集内存使用情况
   */
  private collectMemoryUsage() {
    const collect = () => {
      // @ts-ignore - performance.memory 是非标准 API
      if (performance.memory) {
        // @ts-ignore
        const memory = performance.memory;
        this.metrics.memoryUsage = {
          jsHeapSize: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
          usedJSHeapSize: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        };
      }
      
      // 每 5 秒收集一次
      setTimeout(collect, 5000);
    };
    
    collect();
  }
  
  /**
   * 记录文件加载时间
   */
  recordFileLoadTime(filePath: string, sizeKB: number, timeMs: number) {
    const sizeCategory = this.categorizeFileSize(sizeKB);
    if (!this.metrics.fileLoadTime[sizeCategory]) {
      this.metrics.fileLoadTime[sizeCategory] = 0;
    }
    // 记录平均时间
    const count = Object.keys(this.metrics.fileLoadTime).length;
    this.metrics.fileLoadTime[sizeCategory] = 
      (this.metrics.fileLoadTime[sizeCategory] * (count - 1) + timeMs) / count;
    
    console.log(`[Performance] File loaded: ${filePath} (${sizeKB}KB) in ${timeMs.toFixed(2)}ms`);
  }
  
  /**
   * 分类文件大小
   */
  private categorizeFileSize(sizeKB: number): string {
    if (sizeKB < 100) return '<100KB';
    if (sizeKB < 500) return '100-500KB';
    if (sizeKB < 1000) return '500KB-1MB';
    if (sizeKB < 5000) return '1-5MB';
    if (sizeKB < 10000) return '5-10MB';
    return '>10MB';
  }
  
  /**
   * 记录打字延迟
   */
  recordTypingLatency(latencyMs: number) {
    this.metrics.typingLatency.push(latencyMs);
    
    // 保留最近 100 个样本
    if (this.metrics.typingLatency.length > 100) {
      this.metrics.typingLatency.shift();
    }
  }
  
  /**
   * 获取平均打字延迟
   */
  getAverageTypingLatency(): number {
    if (this.metrics.typingLatency.length === 0) return 0;
    const sum = this.metrics.typingLatency.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.metrics.typingLatency.length);
  }
  
  /**
   * 记录 Monaco 加载时间
   */
  recordMonacoLoadTime(timeMs: number) {
    this.metrics.monacoLoadTime = timeMs;
    console.log('[Performance] Monaco loaded in', timeMs.toFixed(2), 'ms');
  }
  
  /**
   * 获取性能报告
   */
  getReport(): PerformanceMetrics {
    return { ...this.metrics };
  }
  
  /**
   * 打印性能报告到控制台
   */
  printReport() {
    console.group('📊 Performance Report');
    console.log('Startup Time:', this.metrics.startupTime.toFixed(2), 'ms');
    console.log('First Paint:', this.metrics.firstPaint.toFixed(2), 'ms');
    console.log('Monaco Load Time:', this.metrics.monacoLoadTime.toFixed(2), 'ms');
    console.log('Average FPS:', this.metrics.averageFPS);
    console.log('Frame Drops:', this.metrics.frameDrops);
    
    if (this.metrics.memoryUsage) {
      console.log('JS Heap Size:', this.metrics.memoryUsage.jsHeapSize, 'MB');
      console.log('Used JS Heap:', this.metrics.memoryUsage.usedJSHeapSize, 'MB');
    }
    
    console.log('File Load Times:', this.metrics.fileLoadTime);
    console.log('Average Typing Latency:', this.getAverageTypingLatency(), 'ms');
    console.groupEnd();
  }
  
  /**
   * 停止监控
   */
  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

// 单例实例
let instance: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}

export { PerformanceMonitor };
export default getPerformanceMonitor;
