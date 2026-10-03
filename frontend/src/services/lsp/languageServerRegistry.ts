/**
 * @description 维护 Tau Editor 支持的语言服务器命令、语言映射和工作区探测标记。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 10:25
 */

export interface LanguageServerDescriptor {
  id: string;
  displayName: string;
  languageIds: string[];
  command: string;
  args: string[];
  rootMarkers: string[];
  /** 应用托管资产的稳定 ID；与后端 manifest 对齐，不等于用户 PATH 命令。 */
  managedId?: string;
  /** 已锁定且经过校验的发行资产；未配置时仅使用缓存状态/PATH fallback。 */
  managedAsset?: ManagedLspAsset;
  /** 按平台架构选择的发行资产。 */
  managedAssets?: Record<string, ManagedLspAsset>;
  /** 复合运行时 ID，例如 TypeScript/Pyright 使用 node-runtime。 */
  managedRuntimeId?: string;
  /** 服务器运行所需的应用私有伴随包，例如 TypeScript SDK。 */
  managedDependencies?: ManagedLspDependency[];
}

export interface ManagedLspDependency {
  id: string;
  assets: Record<string, ManagedLspAsset>;
}

export interface ManagedLspAsset {
    version: string;
    downloadUrl: string;
    sha256: string;
    archiveFormat: 'binary' | 'zip' | 'tarGz' | 'gzip';
    executablePath?: string;
    launchCommand?: string;
    launchArgs?: string[];
    launchEnv?: Record<string, string>;
}

const NODE_RUNTIME_ASSETS: Record<string, ManagedLspAsset> = {
  'darwin-arm64': {
    version: '24.21.0',
    downloadUrl: 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-darwin-arm64.tar.gz',
    sha256: 'bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057',
    archiveFormat: 'tarGz',
    executablePath: 'node-v24.21.0-darwin-arm64/bin/node',
  },
  'darwin-x64': {
    version: '24.21.0',
    downloadUrl: 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-darwin-x64.tar.gz',
    sha256: '1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097',
    archiveFormat: 'tarGz',
    executablePath: 'node-v24.21.0-darwin-x64/bin/node',
  },
};

export function getManagedRuntimeAsset(runtimeId: string, platformKey: string): ManagedLspAsset | null {
  if (runtimeId === 'node-runtime') return NODE_RUNTIME_ASSETS[platformKey] ?? null;
  if (runtimeId === 'java-runtime') return JAVA_RUNTIME_ASSETS[platformKey] ?? null;
  if (runtimeId === 'dotnet-runtime') return DOTNET_RUNTIME_ASSETS[platformKey] ?? null;
  if (runtimeId === 'dotnet-sdk') return DOTNET_SDK_ASSETS[platformKey] ?? null;
  return null;
}

const TYPESCRIPT_SDK_ASSETS: Record<string, ManagedLspAsset> = {
  'darwin-arm64': {
    version: '6.0.3',
    downloadUrl: 'https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz',
    sha256: '33cd0ee1beaa8c9e9d15a9da836c62ddea4c34a42d7c2d349dbc80d94165d22a',
    archiveFormat: 'tarGz',
    executablePath: 'package/lib/tsserver.js',
  },
  'darwin-x64': {
    version: '6.0.3',
    downloadUrl: 'https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz',
    sha256: '33cd0ee1beaa8c9e9d15a9da836c62ddea4c34a42d7c2d349dbc80d94165d22a',
    archiveFormat: 'tarGz',
    executablePath: 'package/lib/tsserver.js',
  },
};

const JAVA_RUNTIME_ASSETS: Record<string, ManagedLspAsset> = {
  'darwin-arm64': {
    version: '21.0.12.1+1',
    downloadUrl: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_aarch64_mac_hotspot_21.0.12.1_1.tar.gz',
    sha256: 'dec50fc6f9fcd4fe3ae8cabf5a5fa68f6afc48841f7698e468e9aa5d54beed84',
    archiveFormat: 'tarGz',
    executablePath: 'jdk-21.0.12.1+1-jre/Contents/Home/bin/java',
  },
  'darwin-x64': {
    version: '21.0.12.1+1',
    downloadUrl: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_mac_hotspot_21.0.12.1_1.tar.gz',
    sha256: '6717ec641fd9ce0bb209ca083ee23b42202ac68cb6fcc5753496e0e4a0f41989',
    archiveFormat: 'tarGz',
    executablePath: 'jdk-21.0.12.1+1-jre/Contents/Home/bin/java',
  },
};

