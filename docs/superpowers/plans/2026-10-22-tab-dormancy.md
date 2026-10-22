# Tab Dormancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个 Chrome/Edge MV3 扩展：按可编排的表达式策略，在系统空闲时关闭标签页，并提供可搜索、可批量恢复的关闭历史。

**Architecture:** `core` 是纯函数层（事实、规则求值、清理计划、历史规划），`platform` 封装 Chrome API 与存储，`background` 是唯一组合根并由 service worker 承载，`ui` 只通过类型化消息调用后台。自动触发只依赖 `chrome.idle`，锁屏使用一次性 alarm。

**Tech Stack:** TypeScript strict、Preact、Vite、Vitest、Playwright、Biome、`@types/chrome`。

**Spec:** `docs/superpowers/specs/2026-10-22-tab-dormancy-design.md`

## Global Constraints

- Chrome / Edge，Manifest V3，`minimum_chrome_version: "121"`。
- 权限恰好为 `tabs`、`storage`、`idle`、`alarms`、`tabGroups`、`sessions`；无 host permissions、无 `history`、无 content script。
- 运行时依赖只有 Preact；不引 UI 库、图表库、状态管理库。
- 无网络请求、无遥测、无使用时长采集、无统计、无导出。
- 界面仅简体中文，浅色/深色跟随 `prefers-color-scheme`。
- `core` 不 import `chrome.*`；所有时间判断由调用方传入 `now`。
- 默认值：空闲阈值 15 分钟；锁屏触发开启、延迟 15 分钟；历史保留 30 天、最多 5000 条；清理并发 4；锁过期 2 分钟；历史分页 50。
- 表达式限制：深度 ≤ 8、总节点 ≤ 200、每组直接子节点 ≤ 20、字符串 ≤ 512、域名列表 ≤ 50、数字 ≤ 525600。
- 预算：弹窗 + 仪表盘初始 JS 合计 < 60KB gzip，CSS < 10KB gzip。

## Review Focus

- 标签的 `lastAccessed` 缺失、为 0 或在未来时，时间条件必须不命中，标签不能被关闭；测试落在 Task 5、Task 6。
- 某窗口内所有可关闭标签都命中时，必须保留一个，不能把窗口关掉；测试落在 Task 6。
- 预览后、执行前标签 URL 发生变化时，必须跳过该标签；测试落在 Task 11。
- 关闭历史写入失败时，一个标签都不能关闭；测试落在 Task 11。
- 自定义策略未预览、或客户端试图修改内置策略时，必须被 service worker 拒绝；测试落在 Task 10、Task 14。

---

### Task 1: 扩展骨架、构建与测试基线

**Files:**
- Create: `package.json`、`tsconfig.json`、`vite.config.ts`、`vitest.config.ts`、`playwright.config.ts`、`biome.json`
- Create: `popup.html`、`dashboard.html`
- Create: `public/manifest.json`
- Create: `src/ui/popup/main.tsx`、`src/ui/popup/Popup.tsx`
- Create: `src/ui/dashboard/main.tsx`、`src/ui/dashboard/Dashboard.tsx`
- Create: `src/background/index.ts`
- Create: `src/ui/styles/tokens.css`、`base.css`、`popup.css`、`dashboard.css`
- Create: `scripts/generate-icons.mjs`、`scripts/check-build.mjs`
- Test: `tests/unit/manifest.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `dist/background.js`、`dist/popup.html`、`dist/dashboard.html`、`dist/manifest.json`；后续所有任务都在这套构建上运行。

- [ ] **Step 1: 写 manifest 契约测试**

Create `tests/unit/manifest.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8')) as {
  manifest_version: number;
  minimum_chrome_version: string;
  permissions: string[];
  host_permissions?: string[];
  content_scripts?: unknown[];
  background: { service_worker: string; type: string };
  action: { default_popup: string };
  options_ui: { page: string; open_in_tab: boolean };
};

describe('manifest', () => {
  it('uses MV3 and Chrome 121+', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe('121');
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(manifest.action.default_popup).toBe('popup.html');
    expect(manifest.options_ui).toEqual({ page: 'dashboard.html', open_in_tab: true });
  });

  it('requests exactly the approved permissions', () => {
    expect([...manifest.permissions].sort()).toEqual(
      ['alarms', 'idle', 'sessions', 'storage', 'tabGroups', 'tabs'].sort(),
    );
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/manifest.test.ts`

Expected: FAIL，`public/manifest.json` 不存在。

- [ ] **Step 3: 创建构建与测试配置**

Create `package.json`:

```json
{
  "name": "tab-dormancy",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite build --watch --mode development",
    "build": "vite build && node scripts/check-build.mjs",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "npm run build && playwright test",
    "icons": "node scripts/generate-icons.mjs",
    "verify": "npm run typecheck && npm run lint && npm run test && npm run build"
  },
  "dependencies": {
    "preact": "^10.24.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.0.0",
    "@playwright/test": "^1.50.0",
    "@types/chrome": "^0.0.300",
    "@types/node": "^22.0.0",
    "sharp": "^0.33.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["chrome", "node"]
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: r('./popup.html'),
        dashboard: r('./dashboard.html'),
        background: r('./src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    restoreMocks: true,
  },
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: { headless: false },
});
```

Create `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": { "ignore": ["dist", "node_modules"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "linter": { "enabled": true, "rules": { "recommended": true } }
}
```

- [ ] **Step 4: 创建 manifest、入口与最小 UI**

Create `public/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Tab Dormancy",
  "version": "0.1.0",
  "description": "在系统空闲时按规则关闭标签页，并保留可恢复的关闭历史。",
  "minimum_chrome_version": "121",
  "permissions": ["tabs", "storage", "idle", "alarms", "tabGroups", "sessions"],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup.html", "default_title": "Tab Dormancy" },
  "options_ui": { "page": "dashboard.html", "open_in_tab": true },
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

Create `popup.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tab Dormancy</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/ui/popup/main.tsx"></script>
  </body>
</html>
```

Create `dashboard.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tab Dormancy · 控制台</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/ui/dashboard/main.tsx"></script>
  </body>
</html>
```

Create `src/background/index.ts`:

```ts
export {};
```

Create `src/ui/popup/main.tsx`:

```tsx
import { render } from 'preact';
import { Popup } from './Popup';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/popup.css';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app element');
render(<Popup />, root);
```

Create `src/ui/popup/Popup.tsx`:

```tsx
export function Popup() {
  return (
    <main class="popup">
      <h1>Tab Dormancy</h1>
      <p class="muted">正在加载…</p>
    </main>
  );
}
```

Create `src/ui/dashboard/main.tsx`:

```tsx
import { render } from 'preact';
import { Dashboard } from './Dashboard';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/dashboard.css';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app element');
render(<Dashboard />, root);
```

Create `src/ui/dashboard/Dashboard.tsx`:

```tsx
export function Dashboard() {
  return (
    <main class="dashboard">
      <h1>Tab Dormancy</h1>
      <p class="muted">正在加载…</p>
    </main>
  );
}
```

Create `src/ui/styles/tokens.css`:

```css
:root {
  color-scheme: light dark;
  --bg: #fafafa;
  --surface: #ffffff;
  --surface-2: #f4f4f5;
  --border: #e4e4e7;
  --text: #18181b;
  --muted: #71717a;
  --accent: #3d63dd;
  --accent-strong: #2f4fb8;
  --danger: #c2413a;
  --success: #267a4b;
  --radius: 10px;
  --shadow: 0 1px 2px rgb(0 0 0 / 5%);
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111113;
    --surface: #18181b;
    --surface-2: #202024;
    --border: #2d2d33;
    --text: #f4f4f5;
    --muted: #a1a1aa;
    --accent: #8aa4ff;
    --accent-strong: #a9bcff;
    --danger: #f08b84;
    --success: #79d3a2;
    --shadow: none;
  }
}
```

Create `src/ui/styles/base.css`:

```css
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.5;
}

button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.muted {
  color: var(--muted);
}
```

Create `src/ui/styles/popup.css`:

```css
.popup {
  width: 360px;
  min-height: 240px;
  padding: 18px;
  background: var(--surface);
}
```

Create `src/ui/styles/dashboard.css`:

```css
.dashboard {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 20px;
}
```

- [ ] **Step 5: 创建图标与构建检查脚本**

Create `scripts/generate-icons.mjs`:

```js
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#18181b"/>
  <rect x="28" y="34" width="72" height="18" rx="9" fill="#fafafa"/>
  <rect x="28" y="62" width="44" height="32" rx="9" fill="#3d63dd"/>
</svg>`;

await mkdir('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/${size}.png`);
}
```

Create `scripts/check-build.mjs`:

```js
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const required = ['dist/manifest.json', 'dist/popup.html', 'dist/dashboard.html', 'dist/background.js'];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`missing build artifact: ${file}`);
}

const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('manifest is not MV3');

const assets = existsSync('dist/assets') ? readdirSync('dist/assets') : [];
const jsFiles = [
  ...required.filter((file) => file.endsWith('.js')),
  ...assets.filter((file) => file.endsWith('.js')).map((file) => `dist/assets/${file}`),
];
const jsBytes = jsFiles.reduce((sum, file) => sum + statSync(file).size, 0);
if (jsBytes > 200_000) throw new Error(`JavaScript bundle too large: ${jsBytes} bytes`);
console.log(`build ok (${jsBytes} bytes js)`);
```

- [ ] **Step 6: 安装依赖并生成图标**

Run: `npm install && npm run icons`

Expected: 安装成功，`public/icons/16.png` 等文件存在。

- [ ] **Step 7: 运行测试、类型检查与构建**

Run: `npm test`

Expected: PASS，manifest 测试通过。

Run: `npm run typecheck`

Expected: PASS。

Run: `npm run build`

Expected: PASS，`dist/` 含 `manifest.json`、`popup.html`、`dashboard.html`、`background.js`。

- [ ] **Step 8: 提交**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts biome.json popup.html dashboard.html public src/background src/ui scripts tests/unit/manifest.test.ts
git commit -m "chore: scaffold extension build and test harness"
```

---

### Task 2: 共享类型、常量、错误与 URL/时间工具

**Files:**
- Create: `src/shared/types.ts`、`src/shared/constants.ts`、`src/shared/errors.ts`
- Create: `src/shared/url.ts`、`src/shared/time.ts`、`src/shared/async.ts`
- Test: `tests/unit/url.test.ts`、`tests/unit/time.test.ts`、`tests/unit/async.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: 所有跨层类型 `Settings`、`SettingsPatch`、`Strategy`、`Expr`、`FactKey`、`Operator`、`FactValue`、`TabFacts`、`Capabilities`、`ClosedTabSummary`、`ClosedTabRecord`、`LastCleanup`、`CleanupPlan`、`CleanupResult`、`CleanupPreview`、`StateSnapshot`、`HistoryQuery`、`RestoreOptions`、`RestoreResult`、`CleanupRun`、`TraceNode`、`Evaluation`、`PlannedTab`、`TabListItem`；工具 `domainOf`、`isManageableUrl`、`domainMatches`、`globMatches`、`normalizeDomain`、`formatRelativeTime`、`runWithConcurrency`。

- [ ] **Step 1: 写 URL 与时间工具测试**

Create `tests/unit/url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { domainMatches, domainOf, globMatches, isManageableUrl, normalizeDomain } from '../../src/shared/url';

describe('url helpers', () => {
  it('extracts hostnames and rejects non-http schemes for domain rules', () => {
    expect(domainOf('https://mail.google.com/mail/u/0')).toBe('mail.google.com');
    expect(domainOf('file:///tmp/a.html')).toBe('');
    expect(domainOf('not a url')).toBe('');
  });

  it('only manages http, https and file urls', () => {
    expect(isManageableUrl('https://example.com')).toBe(true);
    expect(isManageableUrl('http://example.com')).toBe(true);
    expect(isManageableUrl('file:///tmp/a.html')).toBe(true);
    expect(isManageableUrl('chrome://settings')).toBe(false);
    expect(isManageableUrl('devtools://devtools/bundled/inspector.html')).toBe(false);
    expect(isManageableUrl('about:blank')).toBe(false);
  });

  it('matches a domain and its subdomains but not lookalikes', () => {
    expect(domainMatches('mail.google.com', 'google.com')).toBe(true);
    expect(domainMatches('google.com', 'google.com')).toBe(true);
    expect(domainMatches('evilgoogle.com', 'google.com')).toBe(false);
    expect(domainMatches('google.com.evil.test', 'google.com')).toBe(false);
  });

  it('normalizes domain list entries', () => {
    expect(normalizeDomain(' HTTPS://Mail.Google.com/path ')).toBe('mail.google.com');
    expect(normalizeDomain('*.google.com')).toBe('google.com');
    expect(normalizeDomain('not a domain')).toBeNull();
  });

  it('matches globs with only * and ? meta characters', () => {
    expect(globMatches('https://a.com/x?y=1', '*://a.com/*')).toBe(true);
    expect(globMatches('https://a.com/x', 'https://?.com/*')).toBe(true);
    expect(globMatches('https://a.com/x', 'https://b.com/*')).toBe(false);
    expect(globMatches('a.b', 'a.b')).toBe(true);
  });
});
```

Create `tests/unit/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from '../../src/shared/time';

const now = new Date('2026-10-22T12:00:00Z').getTime();

describe('formatRelativeTime', () => {
  it('formats recent timestamps in Chinese', () => {
    expect(formatRelativeTime(now, now - 10_000)).toBe('刚刚');
    expect(formatRelativeTime(now, now - 5 * 60_000)).toBe('5 分钟前');
    expect(formatRelativeTime(now, now - 3 * 60 * 60_000)).toBe('3 小时前');
    expect(formatRelativeTime(now, now - 2 * 24 * 60 * 60_000)).toBe('2 天前');
  });

  it('falls back to a date after 30 days', () => {
    expect(formatRelativeTime(now, new Date('2026-09-01T00:00:00Z').getTime())).toBe('2026-09-01');
  });
});
```

Create `tests/unit/async.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runWithConcurrency } from '../../src/shared/async';

describe('runWithConcurrency', () => {
  it('processes every item and respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      seen.push(value);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/url.test.ts tests/unit/time.test.ts tests/unit/async.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 创建共享类型**

Create `src/shared/types.ts`:

```ts
export type Trigger = 'idle' | 'locked' | 'manual';

export type FactKey =
  | 'lastActiveMinutes'
  | 'totalTabCount'
  | 'windowTabCount'
  | 'pinned'
  | 'audible'
  | 'active'
  | 'muted'
  | 'discarded'
  | 'frozen'
  | 'grouped'
  | 'groupCollapsed'
  | 'windowFocused'
  | 'onlyTabInWindow'
  | 'domain'
  | 'url'
  | 'title'
  | 'groupTitle';

export type Operator =
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'is'
  | 'equals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'matchesDomain'
  | 'inDomainList'
  | 'matchesGlob';

export type FactValue = string | number | boolean | string[];

export type Expr =
  | { type: 'all'; id: string; children: Expr[] }
  | { type: 'any'; id: string; children: Expr[] }
  | { type: 'not'; id: string; child: Expr }
  | { type: 'condition'; id: string; fact: FactKey; op: Operator; value?: FactValue };

export type Strategy = {
  id: string;
  name: string;
  builtin: boolean;
  expression: Expr;
  createdAt: number;
  updatedAt: number;
  lastPreviewHash: string | null;
  lastPreviewAt: number | null;
};

export type Settings = {
  idleThresholdMinutes: number;
  lockCleanupEnabled: boolean;
  lockDelayMinutes: number;
  historyRetentionDays: number;
  activeStrategyId: string;
};

export type SettingsPatch = Partial<Omit<Settings, 'activeStrategyId'>>;

export type TabFacts = {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  domain: string;
  lastActiveMinutes: number | null;
  totalTabCount: number;
  windowTabCount: number;
  pinned: boolean;
  audible: boolean;
  active: boolean;
  muted: boolean;
  discarded: boolean;
  frozen: boolean;
  grouped: boolean;
  groupCollapsed: boolean;
  windowFocused: boolean;
  onlyTabInWindow: boolean;
  groupTitle: string;
};

export type Capabilities = {
  chromeMajor: number | null;
  lastAccessed: boolean;
  frozen: boolean;
  tabGroups: boolean;
  sessions: boolean;
};

export type ClosedTabSummary = {
  id: string;
  url: string;
  title: string;
  domain: string;
  closedAt: number;
  trigger: Trigger;
  status: 'pending' | 'closed';
  restoredAt: number | null;
};

export type ClosedTabRecord = ClosedTabSummary & {
  strategyId: string;
  strategyName: string;
  browserSessionId: string;
  windowId: number;
  groupId: number;
  groupTitle: string;
  groupColor: string;
  groupCollapsed: boolean;
  pinned: boolean;
  index: number;
  sessionId: string | null;
  recovered: boolean;
};

export type LastCleanup = {
  at: number;
  trigger: Trigger;
  closed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  recordIds: string[];
};

export type TraceNode = {
  nodeId: string;
  type: Expr['type'];
  result: boolean;
  fact?: FactKey;
  actual?: FactValue | null;
  expected?: FactValue;
  reason?: 'matched' | 'not-matched' | 'unknown' | 'unsupported';
};

export type Evaluation = {
  matched: boolean;
  trace: TraceNode[];
};

export type PlannedTab = {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  domain: string;
  groupId: number;
  groupTitle: string;
  groupColor: string;
  groupCollapsed: boolean;
  pinned: boolean;
  index: number;
  sessionId: string | null;
  facts: TabFacts;
  trace: TraceNode[];
};

export type CleanupPlan = {
  matched: PlannedTab[];
  kept: PlannedTab[];
  totalManagedTabs: number;
};

export type CleanupResult = {
  runId: string;
  trigger: Trigger;
  closed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  recordIds: string[];
  failures: Array<{ tabId: number; title: string; reason: string }>;
};

export type TabListItem = {
  tab: chrome.tabs.Tab;
  facts: TabFacts;
  matched: boolean;
  trace: TraceNode[];
};

export type HistoryQuery = {
  query?: string;
  trigger?: Trigger;
  restored?: boolean;
  page: number;
  pageSize: number;
};

export type HistoryQueryResult = {
  items: ClosedTabSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type RestoreOptions = {
  mode: 'current-window' | 'original-window-groups';
  complete: boolean;
};

export type RestoreResult = {
  restored: number;
  failed: Array<{ id: string; url: string; reason: string }>;
};

export type CleanupPreview = {
  matched: number;
  sample: Array<{ tabId: number; title: string; url: string; trace: TraceNode[] }>;
  totalManagedTabs: number;
  strategyName: string;
};

export type StateSnapshot = {
  settings: Settings;
  strategies: Strategy[];
  activeStrategy: Strategy;
  lastCleanup: LastCleanup | null;
  capabilities: Capabilities;
  warnings: string[];
};

export type CleanupLock = {
  runId: string;
  startedAt: number;
};

export type CleanupRun = {
  id: string;
  startedAt: number;
  trigger: Trigger;
  strategyId: string;
  browserSessionId: string;
  drafts: ClosedTabRecord[];
};

export type Meta = {
  schemaVersion: number;
  installedAt?: number;
};
```

- [ ] **Step 4: 创建常量与错误类型**

Create `src/shared/constants.ts`:

```ts
import type { Settings } from './types';

export const SCHEMA_VERSION = 1;

export const ALARM_LOCKED = 'tab-dormancy:locked';

export const TAB_GROUP_ID_NONE = -1;

export const STORAGE_KEYS = {
  meta: 'meta',
  settings: 'settings',
  strategies: 'strategies',
  historyIndex: 'history:index',
  cleanupLock: 'cleanup:lock',
  cleanupRun: 'cleanup:run',
  lastCleanup: 'lastCleanup',
  browserSessionId: 'browserSessionId',
  historyItemPrefix: 'history:item:',
  chaosPrefix: 'corrupt:',
} as const;

export const DEFAULT_SETTINGS: Settings = {
  idleThresholdMinutes: 15,
  lockCleanupEnabled: true,
  lockDelayMinutes: 15,
  historyRetentionDays: 30,
  activeStrategyId: 'preset:standard',
};

export const LIMITS = {
  maxDepth: 8,
  maxNodes: 200,
  maxChildren: 20,
  maxStringLength: 512,
  maxDomainList: 50,
  maxNumber: 525_600,
  maxHistory: 5_000,
  historyPageSize: 50,
  cleanupConcurrency: 4,
  lockStaleMs: 120_000,
  pendingRunStaleMs: 300_000,
  strategyNameLength: 80,
} as const;
```

Create `src/shared/errors.ts`:

```ts
export type ErrorCode =
  | 'INVALID_EXPRESSION'
  | 'INVALID_SETTINGS'
  | 'UNSUPPORTED_FACT'
  | 'BUSY'
  | 'STORAGE_FAILED'
  | 'NOT_FOUND'
  | 'TAB_CHANGED'
  | 'PREVIEW_REQUIRED'
  | 'FORBIDDEN'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

- [ ] **Step 5: 实现 URL、时间与并发工具**

Create `src/shared/url.ts`:

```ts
const MANAGED_SCHEMES = new Set(['http:', 'https:', 'file:']);

export function isManageableUrl(raw: string): boolean {
  try {
    return MANAGED_SCHEMES.has(new URL(raw).protocol);
  } catch {
    return false;
  }
}

export function domainOf(raw: string): string {
  try {
    const url = new URL(raw);
    return url.protocol === 'file:' ? '' : url.hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutWildcard = trimmed.replace(/^\*\./, '');
  try {
    const url = new URL(withoutWildcard.includes('://') ? withoutWildcard : `https://${withoutWildcard}`);
    return url.hostname || null;
  } catch {
    return null;
  }
}

export function domainMatches(domain: string, pattern: string): boolean {
  const normalized = normalizeDomain(pattern);
  if (!normalized) return false;
  const value = domain.trim().toLowerCase();
  return value === normalized || value.endsWith(`.${normalized}`);
}

export function globMatches(value: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}
```

Create `src/shared/time.ts`:

```ts
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(now: number, then: number): string {
  const diff = Math.max(0, now - then);
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  const date = new Date(then);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
```

Create `src/shared/async.ts`:

```ts
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await task(item);
    }
  });
  await Promise.all(workers);
}
```

- [ ] **Step 6: 运行测试**

Run: `npx vitest run tests/unit/url.test.ts tests/unit/time.test.ts tests/unit/async.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/shared tests/unit/url.test.ts tests/unit/time.test.ts tests/unit/async.test.ts
git commit -m "feat: add shared domain types and url/time utilities"
```
### Task 3: 规则注册表、校验、预设与签名

**Files:**
- Create: `src/core/rules/registry.ts`、`validate.ts`、`presets.ts`、`signature.ts`
- Create: `src/core/strategies.ts`
- Test: `tests/unit/rules-validate.test.ts`、`tests/unit/rules-signature.test.ts`、`tests/unit/presets.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `Expr`、`FactKey`、`Operator`、`FactValue`、`Capabilities`、`Strategy`、`normalizeDomain`、`LIMITS`。
- Produces:
  - `FACT_DEFINITIONS: FactDefinition[]`、`FACT_BY_KEY: Map<FactKey, FactDefinition>`、`factDefinition(key)`、`isFactAvailable(def, caps)`
  - `validateExpr(expr, caps?): ValidationResult`、`validateStrategy(strategy, caps?): ValidationResult`
  - `signatureOf(expr): Promise<string>`、`canonicalExpr(expr): string`
  - `createPresetStrategies(now): Strategy[]`、`cloneStrategy(source, now, id): Strategy`、`createCustomStrategy(name, expression, now, id): Strategy`
  - `unsupportedFacts(expr, caps): FactKey[]`、`strategyUsable(strategy, caps): boolean`、`findStrategy`、`requireStrategy`

- [ ] **Step 1: 写校验与签名测试**

Create `tests/unit/rules-validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Expr, FactKey, FactValue, Operator } from '../../src/shared/types';
import { validateExpr, validateStrategy } from '../../src/core/rules/validate';

const condition = (id: string, fact: FactKey, op: Operator, value?: FactValue): Expr => ({
  type: 'condition',
  id,
  fact,
  op,
  value,
});

describe('validateExpr', () => {
  it('rejects empty groups', () => {
    const expr: Expr = { type: 'all', id: 'root', children: [] };
    expect(validateExpr(expr).valid).toBe(false);
    expect(validateExpr(expr).issues[0]?.code).toBe('EMPTY_GROUP');
  });

  it('rejects duplicate node ids', () => {
    const expr: Expr = {
      type: 'all',
      id: 'root',
      children: [condition('same', 'pinned', 'is', true), condition('same', 'audible', 'is', true)],
    };
    expect(validateExpr(expr).issues.some((issue) => issue.code === 'DUPLICATE_ID')).toBe(true);
  });

  it('rejects expressions deeper than 8', () => {
    let expr: Expr = condition('leaf', 'pinned', 'is', true);
    for (let i = 0; i < 9; i += 1) expr = { type: 'not', id: `n${i}`, child: expr };
    expect(validateExpr(expr).issues.some((issue) => issue.code === 'TOO_DEEP')).toBe(true);
  });

  it('rejects unknown facts, bad operators and bad values', () => {
    expect(validateExpr(condition('a', 'nope', 'is', true)).issues[0]?.code).toBe('UNKNOWN_FACT');
    expect(validateExpr(condition('a', 'pinned', 'gt', 1)).issues[0]?.code).toBe('BAD_OPERATOR');
    expect(validateExpr(condition('a', 'lastActiveMinutes', 'gt', '60')).issues[0]?.code).toBe('BAD_VALUE');
    expect(validateExpr(condition('a', 'domain', 'inDomainList', [])).issues[0]?.code).toBe('BAD_VALUE');
  });

  it('disables facts that the browser cannot provide', () => {
    const caps = { chromeMajor: 121, lastAccessed: false, frozen: false, tabGroups: false, sessions: true };
    const result = validateExpr(condition('a', 'lastActiveMinutes', 'gt', 60), caps);
    expect(result.issues.some((issue) => issue.code === 'FACT_UNAVAILABLE')).toBe(true);
  });

  it('validates strategy names', () => {
    const result = validateStrategy({ name: '  ', expression: condition('a', 'pinned', 'is', true) });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'BAD_NAME')).toBe(true);
  });
});
```

Create `tests/unit/rules-signature.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Expr } from '../../src/shared/types';
import { canonicalExpr, signatureOf } from '../../src/core/rules/signature';

const exprA: Expr = {
  type: 'all',
  id: 'a',
  children: [
    { type: 'condition', id: 'b', fact: 'lastActiveMinutes', op: 'gt', value: 60 },
    { type: 'condition', id: 'c', fact: 'pinned', op: 'is', value: false },
  ],
};

const exprB: Expr = {
  type: 'all',
  id: 'x',
  children: [
    { type: 'condition', id: 'y', fact: 'lastActiveMinutes', op: 'gt', value: 60 },
    { type: 'condition', id: 'z', fact: 'pinned', op: 'is', value: false },
  ],
};

describe('rule signature', () => {
  it('ignores node ids', async () => {
    expect(await signatureOf(exprA)).toBe(await signatureOf(exprB));
    expect(canonicalExpr(exprA)).not.toContain('"id"');
  });

  it('changes when semantics change', async () => {
    const changed: Expr = { ...exprA, children: [exprA.children[0]!, { type: 'condition', id: 'c', fact: 'pinned', op: 'is', value: true }] };
    expect(await signatureOf(exprA)).not.toBe(await signatureOf(changed));
  });
});
```

Create `tests/unit/presets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cloneStrategy, createPresetStrategies } from '../../src/core/rules/presets';
import { signatureOf } from '../../src/core/rules/signature';

describe('presets', () => {
  it('creates the three built-in strategies', () => {
    const presets = createPresetStrategies(1_000);
    expect(presets.map((preset) => preset.name)).toEqual(['温和', '标准', '激进']);
    expect(presets.every((preset) => preset.builtin)).toBe(true);
    expect(presets.find((preset) => preset.id === 'preset:standard')?.id).toBe('preset:standard');
  });

  it('clones a preset with fresh ids and the same semantics', async () => {
    const source = createPresetStrategies(1_000)[1]!;
    const clone = cloneStrategy(source, 2_000, 'custom:1');
    expect(clone.builtin).toBe(false);
    expect(clone.id).toBe('custom:1');
    expect(clone.name).toBe('标准 副本');
    expect(await signatureOf(clone.expression)).toBe(await signatureOf(source.expression));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/rules-validate.test.ts tests/unit/rules-signature.test.ts tests/unit/presets.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 创建事实注册表**

Create `src/core/rules/registry.ts`:

```ts
import type { Capabilities, FactKey, Operator } from '../../shared/types';

export type FactType = 'number' | 'boolean' | 'string' | 'domain' | 'url' | 'title' | 'groupTitle';
export type CapabilityKey = 'lastAccessed' | 'frozen' | 'tabGroups';

export type FactDefinition = {
  key: FactKey;
  label: string;
  type: FactType;
  operators: Operator[];
  requires?: CapabilityKey;
  description: string;
};

const numeric: Operator[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
const text: Operator[] = ['equals', 'contains', 'startsWith', 'endsWith'];
const textOrGlob: Operator[] = [...text, 'matchesGlob'];
const domainOps: Operator[] = [...textOrGlob, 'matchesDomain', 'inDomainList'];

export const FACT_DEFINITIONS: FactDefinition[] = [
  {
    key: 'lastActiveMinutes',
    label: '距最后访问',
    type: 'number',
    operators: numeric,
    requires: 'lastAccessed',
    description: '标签最后一次被访问到现在的分钟数；无法获取时不命中。',
  },
  { key: 'totalTabCount', label: '总标签数', type: 'number', operators: numeric, description: '所有普通窗口中可管理标签的总数。' },
  { key: 'windowTabCount', label: '窗口标签数', type: 'number', operators: numeric, description: '同一窗口内可管理标签的数量。' },
  { key: 'pinned', label: '已固定', type: 'boolean', operators: ['is'], description: '标签是否被固定。' },
  { key: 'audible', label: '正在播放声音', type: 'boolean', operators: ['is'], description: '标签是否正在播放声音。' },
  { key: 'active', label: '当前激活', type: 'boolean', operators: ['is'], description: '标签是否是其窗口的当前标签。' },
  { key: 'muted', label: '已静音', type: 'boolean', operators: ['is'], description: '标签是否被静音。' },
  { key: 'discarded', label: '已丢弃', type: 'boolean', operators: ['is'], description: '标签是否已被浏览器丢弃。' },
  {
    key: 'frozen',
    label: '已冻结',
    type: 'boolean',
    operators: ['is'],
    requires: 'frozen',
    description: '标签是否被 Chrome 冻结（需 Chrome 132+）。',
  },
  {
    key: 'grouped',
    label: '在标签组中',
    type: 'boolean',
    operators: ['is'],
    requires: 'tabGroups',
    description: '标签是否属于标签组。',
  },
  {
    key: 'groupCollapsed',
    label: '标签组已折叠',
    type: 'boolean',
    operators: ['is'],
    requires: 'tabGroups',
    description: '标签所在的标签组是否折叠。',
  },
  { key: 'windowFocused', label: '窗口有焦点', type: 'boolean', operators: ['is'], description: '标签所在窗口是否获得焦点。' },
  { key: 'onlyTabInWindow', label: '窗口唯一标签', type: 'boolean', operators: ['is'], description: '该标签是否是窗口内唯一可管理标签。' },
  { key: 'domain', label: '域名', type: 'domain', operators: domainOps, description: 'URL 的主机名，例如 mail.google.com。' },
  { key: 'url', label: 'URL', type: 'url', operators: textOrGlob, description: '完整 URL。' },
  { key: 'title', label: '标题', type: 'title', operators: textOrGlob, description: '标签标题。' },
  {
    key: 'groupTitle',
    label: '标签组名称',
    type: 'groupTitle',
    operators: textOrGlob,
    requires: 'tabGroups',
    description: '标签所在组的名称；未分组时为空字符串。',
  },
];

export const FACT_BY_KEY = new Map<FactKey, FactDefinition>(FACT_DEFINITIONS.map((definition) => [definition.key, definition]));

export function factDefinition(key: FactKey): FactDefinition {
  const definition = FACT_BY_KEY.get(key);
  if (!definition) throw new Error(`unknown fact: ${key}`);
  return definition;
}

export function isFactAvailable(definition: FactDefinition, caps: Capabilities): boolean {
  switch (definition.requires) {
    case 'lastAccessed':
      return caps.lastAccessed;
    case 'frozen':
      return caps.frozen;
    case 'tabGroups':
      return caps.tabGroups;
    default:
      return true;
  }
}

export function factType(key: FactKey): FactType {
  return factDefinition(key).type;
}
```

- [ ] **Step 4: 实现表达式校验**

Create `src/core/rules/validate.ts`:

```ts
import { LIMITS } from '../../shared/constants';
import type { Capabilities, Expr, Operator, Strategy } from '../../shared/types';
import { normalizeDomain } from '../../shared/url';
import { FACT_BY_KEY, isFactAvailable, type FactDefinition } from './registry';

export type ValidationIssue = {
  nodeId?: string;
  code:
    | 'BAD_ID'
    | 'DUPLICATE_ID'
    | 'EMPTY_GROUP'
    | 'TOO_DEEP'
    | 'TOO_MANY_NODES'
    | 'TOO_MANY_CHILDREN'
    | 'UNKNOWN_FACT'
    | 'FACT_UNAVAILABLE'
    | 'BAD_OPERATOR'
    | 'BAD_VALUE'
    | 'BAD_NAME';
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
  nodeCount: number;
  depth: number;
};

export function validateExpr(expr: Expr, caps?: Capabilities): ValidationResult {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  let nodeCount = 0;
  let depth = 0;

  const visit = (node: Expr, level: number): void => {
    nodeCount += 1;
    depth = Math.max(depth, level);

    if (!node.id) {
      issues.push({ code: 'BAD_ID', message: '节点缺少 ID' });
    } else if (seen.has(node.id)) {
      issues.push({ nodeId: node.id, code: 'DUPLICATE_ID', message: `节点 ID 重复：${node.id}` });
    } else {
      seen.add(node.id);
    }

    if (level > LIMITS.maxDepth) {
      issues.push({ nodeId: node.id, code: 'TOO_DEEP', message: `表达式深度不能超过 ${LIMITS.maxDepth}` });
    }

    switch (node.type) {
      case 'all':
      case 'any': {
        if (node.children.length === 0) {
          issues.push({ nodeId: node.id, code: 'EMPTY_GROUP', message: '规则组至少需要一个子条件' });
        }
        if (node.children.length > LIMITS.maxChildren) {
          issues.push({
            nodeId: node.id,
            code: 'TOO_MANY_CHILDREN',
            message: `每组最多 ${LIMITS.maxChildren} 个直接子条件`,
          });
        }
        for (const child of node.children) visit(child, level + 1);
        break;
      }
      case 'not':
        visit(node.child, level + 1);
        break;
      case 'condition': {
        const definition = FACT_BY_KEY.get(node.fact);
        if (!definition) {
          issues.push({ nodeId: node.id, code: 'UNKNOWN_FACT', message: `未知事实：${node.fact}` });
          break;
        }
        if (!definition.operators.includes(node.op)) {
          issues.push({ nodeId: node.id, code: 'BAD_OPERATOR', message: `事实 ${node.fact} 不支持操作符 ${node.op}` });
          break;
        }
        if (caps && !isFactAvailable(definition, caps)) {
          issues.push({ nodeId: node.id, code: 'FACT_UNAVAILABLE', message: `当前浏览器不支持事实：${definition.label}` });
        }
        validateValue(node.value, node.op, definition, issues);
        break;
      }
    }
  };

  visit(expr, 0);

  if (nodeCount > LIMITS.maxNodes) {
    issues.push({ code: 'TOO_MANY_NODES', message: `表达式节点不能超过 ${LIMITS.maxNodes}` });
  }

  return { valid: issues.length === 0, issues, nodeCount, depth };
}

function validateValue(value: unknown, op: Operator, definition: FactDefinition, issues: ValidationIssue[]): void {
  if (definition.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > LIMITS.maxNumber) {
      issues.push({ code: 'BAD_VALUE', message: `数字必须是 0–${LIMITS.maxNumber} 之间的有限值` });
    }
    return;
  }

  if (definition.type === 'boolean') {
    if (typeof value !== 'boolean') issues.push({ code: 'BAD_VALUE', message: '布尔条件必须使用 true 或 false' });
    return;
  }

  if (op === 'inDomainList') {
    if (!Array.isArray(value) || value.length === 0 || value.length > LIMITS.maxDomainList) {
      issues.push({ code: 'BAD_VALUE', message: `域名列表必须包含 1–${LIMITS.maxDomainList} 项` });
      return;
    }
    if (
      value.some(
        (item) =>
          typeof item !== 'string' ||
          item.length > LIMITS.maxStringLength ||
          !normalizeDomain(item),
      )
    ) {
      issues.push({ code: 'BAD_VALUE', message: '域名列表包含无效域名' });
    }
    return;
  }

  if (typeof value !== 'string' || value.length > LIMITS.maxStringLength) {
    issues.push({ code: 'BAD_VALUE', message: `文本长度不能超过 ${LIMITS.maxStringLength}` });
  }
}

export function validateStrategy(
  strategy: Pick<Strategy, 'name' | 'expression'>,
  caps?: Capabilities,
): ValidationResult {
  const result = validateExpr(strategy.expression, caps);
  const name = strategy.name.trim();
  if (name.length < 1 || name.length > LIMITS.strategyNameLength) {
    result.issues.push({
      code: 'BAD_NAME',
      message: `策略名称需为 1–${LIMITS.strategyNameLength} 个字符`,
    });
  }
  return { ...result, valid: result.issues.length === 0 };
}
```

- [ ] **Step 5: 实现签名、预设与策略工具**

Create `src/core/rules/signature.ts`:

```ts
import type { Expr } from '../../shared/types';

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) output[key] = sortKeys(input[key]);
    return output;
  }
  return value;
}

