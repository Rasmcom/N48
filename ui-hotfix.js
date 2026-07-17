(() => {
  'use strict';

  /*
   * إصلاح تفاعلات iOS يبقى بصريًا عبر ui-hotfix.css.
   * لا نضيف مستمعات تنقل مكررة؛ app3.js هو المصدر الوحيد لسلوك الموقع.
   * تُطبّق هذه المعالجة أيضًا على الأزرار التي تُنشأ بعد تحميل الصفحة.
   */
  function normalizeButtons(root = document) {
    root
      .querySelectorAll?.('button:not([type])')
      .forEach((button) => button.setAttribute('type', 'button'));
  }

  document.addEventListener('DOMContentLoaded', () => {
    normalizeButtons();
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
