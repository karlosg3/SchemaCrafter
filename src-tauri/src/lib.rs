use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

#[derive(Default)]
struct PendingOpenFile(Mutex<Option<String>>);

fn is_supported_project_file(path: &Path) -> bool {
  if !path.is_file() {
    return false;
  }
  matches!(
    path.extension().and_then(|ext| ext.to_str()).map(|s| s.to_ascii_lowercase()).as_deref(),
    Some("schemacrafter") | Some("json")
  )
}

fn path_from_arg(arg: &str) -> Option<PathBuf> {
  if let Some(stripped) = arg.strip_prefix("file://") {
    let candidate = PathBuf::from(stripped);
    if is_supported_project_file(&candidate) {
      return Some(candidate);
    }
  }
  let candidate = PathBuf::from(arg);
  if is_supported_project_file(&candidate) {
    Some(candidate)
  } else {
    None
  }
}

fn allow_and_normalize_path(app: &tauri::AppHandle, path: &Path) -> Option<String> {
  let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
  if let Err(err) = app.fs_scope().allow_file(&canonical) {
    log::warn!("Failed to allow opened file in fs_scope: {err}");
  }
  canonical.to_str().map(str::to_owned)
}

#[tauri::command]
fn take_pending_open_file(state: tauri::State<'_, PendingOpenFile>) -> Option<String> {
  state.0.lock().ok().and_then(|mut guard| guard.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .manage(PendingOpenFile::default())
    .invoke_handler(tauri::generate_handler![take_pending_open_file])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      for arg in std::env::args().skip(1) {
        if let Some(path) = path_from_arg(&arg) {
          if let Some(resolved) = allow_and_normalize_path(app.handle(), &path) {
            if let Ok(mut pending) = app.state::<PendingOpenFile>().0.lock() {
              *pending = Some(resolved);
            }
            break;
          }
        }
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building SchemaCrafter");

  app.run(|_app_handle, _event| {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    if let tauri::RunEvent::Opened { urls } = _event {
      use tauri::Emitter;
      let mut opened_paths = Vec::new();
      for url in urls {
        if let Ok(path) = url.to_file_path() {
          if is_supported_project_file(&path) {
            if let Some(resolved) = allow_and_normalize_path(_app_handle, &path) {
              opened_paths.push(resolved);
            }
          }
        }
      }
      if !opened_paths.is_empty() {
        let _ = _app_handle.emit("file-opened", opened_paths);
      }
    }
  });
}
