/* ============================================================
   DSP to AI — Chapter Navigation
   Auto-generates Previous/Next links and breadcrumbs
   ============================================================ */

(function () {
  'use strict';

  function getAllChapters() {
    if (!window.DSPtoAI || !window.DSPtoAI.siteMap) return [];
    var chapters = [];
    window.DSPtoAI.siteMap.parts.forEach(function (part) {
      part.chapters.forEach(function (ch) {
        chapters.push({
          id: ch.id,
          num: ch.num,
          title: ch.title,
          file: ch.file,
          partLabel: part.label,
          partTitle: part.title,
          partId: part.id,
          partColor: part.color
        });
      });
    });
    return chapters;
  }

  function getCurrentChapterId() {
    var el = document.querySelector('[data-chapter-id]');
    return el ? el.getAttribute('data-chapter-id') : null;
  }

  function getBasePath() {
    // Determine relative path to root from current page
    var path = window.location.pathname;
    if (path.includes('/chapters/')) {
      return '../../';
    }
    return '';
  }

  function initBreadcrumb() {
    var container = document.querySelector('.breadcrumb');
    if (!container) return;

    var chapterId = getCurrentChapterId();
    var chapters = getAllChapters();
    var current = chapters.find(function (c) { return c.id === chapterId; });
    if (!current) return;

    var base = getBasePath();
    var idx = chapters.findIndex(function (c) { return c.id === chapterId; });
    var total = chapters.length;
    var partColor = current.partColor || 'var(--text-dim)';

    container.innerHTML =
      '<a href="' + base + 'index.html">Home</a>' +
      '<span class="sep">/</span>' +
      '<a href="' + base + 'index.html#' + current.partId + '" style="color:' + partColor + '">' + current.partLabel + ': ' + current.partTitle + '</a>' +
      '<span class="sep">/</span>' +
      '<span>Ch ' + current.num + ': ' + current.title + '</span>' +
      '<span class="breadcrumb__counter">Ch ' + (idx + 1) + ' of ' + total + '</span>';
  }

  function initChapterNav() {
    var container = document.querySelector('.chapter-nav');
    if (!container) return;

    var chapterId = getCurrentChapterId();
    var chapters = getAllChapters();
    var idx = chapters.findIndex(function (c) { return c.id === chapterId; });
    if (idx === -1) return;

    var base = getBasePath();
    var prev = idx > 0 ? chapters[idx - 1] : null;
    var next = idx < chapters.length - 1 ? chapters[idx + 1] : null;

    var html = '';

    if (prev) {
      html += '<a class="chapter-nav__link" href="' + base + prev.file + '">' +
        '<span class="chapter-nav__direction">\u2190 Previous</span>' +
        '<span class="chapter-nav__title">Ch ' + prev.num + ': ' + prev.title + '</span>' +
        '</a>';
    } else {
      html += '<div></div>';
    }

    if (next) {
      html += '<a class="chapter-nav__link chapter-nav__link--next" href="' + base + next.file + '">' +
        '<span class="chapter-nav__direction">Next \u2192</span>' +
        '<span class="chapter-nav__title">Ch ' + next.num + ': ' + next.title + '</span>' +
        '</a>';
    } else {
      html += '<div></div>';
    }

    container.innerHTML = html;
  }

  document.addEventListener('DOMContentLoaded', function () {
    initBreadcrumb();
    initChapterNav();
  });
})();
