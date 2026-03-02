/* ============================================================
   DSP to AI — Navigation System
   Handles: sticky nav, mobile toggle, progress bar, sidebar,
   breadcrumbs, and scroll-activated section highlighting
   ============================================================ */

(function () {
  'use strict';

  /* --- Site Map --- */
  const SITE_MAP = {
    parts: [
      {
        id: 'part1', label: 'Part I', title: 'DSP Foundations',
        color: 'var(--color-dsp)',
        chapters: [
          { id: 'ch01', num: '01', title: 'What Is a Signal?', file: 'chapters/part1/ch01-signals.html' },
          { id: 'ch02', num: '02', title: 'Systems That Process Signals', file: 'chapters/part1/ch02-systems.html' },
          { id: 'ch03', num: '03', title: 'Convolution', file: 'chapters/part1/ch03-convolution.html' },
          { id: 'ch04', num: '04', title: 'The Fourier Transform', file: 'chapters/part1/ch04-fourier.html' },
          { id: 'ch05', num: '05', title: 'Z-Transform & Transfer Functions', file: 'chapters/part1/ch05-z-transform.html' },
          { id: 'ch06', num: '06', title: 'Poles, Zeros & Filter Character', file: 'chapters/part1/ch06-poles-zeros.html' },
          { id: 'ch07', num: '07', title: 'FIR & IIR Filter Design', file: 'chapters/part1/ch07-filter-design.html' },
          { id: 'ch08', num: '08', title: 'Adaptive Filters & Filter Banks', file: 'chapters/part1/ch08-advanced-dsp.html' },
        ]
      },
      {
        id: 'part2', label: 'Part II', title: 'AI Foundations',
        color: 'var(--color-ai)',
        chapters: [
          { id: 'ch09', num: '09', title: 'The Neuron & Perceptron', file: 'chapters/part2/ch09-neuron.html' },
          { id: 'ch10', num: '10', title: 'Neural Networks & Backpropagation', file: 'chapters/part2/ch10-backprop.html' },
          { id: 'ch11', num: '11', title: 'Training & Optimization', file: 'chapters/part2/ch11-training.html' },
          { id: 'ch12', num: '12', title: 'RNNs & LSTMs', file: 'chapters/part2/ch12-sequences.html' },
          { id: 'ch13', num: '13', title: 'Word Embeddings', file: 'chapters/part2/ch13-embeddings.html' },
          { id: 'ch14', num: '14', title: 'The Attention Mechanism', file: 'chapters/part2/ch14-attention.html' },
          { id: 'ch15', num: '15', title: 'The Transformer', file: 'chapters/part2/ch15-transformer.html' },
        ]
      },
      {
        id: 'part3', label: 'Part III', title: 'The Bridge',
        color: 'var(--color-bridge)',
        chapters: [
          { id: 'ch16', num: '16', title: 'The Rosetta Stone', file: 'chapters/part3/ch16-rosetta.html' },
          { id: 'ch17', num: '17', title: 'Matched Filter to Attention', file: 'chapters/part3/ch17-matched-to-attn.html' },
          { id: 'ch18', num: '18', title: 'State-Space Models', file: 'chapters/part3/ch18-ssm.html' },
          { id: 'ch19', num: '19', title: 'Mamba', file: 'chapters/part3/ch19-mamba.html' },
          { id: 'ch20', num: '20', title: 'Attention vs Mamba', file: 'chapters/part3/ch20-attn-vs-mamba.html' },
        ]
      },
      {
        id: 'part4', label: 'Part IV', title: 'The Frontier',
        color: 'var(--color-danger)',
        chapters: [
          { id: 'ch21', num: '21', title: 'SSM Evolution Timeline', file: 'chapters/part4/ch21-ssm-evolution.html' },
          { id: 'ch22', num: '22', title: 'Hybrid Architectures', file: 'chapters/part4/ch22-hybrid-architectures.html' },
          { id: 'ch23', num: '23', title: 'Capstone Project', file: 'chapters/part4/ch23-capstone.html' },
        ]
      }
    ]
  };

  /* --- Mobile Nav Toggle --- */
  function initMobileNav() {
    const toggle = document.querySelector('.nav-toggle');
    const links = document.querySelector('.site-nav__links');
    if (!toggle || !links) return;

    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
      const expanded = links.classList.contains('open');
      toggle.setAttribute('aria-expanded', expanded);
      toggle.textContent = expanded ? '\u2715' : '\u2630'; // ✕ / ☰
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.site-nav')) {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = '\u2630';
      }
    });
  }

  /* --- Progress Bar --- */
  function initProgressBar() {
    const bar = document.querySelector('.progress-bar');
    if (!bar) return;

    function update() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      bar.style.width = pct + '%';
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* --- Sidebar Section Highlighting (Intersection Observer) --- */
  function initSectionHighlighting() {
    const sections = document.querySelectorAll('.chapter-section[id]');
    const sidebarLinks = document.querySelectorAll('.sidebar__section-link');
    if (sections.length === 0 || sidebarLinks.length === 0) return;

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          sidebarLinks.forEach(function (link) { link.classList.remove('active'); });
          const active = document.querySelector('.sidebar__section-link[href="#' + entry.target.id + '"]');
          if (active) active.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -75% 0px' });

    sections.forEach(function (s) { observer.observe(s); });
  }

  /* --- Sidebar Toggle (mobile) --- */
  function initSidebarToggle() {
    const btn = document.querySelector('.sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (!btn || !sidebar) return;

    btn.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });
  }

  /* --- Initialize --- */
  document.addEventListener('DOMContentLoaded', function () {
    initMobileNav();
    initProgressBar();
    initSectionHighlighting();
    initSidebarToggle();
  });

  // Expose site map for other modules
  window.DSPtoAI = window.DSPtoAI || {};
  window.DSPtoAI.siteMap = SITE_MAP;
})();
