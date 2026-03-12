# Tauri Store 使用指南

## 快速参考

### Editor Store - 文件读写

```typescript
import { useEditorStore } from '@/stores/editor';

const editorStore = useEditorStore();

// 读取并加载文件
await editorStore.loadFile('/path/to/file.txt');

// 直接读取文件内容
const content = await editorStore.readFile('/path/to/file.txt');

// 保存文件
await editorStore.saveFile('/path/to/file.txt');

// 直接写入文件
await editorStore.writeFile('/path/to/file.txt', 'content');
```

### File System Store - 文件管理

```typescript
import { useFileSystemStore } from '@/stores/fileSystem';

const fileSystemStore = useFileSystemStore();

// 设置工作目录
await fileSystemStore.setRootPath('/path/to/workdir');

// 刷新文件树
await fileSystemStore.refreshFileTree();

// 读取文件内容
const content = await fileSystemStore.readFileContent('/path/to/file.txt');

// 写入文件内容
await fileSystemStore.writeFileContent('/path/to/file.txt', 'content');

// 创建新文件
await fileSystemStore.createNewFile('/path/to/newfile.txt');

// 删除文件/文件夹
await fileSystemStore.deleteFileOrFolder('/path/to/item');

// 重命名文件
await fileSystemStore.renameFileOrFolder('/old/path', '/new/path');

// 切换文件夹展开
await fileSystemStore.toggleFolder('/path/to/folder');
```

### Settings Store - 设置管理

```typescript
import { useSettingsStore } from '@/stores/settings';

const settingsStore = useSettingsStore();

// 初始化 (加载设置 + 应用主题)
await settingsStore.init();

// 加载设置
await settingsStore.loadSettings();

// 保存设置
await settingsStore.saveSettings();

// 更新设置 (自动同步)
await settingsStore.updateSettings({
  theme: 'dark',
  fontSize: 16,
  autoSaveEnabled: true,
  autoSaveInterval: 60,
});

// 重置为默认值
await settingsStore.resetToDefaults();
```

## 错误处理

所有方法都包含错误处理，使用时建议用 try/catch：

```typescript
try {
  await editorStore.loadFile('/path/to/file.txt');
} catch (error) {
  console.error('操作失败:', error);
  // 显示用户友好的错误提示
}
```

## 配合 FileService 使用

推荐使用 FileService 来协调多个 store：

```typescript
import { createFileService } from '@/services/fileService';
import { useEditorStore } from '@/stores/editor';
import { useTabsStore } from '@/stores/tabs';
import { useFileSystemStore } from '@/stores/fileSystem';

const editorStore = useEditorStore();
const tabsStore = useTabsStore();
const fileSystemStore = useFileSystemStore();

const fileService = createFileService(editorStore, tabsStore, fileSystemStore);

// 打开文件 (自动创建标签)
const result = await fileService.openFile('/path/to/file.txt');

// 保存文件
const result = await fileService.saveFile();

// 创建文件
const result = await fileService.createFile('/path/to/newfile.txt');
```

## 日志输出

所有操作都有详细的日志：

- `[Editor]` - 编辑器操作
- `[Settings]` - 设置操作
- 文件树操作直接在 console 中

打开浏览器开发者工具查看日志。