const DOTNET_RUNTIME_ASSETS: Record<string, ManagedLspAsset> = {
  'darwin-arm64': {
    version: '10.0.0',
    downloadUrl: 'https://dotnetcli.azureedge.net/dotnet/Runtime/10.0.0/dotnet-runtime-10.0.0-osx-arm64.tar.gz',
    sha256: '871d5a3895e327f75b11ddbcd0ab7c7d0f3ed745dd9ec0befd31e368517bf8cf',
    archiveFormat: 'tarGz',
    executablePath: 'dotnet',
  },
  'darwin-x64': {
    version: '10.0.0',
    downloadUrl: 'https://dotnetcli.azureedge.net/dotnet/Runtime/10.0.0/dotnet-runtime-10.0.0-osx-x64.tar.gz',
    sha256: 'd20a52374d7c2af564d01ff11e74f5c1cbbd9c37302a56f3f8e7007a22f5f5fa',
    archiveFormat: 'tarGz',
    executablePath: 'dotnet',
  },
};

const DOTNET_SDK_ASSETS: Record<string, ManagedLspAsset> = {
  'darwin-arm64': {
    version: '10.0.100',
    downloadUrl: 'https://dotnetcli.azureedge.net/dotnet/Sdk/10.0.100/dotnet-sdk-10.0.100-osx-arm64.tar.gz',
    sha256: '71b3815ef8d83a6bbebf8627a56639600193f22d4ea6a6de2f71855c4b3e63fd',
    archiveFormat: 'tarGz', executablePath: 'dotnet',
  },
  'darwin-x64': {
    version: '10.0.100',
    downloadUrl: 'https://dotnetcli.azureedge.net/dotnet/Sdk/10.0.100/dotnet-sdk-10.0.100-osx-x64.tar.gz',
    sha256: 'd8fd6e3f2e393cad300794d43ae26d01f9db31356c95381bcfb9d3d7f66d187e',
    archiveFormat: 'tarGz', executablePath: 'dotnet',
  },
};

const GOPLS_ASSETS: Record<string, ManagedLspAsset> = {
  'darwin-arm64': {
    version: '0.23.0',
    downloadUrl: 'https://github.com/kokotao/tau-editor/releases/download/v0.6.7/tau-gopls-v0.23.0-darwin-arm64.tar.gz',
    sha256: '0734734352233a1eb70ccdc6ddb923911de9c4737a76cd00fff13c81306707a6',
    archiveFormat: 'tarGz', executablePath: 'tau-gopls', launchCommand: 'tau-gopls', launchArgs: ['-mode=stdio'],
  },
  'darwin-x64': {
    version: '0.23.0',
    downloadUrl: 'https://github.com/kokotao/tau-editor/releases/download/v0.6.7/tau-gopls-v0.23.0-darwin-x64.tar.gz',
    sha256: '102768dcd848f495fed86c2ffd18b88c06339ad280154576845844e7ec3eabb6',
    archiveFormat: 'tarGz', executablePath: 'tau-gopls', launchCommand: 'tau-gopls', launchArgs: ['-mode=stdio'],
  },
};

