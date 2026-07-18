(() => {
  'use strict';

  let bypass = false;
  let pendingFile = null;
  let parsedRows = [];

  const $ = (s, r = document) => r.querySelector(s);
  const clean = (v = '') => String(v ?? '').trim().replace(/\s+/g, ' ');
  const safe = (v = '') => clean(v).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));

  function guessName(row) {
    if (!Array.isArray(row)) return '';
    if (/^Tea_/i.test(clean(row[0])) && clean(row[1])) return clean(row[1]);
    return row.map(clean).find(v => /[\u0600-\u06FF]/.test(v) && v.split(' ').length >= 3 && !['دائم','معلم','معلمة','متعاقد'].includes(v)) || '';
  }

  function guessSpecialty(row, name) {
    const aliases = new Map([
      ['دين','دراسات إسلامية'],['اسلاميات','دراسات إسلامية'],['إسلاميات','دراسات إسلامية'],
      ['رياضيات','رياضيات'],['علوم','علوم'],['عربي','لغة عربية'],['لغة عربية','لغة عربية'],
      ['انجليزي','لغة إنجليزية'],['إنجليزي','لغة إنجليزية'],['لغة إنجليزية','لغة إنجليزية'],
      ['حاسب','مهارات رقمية'],['اجتماعيات','دراسات اجتماعية'],['بدنية','تربية بدنية'],['فنية','تربية فنية']
    ]);
    for (const cell of row.map(clean)) {
      if (!cell || cell === name) continue;
      if (aliases.has(cell)) return aliases.get(cell);
    }
    return '';
  }

  async function readRows(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (window.XLSX) {
      const wb = ext === 'csv' ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    }
    if (ext === 'csv') return (await file.text()).split(/\r?\n/).filter(Boolean).map(line => line.split(','));
    throw new Error('تعذر قراءة الملف الآن. جرّب CSV أو أعد فتح الصفحة.');
  }

  function ensureModal() {
    if ($('#teacherSelectionModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="teacherSelectionModal" class="teacher-selection-dialog">
        <div class="teacher-selection-card">
          <div class="teacher-selection-head">
            <div><span class="section-kicker">اختيار المعلمين</span><h2>حدد المعلمين قبل إنشاء المعاينة</h2><p>يمكن تحديد الجميع أو اختيار عدد معين فقط من الملف.</p></div>
            <button type="button" class="dialog-close" data-close-selection>×</button>
          </div>
          <div class="teacher-selection-tools">
            <button type="button" class="secondary-button" data-select-all>تحديد الجميع</button>
            <button type="button" class="secondary-button" data-clear-all>إلغاء التحديد</button>
            <label class="selection-count-field"><span>تحديد أول</span><input id="teacherSelectionCount" type="number" min="1" placeholder="مثال: 10"><span>معلمين</span></label>
            <button type="button" class="secondary-button" data-select-count>تطبيق العدد</button>
            <strong id="teacherSelectionSummary">0 محدد</strong>
          </div>
          <div class="teacher-selection-list" id="teacherSelectionList"></div>
          <div class="teacher-selection-actions">
            <button type="button" class="secondary-button" data-close-selection>إلغاء</button>
            <button type="button" class="primary-button" id="confirmTeacherSelection">إنشاء المعاينة للمحددين</button>
          </div>
        </div>
      </dialog>`);

    const modal = $('#teacherSelectionModal');
    modal.addEventListener('change', updateSummary);
    modal.addEventListener('click', e => {
      if (e.target.closest('[data-close-selection]')) modal.close();
      if (e.target.closest('[data-select-all]')) { modal.querySelectorAll('input[type="checkbox"]').forEach(x => x.checked = true); updateSummary(); }
      if (e.target.closest('[data-clear-all]')) { modal.querySelectorAll('input[type="checkbox"]').forEach(x => x.checked = false); updateSummary(); }
      if (e.target.closest('[data-select-count]')) {
        const n = Math.max(0, Number($('#teacherSelectionCount').value || 0));
        modal.querySelectorAll('input[type="checkbox"]').forEach((x, i) => x.checked = i < n);
        updateSummary();
      }
    });
    $('#confirmTeacherSelection').addEventListener('click', confirmSelection);
  }

  function updateSummary() {
    const checked = $('#teacherSelectionModal').querySelectorAll('input[type="checkbox"]:checked').length;
    $('#teacherSelectionSummary').textContent = `${checked.toLocaleString('ar-SA')} من ${parsedRows.length.toLocaleString('ar-SA')} محدد`;
    $('#confirmTeacherSelection').disabled = checked === 0;
  }

  function showSelection(rows) {
    ensureModal();
    parsedRows = rows;
    const list = $('#teacherSelectionList');
    list.innerHTML = rows.map((item, i) => `
      <label class="teacher-selection-row">
        <input type="checkbox" value="${i}" checked>
        <span class="selection-index">${(i + 1).toLocaleString('ar-SA')}</span>
        <span><strong>${safe(item.name || 'اسم غير معروف')}</strong><small>${safe(item.specialty || 'التخصص غير محدد')}</small></span>
      </label>`).join('');
    updateSummary();
    $('#teacherSelectionModal').showModal();
  }

  async function interceptFile(event, file) {
    if (bypass) { bypass = false; return; }
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      pendingFile = file;
      const matrix = (await readRows(file)).filter(row => Array.isArray(row) && row.some(cell => clean(cell)));
      const data = matrix.slice(1).map((row, index) => {
        const name = guessName(row);
        return { row, index, name, specialty: guessSpecialty(row, name) };
      }).filter(x => x.name);
      if (!data.length) throw new Error('لم يتم العثور على أسماء معلمين صالحة في الملف.');
      showSelection(data);
    } catch (error) {
      alert(error.message || 'تعذر قراءة الملف.');
    }
  }

  function confirmSelection() {
    const selected = [...$('#teacherSelectionModal').querySelectorAll('input[type="checkbox"]:checked')].map(x => parsedRows[Number(x.value)]);
    if (!selected.length) return;
    const sourceRows = selected.map(x => x.row);
    const maxCols = Math.max(...sourceRows.map(r => r.length));
    const header = Array.from({ length: maxCols }, (_, i) => `العمود ${i + 1}`);
    const csv = '\ufeff' + [header, ...sourceRows].map(row => Array.from({ length: maxCols }, (_, i) => `"${String(row[i] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const filtered = new File([csv], `selected-${selected.length}-${Date.now()}.csv`, { type: 'text/csv' });
    const dt = new DataTransfer();
    dt.items.add(filtered);
    const input = $('#excelInput');
    input.files = dt.files;
    bypass = true;
    $('#teacherSelectionModal').close();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureModal();
    $('#excelInput')?.addEventListener('change', e => interceptFile(e, e.target.files?.[0]), true);
    $('#dropZone')?.addEventListener('drop', e => interceptFile(e, e.dataTransfer?.files?.[0]), true);
  });
})();
