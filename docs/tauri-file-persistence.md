# Tauri File Persistence & Project Files Design

This document specifies how the **Tauri App** opens and saves project files on disk while keeping the **Web version** on its current `localStorage` behavior.

---

## 1. Current Persistence Baseline

Today, persistence works entirely in the browser:
- `app/utils/persistence.ts` reads/writes:
  - `WORKSPACE_KEY` (`Workspace` v2 JSON via `loadWorkspace()` / `saveWorkspace()`).
  - `V1_PROJECTS_KEY` (legacy `DatabaseProject[]` auto-migrated via `migrateV1ToWorkspace()`).
  - `UI_STATE_KEY` (active database/schema, view level, sidebar state, code target, canvas toggles).
- `app/app.vue` calls `workspace.hydrate()` and `ui.hydrate()` in `onMounted()`, flushes on `visibilitychange` (`hidden`) and `onBeforeUnmount()`.
- `app/stores/workspace.ts` already exposes:
  - `replaceWorkspace(next: Workspace)` (runs `reconcileWorkspace(next)` and triggers save).
  - `projectFor(dbId)` (converts one database to `DatabaseProject` for generators/exports).
- `app/components/layout/AppNavbar.vue` exports a single `DatabaseProject` via **Download JSON** (`JSON.stringify(project, null, 2)`), while `ImportSqlModal.vue` imports SQL `CREATE TABLE` statements.

---

## 2. Target Behavior Split (Web vs. Tauri App)

### Runtime Detection (`app/utils/runtime.ts`)
Create a small helper so platform checks live in one place:

```ts
import { isTauri as tauriCheck } from '@tauri-apps/api/core'

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && tauriCheck()
}
```

### Web (`!isDesktopApp()`)
- **No behavioral changes:**
  - Startup continues loading from `localStorage` (or seeding `ECOMMERCE_TEMPLATE` and `SAAS_TEMPLATE` on first visit).
  - Edits auto-save to `localStorage` on the existing 500 ms debounce (`AUTOSAVE_DEBOUNCE_MS`).
  - Desktop-only file buttons (**Open Project**, **Save**, **Save As**) are hidden in the web UI.

### Tauri Desktop (`isDesktopApp()`)
- **File-first workspace workflow:**
  - **Open File (`Cmd/Ctrl + O`):** Native OS file picker (`open()` from `@tauri-apps/plugin-dialog`) filtered to `.schemacrafter` and `.json`. Reads file via `readTextFile()`, validates/normalizes it, and loads it into `useWorkspaceStore().replaceWorkspace(...)`.
  - **Save (`Cmd/Ctrl + S`):** If `currentFilePath` is already set, writes directly with `writeTextFile(currentFilePath, json)`. Otherwise falls through to **Save As**.
  - **Save As (`Cmd/Ctrl + Shift + S`):** Native OS save dialog (`save()` from `@tauri-apps/plugin-dialog`, defaulting to `.schemacrafter` while also allowing `.json`), updates `currentFilePath`, writes JSON, and clears the `isDirty` flag.
  - **New Empty Workspace / Project (`Cmd/Ctrl + N`):** Starts from `emptyWorkspace()` and clears `currentFilePath`.
  - **Unsaved changes guard:** Before **New**, **Open**, or closing the desktop window (`onCloseRequested`) replaces/discards a modified workspace (`isDirty === true`), prompt via `useConfirm()` (or native confirm on window close).
- **Startup & Local Storage in Tauri:**
  - Project/schema data (`Workspace`) lives in user-selected `.schemacrafter` / `.json` files on disk—not `localStorage`.
  - UI preferences (`schemacrafter_ui_v2`) and panel widths (`schemacrafter_panels_v2`) continue using the Tauri webview's local `localStorage` seamlessly (`activeDbId` / `activeSchemaId` fall back cleanly to the opened project).
  - On startup, if launched with a `.schemacrafter` / `.json` file path argument (e.g., double-clicking a file on Linux), the frontend pulls it via `take_pending_open_file` and opens it; otherwise it starts with a clean empty workspace ready for **New** / **Open**.

---

## 3. File Format & Compatibility

- **Primary desktop extension:** **`.schemacrafter`** (JSON-formatted content under the hood, registered via `bundle.fileAssociations`).
- **Interoperability extension:** **`.json`** (supported in both Open and Save As filters so files exported from the Web app work seamlessly).

### Canonical Saved Payload (`Workspace` v2)
Store the normalized `Workspace` object from `shared/types/workspace.ts` (`formatVersion: 2`) as pretty-printed JSON (`JSON.stringify(workspace, null, 2)`):