const JDTLS_ASSETS: Record<string, ManagedLspAsset> = {
  'darwin-arm64': {
    version: '1.55.0-202512042336',
    downloadUrl: 'https://download.eclipse.org/jdtls/snapshots/jdt-language-server-1.55.0-202512042336.tar.gz',
    sha256: 'cfb2f2be82b28dce4debdb05f76e3bd408a05cf8d3cbd9b8da09a7f3f5826552',
    archiveFormat: 'tarGz', executablePath: 'plugins/org.eclipse.equinox.launcher_1.7.100.v20251111-0406.jar',
    launchArgs: ['-Declipse.application=org.eclipse.jdt.ls.core.id1', '-Dosgi.bundles.defaultStartLevel=4', '-Declipse.product=org.eclipse.jdt.ls.core.product', '-Dlog.protocol=true', '-Dlog.level=ALL', '-Xms1g', '--add-modules=ALL-SYSTEM', '--add-opens', 'java.base/java.util=ALL-UNNAMED', '--add-opens', 'java.base/java.lang=ALL-UNNAMED', '-jar', '\${executablePath}', '-configuration', '\${installDir}/config_mac_arm', '-data', '\${workspaceData}'],
  },
  'darwin-x64': {
    version: '1.55.0-202512042336',
    downloadUrl: 'https://download.eclipse.org/jdtls/snapshots/jdt-language-server-1.55.0-202512042336.tar.gz',
    sha256: 'cfb2f2be82b28dce4debdb05f76e3bd408a05cf8d3cbd9b8da09a7f3f5826552',
    archiveFormat: 'tarGz', executablePath: 'plugins/org.eclipse.equinox.launcher_1.7.100.v20251111-0406.jar',
    launchArgs: ['-Declipse.application=org.eclipse.jdt.ls.core.id1', '-Dosgi.bundles.defaultStartLevel=4', '-Declipse.product=org.eclipse.jdt.ls.core.product', '-Dlog.protocol=true', '-Dlog.level=ALL', '-Xms1g', '--add-modules=ALL-SYSTEM', '--add-opens', 'java.base/java.util=ALL-UNNAMED', '--add-opens', 'java.base/java.lang=ALL-UNNAMED', '-jar', '\${executablePath}', '-configuration', '\${installDir}/config_mac', '-data', '\${workspaceData}'],
  },
};

const OMNISHARP_ASSETS: Record<string, ManagedLspAsset> = {
  'darwin-arm64': {
    version: '2.0.0', downloadUrl: 'https://github.com/OmniSharp/omnisharp-roslyn/releases/download/v2.0.0/omnisharp-osx-arm64.tar.gz', sha256: 'dd2b16f64c42085cc27980376cb795b8ee80ba58af12e219f27c392b010913d4', archiveFormat: 'tarGz', executablePath: 'OmniSharp', launchArgs: ['--languageserver'],
  },
  'darwin-x64': {
    version: '2.0.0', downloadUrl: 'https://github.com/OmniSharp/omnisharp-roslyn/releases/download/v2.0.0/omnisharp-osx-x64.tar.gz', sha256: '4096abe8595f37d3799c8fb25a4cb974ec77208453c7d1a91f99f1d83d25d94d', archiveFormat: 'tarGz', executablePath: 'OmniSharp', launchArgs: ['--languageserver'],
  },
};

/**
 * 应用优先使用固定版本、带 SHA-256 的私有资产；资产不可用时回退 PATH，
 * 最后回退到轻量导航。Go/JDT LS 等尚未发布受审查资产的语言暂不伪造下载地址。
 */
