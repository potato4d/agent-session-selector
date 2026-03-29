# Agent Guide

## Commit Messages

- Write commit messages in English.

## Project Overview

A web app that reads the session list from `~/.claude/` and lets you quickly copy the `claude --resume <sessionId>` command.

## Structure

Single package (not a monorepo).

```
src/
  client/   # React 19 + Vite + TypeScript
  server/   # Express + TypeScript (started with tsx watch)
```

| Service | URL                    | Start Script      |
|---------|------------------------|-------------------|
| Client  | http://localhost:6814  | `pnpm dev:client` |
| Server  | http://localhost:6815  | `pnpm dev:server` |

Web only (no Tauri): `pnpm dev:web`
Start everything including Tauri: `pnpm dev`

## Main Commands

```bash
pnpm dev          # Start client + server concurrently
pnpm test         # Vitest (server only)
pnpm typecheck    # Type check both client + server
pnpm build        # Production build
```

## Path Aliases

On the client side, `@/` is aliased to `src/client/`.

```ts
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
```

Configured in both `tsconfig.json` (client) and `vite.config.ts`.

## TypeScript Configuration

| File                  | Target              | Module Resolution |
|-----------------------|---------------------|-------------------|
| `tsconfig.json`       | Client + Vite       | Bundler           |
| `tsconfig.server.json`| Server              | NodeNext          |

Server-side imports require `.js` extensions (NodeNext):

```ts
import sessionsRouter from "./routes/sessions.js";
```

## Testing

- Framework: Vitest + Supertest
- Target: `src/server/**/*.test.ts` (no client tests)
- Tests the Express app by mocking `fs/promises`

```bash
pnpm test         # Run once
pnpm test:watch   # Watch mode
```

## Frontend Tech Stack

- React 19 / React Router v7
- Tailwind CSS v4 (`@tailwindcss/vite` plugin, `@import "tailwindcss"` in `src/client/index.css`)
- shadcn/ui (based on `@base-ui/react`)
- Sonner (toast notifications)
- Geist font (`@fontsource-variable/geist`)

## Core Server Logic

### Reading Session Files

Reads `~/.claude/projects/<encoded-path>/<sessionId>.jsonl`.

- First 8KB → extract `firstMessage`
- Last 256KB → extract `lastUserMessage` and `lastTimestamp`
- Uses `fs.open` + byte range reads for performance (no readline streams)

**Filter conditions for `lastUserMessage`:**

- `type === "user"`
- `isMeta !== true`
- `typeof message.content === "string"` (tool_result is an array, so skip)
- `content !== "/exit"`

### Path Decoding

`C--Users-foobar-Documents-repos-cc-session-selector` → `C:\Users\foobar\Documents\repos\cc-session-selector`

Directory names under `~/.claude/projects` are treated as Claude's internal representation. The display path is taken from the `cwd` field in the JSONL or active session. Since `-` can appear in actual directory names, reverse-decoding of encoded directory names is not trusted.

## UI Notes

- Card separators use `divide-y divide-border` (Card component itself has `border-0 ring-0`)
- Tab bar is Ghostty-style (`bg-muted`, only the active tab uses `bg-background`)
- If CSS is hard to verify in preview, use `preview_snapshot` (accessibility tree)

## pnpm Configuration

`pnpm-workspace.yaml` has `minimumReleaseAge: 4320` (3 days) set as a supply chain protection measure.

`pnpm.onlyBuiltDependencies: ["esbuild"]` in `package.json` avoids the interactive approve-builds prompt.

## Preview Server

`.claude/launch.json` has `server` and `client` configurations. Start with `preview_start`.

tsx watch **may not detect file changes automatically**. After modifying server code, restart with `preview_stop` → `preview_start`.
