/* ============================================================
   DSP to AI — "Cite this" box
   Single source of truth for citation metadata. Injected after the
   chapter prev/next nav on chapter pages and into the footer elsewhere.
   Update DOI/VERSION here (and in CITATION.cff) when a release is cut.
   ============================================================ */

(function () {
  'use strict';

  var META = {
    author: 'Ashish Rawat',
    authorBib: 'Rawat, Ashish',
    authorApa: 'Rawat, A.',
    title: 'DSP to AI: From Signal Processing to Deep Learning',
    year: '2026',
    version: '1.1.0',
    url: 'https://ashyraw.github.io/DSP-to-AI/',
    license: 'Content CC BY 4.0; code MIT',
    doi: '10.5281/zenodo.23585849'  // Zenodo concept DOI (resolves to the latest version)
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function currentChapter() {
    var el = document.querySelector('[data-chapter-id]');
    if (!el || !window.DSPtoAI || !window.DSPtoAI.siteMap) return null;
    var id = el.getAttribute('data-chapter-id');
    var parts = window.DSPtoAI.siteMap.parts;
    for (var p = 0; p < parts.length; p++) {
      for (var c = 0; c < parts[p].chapters.length; c++) {
        if (parts[p].chapters[c].id === id) return parts[p].chapters[c];
      }
    }
    return null;
  }

  function build(ch) {
    var url = ch ? META.url + ch.file : META.url;
    var key = 'rawat' + META.year + 'dsptoai' + (ch ? 'ch' + ch.num : '');
    var chTitle = ch ? ch.title.replace(/[.?!]$/, '') : '';
    var apa = META.authorApa + ' (' + META.year + '). ' +
      (ch ? 'Chapter ' + ch.num + ': ' + chTitle + '. In ' : '') +
      '<em>' + META.title + '</em> (v' + META.version + '). ' +
      (META.doi ? 'https://doi.org/' + META.doi : url);

    var bib = '@misc{' + key + ',\n' +
      '  author       = {' + META.authorBib + '},\n' +
      '  title        = {' + META.title + (ch ? ': Chapter ' + ch.num + ', ' + ch.title : '') + '},\n' +
      '  year         = {' + META.year + '},\n' +
      '  version      = {' + META.version + '},\n' +
      (META.doi ? '  doi          = {' + META.doi + '},\n' : '') +
      '  url          = {' + url + '},\n' +
      '  howpublished = {Interactive web resource},\n' +
      '  note         = {' + META.license + '}\n' +
      '}';

    var box = document.createElement('aside');
    box.className = 'cite-box';
    box.setAttribute('aria-label', 'How to cite this ' + (ch ? 'chapter' : 'resource'));
    box.innerHTML =
      '<div class="cite-box__title">Cite this ' + (ch ? 'chapter' : 'resource') + '</div>' +
      '<p class="cite-box__apa">' + apa + '</p>' +
      '<div class="cite-box__bibtex-wrap">' +
        '<pre class="cite-box__bibtex" tabindex="0">' + esc(bib) + '</pre>' +
        '<button type="button" class="cite-box__copy" aria-label="Copy BibTeX to clipboard">Copy BibTeX</button>' +
      '</div>' +
      '<p class="cite-box__cff">Machine-readable citation: ' +
        '<a href="https://github.com/AshYRaw/DSP-to-AI/blob/main/CITATION.cff" target="_blank" rel="noopener">CITATION.cff</a>' +
        (META.doi ? ' &middot; DOI <a href="https://doi.org/' + META.doi + '" target="_blank" rel="noopener">' + META.doi + '</a>' : '') +
      '</p>';

    var btn = box.querySelector('.cite-box__copy');
    btn.addEventListener('click', function () {
      var done = function () { btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = 'Copy BibTeX'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        // Race the async clipboard API against a short timeout: in some
        // contexts (unfocused document, blocked permission) the promise
        // never settles, which would leave the button silent.
        var settled = false;
        var timer = setTimeout(function () { if (!settled) { settled = true; fallback(); } }, 600);
        navigator.clipboard.writeText(bib).then(
          function () { if (!settled) { settled = true; clearTimeout(timer); done(); } },
          function () { if (!settled) { settled = true; clearTimeout(timer); fallback(); } });
      } else { fallback(); }
      function fallback() {
        var r = document.createRange(); r.selectNodeContents(box.querySelector('.cite-box__bibtex'));
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Select & copy'; }
      }
    });
    return box;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var ch = currentChapter();
    var box = build(ch);
    var nav = document.querySelector('.chapter-nav');
    var footer = document.querySelector('.site-footer');
    if (nav) nav.parentNode.insertBefore(box, nav.nextSibling);
    else if (footer) footer.parentNode.insertBefore(box, footer);
    else { var main = document.querySelector('main') || document.body; main.appendChild(box); }
  });
})();
