import { defineConfig, devices } from '@playwright/test'

/**
 * 阅读 Playwright 测试配置文档:
 * https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // 测试目录
  testDir: './tests/e2e/specs',
  
  // 测试文件匹配模式
  testMatch: '**/*.spec.ts',
  
  // 超时设置
  timeout: 60 * 1000,  // ⬆️ 从 30 秒增加到 60 秒，适应 E2E 测试
  expect: {
    timeout: 10000,    // ⬆️ 从 5 秒增加到 10 秒，避免偶发超时
  },
  
  // 失败重试
  retries: process.env.CI ? 2 : 0,
  
  // 并发执行
  workers: process.env.CI ? 1 : undefined,
  
  // 报告配置
  reporter: [
    ['html', { outputFolder: './playwright-report' }],
    ['junit', { outputFile: './test-results/junit-e2e.xml' }],
    ['list'],
  ],
  
  // 共享配置
  use: {
    // 基础 URL（用于相对路径）
    baseURL: 'http://localhost:5173',
    
    // 截图配置
    screenshot: 'only-on-failure',
    
    // 视频配置
    video: 'retain-on-failure',
    
    // 追踪配置
    trace: 'retain-on-failure',
    
    // 浏览器上下文
    actionTimeout: 15000,   // ⬆️ 从 10 秒增加到 15 秒
    navigationTimeout: 45000, // ⬆️ 从 30 秒增加到 45 秒
  },
  
  // 浏览器配置
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
      },
    },
    
    // 移动端测试
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  
  // Web 服务器配置（用于本地开发）
  webServer: {
    command: 'pnpm run dev',
    port: 5173,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    cwd: './frontend',
  },
  
  // 全局设置
  forbidOnly: !!process.env.CI,
  quiet: !!process.env.CI,
})