export const LANGUAGE_SERVER_DESCRIPTORS: LanguageServerDescriptor[] = [
  {
    id: 'typescript-language-server',
    displayName: 'TypeScript / JavaScript',
    languageIds: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    rootMarkers: ['package.json', 'tsconfig.json', 'jsconfig.json'],
    managedId: 'typescript-language-server',
    managedRuntimeId: 'node-runtime',
    managedDependencies: [{ id: 'typescript-sdk', assets: TYPESCRIPT_SDK_ASSETS }],
    managedAssets: {
      'darwin-arm64': {
        version: '6.0.1',
        downloadUrl: 'https://registry.npmjs.org/typescript-language-server/-/typescript-language-server-6.0.1.tgz',
        sha256: '85eabb9251d85d3798b247b2bc0895ca111d866bfbf59533f64b2461b0d8649f',
        archiveFormat: 'tarGz',
        executablePath: 'package/lib/cli.mjs',
        launchArgs: ['--stdio'],
      },
      'darwin-x64': {
        version: '6.0.1',
        downloadUrl: 'https://registry.npmjs.org/typescript-language-server/-/typescript-language-server-6.0.1.tgz',
        sha256: '85eabb9251d85d3798b247b2bc0895ca111d866bfbf59533f64b2461b0d8649f',
        archiveFormat: 'tarGz',
        executablePath: 'package/lib/cli.mjs',
        launchArgs: ['--stdio'],
      },
    },
  },
  {
    id: 'pyright',
    displayName: 'Python (Pyright)',
    languageIds: ['python'],
    command: 'pyright-langserver',
    args: ['--stdio'],
    rootMarkers: ['pyproject.toml', 'pyrightconfig.json', 'setup.py', 'requirements.txt'],
    managedId: 'pyright',
    managedRuntimeId: 'node-runtime',
    managedAssets: {
      'darwin-arm64': {
        version: '1.1.414',
        downloadUrl: 'https://registry.npmjs.org/pyright/-/pyright-1.1.414.tgz',
        sha256: 'bf5f473f6167c0d14175492c3263d783b4489a6956e1c06c18e15228e3a3fa42',
        archiveFormat: 'tarGz',
        executablePath: 'package/langserver.index.js',
        launchArgs: ['--stdio'],
      },
      'darwin-x64': {
        version: '1.1.414',
        downloadUrl: 'https://registry.npmjs.org/pyright/-/pyright-1.1.414.tgz',
        sha256: 'bf5f473f6167c0d14175492c3263d783b4489a6956e1c06c18e15228e3a3fa42',
        archiveFormat: 'tarGz',
        executablePath: 'package/langserver.index.js',
        launchArgs: ['--stdio'],
      },
    },
  },
  {
    id: 'rust-analyzer',
    displayName: 'Rust (rust-analyzer)',
    languageIds: ['rust'],
    command: 'rust-analyzer',
    args: [],
    rootMarkers: ['Cargo.toml'],
    managedId: 'rust-analyzer',
    managedAssets: {
      'darwin-arm64': {
        version: '2026-09-21',
        downloadUrl: 'https://github.com/rust-lang/rust-analyzer/releases/download/2026-09-21/rust-analyzer-aarch64-apple-darwin.gz',
        sha256: 'eb474adfd12b6e66a6d0a7c25ed51210a64a0237f326f898e32e25164c9b11ad',
        archiveFormat: 'gzip',
        executablePath: 'rust-analyzer',
      },
      'darwin-x64': {
        version: '2026-09-21',
        downloadUrl: 'https://github.com/rust-lang/rust-analyzer/releases/download/2026-09-21/rust-analyzer-x86_64-apple-darwin.gz',
        sha256: '1e2f706ee97d9f931ea36ed4e83f839efd0ac09870e18ec8350877d7b98ad8a0',
        archiveFormat: 'gzip',
        executablePath: 'rust-analyzer',
      },
    },
  },
  {
    id: 'gopls',
    displayName: 'Go (gopls)',
    languageIds: ['go'],
    command: 'gopls',
    args: ['-mode=stdio'],
    rootMarkers: ['go.mod', 'go.work'],
    managedId: 'gopls',
    managedAssets: GOPLS_ASSETS,
  },
  {
    id: 'clangd',
    displayName: 'C / C++ (clangd)',
    languageIds: ['c', 'cpp'],
    command: 'clangd',
    args: ['--background-index'],
    rootMarkers: ['compile_commands.json', 'compile_flags.txt', '.clangd'],
    managedId: 'clangd',
  },
  {
    id: 'jdtls',
    displayName: 'Java (jdtls)',
    languageIds: ['java'],
    command: 'java',
    args: [],
    rootMarkers: ['pom.xml', 'build.gradle', 'settings.gradle'],
    managedId: 'jdtls',
    managedRuntimeId: 'java-runtime',
    managedAssets: JDTLS_ASSETS,
  },
  {
    id: 'omnisharp',
    displayName: 'C# (OmniSharp)',
    languageIds: ['csharp'],
    command: 'omnisharp',
    args: ['--languageserver'],
    rootMarkers: ['.sln', '.csproj'],
    managedId: 'omnisharp',
    managedDependencies: [{ id: 'dotnet-sdk', assets: DOTNET_SDK_ASSETS }],
    managedAssets: OMNISHARP_ASSETS,
  },
];

const aliases: Record<string, string> = {
  javascriptreact: 'javascript',
  typescriptreact: 'typescript',
  javascriptjsx: 'javascript',
  typescriptjsx: 'typescript',
};

export function normalizeLspLanguageId(languageId: string): string {
  const normalized = languageId.trim().toLowerCase();
  return aliases[normalized] ?? normalized;
}

export function findLanguageServer(languageId: string): LanguageServerDescriptor | null {
  const normalized = normalizeLspLanguageId(languageId);
  return LANGUAGE_SERVER_DESCRIPTORS.find((descriptor) => descriptor.languageIds.includes(normalized)) ?? null;
}
