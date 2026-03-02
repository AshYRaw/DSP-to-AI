/* ============================================================
   DSP to AI — Progressive Disclosure
   "Show the Math" expand/collapse system
   ============================================================ */

(function () {
  'use strict';

  function init() {
    document.querySelectorAll('.progressive-toggle').forEach(function (toggle) {
      const targetId = toggle.getAttribute('data-target');
      const content = targetId
        ? document.getElementById(targetId)
        : toggle.nextElementSibling;

      if (!content) return;

      // Ensure content starts collapsed
      content.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');

      toggle.addEventListener('click', function () {
        const isOpen = content.classList.contains('open');

        if (isOpen) {
          content.classList.remove('open');
          toggle.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        } else {
          content.classList.add('open');
          toggle.classList.add('open');
          toggle.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
