/// 文本编辑器 Tauri 应用库
///
/// 提供所有 Tauri 命令和后端服务。
mod commands;
mod models;
mod services;
mod utils;

pub use commands::*;
pub use models::*;
pub use services::*;
pub use utils::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(debug_assertions)]
  env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("debug")).init();

  log::info!("Tau Editor Tauri App starting...");

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![
      commands::read_file,
      commands::write_file,
      commands::atomic_write_file,
      commands::list_files,
      commands::create_file,
      commands::delete_file,
      commands::rename_file,
      commands::get_file_info,
      commands::read_file_chunked,
      commands::get_file_line_count,
      commands::read_file_lines,
      commands::get_large_file_config,
      commands::auto_save_config,
      commands::get_auto_save_interval,
      commands::get_app_version_info,
      commands::check_github_update,
      commands::download_and_install_update,
      commands::open_project_homepage,
      commands::open_external_link,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
