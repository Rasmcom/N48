(() => {
  'use strict';

  const specialtyAliases = new Map([
    ['رياضيات', 'رياضيات'], ['الرياضيات', 'رياضيات'], ['معلم رياضيات', 'رياضيات'],
    ['لغة عربية', 'لغة عربية'], ['اللغه العربيه', 'لغة عربية'], ['عربي', 'لغة عربية'], ['اللغة العربية', 'لغة عربية'],
    ['دراسات اسلامية', 'دراسات إسلامية'], ['دراسات إسلامية', 'دراسات إسلامية'], ['اسلاميات', 'دراسات إسلامية'], ['إسلاميات', 'دراسات إسلامية'], ['تربية اسلامية', 'دراسات إسلامية'],
    ['قرآن', 'القرآن الكريم والدراسات الإسلامية'], ['تحفيظ', 'القرآن الكريم والدراسات الإسلامية'], ['قران', 'القرآن الكريم والدراسات الإسلامية'],
    ['علوم', 'علوم'], ['العلوم', 'علوم'],
    ['انجليزي', 'لغة إنجليزية'], ['إنجليزي', 'لغة إنجليزية'], ['لغة انجليزية', 'لغة إنجليزية'], ['اللغة الإنجليزية', 'لغة إنجليزية'],
    ['اجتماعيات', 'دراسات اجتماعية'], ['دراسات اجتماعية', 'دراسات اجتماعية'],
    ['حاسب', 'مهارات رقمية'], ['حاسوب', 'مهارات رقمية'], ['مهارات رقمية', 'مهارات رقمية'],
    ['بدنية', 'تربية بدنية'], ['تربية بدنية', 'تربية بدنية'],
    ['فنية', 'تربية فنية'], ['تربية فنية', 'تربية فنية'],
    ['تجويد', 'تجويد'], ['تفكير ناقد', 'تفكير ناقد'], ['صفوف اولية', 'صفوف أولية'], ['صفوف أولية', 'صفوف أولية']
  ]);

  let bypassMapping = false;
  let pendingWorkbook = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const normalizeText = (value = '') => String(value).trim().replace(/\s+/g, ' ');
  const normalizeKey = (value = '') => normalizeText(value).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const ar = (value) => Number(value || 0).toLocaleString('ar-SA');
  const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

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

  function downloadTemplate() {
    const rows = [
      ['اسم المعلم', 'التخصص', 'النصاب'],
      ['أحمد محمد الغامدي', 'رياضيات', '24'],
      ['خالد علي الزهراني', 'دراسات إسلامية', '24']
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
    const rows = matrix
      .map((row) => Array.isArray(row) ? row.map((cell) => normalizeText(cell)) : [])
      .filter((row) => row.some(Boolean));
    if (!rows.length) return { headers: [], rows: [] };
    const headers = rows[0].map((header, index) => header || `العمود ${index + 1}`);
    const dataRows = rows.slice(1).filter((row) => row.some(Boolean));
    return { headers, rows: dataRows };
  }

  function guessColumn(headers, patterns) {
    const normalizedPatterns = patterns.map(normalizeKey);
    const index = headers.findIndex((header) => normalizedPatterns.some((pattern) => normalizeKey(header).includes(pattern)));
    return index >= 0 ? String(index) : '';
  }

  function populateSelect(select, headers, selected = '', optional = false) {
    select.innerHTML = `${optional ? '<option value="">غير موجود / تجاهل</option>' : '<option value="">اختر العمود</option>'}` +
      headers.map((header, index) => `<option value="${index}">${header}</option>`).join('');
    select.value = selected;
  }

  function renderMappingSample() {
    if (!pendingWorkbook) return;
    const nameIndex = Number($('#mapNameColumn').value);
    const specialtyValue = $('#mapSpecialtyColumn').value;
    const loadValue = $('#mapLoadColumn').value;
    const specialtyIndex = specialtyValue === '' ? null : Number(specialtyValue);
    const loadIndex = loadValue === '' ? null : Number(loadValue);
    const sample = pendingWorkbook.rows.slice(0, 5);
    $('#mappingSample').innerHTML = `
      <table>
        <thead><tr><th>اسم المعلم</th><th>التخصص</th><th>النصاب</th></tr></thead>
        <tbody>${sample.map((row) => `<tr><td>${normalizeText(row[nameIndex] || '')}</td><td>${canonicalSpecialty(specialtyIndex === null ? '' : row[specialtyIndex]) || '—'}</td><td>${normalizeText(loadIndex === null ? '' : row[loadIndex]) || $('#targetLoadInput')?.value || '24'}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  async function openMapping(file) {
    try {
      const matrix = await readFileAsMatrix(file);
      const cleaned = cleanMatrix(matrix);
      if (!cleaned.headers.length || !cleaned.rows.length) throw new Error('الملف لا يحتوي على بيانات قابلة للقراءة.');
      pendingWorkbook = { ...cleaned, file };
      $('#mappingFileName').textContent = file.name;
      $('#mappingRowsCount').textContent = `${ar(cleaned.rows.length)} صف`;
      populateSelect($('#mapNameColumn'), cleaned.headers, guessColumn(cleaned.headers, ['اسم المعلم', 'المعلم', 'الاسم', 'name']));
      populateSelect($('#mapSpecialtyColumn'), cleaned.headers, guessColumn(cleaned.headers, ['التخصص', 'تخصص', 'specialty', 'subject']), true);
      populateSelect($('#mapLoadColumn'), cleaned.headers, guessColumn(cleaned.headers, ['النصاب', 'الحصص', 'load', 'period']), true);
      renderMappingSample();
      const dialog = $('#columnMappingModal');
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    } catch (error) {
      console.error(error);
      alert(error.message || 'تعذر قراءة الملف.');
    }
  }

  function confirmMapping() {
    if (!pendingWorkbook) return;
    const nameValue = $('#mapNameColumn').value;
    if (nameValue === '') return alert('حدد عمود اسم المعلم أولًا.');
    const nameIndex = Number(nameValue);
    const specialtyValue = $('#mapSpecialtyColumn').value;
    const loadValue = $('#mapLoadColumn').value;
    const specialtyIndex = specialtyValue === '' ? null : Number(specialtyValue);
    const loadIndex = loadValue === '' ? null : Number(loadValue);
    const defaultLoad = Number($('#targetLoadInput')?.value || 24);
    const normalizedRows = pendingWorkbook.rows
      .map((row) => [
        normalizeText(row[nameIndex] || ''),
        canonicalSpecialty(specialtyIndex === null ? '' : row[specialtyIndex]),
        Number(String(loadIndex === null ? defaultLoad : row[loadIndex]).replace(/[^0-9.]/g, '')) || defaultLoad
      ])
      .filter((row) => row[0]);
    if (!normalizedRows.length) return alert('لم يتم العثور على أسماء صالحة في العمود المحدد.');

    const csv = '\ufeff' + [['اسم المعلم', 'التخصص', 'النصاب'], ...normalizedRows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');
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
  }

  function interceptFileEvent(event, file) {
    if (bypassMapping) { bypassMapping = false; return false; }
    if (!file) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    openMapping(file);
    return true;
  }

  function normalizePreview() {
    const rows = $$('#importPreview tbody tr');
    if (!rows.length) return;
    rows.forEach((row) => {
      const name = $('[data-preview-field="name"]', row);
      const specialty = $('[data-preview-field="specialty"]', row);
      if (name) {
        name.value = normalizeText(name.value);
        name.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (specialty) {
        specialty.value = canonicalSpecialty(specialty.value);
        specialty.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    setTimeout(updatePreviewQuality, 60);
  }

  function removeDuplicatePreview() {
    const rows = $$('#importPreview tbody tr');
    const seen = new Set();
    let removed = 0;
    rows.forEach((row) => {
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
    if (removed) alert(`تم استبعاد ${ar(removed)} سجل مكرر من الاعتماد.`);
  }

  function updatePreviewQuality() {
    const badge = $('#previewQualityBadge');
    if (!badge) return;
    const rows = $$('#importPreview tbody tr');
    if (!rows.length) {
      badge.textContent = 'بانتظار البيانات';
      badge.className = 'quality-badge';
      return;
    }
    const names = new Map();
    let missingSpecialty = 0;
    let invalidName = 0;
    let duplicates = 0;
    rows.forEach((row) => {
      const name = normalizeText($('[data-preview-field="name"]', row)?.value || '');
      const specialty = normalizeText($('[data-preview-field="specialty"]', row)?.value || '');
      if (!name) invalidName += 1;
      if (!specialty) missingSpecialty += 1;
      const key = normalizeKey(name);
      if (key) {
        if (names.has(key)) duplicates += 1;
        names.set(key, true);
      }
    });
    if (!invalidName && !missingSpecialty && !duplicates) {
      badge.textContent = `جودة ممتازة · ${ar(rows.length)} سجل`;
      badge.className = 'quality-badge good';
    } else if (invalidName) {
      badge.textContent = `${ar(invalidName)} اسم غير صالح`;
      badge.className = 'quality-badge error';
    } else {
      const notes = [];
      if (missingSpecialty) notes.push(`${ar(missingSpecialty)} تخصص ناقص`);
      if (duplicates) notes.push(`${ar(duplicates)} مكرر`);
      badge.textContent = notes.join(' · ');
      badge.className = 'quality-badge warning';
    }
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
    const planDetected = recommendedPlanDetected();
    const items = [
      { pass: regular === 35, title: '٣٥ حصة نظامية', ok: 'عدد حصص الصف مطابق لشرط التطبيق.', no: `القيمة الحالية ${ar(regular)} حصة.` },
      { pass: load === 24, title: 'نصاب ٢٤ حصة', ok: 'النصاب المستهدف مناسب للتوزيع.', no: `النصاب الحالي ${ar(load)} حصة.` },
      { pass: weeks === 36 && activity === 1, title: 'حصة نشاط أسبوعية', ok: '١ × ٣٦ = ٣٦ حصة سنويًا.', no: 'راجع الأسابيع أو عدد حصص النشاط.' },
      { pass: planDetected, title: 'الخطة الأكثر احتياجًا', ok: 'تم رصد صفوف عليا أو متوسطة تحفيظ.', no: 'هذه علامة إرشادية، ويمكن المتابعة وفق واقع المدرسة.' }
    ];
    root.innerHTML = items.map((item) => `<article class="diagnostic-item ${item.pass ? 'pass' : 'attention'}"><span class="diagnostic-icon">${item.pass ? '✓' : '!'}</span><strong>${item.title}</strong><small>${item.pass ? item.ok : item.no}</small></article>`).join('');
  }

  function bind() {
    $('#downloadTemplateBtn')?.addEventListener('click', downloadTemplate);
    $('#normalizePreviewBtn')?.addEventListener('click', normalizePreview);
    $('#removeDuplicatePreviewBtn')?.addEventListener('click', removeDuplicatePreview);
    $('#confirmMappingBtn')?.addEventListener('click', confirmMapping);
    ['mapNameColumn', 'mapSpecialtyColumn', 'mapLoadColumn'].forEach((id) => $('#' + id)?.addEventListener('change', renderMappingSample));

    $('#excelInput')?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      interceptFileEvent(event, file);
    }, true);

    $('#dropZone')?.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files?.[0];
      interceptFileEvent(event, file);
    }, true);

    ['regularPeriodsInput', 'targetLoadInput', 'weeksInput', 'activityWeeklyInput'].forEach((id) => $('#' + id)?.addEventListener('input', updateEligibilityDiagnostic));
    $('#stageCards')?.addEventListener('click', () => setTimeout(updateEligibilityDiagnostic, 40));
    $('#gradesEditor')?.addEventListener('input', () => setTimeout(updateEligibilityDiagnostic, 40));

    const previewObserver = new MutationObserver(() => setTimeout(updatePreviewQuality, 20));
    if ($('#importPreview')) previewObserver.observe($('#importPreview'), { childList: true, subtree: true });

    const editorObserver = new MutationObserver(() => {
      const specialtyInput = $('#teacherEditor [data-input="specialty"]');
      if (specialtyInput && !specialtyInput.dataset.phase2Bound) {
        specialtyInput.dataset.phase2Bound = '1';
        specialtyInput.setAttribute('list', 'specialtyOptions');
        specialtyInput.addEventListener('blur', () => { specialtyInput.value = canonicalSpecialty(specialtyInput.value); });
      }
    });
    if ($('#teacherEditor')) editorObserver.observe($('#teacherEditor'), { childList: true, subtree: true });

    const settingsObserver = new MutationObserver(() => setTimeout(updateEligibilityDiagnostic, 20));
    if ($('#stageCards')) settingsObserver.observe($('#stageCards'), { childList: true, subtree: true, attributes: true });
    if ($('#gradesEditor')) settingsObserver.observe($('#gradesEditor'), { childList: true, subtree: true });

    updateEligibilityDiagnostic();
    updatePreviewQuality();
  }

  document.addEventListener('DOMContentLoaded', bind);
})();