function stripIds(node: Expr): unknown {
  switch (node.type) {
    case 'all':
    case 'any':
      return { type: node.type, children: node.children.map(stripIds) };
    case 'not':
      return { type: 'not', child: stripIds(node.child) };
    case 'condition':
      return { type: 'condition', fact: node.fact, op: node.op, value: node.value ?? null };
  }
}

export function canonicalExpr(expr: Expr): string {
  return JSON.stringify(sortKeys(stripIds(expr)));
}

export async function signatureOf(expr: Expr): Promise<string> {
  const data = new TextEncoder().encode(canonicalExpr(expr));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

Create `src/core/rules/presets.ts`:

```ts
import type { Expr, FactKey, FactValue, Operator, Strategy } from '../../shared/types';

const condition = (id: string, fact: FactKey, op: Operator, value?: FactValue): Expr => ({
  type: 'condition',
  id,
  fact,
  op,
  value,
});
const not = (id: string, child: Expr): Expr => ({ type: 'not', id, child });
const all = (id: string, children: Expr[]): Expr => ({ type: 'all', id, children });

export function createPresetStrategies(now: number): Strategy[] {
  return [
    {
      id: 'preset:mild',
      name: '温和',
      builtin: true,
      expression: all('preset:mild:root', [
        condition('preset:mild:time', 'lastActiveMinutes', 'gt', 10_080),
        not('preset:mild:active', condition('preset:mild:active:cond', 'active', 'is', true)),
      ]),
      createdAt: now,
      updatedAt: now,
      lastPreviewHash: null,
      lastPreviewAt: null,
    },
    {
      id: 'preset:standard',
      name: '标准',
      builtin: true,
      expression: all('preset:standard:root', [
        condition('preset:standard:time', 'lastActiveMinutes', 'gt', 4_320),
        not('preset:standard:pinned', condition('preset:standard:pinned:cond', 'pinned', 'is', true)),
        not('preset:standard:audible', condition('preset:standard:audible:cond', 'audible', 'is', true)),
        not('preset:standard:grouped', condition('preset:standard:grouped:cond', 'grouped', 'is', true)),
      ]),
      createdAt: now,
      updatedAt: now,
      lastPreviewHash: null,
      lastPreviewAt: null,
    },
    {
      id: 'preset:aggressive',
      name: '激进',
      builtin: true,
      expression: all('preset:aggressive:root', [
        condition('preset:aggressive:time', 'lastActiveMinutes', 'gt', 1_440),
        not('preset:aggressive:active', condition('preset:aggressive:active:cond', 'active', 'is', true)),
        not('preset:aggressive:pinned', condition('preset:aggressive:pinned:cond', 'pinned', 'is', true)),
      ]),
      createdAt: now,
      updatedAt: now,
      lastPreviewHash: null,
      lastPreviewAt: null,
    },
  ];
}

export function regenerateNodeIds(expr: Expr, nextId: () => string): Expr {
  switch (expr.type) {
    case 'condition':
      return { ...expr, id: nextId() };
    case 'not':
      return { ...expr, id: nextId(), child: regenerateNodeIds(expr.child, nextId) };
    case 'all':
    case 'any':
      return { ...expr, id: nextId(), children: expr.children.map((child) => regenerateNodeIds(child, nextId)) };
  }
}

export function cloneStrategy(source: Strategy, now: number, id: string): Strategy {
  return {
    id,
    name: `${source.name} 副本`.slice(0, 80),
    builtin: false,
    expression: regenerateNodeIds(source.expression, () => `node:${Math.random().toString(36).slice(2)}`),
    createdAt: now,
    updatedAt: now,
    lastPreviewHash: null,
    lastPreviewAt: null,
  };
}

export function createCustomStrategy(name: string, expression: Expr, now: number, id: string): Strategy {
  return {
    id,
    name: name.trim(),
    builtin: false,
    expression,
    createdAt: now,
    updatedAt: now,
    lastPreviewHash: null,
    lastPreviewAt: null,
  };
}
```

Create `src/core/strategies.ts`:

```ts
import type { Capabilities, Expr, FactKey, Strategy } from '../shared/types';
import { AppError } from '../shared/errors';
import { FACT_BY_KEY, isFactAvailable } from './rules/registry';

export function findStrategy(strategies: Strategy[], id: string): Strategy | undefined {
  return strategies.find((strategy) => strategy.id === id);
}

export function requireStrategy(strategies: Strategy[], id: string): Strategy {
  const strategy = findStrategy(strategies, id);
  if (!strategy) throw new AppError('NOT_FOUND', '策略不存在');
  return strategy;
}

export function unsupportedFacts(expr: Expr, caps: Capabilities): FactKey[] {
  const missing = new Set<FactKey>();
  const visit = (node: Expr): void => {
    if (node.type === 'condition') {
      const definition = FACT_BY_KEY.get(node.fact);
      if (definition && !isFactAvailable(definition, caps)) missing.add(node.fact);
      return;
    }
    if (node.type === 'not') {
      visit(node.child);
      return;
    }
    for (const child of node.children) visit(child);
  };
  visit(expr);
  return [...missing];
}

export function strategyUsable(strategy: Strategy, caps: Capabilities): boolean {
  return unsupportedFacts(strategy.expression, caps).length === 0;
}
```

- [ ] **Step 6: 运行测试与类型检查**

Run: `npx vitest run tests/unit/rules-validate.test.ts tests/unit/rules-signature.test.ts tests/unit/presets.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。若 `crypto.subtle` 在 Node 类型中报错，在 `tsconfig.json` 的 `lib` 已包含 DOM，应可用。

- [ ] **Step 7: 提交**

```bash
git add src/core tests/unit/rules-validate.test.ts tests/unit/rules-signature.test.ts tests/unit/presets.test.ts
git commit -m "feat: add rule registry validation presets and signatures"
```
### Task 4: 规则求值与可解释轨迹

**Files:**
- Create: `src/core/rules/evaluate.ts`
- Test: `tests/unit/rules-evaluate.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `FACT_BY_KEY`、`isFactAvailable`；Task 2 的 `domainMatches`、`globMatches`。
- Produces: `evaluateExpr(expr, facts, caps?): Evaluation`；`evaluateStrategy(strategy, facts, caps?): Evaluation`。

- [ ] **Step 1: 写求值测试**

Create `tests/unit/rules-evaluate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evaluateExpr } from '../../src/core/rules/evaluate';
import type { Capabilities, Expr, FactKey, FactValue, Operator, TabFacts } from '../../src/shared/types';

const caps: Capabilities = { chromeMajor: 132, lastAccessed: true, frozen: true, tabGroups: true, sessions: true };

const facts: TabFacts = {
  tabId: 1,
  windowId: 10,
  url: 'https://mail.google.com/mail/u/0',
  title: 'Inbox',
  domain: 'mail.google.com',
  lastActiveMinutes: 120,
  totalTabCount: 8,
  windowTabCount: 3,
  pinned: false,
  audible: false,
  active: false,
  muted: false,
  discarded: false,
  frozen: false,
  grouped: true,
  groupCollapsed: false,
  windowFocused: true,
  onlyTabInWindow: false,
  groupTitle: '工作',
};

const condition = (id: string, fact: FactKey, op: Operator, value?: FactValue): Expr => ({
  type: 'condition',
  id,
  fact,
  op,
  value,
});

const all = (id: string, children: Expr[]): Expr => ({ type: 'all', id, children });
const any = (id: string, children: Expr[]): Expr => ({ type: 'any', id, children });
const not = (id: string, child: Expr): Expr => ({ type: 'not', id, child });

describe('evaluateExpr', () => {
  it('evaluates nested groups', () => {
    const expr = all('root', [
      condition('time', 'lastActiveMinutes', 'gt', 60),
      any('or', [condition('pin', 'pinned', 'is', true), condition('group', 'groupCollapsed', 'is', false)]),
      not('not-audible', condition('audible', 'audible', 'is', true)),
    ]);
    expect(evaluateExpr(expr, facts, caps).matched).toBe(true);
  });

  it('treats unknown time as not matched', () => {
    const unknown = { ...facts, lastActiveMinutes: null };
    const result = evaluateExpr(condition('time', 'lastActiveMinutes', 'gt', 60), unknown, caps);
    expect(result.matched).toBe(false);
    expect(result.trace[0]?.reason).toBe('unknown');
  });

  it('does not match facts the browser cannot provide', () => {
    const limited = { ...caps, frozen: false };
    const result = evaluateExpr(condition('frozen', 'frozen', 'is', false), facts, limited);
    expect(result.matched).toBe(false);
    expect(result.trace[0]?.reason).toBe('unsupported');
  });

  it('compares text case-insensitively and supports domain/glob matching', () => {
    expect(evaluateExpr(condition('t', 'title', 'contains', 'inbox'), facts, caps).matched).toBe(true);
    expect(evaluateExpr(condition('d', 'domain', 'matchesDomain', 'google.com'), facts, caps).matched).toBe(true);
    expect(
      evaluateExpr(condition('l', 'domain', 'inDomainList', ['example.com', 'google.com']), facts, caps).matched,
    ).toBe(true);
    expect(evaluateExpr(condition('g', 'url', 'matchesGlob', '*://mail.google.com/*'), facts, caps).matched).toBe(true);
  });

  it('returns a flat trace for every node', () => {
    const expr = all('root', [
      condition('time', 'lastActiveMinutes', 'gt', 60),
      condition('pin', 'pinned', 'is', true),
    ]);
    const trace = evaluateExpr(expr, facts, caps).trace;
    expect(trace.map((node) => node.nodeId)).toEqual(['root', 'time', 'pin']);
    expect(trace.find((node) => node.nodeId === 'pin')?.result).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/rules-evaluate.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现求值器**

Create `src/core/rules/evaluate.ts`:

```ts
import type {
  Capabilities,
  Evaluation,
  Expr,
  FactValue,
  Operator,
  Strategy,
  TabFacts,
  TraceNode,
} from '../../shared/types';
import { domainMatches, globMatches } from '../../shared/url';
import { FACT_BY_KEY, isFactAvailable } from './registry';

export function evaluateExpr(expr: Expr, facts: TabFacts, caps?: Capabilities): Evaluation {
  const trace: TraceNode[] = [];

  const visit = (node: Expr): boolean => {
    if (node.type === 'condition') {
      return evaluateCondition(node, facts, caps, trace);
    }

    const entry: TraceNode = { nodeId: node.id, type: node.type, result: false, reason: 'not-matched' };
    trace.push(entry);

    if (node.type === 'not') {
      entry.result = !visit(node.child);
    } else {
      const results = node.children.map(visit);
      entry.result = node.type === 'all' ? results.every(Boolean) : results.some(Boolean);
    }
    entry.reason = entry.result ? 'matched' : 'not-matched';
    return entry.result;
  };

  return { matched: visit(expr), trace };
}

export function evaluateStrategy(strategy: Strategy, facts: TabFacts, caps?: Capabilities): Evaluation {
  return evaluateExpr(strategy.expression, facts, caps);
}

function evaluateCondition(
  node: Extract<Expr, { type: 'condition' }>,
  facts: TabFacts,
  caps: Capabilities | undefined,
  trace: TraceNode[],
): boolean {
  const definition = FACT_BY_KEY.get(node.fact);
  const entry: TraceNode = {
    nodeId: node.id,
    type: 'condition',
    result: false,
    fact: node.fact,
    expected: node.value,
    reason: 'not-matched',
  };
  trace.push(entry);

  if (!definition) {
    entry.reason = 'unsupported';
    return false;
  }

  if (caps && !isFactAvailable(definition, caps)) {
    entry.reason = 'unsupported';
    return false;
  }

  const actual = facts[node.fact] as FactValue | null | undefined;
  entry.actual = actual ?? null;

  if (actual === null || actual === undefined) {
    entry.reason = 'unknown';
    return false;
  }

  entry.result = compare(actual, node.op, node.value);
  entry.reason = entry.result ? 'matched' : 'not-matched';
  return entry.result;
}

function compare(actual: FactValue, op: Operator, expected: FactValue | undefined): boolean {
  if (op === 'is') {
    return typeof actual === 'boolean' && actual === expected;
  }

  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte' || op === 'eq' || op === 'neq') {
    if (typeof actual !== 'number' || typeof expected !== 'number') return false;
    switch (op) {
      case 'gt':
        return actual > expected;
      case 'gte':
        return actual >= expected;
      case 'lt':
        return actual < expected;
      case 'lte':
        return actual <= expected;
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
    }
  }

  if (typeof actual !== 'string') return false;

  if (op === 'inDomainList') {
    return Array.isArray(expected) && expected.some((pattern) => domainMatches(actual, pattern));
  }

  if (typeof expected !== 'string') return false;

  if (op === 'matchesDomain') return domainMatches(actual, expected);
  if (op === 'matchesGlob') return globMatches(actual, expected);

  const left = actual.toLowerCase();
  const right = expected.toLowerCase();
  switch (op) {
    case 'equals':
      return left === right;
    case 'contains':
      return left.includes(right);
    case 'startsWith':
      return left.startsWith(right);
    case 'endsWith':
      return left.endsWith(right);
    default:
      return false;
  }
}
```

- [ ] **Step 4: 运行测试与类型检查**

Run: `npx vitest run tests/unit/rules-evaluate.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/rules/evaluate.ts tests/unit/rules-evaluate.test.ts
git commit -m "feat: evaluate rule expressions with trace"
```

---

### Task 5: 能力检测与标签事实构建

**Files:**
- Create: `src/core/capabilities.ts`、`src/core/facts.ts`
- Test: `tests/unit/capabilities.test.ts`、`tests/unit/facts.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `Capabilities`、`TabFacts`、`isManageableUrl`、`domainOf`、`TAB_GROUP_ID_NONE`；Task 3 的 `unsupportedFacts`。
- Produces:
  - `detectCapabilities(input): Capabilities`
  - `buildFacts({ tabs, windows, groups, now }): Map<number, TabFacts>`
  - `managedTabs(input): chrome.tabs.Tab[]`（供 cleaner/UI 复用）

- [ ] **Step 1: 写能力与事实测试**

Create `tests/unit/capabilities.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectCapabilities } from '../../src/core/capabilities';
import { unsupportedFacts, strategyUsable } from '../../src/core/strategies';
import { createPresetStrategies } from '../../src/core/rules/presets';

const base = { hasTabGroups: true, hasSessions: true };

describe('detectCapabilities', () => {
  it('derives lastAccessed from Chrome 121 and frozen from Chrome 132', () => {
    const old = detectCapabilities({ ...base, userAgent: 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' });
    expect(old.lastAccessed).toBe(false);
    expect(old.frozen).toBe(false);

    const milestone = detectCapabilities({ ...base, userAgent: 'Mozilla/5.0 Chrome/132.0.0.0 Safari/537.36' });
    expect(milestone.lastAccessed).toBe(true);
    expect(milestone.frozen).toBe(true);
  });

  it('uses a real tab sample when provided', () => {
    const caps = detectCapabilities({
      ...base,
      userAgent: 'Mozilla/5.0 Chrome/140.0.0.0',
      sampleTab: { lastAccessed: undefined } as chrome.tabs.Tab,
    });
    expect(caps.lastAccessed).toBe(false);
  });

  it('reports facts unavailable from a strategy', () => {
    const caps = { chromeMajor: 121, lastAccessed: false, frozen: false, tabGroups: false, sessions: true };
    const standard = createPresetStrategies(0).find((strategy) => strategy.id === 'preset:standard')!;
    expect(unsupportedFacts(standard.expression, caps)).toContain('lastActiveMinutes');
    expect(strategyUsable(standard, caps)).toBe(false);
  });
});
```

Create `tests/unit/facts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildFacts, managedTabs } from '../../src/core/facts';

const now = 1_000_000_000;

const tab = (partial: Partial<chrome.tabs.Tab>): chrome.tabs.Tab =>
  ({
    id: 1,
    windowId: 1,
    index: 0,
    url: 'https://example.com/a',
    title: 'A',
    pinned: false,
    audible: false,
    active: false,
    mutedInfo: { muted: false },
    discarded: false,
    groupId: -1,
    ...partial,
  }) as chrome.tabs.Tab;

const window = (partial: Partial<chrome.windows.Window>): chrome.windows.Window =>
  ({ id: 1, type: 'normal', incognito: false, focused: true, ...partial }) as chrome.windows.Window;

describe('buildFacts', () => {
  it('builds counts, focus and group facts', () => {
    const tabs = [
      tab({ id: 1, active: true, lastAccessed: now - 5 * 60_000 }),
      tab({ id: 2, lastAccessed: now - 90 * 60_000 }),
      tab({ id: 3, groupId: 7 }),
    ];
    const groups = [{ id: 7, title: '工作', color: 'blue', collapsed: true, windowId: 1 } as chrome.tabGroups.TabGroup];
    const facts = buildFacts({ tabs, windows: [window({})], groups, now });

    expect(facts.size).toBe(3);
    expect(facts.get(1)?.lastActiveMinutes).toBe(5);
    expect(facts.get(1)?.onlyTabInWindow).toBe(false);
    expect(facts.get(3)?.grouped).toBe(true);
    expect(facts.get(3)?.groupTitle).toBe('工作');
    expect(facts.get(3)?.groupCollapsed).toBe(true);
    expect(facts.get(1)?.windowFocused).toBe(true);
  });

  it('treats missing, zero and future lastAccessed as unknown', () => {
    const facts = buildFacts({
      tabs: [tab({ id: 1 }), tab({ id: 2, lastAccessed: 0 }), tab({ id: 3, lastAccessed: now + 60_000 })],
      windows: [window({})],
      groups: [],
      now,
    });
    expect(facts.get(1)?.lastActiveMinutes).toBeNull();
    expect(facts.get(2)?.lastActiveMinutes).toBeNull();
    expect(facts.get(3)?.lastActiveMinutes).toBe(0);
  });

  it('ignores internal pages and incognito windows', () => {
    const tabs = [tab({ id: 1, url: 'chrome://settings' }), tab({ id: 2, windowId: 2 })];
    const windows = [window({ id: 1 }), window({ id: 2, incognito: true })];
    expect(managedTabs({ tabs, windows }).map((item) => item.id)).toEqual([]);
    expect(buildFacts({ tabs, windows, groups: [], now }).size).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/capabilities.test.ts tests/unit/facts.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现能力检测**

Create `src/core/capabilities.ts`:

```ts
import type { Capabilities } from '../shared/types';

export type CapabilityInput = {
  userAgent: string;
  sampleTab?: Partial<chrome.tabs.Tab>;
  hasTabGroups: boolean;
  hasSessions: boolean;
};

function chromeMajor(userAgent: string): number | null {
  const match = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent);
  return match ? Number(match[1]) : null;
}

export function detectCapabilities(input: CapabilityInput): Capabilities {
  const major = chromeMajor(input.userAgent);
  const sample = input.sampleTab;
  return {
    chromeMajor: major,
    lastAccessed: sample ? sample.lastAccessed !== undefined : major !== null && major >= 121,
    frozen: sample
      ? (sample as chrome.tabs.Tab & { frozen?: boolean }).frozen !== undefined
      : major !== null && major >= 132,
    tabGroups: input.hasTabGroups,
    sessions: input.hasSessions,
  };
}
```

- [ ] **Step 4: 实现事实构建**

Create `src/core/facts.ts`:

```ts
import { TAB_GROUP_ID_NONE } from '../shared/constants';
import type { TabFacts } from '../shared/types';
import { domainOf, isManageableUrl } from '../shared/url';

export type FactsInput = {
  tabs: chrome.tabs.Tab[];
  windows: chrome.windows.Window[];
  groups: chrome.tabGroups.TabGroup[];
  now: number;
};

export function managedTabs(input: Pick<FactsInput, 'tabs' | 'windows'>): chrome.tabs.Tab[] {
  const normalWindows = new Set(
    input.windows
      .filter((window) => window.type === 'normal' && !window.incognito && typeof window.id === 'number')
      .map((window) => window.id as number),
  );

  return input.tabs.filter((tab) => {
    if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number') return false;
    if (!normalWindows.has(tab.windowId)) return false;
    const url = tab.url ?? tab.pendingUrl ?? '';
    return isManageableUrl(url);
  });
}

