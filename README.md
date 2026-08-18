# SchemaCrafter

[![Netlify Status](https://api.netlify.com/api/v1/badges/7263f326-7edb-440b-8c01-1004443c47d8/deploy-status)](https://app.netlify.com/projects/schemacrafter/deploys)
![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

A visual, drag-and-drop database schema designer for the browser. Model tables, columns, enums, and relationships on an infinite canvas, then export directly to SQL or your ORM of choice.

## Features

- **Visual canvas editor** — build schemas as connected nodes ([Vue Flow](https://vueflow.dev/)) with drag-to-reposition tables, auto-layout, and zoom/pan
- **Multi-database projects** — manage several database projects side by side, each with its own engine (PostgreSQL, MySQL, SQLite)
- **Schema groups** — organize tables into color-coded schema groups, with an overview mode to inspect one schema at a time
- **Rich column modeling** — primary keys, foreign keys with `ON UPDATE`/`ON DELETE` actions, indexes, uniqueness, nullability, defaults, and enum types
- **Live code preview** — generates code as you edit, targeting Prisma, Drizzle, MikroORM, TypeORM, or raw SQL
- **SQL import** — paste `CREATE TABLE` statements and have them parsed straight onto the canvas
- **JSON export** — download the full project definition for backup or sharing
- **Local persistence** — projects auto-save to `localStorage`, no backend required

## Tech Stack

- [Nuxt 4](https://nuxt.com/) (SPA, `ssr: false`) + [TypeScript](https://www.typescriptlang.org/)
- [Nuxt UI 4](https://ui.nuxt.com/) on [Tailwind CSS 4](https://tailwindcss.com/)
- [Pinia](https://pinia.vuejs.org/) for the workspace and UI stores
- [Vue Flow](https://vueflow.dev/) for the canvas
- [CodeMirror 6](https://codemirror.net/) for the code panel
- [ESLint](https://eslint.org/) via [@nuxt/eslint](https://eslint.nuxt.com/) and [Vitest](https://vitest.dev/)

## Getting Started

The repo is pnpm-only — the version is pinned in `package.json`, so Corepack
will fetch it for you.

```bash
corepack enable
pnpm install
pnpm dev
```

Other scripts:

```bash
pnpm generate   # static SPA build into dist/
pnpm build      # server build into .output/ (unused by the deploy)
pnpm preview    # serve the production build locally
pnpm lint       # ESLint
pnpm typecheck  # vue-tsc through nuxt typecheck
pnpm test       # Vitest
```

## Deployment

Deploys to Netlify automatically on every push to `main`, configured in
[`netlify.toml`](./netlify.toml) rather than in the dashboard: `pnpm generate`
into `dist/`.

The app is client-only (`ssr: false`) and keeps everything in `localStorage`,
so the deploy is a static bundle with no functions and no server. Nitro's
`netlify-static` preset writes the `_headers` and `_redirects` files itself on
every build.
