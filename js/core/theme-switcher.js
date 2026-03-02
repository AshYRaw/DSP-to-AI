/* ============================================================
   DSP to AI — Theme Switcher
   Persists dark/light preference to localStorage
   ============================================================ */

(function () {
  const STORAGE_KEY = 'dsp-to-ai-theme';
  const DARK = 'dark';
  const LIGHT = 'light';

  function getPreferred() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === DARK || stored === LIGHT) return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? LIGHT : DARK;
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);

    // Update toggle button icon
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = theme === DARK ? '\u2600' : '\u263E'; // ☀ / ☾
      btn.setAttribute('aria-label', `Switch to ${theme === DARK ? 'light' : 'dark'} theme`);
      btn.setAttribute('aria-pressed', theme === DARK ? 'true' : 'false');
    });
  }

  function toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    apply(current === DARK ? LIGHT : DARK);
  }

  // Apply immediately (before DOM ready) to prevent flash
  apply(getPreferred());

  // Bind toggle buttons once DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', toggle);
    });

    // Listen for OS theme changes
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function (e) {
      if (!localStorage.getItem(STORAGE_KEY)) {
        apply(e.matches ? LIGHT : DARK);
      }
    });
  });

  // Expose for other modules
  window.DSPtoAI = window.DSPtoAI || {};
  window.DSPtoAI.theme = { toggle, apply, getPreferred };
})();
