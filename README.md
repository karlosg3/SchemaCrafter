# SchemaCrafter

[![Netlify Status](https://api.netlify.com/api/v1/badges/7263f326-7edb-440b-8c01-1004443c47d8/deploy-status)](https://app.netlify.com/projects/schemacrafter/deploys)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

A visual, drag-and-drop database schema designer for the browser. Model tables, columns, enums, and relationships on an infinite canvas, then export directly to SQL or your ORM of choice.

## Features

- **Visual canvas editor** — build schemas as connected nodes ([@xyflow/react](https://reactflow.dev/)) with drag-to-reposition tables, auto-layout, and zoom/pan
- **Multi-database projects** — manage several database projects side by side, each with its own engine (PostgreSQL, MySQL, SQLite)
- **Schema groups** — organize tables into color-coded schema groups, with an overview mode to inspect one schema at a time
- **Rich column modeling** — primary keys, foreign keys with `ON UPDATE`/`ON DELETE` actions, indexes, uniqueness, nullability, defaults, and enum types
- **Live code preview** — generates code as you edit, targeting Prisma, Drizzle, MikroORM, TypeORM, or raw SQL
- **SQL import** — paste `CREATE TABLE` statements and have them parsed straight onto the canvas
- **JSON export** — download the full project definition for backup or sharing
- **Local persistence** — projects auto-save to `localStorage`, no backend required

## Tech Stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) for dev/build tooling
- [Tailwind CSS 4](https://tailwindcss.com/)
- [@xyflow/react](https://reactflow.dev/) (React Flow) for the canvas
- [Oxlint](https://oxc.rs/) for linting

## Getting Started

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build    # type-check + production build (dist/)
npm run preview  # preview the production build locally
npm run lint      # run Oxlint
```

## Deployment

Deploys to Netlify automatically on every push to `main`. Build command: `npm run build`, publish directory: `dist`.
