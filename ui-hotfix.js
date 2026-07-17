(() => {
  'use strict';

  /*
   * إصلاح تفاعلات iOS يجب أن يبقى بصريًا فقط عبر ui-hotfix.css.
   * لا نضيف مستمعات تنقل أو نكرر مستمعات app3.js؛ لأن ذلك يؤدي إلى
   * تنفيذ النقرة مرتين أو فتح الصفحة دون تشغيل دوال الرسم والحفظ الخاصة بها.
   */
  document.addEventListener('DOMContentLoaded', () => {
    document
      .querySelectorAll('button:not([type])')
      .forEach((button) => button.setAttribute('type', 'button'));
  });
})();
