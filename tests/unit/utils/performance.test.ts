/**
 * Performance 工具单元测试
 * 测试性能监控功能
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceMonitor, getPerformanceMonitor } from '@/utils/performance';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    // 重置单例
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: any) => {
      cb(performance.now());
      return 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (monitor) {
      monitor.stop();
    }
  });

  describe('初始化', () => {
    it('应创建性能监控实例', () => {
      monitor = new PerformanceMonitor();
      expect(monitor).toBeDefined();
    });

    it('应记录启动时间', () => {
      monitor = new PerformanceMonitor();
      const report = monitor.getReport();
      expect(report.startupTime).toBeGreaterThanOrEqual(0);
    });

    it('应初始化默认指标', () => {
      monitor = new PerformanceMonitor();
      const report = monitor.getReport();

      expect(report.startupTime).toBeDefined();
      expect(report.firstPaint).toBe(0);
      expect(report.monacoLoadTime).toBe(0);
      expect(report.fileLoadTime).toEqual({});
      expect(report.memoryUsage).toBeNull();
      expect(report.frameDrops).toBe(0);
      expect(report.averageFPS).toBe(60);
      expect(report.typingLatency).toEqual([]);
    });
  });

  describe('文件加载时间记录', () => {
    it('应记录文件加载时间', () => {
      monitor = new PerformanceMonitor();
      monitor.recordFileLoadTime('/test/file.txt', 50, 100);

      const report = monitor.getReport();
      expect(report.fileLoadTime['<100KB']).toBeDefined();
    });

    it'应正确分类小文件 (<100KB)', () => {
      monitor = new PerformanceMonitor();
      monitor.recordFileLoadTime('/test/small.txt', 50, 100);

      const report = monitor.getReport();
      expect(report.fileLoadTime['<100KB']).toBeDefined();
    });

    it'应正确分类中等文件 (100-500KB)', () => {
      monitor = new PerformanceMonitor();
      monitor.recordFileLoadTime('/test/medium.txt', 200, 150);

      const report = monitor.getReport();
      expect(report.fileLoadTime['100-500KB']).toBeDefined();
    });

    it'应正确分类大文件 (500KB-1MB)', () => {
      monitor = new PerformanceMonitor();
      monitor.recordFileLoadTime('/test/large.txt', 800, 300);

      const report = monitor.getReport();
      expect(report.fileLoadTime['500KB-1MB']).toBeDefined();
    });

    it'应正确分类超大文件 (1-5MB)', () => {
      monitor = new PerformanceMonitor();
      monitor.recordFileLoadTime('/test/xlarge.txt', 2000, 500);

      const report = monitor.getReport();
      expect(report.fileLoadTime['1-5MB']).toBeDefined();
    });

    it'应正确分类巨型文件 (5-10MB)', () => {
      monitor = new PerformanceMonitor();
      monitor.recordFileLoadTime('/test/huge.txt', 8000, 1000);

      const report = monitor.getReport();
      expect(report.fileLoadTime['5-10MB']).toBeDefined();
    });

    it'应正确分类超巨型文件 (>10MB)', () => {
      monitor = new PerformanceMonitor();
      monitor.recordFileLoadTime('/test/massive.txt', 15000, 2000);

      const report = monitor.getReport();
      expect(report.fileLoadTime['>10MB']).toBeDefined();
    });

    it'应计算同一类别的平均加载时间', () => {
      monitor = new PerformanceMonitor();
      monitor.recordFileLoadTime('/test/file1.txt', 50, 100);
      monitor.recordFileLoadTime('/test/file2.txt', 60, 150);

      const report = monitor.getReport();
      // 应该是平均值
      expect(report.fileLoadTime['<100KB']).toBeCloseTo(125, 0);
    });
  });

  describe('打字延迟记录', () => {
    it'应记录打字延迟样本', () => {
      monitor = new PerformanceMonitor();
      monitor.recordTypingLatency(50);

      const report = monitor.getReport();
      expect(report.typingLatency).toHaveLength(1);
      expect(report.typingLatency[0]).toBe(50);
    });

    it'应记录多个延迟样本', () => {
      monitor = new PerformanceMonitor();
      monitor.recordTypingLatency(50);
      monitor.recordTypingLatency(60);
      monitor.recordTypingLatency(55);

      const report = monitor.getReport();
      expect(report.typingLatency).toHaveLength(3);
    });

    it'应限制样本数量为 100 个', () => {
      monitor = new PerformanceMonitor();

      // 添加 150 个样本
      for (let i = 0; i < 150; i++) {
        monitor.recordTypingLatency(i);
      }

      const report = monitor.getReport();
      expect(report.typingLatency).toHaveLength(100);
      // 应该保留最近的 100 个 (50-149)
      expect(report.typingLatency[0]).toBe(50);
      expect(report.typingLatency[99]).toBe(149);
    });

    it'应计算平均打字延迟', () => {
      monitor = new PerformanceMonitor();
      monitor.recordTypingLatency(50);
      monitor.recordTypingLatency(60);
      monitor.recordTypingLatency(70);

      const avgLatency = monitor.getAverageTypingLatency();
      expect(avgLatency).toBe(60);
    });

    it'无样本时平均延迟应为 0', () => {
      monitor = new PerformanceMonitor();
      const avgLatency = monitor.getAverageTypingLatency();
      expect(avgLatency).toBe(0);
    });
  });

  describe('Monaco 加载时间', () => {
    it'应记录 Monaco 加载时间', () => {
      monitor = new PerformanceMonitor();
      monitor.recordMonacoLoadTime(500);

      const report = monitor.getReport();
      expect(report.monacoLoadTime).toBe(500);
    });

    it'应覆盖之前的 Monaco 加载时间', () => {
      monitor = new PerformanceMonitor();
      monitor.recordMonacoLoadTime(500);
      monitor.recordMonacoLoadTime(300);

      const report = monitor.getReport();
      expect(report.monacoLoadTime).toBe(300);
    });
  });

  describe('性能报告', () => {
    it'应返回完整的性能报告', () => {
      monitor = new PerformanceMonitor();
      monitor.recordMonacoLoadTime(400);
      monitor.recordFileLoadTime('/test.txt', 50, 100);
      monitor.recordTypingLatency(55);

      const report = monitor.getReport();

      expect(report).toHaveProperty('startupTime');
      expect(report).toHaveProperty('firstPaint');
      expect(report).toHaveProperty('monacoLoadTime');
      expect(report).toHaveProperty('fileLoadTime');
      expect(report).toHaveProperty('memoryUsage');
      expect(report).toHaveProperty('frameDrops');
      expect(report).toHaveProperty('averageFPS');
      expect(report).toHaveProperty('typingLatency');
    });

    it'应返回对象的副本而非引用', () => {
      monitor = new PerformanceMonitor();
      const report1 = monitor.getReport();
      report1.startupTime = 9999;

      const report2 = monitor.getReport();
      expect(report2.startupTime).not.toBe(9999);
    });
  });

  describe('停止监控', () => {
    it'应停止性能监控', () => {
      monitor = new PerformanceMonitor();
      const stopSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');

      monitor.stop();

      expect(stopSpy).toHaveBeenCalled();
    });
  });
});

describe('getPerformanceMonitor', () => {
  it'应返回单例实例', () => {
    const monitor1 = getPerformanceMonitor();
    const monitor2 = getPerformanceMonitor();

    expect(monitor1).toBe(monitor2);
  });

  it'首次调用应创建新实例', () => {
    const monitor = getPerformanceMonitor();
    expect(monitor).toBeDefined();
    expect(monitor).toBeInstanceOf(PerformanceMonitor);
  });
});
