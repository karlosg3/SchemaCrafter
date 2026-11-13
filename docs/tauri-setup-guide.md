# Tauri Setup & Configuration Guide

Step-by-step instructions to initialize **Tauri v2** inside the SchemaCrafter repository without breaking the existing Nuxt / Netlify web pipeline.

---

## 1. Prerequisites

### All platforms
- **Node.js** + **Corepack / pnpm** (pinned in `package.json` via `"packageManager": "pnpm@11.22.0"`).
- **Rust & Cargo** (install via [rustup](https://rustup.rs/) if not present):
  ```bash
  rustc --version
  cargo --version
  ```

### Linux (Debian / Ubuntu)
Install the Tauri v2 WebKitGTK 4.1 system dependencies:
```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### macOS / Windows
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Windows:** Microsoft C++ Build Tools and WebView2 (pre-installed on Windows 10/11).

---

## 2. Install Tauri Packages

Install the Tauri CLI as a dev dependency and the runtime API + plugins in the root workspace:

```bash
pnpm add -D @tauri-apps/cli@^2
pnpm add @tauri-apps/api@^2 @tauri-apps/plugin-dialog@^2 @tauri-apps/plugin-fs@^2
```

> **Note:** Keep `@tauri-apps/*` JS calls behind a runtime `isTauri()` check so the web build (`pnpm generate` on Netlify) never invokes Tauri IPC in a browser.

---

## 3. Initialize `src-tauri/`

Run the Tauri initializer from the repository root:

```bash
pnpm tauri init
```

Use these values when prompted:
- **App name:** `SchemaCrafter`
- **Window title:** `SchemaCrafter`
- **Where are your web assets located?** `../.output/public` (Nuxt `pnpm generate` writes the real static directory there, and creates `dist` as a symlink locally)
- **URL of your dev server:** `http://localhost:3000`
- **Frontend dev command:** `pnpm dev`
- **Frontend build command:** `pnpm generate`

Verify that `src-tauri/tauri.conf.json` configures the Nuxt static build and targets Linux `.deb` for the initial release:

```json
{
  "productName": "SchemaCrafter",
  "identifier": "com.karlosg3.schemacrafter",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm generate",
    "devUrl": "http://localhost:3000",
    "frontendDist": "../.output/public"
  },
  "bundle": {
    "active": true,
    "targets": ["deb"],
    "fileAssociations": [
      {
        "ext": ["schemacrafter"],
        "mimeType": "application/json",
        "name": "SchemaCrafter Project",
        "description": "SchemaCrafter database workspace file"
      }
    ]
  }
}
```

*(Choose an `identifier` matching your reverse-domain namespace before shipping installers.)*

---

## 4. Register Tauri Plugins (`dialog` and `fs`)

Add the Rust plugin crates in `src-tauri/Cargo.toml` (or run `pnpm tauri add dialog` and `pnpm tauri add fs`):

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
```

Register both plugins in `src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running SchemaCrafter");
}
```

### Capabilities (`src-tauri/capabilities/default.json`)
Tauri v2 blocks plugin calls unless explicitly permitted in a capability file:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities for SchemaCrafter main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file"
  ]
}
```

> Paths chosen through `@tauri-apps/plugin-dialog` (`open()` / `save()`) are automatically added to Tauri's runtime `fs` scope for the session. If you later add OS file-association opening via `RunEvent::Opened` (without a dialog), register the opened path with the `fs` scope or configure `fs:scope` explicitly.

---

## 5. Update Repo Config Files

### `nuxt.config.ts`
Ensure Vite / Nuxt dev server compatibility with Tauri while preserving `ssr: false`:

```ts
export default defineNuxtConfig({
  ssr: false,
  devServer: {
    host: process.env.TAURI_DEV_HOST || 'localhost'
  },
  vite: {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      strictPort: true
    }
    // ...keep existing resolve.dedupe and optimizeDeps for CodeMirror!
  }
})
```

### `package.json`
Add convenience scripts alongside the existing Nuxt scripts:

```json
{
  "scripts": {
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

### `.gitignore` and `eslint.config.mjs`
- Add `src-tauri/target` to `.gitignore` so compiled Rust binaries/artifacts are never committed (commit `src-tauri/src/`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/`, and `src-tauri/icons/`).
- Add `'src-tauri/target'` (or `'src-tauri/**'`) to `ignores` in `eslint.config.mjs` so `pnpm lint` does not scan generated Rust artifacts.

---

## 6. Verification Checklist

Run both web and desktop checks after scaffolding:

```bash
# 1. Web build & quality gates (must remain green for Netlify)
pnpm generate
pnpm lint
pnpm typecheck
pnpm test

# 2. Desktop development window
pnpm tauri dev

# 3. Desktop Linux .deb release bundle
# Outputs under src-tauri/target/release/bundle/deb/
pnpm tauri build
```

> **Netlify note:** `netlify.toml` runs `pnpm generate` and publishes `dist/`. Netlify never runs `cargo` or `tauri build`, so adding `src-tauri/` does not slow down or break web deployments as long as desktop-only code is guarded at runtime.
