# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- `npm run dev` — Development build (inline source maps, no minification)
- `npm run build` — Production build (minified, no source maps)

Both invoke `node esbuild.config.mjs` with esbuild bundling `src/main.ts` → `dist/main.js` as CommonJS. The `obsidian` package is external (provided by the host app). The build defines `process.env.NODE_ENV` which controls API URL selection (localhost vs production).

There are no test or lint commands configured.

## Architecture

This is an **Obsidian plugin** (TypeScript) that syncs markdown files from a vault to the Knowmeld platform via REST API.

### Module Responsibilities

- **`src/main.ts`** — Plugin lifecycle (`onload`/`onunload`). Manages persisted data (cache + settings), registers commands (`sync-all`, `sync-current`), handles OAuth callback via the `knowmeld-auth` protocol URI, and adds a ribbon icon for manual sync.

- **`src/syncer.ts`** — `FileSyncer` class. Core sync engine that decides which files to upload (markdown only, ≥500 chars after front matter, not in excluded folders, not prefixed with `_`, content hash changed). Manages sync sessions (start/upload/finish), handles 401 token refresh, and maintains a SHA-256 hash cache for change detection.

- **`src/settings.ts`** — `KnowmeldSettingTab` extending Obsidian's `PluginSettingTab`. Renders the connection button and excluded folders configuration.

- **`src/settings.store.ts`** — `KnowmeldSettings` interface and `DEFAULT_SETTINGS` factory. Selects API URLs based on `process.env.NODE_ENV`.

### Data Flow

1. Plugin loads persisted data (`cache` hash map + `settings`) from Obsidian's data store
2. User authenticates via dashboard link → OAuth callback sets access/refresh tokens
3. On sync: `FileSyncer` creates a session (`/upload/start`), iterates vault files, uploads changed ones (`/upload`), then finalizes (`/upload/complete`)
4. File hashes are cached to skip unchanged files on subsequent syncs

### API Endpoints (Knowmeld)

- `POST /auth/device-tokens/pairing-complete` — Complete OAuth device pairing
- `POST /auth/device-tokens/refresh` — Refresh access token
- `GET /upload/start` — Begin sync session (returns correlation ID)
- `POST /upload` — Upload a single file
- `GET /upload/complete` — Finalize sync session

### Key Design Decisions

- Files are uploaded with a 100ms delay between each to avoid rate limiting
- Sync aborts on first upload error (no partial retry)
- Delete/rename handlers exist as stubs for future server-side support
- Real-time sync (on file create/modify/delete/rename) is implemented but commented out
