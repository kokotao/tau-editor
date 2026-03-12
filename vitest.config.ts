import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    // 测试环境
    environment: 'happy-dom',
    
    // 测试文件匹配模式
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['frontend/src/**/*.{ts,tsx,vue}'],
      exclude: [
        'frontend/src/**/*.d.ts',
        'frontend/src/main.ts',
        'frontend/src/main.tsx',
        'tests/**',
        '**/*.config.*',
      ],
      // 覆盖率阈值
      thresholds: {
        global: {
          branches: 70,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    
    // 全局测试配置
    globals: true,
    setupFiles: ['./tests/unit/setup.ts'],
    
    // Mock 配置
    mockReset: true,
    clearMocks: true,
    
    // 测试超时 (ms)
    testTimeout: 10000,
    
    // 并发执行
    pool: 'threads',
    
    // 报告配置
    reporters: ['default', 'html'],
    outputFile: {
      'html': './test-results/html/index.html',
      'junit': './test-results/junit.xml',
    },
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
      '@components': path.resolve(__dirname, './frontend/src/components'),
      '@hooks': path.resolve(__dirname, './frontend/src/hooks'),
      '@store': path.resolve(__dirname, './frontend/src/stores'),
      '@utils': path.resolve(__dirname, './frontend/src/utils'),
      '@types': path.resolve(__dirname, './frontend/src/types'),
    },
  },
})
