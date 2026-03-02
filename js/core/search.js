/* ============================================================
   DSP to AI — Site-Wide Search
   Client-side search overlay with real-time results.
   Keyboard: / to open, Escape to close.
   Depends on: search-index.js (must load first)
   ============================================================ */

(function () {
  'use strict';

  var index = [];
  var overlay, input, resultsList, countEl;
  var isOpen = false;

  /* ── Helpers ────────────────────────────────────────────── */

  function getBasePath() {
    var path = window.location.pathname;
    if (path.indexOf('/chapters/') !== -1) return '../../';
    if (path.indexOf('/gallery/') !== -1) return '../';
    if (path.indexOf('/reference/') !== -1) return '../';
    return '';
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Search Algorithm ───────────────────────────────────── */

  function search(query) {
    if (!query || query.length < 2) return [];
    var q = query.toLowerCase();
    var results = [];

    for (var i = 0; i < index.length; i++) {
      var entry = index[i];
      var score = 0;
      var matchType = '';

      // Title match (highest priority)
      if (entry.title.toLowerCase().indexOf(q) !== -1) {
        score += 100;
        matchType = 'title';
      }

      // Tool match
      for (var t = 0; t < entry.tools.length; t++) {
        if (entry.tools[t].toLowerCase().indexOf(q) !== -1) {
          score += 60;
          if (!matchType) matchType = 'tool: ' + entry.tools[t];
        }
      }

      // Keyword match
      if (entry.keywords.toLowerCase().indexOf(q) !== -1) {
        score += 40;
        if (!matchType) matchType = 'keyword';
      }

      // Section match
      for (var s = 0; s < entry.sections.length; s++) {
        if (entry.sections[s].toLowerCase().indexOf(q) !== -1) {
          score += 30;
          if (!matchType) matchType = entry.sections[s];
        }
      }

      if (score > 0) {
        results.push({ entry: entry, score: score, matchType: matchType });
      }
    }

    // Sort by score descending, then by chapter number
    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.entry.num.localeCompare(b.entry.num);
    });

    return results;
  }

  /* ── Render Results ─────────────────────────────────────── */

  function renderResults(results, query) {
    if (!resultsList || !countEl) return;

    if (results.length === 0) {
      countEl.textContent = query.length >= 2 ? 'No results' : '';
      resultsList.innerHTML = query.length >= 2
        ? '<li class="search-no-results">No chapters match \u201C' + escapeHtml(query) + '\u201D</li>'
        : '<li class="search-hint">Type at least 2 characters to search across all 23 chapters</li>';
      return;
    }

    countEl.textContent = results.length + ' result' + (results.length !== 1 ? 's' : '');

    var base = getBasePath();
    var currentPart = '';
    var html = '';

    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var e = r.entry;

      // Part group header
      if (e.part !== currentPart) {
        currentPart = e.part;
        html += '<li class="search-part-header">' + escapeHtml(currentPart) + '</li>';
      }

      html += '<li class="search-result">';
      html += '<a href="' + base + e.file + '" class="search-result__link">';
      html += '<span class="search-result__num">Ch ' + e.num + '</span>';
      html += '<span class="search-result__title">' + escapeHtml(e.title) + '</span>';
      if (r.matchType && r.matchType !== 'title' && r.matchType !== 'keyword') {
        html += '<span class="search-result__match">' + escapeHtml(r.matchType) + '</span>';
      }
      html += '</a></li>';
    }

    resultsList.innerHTML = html;
  }

  /* ── Overlay UI ─────────────────────────────────────────── */

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Site search');
    overlay.innerHTML =
      '<div class="search-modal">' +
        '<div class="search-header">' +
          '<span class="search-icon">\uD83D\uDD0D</span>' +
          '<input type="text" class="search-input" placeholder="Search chapters, tools, concepts\u2026" autocomplete="off" aria-label="Search">' +
          '<span class="search-count" aria-live="polite"></span>' +
          '<button class="search-close" aria-label="Close search">\u2715</button>' +
        '</div>' +
        '<ul class="search-results" role="listbox"></ul>' +
        '<div class="search-footer">' +
          '<span><kbd>/</kbd> to open</span>' +
          '<span><kbd>Esc</kbd> to close</span>' +
          '<span><kbd>\u2191\u2193</kbd> to navigate</span>' +
          '<span><kbd>Enter</kbd> to go</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    input = overlay.querySelector('.search-input');
    resultsList = overlay.querySelector('.search-results');
    countEl = overlay.querySelector('.search-count');

    // Events
    input.addEventListener('input', function () {
      var results = search(input.value.trim());
      renderResults(results, input.value.trim());
    });

    overlay.querySelector('.search-close').addEventListener('click', closeSearch);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeSearch();
    });

    // Keyboard navigation within results
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeSearch();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateResults(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (e.key === 'Enter') {
        var active = resultsList.querySelector('.search-result--active a');
        if (active) {
          active.click();
          closeSearch();
        }
      }
    });
  }

  var activeIdx = -1;

  function navigateResults(dir) {
    var items = resultsList.querySelectorAll('.search-result');
    if (items.length === 0) return;

    if (activeIdx >= 0 && activeIdx < items.length) {
      items[activeIdx].classList.remove('search-result--active');
    }

    activeIdx += dir;
    if (activeIdx < 0) activeIdx = items.length - 1;
    if (activeIdx >= items.length) activeIdx = 0;

    items[activeIdx].classList.add('search-result--active');
    items[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  /* ── Open / Close ───────────────────────────────────────── */

  function openSearch() {
    if (isOpen) return;
    if (!overlay) createOverlay();
    isOpen = true;
    activeIdx = -1;
    overlay.classList.add('search-overlay--open');
    input.value = '';
    renderResults([], '');
    setTimeout(function () { input.focus(); }, 50);
  }

  function closeSearch() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('search-overlay--open');
  }

  /* ── Global Keyboard Shortcut ───────────────────────────── */

  document.addEventListener('keydown', function (e) {
    // / to open (unless in an input already)
    if (e.key === '/' && !isOpen) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
        e.preventDefault();
        openSearch();
      }
    }
    if (e.key === 'Escape' && isOpen) {
      closeSearch();
    }
  });

  /* ── Search Button Binding ──────────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    // Load index
    if (window.DSPtoAI && window.DSPtoAI.searchIndex) {
      index = window.DSPtoAI.searchIndex;
    }

    // Bind search buttons
    document.querySelectorAll('.search-toggle').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openSearch();
      });
    });
  });

  /* ── Inject Styles ──────────────────────────────────────── */

  var style = document.createElement('style');
  style.textContent =
    '.search-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);' +
    'backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;padding-top:12vh}' +
    '.search-overlay--open{display:flex}' +

    '.search-modal{background:var(--surface,#111827);border:1px solid var(--border,#1e293b);' +
    'border-radius:12px;width:90%;max-width:600px;box-shadow:0 20px 60px rgba(0,0,0,0.5);' +
    'overflow:hidden;max-height:70vh;display:flex;flex-direction:column}' +

    '.search-header{display:flex;align-items:center;gap:8px;padding:12px 16px;' +
    'border-bottom:1px solid var(--border,#1e293b)}' +
    '.search-icon{font-size:16px;opacity:0.5}' +
    '.search-input{flex:1;background:none;border:none;color:var(--text,#e2e8f0);' +
    'font-family:var(--font-body,"Outfit",sans-serif);font-size:16px;outline:none}' +
    '.search-input::placeholder{color:var(--text-dim,#94a3b8)}' +
    '.search-count{font-family:var(--font-code,monospace);font-size:11px;color:var(--text-dim,#94a3b8);white-space:nowrap}' +
    '.search-close{background:none;border:1px solid var(--border,#1e293b);color:var(--text-dim,#94a3b8);' +
    'cursor:pointer;border-radius:4px;padding:2px 8px;font-size:14px}' +
    '.search-close:hover{color:var(--text,#e2e8f0);border-color:var(--text-dim,#94a3b8)}' +

    '.search-results{list-style:none;overflow-y:auto;flex:1;padding:0;margin:0}' +
    '.search-part-header{padding:8px 16px 4px;font-family:var(--font-code,monospace);' +
    'font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--color-dsp,#22d3ee);opacity:0.7}' +

    '.search-result a{display:flex;align-items:center;gap:10px;padding:8px 16px;' +
    'text-decoration:none;color:var(--text,#e2e8f0);transition:background 0.1s}' +
    '.search-result a:hover,.search-result--active a{background:rgba(34,211,238,0.08)}' +
    '.search-result__num{font-family:var(--font-code,monospace);font-size:12px;' +
    'color:var(--text-dim,#94a3b8);min-width:42px}' +
    '.search-result__title{font-size:14px;font-weight:500}' +
    '.search-result__match{font-family:var(--font-code,monospace);font-size:10px;' +
    'color:var(--color-ai,#fb923c);margin-left:auto;opacity:0.7}' +

    '.search-no-results,.search-hint{padding:24px 16px;text-align:center;' +
    'color:var(--text-dim,#94a3b8);font-size:14px}' +

    '.search-footer{display:flex;gap:16px;justify-content:center;padding:8px 16px;' +
    'border-top:1px solid var(--border,#1e293b);font-family:var(--font-code,monospace);font-size:10px;' +
    'color:var(--text-dim,#94a3b8)}' +
    '.search-footer kbd{background:var(--bg,#0a0e1a);border:1px solid var(--border,#1e293b);' +
    'border-radius:3px;padding:1px 5px;font-size:10px}';

  document.head.appendChild(style);
})();