```json
{
  "formatVersion": 2,
  "databases": [],
  "schemas": {},
  "tables": {},
  "enums": {}
}
```

Why `Workspace` v2 instead of a single `DatabaseProject`?
- Preserves multiple databases in a single workspace file.
- Preserves schema groups (`SchemaEntity`), node positions/sizes (`WH`, `XY`), and entity gradients without lossy projection.
- Directly matches `isValidWorkspace()` and `reconcileWorkspace()` in `shared/utils/migrations.ts`.

### Backward-Compatible Opening
When opening a `.json` file, normalize accepted inputs in this order:
1. **Full `Workspace` v2** (`isValidWorkspace(parsed)`): pass through `reconcileWorkspace(parsed)`.
2. **Legacy `DatabaseProject[]` array** (`isValidV1Payload(parsed)`): pass through `reconcileWorkspace(migrateV1ToWorkspace(parsed))`.
3. **Single `DatabaseProject` object** (like a file exported from Web's **Download JSON** in `AppNavbar.vue`): check `isValidV1Payload([parsed])`; if valid, convert via `reconcileWorkspace(migrateV1ToWorkspace([parsed]))`.
4. **Anything else:** show a clear error toast (`useToast()`) without clobbering the current workspace.

---

## 4. Suggested Desktop File Module Layout

Keep Tauri imports isolated from web-only persistence:

- `app/utils/runtime.ts` — `isDesktopApp()` check.
- `app/utils/projectFile.ts` — pure serialization (`serializeWorkspaceFile`) and parsing/migration (`parseProjectFile`) supporting `Workspace` v2, legacy `DatabaseProject[]`, and single `DatabaseProject` exports.
- `app/utils/desktopFiles.ts` — `pickOpenProjectFile()`, `pickSaveProjectFile()`, `readProjectFile()`, `writeProjectFile()`, `takePendingOpenFile()`, and `listenOpenFileRequests()` wrapping `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, and `@tauri-apps/api`.
- `app/stores/desktopDocument.ts` — holds `currentFilePath`, `fileName`, `isDirty`, and orchestrates `openFile()`, `openPath()`, `saveFile()`, `saveFileAs()`, `newFile()`, and `markDirty()`.
- `app/components/layout/AppNavbar.vue` — when `isDesktopApp()` is true, display the open file name (with an unsaved indicator) and a **File** menu (**New**, **Open…**, **Save**, **Save As…**) alongside existing navbar controls.
- `app/app.vue` — conditionally hydrates `workspace` from `localStorage` only on Web (`!isDesktopApp()`), wires `Cmd/Ctrl+O`, `Cmd/Ctrl+S`, `Cmd/Ctrl+Shift+S`, `Cmd/Ctrl+N`, handles OS-opened file requests, and intercepts window close when `isDirty` is true.
- `app/stores/workspace.ts` — on mutations, saves to `localStorage` when `!isDesktopApp()` and marks `desktopDocument` dirty when `isDesktopApp()`.

---

## 5. Double-Clicking `.schemacrafter` Files from the OS (Linux `.deb`)

To allow users to open `.schemacrafter` files directly from Linux file managers (GNOME Files, Dolphin, etc.) or pass a path via CLI (`schemacrafter path/to/file.schemacrafter`):

1. **Declare file association in `src-tauri/tauri.conf.json`:**
   ```json
   {
     "bundle": {
       "targets": ["deb"],
       "fileAssociations": [
         {
           "ext": ["schemacrafter"],
           "mimeType": "application/json",
           "name": "SchemaCrafter Project"
         }
       ]
     }
   }
   ```
2. **Capture CLI args & OS open events in `src-tauri/src/lib.rs`:**
   - During `.setup()`, inspect `std::env::args().skip(1)` for an existing file path, allow it on `app.fs_scope()`, and store it in `PendingOpenFile(Mutex<Option<String>>)`.
   - Expose `#[tauri::command] fn take_pending_open_file(...)` so the frontend fetches it after Nuxt mounts (avoiding startup event race conditions).
   - Also listen for `tauri::RunEvent::Opened { urls }` (for macOS / future single-instance handling), grant `fs_scope`, and emit `"file-opened"` to the frontend.
3. **Handle on the frontend (`isDesktopApp()` only):**
   - After mount, call `takePendingOpenFile()` and subscribe to `"file-opened"` events, routing both through `desktopDocument.openPath(path)` (honoring the unsaved-changes confirmation).
