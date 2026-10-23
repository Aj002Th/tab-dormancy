# Tab Dormancy

> 在系统空闲或锁屏后，按你定义的规则关闭不重要的标签页；关闭的标签会进入可搜索、可恢复的历史。

Tab Dormancy 是一个只做标签页清理的 Chrome / Edge 扩展。它不按固定时间打扰你，也不使用黑盒评分，而是让你用 `AND / OR / NOT` 组合 Chrome 原生的标签页状态，明确决定哪些标签应该关闭、哪些必须保留。

清理前可以预览命中数量，清理后可以查看关闭历史、撤销上一次操作，或按原窗口和标签组批量恢复。

当前通过 GitHub Releases 分发，尚未上架 Chrome Web Store 或 Edge Add-ons。

## 它解决什么问题

浏览器用久了，标签页会越开越多：查资料留下的页面、临时打开又忘记关闭的页面、几天没再看过的文章。手动整理很麻烦，全部关闭又可能丢掉正在处理的内容。

适合经常开着大量标签页、希望离开电脑后自动整理，但又不想丢失内容的人。

Tab Dormancy 的思路是：

- **只在系统空闲或锁屏后行动**，工作时不会突然关闭标签页。
- **规则可解释**，每个条件都能对应到标签页的真实状态。
- **关闭前先预览**，自定义策略必须先预览才能启用。
- **关闭后能恢复**，历史记录保留 URL、标题、窗口和标签组信息。
- **默认保护重要标签**，固定、正在发声、当前激活和分组标签都可以排除。

它关闭的是标签页本身，不是 `tabs.discard()` 式的休眠或卸载。这样能真正释放标签页占用的资源；需要时再从历史中恢复。

## 功能

### 自动触发，而不是定时打扰

- **空闲触发**：系统空闲达到设定阈值后执行一次清理，默认 15 分钟。
- **锁屏触发**：检测到锁屏后，默认再等待 15 分钟；期间解锁会取消本次清理。可以关闭锁屏触发，或把延迟设为 0 立即执行。
- **手动触发**：在弹窗或仪表盘中随时预览并清理。
- **启动不清理**：浏览器启动时只做状态校验、历史淘汰和未完成清理的收敛，不会一开机就关闭标签页。

### 可编排的规则引擎

规则不是一组固定开关，而是一棵表达式树：

- 支持 `AND`（全部满足）、`OR`（任一满足）、`NOT`（取反）。
- 组可以嵌套，最多 8 层，总节点最多 200 个。
- 条件由“标签页事实 + 操作符 + 值”组成。
- 文本比较不区分大小写。
- 域名匹配按主机名边界处理，`google.com` 会匹配 `mail.google.com`，但不会匹配 `evilgoogle.com`。
- 通配符支持 `*` 和 `?`，不支持正则表达式。

### 三套开箱即用的预设

| 预设 | 命中条件 | 额外保护 |
|---|---|---|
| 温和 | 超过 7 天未访问 | 固定、正在发声、当前激活、在标签组中 |
| 标准 | 超过 3 天未访问 | 固定、正在发声、当前激活、在标签组中 |
| 激进 | 超过 1 天未访问 | 固定、正在发声、当前激活 |

默认启用“标准”。预设是只读的，复制后可以自由修改。

### 预览、解释，再执行

- 弹窗会显示当前策略预计可以清理多少个标签。
- 仪表盘的“标签页”页会标记命中项，展开后可以看到每个条件的事实实际值。
- 自定义策略在编辑时会实时预览命中数量；没有成功预览的策略不能启用。
- 如果策略使用了当前浏览器不支持的事实，自动清理会暂停并显示原因，而不是静默跳过。

### 安全清理

除了规则本身，扩展还会执行一组不能绕过的保护：

- 只处理 `http:`、`https:`、`file:` 页面。
- 跳过无痕窗口、`chrome://`、`edge://`、`devtools://`、扩展页面等内部页面。
- 每个窗口至少保留一个标签页，优先保留当前激活标签，其次保留最近访问的标签。
- 关闭前重新读取标签，确认 `id`、`windowId` 和 URL 没有变化；变化则跳过。
- 先把关闭快照写入历史，写入失败就取消本次清理，不关闭任何标签。
- 清理任务互斥，最多同时关闭 4 个标签，单个标签失败不影响其他标签。
- 最近一次清理的结果可以在弹窗中撤销。

