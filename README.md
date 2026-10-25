English | [简体中文](README_zh.md)

# Tab Dormancy

> After your system goes idle or locks, close unimportant tabs according to rules you define; closed tabs go into a searchable, restorable history.

Tab Dormancy is a Chrome / Edge extension that does only one thing: tab cleanup. It does not interrupt you on a fixed schedule or use black-box scoring. Instead, you combine Chrome's native tab state with `AND / OR / NOT` to explicitly decide which tabs should be closed and which must be kept.

Before cleanup you can preview how many tabs will match; after cleanup you can view the closed history, undo the last operation, or restore in bulk by original window and tab group.

It is currently distributed through GitHub Releases and is not yet listed on the Chrome Web Store or Edge Add-ons.

## Why it exists

Over time, browser tabs pile up: pages left over from research, pages opened temporarily and then forgotten, articles you have not looked at in days. Cleaning up by hand is tedious, but closing everything risks losing work in progress.

It is for people who often keep many tabs open and want automatic cleanup after stepping away, without losing content.

Tab Dormancy's approach:

- **Act only when the system is idle or locked**, so it does not suddenly close tabs while you are working.
- **Rules are explainable**, and every condition maps to real tab state.
- **Preview before closing**, and custom strategies must be previewed before they can be enabled.
- **Restore after closing**, with history that keeps the URL, title, window, and tab group information.
- **Protect important tabs by default**, since pinned, audible, active, and grouped tabs can all be excluded.

It closes the tab itself rather than putting it into a `tabs.discard()`-style dormancy or unloading it. That genuinely frees the resources the tab occupies; restore from history when you need it again.

## Features

### Automatic triggers, not scheduled interruptions

- **Idle trigger**: run a cleanup once the system has been idle for the configured threshold, 15 minutes by default.
- **Lock-screen trigger**: after the screen locks, wait another 15 minutes by default; unlocking during that time cancels this cleanup. You can disable the lock-screen trigger or set the delay to 0 to run immediately.
- **Manual trigger**: preview and clean up at any time from the popup or dashboard.
- **No cleanup on startup**: on browser startup it only validates state, evicts history, and reconciles unfinished cleanup; it does not close tabs as soon as the browser opens.

### Composable rule engine

Rules are not a fixed set of switches but an expression tree:

- Supports `AND` (all must match), `OR` (any must match), and `NOT` (negation).
- Groups can nest up to 8 levels, with at most 200 total nodes.
- A condition consists of "tab fact + operator + value".
- Text comparisons are case-insensitive.
- Domain matching respects hostname boundaries: `google.com` matches `mail.google.com` but not `evilgoogle.com`.
- Wildcards support `*` and `?`; regular expressions are not supported.

### Three ready-to-use presets

| Preset | Match condition | Extra protection |
|---|---|---|
| Mild | Not visited for more than 7 days | Pinned, audible, active, in a tab group |
| Standard | Not visited for more than 3 days | Pinned, audible, active, in a tab group |
| Aggressive | Not visited for more than 1 day | Pinned, audible, active |

"Standard" is enabled by default. Presets are read-only; copy one to modify it freely.

### Preview, explain, then execute

- The popup shows how many tabs the current strategy is expected to clean up.
- The dashboard's "Tabs" page marks matches; expand a match to see the actual value of each condition's facts.
- Custom strategies preview the match count in real time while editing; a strategy that has not been successfully previewed cannot be enabled.
- If a strategy uses a fact the current browser does not support, automatic cleanup pauses and shows the reason instead of silently skipping.

### Safe cleanup

Beyond the rules themselves, the extension enforces a set of protections that cannot be bypassed:

- Only handles `http:`, `https:`, and `file:` pages.
- Skips incognito windows and internal pages such as `chrome://`, `edge://`, `devtools://`, and extension pages.
- Keeps at least one tab per window, preferring the active tab, then the most recently accessed tab.
- Re-reads the tab before closing and confirms that `id`, `windowId`, and URL are unchanged; if anything changed, it skips the tab.
- Writes the close snapshot to history first; if the write fails, it cancels this cleanup and closes no tabs.
- Cleanup jobs are mutually exclusive, close at most 4 tabs at a time, and a failure on one tab does not affect the others.
- The result of the most recent cleanup can be undone from the popup.

