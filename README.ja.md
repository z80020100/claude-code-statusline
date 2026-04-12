# claude-code-statusline

[![Node.js](https://img.shields.io/badge/Node.js-≥20-green)](https://nodejs.org/) [![npm](https://img.shields.io/npm/v/@z80020100/claude-code-statusline)](https://www.npmjs.com/package/@z80020100/claude-code-statusline)

[English](README.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) 用カスタムステータスライン — モデル情報、コンテキスト使用量グラデーションバー、トークン統計、コスト、Git ステータス、レート制限を表示します。

![Demo](assets/claude-code-statusline-demo.png)

## 機能

- **コンテキスト使用量グラデーションバー** — 緑から赤への4段階カラースペクトラム
- **トークンとコスト追跡** — 入出力トークン数、キャッシュヒット率、セッションコスト
- **セッションタイミング** — 実時間と API 応答時間を並列表示
- **Git 連携** — ブランチ名、変更フラグ、worktree インジケーター、main との差分統計
- **レート制限モニタリング** — 現在 (5h) と週間 (7d) の使用量およびリセット時刻
- **Sandbox インジケーター** — sandbox モードのオフ、オン、自動を表示
- **パス圧縮** — 長いパスを自動短縮して80カラムに収める
- **ランタイム依存ゼロ** — Node.js 組み込みモジュールのみ使用

## インストール

```sh
npm install -g @z80020100/claude-code-statusline
```

## セットアップ

```sh
claude-code-statusline setup
```

`~/.claude/settings.json` に `statusLine` 設定を書き込みます：

```json
{
  "statusLine": {
    "type": "command",
    "command": "claude-code-statusline"
  }
}
```

設定を削除する場合：

```sh
claude-code-statusline setup --uninstall
```

## 表示レイアウト

全フィールドを最大幅で表示した場合：

![全フィールド](assets/claude-code-statusline-simulation.png)

ステータスラインは最大6行で表示されます — 各行は80文字以内に制限されます：

| 行  | 内容                                                                                             |
| --- | ------------------------------------------------------------------------------------------------ |
| 1   | バージョン、sandbox モード、セッション名と ID                                                    |
| 2   | モデル名、effort レベル、コンテキスト使用量バーとパーセンテージ、最終更新時刻                    |
| 3   | トークン数 (入力/出力)、キャッシュヒット率、コスト、セッション/API 所要時間、増減行数、200K 警告 |
| 4   | プロジェクトディレクトリ、git ブランチ、変更フラグ、worktree インジケーター、main との差分       |
| 5   | 現在の作業ディレクトリ（プロジェクトルートと異なる場合のみ表示）                                 |
| 6   | レート制限 — 現在 (5h) と週間 (7d) の使用量およびリセット時刻                                    |

### カラーゾーン

コンテキストとレート制限のバーは4段階グラデーションを使用します：

| 範囲    | 色       | 意味   |
| ------- | -------- | ------ |
| 0–49%   | グリーン | 正常   |
| 50–69%  | ゴールド | 中程度 |
| 70–89%  | コーラル | やや高 |
| 90–100% | レッド   | 危険   |

## 動作原理

Claude Code は各レンダリングサイクルで stdin を通じて `statusLine` コマンドに JSON オブジェクトを送信します。JSON には現在のセッション状態（モデル、トークン、コスト、ワークスペース、レート制限など）が含まれます。本ツールはそれを解析し ANSI カラーテキストを stdout に出力します。

設計上の決定事項：

- **依存関係ゼロ** — Node.js 組み込みモジュールのみ使用 (`fs`, `path`, `os`, `child_process`)
- **Git キャッシュ** — ブランチと差分統計を5秒間キャッシュしサブプロセス呼び出しを削減
- **設定キャッシュ** — effort レベルと sandbox モードは mtime ベースのキャッシュで冗長なファイル読み込みを回避
- **80カラム制限** — 自動テストで強制；長いパスは自動的に圧縮
- **256色 ANSI** — ターミナル間で一貫した描画；Claude ブランドオレンジは24ビットトゥルーカラーを使用

## 動作要件

| 依存関係    | Tier 1（CI テスト済）                       | Tier 2（best-effort） |
| ----------- | ------------------------------------------- | --------------------- |
| Node.js     | >= 20                                       | 18                    |
| Claude Code | >= 2.1.80（`rate_limits` フィールドが必要） |                       |

## 開発

```sh
git clone https://github.com/z80020100/claude-code-statusline.git
cd claude-code-statusline
npm install                 # prepare で pre-commit hooks も自動有効化

npm run check               # lint + フォーマットチェック + 幅チェック + CLI テスト
npm run fix                 # lint とフォーマットの問題を自動修正
npm test                    # 幅チェック + CLI テストのみ
npm run lint                # ESLint + shellcheck + actionlint
npm run simulate            # worst-case ステータスラインを描画し幅レポートを表示
npm run ci:local            # act で CI ワークフローをローカル実行（Docker が必要）
```

## ライセンス

[MIT](LICENSE)
