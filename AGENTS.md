# Agent Guide

## プロジェクト概要

`~/.claude/` からセッション一覧を読み込み、`claude --resume <sessionId>` コマンドをすばやくコピーできる Web アプリ。

## 構成

単一パッケージ（モノレポではない）。

```
src/
  client/   # React 19 + Vite + TypeScript
  server/   # Express + TypeScript (tsx watch で起動)
```

| サービス | URL                    | 起動スクリプト   |
|----------|------------------------|-----------------|
| Client   | http://localhost:6814  | `pnpm dev:client` |
| Server   | http://localhost:6815  | `pnpm dev:server` |

両方まとめて起動: `pnpm dev`

## 主要コマンド

```bash
pnpm dev          # クライアント + サーバーを同時起動
pnpm test         # Vitest（サーバーのみ）
pnpm typecheck    # クライアント + サーバー両方の型チェック
pnpm build        # 本番ビルド
```

## パスエイリアス

クライアント側コードでは `@/` → `src/client/` のエイリアスが使える。

```ts
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
```

`tsconfig.json`（クライアント）と `vite.config.ts` の両方に設定済み。

## TypeScript 設定

| ファイル | 対象 | モジュール解決 |
|---|---|---|
| `tsconfig.json` | クライアント + Vite | Bundler |
| `tsconfig.server.json` | サーバー | NodeNext |

サーバー側の import は `.js` 拡張子が必要（NodeNext）:
```ts
import sessionsRouter from "./routes/sessions.js";
```

## テスト

- フレームワーク: Vitest + Supertest
- 対象: `src/server/**/*.test.ts`（クライアントのテストはない）
- `fs/promises` をモックして Express アプリをテスト

```bash
pnpm test         # 1回実行
pnpm test:watch   # ウォッチモード
```

## フロントエンド技術スタック

- React 19 / React Router v7
- Tailwind CSS v4（`@tailwindcss/vite` プラグイン、`src/client/index.css` で `@import "tailwindcss"`）
- shadcn/ui（`@base-ui/react` ベース）
- Sonner（トースト通知）
- Geist フォント（`@fontsource-variable/geist`）

## サーバー側の主要ロジック

### セッションファイルの読み取り

`~/.claude/projects/<encoded-path>/<sessionId>.jsonl` を読む。

- 先頭 8KB → `firstMessage` 抽出
- 末尾 256KB → `lastUserMessage`・`lastTimestamp` 抽出
- パフォーマンスのため `fs.open` + byte range read（readline ストリームは使わない）

**フィルタ条件（`lastUserMessage`）:**
- `type === "user"`
- `isMeta !== true`
- `typeof message.content === "string"`（tool_result は配列なのでスキップ）
- `content !== "/exit"`

### パスデコード

`C--Users-foobar-Documents-repos-cc-session-selector` → `C:\Users\foobar\Documents\repos\cc-session-selector`

Windows と macOS の両方の Claude 形式パスを復元できるようにしつつ、ファイルシステムを参照して `-` を含むディレクトリ名（`cc-session-selector` など）を正しく復元する（`decodeProjectPath` in `src/server/routes/sessions.ts`）。

## UI の注意点

- カード間の区切りは `divide-y divide-border`（Card コンポーネント自体は `border-0 ring-0`）
- タブバーは Ghostty 風（`bg-muted/40`、アクティブタブのみ `bg-background`）
- プレビューで CSS の確認が難しい場合は `preview_snapshot`（アクセシビリティツリー）を使う

## pnpm 設定

`pnpm-workspace.yaml` に `minimumReleaseAge: 4320`（3日）が設定されている（サプライチェーン対策）。

`package.json` の `pnpm.onlyBuiltDependencies: ["esbuild"]` でインタラクティブな approve-builds プロンプトを回避。

## プレビューサーバー

`.claude/launch.json` に `server`・`client` の設定あり。`preview_start` で起動する。

tsx watch は **ファイル変更を自動検知しないことがある**。サーバーコードを変更したら `preview_stop` → `preview_start` で再起動すること。
