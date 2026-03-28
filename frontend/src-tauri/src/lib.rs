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

  let startup_open_paths = commands::collect_startup_file_paths();

  let app = tauri::Builder::default()
    .manage(commands::PendingOpenPaths::default())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      let open_paths = commands::collect_file_paths_from_cli_args(argv.as_slice());
      commands::queue_pending_open_paths(app, open_paths);
    }))
    .setup(move |app| {
      commands::queue_pending_open_paths(app.handle(), startup_open_paths.clone());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::read_file,
      commands::write_file,
      commands::atomic_write_file,
      commands::list_files,
      commands::create_file,
      commands::create_folder,
      commands::delete_file,
      commands::rename_file,
      commands::get_file_info,
      commands::read_file_chunked,
      commands::write_file_chunked,
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
      commands::reveal_in_file_manager,
      commands::consume_pending_open_paths,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app_handle, event| {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    if let tauri::RunEvent::Opened { urls } = event {
      let open_paths = commands::collect_paths_from_urls(urls.as_slice());
      commands::queue_pending_open_paths(app_handle, open_paths);
    }
  });
}
