# Agent Session Selector

Agent Session Selector is an app for browsing Claude Code sessions and quickly copying `claude --resume <sessionId>`.

It can run either as a browser-based web app or as a thin Tauri desktop shell.

## Features

- Read session data from `~/.claude/`
- Organize sessions by project with tabs
- Filter by session title, message text, and session ID
- Copy `claude --resume <sessionId>` with one click
- Show currently active sessions

## Tech Stack

- Client: React 19 + Vite + TypeScript + Tailwind CSS v4
- Server: Express + TypeScript
- Desktop shell: Tauri v2
- Test: Vitest + Supertest

## Requirements

- Node.js 20+
- pnpm 10+
- Existing Claude Code session data under `~/.claude/`

## Setup

```bash
git clone <your-fork-or-repo-url>
cd agent-session-selector
pnpm install
```

## Run as a Web App

```bash
pnpm dev
```

- Client: `http://127.0.0.1:6814`
- Server: `http://127.0.0.1:6815`

## Run as a Tauri App

```bash
pnpm tauri:dev
```

`pnpm tauri:dev` also starts Vite and Express internally.

## macOS: From Clone to First Run

### 1. Clone the repository

```bash
git clone <your-fork-or-repo-url>
cd agent-session-selector
```

### 2. Install Xcode Command Line Tools

```bash
xcode-select --install
```

After installation, reopen your terminal if needed.

### 3. Install Rust

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

After your shell configuration is reloaded, verify the installation:

```bash
rustc --version
cargo --version
```

### 4. Make sure Node.js and pnpm are available

Install Node.js 20 or later first. If `pnpm` is not already available, enable it with Corepack:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm --version
```

### 5. Install dependencies

```bash
pnpm install
```

### 6. Start the Tauri app

```bash
pnpm tauri:dev
```

### 7. Create a production build

```bash
pnpm tauri:build
```

## Checks and Tests

```bash
pnpm typecheck
pnpm test
```

## Notes

- `pnpm dev` starts the browser-focused development server
- `pnpm tauri:dev` starts the desktop shell for local development
- The current Tauri setup is intentionally thin, and the UI still uses the existing React + Express app
