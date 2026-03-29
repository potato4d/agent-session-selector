# Agent Session Selector

Claude Code のセッションを一覧・検索し、`claude --resume <sessionId>` をすばやくコピーできるアプリです。

ブラウザで使う Web アプリとしても、Tauri の薄いデスクトップ shell としても動きます。

## 機能

- `~/.claude/` からセッション一覧を読み込む
- プロジェクトごとにタブで整理する
- セッション名、メッセージ、ID で絞り込む
- `claude --resume <sessionId>` をワンクリックでコピーする
- 実行中のアクティブセッションを表示する

## 技術スタック

- Client: React 19 + Vite + TypeScript + Tailwind CSS v4
- Server: Express + TypeScript
- Desktop shell: Tauri v2
- Test: Vitest + Supertest

## 動作要件

- Node.js 20+
- pnpm 10+
- `~/.claude/` に Claude Code のセッションがあること

## セットアップ

```bash
git clone <your-fork-or-repo-url>
cd agent-session-selector
pnpm install
```

## Web アプリとして起動

```bash
pnpm dev
```

- Client: `http://127.0.0.1:6814`
- Server: `http://127.0.0.1:6815`

## Tauri アプリとして起動

```bash
pnpm tauri:dev
```

`pnpm tauri:dev` は内部で Vite と Express も起動します。

## macOS で clone してから起動するまで

### 1. リポジトリを clone

```bash
git clone <your-fork-or-repo-url>
cd agent-session-selector
```

### 2. Xcode Command Line Tools を入れる

```bash
xcode-select --install
```

インストール後、必要なら一度ターミナルを開き直してください。

### 3. Rust を入れる

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

シェル設定を反映したら、確認します。

```bash
rustc --version
cargo --version
```

### 4. Node.js と pnpm を使える状態にする

Node.js 20 以上を入れたうえで、`pnpm` がない場合は有効化します。

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm --version
```

### 5. 依存を入れる

```bash
pnpm install
```

### 6. Tauri で起動する

```bash
pnpm tauri:dev
```

### 7. 配布用ビルドを作る

```bash
pnpm tauri:build
```

## テストとチェック

```bash
pnpm typecheck
pnpm test
```

## 補足

- `pnpm dev` はブラウザ向けの開発サーバーです
- `pnpm tauri:dev` はデスクトップ shell で開発するためのコマンドです
- 現在の Tauri は薄い shell で、UI 本体は既存の React + Express をそのまま使っています
