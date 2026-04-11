# claude-code-statusline

[English](README.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) 的自訂狀態列 — 顯示模型資訊、上下文使用量漸層條、Token 統計、費用、Git 狀態和速率限制。

![Demo](assets/claude-code-statusline-demo.png)

## 功能

- **上下文使用量漸層條** — 綠到紅的 4 段色彩頻譜
- **Token 與費用追蹤** — 輸入/輸出 Token 數、快取命中率、Session 費用
- **Session 計時** — 同時顯示實際時間與 API 回應時間
- **Git 整合** — 分支名稱、修改標記、worktree 指示器、與 main 的差異統計
- **速率限制監控** — 當前 (5h) 和每週 (7d) 使用量及重置時間
- **Sandbox 指示器** — 顯示 sandbox 模式為關閉、開啟或自動
- **路徑壓縮** — 長路徑自動縮短以符合 80 欄限制
- **零執行時期依賴** — 僅使用 Node.js 內建模組

## 安裝

```sh
npm install -g @z80020100/claude-code-statusline
```

## 設定

```sh
claude-code-statusline setup
```

這會將 `statusLine` 寫入 `~/.claude/settings.json`：

```json
{
  "statusLine": {
    "type": "command",
    "command": "claude-code-statusline"
  }
}
```

移除設定：

```sh
claude-code-statusline setup --uninstall
```

## 顯示配置

所有欄位最大寬度的呈現：

![所有欄位](assets/claude-code-statusline-simulation.png)

狀態列最多顯示 6 行 — 每行限制在 80 個可見字元內：

| 行  | 內容                                                                              |
| --- | --------------------------------------------------------------------------------- |
| 1   | 版本、sandbox 模式、session 名稱和 ID                                             |
| 2   | 模型名稱、effort 等級、上下文使用量條與百分比、最後更新時間                       |
| 3   | Token 數 (輸入/輸出)、快取命中率、費用、session/API 持續時間、增減行數、200K 警告 |
| 4   | 專案目錄、git 分支、修改標記、worktree 指示器、與 main 的差異                     |
| 5   | 目前工作目錄（僅在與專案根目錄不同時顯示）                                        |
| 6   | 速率限制 — 當前 (5h) 和每週 (7d) 使用量及重置時間                                 |

### 色彩區間

上下文和速率限制的進度條使用 4 段漸層：

| 範圍    | 顏色 | 意義 |
| ------- | ---- | ---- |
| 0–49%   | 綠色 | 正常 |
| 50–69%  | 金色 | 中等 |
| 70–89%  | 珊瑚 | 偏高 |
| 90–100% | 紅色 | 危險 |

## 運作原理

Claude Code 在每次渲染時透過 stdin 傳入 JSON 物件給 `statusLine` 指令。JSON 包含目前的 session 狀態（模型、Token、費用、工作區、速率限制等）。本工具解析後輸出 ANSI 彩色文字到 stdout。

設計決策：

- **零依賴** — 僅使用 Node.js 內建模組 (`fs`, `path`, `os`, `child_process`)
- **Git 快取** — 分支和差異統計快取 5 秒以避免重複呼叫子程序
- **設定快取** — effort 等級和 sandbox 模式使用 mtime 快取以減少檔案讀取
- **80 欄限制** — 由自動化測試強制執行；長路徑自動壓縮
- **256 色 ANSI** — 跨終端一致性渲染；Claude 品牌橘色使用 24-bit true color

## 系統需求

- Node.js >= 18
- Claude Code >= 2.1.80（需要 `rate_limits` 欄位）

## 開發

```sh
git clone https://github.com/z80020100/claude-code-statusline.git
cd claude-code-statusline
npm install
./scripts/setup_hooks.sh   # 啟用 pre-commit hooks

npm test                    # lint + 格式檢查 + 寬度檢查 + CLI 測試
npm run check               # 寬度檢查 + CLI 測試
npm run lint                # 僅 ESLint
npm run simulate            # 渲染 worst-case 狀態列並顯示寬度報告
```

## 授權

[MIT](LICENSE)
