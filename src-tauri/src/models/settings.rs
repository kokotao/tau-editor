/// 设置相关数据模型

use serde::{Deserialize, Serialize};

/// 应用设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// 自动保存间隔 (秒)，0 表示禁用
    pub auto_save_interval: u64,
    /// 默认文件编码
    pub default_encoding: String,
    /// 字体大小
    pub font_size: u32,
    /// 字体名称
    pub font_family: String,
    /// 主题名称
    pub theme: String,
    /// 显示行号
    pub show_line_numbers: bool,
    /// 显示迷你地图
    pub show_minimap: bool,
    /// 自动换行
    pub word_wrap: bool,
    /// 制表符大小
    pub tab_size: u32,
    /// 使用空格代替制表符
    pub use_spaces: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_save_interval: 30,
            default_encoding: "UTF-8".to_string(),
            font_size: 14,
            font_family: "Consolas, 'Courier New', monospace".to_string(),
            theme: "dark".to_string(),
            show_line_numbers: true,
            show_minimap: true,
            word_wrap: false,
            tab_size: 4,
            use_spaces: true,
        }
    }
}

/// 窗口设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowSettings {
    /// 窗口宽度
    pub width: u32,
    /// 窗口高度
    pub height: u32,
    /// 窗口 X 位置
    pub x: Option<i32>,
    /// 窗口 Y 位置
    pub y: Option<i32>,
    /// 是否最大化
    pub maximized: bool,
    /// 是否全屏
    pub fullscreen: bool,
}

impl Default for WindowSettings {
    fn default() -> Self {
        Self {
            width: 1200,
            height: 800,
            x: None,
            y: None,
            maximized: false,
            fullscreen: false,
        }
    }
}

/// 最近打开的文件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentFile {
    /// 文件路径
    pub path: String,
    /// 最后打开时间
    pub last_opened: u64,
    /// 文件编码
    pub encoding: String,
}

/// 设置存储
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsStore {
    /// 应用设置
    pub app: AppSettings,
    /// 窗口设置
    pub window: WindowSettings,
    /// 最近打开的文件
    pub recent_files: Vec<RecentFile>,
}

impl Default for SettingsStore {
    fn default() -> Self {
        Self {
            app: AppSettings::default(),
            window: WindowSettings::default(),
            recent_files: Vec::new(),
        }
    }
}

impl SettingsStore {
    /// 添加最近打开的文件
    pub fn add_recent_file(&mut self, path: String, encoding: String) {
        // 移除已存在的相同路径
        self.recent_files.retain(|f| f.path != path);
        
        // 添加到开头
        self.recent_files.insert(0, RecentFile {
            path,
            last_opened: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            encoding,
        });
        
        // 限制最近文件数量
        if self.recent_files.len() > 10 {
            self.recent_files.truncate(10);
        }
    }
}
