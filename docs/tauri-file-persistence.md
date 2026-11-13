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
  - **Open File (`Cmd/Ctrl + O`):** Native OS file picker (`open()` from `@tauri-apps/plugin-dialog`) filtered to `.schemacrafter.json` and `.json`. Reads file via `readTextFile()`, validates/normalizes it, and loads it into `useWorkspaceStore().replaceWorkspace(...)`.
  - **Save (`Cmd/Ctrl + S`):** If `currentFilePath` is already set, writes directly with `writeTextFile(currentFilePath, json)`. Otherwise falls through to **Save As**.
  - **Save As (`Cmd/Ctrl + Shift + S`):** Native OS save dialog (`save()` from `@tauri-apps/plugin-dialog`), updates `currentFilePath`, writes JSON, and clears the `isDirty` flag.
  - **New Empty Workspace / Project (`Cmd/Ctrl + N`):** Starts from `emptyWorkspace()` (or a fresh database template) and clears `currentFilePath`.
  - **Unsaved changes guard:** Before **New** or **Open** replaces a modified workspace (`isDirty === true`), prompt via the existing `useConfirm()` modal.
- **Startup in Tauri:**
  - Start either with an empty workspace (or welcome state with **New** / **Open File…** actions) instead of overwriting a file automatically, and do **not** treat `localStorage` as the primary document store when a file is open.
  - Keep UI preferences (panel open/collapsed, theme, preferred ORM target) in `localStorage` or app state as today; keep schema data in the opened file.

---

## 3. File Format & Compatibility

Recommended extension: **`.schemacrafter.json`** (also accept `.json` when opening).

### Canonical Saved Payload (`Workspace` v2)
Store the normalized `Workspace` object from `shared/types/workspace.ts` (`formatVersion: 2`):

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
- `app/utils/desktopFiles.ts` — `pickOpenProjectFile()`, `pickSaveProjectFile()`, `readProjectFile(path)`, `writeProjectFile(path, workspace)` wrapping `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs` + JSON validation/migration.
- `app/stores/desktopDocument.ts` (or a composable `app/composables/useDesktopFile.ts`) — holds `currentFilePath`, `fileName`, `isDirty`, and orchestrates `openFile()`, `saveFile()`, `saveFileAs()`, `newFile()`, plus `Cmd/Ctrl+S` and `Cmd/Ctrl+O` keybindings.
- `app/components/layout/AppNavbar.vue` — when `isDesktopApp()` is true, display the open file name (with a dirty dot `•` if unsaved) and **Open** / **Save** / **Save As** actions alongside existing navbar controls.
- `app/stores/workspace.ts` — ensure `markDirty()` / document-dirty notifications fire on mutations without breaking `localStorage` auto-save on the web (`if (!isDesktopApp()) saveWorkspace(...)`).

---

## 5. Optional: Double-Clicking Project Files from the OS

To allow users to open `.schemacrafter.json` files directly from Finder / Explorer / Linux file managers:

1. **Declare file association in `src-tauri/tauri.conf.json`:**
   ```json
   {
     "bundle": {
       "fileAssociations": [
         {
           "ext": ["schemacrafter", "schemacrafter.json"],
           "mimeType": "application/json",
           "name": "SchemaCrafter Project"
         }
       ]
     }
   }
   ```
2. **Forward OS open events in `src-tauri/src/lib.rs`:**
   - Capture `tauri::RunEvent::Opened { urls }` in `.build(...).run(...)`.
   - Convert file URLs to paths, allow them in the `fs` scope if needed, and emit `"file-opened"` to the frontend (`app_handle.emit("file-opened", paths)`).
   - Also check `std::env::args()` on startup for Windows/Linux cold launches where a file path is passed as a CLI argument.
3. **Listen on the frontend (`isDesktopApp()` only):**
   - On mount, subscribe via `listen<string[]>('file-opened', ...)` from `@tauri-apps/api/event` and route the path through the same `openPath(path)` loader (honoring the unsaved-changes confirmation).