export function buildFacts(input: FactsInput): Map<number, TabFacts> {
  const tabs = managedTabs(input);
  const windows = new Map(input.windows.map((window) => [window.id, window]));
  const groups = new Map(input.groups.map((group) => [group.id, group]));
  const counts = new Map<number, number>();
  for (const tab of tabs) {
    counts.set(tab.windowId, (counts.get(tab.windowId) ?? 0) + 1);
  }

  const result = new Map<number, TabFacts>();
  for (const tab of tabs) {
    const tabId = tab.id as number;
    const windowId = tab.windowId;
    const window = windows.get(windowId);
    const url = tab.url ?? tab.pendingUrl ?? '';
    const group = tab.groupId !== TAB_GROUP_ID_NONE ? groups.get(tab.groupId) : undefined;
    const lastAccessed = tab.lastAccessed;
    const lastActiveMinutes =
      typeof lastAccessed === 'number' && Number.isFinite(lastAccessed) && lastAccessed > 0
        ? Math.max(0, Math.floor((input.now - lastAccessed) / 60_000))
        : null;

    result.set(tabId, {
      tabId,
      windowId,
      url,
      title: tab.title ?? '',
      domain: domainOf(url),
      lastActiveMinutes,
      totalTabCount: tabs.length,
      windowTabCount: counts.get(windowId) ?? 0,
      pinned: tab.pinned === true,
      audible: tab.audible === true,
      active: tab.active === true,
      muted: tab.mutedInfo?.muted === true,
      discarded: tab.discarded === true,
      frozen: (tab as chrome.tabs.Tab & { frozen?: boolean }).frozen === true,
      grouped: tab.groupId !== TAB_GROUP_ID_NONE,
      groupCollapsed: group?.collapsed === true,
      windowFocused: window?.focused === true,
      onlyTabInWindow: (counts.get(windowId) ?? 0) === 1,
      groupTitle: group?.title ?? '',
    });
  }

  return result;
}
```

- [ ] **Step 5: 运行测试与类型检查**

Run: `npx vitest run tests/unit/capabilities.test.ts tests/unit/facts.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/core/capabilities.ts src/core/facts.ts tests/unit/capabilities.test.ts tests/unit/facts.test.ts
git commit -m "feat: detect capabilities and build tab facts"
```
### Task 6: 清理计划与安全守卫

**Files:**
- Create: `src/core/cleaner.ts`
- Test: `tests/unit/cleaner.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `buildFacts`、`managedTabs`；Task 4 的 `evaluateStrategy`；Task 2 的 `CleanupPlan`、`PlannedTab`、`Strategy`、`Capabilities`。
- Produces: `planCleanup(input): CleanupPlan`；`revalidatePlannedTab(planned, current): boolean`。

- [ ] **Step 1: 写清理计划测试**

Create `tests/unit/cleaner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { planCleanup, revalidatePlannedTab } from '../../src/core/cleaner';
import type { Capabilities, Expr, Strategy } from '../../src/shared/types';

const now = 1_000_000_000;
const caps: Capabilities = { chromeMajor: 132, lastAccessed: true, frozen: true, tabGroups: true, sessions: true };

const tab = (partial: Partial<chrome.tabs.Tab>): chrome.tabs.Tab =>
  ({
    id: 1,
    windowId: 1,
    index: 0,
    url: 'https://example.com/a',
    title: 'A',
    pinned: false,
    audible: false,
    active: false,
    mutedInfo: { muted: false },
    discarded: false,
    groupId: -1,
    ...partial,
  }) as chrome.tabs.Tab;

const window = (partial: Partial<chrome.windows.Window> = {}): chrome.windows.Window =>
  ({ id: 1, type: 'normal', incognito: false, focused: true, ...partial }) as chrome.windows.Window;

const strategy = (expression: Expr): Strategy => ({
  id: 'test',
  name: '测试',
  builtin: false,
  expression,
  createdAt: now,
  updatedAt: now,
  lastPreviewHash: null,
  lastPreviewAt: null,
});

const timeExpr: Expr = { type: 'condition', id: 'time', fact: 'lastActiveMinutes', op: 'gt', value: 60 };

describe('planCleanup', () => {
  it('matches only tabs satisfying the strategy', () => {
    const tabs = [
      tab({ id: 1, lastAccessed: now - 2 * 60 * 60_000 }),
      tab({ id: 2, lastAccessed: now - 10 * 60_000 }),
    ];
    const plan = planCleanup({ tabs, windows: [window()], groups: [], strategy: strategy(timeExpr), capabilities: caps, now });
    expect(plan.matched.map((item) => item.tabId)).toEqual([1]);
    expect(plan.kept.map((item) => item.tabId)).toEqual([2]);
  });

  it('keeps one tab when every manageable tab in a window matches', () => {
    const tabs = [
      tab({ id: 1, active: true, lastAccessed: now - 2 * 60 * 60_000 }),
      tab({ id: 2, lastAccessed: now - 3 * 60 * 60_000 }),
    ];
    const plan = planCleanup({ tabs, windows: [window()], groups: [], strategy: strategy(timeExpr), capabilities: caps, now });
    expect(plan.matched).toHaveLength(1);
    expect(plan.kept).toHaveLength(1);
    expect(plan.kept[0]?.facts.active).toBe(true);
  });

  it('does not apply the guard when a window has an internal page that cannot close', () => {
    const tabs = [
      tab({ id: 1, lastAccessed: now - 2 * 60 * 60_000 }),
      tab({ id: 2, url: 'chrome://settings' }),
    ];
    const plan = planCleanup({ tabs, windows: [window()], groups: [], strategy: strategy(timeExpr), capabilities: caps, now });
    expect(plan.matched.map((item) => item.tabId)).toEqual([1]);
    expect(plan.kept).toHaveLength(0);
  });

  it('does not match tabs whose last access time is unknown', () => {
    const plan = planCleanup({
      tabs: [tab({ id: 1, lastAccessed: 0 })],
      windows: [window()],
      groups: [],
      strategy: strategy(timeExpr),
      capabilities: caps,
      now,
    });
    expect(plan.matched).toHaveLength(0);
  });
});

describe('revalidatePlannedTab', () => {
  it('rejects a tab whose url changed', () => {
    const plan = planCleanup({
      tabs: [tab({ id: 1, lastAccessed: now - 2 * 60 * 60_000 }), tab({ id: 2, lastAccessed: now - 10 * 60_000 })],
      windows: [window()],
      groups: [],
      strategy: strategy(timeExpr),
      capabilities: caps,
      now,
    });
    const planned = plan.matched[0]!;
    expect(revalidatePlannedTab(planned, tab({ id: 1, url: 'https://example.com/gone', lastAccessed: now - 2 * 60 * 60_000 }))).toBe(false);
    expect(revalidatePlannedTab(planned, tab({ id: 1, lastAccessed: now - 2 * 60 * 60_000 }))).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/cleaner.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现清理计划**

Create `src/core/cleaner.ts`:

```ts
import { TAB_GROUP_ID_NONE } from '../shared/constants';
import type {
  Capabilities,
  CleanupPlan,
  PlannedTab,
  Strategy,
  TabFacts,
  TraceNode,
} from '../shared/types';
import { buildFacts, managedTabs } from './facts';
import { evaluateStrategy } from './rules/evaluate';

export type CleanerInput = {
  tabs: chrome.tabs.Tab[];
  windows: chrome.windows.Window[];
  groups: chrome.tabGroups.TabGroup[];
  strategy: Strategy;
  capabilities: Capabilities;
  now: number;
};

export function planCleanup(input: CleanerInput): CleanupPlan {
  const facts = buildFacts(input);
  const managed = managedTabs(input).filter((tab) => typeof tab.id === 'number' && facts.has(tab.id));
  const groups = new Map(input.groups.map((group) => [group.id, group]));
  const matched: PlannedTab[] = [];
  const kept: PlannedTab[] = [];

  for (const tab of managed) {
    const tabFacts = facts.get(tab.id as number);
    if (!tabFacts) continue;
    const evaluation = evaluateStrategy(input.strategy, tabFacts, input.capabilities);
    const planned = toPlannedTab(tab, tabFacts, groups, evaluation.trace);
    if (evaluation.matched) matched.push(planned);
    else kept.push(planned);
  }

  preserveOnePerWindow(matched, kept, input.tabs, input.windows);
  const order = (a: PlannedTab, b: PlannedTab) => a.windowId - b.windowId || a.index - b.index;
  matched.sort(order);
  kept.sort(order);
  return { matched, kept, totalManagedTabs: managed.length };
}

function toPlannedTab(
  tab: chrome.tabs.Tab,
  facts: TabFacts,
  groups: Map<number, chrome.tabGroups.TabGroup>,
  trace: TraceNode[],
): PlannedTab {
  const group = tab.groupId !== TAB_GROUP_ID_NONE ? groups.get(tab.groupId) : undefined;
  return {
    tabId: tab.id as number,
    windowId: tab.windowId,
    url: facts.url,
    title: facts.title,
    domain: facts.domain,
    groupId: tab.groupId,
    groupTitle: group?.title ?? '',
    groupColor: group?.color ?? '',
    groupCollapsed: group?.collapsed === true,
    pinned: tab.pinned === true,
    index: tab.index,
    sessionId: (tab as chrome.tabs.Tab & { sessionId?: string }).sessionId ?? null,
    facts,
    trace,
  };
}

function preserveOnePerWindow(
  matched: PlannedTab[],
  kept: PlannedTab[],
  allTabs: chrome.tabs.Tab[],
  windows: chrome.windows.Window[],
): void {
  const normalWindowIds = new Set(
    windows
      .filter((window) => window.type === 'normal' && !window.incognito && typeof window.id === 'number')
      .map((window) => window.id as number),
  );

  const byWindow = new Map<number, PlannedTab[]>();
  for (const tab of matched) {
    const list = byWindow.get(tab.windowId) ?? [];
    list.push(tab);
    byWindow.set(tab.windowId, list);
  }

  for (const [windowId, candidates] of byWindow) {
    if (!normalWindowIds.has(windowId)) continue;
    const totalInWindow = allTabs.filter((tab) => tab.windowId === windowId).length;
    if (candidates.length !== totalInWindow) continue;

    const keeper = [...candidates].sort((a, b) => {
      if (a.facts.active !== b.facts.active) return a.facts.active ? -1 : 1;
      const left = a.facts.lastActiveMinutes ?? Number.MAX_SAFE_INTEGER;
      const right = b.facts.lastActiveMinutes ?? Number.MAX_SAFE_INTEGER;
      return left - right || a.index - b.index;
    })[0];

    if (!keeper) continue;
    matched.splice(matched.indexOf(keeper), 1);
    kept.push(keeper);
  }
}

export function revalidatePlannedTab(planned: PlannedTab, current: chrome.tabs.Tab): boolean {
  const url = current.url ?? current.pendingUrl ?? '';
  return current.id === planned.tabId && current.windowId === planned.windowId && url === planned.url;
}
```

- [ ] **Step 4: 运行测试与类型检查**

Run: `npx vitest run tests/unit/cleaner.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/cleaner.ts tests/unit/cleaner.test.ts
git commit -m "feat: plan cleanup with last-tab guard and revalidation"
```

---

### Task 7: 存储仓库、历史淘汰与测试替身

**Files:**
- Create: `src/platform/storage.ts`
- Create: `src/core/retention.ts`
- Create: `tests/helpers/memory-storage.ts`
- Test: `tests/unit/storage.test.ts`、`tests/unit/retention.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `Settings`、`Strategy`、`ClosedTabSummary`、`ClosedTabRecord`、`CleanupLock`、`CleanupRun`、`LastCleanup`、`Meta`、`DEFAULT_SETTINGS`、`SCHEMA_VERSION`、`STORAGE_KEYS`。
- Produces:
  - `StorageArea` 接口（Task 9 的 `Browser` 复用）
  - `Repo` 类及所有读写方法
  - `selectExpired(index, now, retentionDays, maxRecords)`；`MemoryStorage` 测试替身

- [ ] **Step 1: 写存储与淘汰测试**

Create `tests/helpers/memory-storage.ts`:

```ts
import type { StorageArea } from '../../src/platform/storage';

export class MemoryStorage implements StorageArea {
  data: Record<string, unknown> = {};

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === null || keys === undefined) return { ...this.data };
    const list = Array.isArray(keys) ? keys : [keys];
    const result: Record<string, unknown> = {};
    for (const key of list) {
      if (key in this.data) result[key] = this.data[key];
    }
    return result;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, items);
  }

  async remove(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) delete this.data[key];
  }

  async clear(): Promise<void> {
    this.data = {};
  }
}
```

Create `tests/unit/retention.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { selectExpired } from '../../src/core/retention';
import type { ClosedTabSummary } from '../../src/shared/types';

const summary = (id: string, closedAt: number): ClosedTabSummary => ({
  id,
  url: `https://example.com/${id}`,
  title: id,
  domain: 'example.com',
  closedAt,
  trigger: 'idle',
  status: 'closed',
  restoredAt: null,
});

describe('selectExpired', () => {
  it('removes entries older than the retention window', () => {
    const now = 100 * 24 * 60 * 60_000;
    const index = [summary('old', now - 31 * 24 * 60 * 60_000), summary('new', now - 2 * 24 * 60 * 60_000)];
    const result = selectExpired(index, now, 30, 5_000);
    expect(result.kept.map((item) => item.id)).toEqual(['new']);
    expect(result.removedIds).toEqual(['old']);
  });

  it('keeps only the newest records when over the cap', () => {
    const now = 1_000;
    const index = [summary('a', 1), summary('b', 2), summary('c', 3)];
    const result = selectExpired(index, now, 30, 2);
    expect(result.kept.map((item) => item.id)).toEqual(['c', 'b']);
    expect(result.removedIds).toEqual(['a']);
  });
});
```

Create `tests/unit/storage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../helpers/memory-storage';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../../src/shared/constants';
import { Repo } from '../../src/platform/storage';
import type { ClosedTabRecord, ClosedTabSummary, Strategy } from '../../src/shared/types';

const now = 1_000_000;

const repo = () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  return { local, session, repo: new Repo(local, session, () => now) };
};

const summary: ClosedTabSummary = {
  id: 'r1',
  url: 'https://example.com',
  title: 'Example',
  domain: 'example.com',
  closedAt: now,
  trigger: 'idle',
  status: 'pending',
  restoredAt: null,
};

const record: ClosedTabRecord = {
  ...summary,
  strategyId: 'preset:standard',
  strategyName: '标准',
  browserSessionId: 's1',
  windowId: 1,
  groupId: -1,
  groupTitle: '',
  groupColor: '',
  groupCollapsed: false,
  pinned: false,
  index: 0,
  sessionId: null,
  recovered: false,
};

const strategy: Strategy = {
  id: 'custom:1',
  name: '自定义',
  builtin: false,
  expression: { type: 'condition', id: 'c', fact: 'pinned', op: 'is', value: true },
  createdAt: now,
  updatedAt: now,
  lastPreviewHash: null,
  lastPreviewAt: null,
};

