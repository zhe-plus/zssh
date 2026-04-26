# ZSSH E2E Tests

End-to-end tests for ZSSH SSH client application using Playwright.

## Prerequisites

1. Build the project first:
   ```bash
   npm run build
   ```

2. Install Playwright browsers:
   ```bash
   npx playwright install
   ```

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI (debug mode)
npm run test:e2e:ui

# Run specific test file
npx playwright test e2e/app.spec.ts

# Run specific test suite
npx playwright test -g "Terminal Search"

# Run in debug mode (with inspector)
npx playwright debug e2e/terminal.spec.ts
```

## Test Suite Coverage

### 1. Smoke Tests (`app.spec.ts`) — 8 tests
- Application renders without crashing
- Document title validation
- Sidebar visibility
- Status bar presence
- **Keyboard shortcuts**: Ctrl+Shift+P, Escape, Ctrl+F, Ctrl+R
- **Error handling**: Console error filtering, rapid input stability, window resize
- **Visual rendering**: Dark theme CSS variables, layout stability

### 2. Sidebar & Session Management (`sidebar.spec.ts`) — 7 tests
- Sidebar DOM presence
- New session button interaction
- Group management buttons
- Context menu on right-click
- Sidebar collapse/expand toggle
- Tab bar rendering and tab switching
- Session editor dialog open/close/form fields

### 3. Terminal Interaction (`terminal.spec.ts`) — 12 tests
- **Ctrl+F Search Bar**:
  - Activate/close search mode
  - Text input acceptance
  - Enter/Shift+Enter navigation
  - Escape to close
- **Ctrl+R Command History**:
  - Open history modal
  - Real-time filter results
  - Arrow key navigation
  - Escape close
- **Quick Commands**: Dropdown existence, standard command options
- **Auto-Complete**: Tab key safety, prefix + Tab completion trigger
- **Paste Protection**: Single-line paste, multi-line paste with dangerous commands

### 4. Settings Modal (`settings.spec.ts`) — 14 tests
- **Open/Close**: Button/shortcut open, Escape close, backdrop click close
- **Tab Navigation**: Multiple tabs, tab switching
- **Theme Selection**: Theme cards/options, CSS variable update on change
- **Language Switching**: zh-CN/zh-TW/en-US options, text update
- **Import/Export**: Export button, safe export option (no sensitive data)
- **Shortcuts Configuration**: Editable shortcuts list
- **Common Commands Editor**: Default command list display

### 5. SFTP Panel (`sftp.spec.ts`) — 11 tests
- SFTP panel toggle via button
- Split direction toggle
- **Toolbar**: Refresh/Up/Mkdir/Upload buttons, upload disabled state when disconnected
- **Folder Sync Dialog**: Open from toolbar button
- **Filter Toolbar**:
  - Search box text input
  - Type toggle (all/dir/file)
  - Hidden files eye icon toggle
  - Count badge updates
- **File List**: Header row, directory link navigation
- **Context Menu**: Right-click menu, Download/Rename/Delete/Edit options
- **Transfer Progress UI**: Progress bar component rendering

### 6. Error Boundary & StatusBar (`errorBoundary.spec.ts`) — 13 tests
- **Error Boundary**:
  - Error catching verification
  - Fallback UI recovery options
  - localStorage persistence across reloads
  - clearLoggedErrors functionality
- **Status Bar**:
  - Bottom viewport positioning
  - UTF-8 encoding display
  - Version number visibility
  - Connection state visual indicator
  - Viewport size adaptation
- **Layout Persistence**:
  - Last used layout save/load
  - Custom layouts CRUD
  - Expired layout (>30 days) auto-ignore
- **Variable Replacer Integration**:
  - Variable replacement correctness (${host}, ${user}, ${port}, etc.)
  - Unresolved variable detection

## Total: **65 test cases** across 6 test files

## Architecture Notes

Since ZSSH is a **Tauri desktop application**, these E2E tests verify:

| Layer | What's Tested | Limitations |
|------|---------------|-------------|
| **React Frontend** | Component rendering, state management, UI interactions | Full coverage |
| **Keyboard Shortcuts** | All registered shortcut handlers work without JS errors | Full coverage |
| **localStorage** | Layout persistence, error log persistence, settings storage | Full coverage |
| **CSS/Styling** | Theme switching, responsive layout, dark mode | Full coverage |
| **Tauri Backend APIs** | Graceful degradation in browser preview mode | Requires Tauri runtime for full integration |

### Expected Warnings in Browser Preview Mode

Some console errors are expected when running outside Tauri:
- `window.__TAURI__` / `__TAURI_INTERNALS__` not defined
- `postMessage` errors from missing Tauri webview bridge
- "Not implemented" stub warnings

The test framework filters these automatically.

## Adding New Tests

```typescript
import { test, expect } from "@playwright/test";

test.describe("Feature Name", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should do something", async ({ page }) => {
    // Arrange: set up state
    // Act: interact with UI
    // Assert: verify result
  });
});
```

### Best Practices for ZSSH E2E

1. **Always use `test.beforeEach`** to navigate to home page
2. **Use `page.waitForTimeout()`** for animation/state transitions (100-300ms)
3. **Check element count before clicking** — some components are conditionally rendered
4. **Filter Tauri-specific console errors** — don't fail on expected preview-mode errors
5. **Clean up modals/dialogs** in each test — use Escape or backdrop click
6. **Test both happy path and error recovery** — especially for error boundary scenarios
