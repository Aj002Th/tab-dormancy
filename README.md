# Tab Dormancy

在系统空闲或锁屏后，按可编排的表达式策略关闭标签页，并保留可搜索、可批量恢复的关闭历史。

## 安装

当前扩展通过 GitHub Releases 分发，尚未上架 Chrome Web Store 或 Edge Add-ons。

1. 打开 [Releases](https://github.com/Aj002Th/tab-dormancy/releases)。
2. 下载最新的 `tab-dormancy-vX.Y.Z.zip`。
3. 解压到一个固定目录，并保留该目录。
4. 打开 `chrome://extensions`，Edge 使用 `edge://extensions`。
5. 打开右上角的“开发者模式”。
6. 点击“加载已解压的扩展程序”，选择解压后的目录。
7. 更新时重新下载 ZIP、覆盖解压目录，然后在扩展页点击“重新加载”。

> 这是开发者模式安装，不是商店的一键安装，也不会自动更新。Chrome 和 Edge 的安全策略不允许普通用户直接从 GitHub 安装 `.crx` 文件。

## 开发

```bash
npm ci
npm run icons
npm run dev
```

`npm run dev` 会持续监听源码并重新构建 `dist/`，但浏览器不会自动重载扩展。每次构建完成后，在 `chrome://extensions` 中点击 Tab Dormancy 的“重新加载”；如果仪表盘已打开，再刷新页面。

常用命令：

```bash
npm run build      # 单次构建并检查产物/体积
npm run typecheck  # TypeScript 检查
npm run lint       # Biome 检查
npm test           # 单元与集成测试
```

## 验证

```bash
npm run verify
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` 会启动带界面的 Chromium。Linux CI 中需要通过 `xvfb-run` 运行。

## 打包

```bash
npm run package
```

输出：

```text
release/
  tab-dormancy-v0.1.0.zip
  SHA256SUMS
```

ZIP 内是 `dist/` 的内容，`manifest.json` 位于压缩包根目录，可以直接解压后加载。`npm run package` 会先执行构建；`npm run package:zip` 只打包现有的 `dist/`，供 CI 使用。

打包时会校验：

- `package.json` 与 `dist/manifest.json` 的版本一致；
- 如果传入 `--tag`，tag 必须与版本一致；
- `dist/` 中包含 `manifest.json`、`background.js`、弹窗和仪表盘页面。

## 发布

发布由 `.github/workflows/release.yml` 自动完成。流程是：

```text
更新版本号 → 提交 → 打 v* tag → 推送 tag
  → 安装依赖 → verify → E2E → 打包 ZIP → 创建 GitHub Release
```

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

如果 tag 与 `package.json` 或 `manifest.json` 的版本不一致，发布 workflow 会直接失败，不会生成 Release。

需要重新构建已有 tag 时，在 GitHub Actions 中手动运行 `Release` workflow，并填写已有 tag，例如 `v0.2.0`。

## 设计文档

设计文档和实现计划保存在本地 `docs/superpowers/`，不随仓库发布。
