(() => {
  'use strict';

  const DB_NAME = 'activity10LocalDB';
  const STORE_NAME = 'state';
  const STATE_KEY = 'main';
  let refreshTimer = null;
  let lastSignature = '';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const clean = (value = '') => String(value).trim().replace(/\s+/g, ' ');
  const ar = (value) => Number(value || 0).toLocaleString('ar-SA');

  function readState() {
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME);
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close();
          resolve(null);
          return;
        }
        const tx = db.transaction(STORE_NAME, 'readonly');
        const get = tx.objectStore(STORE_NAME).get(STATE_KEY);
        get.onsuccess = () => {
          const value = get.result || null;
          db.close();
          resolve(value);
        };
        get.onerror = () => {
          db.close();
          resolve(null);
        };
      };
    });
  }

  function normalizeDigits(value = '') {
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    const eastern = '۰۱۲۳۴۵۶۷۸۹';
    return String(value)
      .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String(eastern.indexOf(digit)));
  }

  function firstWeekFromText(text = '') {
    const normalized = normalizeDigits(text);
    const match = normalized.match(/(?:الأسبوع\s*)?(\d+)/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }

  function sortPrintWeekRanges(root = document) {
    const containers = [];
    if (root instanceof Element && root.matches('.activity-assignment-lines')) containers.push(root);
    containers.push(...(root.querySelectorAll?.('.activity-assignment-lines') || []));

    containers.forEach((container) => {
      const subjectLines = [...container.children].filter((node) => node.classList?.contains('activity-assignment-line'));
      if (!subjectLines.length) return;

      subjectLines.forEach((line) => {
        const rangeHost = line.querySelector('.activity-subject-ranges');
        if (!rangeHost) return;
        const ranges = [...rangeHost.querySelectorAll(':scope > small')]
          .sort((a, b) => firstWeekFromText(a.textContent) - firstWeekFromText(b.textContent));
        ranges.forEach((range) => rangeHost.appendChild(range));
        line.dataset.firstWeek = String(ranges.length ? firstWeekFromText(ranges[0].textContent) : Number.MAX_SAFE_INTEGER);
      });

      subjectLines
        .sort((a, b) => Number(a.dataset.firstWeek) - Number(b.dataset.firstWeek))
        .forEach((line) => container.appendChild(line));
    });
  }

  function semesterWeeks(state) {
    return Math.max(1, Math.floor(Number(state?.settings?.weeks || 36) / 2));
  }

  function assignmentCapacity(state, assignment) {
    return Math.floor(Number(assignment?.weeklyPeriods || 0) * semesterWeeks(state) * 0.10 + 1e-9);
  }

  function isCompleteTeacher(teacher) {
    const target = Number(teacher?.load || 0);
    const assigned = (teacher?.assignments || []).reduce((sum, item) => sum + Number(item.weeklyPeriods || 0), 0);
    return Boolean(clean(teacher?.name) && clean(teacher?.specialty) && target > 0 && assigned === target);
  }

  function activeSemester(state) {
    const activeButton = document.querySelector('.semester-tab.active[data-semester-tab]');
    return Number(activeButton?.dataset.semesterTab || state?.distributionConfig?.activeSemester || 1);
  }

  function semesterRecord(distribution, semester) {
    return Array.isArray(distribution?.semesters)
      ? distribution.semesters.find((item) => Number(item?.semester) === semester)
      : null;
  }

  function candidateTeachers(state) {
    const sectionIds = new Set((state?.distributions || []).map((item) => item.sectionId));
    return (state?.teachers || []).filter((teacher) => {
      if (teacher?.excluded || !isCompleteTeacher(teacher)) return false;
      return (teacher.assignments || []).some((assignment) =>
        sectionIds.has(assignment.sectionId) && assignmentCapacity(state, assignment) > 0
      );
    });
  }

  function teacherReason(state, teacher, semester) {
    const sectionIds = new Set((state?.distributions || []).map((item) => item.sectionId));
    const relevant = (teacher.assignments || [])
      .filter((assignment) => sectionIds.has(assignment.sectionId) && assignmentCapacity(state, assignment) > 0)
      .sort((a, b) => Number(b.weeklyPeriods || 0) - Number(a.weeklyPeriods || 0));
    const incomplete = (state?.distributions || []).some((distribution) => {
      const sem = semesterRecord(distribution, semester);
      return sem && !sem.complete;
    });
    const usedOtherSemester = (state?.distributions || []).some((distribution) => {
      const sem = semesterRecord(distribution, semester === 1 ? 2 : 1);
      return (sem?.weeks || []).some((week) => week.teacherId === teacher.id);
    });
    const top = relevant[0];
    const topText = top ? `أعلى إسناد لديه ${clean(top.subject)} بواقع ${ar(top.weeklyPeriods)} حصص.` : '';

    if (incomplete) {
      return `لم تتوفر له مطابقة خالية من التعارض في الأسابيع المتبقية. ${topText}`.trim();
    }
    if (usedOtherSemester) {
      return `لم يُستخدم في هذا الفصل لأن حاجة الشعب اكتملت بمصادر أعلى أولوية، وقد شارك في الفصل الآخر. ${topText}`.trim();
    }
    return `اكتملت حاجة الشعب من المواد الأعلى حصصًا والأرصدة الأعلى قبل الوصول إلى إسناداته. ${topText}`.trim();
  }

  function renderMetric(root, count) {
    const metrics = root.querySelector('.global-metrics');
    if (!metrics) return;
    let metric = metrics.querySelector('[data-undistributed-metric]');
    if (!metric) {
      metric = document.createElement('span');
      metric.dataset.undistributedMetric = '1';
      metrics.appendChild(metric);
    }
    metric.innerHTML = `<strong>${ar(count)}</strong> بلا توزيع`;
  }

  async function renderUndistributedReport() {
    const root = $('#distributionResults');
    if (!root || !root.classList.contains('panel') || !root.querySelector('.global-distribution-summary')) return;

    const state = await readState();
    if (!state?.distributions?.length) return;
    const semester = activeSemester(state);
    const usedIds = new Set(
      (state.distributions || []).flatMap((distribution) => semesterRecord(distribution, semester)?.weeks || [])
        .map((week) => week.teacherId)
        .filter(Boolean)
    );
    const candidates = candidateTeachers(state);
    const undistributed = candidates
      .filter((teacher) => !usedIds.has(teacher.id))
      .sort((a, b) => clean(a.name).localeCompare(clean(b.name), 'ar'));

    const signature = `${semester}|${usedIds.size}|${undistributed.map((teacher) => teacher.id).join(',')}`;
    const existing = root.querySelector('#undistributedTeachersPanel');
    if (existing && lastSignature === signature) {
      sortPrintWeekRanges(document);
      return;
    }
    lastSignature = signature;
    existing?.remove();
    renderMetric(root, undistributed.length);

    const panel = document.createElement('section');
    panel.id = 'undistributedTeachersPanel';
    panel.className = 'undistributed-teachers-panel';
    panel.innerHTML = `
      <div class="undistributed-teachers-head">
        <div>
          <span class="section-kicker">مراجعة المشاركة</span>
          <h3>المعلمون الذين لم يحصلوا على توزيع</h3>
          <p>${semester === 1 ? 'الفصل الدراسي الأول' : 'الفصل الدراسي الثاني'} · المعلمون المكتملة إسناداتهم وغير المستثنين فقط.</p>
        </div>
        <span class="undistributed-count ${undistributed.length ? '' : 'zero'}">${ar(undistributed.length)}</span>
      </div>
      ${undistributed.length
        ? `<div class="undistributed-teachers-list">${undistributed.map((teacher) => `
            <article class="undistributed-teacher-item">
              <strong>${esc(teacher.name)}</strong>
              <span>${esc(teacher.specialty || 'التخصص غير محدد')} · النصاب ${ar(teacher.load)}</span>
              <small>${esc(teacherReason(state, teacher, semester))}</small>
            </article>`).join('')}</div>`
        : '<div class="undistributed-empty">جميع المعلمين المؤهلين المشاركين في الشعب المستهدفة حصلوا على توزيع.</div>'}
      <div class="undistributed-note">عدم حصول معلم على توزيع لا يعني وجود خطأ في نصابه؛ المحرك يملأ احتياج كل شعبة أولًا، ويمنع استخدام المعلم في شعبتين خلال الأسبوع نفسه، ثم يفضل المواد الأعلى حصصًا والأرصدة الأعلى ضمن نسبة ١٠٪.</div>`;

    const summary = root.querySelector('.global-distribution-summary');
    summary.insertAdjacentElement('afterend', panel);
    sortPrintWeekRanges(document);
  }

  function scheduleRefresh(delay = 360) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      renderUndistributedReport().catch((error) => console.error('distribution report:', error));
      sortPrintWeekRanges(document);
    }, delay);
  }

  function boot() {
    sortPrintWeekRanges(document);
    scheduleRefresh(500);

    document.addEventListener('click', (event) => {
      if (event.target.closest('#generateDistributionBtn, [data-semester-tab], #clearDistributionBtn')) {
        lastSignature = '';
        scheduleRefresh(650);
      }
      if (event.target.closest('#activityAssignmentsPrintBtn, #refreshActivityPrintPreview')) {
        setTimeout(() => sortPrintWeekRanges(document), 320);
      }
      if (event.target.closest('#downloadActivityAssignmentsPdf')) {
        sortPrintWeekRanges(document);
      }
    }, true);

    const observer = new MutationObserver((mutations) => {
      let distributionChanged = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          sortPrintWeekRanges(node);
          if (node.matches('#distributionResults, .global-distribution-summary, .section-distribution-card') ||
              node.querySelector?.('#distributionResults, .global-distribution-summary, .section-distribution-card')) {
            distributionChanged = true;
          }
        }
      }
      if (distributionChanged) scheduleRefresh(420);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
