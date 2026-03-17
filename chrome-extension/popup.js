/**
 * popup.js — Emoji & Symbols Copy and Paste + Lenny Face
 *
 * Uses browser.* namespace via webextension-polyfill (Chrome/Edge/Firefox compatible).
 * No inline scripts, no eval — fully CSP compliant.
 *
 * Modules:
 *   [1] State & Constants
 *   [2] Data Loading
 *   [3] DOM Utilities
 *   [4] Clipboard
 *   [5] Toast
 *   [6] Recently Used
 *   [7] Search
 *   [8] Category Rendering (with IntersectionObserver lazy load)
 *   [9] Tab Navigation
 *   [10] Keyboard Navigation
 *   [11] Init
 */

'use strict';

/* ================================================================
   [1] State & Constants
   ================================================================ */

/** Global application state */
const state = {
  /** @type {{ emoji: Array, symbol: Array, lenny: Array } | null} */
  data: null,
  /** @type {'emoji' | 'symbol' | 'lenny'} */
  activeTab: 'emoji',
  /** @type {string} */
  searchQuery: '',
  /** @type {Array<{symbol: string, title: string, type: string}>} */
  recentItems: [],
  /** @type {number | null} */
  searchDebounceTimer: null,
  /** @type {IntersectionObserver | null} */
  categoryObserver: null,
};

const RECENT_MAX = 50;
const SEARCH_MAX = 200;
const SEARCH_DEBOUNCE_MS = 300;
const TOAST_DURATION_MS = 1500;

/* ================================================================
   [2] Data Loading
   ================================================================ */

/**
 * Fetch extension's bundled all-data.json
 * @returns {Promise<void>}
 */