### Searchable, restorable closed history

- Retains records for 30 days and up to 5,000 entries by default; both the retention days and the maximum entry count can be adjusted in settings.
- Search by title, URL, or domain, and filter by trigger (idle / locked / manual) and restore status.
- Supports single-select, multi-select, and bulk restore.
- Restore to the current window, or create new windows grouped by original window.
- Makes a best effort to restore tab groups, pinned state, and grouping attributes.
- When restoring to the current window, it first tries to restore more native state through Chrome's `sessions` API by default, falling back to opening the URL normally on failure; when rebuilding the original window, it prioritizes window and group placement.
- After a restore, records are not deleted but marked as "restored".

### Local-first

- No network requests, telemetry, analytics, or remote configuration.
- No content scripts; does not inject into web pages.
- No `history` permission; does not read browsing history.
- Does not request host permissions.
- Settings, strategies, and history are stored in local `chrome.storage.local`, and temporary session IDs are stored in `chrome.storage.session`; cloud sync is not used.

## Installation

The extension is currently distributed through GitHub Releases:

1. Open [Releases](https://github.com/Aj002Th/tab-dormancy/releases).
2. Download the latest `tab-dormancy-vX.Y.Z.zip`.
3. Extract it to a fixed directory and keep that directory.
4. Open `chrome://extensions`, or `edge://extensions` in Edge.
5. Turn on "Developer mode" in the top right.
6. Click "Load unpacked" and select the extracted directory.
7. To update, download the ZIP again, overwrite the extracted directory, and then click "Reload" on the extensions page.

> This is a developer-mode installation, not a one-click store install, and it does not update automatically. Chrome and Edge security policies do not allow regular users to install `.crx` files directly from GitHub.

Supports Chrome 121+ and the latest Chromium-based Edge. Firefox and Safari are not supported.

## Usage

### Popup

Click the Tab Dormancy icon in the toolbar:

- View the currently enabled strategy and the expected cleanup count.
- After you click the cleanup button, a confirmation box expands in place; tabs close only after you confirm.
- When cleanup finishes, you can undo it or open the dashboard to continue.
- If something is abnormal, such as a strategy being unavailable or cleanup already in progress, the popup shows the reason directly.

### Dashboard

Click the gear button in the top right of the popup, or "Extension options" on the extension details page, to open the dashboard.

| Page | Purpose |
|---|---|
| Tabs | View the current strategy, manageable tabs, match status, fact values, and rule evaluation; filter by window when there are multiple windows, and start cleanup directly |
| Closed history | Search, filter, bulk restore, delete, or clear history |
| Strategies | View presets and custom strategies; click a card to view and edit rules, or enable, copy, or delete one |
| Settings | Adjust appearance theme, idle cleanup, lock-screen cleanup, and history retention in groups; restore defaults or discard unsaved changes; a pinned bar at the bottom shows unsaved/saved status, leaving the page confirms unsaved changes, and a failed load can be retried directly |
| Diagnostics | View the Chrome version and capability support to determine which rules can run; warnings such as paused strategies appear at the top of every page |

### Editing strategies

1. On the "Strategies" page, click any strategy card to view and edit its rules; creating a strategy or copying a preset opens the editor directly and shows a live-updating "Draft" card at the bottom of the list. Clicking "Cancel creation" in the editor removes the draft card as well. Strategy cards summarize rules with the primary condition and an "Exclude" label; view the full conditions in the editor on the right, which aligns with the currently selected card and scrolls into view automatically.
2. Use the visual editor to add conditions or subgroups, switch `AND / OR`, and add "negate" to a condition or group. Boolean conditions express true/false directly through "negate"; there is no need to choose "yes / no".
3. Time-based numeric conditions accept minutes, hours, or days and are stored internally in minutes; changes preview the expected match count in real time, and hovering over the preview tooltip shows up to 5 matching examples. Strategy cards display time limits in days, hours, or minutes.
4. Save after a successful preview to enable the strategy; custom strategies that have not been previewed cannot be enabled. An enabled strategy's button shows "Active" and cannot be clicked again; when the currently enabled strategy has no content changes, the "Save" and "Save and enable" buttons are also disabled.
5. Built-in presets cannot be modified or deleted, only copied, and do not show a save button; an enabled strategy cannot be deleted, and at least one strategy must remain.

### Common rule examples

The examples below illustrate rule meaning; configure them with the visual editor when editing:

- **Protect work sites**: `NOT domain inDomainList ["github.com", "company.com"]`
- **Clean up only during a big sweep**: `totalTabCount > 30 AND lastActiveMinutes > 1440`
- **Clean up only outside the current window**: `windowFocused is false AND lastActiveMinutes > 1440`
- **Protect tab groups whose name contains "Work"**: `NOT (grouped AND groupTitle contains "Work")`

> If a tab's "last accessed time" is unavailable, all numeric comparisons based on `lastActiveMinutes` are treated as no match to avoid accidental closes.

## Rule conditions

### Available facts

| Fact | Type | Meaning |
|---|---|---|
| `lastActiveMinutes` | Number | Minutes since the last access; treated as unknown and does not match when unavailable |
| `totalTabCount` | Number | Total number of manageable tabs across all normal windows |
| `windowTabCount` | Number | Number of manageable tabs in the same window |
| `pinned` | Boolean | Whether the tab is pinned |
| `audible` | Boolean | Whether the tab is playing sound |
| `active` | Boolean | Whether the tab is the active tab in its window |
| `muted` | Boolean | Whether the tab is muted |
| `discarded` | Boolean | Whether the tab has been discarded by the browser |
| `frozen` | Boolean | Whether the tab has been frozen by Chrome (requires Chrome 132+) |
| `grouped` | Boolean | Whether the tab belongs to a tab group |
| `groupCollapsed` | Boolean | Whether the tab's tab group is collapsed |
| `windowFocused` | Boolean | Whether the tab's window is focused |
| `onlyTabInWindow` | Boolean | Whether the tab is the only manageable tab in its window |
| `domain` | Text | Hostname, for example `mail.google.com` |
| `url` | Text | Full URL |
| `title` | Text | Page title |
| `groupTitle` | Text | Tab group name; an empty string when not grouped |

`lastActiveMinutes` relies on the browser's `lastAccessed` field; `frozen` requires Chrome 132+; `grouped`, `groupCollapsed`, and `groupTitle` rely on tab group capabilities. Facts that the current browser does not support are disabled in the editor.

"Manageable tabs" means tabs whose scheme is `http:`, `https:`, or `file:` in normal, non-incognito windows. Incognito windows and browser-internal pages are not counted and will not be closed.

### Operators

| Type | Operators |
|---|---|
| Number | `gt`, `gte`, `lt`, `lte`, `eq`, `neq` |
| Boolean | `is` |
| Text | `equals`, `contains`, `startsWith`, `endsWith` |
| Domain | In addition to text operators, supports `matchesDomain`, `inDomainList` |
| Wildcard | `matchesGlob`, supports `*` and `?` |
| Logic | `all` (AND), `any` (OR), `not` (NOT) |

### Expression limits

- Each `AND` / `OR` group has at least 1 child node and at most 20 direct children.
- `NOT` must have exactly 1 child node.
- Expression depth does not exceed 8, and total nodes do not exceed 200.
- Empty groups cannot be saved because an empty `AND` matches every tab.
- Numbers must be finite; minute values range from 0 to 525,600.
- Text length does not exceed 512; domain lists take one entry per line, up to 50 entries.
- Operators must match the fact type; facts that the current browser does not support cannot be saved or enabled.

## Architecture

The project is layered into "pure logic, browser adapter, background orchestration, and UI"; core logic does not depend directly on Chrome APIs, which makes it easier to test and explain.

```text
src/
  core/       Pure functions: fact building, rule evaluation, cleanup planning, history and restore planning
  platform/   Chrome API adapters: tabs/windows/idle/alarms/tabGroups/sessions/storage
  background/ service worker: event listeners, message routing, composition root
  ui/         popup and dashboard, reading and writing only through typed messages
  shared/     Cross-layer types, constants, errors, and URL utilities
```

Runtime data flow:

```text
chrome.idle / alarm / user actions
              │
              ▼
   background service worker
              │
              ▼
   core: rule evaluation → cleanup plan → history snapshot
              │
              ▼
   chrome.tabs / chrome.storage
              ▲
              │
   popup / dashboard (typed messages)
```

Key design decisions:

- **`core` does not import `chrome.*`**: inputs are tab snapshots, window/group snapshots, strategies, and the current time; outputs are facts, match results, cleanup plans, and restore plans.
- **`background` is the only composition root**: it listens for idle, lock, alarm, and UI messages, reads state, calls core, and writes back to storage.
- **The UI does not close tabs directly**: all write operations such as cleanup, restore, strategies, and settings go through typed messages to the service worker.
- **Capability detection and degradation**: detects at runtime whether `lastAccessed`, `frozen`, `tabGroups`, and `sessions` are available; unsupported facts are disabled in the editor, and strategies containing them pause automatic cleanup.
- **Sharded history storage**: `history:index` stores summaries and `history:item:<id>` stores full records, avoiding rewriting all history on every update.
- **Temporary session ID**: the browser session ID is stored in `chrome.storage.session` to correctly distinguish original windows during restore, avoiding incorrect merging when `windowId` is reused after a browser restart.

## Permissions

| Permission | Purpose |
|---|---|
| `tabs` | Read tab URLs, titles, and states; close tabs |
| `storage` | Save settings, strategies, and closed history, locally only |
| `idle` | Detect system idle or locked state |
| `alarms` | One-time timer for delayed cleanup after lock |
| `tabGroups` | Read tab group information and recreate tab groups on restore |
| `sessions` | Try a full restore by default when restoring, used only when the user triggers a restore |

Does not request `history`, host permissions, `webRequest`, `webNavigation`, or `unlimitedStorage`, and does not inject content scripts.

## Development

```bash
npm ci
npm run icons
npm run dev
```

`npm run dev` continuously watches source files and rebuilds `dist/`, but the browser does not reload the extension automatically. After each build, click "Reload" for Tab Dormancy in `chrome://extensions`; if the dashboard is already open, refresh the page as well.

Common commands:

| Command | Description |
|---|---|
| `npm run dev` | Vite watch build |
| `npm run build` | One-off build with artifact and size-budget checks |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Biome check |
| `npm test` | Unit and integration tests |
| `npm run test:e2e` | Build, then run Playwright E2E |
| `npm run verify` | typecheck + lint + test + build |
| `npm run package` | Build and produce a release ZIP |
| `npm run package:zip` | Package the existing `dist/` only |

E2E requires installing a browser first:

```bash
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` uses headed Chromium; on Linux CI it must be run through `xvfb-run`.

## Packaging

```bash
npm run package
```

Output:

```text
release/
  tab-dormancy-vX.Y.Z.zip
  SHA256SUMS
```

The ZIP contains the contents of `dist/`, with `manifest.json` at the archive root. Packaging verifies:

- `package.json` and `dist/manifest.json` have the same version;
- when `--tag` is passed, the tag matches the version;
- the build artifacts are complete and pass the JS/CSS size gates.

## Release

Releases are automated by `.github/workflows/release.yml`. After a `v*` tag is pushed, GitHub Actions installs dependencies, runs `verify` and E2E, packages the ZIP, and then creates a GitHub Release with the ZIP and checksums attached.

Before releasing, set the versions in `package.json` and `public/manifest.json` to the same value, for example `0.2.0`:

```bash
npm version 0.2.0 --no-git-tag-version
# Manually change the version in public/manifest.json to 0.2.0

npm run verify
git add package.json package-lock.json public/manifest.json
git commit -m "chore: release v0.2.0"
git tag v0.2.0
git push origin master --tags
```

If the tag does not match the version in `package.json` or `manifest.json`, the workflow fails immediately and does not create a Release.

To rebuild an existing tag, manually run the `Release` workflow in GitHub Actions and enter the existing tag.

## Current limitations

- Not yet listed in official stores; GitHub Release installation requires developer mode and does not update automatically.
- Only supports Chromium browsers such as Chrome / Edge; Firefox / Safari are not supported.
- Closes tabs rather than putting them into dormancy; restore relies mainly on URLs, and full page state is not guaranteed.
- No cross-device sync, usage statistics, data export, or analytics dashboard.
- Does not handle incognito windows.
- Closed history is retained for 30 days and up to 5,000 entries by default; both can be adjusted in settings.
