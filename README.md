<!-- AIGC START -->
# 小熊早报 · Bear Morning Brief

> 一杯咖啡的时间，看完今天的 AI 世界。固定单页晨间简报：天气 → AI 前沿 → AI 产品更新 → 财经（小米 01810.HK）→ 今日待办。最新一期默认置顶，日期归档可回看历史。

- **线上地址**：<https://happyangel.github.io/ai-daily-newspaper/>
- **内容形态**：纯静态站（无构建步骤），`index.html` 运行时读取 `data/editions/*.json` 数据渲染
- **当前状态**：内置 **2026-10-28 示例期**（`"sample": true`，页面带「示例数据」角标），正式内容将由每日自动化流程注入

## 目录结构

```
.
├── index.html                     # 单页应用外壳（唯一 HTML 入口）
├── assets/
│   ├── css/style.css              # 全部样式（深色玻璃拟态 + 极慢环境动效）
│   ├── js/i18n.js                 # 界面文案字典（zh / en）
│   ├── js/app.js                  # 渲染、归档、灯箱、i18n、待办持久化
│   └── img/                       # 占位示例图 + 站点图标（SVG）
├── data/editions/
│   ├── index.json                 # 期数清单（自动生成，勿手工排序）
│   └── 2026-10-28.json           # 单期数据（示例期）
├── schema/edition.schema.json     # 单期 JSON Schema（数据模型文档）
├── scripts/update_manifest.py    # 重建期数清单 + 数据校验
└── .github/workflows/update-manifest.yml  # 推送日期 JSON 后自动更新清单
```

## GitHub Pages 配置

站点从 **`main` 分支根目录（`/`）** 提供服务（不使用 `/docs` 目录）。

本仓库的自动化令牌没有 Pages 写权限（启用 Pages 会返回 403），所以需要手动启用一次（约两步）：

1. 打开 <https://github.com/HappyAngel/ai-daily-newspaper/settings/pages>
2. **Build and deployment → Source** 选择 *Deploy from a branch*
3. Branch 选择 `main`，目录选 `/ (root)`，保存
4. 约等待 1-2 分钟，访问 <https://happyangel.github.io/ai-daily-newspaper/>

有 `pages:write` 权限的 CLI 一行命令（任选其一）：

```bash
gh api repos/HappyAngel/ai-daily-newspaper/pages \
  --method POST --field 'source[branch]=main' --field 'source[path]=/'
```

> 根目录的 `.nojekyll` 关闭了 Jekyll 处理，保证 `assets/`、`data/` 原样发布。

## 每日如何新增一期（自动化注入路径）

页面完全数据驱动，**不需要改任何 HTML/CSS/JS**：

1. 生成单期数据文件 `data/editions/YYYY-MM-DD.json`（复制 `2026-10-28.json` 或对照 `schema/edition.schema.json` 编写；`date` 字段必须与文件名一致；正式数据不要带 `"sample": true`）
2. 提交并推送到 `main`
3. `update-manifest` 工作流会自动校验 JSON 并重建 `data/editions/index.json`（新 → 旧排序）
4. GitHub Pages 随 main 自动重新发布，首页默认展示最新一期

如果工作流不可用，也可本地执行后一起提交：

```bash
python3 scripts/update_manifest.py
```

校验失败（JSON 损坏、日期不匹配）时脚本以非零码退出，自动拦截坏数据上线。

**周日特供**：当日期为周日时，在 `aiTech.weeklyTrend` 里填写本周趋势小结（`title` / `summary` / `points[]`），页面会在 AI 前沿区块顶部渲染成醒目的周趋势卡片；其他日期保持 `null`。

**图片必须入库，禁止热链外部 CDN**：单期 JSON 里的图片 `src` 不要直接引用 `pbs.twimg.com`、`ton.twitter.com` 等外链（在中国大陆常被阻断，GitHub Pages 上的缩略图会整片空白）。正确做法：把当期截图下载到 `data/editions/YYYY-MM-DD/images/`（短稳定文件名，如 `xpost-01.jpg`，保留原始格式），`src` 写成站点根相对路径 `data/editions/YYYY-MM-DD/images/xpost-01.jpg`（与页面加载 `data/editions/...json` 同一风格，`app.js` 的 `thumbsHtml` 原样使用 `src`，无需改前端）。参考 2026-10-29 期的做法。

## 本地预览

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

> 直接双击 `index.html`（`file://` 协议）无法 fetch JSON 数据，必须走 HTTP。

## 设计与交互约束

- **视觉**：深色玻璃拟态卡片、暖橙晨光点缀，宽屏（约 1840px 内）满幅利用、无大面积空白边距
- **动效**：仅保留 80-110 秒周期的柔和光斑漂移与细微噪点质感；无闪烁、无扫描线、无光标闪烁、无流光扫过；尊重系统 `prefers-reduced-motion`
- **i18n**：默认跟随系统语言（非英文系统默认中文）；右上角「中 / EN」切换，选择记忆在 localStorage；内容文案通过 `{"zh": "...", "en": "..."}` 字段实现双语
- **图片 UX**：条目内图片以小缩略图并排展示，点击进入全屏灯箱；`Esc` / 点击背景关闭；`←` `→` 或箭头按钮在同一条目的图组内循环
- **今日待办**：勾选状态按日期存储在浏览器本地（localStorage），仅本地记忆

## 数据模型速览

单期 JSON 的完整定义见 [`schema/edition.schema.json`](schema/edition.schema.json)。分区顺序（与页面一致，顺序固定）：

| 字段 | 内容 |
| --- | --- |
| `weather` | 天气，默认城市北京 |
| `aiTech.openingSummary` | 开篇速览（本节第一段，必须有） |
| `aiTech.xPosts[]` | X 帖子：一句话摘要 + `link`，可带 `images[]` |
| `aiTech.engBlogs[]` | 工程博客精选 |
| `aiTech.alphaxivTop3[]` | alphaXiv TOP3（rank 1-3） |
| `aiTech.weeklyTrend` | 周日才填的本周趋势小结 |
| `aiProducts.items[]` | 固定顺序：Hermes Agent / OpenClaw / DeepSeek Harness / codex + Claude / Cursor / Grok Bot |
| `finance.stock` | 小米 `01810.HK` 行情（`spark[]` 渲染分时小图） |
| `todos[]` | 今日待办（priority: high / mid / low） |

## English summary

A single-page, data-driven morning brief for GitHub Pages (served from the root of the `main` branch). Each edition is one JSON file under `data/editions/`; an Actions workflow rebuilds the manifest `index.json` whenever new edition files land on `main`. The UI defaults to the newest edition, offers a date archive panel, zh/en i18n (system language by default), small side-by-side thumbnails with a keyboard-friendly lightbox, and soft ambient motion only (no flashing effects). The bundled 2026-10-28 edition is clearly marked as placeholder sample data.
<!-- AIGC END -->
