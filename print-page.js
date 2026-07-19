(() => {
  'use strict';

  const DB_NAME = 'activity10LocalDB';
  const STORE_NAME = 'state';
  const STATE_KEY = 'main';
  const PRINT_SETTINGS_KEY = 'activity10PrintSettings';
  const LARGE_LIST_THRESHOLD = 45;
  let currentState = null;
  let currentSemester = 1;
  let renderTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const ar = (value) => Number(value || 0).toLocaleString('ar-SA');
  const clean = (value = '') => String(value).trim().replace(/\s+/g, ' ');

  function loadStoredPrintSettings() {
    try { return JSON.parse(localStorage.getItem(PRINT_SETTINGS_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  function saveStoredPrintSettings(settings) {
    localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify(settings));
  }

  function readActivityState() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close();
          resolve(null);
          return;
        }
        const tx = db.transaction(STORE_NAME, 'readonly');
        const get = tx.objectStore(STORE_NAME).get(STATE_KEY);
        get.onsuccess = () => { const value = get.result || null; db.close(); resolve(value); };
        get.onerror = () => { const error = get.error; db.close(); reject(error); };
      };
    });
  }

  function ensureExternalScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-print-lib="${src}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.dataset.printLib = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`تعذر تحميل ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensurePdfLibraries() {
    await ensureExternalScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', () => typeof window.html2canvas === 'function');
    await ensureExternalScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', () => Boolean(window.jspdf?.jsPDF));
  }

  function genderTerms(state) {
    const girls = state?.settings?.gender === 'girls';
    return girls
      ? {
          teacher: 'المعلمة',
          teacherName: 'اسم المعلمة',
          teachers: 'المعلمات',
          manager: 'مديرة المدرسة',
          activityLeader: 'رائدة النشاط',
          managerPlaceholder: 'اسم مديرة المدرسة',
          leaderPlaceholder: 'اسم رائدة النشاط'
        }
      : {
          teacher: 'المعلم',
          teacherName: 'اسم المعلم',
          teachers: 'المعلمين',
          manager: 'مدير المدرسة',
          activityLeader: 'رائد النشاط',
          managerPlaceholder: 'اسم مدير المدرسة',
          leaderPlaceholder: 'اسم رائد النشاط'
        };
  }

  function buildModal() {
    if ($('#activityPrintPreview')) return;
    const preview = document.createElement('section');
    preview.id = 'activityPrintPreview';
    preview.className = 'activity-print-preview';
    preview.setAttribute('aria-live', 'polite');
    preview.innerHTML = `
      <div class="activity-print-preview-card">
        <div class="activity-print-preview-head">
          <h2>معاينة كشف تكليف حصة النشاط</h2>
          <div class="activity-print-preview-actions">
            <button id="downloadActivityAssignmentsPdf" class="activity-print-download" type="button">تنزيل PDF A4</button>
            <button id="closeActivityPrintPreview" class="activity-print-close" type="button">إغلاق</button>
          </div>
        </div>
        <div class="activity-print-settings">
          <label>الإدارة التعليمية<input id="activityPrintDept" type="text" placeholder="الإدارة العامة للتعليم بمنطقة مكة المكرمة"></label>
          <label>اسم المدرسة<input id="activityPrintSchool" type="text" placeholder="اسم المدرسة"></label>
          <label>العام الدراسي<input id="activityPrintYear" type="text" placeholder="1448هـ"></label>
          <label id="activityPrintManagerLabel">مدير المدرسة<input id="activityPrintManager" type="text" placeholder="اسم مدير المدرسة"></label>
          <label id="activityPrintLeaderLabel">رائد النشاط<input id="activityPrintLeader" type="text" placeholder="اسم رائد النشاط"></label>
          <label>الفصل الدراسي<select id="activityPrintSemester"><option value="1">الفصل الدراسي الأول</option><option value="2">الفصل الدراسي الثاني</option></select></label>
          <button id="refreshActivityPrintPreview" class="activity-print-refresh" type="button">تحديث المعاينة</button>
        </div>
        <div class="activity-print-preview-body"><div id="activityPrintPageHost"></div></div>
      </div>`;
    document.body.appendChild(preview);

    $('#closeActivityPrintPreview').addEventListener('click', closePreview);
    preview.addEventListener('click', (event) => { if (event.target === preview) closePreview(); });
    $('#refreshActivityPrintPreview').addEventListener('click', () => renderPrintPage());
    $('#activityPrintSemester').addEventListener('change', (event) => { currentSemester = Number(event.target.value || 1); renderPrintPage(); });
    $('#downloadActivityAssignmentsPdf').addEventListener('click', downloadPdf);
    $$('.activity-print-settings input').forEach((input) => input.addEventListener('input', () => {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(renderPrintPage, 250);
    }));
  }

  function printSettingsFromForm() {
    return {
      dept: clean($('#activityPrintDept')?.value || ''),
      school: clean($('#activityPrintSchool')?.value || ''),
      academicYear: clean($('#activityPrintYear')?.value || ''),
      manager: clean($('#activityPrintManager')?.value || ''),
      activityLeader: clean($('#activityPrintLeader')?.value || '')
    };
  }

  function hydratePrintSettings(state) {
    const stored = loadStoredPrintSettings();
    const terms = genderTerms(state);
    $('#activityPrintDept').value = stored.dept || 'الإدارة التعليمية';
    $('#activityPrintSchool').value = stored.school || state?.settings?.schoolName || 'اسم المدرسة';
    $('#activityPrintYear').value = stored.academicYear || '';
    $('#activityPrintManager').value = stored.manager || '';
    $('#activityPrintLeader').value = stored.activityLeader || stored.vice || '';
    $('#activityPrintManagerLabel').childNodes[0].nodeValue = terms.manager;
    $('#activityPrintLeaderLabel').childNodes[0].nodeValue = terms.activityLeader;
    $('#activityPrintManager').placeholder = terms.managerPlaceholder;
    $('#activityPrintLeader').placeholder = terms.leaderPlaceholder;
    currentSemester = Number(state?.distributionConfig?.activeSemester || 1);
    $('#activityPrintSemester').value = String(currentSemester);
  }

  function teacherRows(state, semester) {
    const teachers = new Map((state?.teachers || []).map((teacher) => [teacher.id, teacher]));
    const grouped = new Map();

    (state?.distributions || []).forEach((distribution) => {
      const sem = Array.isArray(distribution.semesters)
        ? distribution.semesters.find((item) => Number(item.semester) === semester)
        : null;
      if (!sem) return;
      (sem.summary || []).forEach((block) => {
        const teacher = teachers.get(block.teacherId);
        const teacherName = clean(block.teacherName || teacher?.name || '');
        if (!teacherName) return;
        const key = block.teacherId || teacherName;
        const row = grouped.get(key) || { teacherId: block.teacherId, teacherName, assignments: [] };
        row.assignments.push({
          subject: clean(block.subject || 'حصة النشاط'),
          section: clean(distribution.sectionLabel || sem.sectionLabel || ''),
          startWeek: Number(block.startWeek || 0),
          endWeek: Number(block.endWeek || 0)
        });
        grouped.set(key, row);
      });
    });

    return [...grouped.values()]
      .map((row) => ({ ...row, assignments: row.assignments.sort((a, b) => a.subject.localeCompare(b.subject, 'ar') || a.startWeek - b.startWeek || a.section.localeCompare(b.section, 'ar')) }))
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ar'));
  }

  function groupAssignmentsBySubject(assignments) {
    const subjects = new Map();
    assignments.forEach((item) => {
      const subject = clean(item.subject || 'حصة النشاط');
      const group = subjects.get(subject) || { subject, ranges: [] };
      const rangeKey = `${item.section}|${item.startWeek}|${item.endWeek}`;
      if (!group.ranges.some((range) => range.key === rangeKey)) {
        group.ranges.push({ key: rangeKey, section: item.section, startWeek: item.startWeek, endWeek: item.endWeek });
      }
      subjects.set(subject, group);
    });
    return [...subjects.values()].map((group) => ({
      ...group,
      ranges: group.ranges.sort((a, b) => a.startWeek - b.startWeek || a.section.localeCompare(b.section, 'ar'))
    }));
  }

  function assignmentCell(row) {
    if (!row) return '&nbsp;';
    const groups = groupAssignmentsBySubject(row.assignments);
    return `<div class="activity-assignment-lines">${groups.map((group) => `
      <span class="activity-assignment-line">
        <b>${esc(group.subject)}</b>
        <span class="activity-subject-ranges">${group.ranges.map((range) => `<small>${esc(range.section)} · من الأسبوع ${ar(range.startWeek)} إلى ${ar(range.endWeek)}</small>`).join('')}</span>
      </span>`).join('')}</div>`;
  }

  function singleTable(rows, terms) {
    const dense = rows.length > 28 ? ' dense' : '';
    return `<table class="activity-print-table single${dense}">
      <colgroup><col class="serial-col"><col class="teacher-col"><col class="assignment-col"><col class="signature-col"></colgroup>
      <thead><tr><th>م</th><th>${terms.teacherName}</th><th>حصة النشاط المسندة</th><th>التوقيع</th></tr></thead>
      <tbody>${rows.map((row, index) => `<tr><td class="serial">${ar(index + 1)}</td><td class="teacher-name">${esc(row.teacherName)}</td><td>${assignmentCell(row)}</td><td class="signature">&nbsp;</td></tr>`).join('')}</tbody>
    </table>`;
  }

  function pairedTable(rows, terms) {
    const split = Math.ceil(rows.length / 2);
    const first = rows.slice(0, split);
    const second = rows.slice(split);
    return `<table class="activity-print-table paired">
      <colgroup><col class="serial-col"><col class="teacher-col"><col class="assignment-col"><col class="signature-col"><col class="serial-col"><col class="teacher-col"><col class="assignment-col"><col class="signature-col"></colgroup>
      <thead><tr><th>م</th><th>${terms.teacherName}</th><th>حصة النشاط</th><th>التوقيع</th><th>م</th><th>${terms.teacherName}</th><th>حصة النشاط</th><th>التوقيع</th></tr></thead>
      <tbody>${first.map((left, index) => {
        const right = second[index];
        return `<tr>
          <td class="serial">${ar(index + 1)}</td><td class="teacher-name">${esc(left.teacherName)}</td><td>${assignmentCell(left)}</td><td class="signature">&nbsp;</td>
          ${right ? `<td class="serial">${ar(split + index + 1)}</td><td class="teacher-name">${esc(right.teacherName)}</td><td>${assignmentCell(right)}</td><td class="signature">&nbsp;</td>` : '<td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>'}
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  function renderPrintPage() {
    if (!currentState) return;
    const settings = printSettingsFromForm();
    saveStoredPrintSettings(settings);
    const rows = teacherRows(currentState, currentSemester);
    const semesterLabel = currentSemester === 1 ? 'الفصل الدراسي الأول' : 'الفصل الدراسي الثاني';
    const terms = genderTerms(currentState);
    const table = rows.length >= LARGE_LIST_THRESHOLD ? pairedTable(rows, terms) : singleTable(rows, terms);
    const host = $('#activityPrintPageHost');
    host.innerHTML = `<div id="activityPrintPage" class="activity-print-page portrait">
      <div class="activity-print-band top"></div>
      <div class="activity-print-content"><div class="activity-print-sheet">
        <div class="activity-print-header">
          <div class="activity-print-brand-row">
            <div class="activity-print-logo"><img src="https://raw.githubusercontent.com/Rasmcom/N48/main/logomoe.png" alt="شعار وزارة التعليم"></div>
            <div class="activity-print-school-lines"><span class="edu-line">${esc(settings.dept || 'الإدارة التعليمية')}</span><span class="school-line">${esc(settings.school || currentState?.settings?.schoolName || 'اسم المدرسة')}</span></div>
          </div>
          <div class="activity-print-title">كشف تكليف ${terms.teachers} بحصة النشاط</div>
          <div class="activity-print-meta"><span>العام الدراسي: ${esc(settings.academicYear || '—')}</span><span>الفصل الدراسي: ${esc(semesterLabel)}</span></div>
        </div>
        <div class="activity-print-table-wrap">${rows.length ? table : '<div class="activity-print-empty">لا توجد تكليفات نشاط في الفصل الدراسي المحدد.</div>'}</div>
        <div class="activity-print-footer"><div class="activity-print-signatures"><div class="activity-print-signature activity-leader-signature"><b>${terms.activityLeader}</b><span>${esc(settings.activityLeader || '')}</span></div><div class="activity-print-signature manager-signature"><b>${terms.manager}</b><span>${esc(settings.manager || '')}</span></div></div></div>
      </div></div>
      <div class="activity-print-band bottom"></div>
    </div>`;
  }

  async function openPreview() {
    await new Promise((resolve) => setTimeout(resolve, 230));
    try { currentState = await readActivityState(); }
    catch (error) { console.error(error); alert('تعذر قراءة بيانات النظام المحفوظة.'); return; }
    if (!currentState?.distributions?.length) {
      alert('أنشئ توزيع حصة النشاط أولًا، ثم افتح صفحة الطباعة.');
      return;
    }
    hydratePrintSettings(currentState);
    renderPrintPage();
    $('#activityPrintPreview').classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closePreview() {
    $('#activityPrintPreview')?.classList.remove('show', 'pdf-capture');
    document.body.style.overflow = '';
  }

  async function downloadPdf() {
    const page = $('#activityPrintPage');
    if (!page) return;
    const button = $('#downloadActivityAssignmentsPdf');
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'جارٍ تجهيز PDF…';
    try {
      await ensurePdfLibraries();
      if (document.fonts?.ready) await document.fonts.ready;
      const preview = $('#activityPrintPreview');
      preview.classList.add('pdf-capture');
      preview.style.width = '210mm';
      preview.style.height = '297mm';
      preview.querySelector('.activity-print-preview-card').style.width = '210mm';
      await new Promise((resolve) => setTimeout(resolve, 100));
      const canvas = await html2canvas(page, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, width: page.scrollWidth, height: page.scrollHeight });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      pdf.addImage(canvas.toDataURL('image/jpeg', .96), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      const school = (printSettingsFromForm().school || currentState?.settings?.schoolName || 'المدرسة').replace(/[\\/:*?"<>|]+/g, '-');
      pdf.save(`كشف-تكليف-حصة-النشاط-${school}-${currentSemester === 1 ? 'الفصل-الأول' : 'الفصل-الثاني'}.pdf`);
    } catch (error) {
      console.error(error);
      alert(error?.message || 'تعذر إنشاء ملف PDF.');
    } finally {
      const preview = $('#activityPrintPreview');
      preview.classList.remove('pdf-capture');
      preview.removeAttribute('style');
      preview.querySelector('.activity-print-preview-card')?.removeAttribute('style');
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function addPrintButton() {
    const actions = $('.distribution-toolbar .toolbar-actions');
    if (!actions || $('#activityAssignmentsPrintBtn')) return;
    const button = document.createElement('button');
    button.id = 'activityAssignmentsPrintBtn';
    button.type = 'button';
    button.className = 'secondary-button';
    button.textContent = 'معاينة وطباعة التكليفات';
    button.addEventListener('click', openPreview);
    actions.appendChild(button);
  }

  function boot() {
    buildModal();
    addPrintButton();
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && $('#activityPrintPreview')?.classList.contains('show')) closePreview(); });
    const observer = new MutationObserver(addPrintButton);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
