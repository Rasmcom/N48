(() => {
  'use strict';

  const PRODUCT_TITLE = 'موزّع حصة النشاط';

  /* تحسينات تفاعل عامة فقط. منطق التوزيع موجود بالكامل داخل app3.js. */
  function normalizeButtons(root = document) {
    root
      .querySelectorAll?.('button:not([type])')
      .forEach((button) => button.setAttribute('type', 'button'));
  }

  function enforceProductTitle() {
    document.title = PRODUCT_TITLE;

    const pageTitle = document.querySelector('#pageTitle');
    if (pageTitle && pageTitle.textContent !== PRODUCT_TITLE) {
      pageTitle.textContent = PRODUCT_TITLE;
    }

    const brandTitle = document.querySelector('.brand-block strong');
    if (brandTitle && brandTitle.textContent !== PRODUCT_TITLE) {
      brandTitle.textContent = PRODUCT_TITLE;
    }
  }

  function syncOriginalPrintAssets(root = document) {
    const images = [];
    if (root instanceof Element && root.matches('.activity-print-logo img')) images.push(root);
    images.push(...(root.querySelectorAll?.('.activity-print-logo img') || []));
    images.forEach((image) => {
      if (image.dataset.originalPrintAsset === '1') return;
      image.src = 'https://raw.githubusercontent.com/Rasmcom/N48/main/logomoe.png';
      image.dataset.originalPrintAsset = '1';
    });
  }

  function addStyle(href, attribute) {
    if (document.querySelector(`link[${attribute}]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(attribute, '1');
    document.head.appendChild(link);
  }

  function addScript(src, attribute) {
    if (document.querySelector(`script[${attribute}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.setAttribute(attribute, '1');
    document.head.appendChild(script);
  }

  /* تحميل صفحة الطباعة وتقرير المشاركة كوحدات مستقلة. */
  function loadModules() {
    addStyle('print-page.css', 'data-activity-print-style');
    addStyle('print-assets-main.css', 'data-original-print-assets');
    addStyle('distribution-report.css', 'data-distribution-report-style');
    addScript('print-page.js', 'data-activity-print-script');
    addScript('distribution-report.js', 'data-distribution-report-script');
  }

  document.addEventListener('DOMContentLoaded', () => {
    normalizeButtons();
    loadModules();
    syncOriginalPrintAssets();
    enforceProductTitle();

    const observer = new MutationObserver((mutations) => {
      let titleMayHaveChanged = false;

      for (const mutation of mutations) {
        if (mutation.type === 'characterData') titleMayHaveChanged = true;

        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches('button:not([type])')) node.setAttribute('type', 'button');
          normalizeButtons(node);
          syncOriginalPrintAssets(node);

          if (
            node.matches('#pageTitle, .brand-block, .brand-block strong') ||
            node.querySelector?.('#pageTitle, .brand-block strong')
          ) {
            titleMayHaveChanged = true;
          }
        }

        if (
          mutation.target instanceof Element &&
          mutation.target.matches('#pageTitle, .brand-block strong')
        ) {
          titleMayHaveChanged = true;
        }
      }

      if (titleMayHaveChanged) enforceProductTitle();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  });
})();
