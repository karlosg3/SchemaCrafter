mod updater;

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
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_ascii_lowercase())
            .as_deref(),
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

fn extract_project_path_from_args<'a, I>(args: I) -> Option<PathBuf>
where
    I: IntoIterator<Item = &'a str>,
{
    args.into_iter().find_map(path_from_arg)
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

#[tauri::command]
fn allow_and_read_recent_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let candidate = PathBuf::from(&path);
    if !is_supported_project_file(&candidate) {
        return Err("Selected recent file does not exist or has an unsupported extension.".into());
    }
    let canonical = candidate
        .canonicalize()
        .map_err(|err| format!("Failed to resolve recent file path: {err}"))?;
    if !is_supported_project_file(&canonical) {
        return Err("Resolved recent file has an unsupported extension.".into());
    }
    if let Err(err) = app.fs_scope().allow_file(&canonical) {
        return Err(format!("Failed to grant file permission: {err}"));
    }
    std::fs::read_to_string(&canonical).map_err(|err| format!("Failed to read recent file: {err}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::Emitter;

            if let Some(path) =
                extract_project_path_from_args(argv.iter().skip(1).map(String::as_str))
                && let Some(resolved) = allow_and_normalize_path(app, &path)
            {
                let _ = app.emit("file-opened", vec![resolved]);
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(PendingOpenFile::default())
        .invoke_handler(tauri::generate_handler![
            take_pending_open_file,
            allow_and_read_recent_file,
            updater::check_for_updates,
            updater::install_deb_update,
            updater::restart_app,
            updater::open_external_url
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                for path in paths {
                    if is_supported_project_file(path) {
                        let _ = allow_and_normalize_path(window.app_handle(), path);
                    }
                }
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let raw_args: Vec<String> = std::env::args().skip(1).collect();
            if let Some(path) = extract_project_path_from_args(raw_args.iter().map(String::as_str))
                && let Some(resolved) = allow_and_normalize_path(app.handle(), &path)
                && let Ok(mut pending) = app.state::<PendingOpenFile>().0.lock()
            {
                *pending = Some(resolved);
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
                if let Ok(path) = url.to_file_path()
                    && is_supported_project_file(&path)
                    && let Some(resolved) = allow_and_normalize_path(_app_handle, &path)
                {
                    opened_paths.push(resolved);
                }
            }
            if !opened_paths.is_empty() {
                let _ = _app_handle.emit("file-opened", opened_paths);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!(
            "schemacrafter_test_{label}_{}_{}",
            std::process::id(),
            nanos
        ));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    #[test]
    fn validates_supported_project_extensions_case_insensitively() {
        let dir = make_temp_dir("ext");
        let sc_file = dir.join("demo.SchemaCrafter");
        let json_file = dir.join("legacy.json");
        let txt_file = dir.join("notes.txt");
        fs::write(&sc_file, "{}").unwrap();
        fs::write(&json_file, "{}").unwrap();
        fs::write(&txt_file, "{}").unwrap();

        assert!(is_supported_project_file(&sc_file));
        assert!(is_supported_project_file(&json_file));
        assert!(!is_supported_project_file(&txt_file));
        assert!(!is_supported_project_file(&dir));
        assert!(!is_supported_project_file(
            &dir.join("missing.schemacrafter")
        ));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_file_urls_and_skips_flags_in_args() {
        let dir = make_temp_dir("args");
        let sc_file = dir.join("project.schemacrafter");
        fs::write(&sc_file, "{}").unwrap();

        let uri = format!("file://{}", sc_file.display());
        assert_eq!(path_from_arg(&uri), Some(sc_file.clone()));
        assert_eq!(
            extract_project_path_from_args(["--headless", "--flag", uri.as_str()]),
            Some(sc_file.clone())
        );
        assert_eq!(
            extract_project_path_from_args(["--only-flags", "missing.schemacrafter"]),
            None
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
