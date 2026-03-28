# Agent Session Selector

Claude Code のセッションを一覧・検索し、resume コマンドをすばやくコピーできる Web アプリです。

## 機能

- `~/.claude/` からセッション一覧を読み込み
- プロジェクトディレクトリごとにタブで整理
- セッション名・ID によるリアルタイム絞り込み
- `claude --resume <sessionId>` コマンドをワンクリックでコピー
- アクティブセッション（実行中）の表示
- ダークモード対応

## 技術スタック

- **Client**: React 19 + Vite + TypeScript + shadcn/ui + Tailwind CSS v4
- **Server**: Express + TypeScript
- **Test**: Vitest + Supertest

## セットアップ

```bash
pnpm install
```

## 開発

```bash
pnpm dev
```

| サービス | URL |
|----------|-----|
| Client   | http://localhost:6814 |
| Server   | http://localhost:6815 |

## テスト

```bash
pnpm test
```

## ビルド

```bash
pnpm build
```
