(() => {
  'use strict';

  /* تحسينات تفاعل عامة فقط. منطق التوزيع موجود بالكامل داخل app3.js. */
  function normalizeButtons(root = document) {
    root
      .querySelectorAll?.('button:not([type])')
      .forEach((button) => button.setAttribute('type', 'button'));
  }

  /* تحميل صفحة الطباعة كجزء مستقل حتى لا تؤثر في منطق التوزيع. */
  function loadPrintModule() {
    if (!document.querySelector('link[data-activity-print-style]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'print-page.css';
      link.dataset.activityPrintStyle = '1';
      document.head.appendChild(link);
    }

    if (!document.querySelector('script[data-activity-print-script]')) {
      const script = document.createElement('script');
      script.src = 'print-page.js';
      script.defer = true;
      script.dataset.activityPrintScript = '1';
      document.head.appendChild(script);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    normalizeButtons();
    loadPrintModule();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches('button:not([type])')) node.setAttribute('type', 'button');
          normalizeButtons(node);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
