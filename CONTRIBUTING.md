# Contributing to Emoji & Symbols Copy and Paste

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- Chrome, Edge, or Firefox browser
- Git

### Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/emoji-symbols-copy-paste.git
   ```

2. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked** → select the `chrome-extension/` folder

3. Make your changes, then reload the extension to test.

> All data files are included in the repository. No build step or Node.js required.

## Code Guidelines

### Structure

The extension source lives in `chrome-extension/`:

```
chrome-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── popup.html             # Popup UI markup
├── popup.css              # Popup styles
├── popup.js               # Popup logic (~620 lines)
├── service-worker.js      # Background events (install/uninstall)
├── browser-polyfill.min.js # WebExtension API polyfill
├── data/
│   └── all-data.json      # All emoji, symbol, and lenny face data
└── icons/
    └── icon-{16,32,48,128}.png
```

### Rules

- **File size**: Keep `popup.js` under 700 lines. If it grows beyond that, discuss in an issue first.
- **CSP compliance**: No inline scripts (`<script>` in HTML) or inline styles (`style="..."` attributes). All JS goes in `.js` files, all CSS in `.css` files.
- **Browser API**: Use `browser.*` namespace (not `chrome.*`). The polyfill handles cross-browser compatibility.
- **No external requests**: The extension must work 100% offline. Do not add fetch calls, CDN imports, or analytics.
- **Accessibility**: Maintain keyboard navigation support (arrow keys, Enter, Tab, Escape).

### Testing

Before submitting a PR:

1. Load the unpacked extension in Chrome
2. Verify all three tabs work (Emojis, Symbols, Lenny Faces)
3. Test search functionality
4. Test copy-to-clipboard
5. Test keyboard navigation
6. Check the console for errors (`chrome://extensions/` → Details → Inspect views)

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes following the code guidelines above
3. Test thoroughly in Chrome
4. Submit a PR with a clear description of what changed and why

## Reporting Bugs

Open an issue with:
- Browser name and version
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)

## Feature Requests

Open an issue describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered
