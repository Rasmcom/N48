(() => {
  'use strict';

  let bypassFileInterception = false;
  let autoConfirmMapping = false;
  let pendingSelection = null;
  let batchBusy = false;
  const sectionPlanCache = new Map();

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (value = '') => String(value ?? '').trim().replace(/\s+/g, ' ');
  const key = (value = '') => clean(value).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const safe = (value = '') => clean(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const ar = value => Number(value || 0).toLocaleString('ar-SA');
  const normalizeDigits = value => String(value ?? '').replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit)).replace(/[٬،]/g, '');

  const aliases = new Map([
    ['دين','دراسات إسلامية'], ['اسلاميات','دراسات إسلامية'], ['إسلاميات','دراسات إسلامية'], ['دراسات اسلامية','دراسات إسلامية'], ['تربية اسلامية','دراسات إسلامية'],
    ['قرآن','القرآن الكريم والدراسات الإسلامية'], ['قران','القرآن الكريم والدراسات الإسلامية'], ['تحفيظ','القرآن الكريم والدراسات الإسلامية'],
    ['رياضيات','رياضيات'], ['الرياضيات','رياضيات'], ['علوم','علوم'], ['العلوم','علوم'],
    ['عربي','لغة عربية'], ['لغة عربية','لغة عربية'], ['اللغه العربيه','لغة عربية'],
    ['انجليزي','لغة إنجليزية'], ['إنجليزي','لغة إنجليزية'], ['لغة انجليزية','لغة إنجليزية'], ['لغة إنجليزية','لغة إنجليزية'],
    ['اجتماعيات','دراسات اجتماعية'], ['دراسات اجتماعية','دراسات اجتماعية'],
    ['حاسب','مهارات رقمية'], ['حاسوب','مهارات رقمية'], ['مهارات رقمية','مهارات رقمية'],
    ['بدنية','تربية بدنية'], ['تربية بدنية','تربية بدنية'], ['فنية','تربية فنية'], ['تربية فنية','تربية فنية'],
    ['تجويد','تجويد'], ['تفكير ناقد','تفكير ناقد'], ['صفوف اولية','صفوف أولية'], ['صفوف أولية','صفوف أولية']
  ]);

  function canonicalSpecialty(value) {
    const raw = clean(value);
    if (!raw) return '';
    for (const [alias, canonical] of aliases) {
      if (key(alias) === key(raw)) return canonical;
    }
    return raw;
  }

  function detectName(row) {
    const cells = row.map(clean);
    if (/^Tea_/i.test(cells[0] || '') && cells[1]) return cells[1];
    const blocked = new Set(['دائم','معلم','معلمة','متعاقد','على رأس العمل']);
    return cells.find(value => /[\u0600-\u06FF]/.test(value) && value.split(' ').length >= 3 && !blocked.has(value) && !aliases.has(value)) || '';
  }

  function detectSpecialty(row, name) {
    for (const value of row.map(clean)) {
      if (!value || value === name) continue;
      const canonical = canonicalSpecialty(value);
      if (canonical !== value || [...aliases.values()].includes(canonical)) return canonical;
    }
    return '';
  }

  function detectLoad(row) {
    for (const value of row.map(clean)) {
      const normalized = normalizeDigits(value);
      if (!/^\d{1,2}$/.test(normalized)) continue;
      const number = Number(normalized);
      if (number >= 1 && number <= 40) return number;
    }
    return null;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    const source = String(text || '').replace(/^\ufeff/, '');
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && source[index + 1] === '\n') index += 1;
        row.push(cell); cell = '';
        if (row.some(value => clean(value))) rows.push(row);
        row = [];
      } else cell += char;
    }
    row.push(cell);
    if (row.some(value => clean(value))) rows.push(row);
    return rows;
  }

  async function readRows(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (window.XLSX) {
      const workbook = extension === 'csv'
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    }
    if (extension === 'csv') return parseCsv(await file.text());
    throw new Error('تعذر تحميل قارئ Excel. أعد فتح الصفحة أو استخدم CSV.');
  }

  function findHeaderRow(matrix) {
    const rows = matrix.map(row => Array.isArray(row) ? row.map(value => String(value ?? '').trim()) : []).filter(row => row.some(Boolean));
    const patterns = ['اسم المعلم','اسم الموظف','المعلم','الاسم','التخصص','مادة التخصص','النصاب','عدد الحصص','teacher','name','subject','load'];
    let bestIndex = -1, bestScore = 0;
    rows.slice(0, 10).forEach((row, rowIndex) => {
      const score = row.reduce((total, value) => total + (patterns.some(pattern => key(value).includes(key(pattern))) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; bestIndex = rowIndex; }
    });
    if (bestScore > 0) return { headers: rows[bestIndex], rows: rows.slice(bestIndex + 1), hasHeader: true };
    const maxColumns = Math.max(0, ...rows.map(row => row.length));
    return { headers: Array.from({ length: maxColumns }, (_, index) => `العمود ${index + 1}`), rows, hasHeader: false };
  }

  function findHeaderIndex(headers, patterns) {
    return headers.findIndex(header => patterns.some(pattern => key(header).includes(key(pattern))));
  }

  function bestColumn(rows, scorer) {
    const maxColumns = Math.max(0, ...rows.map(row => row.length));
    let selected = -1, selectedScore = 0;
    for (let index = 0; index < maxColumns; index += 1) {
      const score = scorer(rows, index);
      if (score > selectedScore) { selected = index; selectedScore = score; }
    }
    return selectedScore ? selected : -1;
  }

  function detectColumns(data) {
    let nameIndex = data.hasHeader ? findHeaderIndex(data.headers, ['اسم المعلم','اسم الموظف','المعلم','الاسم','teacher name','name']) : -1;
    let specialtyIndex = data.hasHeader ? findHeaderIndex(data.headers, ['مادة التخصص','التخصص','المادة','subject','specialty']) : -1;
    let loadIndex = data.hasHeader ? findHeaderIndex(data.headers, ['النصاب','عدد الحصص','الحصص','load','periods']) : -1;
    const teaRow = data.rows.find(row => /^Tea_/i.test(clean(row[0] || '')));
    if (nameIndex < 0 && teaRow?.[1]) nameIndex = 1;
    if (specialtyIndex < 0 && teaRow?.[5]) specialtyIndex = 5;
    if (nameIndex < 0) nameIndex = bestColumn(data.rows, (rows, index) => rows.slice(0, 40).filter(row => {
      const value = clean(row[index] || '');
      return /[\u0600-\u06FF]/.test(value) && value.split(' ').length >= 3 && !['دائم','معلم','معلمة','متعاقد'].includes(value);
    }).length);
    if (specialtyIndex < 0) specialtyIndex = bestColumn(data.rows, (rows, index) => rows.slice(0, 40).filter(row => {
      const raw = clean(row[index] || '');
      const canonical = canonicalSpecialty(raw);
      return raw && (canonical !== raw || [...aliases.values()].includes(canonical));
    }).length);
    if (loadIndex < 0) loadIndex = bestColumn(data.rows, (rows, index) => rows.slice(0, 40).filter(row => {
      const value = normalizeDigits(clean(row[index] || ''));
      return /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 40;
    }).length);
    return { nameIndex, specialtyIndex, loadIndex };
  }

  function recordsFromMatrix(matrix, sourceName) {
    const data = findHeaderRow(matrix);
    if (!data.rows.length) throw new Error('الملف لا يحتوي على بيانات.');
    const columns = detectColumns(data);
    if (columns.nameIndex < 0) throw new Error('تعذر التعرف تلقائيًا على عمود اسم المعلم. راجع عنوان العمود.');
    const records = data.rows.map((row, index) => {
      const name = clean(row[columns.nameIndex] || detectName(row));
      const specialty = columns.specialtyIndex >= 0 ? canonicalSpecialty(row[columns.specialtyIndex]) : detectSpecialty(row, name);
      const load = columns.loadIndex >= 0 ? detectLoad([row[columns.loadIndex]]) : detectLoad(row);
      return { row: index + 1, name, specialty, load };
    }).filter(record => record.name);
    if (!records.length) throw new Error('لم يتم العثور على أسماء معلمين صالحة في الملف.');
    return { records, sourceName };
  }

  function recordsFromText(text) {
    return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
      const row = line.includes('\t') ? line.split('\t') : line.includes('|') ? line.split('|') : line.split(',');
      const name = detectName(row);
      return { row: index + 1, name, specialty: detectSpecialty(row, name), load: detectLoad(row) };
    }).filter(record => record.name);
  }

  function ensureSelectionModal() {
    if ($('#teacherSelectionModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="teacherSelectionModal" class="teacher-selection-dialog">
        <div class="teacher-selection-card">
          <div class="teacher-selection-head">
            <div><span class="section-kicker">اختيار المعلمين</span><h2>حدد المعلمين المراد إضافتهم</h2><p id="teacherSelectionSource">تم التعرف على الأعمدة تلقائيًا.</p></div>
            <button type="button" class="dialog-close" data-close-selection>×</button>
          </div>
          <div class="teacher-selection-tools">
            <button type="button" class="secondary-button" data-select-all>تحديد الجميع</button>
            <button type="button" class="secondary-button" data-clear-all>إلغاء التحديد</button>
            <label class="selection-count-field"><span>تحديد أول</span><input id="teacherSelectionCount" type="number" min="1" placeholder="مثال: 10"><span>معلمين</span></label>
            <button type="button" class="secondary-button" data-select-count>تطبيق العدد</button>
            <strong id="teacherSelectionSummary">٠ محدد</strong>
          </div>
          <div class="teacher-selection-list" id="teacherSelectionList"></div>
          <div class="teacher-selection-actions"><button type="button" class="secondary-button" data-close-selection>إلغاء</button><button type="button" class="primary-button" id="confirmTeacherSelection">إضافة المحددين إلى المعاينة</button></div>
        </div>
      </dialog>`);
    const modal = $('#teacherSelectionModal');
    modal.addEventListener('change', updateSelectionSummary);
    modal.addEventListener('click', event => {
      if (event.target.closest('[data-close-selection]')) modal.close();
      if (event.target.closest('[data-select-all]')) { $$('[data-selection-index]', modal).forEach(input => input.checked = true); updateSelectionSummary(); }
      if (event.target.closest('[data-clear-all]')) { $$('[data-selection-index]', modal).forEach(input => input.checked = false); updateSelectionSummary(); }
      if (event.target.closest('[data-select-count]')) {
        const count = Math.max(0, Number($('#teacherSelectionCount').value || 0));
        $$('[data-selection-index]', modal).forEach((input, index) => input.checked = index < count);
        updateSelectionSummary();
      }
    });
    $('#confirmTeacherSelection').addEventListener('click', confirmSelection);
  }

  function showSelection(records, sourceName) {
    ensureSelectionModal();
    pendingSelection = { records, sourceName };
    $('#teacherSelectionSource').textContent = `${sourceName} · قرأ النظام الأعمدة تلقائيًا، وحدد المعلمين المراد نقلهم إلى المعاينة.`;
    $('#teacherSelectionList').innerHTML = records.map((record, index) => `
      <label class="teacher-selection-row"><input type="checkbox" data-selection-index="${index}" checked><span class="selection-index">${ar(index + 1)}</span><span><strong>${safe(record.name)}</strong><small>${safe(record.specialty || 'التخصص غير محدد')} · ${record.load ? `نصاب ${ar(record.load)}` : 'النصاب يكتب في المعاينة'}</small></span></label>`).join('');
    updateSelectionSummary();
    $('#teacherSelectionModal').showModal();
  }

  function updateSelectionSummary() {
    if (!pendingSelection) return;
    const selected = $$('#teacherSelectionModal [data-selection-index]:checked').length;
    $('#teacherSelectionSummary').textContent = `${ar(selected)} من ${ar(pendingSelection.records.length)} محدد`;
    $('#confirmTeacherSelection').disabled = selected === 0;
  }

  function readPreviewRecords() {
    return $$('#importPreview tbody tr').map(row => ({
      name: clean($('[data-preview-field="name"]', row)?.value || ''),
      specialty: canonicalSpecialty($('[data-preview-field="specialty"]', row)?.value || ''),
      load: Number(normalizeDigits($('[data-preview-field="load"]', row)?.value || '')) || null
    })).filter(record => record.name);
  }

  function toCsv(records) {
    const rows = [['اسم المعلم','التخصص','النصاب'], ...records.map(record => [record.name, record.specialty || '', record.load || ''])];
    return '\ufeff' + rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  function replacePreview(records, focusLastName = false) {
    if (!records.length) {
      $('#clearPreviewBtn')?.click();
      return;
    }
    const file = new File([toCsv(records)], `preview-${Date.now()}.csv`, { type: 'text/csv' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = $('#excelInput');
    input.files = transfer.files;
    bypassFileInterception = true;
    autoConfirmMapping = true;
    document.body.classList.add('auto-mapping');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const finish = () => {
      const dialog = $('#columnMappingModal');
      if (!autoConfirmMapping || !dialog?.open) return false;
      $('#confirmMappingBtn')?.click();
      autoConfirmMapping = false;
      document.body.classList.remove('auto-mapping');
      input.value = '';
      if (focusLastName) setTimeout(() => {
        const names = $$('#importPreview [data-preview-field="name"]');
        names.at(-1)?.focus();
        names.at(-1)?.select();
      }, 80);
      return true;
    };
    if (!finish()) {
      const observer = new MutationObserver(() => { if (finish()) observer.disconnect(); });
      observer.observe($('#columnMappingModal'), { attributes: true, attributeFilter: ['open'] });
      setTimeout(() => { observer.disconnect(); document.body.classList.remove('auto-mapping'); }, 3000);
    }
  }

  function confirmSelection() {
    if (!pendingSelection) return;
    const current = readPreviewRecords();
    const existing = new Set(current.map(record => key(record.name)));
    let added = 0, skipped = 0;
    $$('#teacherSelectionModal [data-selection-index]:checked').forEach(input => {
      const record = pendingSelection.records[Number(input.dataset.selectionIndex)];
      if (!record) return;
      const normalizedName = key(record.name);
      if (!normalizedName || existing.has(normalizedName)) { skipped += 1; return; }
      existing.add(normalizedName);
      current.push(record);
      added += 1;
    });
    $('#teacherSelectionModal').close();
    pendingSelection = null;
    replacePreview(current);
    setTimeout(() => {
      const message = skipped ? `تمت إضافة ${ar(added)} معلمًا وتجاوز ${ar(skipped)} مكرر` : `تمت إضافة ${ar(added)} معلمًا إلى المعاينة`;
      showLocalNotice(message, added ? 'success' : 'warning');
    }, 120);
  }

  function showLocalNotice(message, type = 'success') {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => { if (toast.textContent === message) toast.className = 'toast'; }, 2600);
  }

  async function interceptFile(event, file) {
    if (bypassFileInterception) { bypassFileInterception = false; return; }
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const matrix = await readRows(file);
      const result = recordsFromMatrix(matrix, file.name);
      showSelection(result.records, result.sourceName);
    } catch (error) {
      console.error(error);
      showLocalNotice(error.message || 'تعذر قراءة الملف.', 'error');
    } finally {
      if ($('#excelInput')) $('#excelInput').value = '';
    }
  }

  function interceptTextImport(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const records = recordsFromText($('#teachersTextInput')?.value || '');
    if (!records.length) return showLocalNotice('لم يتم العثور على أسماء صالحة في النص.', 'warning');
    showSelection(records, 'النص الملصق');
  }

  function ensureReviewTools() {
    const tools = $('.preview-tools');
    if (!tools || $('#addExcelPreviewBtn')) return;
    const excel = document.createElement('button');
    excel.type = 'button'; excel.id = 'addExcelPreviewBtn'; excel.className = 'secondary-button'; excel.textContent = 'إضافة من Excel';
    const manual = document.createElement('button');
    manual.type = 'button'; manual.id = 'addManualPreviewBtn'; manual.className = 'secondary-button'; manual.textContent = 'إضافة معلم يدويًا';
    tools.prepend(manual); tools.prepend(excel);
    excel.addEventListener('click', () => $('#excelInput')?.click());
    manual.addEventListener('click', () => {
      const records = readPreviewRecords();
      records.push({ name: 'اكتب اسم المعلم هنا', specialty: '', load: null });
      replacePreview(records, true);
    });
  }

  function enhancePreviewTable() {
    const table = $('#importPreview table');
    if (!table || table.dataset.actionsEnhanced === '1') return;
    table.dataset.actionsEnhanced = '1';
    const header = $('thead tr', table);
    if (header) header.insertAdjacentHTML('beforeend', '<th>إجراء</th>');
    $$('tbody tr', table).forEach((row, index) => {
      row.insertAdjacentHTML('beforeend', `<td><button type="button" class="icon-button preview-delete-button" data-preview-delete="${index}" aria-label="حذف المعلم">×</button></td>`);
    });
  }

  function handlePreviewDelete(event) {
    const button = event.target.closest('[data-preview-delete]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const index = Number(button.dataset.previewDelete);
    const records = readPreviewRecords();
    records.splice(index, 1);
    replacePreview(records);
    showLocalNotice('تم حذف المعلم من المعاينة');
  }

  function readSectionPlan(sectionId) {
    if (sectionPlanCache.has(sectionId)) return sectionPlanCache.get(sectionId);
    const sectionSelect = $('#autoSectionSelect');
    const subjectSelect = $('#autoSubjectSelect');
    if (!sectionSelect || !subjectSelect) return new Map();
    sectionSelect.value = sectionId;
    sectionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const plan = new Map();
    [...subjectSelect.options].filter(option => option.value).forEach(option => {
      subjectSelect.value = option.value;
      subjectSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const number = Number(normalizeDigits($('#autoPeriodsPreview strong')?.textContent || 0));
      if (number) plan.set(option.value, number);
    });
    sectionPlanCache.set(sectionId, plan);
    return plan;
  }

  function existingAssignmentKeys() {
    return new Set($$('#teacherAssignmentsTable tbody tr').map(row => {
      const cells = $$('td', row);
      return `${key(cells[1]?.textContent || '')}|${key(cells[0]?.textContent || '')}`;
    }));
  }

  function selectedBatchSections(root) {
    return $$('[data-batch-section]:checked', root).map(input => ({ id: input.value, label: input.dataset.sectionLabel }));
  }

  function selectedBatchSubjects(root) {
    return $$('[data-batch-subject]:checked', root).map(input => input.value);
  }

  function refreshBatchSubjects(panel) {
    const sections = selectedBatchSections(panel);
    const root = $('#batchSubjectsList', panel);
    const preserved = new Set(selectedBatchSubjects(panel));
    if (!sections.length) {
      root.innerHTML = '<div class="batch-empty">حدد الفصول والشعب أولًا.</div>';
      refreshBatchPreview(panel);
      return;
    }
    const totals = new Map();
    sections.forEach(section => readSectionPlan(section.id).forEach((periods, subject) => {
      const item = totals.get(subject) || { subject, total: 0, sections: 0 };
      item.total += periods; item.sections += 1; totals.set(subject, item);
    }));
    root.innerHTML = [...totals.values()].map(item => `
      <label class="batch-check-card subject-card"><input type="checkbox" data-batch-subject value="${safe(item.subject)}" ${preserved.has(item.subject) ? 'checked' : ''}><span><strong>${safe(item.subject)}</strong><small>${ar(item.total)} حصة على ${ar(item.sections)} شعبة</small></span></label>`).join('');
    refreshBatchPreview(panel);
  }

  function batchCombinations(panel) {
    const sections = selectedBatchSections(panel);
    const subjects = selectedBatchSubjects(panel);
    const existing = existingAssignmentKeys();
    const combinations = [];
    sections.forEach(section => {
      const plan = readSectionPlan(section.id);
      subjects.forEach(subject => {
        const periods = plan.get(subject);
        if (!periods) return;
        const assignmentKey = `${key(section.label)}|${key(subject)}`;
        if (existing.has(assignmentKey)) return;
        combinations.push({ sectionId: section.id, sectionLabel: section.label, subject, periods });
      });
    });
    return combinations;
  }

  function refreshBatchPreview(panel) {
    const preview = $('#batchAssignmentPreview', panel);
    const addButton = $('#addBatchAssignmentsBtn', panel);
    const sections = selectedBatchSections(panel);
    const subjects = selectedBatchSubjects(panel);
    const combinations = batchCombinations(panel);
    addButton.disabled = combinations.length === 0 || batchBusy;
    if (!sections.length || !subjects.length) {
      preview.className = 'batch-assignment-preview empty';
      preview.innerHTML = '<div><strong>معاينة الإسناد</strong><small>حدد أكثر من شعبة ومادة لعرض تقسيم الحصص.</small></div>';
      return;
    }
    if (!combinations.length) {
      preview.className = 'batch-assignment-preview warning';
      preview.innerHTML = '<div><strong>لا توجد إسنادات جديدة</strong><small>الاختيارات الحالية مضافة مسبقًا أو غير متاحة في الخطة.</small></div>';
      return;
    }
    const totals = new Map();
    combinations.forEach(item => {
      const total = totals.get(item.subject) || { subject: item.subject, periods: 0, sections: 0 };
      total.periods += item.periods; total.sections += 1; totals.set(item.subject, total);
    });
    const addedPeriods = combinations.reduce((sum, item) => sum + item.periods, 0);
    const currentLoad = Number(normalizeDigits($('.load-circle strong')?.textContent || 0));
    const targetLoad = Number(normalizeDigits($('.load-circle small')?.textContent?.split('/').at(-1) || 0));
    const after = currentLoad + addedPeriods;
    preview.className = `batch-assignment-preview ready ${targetLoad && after > targetLoad ? 'overload' : ''}`;
    preview.innerHTML = `<div class="batch-preview-heading"><div><strong>${ar(combinations.length)} إسناد جديد</strong><small>المجموع بعد الإضافة: ${ar(after)} من ${ar(targetLoad)} حصة</small></div><span>${ar(addedPeriods)} حصة</span></div><div class="batch-subject-totals">${[...totals.values()].map(item => `<span><b>${safe(item.subject)}</b><em>${ar(item.periods)} حصة</em><small>${ar(item.sections)} شعبة</small></span>`).join('')}</div>`;
  }

  async function addBatchAssignments(panel) {
    if (batchBusy) return;
    const combinations = batchCombinations(panel);
    if (!combinations.length) return showLocalNotice('حدد الفصول والمواد المراد إضافتها.', 'warning');
    const currentLoad = Number(normalizeDigits($('.load-circle strong')?.textContent || 0));
    const targetLoad = Number(normalizeDigits($('.load-circle small')?.textContent?.split('/').at(-1) || 0));
    const addedPeriods = combinations.reduce((sum, item) => sum + item.periods, 0);
    if (targetLoad && currentLoad + addedPeriods > targetLoad && !confirm(`سيصبح مجموع الإسناد ${currentLoad + addedPeriods} حصة، وهو أعلى من نصاب المعلم ${targetLoad}. هل تريد المتابعة؟`)) return;
    batchBusy = true;
    refreshBatchPreview(panel);
    showLocalNotice(`جارٍ إضافة ${ar(combinations.length)} إسناد…`);
    for (const item of combinations) {
      const sectionSelect = $('#autoSectionSelect');
      const subjectSelect = $('#autoSubjectSelect');
      const addButton = $('#addAutoAssignmentBtn');
      if (!sectionSelect || !subjectSelect || !addButton) break;
      sectionSelect.value = item.sectionId;
      sectionSelect.dispatchEvent(new Event('change', { bubbles: true }));
      subjectSelect.value = item.subject;
      subjectSelect.dispatchEvent(new Event('change', { bubbles: true }));
      addButton.click();
      await new Promise(resolve => setTimeout(resolve, 70));
    }
    batchBusy = false;
    setTimeout(() => {
      enhanceTeacherEditor();
      showLocalNotice(`تمت إضافة ${ar(combinations.length)} إسنادًا بإجمالي ${ar(addedPeriods)} حصة`);
    }, 120);
  }

  function enhanceTeacherEditor() {
    const editor = $('#teacherEditor');
    const legacy = $('.smart-assignment-panel', editor);
    if (!editor || !legacy || $('#batchAssignmentPanel', editor)) return;
    sectionPlanCache.clear();
    legacy.classList.add('legacy-assignment-panel');
    const options = [...$('#autoSectionSelect', editor).options].filter(option => option.value);
    const groups = new Map();
    options.forEach(option => {
      const label = option.textContent.trim();
      const grade = label.split('/')[0];
      const list = groups.get(grade) || [];
      list.push({ id: option.value, label });
      groups.set(grade, list);
    });
    const sectionCards = [...groups.entries()].map(([grade, sections]) => `<div class="batch-grade-group"><strong>${safe(grade)}</strong><div class="batch-check-grid">${sections.map(section => `<label class="batch-check-card"><input type="checkbox" data-batch-section value="${section.id}" data-section-label="${safe(section.label)}"><span>${safe(section.label)}</span></label>`).join('')}</div></div>`).join('');
    legacy.insertAdjacentHTML('beforebegin', `
      <section id="batchAssignmentPanel" class="smart-assignment-panel batch-assignment-panel">
        <div class="subsection-heading"><div><h3>إضافة مواد لعدة فصول وشعب</h3><p>حدد أكثر من شعبة وأكثر من مادة، ثم أضفها دفعة واحدة. يحسب النظام حصص كل مادة تلقائيًا من الدليل.</p></div><span class="guide-badge">مرتبط بالدليل</span></div>
        <div class="batch-assignment-grid">
          <div class="batch-picker"><div class="batch-picker-head"><div><strong>١. الفصول والشعب</strong><small>اختر شعبة واحدة أو أكثر</small></div><div><button type="button" class="mini-action" data-select-all-sections>تحديد الكل</button><button type="button" class="mini-action" data-clear-sections>مسح</button></div></div><div id="batchSectionsList" class="batch-list">${sectionCards || '<div class="batch-empty">لا توجد شعب في إعداد المدرسة.</div>'}</div></div>
          <div class="batch-picker"><div class="batch-picker-head"><div><strong>٢. المواد</strong><small>يمكن تحديد مادة واحدة أو عدة مواد</small></div><div><button type="button" class="mini-action" data-select-all-subjects>تحديد الكل</button><button type="button" class="mini-action" data-clear-subjects>مسح</button></div></div><div id="batchSubjectsList" class="batch-list"><div class="batch-empty">حدد الفصول والشعب أولًا.</div></div></div>
        </div>
        <div id="batchAssignmentPreview" class="batch-assignment-preview empty"><div><strong>معاينة الإسناد</strong><small>ستظهر هنا حصص كل مادة ومجموع النصاب بعد الإضافة.</small></div></div>
        <button type="button" id="addBatchAssignmentsBtn" class="primary-button full-width" disabled>إضافة الإسنادات المحددة</button>
      </section>`);
    const panel = $('#batchAssignmentPanel', editor);
    panel.addEventListener('change', event => {
      if (event.target.matches('[data-batch-section]')) refreshBatchSubjects(panel);
      if (event.target.matches('[data-batch-subject]')) refreshBatchPreview(panel);
    });
    panel.addEventListener('click', event => {
      if (event.target.closest('[data-select-all-sections]')) { $$('[data-batch-section]', panel).forEach(input => input.checked = true); refreshBatchSubjects(panel); }
      if (event.target.closest('[data-clear-sections]')) { $$('[data-batch-section]', panel).forEach(input => input.checked = false); refreshBatchSubjects(panel); }
      if (event.target.closest('[data-select-all-subjects]')) { $$('[data-batch-subject]', panel).forEach(input => input.checked = true); refreshBatchPreview(panel); }
      if (event.target.closest('[data-clear-subjects]')) { $$('[data-batch-subject]', panel).forEach(input => input.checked = false); refreshBatchPreview(panel); }
      if (event.target.closest('#addBatchAssignmentsBtn')) addBatchAssignments(panel);
    });
  }

  function observeDynamicUi() {
    const observer = new MutationObserver(() => {
      ensureReviewTools();
      enhancePreviewTable();
      enhanceTeacherEditor();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { ensureReviewTools(); enhancePreviewTable(); enhanceTeacherEditor(); }, 100);
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureSelectionModal();
    $('#excelInput')?.addEventListener('change', event => interceptFile(event, event.target.files?.[0]), true);
    $('#dropZone')?.addEventListener('drop', event => interceptFile(event, event.dataTransfer?.files?.[0]), true);
    $('#parseTextBtn')?.addEventListener('click', interceptTextImport, true);
    $('#importPreview')?.addEventListener('click', handlePreviewDelete, true);
    observeDynamicUi();
  });
})();
