/* ============================================================
   DSP to AI — Analytics (GoatCounter)
   Privacy-friendly, cookie-free pageview counting plus a few
   usage events. Loaded on every page; standalone-safe (does not
   depend on navigation.js or any other site module).
   count.js is self-hosted from js/vendor/goatcounter-count.js.

   Events (visible under "Events" in the GoatCounter dashboard):
     cite-copy-bibtex     Copy BibTeX button, or a copy from the BibTeX block
     cite-copy-apa        A copy from the APA line in the cite box
     cite-doi-click       Click on the DOI link in the cite box
     tool-used/<tool-id>  First interaction with each interactive tool, once per page load
   ============================================================ */

(function () {
  'use strict';

  // GoatCounter site code: the dashboard lives at https://<CODE>.goatcounter.com
  var CODE = 'ashyraw';

  if (!CODE || CODE === 'YOURCODE') return;           // not configured: do nothing
  if (document.querySelector('script[data-goatcounter]')) return;  // already loaded

  var ENDPOINT = 'https://' + CODE + '.goatcounter.com/count';

  /* --- Load count.js (async) from our own copy in js/vendor/.
         The path is derived from this script's own src so it works at any
         page depth. count.js picks up data-goatcounter from this tag. --- */
  var me = document.currentScript || document.querySelector('script[src$="js/core/analytics.js"]');
  var base = me && me.src ? me.src.replace(/js\/core\/analytics\.js(\?.*)?$/, '') : '';
  var queue = [];
  var s = document.createElement('script');
  s.async = true;
  s.src = base + 'js/vendor/goatcounter-count.js';
  s.setAttribute('data-goatcounter', ENDPOINT);
  s.addEventListener('load', function () {
    var q = queue; queue = null;
    q.forEach(send);
  });
  (document.head || document.documentElement).appendChild(s);

  /* --- Event helper --- */
  function send(name) {
    if (window.goatcounter && window.goatcounter.count) {
      window.goatcounter.count({ path: name, title: document.title, event: true });
    }
  }
  function track(name) {
    if (queue) { queue.push(name); return; }       // count.js still loading
    send(name);
  }
  window.DSPtoAI = window.DSPtoAI || {};
  window.DSPtoAI.track = track;

  /* --- Cite box events --- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.cite-box__copy')) { track('cite-copy-bibtex'); return; }
    var a = t.closest('.cite-box a[href^="https://doi.org/"]');
    if (a) track('cite-doi-click');
  }, true);

  document.addEventListener('copy', function () {
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    var node = sel.anchorNode;
    if (node && node.nodeType === 3) node = node.parentNode;
    if (!node || !node.closest) return;
    if (node.closest('.cite-box__apa')) track('cite-copy-apa');
    else if (node.closest('.cite-box__bibtex')) track('cite-copy-bibtex');
  });

  /* --- First interaction with each interactive tool (once per page load) --- */
  var usedTools = {};
  function onToolInteraction(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var tool = t.closest('.tool-container');
    if (!tool) return;
    var id = tool.id;
    if (!id) {
      var title = tool.querySelector('.tool-header__title');
      id = title ? title.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'unnamed';
    }
    if (usedTools[id]) return;
    usedTools[id] = true;
    track('tool-used/' + id);
  }
  ['input', 'change', 'pointerdown', 'keydown'].forEach(function (type) {
    document.addEventListener(type, onToolInteraction, true);
  });

  /* --- Disclosure line --- */
  function addNote() {
    if (document.querySelector('.analytics-note')) return;
    var p = document.createElement('p');
    p.className = 'analytics-note';
    p.innerHTML = 'Privacy-friendly analytics by <a href="https://www.goatcounter.com/" target="_blank" rel="noopener">GoatCounter</a>; no cookies.';
    var footer = document.querySelector('.site-footer');
    if (footer) { footer.appendChild(p); return; }
    // Pages without a site footer: a small centred line at the very end
    p.style.cssText = 'text-align:center;font-size:12px;opacity:0.6;margin:32px 16px 24px';
    document.body.appendChild(p);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addNote);
  else addNote();
})();
