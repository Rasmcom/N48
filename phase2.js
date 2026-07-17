(() => {
  'use strict';

  const DB_NAME = 'activity10LocalDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'state';
  const STATE_KEY = 'main';
  const META_KEY = 'activity10TeacherMeta';
  const RANKS = ['معلم ممارس', 'معلم متقدم', 'معلم خبير'];
  const sectionNumbers = new Map([['أ', '1'], ['ب', '2'], ['ج', '3'], ['د', '4'], ['هـ', '5'], ['و', '6'], ['ز', '7'], ['ح', '8'], ['ط', '9'], ['ي', '10'], ['ك', '11'], ['ل', '12']]);
  const gradeLabels = {
    p1: 'الأول الابتدائي', p2: 'الثاني الابتدائي', p3: 'الثالث الابتدائي',
    p4: 'الرابع الابتدائي', p5: 'الخامس الابتدائي', p6: 'السادس الابتدائي',
    m1: 'الأول المتوسط', m2: 'الثاني المتوسط', m3: 'الثالث المتوسط',
    s1: 'الأول الثانوي', s2: 'الثاني الثانوي', s3: 'الثالث الثانوي'
  };

  const specialtyAliases = new Map([
    ['دين', 'دراسات إسلامية'], ['تربية دينية', 'دراسات إسلامية'], ['دراسات اسلامية', 'دراسات إسلامية'],
    ['دراسات إسلامية', 'دراسات إسلامية'], ['اسلاميات', 'دراسات إسلامية'], ['إسلاميات', 'دراسات إسلامية'],
    ['تربية اسلامية', 'دراسات إسلامية'], ['قرآن', 'القرآن الكريم والدراسات الإسلامية'],
    ['قران', 'القرآن الكريم والدراسات الإسلامية'], ['تحفيظ', 'القرآن الكريم والدراسات الإسلامية'],
    ['رياضيات', 'رياضيات'], ['الرياضيات', 'رياضيات'], ['معلم رياضيات', 'رياضيات'],
    ['لغة عربية', 'لغة عربية'], ['اللغه العربيه', 'لغة عربية'], ['عربي', 'لغة عربية'], ['اللغة العربية', 'لغة عربية'],
    ['علوم', 'علوم'], ['العلوم', 'علوم'], ['انجليزي', 'لغة إنجليزية'], ['إنجليزي', 'لغة إنجليزية'],
    ['لغة انجليزية', 'لغة إنجليزية'], ['اللغة الإنجليزية', 'لغة إنجليزية'],
    ['اجتماعيات', 'دراسات اجتماعية'], ['دراسات اجتماعية', 'دراسات اجتماعية'],
    ['حاسب', 'مهارات رقمية'], ['حاسوب', 'مهارات رقمية'], ['مهارات رقمية', 'مهارات رقمية'],
    ['بدنية', 'تربية بدنية'], ['تربية بدنية', 'تربية بدنية'], ['فنية', 'تربية فنية'],
    ['تربية فنية', 'تربية فنية'], ['تجويد', 'تجويد'], ['تفكير ناقد', 'تفكير ناقد'],
    ['صفوف اولية', 'صفوف أولية'], ['صفوف أولية', 'صفوف أولية']
  ]);

  let bypassMapping = false;
  let pendingWorkbook = null;
  let manualLoadNames = new Set();
  let stateDbPromise = null;
  let teacherEditorToken = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const normalizeText = (value = '') => String(value).trim().replace(/\s+/g, ' ');
  const normalizeKey = (value = '') => normalizeText(value).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const ar = (value) => Number(value || 0).toLocaleString('ar-SA');
  const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function showNotice(message, type = 'warning') {
    const toast = $('#toast');
    if (!toast) return alert(message);
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => { toast.className = 'toast'; }, 3200);
  }

  function canonicalSpecialty(value) {
    const raw = normalizeText(value);
    if (!raw) return '';
    const direct = specialtyAliases.get(raw);
    if (direct) return direct;
    const key = normalizeKey(raw);
    for (const [alias, canonical] of specialtyAliases.entries()) {
      if (normalizeKey(alias) === key) return canonical;
    }
    return raw;
  }

  function getTeacherMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  function setTeacherMeta(meta) {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function openStateDb() {
    if (stateDbPromise) return stateDbPromise;
    stateDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return stateDbPromise;
  }

  async function readAppState() {
    try {
      const db = await openStateDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      try { return JSON.parse(localStorage.getItem('activity10State') || 'null'); }
      catch { return null; }
    }
  }

  async function writeAppState(state) {
    try {
      const db = await openStateDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(state, STATE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      localStorage.setItem('activity10State', JSON.stringify(state));
    }
  }

  function mergeMetaIntoState(state) {
    const meta = getTeacherMeta();
    (state?.teachers || []).forEach((teacher) => {
      const saved = meta[teacher.id] || {};
      teacher.rank = saved.rank || teacher.rank || 'معلم ممارس';
      teacher.excluded = typeof saved.excluded === 'boolean' ? saved.excluded : Boolean(teacher.excluded);
      meta[teacher.id] = { rank: teacher.rank, excluded: teacher.excluded };
    });
    setTeacherMeta(meta);
    return state;
  }

  async function syncMetaToState() {
    await delay(320);
    const state = mergeMetaIntoState(await readAppState());
    if (state) await writeAppState(state);
  }

  function numericSectionText(value) {
    return String(value || '').replace(/\/(أ|ب|ج|د|هـ|و|ز|ح|ط|ي|ك|ل)(?=$|[\s·،)])/g, (_, letter) => `/${sectionNumbers.get(letter)}`);
  }

  function numericSectionLabel(sectionId, fallback = '') {
    const match = String(sectionId || '').match(/^([pms]\d+)_(\d+)$/);
    if (!match) return numericSectionText(fallback || 'غير محدد');
    return `${gradeLabels[match[1]] || match[1]}/${Number(match[2])}`;
  }

  function applyNumericLabels(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (node.nodeValue?.includes('/')) node.nodeValue = numericSectionText(node.nodeValue);
    });
  }

  function downloadTemplate() {
    const rows = [
      ['المعرف', 'اسم المعلم', 'رقم الجوال', 'الحالة', 'الوظيفة', 'التخصص', 'مادة التخصص', 'النصاب'],
      ['Tea_1017100908', 'أحمد سعد أحمد الغامدي', '966530237122', 'دائم', 'معلم', 'دين', 'دين', ''],
      ['Tea_1017100909', 'خالد علي محمد الزهراني', '966550000002', 'دائم', 'معلم', 'رياضيات', 'رياضيات', '']
    ];
    const csv = '\ufeff' + rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'نموذج-استيراد-المعلمين.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function parseCsvFallback(text) {
    const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter((line) => line.trim());
    const delimiter = (lines[0]?.match(/;/g) || []).length > (lines[0]?.match(/,/g) || []).length ? ';' : ',';
    return lines.map((line) => {
      const cells = [];
      let current = '';
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
        else if (ch === '"') quoted = !quoted;
        else if (ch === delimiter && !quoted) { cells.push(current.trim()); current = ''; }
        else current += ch;
      }
      cells.push(current.trim());
      return cells;
    });
  }

  async function readFileAsMatrix(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (window.XLSX) {
      const workbook = extension === 'csv'
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    }
    if (extension === 'csv') return parseCsvFallback(await file.text());
    throw new Error('تعذر تحميل قارئ Excel. احفظ الملف CSV أو استخدم النص المباشر.');
  }

  function cleanMatrix(matrix) {
    const rows = matrix.map((row) => Array.isArray(row) ? row.map(normalizeText) : []).filter((row) => row.some(Boolean));
    if (!rows.length) return { headers: [], rows: [] };
    const headers = rows[0].map((header, index) => header || `العمود ${index + 1}`);
    return { headers, rows: rows.slice(1).filter((row) => row.some(Boolean)) };
  }

  function guessColumn(headers, patterns) {
    const normalizedPatterns = patterns.map(normalizeKey);
    const index = headers.findIndex((header) => normalizedPatterns.some((pattern) => normalizeKey(header).includes(pattern)));
    return index >= 0 ? String(index) : '';
  }

  function populateSelect(select, headers, selected = '', optional = false) {
    select.innerHTML = `${optional ? '<option value="">غير موجود / إدخال يدوي</option>' : '<option value="">اختر العمود</option>'}` + headers.map((header, index) => `<option value="${index}">${header}</option>`).join('');
    select.value = selected;
  }

  function renderMappingSample() {
    if (!pendingWorkbook) return;
    const nameValue = $('#mapNameColumn').value;
    const nameIndex = nameValue === '' ? null : Number(nameValue);
    const specialtyValue = $('#mapSpecialtyColumn').value;
    const loadValue = $('#mapLoadColumn').value;
    const specialtyIndex = specialtyValue === '' ? null : Number(specialtyValue);
    const loadIndex = loadValue === '' ? null : Number(loadValue);
    const sample = pendingWorkbook.rows.slice(0, 5);
    $('#mappingSample').innerHTML = `<table><thead><tr><th>اسم المعلم</th><th>التخصص</th><th>النصاب</th></tr></thead><tbody>${sample.map((row) => `<tr><td>${nameIndex === null ? '—' : normalizeText(row[nameIndex] || '')}</td><td>${canonicalSpecialty(specialtyIndex === null ? '' : row[specialtyIndex]) || '—'}</td><td>${loadIndex === null ? 'يُدخل يدويًا' : normalizeText(row[loadIndex] || '') || 'يُدخل يدويًا'}</td></tr>`).join('')}</tbody></table>`;
  }

  async function openMapping(file) {
    try {
      const cleaned = cleanMatrix(await readFileAsMatrix(file));
      if (!cleaned.headers.length || !cleaned.rows.length) throw new Error('الملف لا يحتوي على بيانات قابلة للقراءة.');
      pendingWorkbook = { ...cleaned, file };
      $('#mappingFileName').textContent = file.name;
      $('#mappingRowsCount').textContent = `${ar(cleaned.rows.length)} صف`;
      populateSelect($('#mapNameColumn'), cleaned.headers, guessColumn(cleaned.headers, ['اسم المعلم', 'المعلم', 'الاسم', 'name']));
      populateSelect($('#mapSpecialtyColumn'), cleaned.headers, guessColumn(cleaned.headers, ['التخصص', 'مادة التخصص', 'تخصص', 'specialty', 'subject']), true);
      populateSelect($('#mapLoadColumn'), cleaned.headers, guessColumn(cleaned.headers, ['النصاب', 'الحصص', 'load', 'period']), true);
      renderMappingSample();
      const dialog = $('#columnMappingModal');
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    } catch (error) {
      console.error(error);
      showNotice(error.message || 'تعذر قراءة الملف.', 'error');
    }
  }

  function confirmMapping() {
    if (!pendingWorkbook) return;
    const nameValue = $('#mapNameColumn').value;
    if (nameValue === '') return showNotice('حدد عمود اسم المعلم أولًا.');
    const nameIndex = Number(nameValue);
    const specialtyValue = $('#mapSpecialtyColumn').value;
    const loadValue = $('#mapLoadColumn').value;
    const specialtyIndex = specialtyValue === '' ? null : Number(specialtyValue);
    const loadIndex = loadValue === '' ? null : Number(loadValue);
    manualLoadNames = new Set();
    const normalizedRows = pendingWorkbook.rows.map((row) => {
      const name = normalizeText(row[nameIndex] || '');
      const specialty = canonicalSpecialty(specialtyIndex === null ? '' : row[specialtyIndex]);
      const parsedLoad = loadIndex === null ? 0 : Number(String(row[loadIndex] || '').replace(/[^0-9.]/g, ''));
      if (name && !(parsedLoad > 0 && parsedLoad <= 40)) manualLoadNames.add(normalizeKey(name));
      return [name, specialty, parsedLoad > 0 && parsedLoad <= 40 ? parsedLoad : ''];
    }).filter((row) => row[0]);
    if (!normalizedRows.length) return showNotice('لم يتم العثور على أسماء صالحة في العمود المحدد.');
    const csv = '\ufeff' + [['اسم المعلم', 'التخصص', 'النصاب'], ...normalizedRows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const normalizedFile = new File([csv], `normalized-${Date.now()}.csv`, { type: 'text/csv' });
    const transfer = new DataTransfer();
    transfer.items.add(normalizedFile);
    const input = $('#excelInput');
    input.files = transfer.files;
    bypassMapping = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const dialog = $('#columnMappingModal');
    if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
    pendingWorkbook = null;
    setTimeout(blankManualLoads, 100);
  }

  function interceptFileEvent(event, file) {
    if (bypassMapping) { bypassMapping = false; return false; }
    if (!file) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    openMapping(file);
    return true;
  }

  function looksLikeArabicName(value) {
    const clean = normalizeText(value);
    if (!/^[\u0600-\u06FF\s]+$/.test(clean)) return false;
    const words = clean.split(' ').filter(Boolean);
    return words.length >= 3 && !['دائم', 'مؤقت', 'معلم', 'معلمة', 'دين'].includes(clean);
  }

  function normalizeExternalText(text) {
    manualLoadNames = new Set();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const normalized = lines.map((line) => {
      const tabCells = line.split('\t').map(normalizeText).filter((value, index, arr) => value || index < arr.length - 1);
      const isExternal = tabCells.length >= 5 || /^Tea_/i.test(tabCells[0] || '');
      if (!isExternal) return line;
      const name = tabCells.find(looksLikeArabicName) || tabCells[1] || '';
      const specialtyCandidate = [...tabCells].reverse().find((cell) => {
        const canonical = canonicalSpecialty(cell);
        return canonical !== cell || specialtyAliases.has(cell) || ['دين', 'رياضيات', 'علوم', 'عربي', 'انجليزي', 'حاسب', 'بدنية', 'فنية'].includes(cell);
      }) || tabCells[tabCells.length - 1] || '';
      const specialty = canonicalSpecialty(specialtyCandidate);
      const load = tabCells.map((cell) => Number(String(cell).replace(/[^0-9.]/g, ''))).find((value) => value > 0 && value <= 40) || '';
      if (name && !load) manualLoadNames.add(normalizeKey(name));
      return `${name} | ${specialty} | ${load}`;
    });
    return normalized.join('\n');
  }

  function blankManualLoads() {
    $$('#importPreview tbody tr').forEach((row) => {
      const nameInput = $('[data-preview-field="name"]', row);
      const loadInput = $('[data-preview-field="load"]', row);
      if (!nameInput || !loadInput) return;
      if (manualLoadNames.has(normalizeKey(nameInput.value))) {
        loadInput.value = '';
        loadInput.placeholder = 'اكتب النصاب';
        loadInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    updatePreviewQuality();
  }

  function normalizePreview() {
    $$('#importPreview tbody tr').forEach((row) => {
      const name = $('[data-preview-field="name"]', row);
      const specialty = $('[data-preview-field="specialty"]', row);
      if (name) { name.value = normalizeText(name.value); name.dispatchEvent(new Event('input', { bubbles: true })); }
      if (specialty) { specialty.value = canonicalSpecialty(specialty.value); specialty.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    updatePreviewQuality();
  }

  function removeDuplicatePreview() {
    const seen = new Set();
    let removed = 0;
    $$('#importPreview tbody tr').forEach((row) => {
      const name = $('[data-preview-field="name"]', row);
      if (!name) return;
      const key = normalizeKey(name.value);
      row.classList.remove('preview-duplicate');
      if (key && seen.has(key)) {
        row.classList.add('preview-duplicate');
        name.value = '';
        name.dispatchEvent(new Event('input', { bubbles: true }));
        removed += 1;
      } else if (key) seen.add(key);
    });
    updatePreviewQuality();
    if (removed) showNotice(`تم استبعاد ${ar(removed)} سجل مكرر من الاعتماد.`, 'success');
  }

  function updatePreviewQuality() {
    const badge = $('#previewQualityBadge');
    if (!badge) return;
    const rows = $$('#importPreview tbody tr');
    if (!rows.length) { badge.textContent = 'بانتظار البيانات'; badge.className = 'quality-badge'; return; }
    const names = new Set();
    let missingSpecialty = 0;
    let missingLoad = 0;
    let invalidName = 0;
    let duplicates = 0;
    rows.forEach((row) => {
      const name = normalizeText($('[data-preview-field="name"]', row)?.value || '');
      const specialty = normalizeText($('[data-preview-field="specialty"]', row)?.value || '');
      const load = Number($('[data-preview-field="load"]', row)?.value || 0);
      if (!name) invalidName += 1;
      if (!specialty) missingSpecialty += 1;
      if (!(load > 0 && load <= 40)) missingLoad += 1;
      const key = normalizeKey(name);
      if (key) { if (names.has(key)) duplicates += 1; names.add(key); }
    });
    if (!invalidName && !missingSpecialty && !missingLoad && !duplicates) {
      badge.textContent = `جاهز للاعتماد · ${ar(rows.length)} سجل`;
      badge.className = 'quality-badge good';
      return;
    }
    const notes = [];
    if (invalidName) notes.push(`${ar(invalidName)} اسم غير صالح`);
    if (missingSpecialty) notes.push(`${ar(missingSpecialty)} تخصص ناقص`);
    if (missingLoad) notes.push(`${ar(missingLoad)} نصاب يحتاج إدخال`);
    if (duplicates) notes.push(`${ar(duplicates)} مكرر`);
    badge.textContent = notes.join(' · ');
    badge.className = `quality-badge ${invalidName ? 'error' : 'warning'}`;
  }

  function recommendedPlanDetected() {
    const primaryCard = $('[data-stage-card="primary"]');
    const middleCard = $('[data-stage-card="middle"]');
    const primaryTahfiz = primaryCard?.classList.contains('active') && $('[data-stage-type="primary"][data-type="tahfiz"]', primaryCard)?.classList.contains('selected');
    const middleTahfiz = middleCard?.classList.contains('active') && $('[data-stage-type="middle"][data-type="tahfiz"]', middleCard)?.classList.contains('selected');
    const upperPrimary = ['p4', 'p5', 'p6'].some((id) => Number($(`[data-grade-count="${id}"]`)?.value || 0) > 0);
    return Boolean((primaryTahfiz && upperPrimary) || middleTahfiz);
  }

  function updateEligibilityDiagnostic() {
    const root = $('#liveEligibilityDiagnostic');
    if (!root) return;
    const regular = Number($('#regularPeriodsInput')?.value || 0);
    const load = Number($('#targetLoadInput')?.value || 0);
    const weeks = Number($('#weeksInput')?.value || 0);
    const activity = Number($('#activityWeeklyInput')?.value || 0);
    const items = [
      { pass: regular === 35, title: '٣٥ حصة نظامية', ok: 'عدد حصص الصف مطابق لشرط التطبيق.', no: `القيمة الحالية ${ar(regular)} حصة.` },
      { pass: load === 24, title: 'نصاب ٢٤ حصة', ok: 'النصاب المستهدف مناسب للتوزيع.', no: `النصاب الحالي ${ar(load)} حصة.` },
      { pass: weeks === 36 && activity === 1, title: 'حصة نشاط أسبوعية', ok: '١ × ٣٦ = ٣٦ حصة سنويًا.', no: 'راجع الأسابيع أو عدد حصص النشاط.' },
      { pass: recommendedPlanDetected(), title: 'الخطة الأكثر احتياجًا', ok: 'تم رصد صفوف عليا أو متوسطة تحفيظ.', no: 'هذه علامة إرشادية، ويمكن المتابعة وفق واقع المدرسة.' }
    ];
    root.innerHTML = items.map((item) => `<article class="diagnostic-item ${item.pass ? 'pass' : 'attention'}"><span class="diagnostic-icon">${item.pass ? '✓' : '!'}</span><strong>${item.title}</strong><small>${item.pass ? item.ok : item.no}</small></article>`).join('');
  }

  function currentTeacherId() {
    return $('.teacher-list-item.active')?.dataset.selectTeacher || null;
  }

  async function enhanceTeacherEditor() {
    const root = $('#teacherEditor');
    const teacherId = currentTeacherId();
    if (!root || !teacherId || !$('.teacher-editor-content', root)) return;
    const token = ++teacherEditorToken;
    const fields = $('.teacher-fields', root);
    if (fields && !$('.phase2-rank-field', fields)) {
      fields.classList.add('phase2-teacher-fields');
      const rankLabel = document.createElement('label');
      rankLabel.className = 'field phase2-rank-field';
      rankLabel.innerHTML = `<span>الرتبة المهنية</span><select data-phase2-rank>${RANKS.map((rank) => `<option value="${rank}">${rank}</option>`).join('')}</select>`;
      const exclusionLabel = document.createElement('label');
      exclusionLabel.className = 'field phase2-exclusion-field';
      exclusionLabel.innerHTML = '<span>التوزيع</span><label class="exclude-switch"><input type="checkbox" data-phase2-excluded><i></i><b>استثناء من توزيع النشاط</b></label>';
      fields.append(rankLabel, exclusionLabel);
    }

    const builder = $('.assignment-builder', root);
    if (builder) {
      builder.classList.add('assignment-builder-integrated');
      const heading = $('.subsection-heading', builder);
      if (heading) heading.hidden = true;
      const addButton = $('[data-action="add-assignment"]', builder);
      if (addButton) addButton.textContent = 'إضافة المادة والشعبة';
    }

    const meta = getTeacherMeta();
    let current = meta[teacherId] || { rank: 'معلم ممارس', excluded: false };
    const state = await readAppState();
    if (token !== teacherEditorToken) return;
    const teacher = state?.teachers?.find((item) => item.id === teacherId);
    if (teacher) current = { rank: teacher.rank || current.rank || 'معلم ممارس', excluded: typeof teacher.excluded === 'boolean' ? teacher.excluded : Boolean(current.excluded) };
    meta[teacherId] = current;
    setTeacherMeta(meta);
    const rankSelect = $('[data-phase2-rank]', root);
    const excludedInput = $('[data-phase2-excluded]', root);
    if (rankSelect) rankSelect.value = current.rank || 'معلم ممارس';
    if (excludedInput) excludedInput.checked = Boolean(current.excluded);
    addActivityDifferenceNotes(root);
    applyNumericLabels(root);
  }

  function addActivityDifferenceNotes(root = document) {
    $$('.teacher-editor .data-table tbody tr', root).forEach((row) => {
      const cells = $$('td', row);
      if (cells.length < 3 || $('.activity-difference-note', cells[0])) return;
      const subject = normalizeText(cells[0].childNodes[0]?.textContent || cells[0].textContent);
      const weekly = Number(String(cells[2].textContent).replace(/[^0-9.]/g, ''));
      if (!subject || !(weekly > 0)) return;
      const note = document.createElement('div');
      note.className = 'activity-difference-note';
      note.textContent = `عند إضافة النشاط: ${subject} ${Math.max(0, weekly - 1)} + نشاط 1 = ${weekly}`;
      cells[0].appendChild(note);
    });
  }

  function decorateTeacherList() {
    const meta = getTeacherMeta();
    $$('.teacher-list-item').forEach((item) => {
      const teacherMeta = meta[item.dataset.selectTeacher] || {};
      item.classList.toggle('phase2-excluded-teacher', Boolean(teacherMeta.excluded));
      let badge = $('.excluded-mini-badge', item);
      if (teacherMeta.excluded && !badge) {
        badge = document.createElement('em');
        badge.className = 'excluded-mini-badge';
        badge.textContent = 'مستثنى';
        item.appendChild(badge);
      } else if (!teacherMeta.excluded && badge) badge.remove();
    });
  }

  function applyWordingFixes(root = document) {
    const replacements = new Map([
      ['الخطة الأسبوعية', 'توزيع حصة النشاط على الفصول المسندة'],
      ['خطة أسبوعية لكل معلم', 'توزيع النشاط على الفصول المسندة'],
      ['بناء الإسنادات', ''],
      ['إضافة إسناد', 'إضافة المادة والشعبة']
    ]);
    $$('h3,p,small,strong,button', root).forEach((element) => {
      const text = normalizeText(element.textContent);
      if (replacements.has(text)) element.textContent = replacements.get(text);
      if (/^الأسبوع\s+.+·\s+نشاط$/.test(text)) element.textContent = text.replace('· نشاط', '· حصة نشاط');
    });
    $$('.distribution-card').forEach((card) => {
      if ($('.distribution-equation-note', card)) return;
      const note = document.createElement('div');
      note.className = 'distribution-equation-note';
      note.innerHTML = '<strong>النصاب ثابت:</strong> حصة من المادة −١ + حصة نشاط +١، دون زيادة نصاب المعلم.';
      $('.distribution-card-head', card)?.after(note);
    });
  }

  function assignmentCapacity(assignment, weeks) {
    return Math.floor(Number(assignment.weeklyPeriods || 0) * Number(weeks || 36) * 0.10 + 1e-9);
  }

  function assignmentLoad(teacher) {
    return (teacher.assignments || []).reduce((sum, assignment) => sum + Number(assignment.weeklyPeriods || 0), 0);
  }

  function validateState(state) {
    const weeks = Number(state.settings?.weeks || 36);
    const activityAnnual = Number(state.settings?.activityWeekly || 1) * weeks;
    const targetLoad = Number(state.settings?.targetLoad || 24);
    const regularPeriods = Number(state.settings?.regularPeriods || 35);
    return (state.teachers || []).map((teacher) => {
      const currentLoad = assignmentLoad(teacher);
      const capacity = (teacher.assignments || []).reduce((sum, assignment) => sum + assignmentCapacity(assignment, weeks), 0);
      let status = 'eligible';
      let message = 'جاهز للتوزيع';
      if (teacher.excluded) { status = 'warning'; message = 'مستثنى من التوزيع'; }
      else if (!teacher.name || !teacher.specialty) { status = 'error'; message = 'الاسم أو التخصص غير مكتمل'; }
      else if (!(teacher.assignments || []).length) { status = 'error'; message = 'لا توجد مواد وشعب مسندة'; }
      else if (currentLoad !== Number(teacher.load)) { status = 'warning'; message = `الإسناد ${currentLoad} من ${teacher.load}`; }
      else if (Number(teacher.load) !== targetLoad) { status = 'warning'; message = `النصاب ليس ${targetLoad}`; }
      else if (regularPeriods !== 35) { status = 'error'; message = 'حصص الصف ليست 35'; }
      else if (capacity < activityAnnual) { status = 'error'; message = `الرصيد ${capacity} أقل من ${activityAnnual}`; }
      return { teacherId: teacher.id, teacherName: teacher.name, specialty: teacher.specialty, rank: teacher.rank || 'معلم ممارس', targetLoad: Number(teacher.load), currentLoad, capacity, activityAnnual, status, message };
    });
  }

  function generateForTeacher(teacher, state) {
    const weeksCount = Number(state.settings?.weeks || 36);
    const activityAnnual = Number(state.settings?.activityWeekly || 1) * weeksCount;
    const assignments = (teacher.assignments || []).map((assignment) => ({
      ...assignment,
      sectionLabel: numericSectionLabel(assignment.sectionId, assignment.sectionLabel),
      capacity: assignmentCapacity(assignment, weeksCount),
      used: 0
    })).filter((assignment) => assignment.capacity > 0);
    const weeks = [];
    let previousId = null;
    for (let week = 1; week <= activityAnnual; week += 1) {
      const candidates = assignments.filter((assignment) => assignment.used < assignment.capacity);
      if (!candidates.length) return { error: 'لا يوجد رصيد كافٍ لإكمال التوزيع.' };
      candidates.sort((a, b) => {
        const repeatDiff = Number(a.id === previousId) - Number(b.id === previousId);
        if (repeatDiff) return repeatDiff;
        const ratioDiff = (a.used / a.capacity) - (b.used / b.capacity);
        if (ratioDiff) return ratioDiff;
        return b.capacity - a.capacity;
      });
      const chosen = candidates[0];
      chosen.used += 1;
      previousId = chosen.id;
      weeks.push({ week, assignmentId: chosen.id, subject: chosen.subject, sectionId: chosen.sectionId, sectionLabel: chosen.sectionLabel });
    }
    return {
      id: `distribution_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      teacherId: teacher.id,
      teacherName: teacher.name,
      specialty: teacher.specialty,
      rank: teacher.rank || 'معلم ممارس',
      loadBefore: Number(teacher.load),
      materialPeriods: Number(teacher.load) - Number(state.settings?.activityWeekly || 1),
      activityWeekly: Number(state.settings?.activityWeekly || 1),
      loadAfter: Number(teacher.load),
      activityAnnual,
      capacities: assignments.map(({ id, subject, sectionId, sectionLabel, capacity, used, weeklyPeriods }) => ({ id, subject, sectionId, sectionLabel, capacity, used, weeklyPeriods })),
      weeks,
      createdAt: new Date().toISOString()
    };
  }

  async function runCustomValidation() {
    showNotice('جارٍ التحقق من جميع المعلمين…', 'success');
    await delay(380);
    const state = mergeMetaIntoState(await readAppState());
    if (!state) return showNotice('تعذر قراءة بيانات المشروع.', 'error');
    state.validation = validateState(state);
    state.currentView = 'validate';
    state.lastSavedAt = new Date().toISOString();
    await writeAppState(state);
    location.reload();
  }

  async function runCustomDistribution() {
    showNotice('جارٍ توزيع حصة النشاط على المعلمين غير المستثنين…', 'success');
    await delay(380);
    const state = mergeMetaIntoState(await readAppState());
    if (!state) return showNotice('تعذر قراءة بيانات المشروع.', 'error');
    state.validation = validateState(state);
    const eligibleIds = new Set(state.validation.filter((item) => item.status === 'eligible').map((item) => item.teacherId));
    const eligibleTeachers = (state.teachers || []).filter((teacher) => !teacher.excluded && eligibleIds.has(teacher.id));
    if (!eligibleTeachers.length) return showNotice('لا يوجد معلمون مؤهلون بعد استبعاد المحددين.', 'warning');
    const results = [];
    const errors = [];
    eligibleTeachers.forEach((teacher) => {
      const result = generateForTeacher(teacher, state);
      if (result.error) errors.push(`${teacher.name}: ${result.error}`); else results.push(result);
    });
    state.distributions = results;
    state.currentView = 'distribution';
    state.lastSavedAt = new Date().toISOString();
    await writeAppState(state);
    if (errors.length) console.warn(errors);
    location.reload();
  }

  async function refreshDashboardEligible() {
    const target = $('#statEligible');
    if (!target) return;
    const state = mergeMetaIntoState(await readAppState());
    if (!state) return;
    const eligible = validateState(state).filter((item) => item.status === 'eligible').length;
    target.textContent = ar(eligible);
  }

  function bind() {
    $('#downloadTemplateBtn')?.addEventListener('click', downloadTemplate);
    $('#normalizePreviewBtn')?.addEventListener('click', normalizePreview);
    $('#removeDuplicatePreviewBtn')?.addEventListener('click', removeDuplicatePreview);
    $('#confirmMappingBtn')?.addEventListener('click', confirmMapping);
    ['mapNameColumn', 'mapSpecialtyColumn', 'mapLoadColumn'].forEach((id) => $('#' + id)?.addEventListener('change', renderMappingSample));

    $('#excelInput')?.addEventListener('change', (event) => interceptFileEvent(event, event.target.files?.[0]), true);
    $('#dropZone')?.addEventListener('drop', (event) => interceptFileEvent(event, event.dataTransfer?.files?.[0]), true);

    $('#parseTextBtn')?.addEventListener('click', () => {
      const textarea = $('#teachersTextInput');
      if (textarea) textarea.value = normalizeExternalText(textarea.value);
      setTimeout(blankManualLoads, 90);
    }, true);

    $('#commitImportBtn')?.addEventListener('click', (event) => {
      const missingLoads = $$('#importPreview [data-preview-field="load"]').filter((input) => !(Number(input.value) > 0 && Number(input.value) <= 40));
      if (missingLoads.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        missingLoads[0].focus();
        showNotice(`اكتب النصاب يدويًا لـ ${ar(missingLoads.length)} معلم قبل الاعتماد.`, 'warning');
        return;
      }
      setTimeout(syncMetaToState, 650);
    }, true);

    $('#runValidationBtn')?.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); runCustomValidation(); }, true);
    $('#generateDistributionBtn')?.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); runCustomDistribution(); }, true);

    ['regularPeriodsInput', 'targetLoadInput', 'weeksInput', 'activityWeeklyInput'].forEach((id) => $('#' + id)?.addEventListener('input', updateEligibilityDiagnostic));
    $('#stageCards')?.addEventListener('click', () => setTimeout(updateEligibilityDiagnostic, 30));
    $('#gradesEditor')?.addEventListener('input', () => setTimeout(updateEligibilityDiagnostic, 30));

    $('#teacherEditor')?.addEventListener('change', (event) => {
      const teacherId = currentTeacherId();
      if (!teacherId) return;
      const meta = getTeacherMeta();
      meta[teacherId] ||= { rank: 'معلم ممارس', excluded: false };
      if (event.target.matches('[data-phase2-rank]')) meta[teacherId].rank = event.target.value || 'معلم ممارس';
      if (event.target.matches('[data-phase2-excluded]')) meta[teacherId].excluded = Boolean(event.target.checked);
      setTeacherMeta(meta);
      decorateTeacherList();
      syncMetaToState();
    });

    $('#teacherEditor')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="save-teacher"]')) setTimeout(syncMetaToState, 650);
    });

    const previewObserver = new MutationObserver(() => setTimeout(updatePreviewQuality, 20));
    if ($('#importPreview')) previewObserver.observe($('#importPreview'), { childList: true, subtree: true });

    const interfaceObserver = new MutationObserver((mutations) => {
      const roots = mutations.map((mutation) => mutation.target).filter(Boolean);
      roots.forEach((root) => { applyNumericLabels(root); applyWordingFixes(root); });
      setTimeout(() => { enhanceTeacherEditor(); decorateTeacherList(); addActivityDifferenceNotes(); }, 25);
    });
    interfaceObserver.observe(document.body, { childList: true, subtree: true });

    updateEligibilityDiagnostic();
    updatePreviewQuality();
    applyNumericLabels();
    applyWordingFixes();
    enhanceTeacherEditor();
    decorateTeacherList();
    refreshDashboardEligible();

    const textNote = $('.text-format-note');
    if (textNote) textNote.textContent = 'يدعم السطر المباشر من نظام شؤون المعلمين، ويستخرج الاسم والتخصص تلقائيًا. يُكتب النصاب يدويًا قبل الاعتماد.';
    const textArea = $('#teachersTextInput');
    if (textArea) textArea.placeholder = 'Tea_1017100908\tاحمد سعد احمد الغامدي\t966530237122\tدائم\tمعلم\tدين\tدين';
  }

  document.addEventListener('DOMContentLoaded', bind);
})();