async function loadData() {
  const url = browser.runtime.getURL('data/all-data.json');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load data: ${response.status}`);
  state.data = await response.json();
}

/**
 * Load recently used items from browser.storage.local
 * @returns {Promise<void>}
 */
async function loadRecentItems() {
  try {
    const result = await browser.storage.local.get('recentItems');
    state.recentItems = Array.isArray(result.recentItems) ? result.recentItems : [];
  } catch {
    state.recentItems = [];
  }
}

/**
 * Persist recently used items to browser.storage.local
 * @returns {Promise<void>}
 */
async function saveRecentItems() {
  try {
    await browser.storage.local.set({ recentItems: state.recentItems });
  } catch {
    // Non-critical: silently ignore storage errors
  }
}

/* ================================================================
   [3] DOM Utilities
   ================================================================ */

/**
 * Show an element by removing the hidden attribute
 * @param {HTMLElement} el
 */
function show(el) { el.hidden = false; }

/**
 * Hide an element by setting the hidden attribute
 * @param {HTMLElement} el
 */
function hide(el) { el.hidden = true; }

/**
 * Create a symbol button element
 * @param {string} symbol - The unicode symbol/emoji
 * @param {string} title  - Accessible name
 * @param {string} type   - 'emoji' | 'symbol' | 'lenny'
 * @returns {HTMLButtonElement}
 */
function createSymbolButton(symbol, title, type) {
  const btn = document.createElement('button');
  btn.className = 'symbol-item' + (type === 'lenny' ? ' symbol-item--lenny' : '');
  btn.textContent = symbol;
  btn.setAttribute('aria-label', title);
  btn.setAttribute('title', title);
  btn.setAttribute('tabindex', '0');
  btn.dataset.symbol = symbol;
  btn.dataset.title = title;
  btn.dataset.type = type;
  return btn;
}

/**
 * Get the number of columns in a CSS grid element
 * @param {HTMLElement} grid
 * @returns {number}
 */
function getGridColumnCount(grid) {
  const style = window.getComputedStyle(grid);
  const cols = style.getPropertyValue('grid-template-columns');
  return cols.split(' ').length;
}

/* ================================================================
   [4] Clipboard
   ================================================================ */

/**
 * Copy text to clipboard, with execCommand fallback
 * @param {string} text
 * @returns {Promise<boolean>} true if successful
 */
async function copyToClipboard(text) {
  // Primary: Async Clipboard API (available in extension popup context)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand
    }
  }

  // Fallback: execCommand (deprecated but widely supported)
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

/* ================================================================
   [5] Toast
   ================================================================ */

let toastTimer = null;

/**
 * Show a toast notification
 * @param {string} message
 * @param {number} [duration=TOAST_DURATION_MS]
 */
function showToast(message, duration = TOAST_DURATION_MS) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('toast--visible');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, duration);
}

/* ================================================================
   [6] Recently Used
   ================================================================ */

/**
 * Add an item to recently used, dedup and limit to RECENT_MAX
 * @param {string} symbol
 * @param {string} title
 * @param {string} type
 */
async function addToRecent(symbol, title, type) {
  // Remove duplicate
  state.recentItems = state.recentItems.filter(item => item.symbol !== symbol);
  // Prepend
  state.recentItems.unshift({ symbol, title, type });
  // Trim to max
  if (state.recentItems.length > RECENT_MAX) {
    state.recentItems = state.recentItems.slice(0, RECENT_MAX);
  }
  await saveRecentItems();
  renderRecentSection();
}

/**
 * Render the recently used section
 */
function renderRecentSection() {
  const section = document.getElementById('recent-section');
  const grid = document.getElementById('recent-grid');
  if (!section || !grid) return;

  if (state.recentItems.length === 0 || state.searchQuery !== '') {
    hide(section);
    return;
  }

  grid.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (const item of state.recentItems.slice(0, 20)) {
    const wrap = document.createElement('div');
    wrap.className = 'recent-item-wrap';
    wrap.setAttribute('role', 'listitem');

    const btn = createSymbolButton(item.symbol, item.title, item.type);

    // Delete button (right-corner ×, appears on hover)
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-item-btn';
    delBtn.setAttribute('aria-label', 'Remove from recently used');
    delBtn.textContent = '×';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeRecentItem(item.symbol);
    });

    wrap.appendChild(btn);
    wrap.appendChild(delBtn);
    fragment.appendChild(wrap);
  }
  grid.appendChild(fragment);
  show(section);
}

/**
 * Remove a single item from recently used
 * @param {string} symbol
 */
async function removeRecentItem(symbol) {
  state.recentItems = state.recentItems.filter(item => item.symbol !== symbol);
  await saveRecentItems();
  renderRecentSection();
}

/**
 * Clear all recently used items
 */
async function clearAllRecentItems() {
  state.recentItems = [];
  await browser.storage.local.remove('recentItems');
  renderRecentSection();
}

/* ================================================================
   [7] Search
   ================================================================ */

/**
 * Handle search input with debounce
 * @param {Event} event
 */
function handleSearchInput(event) {
  const query = event.target.value.trim();
  clearTimeout(state.searchDebounceTimer);
  state.searchDebounceTimer = setTimeout(() => {
    state.searchQuery = query;
    if (query === '') {
      showCategoryView();
    } else {
      performSearch(query);
    }
  }, SEARCH_DEBOUNCE_MS);
}

/**
 * Show the normal category view (hide search results)
 */
function showCategoryView() {
  const searchResults = document.getElementById('search-results');
  const panels = document.querySelectorAll('.tab-panel');

  hide(searchResults);
  panels.forEach(p => hide(p));

  const activePanel = document.getElementById(`panel-${state.activeTab}`);
  if (activePanel) show(activePanel);

  renderRecentSection();
}

/**
 * Search across all types and render results
 * @param {string} query
 */
function performSearch(query) {
  if (!state.data) return;

  const lowerQuery = query.toLowerCase();
  const results = [];

  outerLoop:
  for (const type of ['emoji', 'symbol', 'lenny']) {
    for (const cat of state.data[type]) {
      const catMatch = cat.category.toLowerCase().includes(lowerQuery);
      for (const item of cat.symbols) {
        if (
          catMatch ||
          item.symbol.includes(query) ||
          item.title.toLowerCase().includes(lowerQuery)
        ) {
          results.push({ symbol: item.symbol, title: item.title, type });
          if (results.length >= SEARCH_MAX) break outerLoop;
        }
      }
    }
  }

  renderSearchResults(query, results);
}

/**
 * Render search results panel
 * @param {string} query
 * @param {Array} results
 */
function renderSearchResults(query, results) {
  const searchResults = document.getElementById('search-results');
  const searchGrid = document.getElementById('search-grid');
  const searchEmpty = document.getElementById('search-empty');
  const searchCount = document.getElementById('search-results-count');
  const queryDisplay = document.getElementById('search-query-display');
  const panels = document.querySelectorAll('.tab-panel');
  const recentSection = document.getElementById('recent-section');

  // Hide category panels and recent section
  panels.forEach(p => hide(p));
  if (recentSection) hide(recentSection);

  if (results.length === 0) {
    searchGrid.innerHTML = '';
    if (queryDisplay) queryDisplay.textContent = query;
    show(searchEmpty);
    if (searchCount) searchCount.textContent = '';
  } else {
    hide(searchEmpty);
    if (searchCount) {
      searchCount.textContent = `${results.length}${results.length === SEARCH_MAX ? '+' : ''} results`;
    }

    searchGrid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (const item of results) {
      fragment.appendChild(createSymbolButton(item.symbol, item.title, item.type));
    }
    searchGrid.appendChild(fragment);
  }

  show(searchResults);
}

/* ================================================================
   [8] Category Rendering
   ================================================================ */

/**
 * Render all categories for a given type into the panel.
 * Uses IntersectionObserver to lazily render category grids.
 *
 * @param {'emoji' | 'symbol' | 'lenny'} type
 */
function renderTabPanel(type) {
  const panel = document.getElementById(`panel-${type}`);
  if (!panel || !state.data) return;

  panel.innerHTML = '';

  // Disconnect previous observer
  if (state.categoryObserver) {
    state.categoryObserver.disconnect();
  }

  const isLenny = type === 'lenny';
  const fragment = document.createDocumentFragment();

  for (const cat of state.data[type]) {
    const section = document.createElement('div');
    section.className = 'category-section';
    section.dataset.category = cat.category;
    section.dataset.type = type;

    // Category heading
    const heading = document.createElement('h2');
    heading.className = 'section-heading';
    heading.textContent = cat.category;
    section.appendChild(heading);

    // Grid placeholder (symbols rendered lazily)
    const grid = document.createElement('div');
    grid.className = 'symbol-grid' + (isLenny ? ' symbol-grid--lenny' : '');
    grid.setAttribute('role', 'list');
    grid.setAttribute('aria-label', cat.category);
    grid.dataset.pending = 'true';

    // Store symbols data on element for lazy rendering
    grid._symbols = cat.symbols;
    grid._type = type;

    section.appendChild(grid);
    fragment.appendChild(section);
  }

  panel.appendChild(fragment);

  // Set up IntersectionObserver for lazy rendering
  state.categoryObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const grid = entry.target;
          if (grid.dataset.pending === 'true') {
            renderCategoryGrid(grid);
            delete grid.dataset.pending;
            state.categoryObserver.unobserve(grid);
          }
        }
      }
    },
    { rootMargin: '120px' }
  );

  // Observe all grids
  panel.querySelectorAll('.symbol-grid[data-pending]').forEach(grid => {
    state.categoryObserver.observe(grid);
  });
}

/**
 * Render symbols into a grid element (called by IntersectionObserver)
 * @param {HTMLElement} grid
 */
function renderCategoryGrid(grid) {
  const symbols = grid._symbols;
  const type = grid._type;
  if (!symbols || !type) return;

  const fragment = document.createDocumentFragment();
  for (const item of symbols) {
    fragment.appendChild(createSymbolButton(item.symbol, item.title, type));
  }
  grid.appendChild(fragment);
}

/**
 * Render the skeleton to indicate loading
 */
function showSkeleton() {
  const skeleton = document.getElementById('skeleton');
  if (skeleton) show(skeleton);
}

/**
 * Hide skeleton and show active tab
 */
function hideSkeleton() {
  const skeleton = document.getElementById('skeleton');
  if (skeleton) hide(skeleton);
}

/* ================================================================
   [9] Tab Navigation
   ================================================================ */

/**
 * Switch the active tab
 * @param {'emoji' | 'symbol' | 'lenny'} tabId
 */
function switchTab(tabId) {
  if (state.activeTab === tabId && state.searchQuery === '') return;

  state.activeTab = tabId;

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('tab-btn--active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  // Hide all panels
  document.querySelectorAll('.tab-panel').forEach(p => hide(p));

  // Show active panel (render if needed)
  const panel = document.getElementById(`panel-${tabId}`);
  if (panel) {
    if (panel.children.length === 0) {
      renderTabPanel(tabId);
    }
    show(panel);
  }

  // Clear search if active
  if (state.searchQuery !== '') {
    state.searchQuery = '';
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    hide(document.getElementById('search-results'));
  }

  renderRecentSection();
}

/**
 * Handle tab button click
 * @param {MouseEvent} event
 */
function handleTabClick(event) {
  const btn = event.target.closest('.tab-btn');
  if (!btn) return;
  switchTab(btn.dataset.tab);
  btn.focus();
}

/* ================================================================
   [10] Keyboard Navigation
   ================================================================ */

/**
 * Handle keydown on symbol grids for arrow key navigation and copy on Enter/Space
 * @param {KeyboardEvent} event
 */
function handleGridKeydown(event) {
  const grid = this;
  const items = Array.from(grid.querySelectorAll('.symbol-item'));
  if (items.length === 0) return;

  const current = document.activeElement;
  const currentIndex = items.indexOf(current);

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (current && current.classList.contains('symbol-item')) {
      current.click();
    }
    return;
  }

  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;

  event.preventDefault();

  const colCount = getGridColumnCount(grid);
  let nextIndex = currentIndex;

  if (event.key === 'ArrowRight') nextIndex = currentIndex + 1;
  else if (event.key === 'ArrowLeft') nextIndex = currentIndex - 1;
  else if (event.key === 'ArrowDown') nextIndex = currentIndex + colCount;
  else if (event.key === 'ArrowUp') nextIndex = currentIndex - colCount;

  if (nextIndex >= 0 && nextIndex < items.length) {
    items[nextIndex].focus();
  }
}

/**
 * Handle tab bar keyboard navigation (← → arrow keys)
 * @param {KeyboardEvent} event
 */
function handleTabKeydown(event) {
  const tabs = Array.from(document.querySelectorAll('.tab-btn'));
  const current = document.activeElement;
  const currentIndex = tabs.indexOf(current);

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    const next = tabs[(currentIndex + 1) % tabs.length];
    next.focus();
    switchTab(next.dataset.tab);
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    const prev = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
    prev.focus();
    switchTab(prev.dataset.tab);
  }
}

/* ================================================================
   [11] Init
   ================================================================ */

/**
 * Handle click on any symbol item (uses event delegation from content-area)
 * @param {MouseEvent} event
 */
async function handleSymbolClick(event) {
  const btn = event.target.closest('.symbol-item');
  if (!btn) return;

  const symbol = btn.dataset.symbol;
  const title = btn.dataset.title;
  const type = btn.dataset.type;
  if (!symbol) return;

  const success = await copyToClipboard(symbol);

  if (success) {
    // Visual feedback
    btn.classList.add('symbol-item--copied');
    setTimeout(() => btn.classList.remove('symbol-item--copied'), 400);

    // Toast
    const display = symbol.length > 8 ? symbol.slice(0, 8) + '…' : symbol;
    showToast(`Copied! ${display}`);

    // Record to recently used
    await addToRecent(symbol, title, type);
  } else {
    showToast('Copy failed. Try again.');
  }
}

/**
 * Main initialization — runs on DOMContentLoaded
 */
async function init() {
  // Show skeleton while data loads
  showSkeleton();

  // Register all event listeners synchronously
  const contentArea = document.getElementById('content-area');
  const tabNav = document.querySelector('.tab-nav');
  const searchInput = document.getElementById('search-input');
  const footerLink = document.getElementById('footer-link');

  if (contentArea) {
    contentArea.addEventListener('click', handleSymbolClick);
    // Keyboard nav: delegate to grids
    contentArea.addEventListener('keydown', event => {
      const grid = event.target.closest('.symbol-grid');
      if (grid) handleGridKeydown.call(grid, event);
    });
  }

  if (tabNav) {
    tabNav.addEventListener('click', handleTabClick);
    tabNav.addEventListener('keydown', handleTabKeydown);
  }

  if (searchInput) {
    searchInput.addEventListener('input', handleSearchInput);
    // Clear search on Escape
    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        searchInput.value = '';
        state.searchQuery = '';
        showCategoryView();
      }
    });
  }

  // Clear-all recently used button
  document.getElementById('clear-recent-btn')?.addEventListener('click', clearAllRecentItems);

  // Ensure autofocus works reliably (can be unreliable depending on how popup is opened)
  setTimeout(() => {
    const inp = document.getElementById('search-input');
    if (inp && document.activeElement !== inp) inp.focus();
  }, 50);

  // Load data and recent items in parallel
  await Promise.allSettled([
    loadData().then(() => {
      hideSkeleton();
      // Render default tab (emoji)
      renderTabPanel('emoji');
      show(document.getElementById('panel-emoji'));
    }).catch(err => {
      hideSkeleton();
      const panel = document.getElementById('panel-emoji');
      if (panel) {
        panel.innerHTML = '<p style="padding:16px;color:#999;text-align:center;">Failed to load data.</p>';
        show(panel);
      }
      console.error('[EmojiSymbols] Data load failed:', err);
    }),
    loadRecentItems().then(() => {
      renderRecentSection();
    }),
  ]);
}

// Entry point
document.addEventListener('DOMContentLoaded', init);