describe('Repo', () => {
  it('returns and persists defaults for missing settings', async () => {
    const { repo: store } = repo();
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
    await store.setSettings({ ...DEFAULT_SETTINGS, idleThresholdMinutes: 30 });
    expect((await store.getSettings()).idleThresholdMinutes).toBe(30);
  });

  it('backs up corrupt settings instead of throwing', async () => {
    const { local, repo: store } = repo();
    await local.set({ [STORAGE_KEYS.settings]: { nope: true } });
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
    const keys = Object.keys(local.data).filter((key) => key.startsWith(STORAGE_KEYS.chaosPrefix));
    expect(keys).toHaveLength(1);
  });

  it('round-trips strategies, history and cleanup state', async () => {
    const { repo: store } = repo();
    await store.setStrategies([strategy]);
    expect(await store.getStrategies()).toEqual([strategy]);

    await store.setHistoryIndex([summary]);
    await store.setHistoryRecords([record]);
    expect(await store.getHistoryIndex()).toEqual([summary]);
    expect(await store.getHistoryRecords(['r1'])).toEqual([record]);

    await store.setCleanupLock({ runId: 'run', startedAt: now });
    expect(await store.getCleanupLock()).toEqual({ runId: 'run', startedAt: now });
    await store.clearCleanupLock();
    expect(await store.getCleanupLock()).toBeNull();

    await store.setCleanupRun({
      id: 'run',
      startedAt: now,
      trigger: 'idle',
      strategyId: strategy.id,
      browserSessionId: 's1',
      drafts: [record],
    });
    expect((await store.getCleanupRun())?.id).toBe('run');
    await store.clearCleanupRun();
    expect(await store.getCleanupRun()).toBeNull();

    await store.setLastCleanup({ at: now, trigger: 'idle', closed: 1, failed: 0, skipped: 0, durationMs: 12, recordIds: ['r1'] });
    expect((await store.getLastCleanup())?.closed).toBe(1);

    await store.setBrowserSessionId('browser-1');
    expect(await store.getBrowserSessionId()).toBe('browser-1');
  });

  it('deletes history items and their index entries', async () => {
    const { repo: store } = repo();
    await store.setHistoryIndex([summary]);
    await store.setHistoryRecords([record]);
    await store.deleteHistoryRecords(['r1']);
    await store.setHistoryIndex([]);
    expect(await store.getHistoryIndex()).toEqual([]);
    expect(await store.getHistoryRecords(['r1'])).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/retention.test.ts tests/unit/storage.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现历史淘汰**

Create `src/core/retention.ts`:

```ts
import type { ClosedTabSummary } from '../shared/types';

export type RetentionResult = {
  kept: ClosedTabSummary[];
  removedIds: string[];
};

export function selectExpired(
  index: ClosedTabSummary[],
  now: number,
  retentionDays: number,
  maxRecords: number,
): RetentionResult {
  const cutoff = now - retentionDays * 24 * 60 * 60_000;
  const removed = new Set<string>();
  const kept: ClosedTabSummary[] = [];

  for (const item of index) {
    if (item.closedAt < cutoff) removed.add(item.id);
    else kept.push(item);
  }

  kept.sort((a, b) => b.closedAt - a.closedAt);
  for (const item of kept.slice(maxRecords)) removed.add(item.id);

  return {
    kept: kept.slice(0, maxRecords),
    removedIds: [...removed],
  };
}
```

- [ ] **Step 4: 实现存储仓库**

Create `src/platform/storage.ts`:

```ts
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/constants';
import type {
  CleanupLock,
  CleanupRun,
  ClosedTabRecord,
  ClosedTabSummary,
  LastCleanup,
  Meta,
  Settings,
  Strategy,
} from '../shared/types';

export interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

export class Repo {
  constructor(
    private readonly local: StorageArea,
    private readonly session: StorageArea,
    private readonly now: () => number = Date.now,
  ) {}

  async getMeta(): Promise<Meta | null> {
    const value = (await this.local.get(STORAGE_KEYS.meta))[STORAGE_KEYS.meta];
    return isMeta(value) ? value : null;
  }

  async setMeta(meta: Meta): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.meta]: meta });
  }

  async getSettings(): Promise<Settings> {
    const value = (await this.local.get(STORAGE_KEYS.settings))[STORAGE_KEYS.settings];
    if (isSettings(value)) return value;
    if (value !== undefined) await this.backupCorrupt(STORAGE_KEYS.settings, value);
    await this.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
    return DEFAULT_SETTINGS;
  }

  async setSettings(settings: Settings): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.settings]: settings });
  }

  async getStrategies(): Promise<Strategy[]> {
    const value = (await this.local.get(STORAGE_KEYS.strategies))[STORAGE_KEYS.strategies];
    if (Array.isArray(value) && value.every(isStrategy)) return value;
    if (value !== undefined) await this.backupCorrupt(STORAGE_KEYS.strategies, value);
    return [];
  }

  async setStrategies(strategies: Strategy[]): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.strategies]: strategies });
  }

  async getHistoryIndex(): Promise<ClosedTabSummary[]> {
    const value = (await this.local.get(STORAGE_KEYS.historyIndex))[STORAGE_KEYS.historyIndex];
    if (Array.isArray(value) && value.every(isSummary)) return value;
    if (value !== undefined) await this.backupCorrupt(STORAGE_KEYS.historyIndex, value);
    return [];
  }

  async setHistoryIndex(index: ClosedTabSummary[]): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.historyIndex]: index });
  }

  async getHistoryRecords(ids: string[]): Promise<ClosedTabRecord[]> {
    if (ids.length === 0) return [];
    const keys = ids.map((id) => `${STORAGE_KEYS.historyItemPrefix}${id}`);
    const raw = await this.local.get(keys);
    const records: ClosedTabRecord[] = [];
    for (const key of keys) {
      const value = raw[key];
      if (isRecord(value)) records.push(value);
      else if (value !== undefined) await this.backupCorrupt(key, value);
    }
    return records;
  }

  async setHistoryRecords(records: ClosedTabRecord[]): Promise<void> {
    const items: Record<string, unknown> = {};
    for (const record of records) items[`${STORAGE_KEYS.historyItemPrefix}${record.id}`] = record;
    await this.local.set(items);
  }

  async deleteHistoryRecords(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.local.remove(ids.map((id) => `${STORAGE_KEYS.historyItemPrefix}${id}`));
  }

  async getCleanupLock(): Promise<CleanupLock | null> {
    const value = (await this.local.get(STORAGE_KEYS.cleanupLock))[STORAGE_KEYS.cleanupLock];
    return isLock(value) ? value : null;
  }

  async setCleanupLock(lock: CleanupLock): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.cleanupLock]: lock });
  }

  async clearCleanupLock(): Promise<void> {
    await this.local.remove(STORAGE_KEYS.cleanupLock);
  }

  async getCleanupRun(): Promise<CleanupRun | null> {
    const value = (await this.local.get(STORAGE_KEYS.cleanupRun))[STORAGE_KEYS.cleanupRun];
    return isRun(value) ? value : null;
  }

  async setCleanupRun(run: CleanupRun): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.cleanupRun]: run });
  }

  async clearCleanupRun(): Promise<void> {
    await this.local.remove(STORAGE_KEYS.cleanupRun);
  }

  async getLastCleanup(): Promise<LastCleanup | null> {
    const value = (await this.local.get(STORAGE_KEYS.lastCleanup))[STORAGE_KEYS.lastCleanup];
    return isLastCleanup(value) ? value : null;
  }

  async setLastCleanup(lastCleanup: LastCleanup): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.lastCleanup]: lastCleanup });
  }

  async getBrowserSessionId(): Promise<string | null> {
    const value = (await this.session.get(STORAGE_KEYS.browserSessionId))[STORAGE_KEYS.browserSessionId];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  async setBrowserSessionId(id: string): Promise<void> {
    await this.session.set({ [STORAGE_KEYS.browserSessionId]: id });
  }

  private async backupCorrupt(key: string, value: unknown): Promise<void> {
    const backupKey = `${STORAGE_KEYS.chaosPrefix}${this.now()}:${encodeURIComponent(key)}`;
    await this.local.set({ [backupKey]: value });
  }
}

function isSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.idleThresholdMinutes === 'number' &&
    typeof settings.lockCleanupEnabled === 'boolean' &&
    typeof settings.lockDelayMinutes === 'number' &&
    typeof settings.historyRetentionDays === 'number' &&
    typeof settings.activeStrategyId === 'string'
  );
}

function isStrategy(value: unknown): value is Strategy {
  if (!value || typeof value !== 'object') return false;
  const strategy = value as Record<string, unknown>;
  return (
    typeof strategy.id === 'string' &&
    typeof strategy.name === 'string' &&
    typeof strategy.builtin === 'boolean' &&
    !!strategy.expression &&
    typeof strategy.expression === 'object' &&
    typeof strategy.createdAt === 'number' &&
    typeof strategy.updatedAt === 'number' &&
    (strategy.lastPreviewHash === null || typeof strategy.lastPreviewHash === 'string') &&
    (strategy.lastPreviewAt === null || typeof strategy.lastPreviewAt === 'number')
  );
}

function isSummary(value: unknown): value is ClosedTabSummary {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.url === 'string' &&
    typeof item.title === 'string' &&
    typeof item.domain === 'string' &&
    typeof item.closedAt === 'number' &&
    (item.trigger === 'idle' || item.trigger === 'locked' || item.trigger === 'manual') &&
    (item.status === 'pending' || item.status === 'closed') &&
    (item.restoredAt === null || typeof item.restoredAt === 'number')
  );
}

function isRecord(value: unknown): value is ClosedTabRecord {
  if (!isSummary(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.strategyId === 'string' &&
    typeof item.strategyName === 'string' &&
    typeof item.browserSessionId === 'string' &&
    typeof item.windowId === 'number' &&
    typeof item.groupId === 'number' &&
    typeof item.groupTitle === 'string' &&
    typeof item.groupColor === 'string' &&
    typeof item.groupCollapsed === 'boolean' &&
    typeof item.pinned === 'boolean' &&
    typeof item.index === 'number' &&
    (item.sessionId === null || typeof item.sessionId === 'string') &&
    typeof item.recovered === 'boolean'
  );
}

function isLock(value: unknown): value is CleanupLock {
  if (!value || typeof value !== 'object') return false;
  const lock = value as Record<string, unknown>;
  return typeof lock.runId === 'string' && typeof lock.startedAt === 'number';
}

function isRun(value: unknown): value is CleanupRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.id === 'string' &&
    typeof run.startedAt === 'number' &&
    (run.trigger === 'idle' || run.trigger === 'locked' || run.trigger === 'manual') &&
    typeof run.strategyId === 'string' &&
    typeof run.browserSessionId === 'string' &&
    Array.isArray(run.drafts) &&
    run.drafts.every(isRecord)
  );
}

function isLastCleanup(value: unknown): value is LastCleanup {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.at === 'number' &&
    (item.trigger === 'idle' || item.trigger === 'locked' || item.trigger === 'manual') &&
    typeof item.closed === 'number' &&
    typeof item.failed === 'number' &&
    typeof item.skipped === 'number' &&
    typeof item.durationMs === 'number' &&
    Array.isArray(item.recordIds) &&
    item.recordIds.every((id) => typeof id === 'string')
  );
}

function isMeta(value: unknown): value is Meta {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as Record<string, unknown>).schemaVersion === 'number';
}
```

- [ ] **Step 5: 运行测试与类型检查**

Run: `npx vitest run tests/unit/retention.test.ts tests/unit/storage.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/platform/storage.ts src/core/retention.ts tests/helpers/memory-storage.ts tests/unit/retention.test.ts tests/unit/storage.test.ts
git commit -m "feat: add storage repository and history retention"
```
### Task 8: 关闭历史记录与恢复分组规划

**Files:**
- Create: `src/core/history.ts`
- Test: `tests/unit/history.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `CleanupPlan`、`ClosedTabRecord`、`ClosedTabSummary`、`RestoreOptions`；Task 6 的 `PlannedTab`。
- Produces:
  - `buildClosedRecords(plan, input): ClosedTabRecord[]`
  - `toSummary(record): ClosedTabSummary`
  - `planRestore(records, options, currentWindowId): RestoreGroup[]`
  - `markRestored(index, ids, now): ClosedTabSummary[]`

- [ ] **Step 1: 写历史规划测试**

Create `tests/unit/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildClosedRecords, markRestored, planRestore, toSummary } from '../../src/core/history';
import type { CleanupPlan, ClosedTabRecord, PlannedTab } from '../../src/shared/types';

const now = 1_000_000;
const strategy = { id: 'preset:standard', name: '标准' };

const planned = (partial: Partial<PlannedTab>): PlannedTab => ({
  tabId: 1,
  windowId: 10,
  url: 'https://example.com/a',
  title: 'A',
  domain: 'example.com',
  groupId: -1,
  groupTitle: '',
  groupColor: '',
  groupCollapsed: false,
  pinned: false,
  index: 0,
  sessionId: null,
  facts: {} as PlannedTab['facts'],
  trace: [],
  ...partial,
});

const plan: CleanupPlan = {
  matched: [
    planned({ tabId: 1, url: 'https://example.com/a' }),
    planned({ tabId: 2, url: 'https://example.com/b', groupId: 7, groupTitle: '工作', groupColor: 'blue' }),
  ],
  kept: [],
  totalManagedTabs: 2,
};

describe('history planning', () => {
  it('builds pending records in matched order', () => {
    let counter = 0;
    const records = buildClosedRecords(plan, {
      trigger: 'idle',
      strategy,
      browserSessionId: 'session-1',
      now,
      ids: () => `r${counter++}`,
    });
    expect(records.map((record) => record.id)).toEqual(['r0', 'r1']);
    expect(records.every((record) => record.status === 'pending')).toBe(true);
    expect(records[1]?.groupTitle).toBe('工作');
  });

  it('plans current-window restore as one group', () => {
    const records = buildClosedRecords(plan, {
      trigger: 'idle',
      strategy,
      browserSessionId: 'session-1',
      now,
      ids: () => `r${Math.random()}`,
    });
    const groups = planRestore(records, { mode: 'current-window', complete: false }, 99);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.windowId).toBe(99);
    expect(groups[0]?.records).toHaveLength(2);
  });

  it('plans original-window-groups restore by browser session and window', () => {
    const records: ClosedTabRecord[] = [
      { ...buildClosedRecords(plan, { trigger: 'idle', strategy, browserSessionId: 's1', now, ids: () => 'a' })[0]!, windowId: 10, groupId: -1 },
      { ...buildClosedRecords(plan, { trigger: 'idle', strategy, browserSessionId: 's1', now, ids: () => 'b' })[0]!, windowId: 10, groupId: 7, groupTitle: '工作', groupColor: 'blue' },
      { ...buildClosedRecords(plan, { trigger: 'idle', strategy, browserSessionId: 's1', now, ids: () => 'c' })[0]!, windowId: 11, groupId: -1 },
    ];
    const groups = planRestore(records, { mode: 'original-window-groups', complete: false }, 99);
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.windowId === 'new')).toBe(true);
    expect(groups[0]?.groups.some((group) => group.groupTitle === '工作')).toBe(true);
  });

  it('marks restored summaries', () => {
    const record = buildClosedRecords(plan, { trigger: 'idle', strategy, browserSessionId: 's1', now, ids: () => 'r' })[0]!;
    const index = [toSummary(record)];
    const next = markRestored(index, ['r'], now + 1);
    expect(next[0]?.restoredAt).toBe(now + 1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/history.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现历史规划**

Create `src/core/history.ts`:

```ts
import { TAB_GROUP_ID_NONE } from '../shared/constants';
import type {
  CleanupPlan,
  ClosedTabRecord,
  ClosedTabSummary,
  RestoreOptions,
  Strategy,
  Trigger,
} from '../shared/types';

export type BuildHistoryInput = {
  trigger: Trigger;
  strategy: Pick<Strategy, 'id' | 'name'>;
  browserSessionId: string;
  now: number;
  ids: () => string;
};

export type RestoreGroup = {
  key: string;
  windowId: number | 'new';
  records: ClosedTabRecord[];
  groups: Array<{
    key: string;
    groupId: number;
    groupTitle: string;
    groupColor: string;
    groupCollapsed: boolean;
    records: ClosedTabRecord[];
  }>;
};

export function buildClosedRecords(plan: CleanupPlan, input: BuildHistoryInput): ClosedTabRecord[] {
  return plan.matched.map((tab) => ({
    id: input.ids(),
    url: tab.url,
    title: tab.title,
    domain: tab.domain,
    closedAt: input.now,
    trigger: input.trigger,
    status: 'pending',
    restoredAt: null,
    strategyId: input.strategy.id,
    strategyName: input.strategy.name,
    browserSessionId: input.browserSessionId,
    windowId: tab.windowId,
    groupId: tab.groupId,
    groupTitle: tab.groupTitle,
    groupColor: tab.groupColor,
    groupCollapsed: tab.groupCollapsed,
    pinned: tab.pinned,
    index: tab.index,
    sessionId: tab.sessionId,
    recovered: false,
  }));
}

export function toSummary(record: ClosedTabRecord): ClosedTabSummary {
  return {
    id: record.id,
    url: record.url,
    title: record.title,
    domain: record.domain,
    closedAt: record.closedAt,
    trigger: record.trigger,
    status: record.status,
    restoredAt: record.restoredAt,
  };
}

export function planRestore(
  records: ClosedTabRecord[],
  options: RestoreOptions,
  currentWindowId: number,
): RestoreGroup[] {
  if (options.mode === 'current-window') {
    return [makeGroup('current-window', currentWindowId, records)];
  }

  const byWindow = new Map<string, ClosedTabRecord[]>();
  for (const record of records) {
    const key = `${record.browserSessionId}:${record.windowId}`;
    const list = byWindow.get(key) ?? [];
    list.push(record);
    byWindow.set(key, list);
  }

  return [...byWindow.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupRecords]) => makeGroup(key, 'new', groupRecords));
}

function makeGroup(key: string, windowId: number | 'new', records: ClosedTabRecord[]): RestoreGroup {
  const grouped = new Map<string, ClosedTabRecord[]>();
  for (const record of records) {
    if (record.groupId === TAB_GROUP_ID_NONE) continue;
    const groupKey = `${record.browserSessionId}:${record.groupId}`;
    const list = grouped.get(groupKey) ?? [];
    list.push(record);
    grouped.set(groupKey, list);
  }

  return {
    key,
    windowId,
    records,
    groups: [...grouped.entries()].map(([groupKey, groupRecords]) => ({
      key: groupKey,
      groupId: groupRecords[0]?.groupId ?? TAB_GROUP_ID_NONE,
      groupTitle: groupRecords[0]?.groupTitle ?? '',
      groupColor: groupRecords[0]?.groupColor ?? '',
      groupCollapsed: groupRecords[0]?.groupCollapsed ?? false,
      records: groupRecords,
    })),
  };
}

export function markRestored(index: ClosedTabSummary[], ids: string[], now: number): ClosedTabSummary[] {
  const set = new Set(ids);
  return index.map((item) => (set.has(item.id) ? { ...item, restoredAt: now } : item));
}
```

- [ ] **Step 4: 运行测试与类型检查**

Run: `npx vitest run tests/unit/history.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/history.ts tests/unit/history.test.ts
git commit -m "feat: build closed tab history and restore groups"
```

---

### Task 9: 浏览器抽象、Chrome 适配器与 FakeBrowser

**Files:**
- Create: `src/platform/browser.ts`、`src/platform/chrome-browser.ts`
- Create: `tests/integration/fake-browser.ts`
- Test: `tests/integration/fake-browser.test.ts`

**Interfaces:**
- Consumes: Task 7 的 `StorageArea`、`MemoryStorage`。
- Produces: `Browser` 接口、`ChromeBrowser` 实现、`FakeBrowser` 测试替身；后续 service/triggers 只依赖 `Browser`。

- [ ] **Step 1: 写 FakeBrowser 基线测试**

Create `tests/integration/fake-browser.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { FakeBrowser } from './fake-browser';

describe('FakeBrowser', () => {
  it('creates, groups and removes tabs', async () => {
    const browser = new FakeBrowser();
    const a = await browser.createTab({ url: 'https://example.com/a', active: false });
    const b = await browser.createTab({ url: 'https://example.com/b', active: false });
    const groupId = await browser.groupTabs([a.id!, b.id!], { windowId: 1 });
    await browser.updateTabGroup(groupId, { title: '工作', color: 'blue' });
    expect((await browser.getTabGroups())[0]?.title).toBe('工作');

    await browser.removeTab(a.id!);
    expect(await browser.getTab(a.id!)).toBeNull();
    expect((await browser.queryTabs()).map((tab) => tab.id)).toEqual([b.id]);
  });

  it('emits idle, alarm and tab events', async () => {
    const browser = new FakeBrowser();
    const idle = vi.fn();
    const alarm = vi.fn();
    const removed = vi.fn();
    browser.onIdleStateChanged(idle);
    browser.onAlarm(alarm);
    browser.onTabRemoved(removed);

    browser.emitIdle('locked');
    browser.emitAlarm('tab-dormancy:locked');
    const tab = await browser.createTab({ url: 'https://example.com' });
    await browser.removeTab(tab.id!);

    expect(idle).toHaveBeenCalledWith('locked');
    expect(alarm).toHaveBeenCalledWith(expect.objectContaining({ name: 'tab-dormancy:locked' }));
    expect(removed).toHaveBeenCalledWith(tab.id);
    expect(await browser.queryIdleState(60)).toBe('locked');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/integration/fake-browser.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 定义 Browser 接口**

Create `src/platform/browser.ts`:

```ts
import type { StorageArea } from './storage';

export type Unsubscribe = () => void;

export interface Browser {
  queryTabs(): Promise<chrome.tabs.Tab[]>;
  getTab(tabId: number): Promise<chrome.tabs.Tab | null>;
  removeTab(tabId: number): Promise<void>;
  createTab(properties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab>;
  groupTabs(tabIds: number[], createProperties?: { windowId?: number }): Promise<number>;
  updateTabGroup(groupId: number, properties: chrome.tabGroups.UpdateProperties): Promise<void>;
  getWindows(): Promise<chrome.windows.Window[]>;
  getLastFocusedWindow(): Promise<chrome.windows.Window>;
  createWindow(data: chrome.windows.CreateData): Promise<chrome.windows.Window>;
  getTabGroups(): Promise<chrome.tabGroups.TabGroup[]>;
  setIdleDetectionInterval(seconds: number): void;
  queryIdleState(thresholdSeconds: number): Promise<chrome.idle.IdleState>;
  createAlarm(name: string, info: chrome.alarms.AlarmCreateInfo): Promise<void>;
  clearAlarm(name: string): Promise<void>;
  restoreSession(sessionId: string): Promise<chrome.sessions.Session>;
  getURL(path: string): string;
  openOptionsPage(): Promise<void>;
  storageLocal: StorageArea;
  storageSession: StorageArea;
  onIdleStateChanged(listener: (state: chrome.idle.IdleState) => void): Unsubscribe;
  onAlarm(listener: (alarm: chrome.alarms.Alarm) => void): Unsubscribe;
  onInstalled(listener: () => void): Unsubscribe;
  onStartup(listener: () => void): Unsubscribe;
  onTabActivated(listener: (info: chrome.tabs.TabActiveInfo) => void): Unsubscribe;
  onTabRemoved(listener: (tabId: number) => void): Unsubscribe;
  onWindowFocusChanged(listener: (windowId: number) => void): Unsubscribe;
}
```

- [ ] **Step 4: 实现 Chrome 适配器**

Create `src/platform/chrome-browser.ts`:

```ts
import type { Browser, Unsubscribe } from './browser';
import type { StorageArea } from './storage';

class ChromeStorage implements StorageArea {
  constructor(private readonly area: chrome.storage.StorageArea) {}

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    return this.area.get(keys ?? null);
  }

  async set(items: Record<string, unknown>): Promise<void> {
    await this.area.set(items);
  }

  async remove(keys: string | string[]): Promise<void> {
    await this.area.remove(keys);
  }

  async clear(): Promise<void> {
    await this.area.clear();
  }
}

export class ChromeBrowser implements Browser {
  readonly storageLocal = new ChromeStorage(chrome.storage.local);
  readonly storageSession = new ChromeStorage(chrome.storage.session);

  queryTabs(): Promise<chrome.tabs.Tab[]> {
    return chrome.tabs.query({});
  }

  async getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
    try {
      return await chrome.tabs.get(tabId);
    } catch {
      return null;
    }
  }

  async removeTab(tabId: number): Promise<void> {
    await chrome.tabs.remove(tabId);
  }

  createTab(properties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
    return chrome.tabs.create(properties);
  }

  groupTabs(tabIds: number[], createProperties?: { windowId?: number }): Promise<number> {
    return chrome.tabs.group(createProperties ? { tabIds, createProperties } : { tabIds });
  }

  async updateTabGroup(groupId: number, properties: chrome.tabGroups.UpdateProperties): Promise<void> {
    await chrome.tabGroups.update(groupId, properties);
  }

  getWindows(): Promise<chrome.windows.Window[]> {
    return chrome.windows.getAll({ populate: false });
  }

  getLastFocusedWindow(): Promise<chrome.windows.Window> {
    return chrome.windows.getLastFocused({ windowTypes: ['normal'] });
  }

  createWindow(data: chrome.windows.CreateData): Promise<chrome.windows.Window> {
    return chrome.windows.create(data);
  }

  getTabGroups(): Promise<chrome.tabGroups.TabGroup[]> {
    return chrome.tabGroups.query({});
  }

  setIdleDetectionInterval(seconds: number): void {
    chrome.idle.setDetectionInterval(seconds);
  }

  queryIdleState(thresholdSeconds: number): Promise<chrome.idle.IdleState> {
    return chrome.idle.queryState(thresholdSeconds);
  }

  async createAlarm(name: string, info: chrome.alarms.AlarmCreateInfo): Promise<void> {
    await chrome.alarms.create(name, info);
  }

  async clearAlarm(name: string): Promise<void> {
    await chrome.alarms.clear(name);
  }

  restoreSession(sessionId: string): Promise<chrome.sessions.Session> {
    return chrome.sessions.restore(sessionId);
  }

  getURL(path: string): string {
    return chrome.runtime.getURL(path);
  }

  openOptionsPage(): Promise<void> {
    return chrome.runtime.openOptionsPage();
  }

  onIdleStateChanged(listener: (state: chrome.idle.IdleState) => void): Unsubscribe {
    chrome.idle.onStateChanged.addListener(listener);
    return () => chrome.idle.onStateChanged.removeListener(listener);
  }

  onAlarm(listener: (alarm: chrome.alarms.Alarm) => void): Unsubscribe {
    chrome.alarms.onAlarm.addListener(listener);
    return () => chrome.alarms.onAlarm.removeListener(listener);
  }

  onInstalled(listener: () => void): Unsubscribe {
    const wrapped = () => listener();
    chrome.runtime.onInstalled.addListener(wrapped);
    return () => chrome.runtime.onInstalled.removeListener(wrapped);
  }

  onStartup(listener: () => void): Unsubscribe {
    chrome.runtime.onStartup.addListener(listener);
    return () => chrome.runtime.onStartup.removeListener(listener);
  }

  onTabActivated(listener: (info: chrome.tabs.TabActiveInfo) => void): Unsubscribe {
    chrome.tabs.onActivated.addListener(listener);
    return () => chrome.tabs.onActivated.removeListener(listener);
  }

  onTabRemoved(listener: (tabId: number) => void): Unsubscribe {
    const wrapped = (tabId: number) => listener(tabId);
    chrome.tabs.onRemoved.addListener(wrapped);
    return () => chrome.tabs.onRemoved.removeListener(wrapped);
  }

  onWindowFocusChanged(listener: (windowId: number) => void): Unsubscribe {
    chrome.windows.onFocusChanged.addListener(listener);
    return () => chrome.windows.onFocusChanged.removeListener(listener);
  }
}
```

- [ ] **Step 5: 实现 FakeBrowser**

Create `tests/integration/fake-browser.ts`:

```ts
import { MemoryStorage } from '../helpers/memory-storage';
import type { Browser, Unsubscribe } from '../../src/platform/browser';

class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  add(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    for (const listener of this.listeners) listener(value);
  }
}

export class FakeBrowser implements Browser {
  tabs: chrome.tabs.Tab[] = [];
  windows: chrome.windows.Window[] = [
    { id: 1, type: 'normal', incognito: false, focused: true } as chrome.windows.Window,
  ];
  groups: chrome.tabGroups.TabGroup[] = [];
  storageLocal = new MemoryStorage();
  storageSession = new MemoryStorage();
  detectionInterval = 60;
  idleState: chrome.idle.IdleState = 'active';
  alarms = new Map<string, chrome.alarms.AlarmCreateInfo>();
  restoredSessions = new Map<string, chrome.sessions.Session>();

  private nextTabId = 1;
  private nextWindowId = 2;
  private nextGroupId = 1;
  private idleEmitter = new Emitter<chrome.idle.IdleState>();
  private alarmEmitter = new Emitter<chrome.alarms.Alarm>();
  private installedEmitter = new Emitter<void>();
  private startupEmitter = new Emitter<void>();
  private activatedEmitter = new Emitter<chrome.tabs.TabActiveInfo>();
  private removedEmitter = new Emitter<number>();
  private focusEmitter = new Emitter<number>();

  addTab(partial: Partial<chrome.tabs.Tab> & { url: string }): chrome.tabs.Tab {
    const windowId = partial.windowId ?? 1;
    const tab = {
      id: this.nextTabId++,
      windowId,
      index: this.tabs.filter((item) => item.windowId === windowId).length,
      title: partial.url,
      pinned: false,
      audible: false,
      active: false,
      mutedInfo: { muted: false },
      discarded: false,
      groupId: -1,
      lastAccessed: Date.now(),
      ...partial,
    } as chrome.tabs.Tab;
    this.tabs.push(tab);
    return tab;
  }

  addWindow(partial: Partial<chrome.windows.Window> = {}): chrome.windows.Window {
    const window = {
      id: this.nextWindowId++,
      type: 'normal',
      incognito: false,
      focused: false,
      ...partial,
    } as chrome.windows.Window;
    this.windows.push(window);
    return window;
  }

  async queryTabs(): Promise<chrome.tabs.Tab[]> {
    return this.tabs.map((tab) => ({ ...tab }));
  }

  async getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
    return this.tabs.find((tab) => tab.id === tabId) ?? null;
  }

  async removeTab(tabId: number): Promise<void> {
    const before = this.tabs.length;
    this.tabs = this.tabs.filter((tab) => tab.id !== tabId);
    if (this.tabs.length === before) throw new Error(`No tab with id: ${tabId}`);
    this.removedEmitter.emit(tabId);
  }

  async createTab(properties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
    const tab = this.addTab({
      url: properties.url ?? 'about:blank',
      windowId: properties.windowId ?? 1,
      active: properties.active ?? false,
      pinned: properties.pinned ?? false,
    });
    if (properties.index !== undefined) tab.index = properties.index;
    return tab;
  }

  async groupTabs(tabIds: number[], createProperties?: { windowId?: number }): Promise<number> {
    const id = this.nextGroupId++;
    const windowId = createProperties?.windowId ?? this.tabs.find((tab) => tab.id === tabIds[0])?.windowId ?? 1;
    this.groups.push({ id, title: '', color: 'grey', collapsed: false, windowId } as chrome.tabGroups.TabGroup);
    for (const tab of this.tabs) {
      if (tabIds.includes(tab.id ?? -1)) tab.groupId = id;
    }
    return id;
  }

  async updateTabGroup(groupId: number, properties: chrome.tabGroups.UpdateProperties): Promise<void> {
    const group = this.groups.find((item) => item.id === groupId);
    if (!group) throw new Error(`No group with id: ${groupId}`);
    Object.assign(group, properties);
  }

  async getWindows(): Promise<chrome.windows.Window[]> {
    return this.windows.map((window) => ({ ...window }));
  }

  async getLastFocusedWindow(): Promise<chrome.windows.Window> {
    const focused = this.windows.find((window) => window.focused) ?? this.windows[0];
    if (!focused) throw new Error('No window');
    return { ...focused };
  }

  async createWindow(data: chrome.windows.CreateData): Promise<chrome.windows.Window> {
    const window = this.addWindow({ focused: data.focused ?? false });
    if (data.url) {
      const url = Array.isArray(data.url) ? data.url[0]! : data.url;
      window.tabId = this.addTab({ url, windowId: window.id }).id;
    }
    return { ...window };
  }

  async getTabGroups(): Promise<chrome.tabGroups.TabGroup[]> {
    return this.groups.map((group) => ({ ...group }));
  }

  setIdleDetectionInterval(seconds: number): void {
    this.detectionInterval = seconds;
  }

  async queryIdleState(): Promise<chrome.idle.IdleState> {
    return this.idleState;
  }

  async createAlarm(name: string, info: chrome.alarms.AlarmCreateInfo): Promise<void> {
    this.alarms.set(name, info);
  }

  async clearAlarm(name: string): Promise<void> {
    this.alarms.delete(name);
  }

  async restoreSession(sessionId: string): Promise<chrome.sessions.Session> {
    const session = this.restoredSessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    return session;
  }

  getURL(path: string): string {
    return `chrome-extension://fake/${path}`;
  }

  async openOptionsPage(): Promise<void> {}

  onIdleStateChanged(listener: (state: chrome.idle.IdleState) => void): Unsubscribe {
    return this.idleEmitter.add(listener);
  }

  onAlarm(listener: (alarm: chrome.alarms.Alarm) => void): Unsubscribe {
    return this.alarmEmitter.add(listener);
  }

  onInstalled(listener: () => void): Unsubscribe {
    return this.installedEmitter.add(listener);
  }

  onStartup(listener: () => void): Unsubscribe {
    return this.startupEmitter.add(listener);
  }

  onTabActivated(listener: (info: chrome.tabs.TabActiveInfo) => void): Unsubscribe {
    return this.activatedEmitter.add(listener);
  }

  onTabRemoved(listener: (tabId: number) => void): Unsubscribe {
    return this.removedEmitter.add(listener);
  }

  onWindowFocusChanged(listener: (windowId: number) => void): Unsubscribe {
    return this.focusEmitter.add(listener);
  }

  emitIdle(state: chrome.idle.IdleState): void {
    this.idleState = state;
    this.idleEmitter.emit(state);
  }

  emitAlarm(name: string): void {
    this.alarmEmitter.emit({ name, scheduledTime: 0 } as chrome.alarms.Alarm);
  }

  emitInstalled(): void {
    this.installedEmitter.emit();
  }

  emitStartup(): void {
    this.startupEmitter.emit();
  }

  emitTabActivated(tabId: number, windowId = 1): void {
    this.activatedEmitter.emit({ tabId, windowId });
  }

  emitWindowFocusChanged(windowId: number): void {
    this.focusEmitter.emit(windowId);
  }
}
```

- [ ] **Step 6: 运行测试与类型检查**

Run: `npx vitest run tests/integration/fake-browser.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/platform/browser.ts src/platform/chrome-browser.ts tests/integration/fake-browser.ts tests/integration/fake-browser.test.ts
git commit -m "feat: add browser abstraction and fake browser harness"
```
### Task 10: 后台服务基础（启动、状态、策略与设置）

**Files:**
- Create: `src/background/service.ts`
- Test: `tests/integration/service-foundation.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `createPresetStrategies`、`signatureOf`、`validateStrategy`；Task 5 的 `detectCapabilities`；Task 7 的 `Repo`；Task 9 的 `Browser`；Task 2 的 `AppError`、`ALARM_LOCKED`、`LIMITS`、`SCHEMA_VERSION`。
- Produces:
  - `ServiceDeps`：`{ browser, repo, now, id, userAgent }`
  - `TabDormancyService` 基础方法：`bootstrap`、`getState`、`getCapabilities`、`saveStrategy`、`activateStrategy`、`deleteStrategy`、`updateSettings`、`getBrowserSessionId`

- [ ] **Step 1: 写服务基础测试**

Create `tests/integration/service-foundation.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { FakeBrowser } from './fake-browser';
import { Repo } from '../../src/platform/storage';
import { TabDormancyService } from '../../src/background/service';
import { signatureOf } from '../../src/core/rules/signature';
import type { Expr } from '../../src/shared/types';

const now = 1_000_000;
const expression: Expr = {
  type: 'all',
  id: 'root',
  children: [{ type: 'condition', id: 'c', fact: 'lastActiveMinutes', op: 'gt', value: 60 }],
};

function setup(userAgent = 'Mozilla/5.0 Chrome/132.0.0.0') {
  const browser = new FakeBrowser();
  const repo = new Repo(browser.storageLocal, browser.storageSession, () => now);
  let counter = 0;
  const service = new TabDormancyService({
    browser,
    repo,
    now: () => now,
    id: () => `id-${counter++}`,
    userAgent: () => userAgent,
  });
  return { browser, repo, service };
}

describe('TabDormancyService foundation', () => {
  it('bootstraps settings, presets, browser session and idle interval', async () => {
    const { browser, repo, service } = setup();
    await service.bootstrap();
    const state = await service.getState();
    expect(state.strategies).toHaveLength(3);
    expect(state.activeStrategy.id).toBe('preset:standard');
    expect(state.settings.idleThresholdMinutes).toBe(15);
    expect(browser.detectionInterval).toBe(900);
    expect(await repo.getBrowserSessionId()).toBe('id-0');
  });

  it('requires a preview before activating a custom strategy', async () => {
    const { service } = setup();
    await service.bootstrap();
    const saved = await service.saveStrategy({
      id: '',
      name: '自定义',
      builtin: false,
      expression,
      createdAt: 0,
      updatedAt: 0,
      lastPreviewHash: null,
      lastPreviewAt: null,
    });

    await expect(service.activateStrategy(saved.id)).rejects.toMatchObject({ code: 'PREVIEW_REQUIRED' });

    const signature = await signatureOf(expression);
    const previewed = await service.saveStrategy({ ...saved, lastPreviewHash: signature }, signature);
    expect(previewed.lastPreviewHash).toBe(signature);
    await expect(service.activateStrategy(saved.id)).resolves.toBeUndefined();
    expect((await service.getState()).activeStrategy.id).toBe(saved.id);
  });

  it('rejects modifying built-ins and deleting the active strategy', async () => {
    const { service } = setup();
    await service.bootstrap();
    const state = await service.getState();
    const standard = state.strategies.find((strategy) => strategy.id === 'preset:standard')!;
    await expect(service.saveStrategy({ ...standard, name: '被改坏' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.deleteStrategy('preset:standard')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('validates and applies settings', async () => {
    const { browser, service } = setup();
    await service.bootstrap();
    const settings = await service.updateSettings({ idleThresholdMinutes: 30, lockDelayMinutes: 0 });
    expect(settings.idleThresholdMinutes).toBe(30);
    expect(browser.detectionInterval).toBe(1800);
    await expect(service.updateSettings({ idleThresholdMinutes: 0 })).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });
  });

  it('warns when the active strategy needs unavailable facts', async () => {
    const { service } = setup('Mozilla/5.0 Chrome/120.0.0.0');
    await service.bootstrap();
    const state = await service.getState();
    expect(state.warnings.join('')).toContain('lastActiveMinutes');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/integration/service-foundation.test.ts`

Expected: FAIL，`service.ts` 不存在。

- [ ] **Step 3: 实现服务基础**

Create `src/background/service.ts`:

```ts
import { ALARM_LOCKED, LIMITS, SCHEMA_VERSION } from '../shared/constants';
import { AppError } from '../shared/errors';
import type {
  Capabilities,
  CleanupPreview,
  Settings,
  SettingsPatch,
  StateSnapshot,
  Strategy,
} from '../shared/types';
import { detectCapabilities } from '../core/capabilities';
import { createPresetStrategies } from '../core/rules/presets';
import { signatureOf } from '../core/rules/signature';
import { validateStrategy } from '../core/rules/validate';
import { requireStrategy, unsupportedFacts } from '../core/strategies';
import type { Browser } from '../platform/browser';
import type { Repo } from '../platform/storage';

export type ServiceDeps = {
  browser: Browser;
  repo: Repo;
  now: () => number;
  id: () => string;
  userAgent: () => string;
};

export class TabDormancyService {
  private bootstrapPromise: Promise<void> | null = null;
  private capabilities: Capabilities | null = null;

  constructor(protected readonly deps: ServiceDeps) {}

  async bootstrap(): Promise<void> {
    if (!this.bootstrapPromise) {
      this.bootstrapPromise = this.doBootstrap().catch((error) => {
        this.bootstrapPromise = null;
        throw error;
      });
    }
    return this.bootstrapPromise;
  }

  protected async doBootstrap(): Promise<void> {
    const repo = this.deps.repo;
    const now = this.deps.now();
    const meta = await repo.getMeta();
    if (!meta) await repo.setMeta({ schemaVersion: SCHEMA_VERSION, installedAt: now });

    let settings = await repo.getSettings();
    let strategies = await repo.getStrategies();
    if (strategies.length === 0) {
      strategies = createPresetStrategies(now);
      await repo.setStrategies(strategies);
    }
    if (!strategies.some((strategy) => strategy.id === settings.activeStrategyId)) {
      const fallback = strategies.find((strategy) => strategy.id === 'preset:standard') ?? strategies[0]!;
      settings = { ...settings, activeStrategyId: fallback.id };
      await repo.setSettings(settings);
    }

    await this.getBrowserSessionId();
    await this.deps.browser.setIdleDetectionInterval(settings.idleThresholdMinutes * 60);
  }

  async getCapabilities(): Promise<Capabilities> {
    if (this.capabilities) return this.capabilities;
    const tabs = await this.deps.browser.queryTabs();
    this.capabilities = detectCapabilities({
      userAgent: this.deps.userAgent(),
      sampleTab: tabs[0],
      hasTabGroups: true,
      hasSessions: true,
    });
    return this.capabilities;
  }

  async getBrowserSessionId(): Promise<string> {
    const existing = await this.deps.repo.getBrowserSessionId();
    if (existing) return existing;
    const id = this.deps.id();
    await this.deps.repo.setBrowserSessionId(id);
    return id;
  }

  protected async activeStrategy(): Promise<{ settings: Settings; strategies: Strategy[]; active: Strategy; caps: Capabilities }> {
    const settings = await this.deps.repo.getSettings();
    const strategies = await this.deps.repo.getStrategies();
    const active = requireStrategy(strategies, settings.activeStrategyId);
    const caps = await this.getCapabilities();
    return { settings, strategies, active, caps };
  }

  protected assertUsable(strategy: Strategy, caps: Capabilities): void {
    const missing = unsupportedFacts(strategy.expression, caps);
    if (missing.length > 0) {
      throw new AppError('UNSUPPORTED_FACT', `当前浏览器不支持策略中的事实：${missing.join('、')}`);
    }
  }

  async getState(): Promise<StateSnapshot> {
    await this.bootstrap();
    const { active, caps, settings, strategies } = await this.activeStrategy();
    const warnings: string[] = [];
    const missing = unsupportedFacts(active.expression, caps);
    if (missing.length > 0) {
      warnings.push(`当前浏览器不支持策略中的事实：${missing.join('、')}；自动清理已暂停。`);
    }
    if (!active.builtin && active.lastPreviewHash === null) {
      warnings.push('该策略尚未预览，自动清理不会执行。');
    }
    return {
      settings,
      strategies,
      activeStrategy: active,
      lastCleanup: await this.deps.repo.getLastCleanup(),
      capabilities: caps,
      warnings,
    };
  }

  async saveStrategy(input: Strategy, previewSignature?: string): Promise<Strategy> {
    await this.bootstrap();
    const caps = await this.getCapabilities();
    const validation = validateStrategy(input, caps);
    if (!validation.valid) {
      throw new AppError('INVALID_EXPRESSION', validation.issues[0]?.message ?? '规则无效');
    }

    const strategies = await this.deps.repo.getStrategies();
    const existing = strategies.find((strategy) => strategy.id === input.id);
    if (existing?.builtin) throw new AppError('FORBIDDEN', '内置策略不可修改');

    const now = this.deps.now();
    const expected = await signatureOf(input.expression);
    const lastPreviewHash = previewSignature === expected ? expected : null;
    const strategy: Strategy = existing
      ? {
          ...existing,
          name: input.name.trim(),
          expression: input.expression,
          updatedAt: now,
          lastPreviewHash,
          lastPreviewAt: lastPreviewHash ? now : null,
        }
      : {
          id: this.deps.id(),
          name: input.name.trim(),
          builtin: false,
          expression: input.expression,
          createdAt: now,
          updatedAt: now,
          lastPreviewHash,
          lastPreviewAt: lastPreviewHash ? now : null,
        };

    const next = existing
      ? strategies.map((item) => (item.id === existing.id ? strategy : item))
      : [...strategies, strategy];
    await this.deps.repo.setStrategies(next);
    return strategy;
  }

  async activateStrategy(id: string): Promise<void> {
    await this.bootstrap();
    const strategies = await this.deps.repo.getStrategies();
    const strategy = requireStrategy(strategies, id);
    const caps = await this.getCapabilities();
    const validation = validateStrategy(strategy, caps);
    if (!validation.valid) {
      throw new AppError('INVALID_EXPRESSION', validation.issues[0]?.message ?? '策略无效');
    }
    this.assertUsable(strategy, caps);
    if (!strategy.builtin) {
      const expected = await signatureOf(strategy.expression);
      if (strategy.lastPreviewHash !== expected) {
        throw new AppError('PREVIEW_REQUIRED', '请先预览该策略，再启用');
      }
    }
    const settings = await this.deps.repo.getSettings();
    await this.deps.repo.setSettings({ ...settings, activeStrategyId: id });
  }

  async deleteStrategy(id: string): Promise<void> {
    await this.bootstrap();
    const strategies = await this.deps.repo.getStrategies();
    const strategy = requireStrategy(strategies, id);
    if (strategy.builtin) throw new AppError('FORBIDDEN', '内置策略不可删除');
    const settings = await this.deps.repo.getSettings();
    if (settings.activeStrategyId === id) throw new AppError('FORBIDDEN', '不能删除当前启用的策略');
    if (strategies.length <= 1) throw new AppError('FORBIDDEN', '至少保留一个策略');
    await this.deps.repo.setStrategies(strategies.filter((item) => item.id !== id));
  }

  async updateSettings(patch: SettingsPatch): Promise<Settings> {
    await this.bootstrap();
    const current = await this.deps.repo.getSettings();
    const next: Settings = { ...current, ...patch };
    if (!Number.isInteger(next.idleThresholdMinutes) || next.idleThresholdMinutes < 1 || next.idleThresholdMinutes > 1_440) {
      throw new AppError('INVALID_SETTINGS', '空闲阈值需为 1–1440 分钟');
    }
    if (!Number.isInteger(next.lockDelayMinutes) || next.lockDelayMinutes < 0 || next.lockDelayMinutes > 1_440) {
      throw new AppError('INVALID_SETTINGS', '锁屏延迟需为 0–1440 分钟');
    }
    if (!Number.isInteger(next.historyRetentionDays) || next.historyRetentionDays < 1 || next.historyRetentionDays > 365) {
      throw new AppError('INVALID_SETTINGS', '历史保留需为 1–365 天');
    }
    if (typeof next.lockCleanupEnabled !== 'boolean') {
      throw new AppError('INVALID_SETTINGS', '锁屏清理设置无效');
    }
    await this.deps.repo.setSettings(next);
    await this.deps.browser.setIdleDetectionInterval(next.idleThresholdMinutes * 60);
    if (!next.lockCleanupEnabled) await this.deps.browser.clearAlarm(ALARM_LOCKED);
    return next;
  }

}
```

- [ ] **Step 4: 运行测试与类型检查**

Run: `npx vitest run tests/integration/service-foundation.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/background/service.ts tests/integration/service-foundation.test.ts
git commit -m "feat: add background service foundation"
```

---

### Task 11: 清理流水线（锁、写前历史、执行与启动收敛）

**Files:**
- Modify: `src/background/service.ts`
- Test: `tests/integration/cleanup.test.ts`、`tests/integration/converge.test.ts`

**Interfaces:**
- Consumes: Task 6 的 `planCleanup`、`revalidatePlannedTab`；Task 8 的 `buildClosedRecords`、`toSummary`；Task 7 的 `selectExpired`；Task 2 的 `runWithConcurrency`、`LIMITS`。
- Produces:
  - `previewCleanup(): Promise<CleanupPreview>`
  - `listTabs(): Promise<TabListItem[]>`
  - `runCleanup(trigger): Promise<CleanupResult>`
  - `convergePendingRun(): Promise<void>`、`pruneHistory(): Promise<void>`

- [ ] **Step 1: 写清理与收敛测试**

Create `tests/integration/cleanup.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { FakeBrowser } from './fake-browser';
import { Repo } from '../../src/platform/storage';
import { TabDormancyService } from '../../src/background/service';

const now = 1_000_000_000;
const minute = 60_000;

function setup() {
  const browser = new FakeBrowser();
  const repo = new Repo(browser.storageLocal, browser.storageSession, () => now);
  let counter = 0;
  const service = new TabDormancyService({
    browser,
    repo,
    now: () => now,
    id: () => `id-${counter++}`,
    userAgent: () => 'Mozilla/5.0 Chrome/132.0.0.0',
  });
  return { browser, repo, service };
}

async function seedTabs(browser: FakeBrowser) {
  const old = browser.addTab({ url: 'https://example.com/old', lastAccessed: now - 5_000 * minute });
  const recent = browser.addTab({ url: 'https://example.com/recent', lastAccessed: now - 10 * minute });
  return { old, recent };
}

describe('cleanup pipeline', () => {
  it('writes history before closing and clears the lock', async () => {
    const { browser, repo, service } = setup();
    await service.bootstrap();
    const { old, recent } = await seedTabs(browser);

    const result = await service.runCleanup('manual');
    expect(result.closed).toBe(1);
    expect(await browser.getTab(old.id!)).toBeNull();
    expect(await browser.getTab(recent.id!)).not.toBeNull();

    const index = await repo.getHistoryIndex();
    expect(index).toHaveLength(1);
    expect(index[0]?.status).toBe('closed');
    expect(await repo.getCleanupLock()).toBeNull();
    expect(await repo.getCleanupRun()).toBeNull();
    expect((await repo.getLastCleanup())?.closed).toBe(1);
  });

  it('closes nothing when history cannot be written', async () => {
    const { browser, repo, service } = setup();
    await service.bootstrap();
    const { old } = await seedTabs(browser);
    vi.spyOn(repo, 'setHistoryIndex').mockRejectedValueOnce(new Error('disk full'));

    await expect(service.runCleanup('manual')).rejects.toMatchObject({ code: 'STORAGE_FAILED' });
    expect(await browser.getTab(old.id!)).not.toBeNull();
  });

  it('skips a tab whose url changed after planning', async () => {
    const { browser, service } = setup();
    await service.bootstrap();
    const { old } = await seedTabs(browser);
    const original = browser.getTab.bind(browser);
    vi.spyOn(browser, 'getTab').mockImplementation(async (tabId: number) => {
      const tab = await original(tabId);
      return tab && tab.id === old.id ? { ...tab, url: 'https://example.com/changed' } : tab;
    });

    const result = await service.runCleanup('manual');
    expect(result.skipped).toBe(1);
    expect(await browser.getTab(old.id!)).not.toBeNull();
  });

  it('reports a removal failure and still closes other tabs', async () => {
    const { browser, service } = setup();
    await service.bootstrap();
    browser.addTab({ url: 'https://example.com/recent', lastAccessed: now - 10 * minute });
    const first = browser.addTab({ url: 'https://example.com/1', lastAccessed: now - 5_000 * minute });
    const second = browser.addTab({ url: 'https://example.com/2', lastAccessed: now - 5_001 * minute });
    vi.spyOn(browser, 'removeTab').mockImplementation(async (tabId: number) => {
      if (tabId === first.id) throw new Error('cannot close');
      browser.tabs = browser.tabs.filter((tab) => tab.id !== tabId);
    });

    const result = await service.runCleanup('manual');
    expect(result.closed).toBe(1);
    expect(result.failed).toBe(1);
    expect(await browser.getTab(first.id!)).not.toBeNull();
    expect(await browser.getTab(second.id!)).toBeNull();
  });
});
```

Create `tests/integration/converge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FakeBrowser } from './fake-browser';
import { Repo } from '../../src/platform/storage';
import { TabDormancyService } from '../../src/background/service';
import type { ClosedTabRecord } from '../../src/shared/types';

const now = 1_000_000;

function record(id: string, url: string): ClosedTabRecord {
  return {
    id,
    url,
    title: url,
    domain: 'example.com',
    closedAt: now,
    trigger: 'idle',
    status: 'pending',
    restoredAt: null,
    strategyId: 'preset:standard',
    strategyName: '标准',
    browserSessionId: 's1',
    windowId: 1,
    groupId: -1,
    groupTitle: '',
    groupColor: '',
    groupCollapsed: false,
    pinned: false,
    index: 0,
    sessionId: null,
    recovered: false,
  };
}

describe('pending run convergence', () => {
  it('marks missing tabs as closed and removes still-open drafts', async () => {
    const browser = new FakeBrowser();
    const repo = new Repo(browser.storageLocal, browser.storageSession, () => now);
    const service = new TabDormancyService({
      browser,
      repo,
      now: () => now,
      id: () => 'id',
      userAgent: () => 'Mozilla/5.0 Chrome/132.0.0.0',
    });
    await service.bootstrap();
    const stillOpen = record('open', 'https://example.com/open');
    const closed = record('closed', 'https://example.com/closed');
    browser.addTab({ url: stillOpen.url, lastAccessed: now });
    await repo.setBrowserSessionId('s1');
    await repo.setHistoryIndex([stillOpen, closed]);
    await repo.setHistoryRecords([stillOpen, closed]);
    await repo.setCleanupRun({
      id: 'run',
      startedAt: now,
      trigger: 'idle',
      strategyId: 'preset:standard',
      browserSessionId: 's1',
      drafts: [stillOpen, closed],
    });

    await service.convergePendingRun();

    const index = await repo.getHistoryIndex();
    expect(index.map((item) => [item.id, item.status])).toEqual([['closed', 'closed']]);
    expect(await repo.getCleanupRun()).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/integration/cleanup.test.ts tests/integration/converge.test.ts`

Expected: FAIL，`runCleanup` 等方法不存在。

- [ ] **Step 3: 在 service 中追加清理流水线**

在 `src/background/service.ts` 增加 imports：

```ts
import { runWithConcurrency } from '../shared/async';
import { buildFacts, managedTabs } from '../core/facts';
import { planCleanup, revalidatePlannedTab } from '../core/cleaner';
import { buildClosedRecords, toSummary } from '../core/history';
import { evaluateStrategy } from '../core/rules/evaluate';
import { selectExpired } from '../core/retention';
import type { CleanupResult, ClosedTabRecord, TabListItem, Trigger } from '../shared/types';
```

在 `doBootstrap` 末尾追加：

```ts
await this.convergePendingRun();
await this.pruneHistory();
```

在类中增加：

```ts
private running = false;

async previewCleanup(): Promise<CleanupPreview> {
  await this.bootstrap();
  const { active, caps } = await this.activeStrategy();
  this.assertUsable(active, caps);
  const [tabs, windows, groups] = await Promise.all([
    this.deps.browser.queryTabs(),
    this.deps.browser.getWindows(),
    this.deps.browser.getTabGroups(),
  ]);
  const plan = planCleanup({ tabs, windows, groups, strategy: active, capabilities: caps, now: this.deps.now() });
  return {
    matched: plan.matched.length,
    sample: plan.matched.slice(0, 5).map((tab) => ({ tabId: tab.tabId, title: tab.title, url: tab.url, trace: tab.trace })),
    totalManagedTabs: plan.totalManagedTabs,
    strategyName: active.name,
  };
}

async listTabs(): Promise<TabListItem[]> {
  await this.bootstrap();
  const { active, caps } = await this.activeStrategy();
  const [tabs, windows, groups] = await Promise.all([
    this.deps.browser.queryTabs(),
    this.deps.browser.getWindows(),
    this.deps.browser.getTabGroups(),
  ]);
  const facts = buildFacts({ tabs, windows, groups, now: this.deps.now() });
  const disabled = unsupportedFacts(active.expression, caps).length > 0;
  return managedTabs({ tabs, windows }).flatMap((tab) => {
    const fact = facts.get(tab.id as number);
    if (!fact) return [];
    const evaluation = disabled ? { matched: false, trace: [] } : evaluateStrategy(active, fact, caps);
    return [{ tab, facts: fact, matched: evaluation.matched, trace: evaluation.trace }];
  });
}

async runCleanup(trigger: Trigger): Promise<CleanupResult> {
  await this.bootstrap();
  if (this.running) throw new AppError('BUSY', '已有清理任务正在运行');
  this.running = true;
  const runId = this.deps.id();
  const startedAt = this.deps.now();

  try {
    if (!(await this.acquireLock(runId))) throw new AppError('BUSY', '已有清理任务正在运行');
    const { active, caps } = await this.activeStrategy();
    this.assertUsable(active, caps);

    const [tabs, windows, groups] = await Promise.all([
      this.deps.browser.queryTabs(),
      this.deps.browser.getWindows(),
      this.deps.browser.getTabGroups(),
    ]);
    const plan = planCleanup({ tabs, windows, groups, strategy: active, capabilities: caps, now: this.deps.now() });

    if (plan.matched.length === 0) {
      const result: CleanupResult = {
        runId,
        trigger,
        closed: 0,
        failed: 0,
        skipped: 0,
        durationMs: this.deps.now() - startedAt,
        recordIds: [],
        failures: [],
      };
      await this.deps.repo.setLastCleanup({
        at: startedAt,
        trigger,
        closed: 0,
        failed: 0,
        skipped: 0,
        durationMs: result.durationMs,
        recordIds: [],
      });
      return result;
    }

    const browserSessionId = await this.getBrowserSessionId();
    const records = buildClosedRecords(plan, {
      trigger,
      strategy: active,
      browserSessionId,
      now: this.deps.now(),
      ids: () => this.deps.id(),
    });

    const previousIndex = await this.deps.repo.getHistoryIndex();
    try {
      await this.deps.repo.setHistoryIndex([...records.map(toSummary), ...previousIndex]);
      await this.deps.repo.setHistoryRecords(records);
      await this.deps.repo.setCleanupRun({
        id: runId,
        startedAt,
        trigger,
        strategyId: active.id,
        browserSessionId,
        drafts: records,
      });
    } catch {
      await this.deps.repo.setHistoryIndex(previousIndex).catch(() => undefined);
      await this.deps.repo.deleteHistoryRecords(records.map((record) => record.id)).catch(() => undefined);
      await this.deps.repo.clearCleanupRun().catch(() => undefined);
      throw new AppError('STORAGE_FAILED', '无法写入关闭历史，已取消清理');
    }

    const recordByTab = new Map<number, ClosedTabRecord>();
    plan.matched.forEach((tab, index) => {
      const record = records[index];
      if (record) recordByTab.set(tab.tabId, record);
    });

    const successes: ClosedTabRecord[] = [];
    const failedRecords: ClosedTabRecord[] = [];
    const failures: CleanupResult['failures'] = [];

    await runWithConcurrency(plan.matched, LIMITS.cleanupConcurrency, async (planned) => {
      const record = recordByTab.get(planned.tabId);
      if (!record) return;
      const current = await this.deps.browser.getTab(planned.tabId);
      if (current && !revalidatePlannedTab(planned, current)) {
        failures.push({ tabId: planned.tabId, title: planned.title, reason: 'tab-changed' });
        failedRecords.push(record);
        return;
      }
      try {
        if (current) await this.deps.browser.removeTab(planned.tabId);
        successes.push({ ...record, status: 'closed' });
      } catch (error) {
        if (isNoSuchTabError(error)) {
          successes.push({ ...record, status: 'closed' });
        } else {
          failures.push({
            tabId: planned.tabId,
            title: planned.title,
            reason: error instanceof Error ? error.message : 'unknown',
          });
          failedRecords.push(record);
        }
      }
    });

    const successIds = new Set(successes.map((record) => record.id));
    const failedIds = new Set(failedRecords.map((record) => record.id));
    const index = await this.deps.repo.getHistoryIndex();
    const updated = index
      .filter((item) => !failedIds.has(item.id))
      .map((item) => (successIds.has(item.id) ? { ...item, status: 'closed' as const } : item));
    await this.deps.repo.setHistoryIndex(updated);
    await this.deps.repo.setHistoryRecords(successes);
    await this.deps.repo.deleteHistoryRecords([...failedIds]);

    const skipped = failures.filter((failure) => failure.reason === 'tab-changed').length;
    const failed = failures.length - skipped;
    const result: CleanupResult = {
      runId,
      trigger,
      closed: successes.length,
      failed,
      skipped,
      durationMs: this.deps.now() - startedAt,
      recordIds: successes.map((record) => record.id),
      failures,
    };
    await this.deps.repo.setLastCleanup({
      at: startedAt,
      trigger,
      closed: result.closed,
      failed: result.failed,
      skipped: result.skipped,
      durationMs: result.durationMs,
      recordIds: result.recordIds,
    });
    await this.deps.repo.clearCleanupRun();
    await this.pruneHistory();
    return result;
  } finally {
    this.running = false;
    await this.releaseLock(runId);
  }
}

async convergePendingRun(): Promise<void> {
  const run = await this.deps.repo.getCleanupRun();
  if (!run) return;
  const index = await this.deps.repo.getHistoryIndex();
  const sessionId = await this.deps.repo.getBrowserSessionId();

  if (run.browserSessionId !== sessionId) {
    const ids = new Set(run.drafts.map((draft) => draft.id));
    await this.deps.repo.deleteHistoryRecords([...ids]);
    await this.deps.repo.setHistoryIndex(index.filter((item) => !ids.has(item.id)));
    await this.deps.repo.clearCleanupRun();
    return;
  }

  const tabs = await this.deps.browser.queryTabs();
  const removed = new Set<string>();
  const closed = new Set<string>();
  for (const draft of run.drafts) {
    const stillOpen = tabs.some((tab) => tab.windowId === draft.windowId && (tab.url ?? tab.pendingUrl ?? '') === draft.url);
    if (stillOpen) removed.add(draft.id);
    else closed.add(draft.id);
  }

  await this.deps.repo.deleteHistoryRecords([...removed]);
  await this.deps.repo.setHistoryRecords(
    run.drafts.filter((draft) => closed.has(draft.id)).map((draft) => ({ ...draft, status: 'closed' as const, recovered: true })),
  );
  await this.deps.repo.setHistoryIndex(
    index
      .filter((item) => !removed.has(item.id))
      .map((item) => (closed.has(item.id) ? { ...item, status: 'closed' as const } : item)),
  );
  await this.deps.repo.clearCleanupRun();
}

async pruneHistory(): Promise<void> {
  const settings = await this.deps.repo.getSettings();
  const index = await this.deps.repo.getHistoryIndex();
  const { kept, removedIds } = selectExpired(index, this.deps.now(), settings.historyRetentionDays, LIMITS.maxHistory);
  if (removedIds.length === 0) return;
  await this.deps.repo.deleteHistoryRecords(removedIds);
  await this.deps.repo.setHistoryIndex(kept);
}

private async acquireLock(runId: string): Promise<boolean> {
  const existing = await this.deps.repo.getCleanupLock();
  if (existing && this.deps.now() - existing.startedAt < LIMITS.lockStaleMs) return false;
  await this.deps.repo.setCleanupLock({ runId, startedAt: this.deps.now() });
  return true;
}

private async releaseLock(runId: string): Promise<void> {
  const existing = await this.deps.repo.getCleanupLock();
  if (existing?.runId === runId) await this.deps.repo.clearCleanupLock();
}

function isNoSuchTabError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No tab with id|Invalid tab ID|No tab with/i.test(message);
}
```

- [ ] **Step 4: 运行集成测试**

Run: `npx vitest run tests/integration/cleanup.test.ts tests/integration/converge.test.ts`

Expected: PASS。若 `removeTab` 的 spy 没有触发 `onTabRemoved`，不影响这些测试。

- [ ] **Step 5: 类型检查并提交**

Run: `npm run typecheck`

Expected: PASS。

```bash
git add src/background/service.ts tests/integration/cleanup.test.ts tests/integration/converge.test.ts
git commit -m "feat: add write-ahead cleanup pipeline and convergence"
```
### Task 12: 历史查询、恢复、删除与清空

**Files:**
- Modify: `src/background/service.ts`
- Test: `tests/integration/history-service.test.ts`

**Interfaces:**
- Consumes: Task 8 的 `planRestore`、`markRestored`；Task 7 的 `Repo`；Task 9 的 `Browser`。
- Produces:
  - `queryHistory(query): Promise<HistoryQueryResult>`
  - `restoreHistory(ids, options): Promise<RestoreResult>`
  - `deleteHistory(ids): Promise<void>`
  - `clearHistory(): Promise<void>`

- [ ] **Step 1: 写历史服务测试**

Create `tests/integration/history-service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { FakeBrowser } from './fake-browser';
import { Repo } from '../../src/platform/storage';
import { TabDormancyService } from '../../src/background/service';
import type { ClosedTabRecord } from '../../src/shared/types';

const now = 1_000_000;

function record(id: string, partial: Partial<ClosedTabRecord> = {}): ClosedTabRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Title ${id}`,
    domain: 'example.com',
    closedAt: now,
    trigger: 'idle',
    status: 'closed',
    restoredAt: null,
    strategyId: 'preset:standard',
    strategyName: '标准',
    browserSessionId: 's1',
    windowId: 10,
    groupId: -1,
    groupTitle: '',
    groupColor: '',
    groupCollapsed: false,
    pinned: false,
    index: 0,
    sessionId: null,
    recovered: false,
    ...partial,
  };
}

async function setup(records: ClosedTabRecord[]) {
  const browser = new FakeBrowser();
  const repo = new Repo(browser.storageLocal, browser.storageSession, () => now);
  const service = new TabDormancyService({
    browser,
    repo,
    now: () => now,
    id: () => 'id',
    userAgent: () => 'Mozilla/5.0 Chrome/132.0.0.0',
  });
  await service.bootstrap();
  await repo.setBrowserSessionId('s1');
  await repo.setHistoryIndex(records.map(({ id, url, title, domain, closedAt, trigger, status, restoredAt }) => ({ id, url, title, domain, closedAt, trigger, status, restoredAt })));
  await repo.setHistoryRecords(records);
  return { browser, repo, service };
}

describe('history service', () => {
  it('searches, filters and paginates history', async () => {
    const { service } = await setup([
      record('a', { title: 'Alpha' }),
      record('b', { title: 'Beta', trigger: 'manual', restoredAt: 1 }),
      record('c', { title: 'Alpha two', closedAt: now - 100 }),
    ]);

    expect((await service.queryHistory({ query: 'alpha', page: 1, pageSize: 50 })).total).toBe(2);
    expect((await service.queryHistory({ trigger: 'manual', page: 1, pageSize: 50 })).items[0]?.id).toBe('b');
    expect((await service.queryHistory({ restored: false, page: 1, pageSize: 50 })).total).toBe(2);
    const page = await service.queryHistory({ page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(1);
    expect(page.page).toBe(2);
  });

  it('restores tabs into the current window and marks them restored', async () => {
    const { browser, repo, service } = await setup([record('a'), record('b')]);
    const result = await service.restoreHistory(['a', 'b'], { mode: 'current-window', complete: false });
    expect(result.restored).toBe(2);
    expect((await browser.queryTabs()).some((tab) => tab.url === 'https://example.com/a')).toBe(true);
    const index = await repo.getHistoryIndex();
    expect(index.every((item) => item.restoredAt === now)).toBe(true);
  });

  it('recreates original windows and groups', async () => {
    const { browser, service } = await setup([
      record('a', { groupId: 7, groupTitle: '工作', groupColor: 'blue' }),
      record('b', { groupId: 7, groupTitle: '工作', groupColor: 'blue' }),
    ]);
    const result = await service.restoreHistory(['a', 'b'], { mode: 'original-window-groups', complete: false });
    expect(result.restored).toBe(2);
    expect(browser.windows.length).toBe(2);
    expect((await browser.getTabGroups())[0]?.title).toBe('工作');
  });

  it('uses sessions.restore when complete is requested and falls back on failure', async () => {
    const { browser, service } = await setup([record('a', { sessionId: 'session-1' }), record('b', { sessionId: 'bad' })]);
    browser.restoredSessions.set('session-1', {
      tab: { id: 99, url: 'https://example.com/a', windowId: 1 } as chrome.tabs.Tab,
    } as chrome.sessions.Session);
    const spy = vi.spyOn(browser, 'restoreSession');
    const result = await service.restoreHistory(['a', 'b'], { mode: 'current-window', complete: true });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.restored).toBe(2);
    expect((await browser.queryTabs()).some((tab) => tab.url === 'https://example.com/b')).toBe(true);
  });

  it('deletes and clears history', async () => {
    const { repo, service } = await setup([record('a'), record('b')]);
    await service.deleteHistory(['a']);
    expect((await repo.getHistoryIndex()).map((item) => item.id)).toEqual(['b']);
    await service.clearHistory();
    expect(await repo.getHistoryIndex()).toEqual([]);
    expect(await repo.getHistoryRecords(['b'])).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/integration/history-service.test.ts`

Expected: FAIL，方法不存在。

- [ ] **Step 3: 在 service 中追加历史方法**

在 imports 增加：

```ts
import { markRestored, planRestore } from '../core/history';
import type { HistoryQuery, HistoryQueryResult, RestoreOptions, RestoreResult } from '../shared/types';
```

在类中增加：

```ts
async queryHistory(query: HistoryQuery): Promise<HistoryQueryResult> {
  await this.bootstrap();
  const index = await this.deps.repo.getHistoryIndex();
  const search = (query.query ?? '').trim().toLowerCase();
  const filtered = index.filter((item) => {
    if (item.status !== 'closed') return false;
    if (query.trigger && item.trigger !== query.trigger) return false;
    if (query.restored === true && item.restoredAt === null) return false;
    if (query.restored === false && item.restoredAt !== null) return false;
    if (!search) return true;
    return [item.url, item.title, item.domain].some((value) => value.toLowerCase().includes(search));
  });

  const pageSize = Math.max(1, Math.min(query.pageSize || 50, 200));
  const page = Math.max(1, query.page || 1);
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}

async restoreHistory(ids: string[], options: RestoreOptions): Promise<RestoreResult> {
  await this.bootstrap();
  const records = await this.deps.repo.getHistoryRecords(ids);
  if (records.length === 0) return { restored: 0, failed: [] };

  const currentWindow = await this.deps.browser.getLastFocusedWindow();
  const currentWindowId = currentWindow.id ?? 1;
  const groups = planRestore(records, options, currentWindowId);
  const restored = new Map<string, number>();
  const failed: RestoreResult['failed'] = [];

  for (const group of groups) {
    let windowId: number | undefined = group.windowId === 'new' ? undefined : group.windowId;
    if (group.windowId === 'new') {
      const first = group.records[0];
      if (!first) continue;
      try {
        const created = await this.deps.browser.createWindow({ url: first.url, focused: false });
        windowId = created.id;
        const createdTabId = created.tabs?.[0]?.id ?? created.tabId;
        if (createdTabId !== undefined) restored.set(first.id, createdTabId);
      } catch (error) {
        failed.push({ id: first.id, url: first.url, reason: error instanceof Error ? error.message : '无法创建窗口' });
        continue;
      }
    }

    for (const item of group.records) {
      if (restored.has(item.id)) continue;
      try {
        const tab = await this.restoreOne(item, options, windowId);
        if (tab?.id !== undefined) restored.set(item.id, tab.id);
      } catch (error) {
        failed.push({ id: item.id, url: item.url, reason: error instanceof Error ? error.message : '恢复失败' });
      }
    }

    if (windowId === undefined) continue;
    for (const tabGroup of group.groups) {
      const tabIds = tabGroup.records.map((item) => restored.get(item.id)).filter((id): id is number => typeof id === 'number');
      if (tabIds.length === 0) continue;
      try {
        const groupId = await this.deps.browser.groupTabs(tabIds, { windowId });
        const properties: chrome.tabGroups.UpdateProperties = {
          title: tabGroup.groupTitle,
          collapsed: tabGroup.groupCollapsed,
        };
        if (tabGroup.groupColor) properties.color = tabGroup.groupColor as chrome.tabGroups.Color;
        await this.deps.browser.updateTabGroup(groupId, properties);
      } catch (error) {
        failed.push({
          id: tabGroup.records[0]?.id ?? tabGroup.key,
          url: tabGroup.records[0]?.url ?? '',
          reason: error instanceof Error ? error.message : '无法重建标签组',
        });
      }
    }
  }

  const restoredIds = [...restored.keys()];
  const index = await this.deps.repo.getHistoryIndex();
  await this.deps.repo.setHistoryIndex(markRestored(index, restoredIds, this.deps.now()));
  await this.deps.repo.setHistoryRecords(
    records
      .filter((item) => restored.has(item.id))
      .map((item) => ({ ...item, restoredAt: this.deps.now() })),
  );
  return { restored: restoredIds.length, failed };
}

async deleteHistory(ids: string[]): Promise<void> {
  await this.bootstrap();
  const index = await this.deps.repo.getHistoryIndex();
  const set = new Set(ids);
  await this.deps.repo.deleteHistoryRecords(ids);
  await this.deps.repo.setHistoryIndex(index.filter((item) => !set.has(item.id)));
}

async clearHistory(): Promise<void> {
  await this.bootstrap();
  const index = await this.deps.repo.getHistoryIndex();
  await this.deps.repo.deleteHistoryRecords(index.map((item) => item.id));
  await this.deps.repo.setHistoryIndex([]);
}

private async restoreOne(
  record: ClosedTabRecord,
  options: RestoreOptions,
  windowId: number | undefined,
): Promise<chrome.tabs.Tab | undefined> {
  if (options.complete && record.sessionId) {
    try {
      const session = await this.deps.browser.restoreSession(record.sessionId);
      if (session.tab) return session.tab;
    } catch {
      // fall through to normal tab creation
    }
  }
  return this.deps.browser.createTab({
    url: record.url,
    active: false,
    pinned: record.pinned,
    ...(windowId !== undefined ? { windowId } : {}),
  });
}
```

- [ ] **Step 4: 运行历史服务测试**

Run: `npx vitest run tests/integration/history-service.test.ts`

Expected: PASS。

- [ ] **Step 5: 类型检查并提交**

Run: `npm run typecheck`

Expected: PASS。

```bash
git add src/background/service.ts tests/integration/history-service.test.ts
git commit -m "feat: add history query restore and deletion"
```

---

### Task 13: 空闲/锁屏触发与后台入口

**Files:**
- Modify: `src/background/service.ts`
- Create: `src/background/triggers.ts`
- Modify: `src/background/index.ts`
- Test: `tests/integration/triggers.test.ts`

**Interfaces:**
- Consumes: Task 9 的 `Browser`；Task 10–12 的 `TabDormancyService`；Task 2 的 `ALARM_LOCKED`。
- Produces:
  - `service.onLocked()`、`service.onActive()`、`service.onLockAlarm()`
  - `registerTriggers(browser, service): void`

- [ ] **Step 1: 写触发测试**

Create `tests/integration/triggers.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { FakeBrowser } from './fake-browser';
import { Repo } from '../../src/platform/storage';
import { TabDormancyService } from '../../src/background/service';
import { registerTriggers } from '../../src/background/triggers';
import { ALARM_LOCKED } from '../../src/shared/constants';

const now = 1_000_000_000;
const minute = 60_000;

async function setup() {
  const browser = new FakeBrowser();
  const repo = new Repo(browser.storageLocal, browser.storageSession, () => now);
  const service = new TabDormancyService({
    browser,
    repo,
    now: () => now,
    id: () => `id-${Math.random()}`,
    userAgent: () => 'Mozilla/5.0 Chrome/132.0.0.0',
  });
  await service.bootstrap();
  registerTriggers(browser, service);
  return { browser, service };
}

function oldTab(browser: FakeBrowser) {
  browser.addTab({ url: 'https://example.com/recent', lastAccessed: now - 10 * minute });
  return browser.addTab({ url: 'https://example.com/old', lastAccessed: now - 5_000 * minute });
}

describe('triggers', () => {
  it('runs cleanup immediately on idle', async () => {
    const { browser } = await setup();
    const tab = oldTab(browser);
    browser.emitIdle('idle');
    await vi.waitFor(async () => {
      expect(await browser.getTab(tab.id!)).toBeNull();
    });
  });

  it('schedules a one-shot lock alarm and cancels it on active', async () => {
    const { browser } = await setup();
    browser.emitIdle('locked');
    await vi.waitFor(() => expect(browser.alarms.has(ALARM_LOCKED)).toBe(true));
    browser.emitIdle('active');
    await vi.waitFor(() => expect(browser.alarms.has(ALARM_LOCKED)).toBe(false));
  });

  it('runs cleanup on the lock alarm only while still idle or locked', async () => {
    const { browser } = await setup();
    const tab = oldTab(browser);
    browser.emitIdle('locked');
    await vi.waitFor(() => expect(browser.alarms.has(ALARM_LOCKED)).toBe(true));
    browser.emitAlarm(ALARM_LOCKED);
    await vi.waitFor(async () => {
      expect(await browser.getTab(tab.id!)).toBeNull();
    });
  });

  it('does not clean on a stale alarm after the user became active', async () => {
    const { browser } = await setup();
    const tab = oldTab(browser);
    browser.emitIdle('active');
    browser.emitAlarm(ALARM_LOCKED);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await browser.getTab(tab.id!)).not.toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/integration/triggers.test.ts`

Expected: FAIL，`triggers.ts` 与方法不存在。

- [ ] **Step 3: 在 service 中追加触发动作**

在类中增加：

```ts
async onLocked(): Promise<void> {
  await this.bootstrap();
  const settings = await this.deps.repo.getSettings();
  if (!settings.lockCleanupEnabled) return;
  if (settings.lockDelayMinutes <= 0) {
    await this.runCleanup('locked');
    return;
  }
  await this.deps.browser.createAlarm(ALARM_LOCKED, { delayInMinutes: settings.lockDelayMinutes });
}

async onActive(): Promise<void> {
  await this.deps.browser.clearAlarm(ALARM_LOCKED);
}

async onLockAlarm(): Promise<void> {
  const state = await this.deps.browser.queryIdleState(60);
  if (state === 'locked' || state === 'idle') {
    await this.runCleanup('locked');
  } else {
    await this.deps.browser.clearAlarm(ALARM_LOCKED);
  }
}
```

- [ ] **Step 4: 创建触发器注册**

Create `src/background/triggers.ts`:

```ts
import { ALARM_LOCKED } from '../shared/constants';
import type { Browser } from '../platform/browser';
import type { TabDormancyService } from './service';

function safe(promise: Promise<unknown>): void {
  void promise.catch((error) => console.error('[tab-dormancy]', error));
}

export function registerTriggers(browser: Browser, service: TabDormancyService): void {
  browser.onInstalled(() => safe(service.bootstrap()));
  browser.onStartup(() => safe(service.bootstrap()));

  browser.onIdleStateChanged((state) => {
    if (state === 'idle') safe(service.runCleanup('idle'));
    else if (state === 'locked') safe(service.onLocked());
    else safe(service.onActive());
  });

  browser.onAlarm((alarm) => {
    if (alarm.name === ALARM_LOCKED) safe(service.onLockAlarm());
  });
}
```

- [ ] **Step 5: 更新后台入口**

Replace `src/background/index.ts`:

```ts
import { TabDormancyService } from './service';
import { registerTriggers } from './triggers';
import { ChromeBrowser } from '../platform/chrome-browser';
import { Repo } from '../platform/storage';

const browser = new ChromeBrowser();
const repo = new Repo(browser.storageLocal, browser.storageSession);
const service = new TabDormancyService({
  browser,
  repo,
  now: () => Date.now(),
  id: () => crypto.randomUUID(),
  userAgent: () => navigator.userAgent,
});

void service.bootstrap();
registerTriggers(browser, service);
```

- [ ] **Step 6: 运行触发测试与类型检查**

Run: `npx vitest run tests/integration/triggers.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/background/service.ts src/background/triggers.ts src/background/index.ts tests/integration/triggers.test.ts
git commit -m "feat: wire idle and lock triggers"
```
### Task 14: 类型化消息协议与路由

**Files:**
- Create: `src/shared/messages.ts`
- Create: `src/background/messages.ts`
- Modify: `src/background/service.ts`（追加 `previewStrategy`）
- Modify: `src/background/index.ts`
- Test: `tests/integration/messages.test.ts`

**Interfaces:**
- Consumes: Task 10–12 的 `TabDormancyService`；Task 2 的 `AppError`、`ErrorCode`。
- Produces:
  - `Request`、`Response<T>`、`StrategyPreview`
  - `handleRequest(message, service): Promise<Response<unknown>>`
  - `createMessageHandler(service): (message, sender, sendResponse) => boolean`
  - `service.previewStrategy(strategy): Promise<StrategyPreview>`

- [ ] **Step 1: 写消息路由测试**

Create `tests/integration/messages.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMessageHandler, handleRequest } from '../../src/background/messages';
import { AppError } from '../../src/shared/errors';
import type { TabDormancyService } from '../../src/background/service';
import type { StateSnapshot } from '../../src/shared/types';

const snapshot: StateSnapshot = {
  settings: { idleThresholdMinutes: 15, lockCleanupEnabled: true, lockDelayMinutes: 15, historyRetentionDays: 30, activeStrategyId: 'preset:standard' },
  strategies: [],
  activeStrategy: {} as StateSnapshot['activeStrategy'],
  lastCleanup: null,
  capabilities: { chromeMajor: 132, lastAccessed: true, frozen: true, tabGroups: true, sessions: true },
  warnings: [],
};

function stub(overrides: Partial<TabDormancyService> = {}) {
  return {
    getState: vi.fn().mockResolvedValue(snapshot),
    runCleanup: vi.fn().mockResolvedValue({ runId: 'r', trigger: 'manual', closed: 0, failed: 0, skipped: 0, durationMs: 1, recordIds: [], failures: [] }),
    ...overrides,
  } as unknown as TabDormancyService;
}

describe('message router', () => {
  it('wraps successful responses', async () => {
    const response = await handleRequest({ type: 'state.get' }, stub());
    expect(response).toEqual({ ok: true, data: snapshot });
  });

  it('maps AppError codes', async () => {
    const response = await handleRequest(
      { type: 'state.get' },
      stub({ getState: vi.fn().mockRejectedValue(new AppError('BUSY', '正在清理')) }),
    );
    expect(response).toEqual({ ok: false, error: 'BUSY', message: '正在清理' });
  });

  it('rejects unknown messages', async () => {
    const response = await handleRequest({ type: 'nope' }, stub());
    expect(response.ok).toBe(false);
  });

  it('returns true for async sendResponse handling', async () => {
    const sendResponse = vi.fn();
    const handler = createMessageHandler(stub());
    expect(handler({ type: 'state.get' }, {} as chrome.runtime.MessageSender, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: snapshot }));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/integration/messages.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 定义消息协议**

Create `src/shared/messages.ts`:

```ts
import type { ErrorCode } from './errors';
import type {
  CleanupPreview,
  CleanupResult,
  HistoryQuery,
  HistoryQueryResult,
  RestoreOptions,
  RestoreResult,
  Settings,
  SettingsPatch,
  Strategy,
  StateSnapshot,
  TabListItem,
} from './types';

export type StrategyPreview = CleanupPreview & { signature: string };

export type Request =
  | { type: 'state.get' }
  | { type: 'cleanup.preview'; source: 'popup' | 'dashboard' }
  | { type: 'cleanup.run'; source: 'popup' | 'dashboard' }
  | { type: 'tabs.list' }
  | { type: 'history.query'; query: HistoryQuery }
  | { type: 'history.restore'; ids: string[]; options: RestoreOptions }
  | { type: 'history.delete'; ids: string[] }
  | { type: 'history.clear' }
  | { type: 'strategy.preview'; strategy: Strategy }
  | { type: 'strategy.save'; strategy: Strategy; previewSignature?: string }
  | { type: 'strategy.activate'; id: string }
  | { type: 'strategy.delete'; id: string }
  | { type: 'settings.update'; patch: SettingsPatch }
  | { type: 'debug.simulate-idle' };

export type Response<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; message: string };

export type ResponseMap = {
  'state.get': StateSnapshot;
  'cleanup.preview': CleanupPreview;
  'cleanup.run': CleanupResult;
  'tabs.list': TabListItem[];
  'history.query': HistoryQueryResult;
  'history.restore': RestoreResult;
  'history.delete': null;
  'history.clear': null;
  'strategy.preview': StrategyPreview;
  'strategy.save': Strategy;
  'strategy.activate': null;
  'strategy.delete': null;
  'settings.update': Settings;
  'debug.simulate-idle': CleanupResult;
};
```

- [ ] **Step 4: 在 service 中追加策略预览**

在 imports 增加：

```ts
import type { StrategyPreview } from '../shared/messages';
```

在类中增加：

```ts
async previewStrategy(strategy: Strategy): Promise<StrategyPreview> {
  await this.bootstrap();
  const caps = await this.getCapabilities();
  const validation = validateStrategy(strategy, caps);
  if (!validation.valid) {
    throw new AppError('INVALID_EXPRESSION', validation.issues[0]?.message ?? '规则无效');
  }
  this.assertUsable(strategy, caps);
  const [tabs, windows, groups] = await Promise.all([
    this.deps.browser.queryTabs(),
    this.deps.browser.getWindows(),
    this.deps.browser.getTabGroups(),
  ]);
  const plan = planCleanup({ tabs, windows, groups, strategy, capabilities: caps, now: this.deps.now() });
  return {
    matched: plan.matched.length,
    sample: plan.matched.slice(0, 5).map((tab) => ({ tabId: tab.tabId, title: tab.title, url: tab.url, trace: tab.trace })),
    totalManagedTabs: plan.totalManagedTabs,
    strategyName: strategy.name,
    signature: await signatureOf(strategy.expression),
  };
}
```

- [ ] **Step 5: 实现消息路由**

Create `src/background/messages.ts`:

```ts
import { AppError, type ErrorCode } from '../shared/errors';
import type { Request, Response } from '../shared/messages';
import type { TabDormancyService } from './service';

const ok = <T>(data: T): Response<T> => ({ ok: true, data });
const fail = (error: ErrorCode, message: string): Response<never> => ({ ok: false, error, message });

export async function handleRequest(message: unknown, service: TabDormancyService): Promise<Response<unknown>> {
  try {
    if (!message || typeof message !== 'object' || typeof (message as { type?: unknown }).type !== 'string') {
      return fail('INVALID_EXPRESSION', '未知消息');
    }
    const request = message as Request;
    switch (request.type) {
      case 'state.get':
        return ok(await service.getState());
      case 'cleanup.preview':
        return ok(await service.previewCleanup());
      case 'cleanup.run':
        return ok(await service.runCleanup('manual'));
      case 'tabs.list':
        return ok(await service.listTabs());
      case 'history.query':
        return ok(await service.queryHistory(request.query));
      case 'history.restore':
        return ok(await service.restoreHistory(request.ids, request.options));
      case 'history.delete':
        await service.deleteHistory(request.ids);
        return ok(null);
      case 'history.clear':
        await service.clearHistory();
        return ok(null);
      case 'strategy.preview':
        return ok(await service.previewStrategy(request.strategy));
      case 'strategy.save':
        return ok(await service.saveStrategy(request.strategy, request.previewSignature));
      case 'strategy.activate':
        await service.activateStrategy(request.id);
        return ok(null);
      case 'strategy.delete':
        await service.deleteStrategy(request.id);
        return ok(null);
      case 'settings.update':
        return ok(await service.updateSettings(request.patch));
      case 'debug.simulate-idle':
        if (import.meta.env.MODE === 'development') return ok(await service.runCleanup('manual'));
        return fail('NOT_FOUND', '仅开发模式可用');
      default:
        return fail('NOT_FOUND', '未知消息');
    }
  } catch (error) {
    if (error instanceof AppError) return fail(error.code, error.message);
    return fail('INTERNAL', error instanceof Error ? error.message : '内部错误');
  }
}

export function createMessageHandler(service: TabDormancyService) {
  return (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: Response<unknown>) => void,
  ): boolean => {
    void handleRequest(message, service).then(sendResponse);
    return true;
  };
}
```

- [ ] **Step 6: 更新后台入口注册消息**

在 `src/background/index.ts` 增加 import 与监听：

```ts
import { createMessageHandler } from './messages';

// 在 registerTriggers 之后
chrome.runtime.onMessage.addListener(createMessageHandler(service));
```

- [ ] **Step 7: 运行测试与类型检查**

Run: `npx vitest run tests/integration/messages.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add src/shared/messages.ts src/background/messages.ts src/background/service.ts src/background/index.ts tests/integration/messages.test.ts
git commit -m "feat: add typed message protocol and router"
```

---

### Task 15: 弹窗 UI

**Files:**
- Create: `src/ui/api.ts`
- Create: `src/ui/components/Button.tsx`、`Banner.tsx`、`Spinner.tsx`
- Create: `src/ui/popup/state.ts`
- Modify: `src/ui/popup/Popup.tsx`、`src/ui/styles/popup.css`
- Test: `tests/unit/popup-state.test.ts`

**Interfaces:**
- Consumes: Task 14 的 `Request`、`Response`、`StateSnapshot`、`CleanupPreview`、`CleanupResult`。
- Produces:
  - `send<T>(request)`、`messageOf(error)`、`openDashboard()`
  - `popupReducer(state, action)` 与 `Popup` 组件
  - 稳定测试选择器：`data-testid="cleanup-button"`、`confirm-cleanup`、`cancel-cleanup`、`undo-button`、`open-dashboard`、`popup-preview-count`

- [ ] **Step 1: 写弹窗状态机测试**

Create `tests/unit/popup-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialPopupState, popupReducer } from '../../src/ui/popup/state';

const snapshot = { settings: {}, strategies: [], activeStrategy: {}, lastCleanup: null, capabilities: {}, warnings: [] } as never;
const preview = { matched: 3, sample: [], totalManagedTabs: 10, strategyName: '标准' };
const result = { runId: 'r', trigger: 'manual', closed: 3, failed: 0, skipped: 0, durationMs: 5, recordIds: ['a'], failures: [] } as const;

describe('popupReducer', () => {
  it('moves from loading to ready', () => {
    const state = popupReducer(initialPopupState(), { type: 'loaded', snapshot, preview });
    expect(state.phase).toBe('ready');
    expect(state.preview?.matched).toBe(3);
  });

  it('requires confirmation before running', () => {
    const ready = popupReducer(initialPopupState(), { type: 'loaded', snapshot, preview });
    const confirm = popupReducer(ready, { type: 'confirm' });
    expect(confirm.phase).toBe('confirm');
    const running = popupReducer(confirm, { type: 'run-start' });
    expect(running.phase).toBe('running');
    const done = popupReducer(running, { type: 'run-done', result });
    expect(done.phase).toBe('done');
    expect(done.result?.closed).toBe(3);
  });

  it('cancels confirmation and handles errors', () => {
    const ready = popupReducer(initialPopupState(), { type: 'loaded', snapshot, preview });
    const confirm = popupReducer(ready, { type: 'confirm' });
    expect(popupReducer(confirm, { type: 'cancel' }).phase).toBe('ready');
    const error = popupReducer(ready, { type: 'error', message: '失败' });
    expect(error.phase).toBe('error');
    expect(error.error).toBe('失败');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/popup-state.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 创建 API 客户端与基础组件**

Create `src/ui/api.ts`:

```ts
import type { Request, Response } from '../shared/messages';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function send<T>(request: Request): Promise<T> {
  const response = (await chrome.runtime.sendMessage(request)) as Response<T> | undefined;
  if (!response) throw new ApiError('INTERNAL', '后台无响应');
  if (!response.ok) throw new ApiError(response.error, response.message);
  return response.data;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败';
}

export function openDashboard(): void {
  void chrome.runtime.openOptionsPage();
}
```

Create `src/ui/components/Button.tsx`:

```tsx
import type { ComponentChildren } from 'preact';

type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
  children: ComponentChildren;
  'data-testid'?: string;
  'aria-label'?: string;
  class?: string;
};

export function Button({
  variant = 'secondary',
  disabled,
  onClick,
  children,
  class: className = '',
  'data-testid': testId,
  'aria-label': ariaLabel,
}: ButtonProps) {
  return (
    <button
      type="button"
      class={`btn btn-${variant} ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
```

Create `src/ui/components/Banner.tsx`:

```tsx
import type { ComponentChildren } from 'preact';

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ComponentChildren }) {
  return <div class={`banner banner-${tone}`}>{children}</div>;
}
```

Create `src/ui/components/Spinner.tsx`:

```tsx
export function Spinner({ label = '正在加载…' }: { label?: string }) {
  return (
    <div class="spinner" role="status">
      <span class="spinner-dot" />
      <span class="muted">{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: 实现弹窗状态机**

Create `src/ui/popup/state.ts`:

```ts
import type { CleanupPreview, CleanupResult, StateSnapshot } from '../../shared/types';

export type PopupPhase = 'loading' | 'ready' | 'confirm' | 'running' | 'done' | 'error';

export type PopupState = {
  phase: PopupPhase;
  snapshot: StateSnapshot | null;
  preview: CleanupPreview | null;
  result: CleanupResult | null;
  error: string | null;
};

export type PopupAction =
  | { type: 'loaded'; snapshot: StateSnapshot; preview: CleanupPreview }
  | { type: 'error'; message: string }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'run-start' }
  | { type: 'run-done'; result: CleanupResult }
  | { type: 'reset' };

export function initialPopupState(): PopupState {
  return { phase: 'loading', snapshot: null, preview: null, result: null, error: null };
}

export function popupReducer(state: PopupState, action: PopupAction): PopupState {
  switch (action.type) {
    case 'loaded':
      return { ...state, phase: 'ready', snapshot: action.snapshot, preview: action.preview, error: null };
    case 'error':
      return { ...state, phase: 'error', error: action.message };
    case 'confirm':
      return { ...state, phase: 'confirm' };
    case 'cancel':
      return { ...state, phase: 'ready' };
    case 'run-start':
      return { ...state, phase: 'running', error: null };
    case 'run-done':
      return { ...state, phase: 'done', result: action.result };
    case 'reset':
      return { ...state, phase: 'ready', result: null, error: null };
    default:
      return state;
  }
}
```

- [ ] **Step 5: 实现弹窗组件**

Replace `src/ui/popup/Popup.tsx`:

```tsx
import { useEffect, useReducer } from 'preact/hooks';
import type { CleanupPreview, CleanupResult, StateSnapshot } from '../../shared/types';
import { formatRelativeTime } from '../../shared/time';
import { messageOf, openDashboard, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { initialPopupState, popupReducer } from './state';

export function Popup() {
  const [state, dispatch] = useReducer(popupReducer, undefined, initialPopupState);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [snapshot, preview] = await Promise.all([
        send<StateSnapshot>({ type: 'state.get' }),
        send<CleanupPreview>({ type: 'cleanup.preview', source: 'popup' }),
      ]);
      dispatch({ type: 'loaded', snapshot, preview });
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error) });
    }
  }

  async function run() {
    dispatch({ type: 'run-start' });
    try {
      const result = await send<CleanupResult>({ type: 'cleanup.run', source: 'popup' });
      dispatch({ type: 'run-done', result });
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error) });
    }
  }

  async function undo() {
    const ids = state.result?.recordIds ?? state.snapshot?.lastCleanup?.recordIds ?? [];
    if (ids.length === 0) return;
    try {
      await send({ type: 'history.restore', ids, options: { mode: 'current-window', complete: false } });
      dispatch({ type: 'reset' });
      await load();
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error) });
    }
  }

  const snapshot = state.snapshot;
  const preview = state.preview;

  return (
    <main class="popup">
      <header class="popup-head">
        <div>
          <h1>Tab Dormancy</h1>
          <p class="muted popup-subtitle">{snapshot?.activeStrategy.name ?? '正在读取策略'}</p>
        </div>
        <Button class="icon-button" onClick={openDashboard} data-testid="open-dashboard" aria-label="打开控制台">
          ⚙
        </Button>
      </header>

      {state.phase === 'loading' && <Spinner />}
      {state.phase === 'error' && (
        <>
          <Banner tone="error">{state.error}</Banner>
          <Button onClick={() => void load()}>重试</Button>
        </>
      )}

      {snapshot && preview && (state.phase === 'ready' || state.phase === 'confirm') && (
        <>
          {snapshot.warnings.map((warning) => (
            <Banner key={warning}>{warning}</Banner>
          ))}
          <section class="popup-count">
            <span class="popup-number" data-testid="popup-preview-count">
              {preview.matched}
            </span>
            <span class="muted">个标签可清理</span>
          </section>
          <p class="muted">
            当前策略「{preview.strategyName}」，共 {preview.totalManagedTabs} 个可管理标签。
          </p>

          {state.phase === 'ready' ? (
            <Button
              variant="primary"
              disabled={preview.matched === 0}
              onClick={() => dispatch({ type: 'confirm' })}
              data-testid="cleanup-button"
            >
              {preview.matched === 0 ? '没有可清理的标签' : `清理 ${preview.matched} 个标签`}
            </Button>
          ) : (
            <div class="confirm-box">
              <p>将关闭 {preview.matched} 个标签，关闭后可在控制台恢复。</p>
              <div class="row">
                <Button variant="danger" onClick={() => void run()} data-testid="confirm-cleanup">
                  确认清理
                </Button>
                <Button onClick={() => dispatch({ type: 'cancel' })} data-testid="cancel-cleanup">
                  取消
                </Button>
              </div>
            </div>
          )}

          <p class="muted popup-footnote">
            {snapshot.lastCleanup
              ? `上次清理：${formatRelativeTime(Date.now(), snapshot.lastCleanup.at)}，关闭 ${snapshot.lastCleanup.closed} 个`
              : '还没有清理记录'}
          </p>
        </>
      )}

      {state.phase === 'running' && <Spinner label="正在清理…" />}

      {state.phase === 'done' && state.result && (
        <section class="done-box">
          <h2>已关闭 {state.result.closed} 个标签</h2>
          {state.result.failed > 0 && <p class="muted">{state.result.failed} 个失败</p>}
          {state.result.skipped > 0 && <p class="muted">{state.result.skipped} 个因页面变化跳过</p>}
          <div class="row">
            {state.result.recordIds.length > 0 && (
              <Button onClick={() => void undo()} data-testid="undo-button">
                撤销
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => {
                dispatch({ type: 'reset' });
                void load();
              }}
            >
              完成
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 6: 补弹窗样式**

Replace `src/ui/styles/popup.css`:

```css
.popup {
  width: 360px;
  min-height: 260px;
  padding: 18px;
  background: var(--surface);
}

.popup-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.popup h1 {
  margin: 0;
  font-size: 16px;
  letter-spacing: -0.01em;
}

.popup-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
}

.popup-count {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 18px 0 6px;
}

.popup-number {
  font-size: 36px;
  font-weight: 650;
  letter-spacing: -0.04em;
}

.popup-footnote {
  margin: 18px 0 0;
  font-size: 12px;
}

.confirm-box,
.done-box {
  display: grid;
  gap: 12px;
  margin-top: 16px;
  padding: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.done-box h2 {
  margin: 0;
  font-size: 16px;
}

.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  background: var(--surface);
  color: var(--text);
  transition: background 120ms ease, border-color 120ms ease;
}

.btn:hover:not(:disabled) {
  background: var(--surface-2);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-strong);
}

.btn-danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

.btn-secondary {
  background: var(--surface);
}

.icon-button {
  padding: 6px 8px;
  line-height: 1;
}

.banner {
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 12px;
}

.banner-error {
  color: var(--danger);
  border-color: var(--danger);
}

.spinner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
}

.spinner-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 900ms ease-in-out infinite alternate;
}

@keyframes pulse {
  from {
    opacity: 0.35;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

- [ ] **Step 7: 运行测试与类型检查**

Run: `npx vitest run tests/unit/popup-state.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 8: 构建并提交**

Run: `npm run build`

Expected: PASS。

```bash
git add src/ui/api.ts src/ui/components src/ui/popup src/ui/styles/popup.css tests/unit/popup-state.test.ts
git commit -m "feat: add popup cleanup flow"
```
### Task 16: 控制台外壳与标签页预览

**Files:**
- Create: `src/ui/dashboard/routes.ts`、`tabs-filter.ts`
- Modify: `src/ui/dashboard/Dashboard.tsx`
- Create: `src/ui/dashboard/TabsPage.tsx`
- Modify: `src/ui/styles/dashboard.css`
- Test: `tests/unit/dashboard-routes.test.ts`、`tests/unit/tabs-filter.test.ts`

**Interfaces:**
- Consumes: Task 14 的 `Request`、`Response`；Task 2 的 `TabListItem`、`CleanupPreview`、`CleanupResult`。
- Produces:
  - `parseRoute(hash)`、`routeHref(route)`
  - `filterTabs(items, query, windowId)`
  - `Dashboard` 外壳与 `TabsPage`
  - 稳定测试选择器：`tabs-count`、`tab-row-<id>`、`dashboard-cleanup`、`dashboard-confirm-cleanup`

- [ ] **Step 1: 写路由与过滤测试**

Create `tests/unit/dashboard-routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref } from '../../src/ui/dashboard/routes';

describe('dashboard routes', () => {
  it('parses known routes and defaults to tabs', () => {
    expect(parseRoute('#/tabs')).toBe('tabs');
    expect(parseRoute('#/history')).toBe('history');
    expect(parseRoute('#/strategies')).toBe('strategies');
    expect(parseRoute('#/settings')).toBe('settings');
    expect(parseRoute('#/unknown')).toBe('tabs');
    expect(parseRoute('')).toBe('tabs');
  });

  it('builds hash hrefs', () => {
    expect(routeHref('history')).toBe('#/history');
  });
});
```

Create `tests/unit/tabs-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterTabs } from '../../src/ui/dashboard/tabs-filter';
import type { TabListItem } from '../../src/shared/types';

const item = (id: number, title: string, windowId: number, domain = 'example.com'): TabListItem =>
  ({
    tab: { id } as chrome.tabs.Tab,
    facts: { tabId: id, title, url: `https://${domain}/${id}`, domain, windowId } as TabListItem['facts'],
    matched: false,
    trace: [],
  }) as TabListItem;

describe('filterTabs', () => {
  const items = [item(1, 'Alpha', 10, 'a.com'), item(2, 'Beta', 20, 'b.com'), item(3, 'Alpha two', 10, 'c.com')];

  it('filters by title, url and domain', () => {
    expect(filterTabs(items, 'alpha', 'all').map((entry) => entry.facts.tabId)).toEqual([1, 3]);
    expect(filterTabs(items, 'b.com', 'all').map((entry) => entry.facts.tabId)).toEqual([2]);
  });

  it('filters by window', () => {
    expect(filterTabs(items, '', 10).map((entry) => entry.facts.tabId)).toEqual([1, 3]);
    expect(filterTabs(items, '', 20).map((entry) => entry.facts.tabId)).toEqual([2]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/dashboard-routes.test.ts tests/unit/tabs-filter.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现路由与过滤**

Create `src/ui/dashboard/routes.ts`:

```ts
export type Route = 'tabs' | 'history' | 'strategies' | 'settings';

const ROUTES: Route[] = ['tabs', 'history', 'strategies', 'settings'];

export function parseRoute(hash: string): Route {
  const value = hash.replace(/^#\/?/, '');
  return ROUTES.includes(value as Route) ? (value as Route) : 'tabs';
}

export function routeHref(route: Route): string {
  return `#/${route}`;
}
```

Create `src/ui/dashboard/tabs-filter.ts`:

```ts
import type { TabListItem } from '../../shared/types';

export function filterTabs(items: TabListItem[], query: string, windowId: number | 'all'): TabListItem[] {
  const search = query.trim().toLowerCase();
  return items.filter((item) => {
    if (windowId !== 'all' && item.facts.windowId !== windowId) return false;
    if (!search) return true;
    return [item.facts.title, item.facts.url, item.facts.domain].some((value) =>
      value.toLowerCase().includes(search),
    );
  });
}
```

- [ ] **Step 4: 实现控制台外壳**

Replace `src/ui/dashboard/Dashboard.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks';
import { parseRoute, routeHref, type Route } from './routes';
import { TabsPage } from './TabsPage';

const NAV: Array<{ route: Route; label: string }> = [
  { route: 'tabs', label: '标签页' },
  { route: 'history', label: '关闭历史' },
  { route: 'strategies', label: '策略' },
  { route: 'settings', label: '设置' },
];

export function Dashboard() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div class="dashboard-shell">
      <aside class="sidebar">
        <h1 class="brand">Tab Dormancy</h1>
        <nav class="nav">
          {NAV.map((item) => (
            <a
              key={item.route}
              href={routeHref(item.route)}
              class={item.route === route ? 'nav-link active' : 'nav-link'}
              onClick={() => setRoute(item.route)}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <p class="sidebar-note muted">只在空闲时关闭标签页，不采集使用数据。</p>
      </aside>
      <main class="content">
        {route === 'tabs' && <TabsPage />}
        {route === 'history' && <p class="muted">关闭历史页面将在下一个任务接入。</p>}
        {route === 'strategies' && <p class="muted">策略页面将在下一个任务接入。</p>}
        {route === 'settings' && <p class="muted">设置页面将在后续任务接入。</p>}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: 实现标签页预览**

Create `src/ui/dashboard/TabsPage.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks';
import type { CleanupPreview, CleanupResult, TabListItem, TraceNode } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { filterTabs } from './tabs-filter';

export function TabsPage() {
  const [items, setItems] = useState<TabListItem[]>([]);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [windowId, setWindowId] = useState<number | 'all'>('all');
  const [confirming, setConfirming] = useState(false);

  async function load() {
    try {
      const [nextItems, nextPreview] = await Promise.all([
        send<TabListItem[]>({ type: 'tabs.list' }),
        send<CleanupPreview>({ type: 'cleanup.preview', source: 'dashboard' }),
      ]);
      setItems(nextItems);
      setPreview(nextPreview);
      setError(null);
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const reload = () => void load();
    chrome.tabs.onActivated.addListener(reload);
    chrome.tabs.onRemoved.addListener(reload);
    chrome.tabs.onUpdated.addListener(reload);
    return () => {
      chrome.tabs.onActivated.removeListener(reload);
      chrome.tabs.onRemoved.removeListener(reload);
      chrome.tabs.onUpdated.removeListener(reload);
    };
  }, []);

  async function runCleanup() {
    setConfirming(false);
    try {
      await send<CleanupResult>({ type: 'cleanup.run', source: 'dashboard' });
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  }

  const visible = filterTabs(items, query, windowId);
  const windows = [...new Set(items.map((item) => item.facts.windowId))].sort((a, b) => a - b);

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>标签页</h2>
          <p class="muted">预览当前策略会关闭哪些标签；绿色标记表示命中。</p>
        </div>
        <Button variant="primary" onClick={() => setConfirming(true)} disabled={(preview?.matched ?? 0) === 0} data-testid="dashboard-cleanup">
          {preview ? `清理 ${preview.matched} 个` : '清理'}
        </Button>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {loading && <Spinner />}
      {confirming && preview && (
        <div class="confirm-bar">
          <span>确认关闭 {preview.matched} 个标签？历史会保留，可随时恢复。</span>
          <div class="row">
            <Button variant="danger" onClick={() => void runCleanup()} data-testid="dashboard-confirm-cleanup">
              确认
            </Button>
            <Button onClick={() => setConfirming(false)}>取消</Button>
          </div>
        </div>
      )}

      <div class="toolbar">
        <input
          class="input"
          type="search"
          placeholder="搜索标题、URL 或域名"
          value={query}
          onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
        />
        <select
          class="input"
          value={windowId}
          onChange={(event) => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            setWindowId(value === 'all' ? 'all' : Number(value));
          }}
        >
          <option value="all">全部窗口</option>
          {windows.map((id) => (
            <option key={id} value={id}>
              窗口 {id}
            </option>
          ))}
        </select>
        <span class="muted" data-testid="tabs-count">
          {visible.length} / {items.length}
        </span>
      </div>

      <div class="tab-list">
        {visible.map((item) => (
          <details key={item.facts.tabId} class="tab-row" data-testid={`tab-row-${item.facts.tabId}`}>
            <summary class="tab-summary">
              <span class={item.matched ? 'status-dot matched' : 'status-dot'} />
              <span class="tab-title">{item.facts.title || item.facts.url}</span>
              <span class="muted tab-domain">{item.facts.domain || '本地文件'}</span>
              <span class="muted tab-window">窗口 {item.facts.windowId}</span>
            </summary>
            <div class="tab-detail">
              <p class="tab-url">{item.facts.url}</p>
              <dl class="fact-grid">
                <div>
                  <dt>最后访问</dt>
                  <dd>{item.facts.lastActiveMinutes === null ? '未知' : `${item.facts.lastActiveMinutes} 分钟前`}</dd>
                </div>
                <div>
                  <dt>固定 / 声音</dt>
                  <dd>{item.facts.pinned ? '固定' : '未固定'} / {item.facts.audible ? '有声' : '无声'}</dd>
                </div>
                <div>
                  <dt>标签组</dt>
                  <dd>{item.facts.grouped ? item.facts.groupTitle || '未命名组' : '未分组'}</dd>
                </div>
                <div>
                  <dt>窗口内标签</dt>
                  <dd>{item.facts.windowTabCount}</dd>
                </div>
              </dl>
              {item.trace.length > 0 && (
                <div class="trace">
                  <h4>规则判断</h4>
                  {item.trace.map((node) => (
                    <TraceRow key={node.nodeId} node={node} />
                  ))}
                </div>
              )}
            </div>
          </details>
        ))}
        {!loading && visible.length === 0 && <p class="muted empty">没有匹配的标签。</p>}
      </div>
    </section>
  );
}

function TraceRow({ node }: { node: TraceNode }) {
  if (!node.fact) return null;
  return (
    <div class={node.result ? 'trace-row pass' : 'trace-row'}>
      <span>{node.fact}</span>
      <span class="muted">
        实际 {String(node.actual ?? '未知')} · 期望 {String(node.expected ?? '')}
      </span>
      <span>{node.result ? '命中' : node.reason === 'unknown' ? '未知' : '未命中'}</span>
    </div>
  );
}
```

- [ ] **Step 6: 补控制台样式**

Replace `src/ui/styles/dashboard.css`:

```css
.btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  background: var(--surface);
  color: var(--text);
  transition: background 120ms ease, border-color 120ms ease;
}

.btn:hover:not(:disabled) {
  background: var(--surface-2);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-strong);
}

.btn-danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

.btn-secondary {
  background: var(--surface);
}

.banner {
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 12px;
}

.banner-error {
  color: var(--danger);
  border-color: var(--danger);
}

.spinner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
}

.spinner-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 900ms ease-in-out infinite alternate;
}

@keyframes pulse {
  from {
    opacity: 0.35;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.dashboard-shell {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: 100vh;
  background: var(--bg);
}

.sidebar {
  padding: 24px 16px;
  border-right: 1px solid var(--border);
  background: var(--surface);
}

.brand {
  margin: 0 0 24px;
  font-size: 16px;
  letter-spacing: -0.01em;
}

.nav {
  display: grid;
  gap: 4px;
}

.nav-link {
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--muted);
  text-decoration: none;
}

.nav-link:hover {
  background: var(--surface-2);
  color: var(--text);
}

.nav-link.active {
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
}

.sidebar-note {
  margin-top: 32px;
  font-size: 12px;
}

.content {
  width: min(980px, 100%);
  padding: 32px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.page-head h2 {
  margin: 0 0 4px;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.input {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.toolbar .input:first-child {
  flex: 1;
}

.tab-list {
  display: grid;
  gap: 8px;
}

.tab-row {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.tab-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  list-style: none;
}

.tab-summary::-webkit-details-marker {
  display: none;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  flex: none;
}

.status-dot.matched {
  background: var(--success);
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.tab-domain,
.tab-window {
  font-size: 12px;
  flex: none;
}

.tab-detail {
  padding: 0 12px 14px 30px;
  border-top: 1px solid var(--border);
}

.tab-url {
  font-size: 12px;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.fact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin: 12px 0;
}

.fact-grid dt {
  font-size: 11px;
  color: var(--muted);
}

.fact-grid dd {
  margin: 0;
  font-size: 13px;
}

.trace {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}

.trace h4 {
  margin: 0 0 6px;
  font-size: 12px;
}

.trace-row {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  font-size: 12px;
  padding: 3px 0;
  color: var(--muted);
}

.trace-row.pass {
  color: var(--text);
}

.confirm-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid var(--danger);
  border-radius: var(--radius);
  background: var(--surface);
}

.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.empty {
  padding: 24px 0;
}

@media (max-width: 720px) {
  .dashboard-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .nav {
    grid-auto-flow: column;
    justify-content: start;
  }

  .content {
    padding: 20px;
  }

  .fact-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: 运行测试、类型检查与构建**

Run: `npx vitest run tests/unit/dashboard-routes.test.ts tests/unit/tabs-filter.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

Run: `npm run build`

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add src/ui/dashboard/routes.ts src/ui/dashboard/tabs-filter.ts src/ui/dashboard/Dashboard.tsx src/ui/dashboard/TabsPage.tsx src/ui/styles/dashboard.css tests/unit/dashboard-routes.test.ts tests/unit/tabs-filter.test.ts
git commit -m "feat: add dashboard shell and tab preview"
```
### Task 17: 策略列表与可视化规则编辑器

**Files:**
- Create: `src/ui/dashboard/expr-edit.ts`
- Create: `src/ui/dashboard/StrategiesPage.tsx`、`RuleEditor.tsx`
- Modify: `src/ui/dashboard/Dashboard.tsx`
- Modify: `src/ui/styles/dashboard.css`
- Test: `tests/unit/expr-edit.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `FACT_BY_KEY`、`isFactAvailable`、`validateExpr`、`createPresetStrategies`、`cloneStrategy`、`createCustomStrategy`；Task 14 的 `StrategyPreview`。
- Produces:
  - `newCondition`、`newGroup`、`replaceNode`、`addChild`、`removeNode`、`toggleNot`、`unwrapNot`、`defaultOperator`、`defaultValue`、`countNodes`
  - `StrategiesPage`、`RuleEditor`
  - 稳定测试选择器：`new-strategy`、`strategy-card-<id>`、`strategy-edit-<id>`、`strategy-duplicate-<id>`、`strategy-activate-<id>`、`strategy-delete-<id>`、`rule-editor`、`rule-preview-count`、`save-strategy`、`activate-strategy`

- [ ] **Step 1: 写表达式编辑测试**

Create `tests/unit/expr-edit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addChild,
  countNodes,
  defaultValue,
  defaultOperator,
  newCondition,
  newGroup,
  removeNode,
  replaceNode,
  toggleNot,
  unwrapNot,
} from '../../src/ui/dashboard/expr-edit';
import type { Expr } from '../../src/shared/types';

describe('expr-edit', () => {
  it('creates sensible defaults', () => {
    expect(defaultOperator('lastActiveMinutes')).toBe('gt');
    expect(defaultOperator('domain')).toBe('matchesDomain');
    expect(defaultValue('lastActiveMinutes')).toBe(4320);
    expect(defaultValue('pinned')).toBe(true);
    const condition = newCondition('a') as Extract<Expr, { type: 'condition' }>;
    expect(condition.fact).toBe('lastActiveMinutes');
    expect(condition.op).toBe('gt');
  });

  it('adds and removes children without mutating the original', () => {
    const group = newGroup('all', 'g', newCondition('a'));
    const added = addChild(group, 'g', newCondition('b'));
    expect(countNodes(group)).toBe(2);
    expect(countNodes(added)).toBe(3);
    expect(countNodes(removeNode(added, 'b'))).toBe(2);
  });

  it('replaces a node', () => {
    const group = newGroup('all', 'g', newCondition('a'));
    const next = replaceNode(group, 'a', (node) => (node.type === 'condition' ? { ...node, value: 99 } : node));
    expect((next as Extract<Expr, { type: 'all' }>).children[0]).toMatchObject({ value: 99 });
  });

  it('wraps and unwraps NOT', () => {
    const condition = newCondition('a');
    let next = toggleNot(condition, 'a', () => 'not-1');
    expect(unwrapNot(next).negated).toBe(true);
    next = toggleNot(next, 'a', () => 'not-2');
    expect(unwrapNot(next).negated).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/expr-edit.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现表达式编辑工具**

Create `src/ui/dashboard/expr-edit.ts`:

```ts
import { FACT_BY_KEY } from '../../core/rules/registry';
import type { Expr, FactKey, FactValue, Operator } from '../../shared/types';

export function defaultOperator(fact: FactKey): Operator {
  if (fact === 'domain') return 'matchesDomain';
  return FACT_BY_KEY.get(fact)?.operators[0] ?? 'is';
}

export function defaultValue(fact: FactKey): FactValue {
  const definition = FACT_BY_KEY.get(fact);
  if (!definition) return '';
  if (definition.type === 'number') return fact === 'lastActiveMinutes' ? 4_320 : 20;
  if (definition.type === 'boolean') return true;
  if (definition.type === 'domain') return 'example.com';
  return '';
}

export function newCondition(id: string, fact: FactKey = 'lastActiveMinutes'): Expr {
  return { type: 'condition', id, fact, op: defaultOperator(fact), value: defaultValue(fact) };
}

export function newGroup(type: 'all' | 'any', id: string, child: Expr): Expr {
  return { type, id, children: [child] };
}

export function replaceNode(expr: Expr, id: string, replacer: (node: Expr) => Expr): Expr {
  if (expr.id === id) return replacer(expr);
  if (expr.type === 'not') return { ...expr, child: replaceNode(expr.child, id, replacer) };
  if (expr.type === 'all' || expr.type === 'any') {
    return { ...expr, children: expr.children.map((child) => replaceNode(child, id, replacer)) };
  }
  return expr;
}

export function addChild(expr: Expr, groupId: string, child: Expr): Expr {
  return replaceNode(expr, groupId, (node) =>
    node.type === 'all' || node.type === 'any' ? { ...node, children: [...node.children, child] } : node,
  );
}

export function removeNode(expr: Expr, id: string): Expr {
  if (expr.type === 'all' || expr.type === 'any') {
    return {
      ...expr,
      children: expr.children
        .filter((child) => !containsNode(child, id))
        .map((child) => removeNode(child, id)),
    };
  }
  if (expr.type === 'not') return { ...expr, child: removeNode(expr.child, id) };
  return expr;
}

function containsNode(expr: Expr, id: string): boolean {
  if (expr.id === id) return true;
  if (expr.type === 'not') return containsNode(expr.child, id);
  if (expr.type === 'all' || expr.type === 'any') return expr.children.some((child) => containsNode(child, id));
  return false;
}

export function toggleNot(expr: Expr, id: string, nextId: () => string): Expr {
  return replaceNode(expr, id, (node) =>
    node.type === 'not' ? node.child : { type: 'not', id: nextId(), child: node },
  );
}

export function unwrapNot(expr: Expr): { inner: Expr; negated: boolean } {
  let inner = expr;
  let negated = false;
  while (inner.type === 'not') {
    negated = !negated;
    inner = inner.child;
  }
  return { inner, negated };
}

export function countNodes(expr: Expr): number {
  if (expr.type === 'condition') return 1;
  if (expr.type === 'not') return 1 + countNodes(expr.child);
  return 1 + expr.children.reduce((sum, child) => sum + countNodes(child), 0);
}
```

- [ ] **Step 4: 实现规则编辑器**

Create `src/ui/dashboard/RuleEditor.tsx`:

```tsx
import { useState } from 'preact/hooks';
import type { Capabilities, Expr, FactKey, FactValue, Operator } from '../../shared/types';
import { FACT_BY_KEY, isFactAvailable } from '../../core/rules/registry';
import {
  addChild,
  defaultValue,
  newCondition,
  newGroup,
  removeNode,
  replaceNode,
  toggleNot,
  unwrapNot,
} from './expr-edit';

type RuleEditorProps = {
  expression: Expr;
  capabilities: Capabilities;
  disabled?: boolean;
  onChange: (expression: Expr) => void;
};

const newId = () => crypto.randomUUID();

export function RuleEditor({ expression, capabilities, disabled, onChange }: RuleEditorProps) {
  return (
    <div class="rule-editor" data-testid="rule-editor">
      <NodeView root={expression} node={expression} capabilities={capabilities} disabled={disabled} onChange={onChange} depth={0} />
    </div>
  );
}

type NodeViewProps = RuleEditorProps & {
  root: Expr;
  node: Expr;
  depth: number;
};

function NodeView({ root, node, capabilities, disabled, onChange, depth }: NodeViewProps) {
  const { inner, negated } = unwrapNot(node);
  if (inner.type === 'condition') {
    return (
      <ConditionRow
        root={root}
        node={inner}
        negated={negated}
        capabilities={capabilities}
        disabled={disabled}
        onChange={onChange}
        depth={depth}
      />
    );
  }
  if (inner.type === 'all' || inner.type === 'any') {
    return (
      <GroupCard
        root={root}
        node={inner}
        negated={negated}
        capabilities={capabilities}
        disabled={disabled}
        onChange={onChange}
        depth={depth}
      />
    );
  }
  return null;
}

function GroupCard({
  root,
  node,
  negated,
  capabilities,
  disabled,
  onChange,
  depth,
}: NodeViewProps & { node: Extract<Expr, { type: 'all' | 'any' }>; negated: boolean }) {
  const toggleType = () => {
    onChange(
      replaceNode(root, node.id, (current) =>
        current.type === 'all' || current.type === 'any'
          ? { ...current, type: current.type === 'all' ? 'any' : 'all' }
          : current,
      ),
    );
  };

  return (
    <div class={`group-card depth-${Math.min(depth, 4)}`}>
      <div class="group-head">
        <select
          class="input compact"
          value={node.type}
          disabled={disabled}
          onChange={toggleType}
          aria-label="规则组类型"
        >
          <option value="all">全部满足 (AND)</option>
          <option value="any">任一满足 (OR)</option>
        </select>
        <label class="checkbox">
          <input
            type="checkbox"
            checked={negated}
            disabled={disabled}
            onChange={() => onChange(toggleNot(root, node.id, newId))}
          />
          取反
        </label>
        <span class="grow" />
        {depth > 0 && (
          <button
            type="button"
            class="text-button danger"
            disabled={disabled}
            onClick={() => onChange(removeNode(root, node.id))}
          >
            删除组
          </button>
        )}
      </div>

      <div class="group-children">
        {node.children.map((child) => (
          <NodeView
            key={child.id}
            root={root}
            node={child}
            capabilities={capabilities}
            disabled={disabled}
            onChange={onChange}
            depth={depth + 1}
          />
        ))}
      </div>

      <div class="group-actions">
        <button
          type="button"
          class="text-button"
          disabled={disabled}
          onClick={() => onChange(addChild(root, node.id, newCondition(newId())))}
        >
          + 条件
        </button>
        <button
          type="button"
          class="text-button"
          disabled={disabled}
          onClick={() => onChange(addChild(root, node.id, newGroup('any', newId(), newCondition(newId()))))}
        >
          + 子组
        </button>
      </div>
    </div>
  );
}

function ConditionRow({
  root,
  node,
  negated,
  capabilities,
  disabled,
  onChange,
  depth,
}: NodeViewProps & { node: Extract<Expr, { type: 'condition' }>; negated: boolean }) {
  const definition = FACT_BY_KEY.get(node.fact);
  const [unit, setUnit] = useState<'minutes' | 'hours' | 'days'>(() => bestUnit(Number(node.value ?? 0)));

  if (!definition) return null;
  const unavailable = !isFactAvailable(definition, capabilities);

  const update = (patch: Partial<Extract<Expr, { type: 'condition' }>>) => {
    onChange(replaceNode(root, node.id, (current) => (current.type === 'condition' ? { ...current, ...patch } : current)));
  };

  const changeFact = (fact: FactKey) => {
    update({ fact, op: defaultOperatorFor(fact), value: defaultValue(fact) });
  };

  const changeOperator = (op: Operator) => {
    if (op === 'inDomainList') {
      update({ op, value: [String(node.value ?? 'example.com')] });
    } else if (Array.isArray(node.value)) {
      update({ op, value: defaultValue(node.fact) });
    } else {
      update({ op });
    }
  };

  const factor = unit === 'days' ? 1_440 : unit === 'hours' ? 60 : 1;
  const numberValue = typeof node.value === 'number' ? node.value : 0;

  return (
    <div class={`condition-row ${unavailable ? 'unavailable' : ''}`}>
      <label class="checkbox">
        <input
          type="checkbox"
          checked={negated}
          disabled={disabled}
          onChange={() => onChange(toggleNot(root, node.id, newId))}
        />
        取反
      </label>

      <select class="input compact fact-select" value={node.fact} disabled={disabled} onChange={(event) => changeFact((event.currentTarget as HTMLSelectElement).value as FactKey)}>
        {[...FACT_BY_KEY.values()].map((item) => (
          <option key={item.key} value={item.key} disabled={!isFactAvailable(item, capabilities)}>
            {item.label}
            {!isFactAvailable(item, capabilities) ? '（不可用）' : ''}
          </option>
        ))}
      </select>

      <select class="input compact" value={node.op} disabled={disabled || unavailable} onChange={(event) => changeOperator((event.currentTarget as HTMLSelectElement).value as Operator)}>
        {definition.operators.map((operator) => (
          <option key={operator} value={operator}>
            {operatorLabel(operator)}
          </option>
        ))}
      </select>

      {definition.type === 'number' ? (
        <span class="value-row">
          <input
            class="input compact"
            type="number"
            min={0}
            step={1}
            value={Math.round(numberValue / factor)}
            disabled={disabled}
            onInput={(event) => update({ value: Number((event.currentTarget as HTMLInputElement).value) * factor })}
          />
          <select class="input compact" value={unit} disabled={disabled} onChange={(event) => setUnit((event.currentTarget as HTMLSelectElement).value as typeof unit)}>
            <option value="minutes">分钟</option>
            <option value="hours">小时</option>
            <option value="days">天</option>
          </select>
        </span>
      ) : definition.type === 'boolean' ? (
        <select class="input compact" value={String(node.value)} disabled={disabled} onChange={(event) => update({ value: (event.currentTarget as HTMLSelectElement).value === 'true' })}>
          <option value="true">是</option>
          <option value="false">否</option>
        </select>
      ) : node.op === 'inDomainList' ? (
        <textarea
          class="input domain-list"
          value={Array.isArray(node.value) ? node.value.join('\n') : ''}
          disabled={disabled}
          placeholder="每行一个域名，例如 google.com"
          onInput={(event) =>
            update({
              value: (event.currentTarget as HTMLTextAreaElement).value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
        />
      ) : (
        <input
          class="input grow"
          type="text"
          value={typeof node.value === 'string' ? node.value : ''}
          disabled={disabled}
          placeholder={definition.type === 'domain' ? 'example.com' : '文本'}
          onInput={(event) => update({ value: (event.currentTarget as HTMLInputElement).value })}
        />
      )}

      {unavailable && <span class="unavailable-note">当前浏览器不可用</span>}
      {depth > 0 && (
        <button type="button" class="text-button danger" disabled={disabled} onClick={() => onChange(removeNode(root, node.id))}>
          删除
        </button>
      )}
    </div>
  );
}

function defaultOperatorFor(fact: FactKey): Operator {
  if (fact === 'domain') return 'matchesDomain';
  return FACT_BY_KEY.get(fact)?.operators[0] ?? 'is';
}

function bestUnit(value: number): 'minutes' | 'hours' | 'days' {
  if (value >= 1_440 && value % 1_440 === 0) return 'days';
  if (value >= 60 && value % 60 === 0) return 'hours';
  return 'minutes';
}

function operatorLabel(operator: Operator): string {
  const labels: Record<Operator, string> = {
    gt: '大于',
    gte: '大于等于',
    lt: '小于',
    lte: '小于等于',
    eq: '等于',
    neq: '不等于',
    is: '是',
    equals: '等于',
    contains: '包含',
    startsWith: '开头是',
    endsWith: '结尾是',
    matchesDomain: '匹配域名',
    inDomainList: '在域名列表中',
    matchesGlob: '匹配通配符',
  };
  return labels[operator];
}
```

- [ ] **Step 5: 实现策略页面**

Create `src/ui/dashboard/StrategiesPage.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks';
import type { Expr, StateSnapshot, Strategy } from '../../shared/types';
import type { StrategyPreview } from '../../shared/messages';
import { cloneStrategy, createCustomStrategy } from '../../core/rules/presets';
import { validateExpr } from '../../core/rules/validate';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { RuleEditor } from './RuleEditor';
import { newCondition, newGroup } from './expr-edit';

const newId = () => crypto.randomUUID();

export function StrategiesPage() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [editing, setEditing] = useState<Strategy | null>(null);
  const [preview, setPreview] = useState<StrategyPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setState(await send<StateSnapshot>({ type: 'state.get' }));
    } catch (error) {
      setError(messageOf(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!editing || editing.builtin) return;
    const timer = setTimeout(() => {
      void send<StrategyPreview>({ type: 'strategy.preview', strategy: editing })
        .then((next) => setPreview(next))
        .catch((error) => {
          setPreview(null);
          setError(messageOf(error));
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [editing]);

  const startNew = () => {
    const expression = newGroup('all', newId(), newCondition(newId()));
    setEditing(createCustomStrategy('新策略', expression, Date.now(), ''));
    setPreview(null);
    setError(null);
  };

  const duplicate = (strategy: Strategy) => {
    setEditing(cloneStrategy(strategy, Date.now(), ''));
    setPreview(null);
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const saved = await send<Strategy>({
        type: 'strategy.save',
        strategy: editing,
        previewSignature: preview?.signature,
      });
      setEditing(saved);
      setPreview(null);
      await load();
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const activate = async (id: string) => {
    try {
      await send({ type: 'strategy.activate', id });
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  };

  const remove = async (id: string) => {
    try {
      await send({ type: 'strategy.delete', id });
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  };

  const validation = editing && state ? validateExpr(editing.expression, state.capabilities) : null;

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>策略</h2>
          <p class="muted">内置策略不可修改；自定义策略必须先预览，才能启用自动清理。</p>
        </div>
        <Button variant="primary" onClick={startNew} data-testid="new-strategy">
          新建策略
        </Button>
      </header>

      {error && <Banner tone="error">{error}</Banner>}

      <div class="strategy-layout">
        <div class="strategy-list">
          {state?.strategies.map((strategy) => (
            <article class="strategy-card" key={strategy.id} data-testid={`strategy-card-${strategy.id}`}>
              <div class="strategy-card-head">
                <strong>{strategy.name}</strong>
                {strategy.builtin && <span class="badge">内置</span>}
                {state.activeStrategy.id === strategy.id && <span class="badge active">启用中</span>}
              </div>
              <p class="muted small">{expressionSummary(strategy.expression)}</p>
              <div class="row">
                <Button onClick={() => void activate(strategy.id)} data-testid={`strategy-activate-${strategy.id}`}>
                  启用
                </Button>
                <Button onClick={() => duplicate(strategy)} data-testid={`strategy-duplicate-${strategy.id}`}>
                  复制
                </Button>
                <Button onClick={() => setEditing(strategy)} data-testid={`strategy-edit-${strategy.id}`}>
                  编辑
                </Button>
                {!strategy.builtin && state.activeStrategy.id !== strategy.id && (
                  <Button variant="danger" onClick={() => void remove(strategy.id)} data-testid={`strategy-delete-${strategy.id}`}>
                    删除
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>

        {editing && state && (
          <div class="editor-panel">
            <div class="editor-head">
              <input
                class="input"
                value={editing.name}
                disabled={editing.builtin}
                onInput={(event) => setEditing({ ...editing, name: (event.currentTarget as HTMLInputElement).value })}
                aria-label="策略名称"
              />
              <span class="grow" />
              {editing.builtin && <span class="badge">只读</span>}
            </div>

            <RuleEditor
              expression={editing.expression}
              capabilities={state.capabilities}
              disabled={editing.builtin}
              onChange={(expression) => {
                setEditing({ ...editing, expression });
                setPreview(null);
              }}
            />

            <div class="editor-foot">
              {validation && !validation.valid && (
                <Banner tone="error">{validation.issues[0]?.message}</Banner>
              )}
              {preview && (
                <p class="muted" data-testid="rule-preview-count">
                  预览：将关闭 {preview.matched} 个标签（共 {preview.totalManagedTabs} 个可管理标签）
                </p>
              )}
              <div class="row">
                <Button
                  variant="primary"
                  disabled={saving || editing.builtin || !validation?.valid}
                  onClick={() => void save()}
                  data-testid="save-strategy"
                >
                  {saving ? '保存中…' : '保存'}
                </Button>
                {editing.id && !editing.builtin && (
                  <Button
                    disabled={!preview}
                    onClick={() => void activate(editing.id)}
                    data-testid="activate-strategy"
                  >
                    保存并启用
                  </Button>
                )}
                <Button onClick={() => setEditing(null)}>关闭</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function expressionSummary(expression: Expr): string {
  if (expression.type === 'condition') {
    const definition = FACT_BY_KEY_LABEL(expression.fact);
    return `${definition} ${expression.op} ${String(expression.value ?? '')}`;
  }
  if (expression.type === 'not') return `非（${expressionSummary(expression.child)}）`;
  return expression.children.map(expressionSummary).join(expression.type === 'all' ? ' 且 ' : ' 或 ');
}

function FACT_BY_KEY_LABEL(fact: string): string {
  return (
    {
      lastActiveMinutes: '距最后访问',
      totalTabCount: '总标签数',
      windowTabCount: '窗口标签数',
      pinned: '已固定',
      audible: '有声',
      active: '当前激活',
      muted: '已静音',
      discarded: '已丢弃',
      frozen: '已冻结',
      grouped: '在标签组中',
      groupCollapsed: '组已折叠',
      windowFocused: '窗口有焦点',
      onlyTabInWindow: '窗口唯一标签',
      domain: '域名',
      url: 'URL',
      title: '标题',
      groupTitle: '标签组名称',
    } as Record<string, string>
  )[fact] ?? fact;
}
```

- [ ] **Step 6: 接入 Dashboard 并补样式**

Modify `src/ui/dashboard/Dashboard.tsx`:

```tsx
import { StrategiesPage } from './StrategiesPage';

// 将策略占位替换为
{route === 'strategies' && <StrategiesPage />}
```

在 `src/ui/styles/dashboard.css` 追加：

```css
.strategy-layout {
  display: grid;
  grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.strategy-list {
  display: grid;
  gap: 10px;
}

.strategy-card,
.editor-panel {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 12px;
}

.strategy-card-head,
.editor-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 11px;
}

.badge.active {
  color: var(--success);
}

.small {
  font-size: 12px;
}

.grow {
  flex: 1;
}

.rule-editor {
  display: grid;
  gap: 8px;
  margin: 12px 0;
}

.group-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: var(--surface-2);
}

.group-head,
.group-actions,
.condition-row,
.value-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.group-head {
  margin-bottom: 6px;
}

.group-children {
  display: grid;
  gap: 6px;
}

.group-actions {
  margin-top: 6px;
}

.condition-row {
  padding: 6px;
  border-radius: 6px;
  background: var(--surface);
}

.condition-row.unavailable {
  opacity: 0.7;
}

.condition-row .grow {
  min-width: 120px;
}

.input.compact {
  padding: 5px 7px;
  font-size: 12px;
}

.fact-select {
  max-width: 150px;
}

.domain-list {
  min-height: 60px;
  width: 100%;
  resize: vertical;
}

.checkbox {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}

.text-button {
  border: 0;
  background: transparent;
  color: var(--accent);
  padding: 2px 4px;
  font-size: 12px;
}

.text-button.danger {
  color: var(--danger);
}

.text-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.unavailable-note {
  color: var(--danger);
  font-size: 11px;
}

.editor-foot {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

@media (max-width: 980px) {
  .strategy-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: 运行测试、类型检查与构建**

Run: `npx vitest run tests/unit/expr-edit.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

Run: `npm run build`

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add src/ui/dashboard/expr-edit.ts src/ui/dashboard/RuleEditor.tsx src/ui/dashboard/StrategiesPage.tsx src/ui/dashboard/Dashboard.tsx src/ui/styles/dashboard.css tests/unit/expr-edit.test.ts
git commit -m "feat: add strategy list and visual rule editor"
```
### Task 18: 关闭历史、设置页与视觉收尾

**Files:**
- Create: `src/ui/dashboard/history-selection.ts`、`HistoryPage.tsx`、`SettingsPage.tsx`
- Modify: `src/ui/dashboard/Dashboard.tsx`
- Modify: `src/ui/styles/dashboard.css`
- Test: `tests/unit/history-selection.test.ts`

**Interfaces:**
- Consumes: Task 12 的 `queryHistory`、`restoreHistory`、`deleteHistory`、`clearHistory`；Task 14 的消息类型。
- Produces:
  - `toggleSelection`、`selectAll`、`allSelected`
  - `HistoryPage`、`SettingsPage`
  - 稳定测试选择器：`history-search`、`history-row-<id>`、`history-select-<id>`、`history-restore`、`history-delete`、`history-clear`、`history-restore-mode`、`history-complete`、`history-total`、`settings-idle`、`settings-lock-enabled`、`settings-lock-delay`、`settings-retention`、`settings-save`、`settings-clear-history`

- [ ] **Step 1: 写选择工具测试**

Create `tests/unit/history-selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { allSelected, selectAll, toggleSelection } from '../../src/ui/dashboard/history-selection';

describe('history selection', () => {
  it('toggles ids immutably', () => {
    const first = toggleSelection(new Set(), 'a', true);
    const second = toggleSelection(first, 'b', true);
    const third = toggleSelection(second, 'a', false);
    expect([...first]).toEqual(['a']);
    expect([...second].sort()).toEqual(['a', 'b']);
    expect([...third]).toEqual(['b']);
  });

  it('selects all and reports completion', () => {
    const all = selectAll(['a', 'b', 'c']);
    expect(allSelected(['a', 'b'], all)).toBe(true);
    expect(allSelected(['a'], all)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/history-selection.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现选择工具**

Create `src/ui/dashboard/history-selection.ts`:

```ts
export function toggleSelection(selected: Set<string>, id: string, checked: boolean): Set<string> {
  const next = new Set(selected);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}

export function selectAll(ids: string[]): Set<string> {
  return new Set(ids);
}

export function allSelected(ids: string[], selected: Set<string>): boolean {
  return ids.length > 0 && ids.every((id) => selected.has(id));
}
```

- [ ] **Step 4: 实现关闭历史页**

Create `src/ui/dashboard/HistoryPage.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks';
import type { HistoryQuery, HistoryQueryResult, RestoreOptions, Trigger } from '../../shared/types';
import { formatRelativeTime } from '../../shared/time';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { toggleSelection } from './history-selection';

const PAGE_SIZE = 50;

export function HistoryPage() {
  const [query, setQuery] = useState('');
  const [trigger, setTrigger] = useState<Trigger | 'all'>('all');
  const [restored, setRestored] = useState<'all' | 'yes' | 'no'>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryQueryResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<RestoreOptions['mode']>('current-window');
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const request: HistoryQuery = { page, pageSize: PAGE_SIZE };
      if (query.trim()) request.query = query.trim();
      if (trigger !== 'all') request.trigger = trigger;
      if (restored !== 'all') request.restored = restored === 'yes';
      const next = await send<HistoryQueryResult>({ type: 'history.query', query: request });
      setResult(next);
      setSelected((current) => new Set([...current].filter((id) => next.items.some((item) => item.id === id))));
      setError(null);
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [query, trigger, restored, page]);

  async function restore() {
    if (selected.size === 0) return;
    try {
      const response = await send<{ restored: number; failed: unknown[] }>({
        type: 'history.restore',
        ids: [...selected],
        options: { mode, complete },
      });
      setNotice(`已恢复 ${response.restored} 个标签`);
      setSelected(new Set());
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  }

  async function remove() {
    if (selected.size === 0) return;
    if (!window.confirm(`删除 ${selected.size} 条历史记录？`)) return;
    try {
      await send({ type: 'history.delete', ids: [...selected] });
      setSelected(new Set());
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  }

  async function clear() {
    if (!window.confirm('清空全部关闭历史？此操作不可撤销。')) return;
    try {
      await send({ type: 'history.clear' });
      setSelected(new Set());
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  }

  const items = result?.items ?? [];
  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>关闭历史</h2>
          <p class="muted">默认保留 30 天或 5000 条。恢复不会删除记录。</p>
        </div>
        <span class="muted" data-testid="history-total">
          共 {result?.total ?? 0} 条
        </span>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner>{notice}</Banner>}

      <div class="toolbar">
        <input
          class="input"
          type="search"
          placeholder="搜索标题、URL 或域名"
          value={query}
          data-testid="history-search"
          onInput={(event) => {
            setQuery((event.currentTarget as HTMLInputElement).value);
            setPage(1);
          }}
        />
        <select
          class="input"
          value={trigger}
          onChange={(event) => {
            setTrigger((event.currentTarget as HTMLSelectElement).value as Trigger | 'all');
            setPage(1);
          }}
        >
          <option value="all">全部触发方式</option>
          <option value="idle">空闲</option>
          <option value="locked">锁屏</option>
          <option value="manual">手动</option>
        </select>
        <select
          class="input"
          value={restored}
          onChange={(event) => {
            setRestored((event.currentTarget as HTMLSelectElement).value as 'all' | 'yes' | 'no');
            setPage(1);
          }}
        >
          <option value="all">全部状态</option>
          <option value="no">未恢复</option>
          <option value="yes">已恢复</option>
        </select>
      </div>

      <div class="history-actions">
        <select
          class="input"
          value={mode}
          data-testid="history-restore-mode"
          onChange={(event) => setMode((event.currentTarget as HTMLSelectElement).value as RestoreOptions['mode'])}
        >
          <option value="current-window">恢复到当前窗口</option>
          <option value="original-window-groups">按原窗口分组新建</option>
        </select>
        <label class="checkbox">
          <input
            type="checkbox"
            checked={complete}
            data-testid="history-complete"
            onChange={(event) => setComplete((event.currentTarget as HTMLInputElement).checked)}
          />
          尝试完整恢复
        </label>
        <span class="grow" />
        <Button disabled={selected.size === 0} onClick={() => void restore()} data-testid="history-restore">
          恢复所选
        </Button>
        <Button variant="danger" disabled={selected.size === 0} onClick={() => void remove()} data-testid="history-delete">
          删除所选
        </Button>
        <Button variant="danger" onClick={() => void clear()} data-testid="history-clear">
          清空
        </Button>
      </div>

      {loading && <Spinner />}
      <div class="history-list">
        {items.map((item) => (
          <div class="history-row" data-testid={`history-row-${item.id}`} key={item.id}>
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              data-testid={`history-select-${item.id}`}
              onChange={(event) =>
                setSelected((current) =>
                  toggleSelection(current, item.id, (event.currentTarget as HTMLInputElement).checked),
                )
              }
              aria-label={`选择 ${item.title}`}
            />
            <div class="history-main">
              <div class="history-title">{item.title || item.url}</div>
              <div class="muted small history-url">{item.url}</div>
            </div>
            <div class="history-meta">
              <span>{item.domain || '本地文件'}</span>
              <span>{formatRelativeTime(Date.now(), item.closedAt)}</span>
              <span>{triggerLabel(item.trigger)}</span>
              <span>{item.restoredAt === null ? '未恢复' : '已恢复'}</span>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && <p class="muted empty">没有关闭历史。</p>}
      </div>

      <div class="pager">
        <Button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          上一页
        </Button>
        <span class="muted">
          第 {page} / {totalPages} 页
        </span>
        <Button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
          下一页
        </Button>
      </div>
    </section>
  );
}

function triggerLabel(trigger: Trigger): string {
  return trigger === 'idle' ? '空闲' : trigger === 'locked' ? '锁屏' : '手动';
}
```

- [ ] **Step 5: 实现设置页**

Create `src/ui/dashboard/SettingsPage.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks';
import type { Settings, StateSnapshot } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';

export function SettingsPage() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const next = await send<StateSnapshot>({ type: 'state.get' });
      setState(next);
      setForm(next.settings);
    } catch (error) {
      setError(messageOf(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!form) return;
    try {
      const next = await send<Settings>({
        type: 'settings.update',
        patch: {
          idleThresholdMinutes: Number(form.idleThresholdMinutes),
          lockCleanupEnabled: form.lockCleanupEnabled,
          lockDelayMinutes: Number(form.lockDelayMinutes),
          historyRetentionDays: Number(form.historyRetentionDays),
        },
      });
      setForm(next);
      setNotice('设置已保存');
      setError(null);
    } catch (error) {
      setError(messageOf(error));
    }
  }

  async function clearHistory() {
    if (!window.confirm('清空全部关闭历史？')) return;
    try {
      await send({ type: 'history.clear' });
      setNotice('关闭历史已清空');
    } catch (error) {
      setError(messageOf(error));
    }
  }

  if (!state || !form) return <p class="muted">正在加载设置…</p>;

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>设置</h2>
          <p class="muted">只使用 Chrome 原生状态，不采集使用数据，不发网络请求。</p>
        </div>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner>{notice}</Banner>}

      <div class="settings-grid">
        <label class="field">
          <span>空闲阈值（分钟）</span>
          <input
            class="input"
            type="number"
            min={1}
            max={1440}
            value={form.idleThresholdMinutes}
            data-testid="settings-idle"
            onInput={(event) => setForm({ ...form, idleThresholdMinutes: Number((event.currentTarget as HTMLInputElement).value) })}
          />
        </label>

        <label class="field">
          <span>历史保留（天）</span>
          <input
            class="input"
            type="number"
            min={1}
            max={365}
            value={form.historyRetentionDays}
            data-testid="settings-retention"
            onInput={(event) => setForm({ ...form, historyRetentionDays: Number((event.currentTarget as HTMLInputElement).value) })}
          />
        </label>

        <label class="checkbox field-inline">
          <input
            type="checkbox"
            checked={form.lockCleanupEnabled}
            data-testid="settings-lock-enabled"
            onChange={(event) => setForm({ ...form, lockCleanupEnabled: (event.currentTarget as HTMLInputElement).checked })}
          />
          锁屏时也执行清理
        </label>

        <label class="field">
          <span>锁屏后延迟（分钟）</span>
          <input
            class="input"
            type="number"
            min={0}
            max={1440}
            disabled={!form.lockCleanupEnabled}
            value={form.lockDelayMinutes}
            data-testid="settings-lock-delay"
            onInput={(event) => setForm({ ...form, lockDelayMinutes: Number((event.currentTarget as HTMLInputElement).value) })}
          />
        </label>
      </div>

      <div class="row settings-actions">
        <Button variant="primary" onClick={() => void save()} data-testid="settings-save">
          保存设置
        </Button>
        <Button variant="danger" onClick={() => void clearHistory()} data-testid="settings-clear-history">
          清空关闭历史
        </Button>
      </div>

      <section class="capability-box">
        <h3>浏览器能力</h3>
        <p class="muted small">
          Chrome {state.capabilities.chromeMajor ?? '未知'} · 最后访问时间{' '}
          {state.capabilities.lastAccessed ? '可用' : '不可用'} · 冻结状态{' '}
          {state.capabilities.frozen ? '可用' : '不可用'} · 标签组{' '}
          {state.capabilities.tabGroups ? '可用' : '不可用'} · 会话恢复{' '}
          {state.capabilities.sessions ? '可用' : '不可用'}
        </p>
        {state.warnings.map((warning) => (
          <Banner key={warning}>{warning}</Banner>
        ))}
      </section>
    </section>
  );
}
```

- [ ] **Step 6: 接入 Dashboard 并补样式**

Modify `src/ui/dashboard/Dashboard.tsx`:

```tsx
import { HistoryPage } from './HistoryPage';
import { SettingsPage } from './SettingsPage';

// 替换占位
{route === 'history' && <HistoryPage />}
{route === 'settings' && <SettingsPage />}
```

在 `src/ui/styles/dashboard.css` 追加：

```css
.history-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 6px 0 14px;
}

.history-list {
  display: grid;
  gap: 6px;
}

.history-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.history-main {
  min-width: 0;
}

.history-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  display: flex;
  gap: 10px;
  color: var(--muted);
  font-size: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 16px 0;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
}

.field-inline {
  align-self: end;
  padding-bottom: 8px;
}

.settings-actions {
  margin-bottom: 24px;
}

.capability-box {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.capability-box h3 {
  margin: 0 0 6px;
  font-size: 14px;
}

@media (max-width: 720px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .history-row {
    grid-template-columns: 18px minmax(0, 1fr);
  }

  .history-meta {
    grid-column: 2;
    justify-content: flex-start;
  }
}
```

- [ ] **Step 7: 运行测试、类型检查与构建**

Run: `npx vitest run tests/unit/history-selection.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

Run: `npm run build`

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add src/ui/dashboard/history-selection.ts src/ui/dashboard/HistoryPage.tsx src/ui/dashboard/SettingsPage.tsx src/ui/dashboard/Dashboard.tsx src/ui/styles/dashboard.css tests/unit/history-selection.test.ts
git commit -m "feat: add history and settings pages"
```

---

### Task 19: E2E、体积预算与最终验证

**Files:**
- Create: `tests/e2e/fixtures.ts`、`tests/e2e/test-server.mjs`、`tests/e2e/extension.spec.ts`
- Create: `scripts/check-bundle.mjs`
- Modify: `playwright.config.ts`、`package.json`
- Create: `README.md`

**Interfaces:**
- Consumes: 所有实现。
- Produces: 三条 E2E 流程、gzip 体积门禁、运行说明。

- [ ] **Step 1: 创建测试站点**

Create `tests/e2e/test-server.mjs`:

```js
import { createServer } from 'node:http';

const page = (title) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1></body></html>`;

const server = createServer((request, response) => {
  const path = request.url ?? '/';
  const titles = { '/a': 'Page A', '/b': 'Page B', '/keep': 'Keep' };
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(page(titles[path] ?? 'Fallback'));
});

server.listen(4173, '127.0.0.1', () => console.log('e2e server on http://127.0.0.1:4173'));
```

Modify `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: { headless: false },
  webServer: {
    command: 'node tests/e2e/test-server.mjs',
    port: 4173,
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 2: 创建 Playwright 扩展 fixture**

Create `tests/e2e/fixtures.ts`:

```ts
import { chromium, test as base, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';

const extensionPath = resolve('dist');

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});

export { expect } from '@playwright/test';
```

- [ ] **Step 3: 写三条 E2E 流程**

Create `tests/e2e/extension.spec.ts`:

```ts
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function seedUrlStrategy(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const expression = {
      type: 'any',
      id: 'e2e-root',
      children: [
        { type: 'condition', id: 'e2e-a', fact: 'url', op: 'matchesGlob', value: '*://127.0.0.1:4173/a*' },
        { type: 'condition', id: 'e2e-b', fact: 'url', op: 'matchesGlob', value: '*://127.0.0.1:4173/b*' },
      ],
    };
    const strategy = {
      id: 'e2e',
      name: 'E2E URL',
      builtin: false,
      expression,
      createdAt: 0,
      updatedAt: 0,
      lastPreviewHash: null,
      lastPreviewAt: null,
    };
    const preview = await chrome.runtime.sendMessage({ type: 'strategy.preview', strategy });
    if (!preview.ok) throw new Error(preview.message);
    const saved = await chrome.runtime.sendMessage({
      type: 'strategy.save',
      strategy,
      previewSignature: preview.data.signature,
    });
    if (!saved.ok) throw new Error(saved.message);
    const activated = await chrome.runtime.sendMessage({ type: 'strategy.activate', id: saved.data.id });
    if (!activated.ok) throw new Error(activated.message);
  });
}

test('idle/manual cleanup closes matching tabs and restores from history', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await seedUrlStrategy(dashboard);

  const keep = await context.newPage();
  await keep.goto('http://127.0.0.1:4173/keep');
  const a = await context.newPage();
  await a.goto('http://127.0.0.1:4173/a');
  const b = await context.newPage();
  await b.goto('http://127.0.0.1:4173/b');
  await keep.bringToFront();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByTestId('popup-preview-count')).toHaveText('2');
  await popup.getByTestId('cleanup-button').click();
  await popup.getByTestId('confirm-cleanup').click();
  await expect(popup.getByTestId('undo-button')).toBeVisible();

  const worker = context.serviceWorkers()[0]!;
  const urls = await worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => tab.url));
  expect(urls.some((url) => url?.includes('/a'))).toBe(false);
  expect(urls.some((url) => url?.includes('/b'))).toBe(false);

  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/history`);
  await expect(dashboard.getByTestId('history-total')).toContainText('2');
  const row = dashboard.locator('[data-testid^="history-row-"]').first();
  await row.locator('input[type="checkbox"]').check();
  await dashboard.getByTestId('history-restore').click();
  await expect
    .poll(async () => worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => tab.url)))
    .toEqual(expect.arrayContaining([expect.stringContaining('/a')]));
});

test('custom strategy can be duplicated, previewed, saved and activated from the editor', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);
  await expect(dashboard.getByTestId('new-strategy')).toBeVisible();

  await dashboard.getByTestId('strategy-duplicate-preset:standard').click();
  await expect(dashboard.getByTestId('rule-editor')).toBeVisible();
  await dashboard.getByTestId('rule-editor').locator('input[type="number"]').first().fill('2');
  await expect(dashboard.getByTestId('rule-preview-count')).toContainText('预览');
  await dashboard.getByTestId('save-strategy').click();
  await expect(dashboard.getByTestId('activate-strategy')).toBeEnabled();
  await dashboard.getByTestId('activate-strategy').click();
  await expect(dashboard.locator('.banner-error')).toHaveCount(0);
});

test('history search, delete and clear work', async ({ context, extensionId }) => {
  const worker = context.serviceWorkers()[0]!;
  await worker.evaluate(async () => {
    const summary = {
      id: 'seed-r1',
      url: 'https://seed.example.com/page',
      title: 'Seed page',
      domain: 'seed.example.com',
      closedAt: Date.now(),
      trigger: 'manual',
      status: 'closed',
      restoredAt: null,
    };
    const record = {
      ...summary,
      strategyId: 'preset:standard',
      strategyName: '标准',
      browserSessionId: 'e2e',
      windowId: 1,
      groupId: -1,
      groupTitle: '',
      groupColor: '',
      groupCollapsed: false,
      pinned: false,
      index: 0,
      sessionId: null,
      recovered: false,
    };
    await chrome.storage.local.set({ 'history:index': [summary], 'history:item:seed-r1': record });
  });

  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/history`);
  await expect(dashboard.getByTestId('history-total')).toContainText('1');
  await dashboard.getByTestId('history-search').fill('seed');
  await expect(dashboard.getByTestId('history-row-seed-r1')).toBeVisible();
  await dashboard.getByTestId('history-search').fill('missing');
  await expect(dashboard.getByTestId('history-row-seed-r1')).toHaveCount(0);
  await dashboard.getByTestId('history-search').fill('seed');
  await dashboard.getByTestId('history-select-seed-r1').check();
  dashboard.on('dialog', (dialog) => void dialog.accept());
  await dashboard.getByTestId('history-delete').click();
  await expect(dashboard.getByTestId('history-total')).toContainText('0');
});
```

- [ ] **Step 4: 添加体积门禁**

Create `scripts/check-bundle.mjs`:

```js
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const assets = readdirSync('dist/assets');
const measure = (extension) => {
  let total = 0;
  for (const file of assets.filter((name) => name.endsWith(extension))) {
    total += gzipSync(readFileSync(`dist/assets/${file}`)).length;
  }
  return total;
};

const js = measure('.js');
const css = measure('.css');
if (js > 60 * 1024) throw new Error(`JS gzip budget exceeded: ${js} bytes`);
if (css > 10 * 1024) throw new Error(`CSS gzip budget exceeded: ${css} bytes`);
console.log(`bundle ok (js ${js} bytes gzip, css ${css} bytes gzip)`);
```

修改 `package.json` 的 `build`：

```json
"build": "vite build && node scripts/check-build.mjs && node scripts/check-bundle.mjs"
```

- [ ] **Step 5: 安装 Playwright 浏览器并运行 E2E**

Run: `npx playwright install chromium`

Expected: 安装成功。CI 环境需要 `xvfb-run npx playwright test`，本地 headed 模式直接运行。

Run: `npm run test:e2e`

Expected: 三条 E2E 通过。若扩展页面未加载，检查 `dist/manifest.json` 的 `background.js` 与 `popup.html` 是否存在。

- [ ] **Step 6: 写 README**

Create `README.md`:

```md
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
```

- [ ] **Step 7: 运行最终验证**

Run: `npm run verify`

Expected: 类型检查、Biome、单元/集成测试、构建与 gzip 体积门禁全部通过。

Run: `npm run test:e2e`

Expected: 通过。

- [ ] **Step 8: 提交**

```bash
git add tests/e2e scripts/check-bundle.mjs playwright.config.ts package.json README.md
git commit -m "test: add end-to-end coverage and bundle budget"
```

---

## 计划自检

- Spec 覆盖：规则引擎、能力降级、清理守卫、写前历史、启动收敛、锁屏 alarm、历史恢复、策略预览门禁、E2E 均有对应任务与测试。
- 无占位符：每个任务给出实际文件、类型、函数与测试代码；后续任务只替换前序任务的临时占位页面。
- 类型/函数名一致：`Expr`、`FactKey`、`Operator`、`CleanupPlan`、`ClosedTabRecord`、`StrategyPreview`、`Repo`、`Browser`、`TabDormancyService` 在任务间保持一致。
- Review Focus 对应测试：Task 5/6（未知时间）、Task 6（最后标签）、Task 11（URL 变化、历史写入失败）、Task 10/14（预览门禁与内置策略保护）。
- 执行顺序：严格按 Task 1 → Task 19 执行；每个任务结束都运行对应测试并提交。
