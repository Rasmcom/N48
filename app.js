(() => {
  'use strict';

  const DB_NAME = 'activity10LocalDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'state';
  const STATE_KEY = 'main';

  const gradeDefinitions = {
    primary: [
      ['p1', 'الأول الابتدائي'], ['p2', 'الثاني الابتدائي'], ['p3', 'الثالث الابتدائي'],
      ['p4', 'الرابع الابتدائي'], ['p5', 'الخامس الابتدائي'], ['p6', 'السادس الابتدائي']
    ],
    middle: [['m1', 'الأول المتوسط'], ['m2', 'الثاني المتوسط'], ['m3', 'الثالث المتوسط']],
    secondary: [['s1', 'الأول الثانوي'], ['s2', 'الثاني الثانوي'], ['s3', 'الثالث الثانوي']]
  };

  const stageLabels = {
    primary: { name: 'المرحلة الابتدائية', short: 'ابتدائي', hint: 'الصفوف من الأول إلى السادس' },
    middle: { name: 'المرحلة المتوسطة', short: 'متوسط', hint: 'الصفوف من الأول إلى الثالث' },
    secondary: { name: 'المرحلة الثانوية', short: 'ثانوي', hint: 'السنوات من الأولى إلى الثالثة' }
  };

  const subjectsCatalog = {
    primary: {
      general: ['القرآن الكريم والدراسات الإسلامية', 'اللغة العربية', 'الدراسات الاجتماعية', 'الرياضيات', 'العلوم', 'اللغة الإنجليزية', 'المهارات الرقمية', 'التربية الفنية', 'التربية البدنية والدفاع عن النفس', 'المهارات الحياتية والأسرية'],
      tahfiz: ['القرآن الكريم والدراسات الإسلامية', 'التجويد', 'اللغة العربية', 'الدراسات الاجتماعية', 'الرياضيات', 'العلوم', 'اللغة الإنجليزية', 'المهارات الرقمية', 'التربية الفنية', 'التربية البدنية والدفاع عن النفس', 'المهارات الحياتية والأسرية']
    },
    middle: {
      general: ['القرآن الكريم والدراسات الإسلامية', 'اللغة العربية', 'الدراسات الاجتماعية', 'الرياضيات', 'العلوم', 'اللغة الإنجليزية', 'المهارات الرقمية', 'التربية الفنية', 'التربية البدنية والدفاع عن النفس', 'المهارات الحياتية والأسرية', 'التفكير الناقد'],
      tahfiz: ['القرآن الكريم والدراسات الإسلامية', 'التجويد', 'اللغة العربية', 'الدراسات الاجتماعية', 'الرياضيات', 'العلوم', 'اللغة الإنجليزية', 'المهارات الرقمية', 'التربية الفنية', 'التربية البدنية والدفاع عن النفس', 'المهارات الحياتية والأسرية', 'التفكير الناقد']
    },
    secondary: {
      general: ['القرآن الكريم وتفسيره', 'الحديث', 'التوحيد', 'الفقه', 'الكفايات اللغوية', 'اللغة الإنجليزية', 'الرياضيات', 'الأحياء', 'الكيمياء', 'الفيزياء', 'علم البيئة', 'الدراسات الاجتماعية', 'التقنية الرقمية', 'التفكير الناقد', 'التربية الصحية والبدنية', 'المعرفة المالية', 'التربية المهنية'],
      tahfiz: ['القرآن الكريم وتفسيره', 'الحديث', 'التوحيد', 'الفقه', 'الكفايات اللغوية', 'اللغة الإنجليزية', 'الرياضيات', 'الأحياء', 'الكيمياء', 'الفيزياء', 'الدراسات الاجتماعية', 'التقنية الرقمية', 'التفكير الناقد', 'التربية الصحية والبدنية']
    }
  };

  const arabicSectionLetters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل'];

  const defaultState = () => ({
    version: 1,
    settings: {
      schoolName: '',
      gender: '',
      stages: {
        primary: { enabled: false, type: 'general' },
        middle: { enabled: false, type: 'general' },
        secondary: { enabled: false, type: 'general' }
      },
      gradeSections: {},
      regularPeriods: 35,
      targetLoad: 24,
      weeks: 36,
      activityWeekly: 1,
      currentStep: 1
    },
    teachers: [],
    importPreview: [],
    validation: [],
    distributions: [],
    selectedTeacherId: null,
    currentView: 'dashboard',
    lastSavedAt: null
  });

  let state = defaultState();
  let db;
  let storageMode = 'indexeddb';
  let saveTimer;
  let toastTimer;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ar = (value) => Number(value || 0).toLocaleString('ar-SA');
  const safeText = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const normalize = (value = '') => String(value).trim().replace(/\s+/g, ' ').toLowerCase();

  function mergeState(saved) {
    const base = defaultState();
    return {
      ...base,
      ...saved,
      settings: {
        ...base.settings,
        ...(saved?.settings || {}),
        stages: { ...base.settings.stages, ...(saved?.settings?.stages || {}) },
        gradeSections: { ...(saved?.settings?.gradeSections || {}) }
      },
      teachers: Array.isArray(saved?.teachers) ? saved.teachers : [],
      importPreview: Array.isArray(saved?.importPreview) ? saved.importPreview : [],
      validation: Array.isArray(saved?.validation) ? saved.validation : [],
      distributions: Array.isArray(saved?.distributions) ? saved.distributions : []
    };
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function readState() {
    if (storageMode === 'localstorage') {
      try { return Promise.resolve(JSON.parse(localStorage.getItem('activity10State') || 'null')); }
      catch { return Promise.resolve(null); }
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  function persistState() {
    state.lastSavedAt = new Date().toISOString();
    if (storageMode === 'localstorage') {
      localStorage.setItem('activity10State', JSON.stringify(state));
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(state, STATE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function scheduleSave(message = 'تم الحفظ محليًا') {
    clearTimeout(saveTimer);
    const status = $('#saveStatus');
    if (status) status.textContent = 'جارٍ الحفظ…';
    saveTimer = setTimeout(async () => {
      try {
        await persistState();
        if (status) status.textContent = message;
      } catch (error) {
        console.error(error);
        if (status) status.textContent = 'تعذر الحفظ';
      }
    }, 250);
  }

  function showToast(message, type = '') {
    const toast = $('#toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`.trim();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2700);
  }

  function enabledStageKeys() {
    return Object.entries(state.settings.stages).filter(([, v]) => v.enabled).map(([k]) => k);
  }

  function getAllGrades() {
    return enabledStageKeys().flatMap((stage) => gradeDefinitions[stage].map(([id, label]) => ({ id, label, stage })));
  }

  function getAllSections() {
    return getAllGrades().flatMap((grade) => {
      const count = Number(state.settings.gradeSections[grade.id] || 0);
      return Array.from({ length: count }, (_, i) => ({
        id: `${grade.id}_${i + 1}`,
        gradeId: grade.id,
        gradeLabel: grade.label,
        stage: grade.stage,
        letter: arabicSectionLetters[i] || String(i + 1),
        label: `${grade.label}/${arabicSectionLetters[i] || i + 1}`
      }));
    });
  }

  function getAvailableSubjects() {
    const subjects = new Set();
    enabledStageKeys().forEach((stage) => {
      const type = state.settings.stages[stage].type || 'general';
      (subjectsCatalog[stage]?.[type] || []).forEach((subject) => subjects.add(subject));
    });
    return [...subjects];
  }

  function teacherAssignmentLoad(teacher) {
    return (teacher.assignments || []).reduce((sum, item) => sum + Number(item.weeklyPeriods || 0), 0);
  }

  function assignmentCapacity(assignment) {
    return Math.floor(Number(assignment.weeklyPeriods || 0) * Number(state.settings.weeks || 36) * 0.10 + 1e-9);
  }

  function teacherCapacity(teacher) {
    return (teacher.assignments || []).reduce((sum, assignment) => sum + assignmentCapacity(assignment), 0);
  }

  function isTeacherComplete(teacher) {
    return Boolean(teacher.name && teacher.specialty && Number(teacher.load) > 0 && (teacher.assignments || []).length > 0 && teacherAssignmentLoad(teacher) === Number(teacher.load));
  }

  function isTeacherEligible(teacher) {
    const activityAnnual = Number(state.settings.activityWeekly) * Number(state.settings.weeks);
    return isTeacherComplete(teacher)
      && Number(teacher.load) === Number(state.settings.targetLoad)
      && Number(state.settings.regularPeriods) === 35
      && teacherCapacity(teacher) >= activityAnnual;
  }

  function settingsComplete() {
    return Boolean(state.settings.schoolName && state.settings.gender && enabledStageKeys().length && getAllSections().length);
  }

  function projectProgress() {
    const steps = [
      settingsComplete(),
      state.teachers.length > 0,
      state.teachers.length > 0 && state.teachers.every((t) => isTeacherComplete(t)),
      state.validation.length > 0,
      state.distributions.length > 0
    ];
    return Math.round((steps.filter(Boolean).length / steps.length) * 100);
  }

  function viewTitle(view) {
    return {
      dashboard: 'مركز القيادة', settings: 'إعداد المدرسة', import: 'استيراد المعلمين',
      classify: 'تصنيف المعلمين', validate: 'التحقق من البيانات', distribution: 'توزيع حصة النشاط'
    }[view] || 'موزّع حصة النشاط';
  }

  function navigate(view) {
    state.currentView = view;
    $$('.view').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === view));
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
    $('#pageTitle').textContent = viewTitle(view);
    if (view === 'dashboard') renderDashboard();
    if (view === 'settings') renderSettings();
    if (view === 'import') renderImportPreview();
    if (view === 'classify') renderTeachersList();
    if (view === 'validate') renderValidation();
    if (view === 'distribution') renderDistributions();
    updateTopbar();
    updateNavStates();
    scheduleSave();
  }

  function updateTopbar() {
    $('#schoolNameTop').textContent = state.settings.schoolName || 'مدرسة جديدة';
    const stageText = enabledStageKeys().map((key) => stageLabels[key].short).join('، ');
    $('#schoolMetaTop').textContent = stageText || 'لم تكتمل الإعدادات';
    $('#quickContinueBtn').textContent = settingsComplete() ? 'متابعة المشروع' : 'متابعة الإعداد';
  }

  function updateNavStates() {
    const states = {
      dashboard: 'complete',
      settings: settingsComplete() ? 'complete' : (state.settings.schoolName || enabledStageKeys().length ? 'warning' : ''),
      import: state.teachers.length ? 'complete' : '',
      classify: state.teachers.length && state.teachers.every(isTeacherComplete) ? 'complete' : (state.teachers.length ? 'warning' : ''),
      validate: state.validation.length ? (state.validation.every((x) => x.status === 'eligible') ? 'complete' : 'warning') : '',
      distribution: state.distributions.length ? 'complete' : ''
    };
    $$('[data-step-state]').forEach((el) => {
      const status = states[el.dataset.stepState] || '';
      el.className = `nav-state ${status}`.trim();
      el.textContent = status === 'complete' ? '●' : status === 'warning' ? '●' : '○';
    });
  }

  function renderDashboard() {
    const teachers = state.teachers;
    const complete = teachers.filter(isTeacherComplete).length;
    const eligible = teachers.filter(isTeacherEligible).length;
    const review = teachers.length - complete;
    $('#statTeachers').textContent = ar(teachers.length);
    $('#statComplete').textContent = ar(complete);
    $('#statEligible').textContent = ar(eligible);
    $('#statReview').textContent = ar(review);
    const progress = projectProgress();
    $('#progressPercent').textContent = `${ar(progress)}٪`;
    $('#progressBar').style.width = `${progress}%`;

    const workflow = [
      ['إعداد المدرسة', 'الهوية والمراحل والشعب', settingsComplete()],
      ['استيراد المعلمين', 'الأسماء والتخصصات والأنصبة', teachers.length > 0],
      ['تصنيف الإسنادات', 'المواد والفصول والشعب', teachers.length > 0 && teachers.every(isTeacherComplete)],
      ['التحقق', 'فحص النصاب ونسبة ١٠٪', state.validation.length > 0],
      ['التوزيع', 'خطة أسبوعية لكل معلم', state.distributions.length > 0]
    ];
    $('#workflowSteps').innerHTML = workflow.map((step, index) => `
      <div class="workflow-step ${step[2] ? 'complete' : ''}">
        <span class="step-index">${ar(index + 1)}</span>
        <div><strong>${step[0]}</strong><small>${step[1]}</small></div>
        <span class="step-status">${step[2] ? 'مكتملة' : 'قيد الإعداد'}</span>
      </div>`).join('');
  }

  function renderSettings() {
    $('#schoolNameInput').value = state.settings.schoolName || '';
    $$('[data-choice="gender"]').forEach((button) => button.classList.toggle('selected', button.dataset.value === state.settings.gender));
    $('#regularPeriodsInput').value = state.settings.regularPeriods;
    $('#targetLoadInput').value = state.settings.targetLoad;
    $('#weeksInput').value = state.settings.weeks;
    $('#activityWeeklyInput').value = state.settings.activityWeekly;
    renderStageCards();
    renderGradesEditor();
    showSettingsStep(state.settings.currentStep || 1, false);
  }

  function renderStageCards() {
    $('#stageCards').innerHTML = Object.entries(stageLabels).map(([key, meta]) => {
      const stage = state.settings.stages[key];
      return `<article class="stage-card ${stage.enabled ? 'active' : ''}" data-stage-card="${key}">
        <div class="stage-card-head"><div><h3>${meta.name}</h3><p>${meta.hint}</p></div><button class="stage-toggle" data-toggle-stage="${key}" aria-label="تفعيل المرحلة"></button></div>
        <div class="education-types">
          <button class="type-button ${stage.type === 'general' ? 'selected' : ''}" data-stage-type="${key}" data-type="general">تعليم عام</button>
          <button class="type-button ${stage.type === 'tahfiz' ? 'selected' : ''}" data-stage-type="${key}" data-type="tahfiz">تحفيظ القرآن</button>
        </div>
      </article>`;
    }).join('');
  }

  function renderGradesEditor() {
    const grades = getAllGrades();
    const root = $('#gradesEditor');
    if (!grades.length) {
      root.className = 'grades-editor empty-state';
      root.innerHTML = '<div class="empty-icon">▦</div><h3>اختر مرحلة تعليمية أولًا</h3><p>بعد اختيار المرحلة سيظهر هنا عدد الشعب لكل صف.</p>';
      return;
    }
    root.className = 'grades-editor';
    root.innerHTML = grades.map((grade) => {
      const count = Number(state.settings.gradeSections[grade.id] || 0);
      const chips = Array.from({ length: count }, (_, i) => `<span class="section-chip">${grade.label}/${arabicSectionLetters[i] || i + 1}</span>`).join('');
      return `<div class="grade-row">
        <div><strong>${grade.label}</strong><small>${stageLabels[grade.stage].name}</small></div>
        <label class="field"><span>عدد الشعب</span><input type="number" min="0" max="20" value="${count}" data-grade-count="${grade.id}"></label>
        <div class="sections-preview">${chips || '<span class="status-chip status-neutral">لم تُنشأ شعب</span>'}</div>
      </div>`;
    }).join('');
  }

  function showSettingsStep(step, persist = true) {
    step = Math.max(1, Math.min(4, Number(step)));
    state.settings.currentStep = step;
    $$('.settings-step-panel').forEach((panel) => panel.classList.toggle('active', Number(panel.dataset.settingsPanel) === step));
    $$('.wizard-step').forEach((button) => button.classList.toggle('active', Number(button.dataset.settingsStep) === step));
    $('#settingsPrevBtn').disabled = step === 1;
    $('#settingsNextBtn').textContent = step === 4 ? 'حفظ وإنهاء' : 'التالي';
    if (persist) scheduleSave();
  }

  function validateSettingsStep(step) {
    if (step === 1 && !state.settings.schoolName.trim()) return 'أدخل اسم المدرسة أولًا.';
    if (step === 1 && !state.settings.gender) return 'حدد بنين أو بنات.';
    if (step === 2 && !enabledStageKeys().length) return 'اختر مرحلة تعليمية واحدة على الأقل.';
    if (step === 3 && !getAllSections().length) return 'أدخل عدد الشعب لصف واحد على الأقل.';
    return '';
  }

  function parseTextTeachers(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.map((line, index) => {
      let parts;
      if (line.includes('|')) parts = line.split('|');
      else if (line.includes('\t')) parts = line.split('\t');
      else if (line.includes(',')) parts = line.split(',');
      else parts = [line];
      parts = parts.map((part) => part.trim());
      const possibleLoad = Number(String(parts[2] || '').replace(/[^0-9.]/g, ''));
      return {
        tempId: uid('preview'),
        row: index + 1,
        name: parts[0] || '',
        specialty: parts[1] || '',
        load: Number.isFinite(possibleLoad) && possibleLoad > 0 ? possibleLoad : Number(state.settings.targetLoad || 24),
        status: parts[0] ? (parts[1] ? 'complete' : 'warning') : 'error'
      };
    });
  }

  function normalizeHeader(value) {
    return normalize(value).replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  }

  function findHeaderKey(headers, patterns) {
    return headers.find((header) => patterns.some((pattern) => normalizeHeader(header).includes(pattern))) || null;
  }

  function rowsToPreview(rows) {
    if (!rows.length) return [];
    const headers = Object.keys(rows[0] || {});
    const nameKey = findHeaderKey(headers, ['اسم المعلم', 'المعلم', 'الاسم', 'name']);
    const specialtyKey = findHeaderKey(headers, ['التخصص', 'تخصص', 'subject', 'specialty']);
    const loadKey = findHeaderKey(headers, ['النصاب', 'حصص', 'load', 'period']);
    return rows.map((row, index) => {
      const values = Object.values(row);
      const name = String(nameKey ? row[nameKey] : values[0] || '').trim();
      const specialty = String(specialtyKey ? row[specialtyKey] : values[1] || '').trim();
      const parsedLoad = Number(String(loadKey ? row[loadKey] : values[2] || '').replace(/[^0-9.]/g, ''));
      return {
        tempId: uid('preview'), row: index + 1, name, specialty,
        load: Number.isFinite(parsedLoad) && parsedLoad > 0 ? parsedLoad : Number(state.settings.targetLoad || 24),
        status: name ? (specialty ? 'complete' : 'warning') : 'error'
      };
    }).filter((x) => x.name);
  }

  async function handleSpreadsheetFile(file) {
    try {
      const extension = file.name.split('.').pop().toLowerCase();
      if (extension === 'csv') {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        const delimiter = lines[0]?.includes(';') ? ';' : ',';
        const headers = (lines.shift() || '').split(delimiter).map((x) => x.trim());
        const rows = lines.map((line) => {
          const cells = line.split(delimiter).map((x) => x.trim().replace(/^"|"$/g, ''));
          return Object.fromEntries(headers.map((h, i) => [h, cells[i] || '']));
        });
        state.importPreview = rowsToPreview(rows);
      } else {
        if (!window.XLSX) throw new Error('تعذر تحميل قارئ Excel. استخدم CSV أو النص المباشر.');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        state.importPreview = rowsToPreview(rows);
      }
      renderImportPreview();
      showToast(`تمت قراءة ${state.importPreview.length} سجلًا`, 'success');
      scheduleSave();
    } catch (error) {
      console.error(error);
      showToast(error.message || 'تعذر قراءة الملف', 'error');
    }
  }

  function renderImportPreview() {
    const preview = state.importPreview || [];
    $('#previewCount').textContent = `${ar(preview.length)} سجل`;
    $('#clearPreviewBtn').disabled = !preview.length;
    $('#commitImportBtn').disabled = !preview.length;
    const root = $('#importPreview');
    if (!preview.length) {
      root.className = 'table-wrap empty-table';
      root.innerHTML = '<div class="empty-icon">▤</div><h3>لم يتم تحميل بيانات بعد</h3><p>ستظهر معاينة المعلمين هنا قبل اعتماد الاستيراد.</p>';
      return;
    }
    root.className = 'table-wrap';
    root.innerHTML = `<table class="data-table"><thead><tr><th>#</th><th>اسم المعلم</th><th>التخصص</th><th>النصاب</th><th>الحالة</th></tr></thead><tbody>
      ${preview.map((item, index) => `<tr>
        <td>${ar(index + 1)}</td>
        <td><input class="inline-input" data-preview-field="name" data-preview-id="${item.tempId}" value="${safeText(item.name)}"></td>
        <td><input class="inline-input" data-preview-field="specialty" data-preview-id="${item.tempId}" value="${safeText(item.specialty)}" placeholder="يحتاج مراجعة"></td>
        <td><input class="inline-input number" type="number" data-preview-field="load" data-preview-id="${item.tempId}" value="${Number(item.load || 24)}"></td>
        <td>${previewStatusChip(item)}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  function previewStatusChip(item) {
    if (!item.name) return '<span class="status-chip status-error">اسم غير صالح</span>';
    if (!item.specialty) return '<span class="status-chip status-warning">التخصص ناقص</span>';
    return '<span class="status-chip status-complete">مكتمل</span>';
  }

  function commitImport() {
    const valid = state.importPreview.filter((x) => x.name);
    let added = 0;
    valid.forEach((item) => {
      const existing = state.teachers.find((t) => normalize(t.name) === normalize(item.name));
      if (existing) {
        existing.specialty ||= item.specialty;
        existing.load = Number(item.load || existing.load || state.settings.targetLoad);
      } else {
        state.teachers.push({
          id: uid('teacher'), name: item.name, specialty: item.specialty,
          load: Number(item.load || state.settings.targetLoad), selectedSubjects: [], selectedSections: [], assignments: []
        });
        added += 1;
      }
    });
    state.importPreview = [];
    renderImportPreview();
    renderTeachersList();
    renderDashboard();
    updateNavStates();
    scheduleSave();
    showToast(`تم اعتماد ${ar(added)} معلمًا جديدًا`, 'success');
  }

  function filteredTeachers() {
    const query = normalize($('#teacherSearch')?.value || '');
    if (!query) return state.teachers;
    return state.teachers.filter((teacher) => normalize(`${teacher.name} ${teacher.specialty}`).includes(query));
  }

  function renderTeachersList() {
    const list = filteredTeachers();
    $('#teachersListCount').textContent = ar(state.teachers.length);
    const root = $('#teachersList');
    if (!state.teachers.length) {
      root.innerHTML = '<div class="empty-state"><div class="empty-icon">⇩</div><h3>لا يوجد معلمون</h3><p>استورد المعلمين أولًا.</p></div>';
      $('#teacherEditor').className = 'panel teacher-editor empty-state';
      $('#teacherEditor').innerHTML = '<div class="empty-icon">◫</div><h3>استورد المعلمين لبدء التصنيف</h3><p>يمكن الاستيراد من Excel أو النص المباشر.</p>';
      return;
    }
    root.innerHTML = list.map((teacher) => {
      const initials = teacher.name.split(' ').slice(0, 2).map((x) => x[0]).join('');
      const complete = isTeacherComplete(teacher);
      return `<button class="teacher-list-item ${state.selectedTeacherId === teacher.id ? 'active' : ''}" data-select-teacher="${teacher.id}">
        <span class="teacher-mini-avatar">${safeText(initials)}</span>
        <span><strong>${safeText(teacher.name)}</strong><small>${safeText(teacher.specialty || 'التخصص غير محدد')} · ${ar(teacherAssignmentLoad(teacher))}/${ar(teacher.load)}</small></span>
        <span class="teacher-status-dot ${complete ? 'complete' : 'warning'}"></span>
      </button>`;
    }).join('');
    if (state.selectedTeacherId && state.teachers.some((t) => t.id === state.selectedTeacherId)) renderTeacherEditor(state.selectedTeacherId);
    else if (list[0]) selectTeacher(list[0].id);
  }

  function selectTeacher(id) {
    state.selectedTeacherId = id;
    renderTeachersList();
    scheduleSave();
  }

  function renderTeacherEditor(id) {
    const teacher = state.teachers.find((t) => t.id === id);
    const root = $('#teacherEditor');
    if (!teacher) return;
    root.className = 'panel teacher-editor';
    root.innerHTML = '';
    root.appendChild($('#teacherEditorTemplate').content.cloneNode(true));
    const initials = teacher.name.split(' ').slice(0, 2).map((x) => x[0]).join('');
    $('.teacher-avatar', root).textContent = initials;
    $('[data-field="teacher-name"]', root).textContent = teacher.name;
    $('[data-field="teacher-specialty-display"]', root).textContent = teacher.specialty || 'التخصص غير محدد';
    $('[data-field="load-current"]', root).textContent = ar(teacherAssignmentLoad(teacher));
    $('[data-field="load-target"]', root).textContent = ar(teacher.load);
    $('[data-input="name"]', root).value = teacher.name;
    $('[data-input="specialty"]', root).value = teacher.specialty || '';
    $('[data-input="load"]', root).value = teacher.load || state.settings.targetLoad;

    const subjects = getAvailableSubjects();
    teacher.selectedSubjects ||= [];
    teacher.selectedSections ||= [];
    teacher.assignments ||= [];
    $('[data-field="subjects-count"]', root).textContent = `${ar(teacher.selectedSubjects.length)} مادة`;
    $('[data-field="subjects-list"]', root).innerHTML = subjects.map((subject, index) => {
      const checked = teacher.selectedSubjects.includes(subject);
      return `<div class="check-item"><input id="sub_${index}" type="checkbox" data-subject-check="${safeText(subject)}" ${checked ? 'checked' : ''}><label for="sub_${index}">${safeText(subject)}</label></div>`;
    }).join('') || '<span class="status-chip status-warning">اختر المراحل في إعداد المدرسة أولًا</span>';

    const sections = getAllSections();
    $('[data-field="sections-count"]', root).textContent = `${ar(teacher.selectedSections.length)} شعبة`;
    $('[data-field="sections-list"]', root).innerHTML = sections.map((section, index) => {
      const checked = teacher.selectedSections.includes(section.id);
      return `<div class="check-item"><input id="sec_${index}" type="checkbox" data-section-check="${section.id}" ${checked ? 'checked' : ''}><label for="sec_${index}">${safeText(section.label)}</label></div>`;
    }).join('') || '<span class="status-chip status-warning">أنشئ الشعب في إعداد المدرسة أولًا</span>';

    refreshAssignmentSelectors(root, teacher);
    renderAssignmentsTable(root, teacher);
  }

  function refreshAssignmentSelectors(root, teacher) {
    const subjectSelect = $('[data-input="assignment-subject"]', root);
    const sectionSelect = $('[data-input="assignment-section"]', root);
    subjectSelect.innerHTML = '<option value="">اختر المادة</option>' + teacher.selectedSubjects.map((subject) => `<option value="${safeText(subject)}">${safeText(subject)}</option>`).join('');
    const sectionsMap = new Map(getAllSections().map((x) => [x.id, x]));
    sectionSelect.innerHTML = '<option value="">اختر الشعبة</option>' + teacher.selectedSections.map((id) => sectionsMap.get(id)).filter(Boolean).map((section) => `<option value="${section.id}">${safeText(section.label)}</option>`).join('');
  }

  function renderAssignmentsTable(root, teacher) {
    const target = $('[data-field="assignments-table"]', root);
    const sectionsMap = new Map(getAllSections().map((x) => [x.id, x]));
    if (!teacher.assignments.length) {
      target.className = 'table-wrap compact-table empty-table';
      target.innerHTML = '<p>لم تُضف إسنادات لهذا المعلم.</p>';
      return;
    }
    target.className = 'table-wrap compact-table';
    target.innerHTML = `<table class="data-table"><thead><tr><th>المادة</th><th>الفصل والشعبة</th><th>الأسبوعي</th><th>السنوي</th><th>حد ١٠٪</th><th></th></tr></thead><tbody>
      ${teacher.assignments.map((assignment) => {
        const annual = Number(assignment.weeklyPeriods) * Number(state.settings.weeks);
        const section = sectionsMap.get(assignment.sectionId);
        return `<tr><td>${safeText(assignment.subject)}</td><td>${safeText(section?.label || assignment.sectionLabel || 'غير محدد')}</td><td>${ar(assignment.weeklyPeriods)}</td><td>${ar(annual)}</td><td>${ar(Math.floor(annual * .10))}</td><td><button class="icon-button" data-remove-assignment="${assignment.id}">×</button></td></tr>`;
      }).join('')}</tbody></table>`;
    $('[data-field="load-current"]', root).textContent = ar(teacherAssignmentLoad(teacher));
  }

  function teacherEditorAction(event) {
    const root = $('#teacherEditor');
    const teacher = state.teachers.find((t) => t.id === state.selectedTeacherId);
    if (!teacher || !root.contains(event.target)) return;

    const subjectCheck = event.target.closest('[data-subject-check]');
    if (subjectCheck) {
      const subject = subjectCheck.dataset.subjectCheck;
      teacher.selectedSubjects = subjectCheck.checked ? [...new Set([...teacher.selectedSubjects, subject])] : teacher.selectedSubjects.filter((x) => x !== subject);
      teacher.assignments = teacher.assignments.filter((x) => teacher.selectedSubjects.includes(x.subject));
      renderTeacherEditor(teacher.id); scheduleSave(); return;
    }
    const sectionCheck = event.target.closest('[data-section-check]');
    if (sectionCheck) {
      const sectionId = sectionCheck.dataset.sectionCheck;
      teacher.selectedSections = sectionCheck.checked ? [...new Set([...teacher.selectedSections, sectionId])] : teacher.selectedSections.filter((x) => x !== sectionId);
      teacher.assignments = teacher.assignments.filter((x) => teacher.selectedSections.includes(x.sectionId));
      renderTeacherEditor(teacher.id); scheduleSave(); return;
    }
    const remove = event.target.closest('[data-remove-assignment]');
    if (remove) {
      teacher.assignments = teacher.assignments.filter((x) => x.id !== remove.dataset.removeAssignment);
      renderTeacherEditor(teacher.id); renderTeachersList(); scheduleSave(); return;
    }
    const add = event.target.closest('[data-action="add-assignment"]');
    if (add) {
      const subject = $('[data-input="assignment-subject"]', root).value;
      const sectionId = $('[data-input="assignment-section"]', root).value;
      const weeklyPeriods = Number($('[data-input="assignment-periods"]', root).value);
      if (!subject || !sectionId || !weeklyPeriods) return showToast('اختر المادة والشعبة وعدد الحصص.', 'warning');
      const duplicate = teacher.assignments.some((x) => x.subject === subject && x.sectionId === sectionId);
      if (duplicate) return showToast('هذا الإسناد موجود مسبقًا.', 'warning');
      teacher.assignments.push({ id: uid('assignment'), subject, sectionId, weeklyPeriods });
      renderTeacherEditor(teacher.id); renderTeachersList(); scheduleSave(); return;
    }
    const save = event.target.closest('[data-action="save-teacher"]');
    if (save) {
      teacher.name = $('[data-input="name"]', root).value.trim();
      teacher.specialty = $('[data-input="specialty"]', root).value.trim();
      teacher.load = Number($('[data-input="load"]', root).value || state.settings.targetLoad);
      renderTeachersList(); renderDashboard(); updateNavStates(); scheduleSave(); showToast('تم حفظ بيانات المعلم', 'success'); return;
    }
    const del = event.target.closest('[data-action="delete-teacher"]');
    if (del) {
      if (!confirm(`حذف المعلم ${teacher.name}؟`)) return;
      state.teachers = state.teachers.filter((x) => x.id !== teacher.id);
      state.selectedTeacherId = null;
      renderTeachersList(); renderDashboard(); updateNavStates(); scheduleSave(); showToast('تم حذف المعلم', 'success');
    }
  }

  function runValidation() {
    const activityAnnual = Number(state.settings.activityWeekly) * Number(state.settings.weeks);
    state.validation = state.teachers.map((teacher) => {
      const currentLoad = teacherAssignmentLoad(teacher);
      const capacity = teacherCapacity(teacher);
      let status = 'eligible';
      let message = 'جاهز للتوزيع';
      if (!teacher.name || !teacher.specialty) { status = 'error'; message = 'الاسم أو التخصص غير مكتمل'; }
      else if (!(teacher.assignments || []).length) { status = 'error'; message = 'لا توجد إسنادات'; }
      else if (currentLoad !== Number(teacher.load)) { status = 'warning'; message = `الإسناد ${currentLoad} من ${teacher.load}`; }
      else if (Number(teacher.load) !== Number(state.settings.targetLoad)) { status = 'warning'; message = `النصاب ليس ${state.settings.targetLoad}`; }
      else if (capacity < activityAnnual) { status = 'error'; message = `الرصيد ${capacity} أقل من ${activityAnnual}`; }
      return { teacherId: teacher.id, teacherName: teacher.name, specialty: teacher.specialty, targetLoad: Number(teacher.load), currentLoad, capacity, activityAnnual, status, message };
    });
    renderValidation(); updateNavStates(); scheduleSave();
    const eligible = state.validation.filter((x) => x.status === 'eligible').length;
    showToast(`اكتمل التحقق: ${ar(eligible)} معلمًا مؤهلًا`, eligible ? 'success' : 'warning');
  }

  function renderValidation() {
    const items = state.validation || [];
    const summary = $('#validationSummary');
    if (!items.length) {
      summary.innerHTML = '';
      $('#validationTable').className = 'table-wrap empty-table';
      $('#validationTable').innerHTML = '<div class="empty-icon">✓</div><h3>شغّل التحقق بعد اكتمال التصنيف</h3><p>سيعرض النظام النصاب، اكتمال الإسناد، الرصيد المتاح، وحالة كل معلم.</p>';
      return;
    }
    const eligible = items.filter((x) => x.status === 'eligible').length;
    const warnings = items.filter((x) => x.status === 'warning').length;
    const errors = items.filter((x) => x.status === 'error').length;
    summary.innerHTML = [
      ['إجمالي المعلمين', items.length, ''], ['مؤهلون', eligible, 'success'], ['تحتاج مراجعة', warnings, 'warning'], ['غير مؤهلين', errors, 'error']
    ].map(([label, value, cls]) => `<div class="validation-summary-card ${cls}"><span>${label}</span><strong>${ar(value)}</strong></div>`).join('');
    $('#validationTable').className = 'table-wrap';
    $('#validationTable').innerHTML = `<table class="data-table"><thead><tr><th>المعلم</th><th>التخصص</th><th>النصاب</th><th>المسند</th><th>رصيد ١٠٪</th><th>المطلوب</th><th>الحالة</th></tr></thead><tbody>
      ${items.map((item) => `<tr><td>${safeText(item.teacherName)}</td><td>${safeText(item.specialty)}</td><td>${ar(item.targetLoad)}</td><td>${ar(item.currentLoad)}</td><td>${ar(item.capacity)}</td><td>${ar(item.activityAnnual)}</td><td><span class="status-chip status-${item.status === 'eligible' ? 'complete' : item.status}">${safeText(item.message)}</span></td></tr>`).join('')}
    </tbody></table>`;
  }

  function generateDistributionForTeacher(teacher) {
    const activityAnnual = Number(state.settings.activityWeekly) * Number(state.settings.weeks);
    const sectionsMap = new Map(getAllSections().map((x) => [x.id, x]));
    const assignments = teacher.assignments.map((assignment) => ({
      ...assignment,
      sectionLabel: sectionsMap.get(assignment.sectionId)?.label || assignment.sectionLabel || 'غير محدد',
      capacity: assignmentCapacity(assignment),
      used: 0
    })).filter((x) => x.capacity > 0);
    const weeks = [];
    let previousId = null;
    for (let week = 1; week <= activityAnnual; week += 1) {
      const candidates = assignments.filter((x) => x.used < x.capacity);
      if (!candidates.length) return { error: 'لا يوجد رصيد كافٍ لإكمال التوزيع.' };
      candidates.sort((a, b) => {
        const aRepeat = a.id === previousId ? 1 : 0;
        const bRepeat = b.id === previousId ? 1 : 0;
        if (aRepeat !== bRepeat) return aRepeat - bRepeat;
        const aRatio = a.used / a.capacity;
        const bRatio = b.used / b.capacity;
        if (aRatio !== bRatio) return aRatio - bRatio;
        return b.capacity - a.capacity;
      });
      const chosen = candidates[0];
      chosen.used += 1;
      previousId = chosen.id;
      weeks.push({ week, assignmentId: chosen.id, subject: chosen.subject, sectionId: chosen.sectionId, sectionLabel: chosen.sectionLabel });
    }
    return {
      id: uid('distribution'), teacherId: teacher.id, teacherName: teacher.name, specialty: teacher.specialty,
      loadBefore: Number(teacher.load), materialPeriods: Number(teacher.load) - Number(state.settings.activityWeekly),
      activityWeekly: Number(state.settings.activityWeekly), loadAfter: Number(teacher.load), activityAnnual,
      capacities: assignments.map(({ id, subject, sectionId, sectionLabel, capacity, used }) => ({ id, subject, sectionId, sectionLabel, capacity, used })),
      weeks, createdAt: new Date().toISOString()
    };
  }

  function generateDistributions() {
    if (!state.validation.length) runValidation();
    const eligibleIds = new Set(state.validation.filter((x) => x.status === 'eligible').map((x) => x.teacherId));
    const eligibleTeachers = state.teachers.filter((teacher) => eligibleIds.has(teacher.id));
    if (!eligibleTeachers.length) return showToast('لا يوجد معلمون مؤهلون للتوزيع.', 'warning');
    const results = [];
    const errors = [];
    eligibleTeachers.forEach((teacher) => {
      const result = generateDistributionForTeacher(teacher);
      if (result.error) errors.push(`${teacher.name}: ${result.error}`); else results.push(result);
    });
    state.distributions = results;
    renderDistributions(); renderDashboard(); updateNavStates(); scheduleSave();
    showToast(errors.length ? `تم توزيع ${ar(results.length)} مع وجود ملاحظات` : `تم توزيع النشاط على ${ar(results.length)} معلمًا`, errors.length ? 'warning' : 'success');
  }

  function renderDistributions() {
    const root = $('#distributionResults');
    if (!state.distributions.length) {
      root.className = 'distribution-results empty-state panel';
      root.innerHTML = '<div class="empty-icon activity-empty">●</div><h3>لم يتم إنشاء توزيع بعد</h3><p>أكمل الإعدادات والإسنادات، ثم شغّل التحقق قبل بدء التوزيع.</p>';
      return;
    }
    root.className = 'distribution-results panel';
    root.innerHTML = state.distributions.map((item) => `
      <article class="distribution-card">
        <div class="distribution-card-head">
          <div><h3>${safeText(item.teacherName)}</h3><p>${safeText(item.specialty)} · ${ar(item.activityAnnual)} حصة نشاط سنويًا</p></div>
          <div class="distribution-metrics">
            <div class="distribution-metric"><strong>${ar(item.loadBefore)}</strong><small>قبل</small></div>
            <div class="distribution-metric activity"><strong>${ar(item.activityWeekly)}</strong><small>نشاط</small></div>
            <div class="distribution-metric"><strong>${ar(item.loadAfter)}</strong><small>بعد</small></div>
          </div>
        </div>
        <div class="distribution-body">
          <div>
            <div class="subsection-heading"><div><h3>استخدام رصيد المواد</h3><p>لا يتجاوز حد ١٠٪ لكل إسناد.</p></div></div>
            <div class="capacity-list">
              ${item.capacities.map((cap) => `<div class="capacity-item"><div><strong>${safeText(cap.subject)}</strong><small>${safeText(cap.sectionLabel)} · مستخدم ${ar(cap.used)} من ${ar(cap.capacity)}</small><div class="capacity-bar"><span style="width:${Math.min(100, cap.used / cap.capacity * 100)}%"></span></div></div><span class="status-chip ${cap.used === cap.capacity ? 'status-warning' : 'status-complete'}">${(cap.used / (Number(state.settings.weeks) * Number((state.teachers.find(t => t.id === item.teacherId)?.assignments.find(a => a.id === cap.id)?.weeklyPeriods || 1))) * 100).toFixed(1)}٪</span></div>`).join('')}
            </div>
          </div>
          <div>
            <div class="subsection-heading"><div><h3>الخطة الأسبوعية</h3><p>المادة والفصل اللذان تتحول حصتهما إلى نشاط.</p></div></div>
            <div class="weeks-grid">${item.weeks.map((week) => `<div class="week-item"><strong>الأسبوع ${ar(week.week)} · نشاط</strong><span>${safeText(week.subject)}</span><small>${safeText(week.sectionLabel)}</small></div>`).join('')}</div>
          </div>
        </div>
      </article>`).join('');
  }

  function backupState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const school = (state.settings.schoolName || 'مشروع-النشاط').replace(/\s+/g, '-');
    anchor.href = url; anchor.download = `${school}-نسخة-احتياطية.json`; anchor.click();
    URL.revokeObjectURL(url);
    showToast('تم إنشاء النسخة الاحتياطية', 'success');
  }

  async function restoreState(file) {
    try {
      const restored = JSON.parse(await file.text());
      state = mergeState(restored);
      await persistState();
      renderAll();
      showToast('تمت استعادة النسخة بنجاح', 'success');
    } catch (error) {
      console.error(error);
      showToast('ملف النسخة الاحتياطية غير صالح', 'error');
    }
  }

  function applySidebarState(collapsed, persist = true) {
    const shell = $('.app-shell');
    const sidebar = $('.sidebar');
    const toggle = $('#sidebarToggle');
    if (!shell || !sidebar || !toggle) return;
    shell.classList.toggle('sidebar-collapsed', collapsed);
    sidebar.classList.toggle('collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'فتح القائمة الجانبية' : 'طي القائمة الجانبية');
    toggle.title = collapsed ? 'فتح القائمة الجانبية' : 'طي القائمة الجانبية';
    if (persist) localStorage.setItem('activity10SidebarCollapsed', collapsed ? '1' : '0');
  }

  function bindEvents() {
    $('#sidebarToggle').addEventListener('click', () => {
      const collapsed = !$('.app-shell').classList.contains('sidebar-collapsed');
      applySidebarState(collapsed);
    });
    $('#sideNav').addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (button) navigate(button.dataset.view);
    });
    document.addEventListener('click', (event) => {
      const go = event.target.closest('[data-go]');
      if (go) navigate(go.dataset.go);
    });
    $('#quickContinueBtn').addEventListener('click', () => navigate(settingsComplete() ? (state.teachers.length ? 'classify' : 'import') : 'settings'));

    $('#schoolNameInput').addEventListener('input', (event) => { state.settings.schoolName = event.target.value; updateTopbar(); scheduleSave(); });
    $$('[data-choice="gender"]').forEach((button) => button.addEventListener('click', () => {
      state.settings.gender = button.dataset.value; renderSettings(); scheduleSave();
    }));
    $('#stageCards').addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-toggle-stage]');
      if (toggle) {
        const key = toggle.dataset.toggleStage;
        state.settings.stages[key].enabled = !state.settings.stages[key].enabled;
        if (!state.settings.stages[key].enabled) gradeDefinitions[key].forEach(([id]) => delete state.settings.gradeSections[id]);
        renderStageCards(); renderGradesEditor(); scheduleSave(); return;
      }
      const type = event.target.closest('[data-stage-type]');
      if (type) {
        state.settings.stages[type.dataset.stageType].type = type.dataset.type;
        renderStageCards(); scheduleSave();
      }
    });
    $('#gradesEditor').addEventListener('input', (event) => {
      const input = event.target.closest('[data-grade-count]');
      if (!input) return;
      state.settings.gradeSections[input.dataset.gradeCount] = Math.max(0, Number(input.value || 0));
      renderGradesEditor(); scheduleSave();
    });
    ['regularPeriodsInput', 'targetLoadInput', 'weeksInput', 'activityWeeklyInput'].forEach((id) => {
      $('#' + id).addEventListener('input', (event) => {
        const map = { regularPeriodsInput: 'regularPeriods', targetLoadInput: 'targetLoad', weeksInput: 'weeks', activityWeeklyInput: 'activityWeekly' };
        state.settings[map[id]] = Math.max(1, Number(event.target.value || 1)); scheduleSave();
      });
    });
    $$('.wizard-step').forEach((button) => button.addEventListener('click', () => showSettingsStep(button.dataset.settingsStep)));
    $('#settingsPrevBtn').addEventListener('click', () => showSettingsStep(state.settings.currentStep - 1));
    $('#settingsNextBtn').addEventListener('click', () => {
      const current = state.settings.currentStep;
      const error = validateSettingsStep(current);
      if (error) return showToast(error, 'warning');
      if (current === 4) {
        scheduleSave(); updateTopbar(); updateNavStates(); renderDashboard(); showToast('تم حفظ إعداد المدرسة', 'success'); navigate('import');
      } else showSettingsStep(current + 1);
    });

    $$('.import-tab').forEach((button) => button.addEventListener('click', () => {
      $$('.import-tab').forEach((x) => x.classList.toggle('active', x === button));
      $$('.import-tab-panel').forEach((x) => x.classList.toggle('active', x.dataset.importPanel === button.dataset.importTab));
    }));
    $('#excelInput').addEventListener('change', (event) => { const file = event.target.files[0]; if (file) handleSpreadsheetFile(file); });
    const dropZone = $('#dropZone');
    ['dragenter', 'dragover'].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.remove('dragover'); }));
    dropZone.addEventListener('drop', (event) => { const file = event.dataTransfer.files[0]; if (file) handleSpreadsheetFile(file); });
    $('#parseTextBtn').addEventListener('click', () => {
      state.importPreview = parseTextTeachers($('#teachersTextInput').value);
      renderImportPreview(); scheduleSave(); showToast(`تمت قراءة ${ar(state.importPreview.length)} سجلًا`, 'success');
    });
    $('#importPreview').addEventListener('input', (event) => {
      const input = event.target.closest('[data-preview-field]');
      if (!input) return;
      const item = state.importPreview.find((x) => x.tempId === input.dataset.previewId);
      if (!item) return;
      item[input.dataset.previewField] = input.dataset.previewField === 'load' ? Number(input.value) : input.value;
      item.status = !item.name ? 'error' : item.specialty ? 'complete' : 'warning';
      scheduleSave();
    });
    $('#clearPreviewBtn').addEventListener('click', () => { state.importPreview = []; renderImportPreview(); scheduleSave(); });
    $('#commitImportBtn').addEventListener('click', commitImport);

    $('#teacherSearch').addEventListener('input', renderTeachersList);
    $('#teachersList').addEventListener('click', (event) => { const item = event.target.closest('[data-select-teacher]'); if (item) selectTeacher(item.dataset.selectTeacher); });
    $('#teacherEditor').addEventListener('click', teacherEditorAction);
    $('#teacherEditor').addEventListener('change', teacherEditorAction);

    $('#runValidationBtn').addEventListener('click', runValidation);
    $('#generateDistributionBtn').addEventListener('click', generateDistributions);
    $('#clearDistributionBtn').addEventListener('click', () => { state.distributions = []; renderDistributions(); updateNavStates(); scheduleSave(); showToast('تم مسح نتائج التوزيع', 'success'); });

    $('#backupBtn').addEventListener('click', backupState);
    $('#restoreInput').addEventListener('change', (event) => { const file = event.target.files[0]; if (file) restoreState(file); event.target.value = ''; });
  }

  function renderAll() {
    updateTopbar(); renderDashboard(); renderSettings(); renderImportPreview(); renderTeachersList(); renderValidation(); renderDistributions(); updateNavStates(); navigate(state.currentView || 'dashboard');
  }

  async function init() {
    try {
      db = await openDatabase();
      const saved = await readState();
      if (saved) state = mergeState(saved);
    } catch (error) {
      console.error('IndexedDB unavailable', error);
      storageMode = 'localstorage';
      state = mergeState(await readState());
    }
    bindEvents();
    applySidebarState(localStorage.getItem('activity10SidebarCollapsed') === '1', false);
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