### 可搜索、可恢复的关闭历史

- 默认保留 30 天，最多 5000 条；保留天数可以在设置中调整。
- 支持按标题、URL、域名搜索，按触发方式（空闲 / 锁屏 / 手动）和恢复状态筛选。
- 支持单选、多选、批量恢复。
- 可以恢复到当前窗口，也可以按原窗口分组新建窗口。
- 会尽力恢复标签组、固定状态和分组属性。
- 可选“完整恢复”：通过 Chrome `sessions` API 尝试恢复更多原生状态，失败时自动退回普通打开 URL。
- 恢复后记录不会删除，而是标记为“已恢复”。

### 本地优先

- 没有网络请求、遥测、统计或远程配置。
- 没有内容脚本，不注入网页。
- 没有 `history` 权限，不读取浏览历史。
- 不申请 host permissions。
- 设置、策略和历史保存在本机 `chrome.storage.local`，临时会话 ID 保存在 `chrome.storage.session`；不使用云同步。

## 安装

当前扩展通过 GitHub Releases 分发：

1. 打开 [Releases](https://github.com/Aj002Th/tab-dormancy/releases)。
2. 下载最新的 `tab-dormancy-vX.Y.Z.zip`。
3. 解压到一个固定目录，并保留该目录。
4. 打开 `chrome://extensions`，Edge 使用 `edge://extensions`。
5. 打开右上角的“开发者模式”。
6. 点击“加载已解压的扩展程序”，选择解压后的目录。
7. 更新时重新下载 ZIP、覆盖解压目录，然后在扩展页点击“重新加载”。

> 这是开发者模式安装，不是商店的一键安装，也不会自动更新。Chrome 和 Edge 的安全策略不允许普通用户直接从 GitHub 安装 `.crx` 文件。

支持 Chrome 121+ 和基于 Chromium 的最新版 Edge。不支持 Firefox 和 Safari。

## 使用

### 弹窗

点击工具栏中的 Tab Dormancy 图标：

- 查看当前启用的策略和预计可清理数量。
- 点击清理按钮后，会就地展开确认框，确认后才会关闭标签页。
- 清理完成可以撤销，或进入仪表盘继续处理。
- 如果有策略不可用、清理正在进行等异常，弹窗会直接显示原因。

### 仪表盘

点击弹窗右上角的齿轮按钮，或扩展详情页中的“扩展选项”，打开仪表盘。

| 页面 | 用途 |
|---|---|
| 标签页 | 查看当前策略、可管理标签、命中状态、事实值和规则判断；多窗口时按窗口筛选，可以直接发起清理 |
| 关闭历史 | 搜索、筛选、批量恢复、删除或清空历史 |
| 策略 | 查看预设和自定义策略；点击卡片查看和编辑规则，也可启用、复制或删除 |
| 设置 | 调整空闲阈值、锁屏清理、锁屏延迟、历史保留天数；修改后才可保存，加载失败可直接重试；查看浏览器能力 |

### 编辑策略

1. 在“策略”页点击任意策略卡片查看和编辑规则；新建策略或复制预设会直接打开编辑器，并在列表底部显示实时更新的“草稿”卡片。点击编辑器中的“取消创建”会同步移除草稿卡片。策略卡片会用主条件和“排除”标签概括规则，完整条件在右侧编辑器中查看；右侧编辑框会跟随当前选中的卡片对齐，并自动滚动到可见位置。
2. 用可视化编辑器添加条件或子组，切换 `AND / OR`，给条件或组加上“取反”。布尔条件直接通过“取反”表达真假，不需要再选择“是 / 否”。
3. 时间类数字条件可以用分钟、小时或天输入，内部统一按分钟保存；修改后实时预览预计命中数量，悬停预览提示可查看最多 5 条命中示例。策略卡片会按天、小时或分钟显示时间限制。
4. 预览成功后保存，才能启用这套策略；未预览的自定义策略不能启用。已启用的策略按钮会显示为“启用中”，不能重复点击；当前启用的策略没有内容修改时，保存和保存并启用按钮也不可点击。
5. 内置预设不可修改、不可删除，只能复制，且不显示保存按钮；启用中的策略不能删除，且至少保留一套策略。

### 常用规则示例

以下示例展示规则含义，实际编辑时使用可视化编辑器配置：

- **保护工作站点**：`NOT domain inDomainList ["github.com", "company.com"]`
- **只在大扫除时清理**：`totalTabCount > 30 AND lastActiveMinutes > 1440`
- **只清理非当前窗口**：`windowFocused is false AND lastActiveMinutes > 1440`
- **保护名称包含“工作”的标签组**：`NOT (grouped AND groupTitle contains "工作")`

> 如果某个标签的“最后访问时间”不可用，所有基于 `lastActiveMinutes` 的数字比较都会视为不命中，避免误关。

## 规则条件

### 可用事实

| 事实 | 类型 | 含义 |
|---|---|---|
| `lastActiveMinutes` | 数字 | 距离最后一次访问的分钟数；不可用时视为未知，不命中 |
| `totalTabCount` | 数字 | 所有普通窗口中可管理标签的总数 |
| `windowTabCount` | 数字 | 同一窗口内可管理标签的数量 |
| `pinned` | 布尔 | 标签是否已固定 |
| `audible` | 布尔 | 标签是否正在播放声音 |
| `active` | 布尔 | 标签是否是其窗口的当前标签 |
| `muted` | 布尔 | 标签是否已静音 |
| `discarded` | 布尔 | 标签是否已被浏览器丢弃 |
| `frozen` | 布尔 | 标签是否已被 Chrome 冻结（需要 Chrome 132+） |
| `grouped` | 布尔 | 标签是否属于标签组 |
| `groupCollapsed` | 布尔 | 标签所在的标签组是否已折叠 |
| `windowFocused` | 布尔 | 标签所在窗口是否获得焦点 |
| `onlyTabInWindow` | 布尔 | 标签是否是窗口内唯一可管理标签 |
| `domain` | 文本 | 主机名，例如 `mail.google.com` |
| `url` | 文本 | 完整 URL |
| `title` | 文本 | 页面标题 |
| `groupTitle` | 文本 | 标签组名称；未分组时为空字符串 |

`lastActiveMinutes` 依赖浏览器的 `lastAccessed` 字段；`frozen` 需要 Chrome 132+；`grouped`、`groupCollapsed` 和 `groupTitle` 依赖标签组能力。当前浏览器不支持的事实在编辑器中会禁用。

“可管理标签”指普通非无痕窗口中，scheme 为 `http:`、`https:` 或 `file:` 的标签。无痕窗口和浏览器内部页面不参与计数，也不会被关闭。

### 操作符

| 类型 | 操作符 |
|---|---|
| 数字 | `gt`、`gte`、`lt`、`lte`、`eq`、`neq` |
| 布尔 | `is` |
| 文本 | `equals`、`contains`、`startsWith`、`endsWith` |
| 域名 | 在文本操作符之外，还支持 `matchesDomain`、`inDomainList` |
| 通配符 | `matchesGlob`，支持 `*` 和 `?` |
| 逻辑 | `all`（AND）、`any`（OR）、`not`（NOT） |

### 表达式限制

- 每个 `AND` / `OR` 组至少有 1 个子节点，最多 20 个直接子节点。
- `NOT` 必须恰好有 1 个子节点。
- 表达式深度不超过 8，总节点不超过 200。
- 空组不允许保存，因为空 `AND` 会匹配所有标签。
- 数字必须是有限值；分钟值范围为 0–525600。
- 文本长度不超过 512；域名列表每行一个，最多 50 项。
- 操作符必须和事实类型匹配；使用当前浏览器不支持的事实时不能保存或启用。

## 架构

项目按“纯逻辑、浏览器适配、后台编排、界面”分层，核心逻辑不直接依赖 Chrome API，方便测试和解释。

```text
src/
  core/       纯函数：事实构建、规则求值、清理计划、历史与恢复计划
  platform/   Chrome API 适配：tabs/windows/idle/alarms/tabGroups/sessions/storage
  background/ service worker：事件监听、消息路由、组合根
  ui/         popup 与 dashboard，只通过类型化消息读写
  shared/     跨层类型、常量、错误和 URL 工具
```

运行时数据流：

```text
chrome.idle / alarm / 用户操作
              │
              ▼
   background service worker
              │
              ▼
   core：规则求值 → 清理计划 → 历史快照
              │
              ▼
   chrome.tabs / chrome.storage
              ▲
              │
   popup / dashboard（类型化消息）
```

几个关键设计：

- **`core` 不导入 `chrome.*`**：输入是标签快照、窗口/分组快照、策略和当前时间，输出是事实、命中结果、清理计划和恢复计划。
- **`background` 是唯一组合根**：监听空闲、锁屏、alarm 和 UI 消息，读取状态，调用 core，再写回存储。
- **UI 不直接关闭标签页**：清理、恢复、策略和设置等写操作全部通过类型化消息交给 service worker。
- **能力检测与降级**：运行时检测 `lastAccessed`、`frozen`、`tabGroups`、`sessions` 是否可用；不可用的事实在编辑器中禁用，包含这些事实的策略会暂停自动清理。
- **历史分片存储**：`history:index` 保存摘要，`history:item:<id>` 保存完整记录，避免每次更新重写全部历史。
- **临时会话 ID**：浏览器会话 ID 存在 `chrome.storage.session`，用于恢复时正确区分原窗口，避免浏览器重启后 `windowId` 复用导致错误合并。

## 权限

| 权限 | 用途 |
|---|---|
| `tabs` | 读取标签页 URL、标题和状态；关闭标签页 |
| `storage` | 保存设置、策略和关闭历史，仅本地 |
| `idle` | 检测系统空闲或锁屏状态 |
| `alarms` | 锁屏延迟清理的一次性定时器 |
| `tabGroups` | 读取标签组信息，恢复时重建标签组 |
| `sessions` | 可选的完整恢复，仅在用户触发恢复时使用 |

不申请 `history`、host permissions、`webRequest`、`webNavigation`、`unlimitedStorage`，也不注入内容脚本。

## 开发

```bash
npm ci
npm run icons
npm run dev
```

`npm run dev` 会持续监听源码并重新构建 `dist/`，但浏览器不会自动重载扩展。每次构建完成后，在 `chrome://extensions` 中点击 Tab Dormancy 的“重新加载”；如果仪表盘已经打开，再刷新页面。

常用命令：

| 命令 | 说明 |
|---|---|
| `npm run dev` | Vite watch 构建 |
| `npm run build` | 单次构建，并检查产物和体积预算 |
| `npm run typecheck` | TypeScript 检查 |
| `npm run lint` | Biome 检查 |
| `npm test` | 单元与集成测试 |
| `npm run test:e2e` | 构建后运行 Playwright E2E |
| `npm run verify` | typecheck + lint + test + build |
| `npm run package` | 构建并生成发布 ZIP |
| `npm run package:zip` | 只打包现有 `dist/` |

E2E 需要先安装浏览器：

```bash
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` 使用带界面的 Chromium；Linux CI 中需要通过 `xvfb-run` 运行。

## 打包

```bash
npm run package
```

输出：

```text
release/
  tab-dormancy-vX.Y.Z.zip
  SHA256SUMS
```

ZIP 内是 `dist/` 的内容，`manifest.json` 位于压缩包根目录。打包时会校验：

- `package.json` 与 `dist/manifest.json` 的版本一致；
- 传入 `--tag` 时，tag 与版本一致；
- 构建产物完整，并通过 JS/CSS 体积门禁。

## 发布

发布由 `.github/workflows/release.yml` 自动完成。推送 `v*` tag 后，GitHub Actions 会安装依赖、运行 `verify` 和 E2E、打包 ZIP，然后创建 GitHub Release 并附加 ZIP 与校验和。

发布前把 `package.json` 和 `public/manifest.json` 的版本改成同一个值，例如 `0.2.0`：

```bash
npm version 0.2.0 --no-git-tag-version
# 手动把 public/manifest.json 的 version 改为 0.2.0

npm run verify
git add package.json package-lock.json public/manifest.json
git commit -m "chore: release v0.2.0"
git tag v0.2.0
git push origin master --tags
```

如果 tag 与 `package.json` 或 `manifest.json` 的版本不一致，workflow 会直接失败，不会生成 Release。

需要重新构建已有 tag 时，在 GitHub Actions 中手动运行 `Release` workflow，并填写已有 tag。

## 当前限制

- 尚未上架官方商店，GitHub Release 安装需要开发者模式，且不会自动更新。
- 只支持 Chrome / Edge 等 Chromium 浏览器，不支持 Firefox / Safari。
- 关闭的是标签页，不是休眠；恢复主要依赖 URL，完整页面状态不保证。
- 不做跨设备同步、使用统计、数据导出或分析看板。
- 不处理无痕窗口。
- 关闭历史默认保留 30 天、最多 5000 条。
