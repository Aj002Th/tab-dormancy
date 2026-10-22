# Tab Dormancy

在系统空闲或锁屏后，按可编排的表达式策略关闭标签页，并保留可搜索、可批量恢复的关闭历史。

## 开发

```bash
npm install
npm run icons
npm run dev
```

## 验证

```bash
npm run verify
npx playwright install chromium
npm run test:e2e
```

## 加载扩展

1. 打开 `chrome://extensions`。
2. 开启开发者模式。
3. 选择“加载已解压的扩展程序”，指向 `dist/`。

## 设计

设计文档：`docs/superpowers/specs/2026-10-22-tab-dormancy-design.md`。
实现计划：`docs/superpowers/plans/2026-10-22-tab-dormancy.md`。