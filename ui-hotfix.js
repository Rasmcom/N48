(() => {
  'use strict';

  /*
   * إصلاحات التفاعل العامة، مع إبقاء app3.js هو المصدر الوحيد للتنقل والحفظ.
   * هذا الملف يضيف قاعدة توزيع واحدة: الإسناد المختار يستمر في أسابيع متصلة
   * حتى ينتهي رصيده، ثم ينتقل النظام إلى الإسناد التالي الأعلى رصيدًا.
   */
  function normalizeButtons(root = document) {
    root
      .querySelectorAll?.('button:not([type])')
      .forEach((button) => button.setAttribute('type', 'button'));
  }

  let nativeSort = null;

  function isDistributionCandidateList(list) {
    return Array.isArray(list)
      && list.length > 0
      && list.every((item) => item
        && typeof item === 'object'
        && 'teacherId' in item
        && 'subject' in item
        && 'capacity' in item
        && 'weeklyPeriods' in item);
  }

  function enableContiguousDistributionForCurrentClick() {
    if (nativeSort) return;
    nativeSort = Array.prototype.sort;

    Array.prototype.sort = function patchedSort(compareFn) {
      if (isDistributionCandidateList(this)) {
        return nativeSort.call(this, (a, b) => {
          const capacityDifference = Number(b.capacity || 0) - Number(a.capacity || 0);
          if (capacityDifference) return capacityDifference;

          const periodsDifference = Number(b.weeklyPeriods || 0) - Number(a.weeklyPeriods || 0);
          if (periodsDifference) return periodsDifference;

          return 0;
        });
      }

      return nativeSort.call(this, compareFn);
    };

    queueMicrotask(() => {
      Array.prototype.sort = nativeSort;
      nativeSort = null;
    });
  }

  function decorateDistributionRanges(root = document) {
    root.querySelectorAll?.('.section-distribution-card').forEach((card) => {
      const weeks = [...card.querySelectorAll('.week-item')];
      if (!weeks.length) return;

      const blocks = [];
      for (let index = 0; index < weeks.length; index += 1) {
        const item = weeks[index];
        const subject = item.querySelector('span')?.textContent?.trim() || '';
        const teacher = item.querySelector('small')?.textContent?.trim() || '';
        const key = `${subject}|${teacher}`;
        const previous = blocks.at(-1);

        if (previous?.key === key) {
          previous.end = index + 1;
        } else {
          blocks.push({ key, subject, teacher, start: index + 1, end: index + 1 });
        }
      }

      const sourceItems = [...card.querySelectorAll('.source-summary-item')];
      sourceItems.forEach((source) => {
        const subject = source.querySelector('strong')?.textContent?.trim() || '';
        const details = source.querySelector('small');
        if (!details || details.dataset.rangeAdded === '1') return;

        const teacher = details.textContent.split('·')[0]?.trim() || '';
        const block = blocks.find((entry) => entry.subject === subject && entry.teacher === teacher);
        if (!block) return;

        details.textContent += ` · الأسابيع ${block.start.toLocaleString('ar-SA')}–${block.end.toLocaleString('ar-SA')}`;
        details.dataset.rangeAdded = '1';
      });

      const subtitle = card.querySelector('.distribution-card-head p');
      if (subtitle && !subtitle.dataset.contiguousText) {
        subtitle.textContent = `${subtitle.textContent} · توزيع متصل`;
        subtitle.dataset.contiguousText = '1';
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#generateDistributionBtn')) {
      enableContiguousDistributionForCurrentClick();
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    normalizeButtons();
    decorateDistributionRanges();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches('button:not([type])')) node.setAttribute('type', 'button');
          normalizeButtons(node);
          decorateDistributionRanges(node);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
