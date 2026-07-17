(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function closeMobileMenu() {
    const shell = $('.app-shell');
    if (!shell) return;
    shell.classList.remove('sidebar-mobile-open');
    document.body.classList.remove('mobile-menu-open');
    $('#mobileMenuBtn')?.setAttribute('aria-expanded', 'false');
  }

  function showView(view) {
    if (!view) return;
    $$('.view').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === view));
    $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
    const titles = {
      dashboard: 'مركز القيادة',
      settings: 'إعداد المدرسة',
      import: 'استيراد المعلمين',
      classify: 'إسناد المواد والفصول',
      validate: 'التحقق من البيانات',
      distribution: 'توزيع حصة النشاط'
    };
    if ($('#pageTitle')) $('#pageTitle').textContent = titles[view] || 'موزّع حصة النشاط';
    closeMobileMenu();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindFallbackNavigation() {
    const shell = $('.app-shell');
    const sideNav = $('#sideNav');
    const mobileButton = $('#mobileMenuBtn');
    const sidebarToggle = $('#sidebarToggle');
    const backdrop = $('#sidebarBackdrop');

    sideNav?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      const view = button.dataset.view;
      requestAnimationFrame(() => {
        if (!button.classList.contains('active')) showView(view);
        else closeMobileMenu();
      });
    });

    document.addEventListener('click', (event) => {
      const go = event.target.closest('[data-go]');
      if (!go) return;
      const view = go.dataset.go;
      requestAnimationFrame(() => {
        const navButton = $(`.nav-item[data-view="${view}"]`);
        if (!navButton?.classList.contains('active')) showView(view);
      });
    });

    mobileButton?.addEventListener('pointerdown', () => {
      mobileButton.dataset.wasOpen = String(shell?.classList.contains('sidebar-mobile-open'));
    }, { passive: true });

    mobileButton?.addEventListener('click', () => {
      requestAnimationFrame(() => {
        if (!shell) return;
        const before = mobileButton.dataset.wasOpen === 'true';
        const after = shell.classList.contains('sidebar-mobile-open');
        if (before === after) {
          shell.classList.toggle('sidebar-mobile-open', !after);
          document.body.classList.toggle('mobile-menu-open', !after);
          mobileButton.setAttribute('aria-expanded', String(!after));
        }
      });
    });

    sidebarToggle?.addEventListener('pointerdown', () => {
      sidebarToggle.dataset.wasCollapsed = String(shell?.classList.contains('sidebar-collapsed'));
      sidebarToggle.dataset.wasMobileOpen = String(shell?.classList.contains('sidebar-mobile-open'));
    }, { passive: true });

    sidebarToggle?.addEventListener('click', () => {
      requestAnimationFrame(() => {
        if (!shell) return;
        if (matchMedia('(max-width: 900px)').matches) {
          const before = sidebarToggle.dataset.wasMobileOpen === 'true';
          const after = shell.classList.contains('sidebar-mobile-open');
          if (before === after) closeMobileMenu();
          return;
        }
        const before = sidebarToggle.dataset.wasCollapsed === 'true';
        const after = shell.classList.contains('sidebar-collapsed');
        if (before === after) {
          shell.classList.toggle('sidebar-collapsed', !after);
          $('.sidebar')?.classList.toggle('collapsed', !after);
          localStorage.setItem('activity10SidebarCollapsed', !after ? '1' : '0');
        }
      });
    });

    backdrop?.addEventListener('click', closeMobileMenu);
  }

  function normalizeInteractiveElements() {
    $$('.nav-item, #mobileMenuBtn, #sidebarToggle, .icon-button, [data-go], .wizard-step, .choice-card, .type-button, .stage-toggle').forEach((element) => {
      if (element.tagName === 'BUTTON' && !element.hasAttribute('type')) element.type = 'button';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    normalizeInteractiveElements();
    bindFallbackNavigation();
  });
})();