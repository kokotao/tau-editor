/// 文本编辑器 Tauri 应用库
/// 
/// 提供所有 Tauri 命令和后端服务

mod commands;
mod utils;
mod services;
mod models;

pub use commands::*;
pub use utils::*;
pub use services::*;
pub use models::*;

/// 运行 Tauri 应用
pub fn run() {
    // 初始化日志
    #[cfg(debug_assertions)]
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("debug")).init();
    
    log::info!("Text Editor Tauri App starting...");
    
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // 文件操作命令
            commands::read_file,
            commands::write_file,
            commands::atomic_write_file,
            commands::list_files,
            commands::create_file,
            commands::delete_file,
            commands::rename_file,
            commands::get_file_info,
            // 优化的大文件命令
            commands::read_file_chunked,
            commands::get_file_line_count,
            commands::read_file_lines,
            commands::get_large_file_config,
            // 设置命令
            commands::auto_save_config,
            commands::get_auto_save_interval,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
