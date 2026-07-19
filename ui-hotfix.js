(() => {
  'use strict';

  const PRODUCT_TITLE = 'موزّع حصة النشاط';
  const DB_NAME = 'activity10LocalDB';
  const STORE_NAME = 'state';
  const STATE_KEY = 'main';
  let fairDistributionRunning = false;

  /* تحسينات تفاعل عامة فقط. */
  function normalizeButtons(root = document) {
    root
      .querySelectorAll?.('button:not([type])')
      .forEach((button) => button.setAttribute('type', 'button'));
  }

  function enforceProductTitle() {
    document.title = PRODUCT_TITLE;

    const pageTitle = document.querySelector('#pageTitle');
    if (pageTitle && pageTitle.textContent !== PRODUCT_TITLE) {
      pageTitle.textContent = PRODUCT_TITLE;
    }

    const brandTitle = document.querySelector('.brand-block strong');
    if (brandTitle && brandTitle.textContent !== PRODUCT_TITLE) {
      brandTitle.textContent = PRODUCT_TITLE;
    }
  }

  function syncOriginalPrintAssets(root = document) {
    const images = [];
    if (root instanceof Element && root.matches('.activity-print-logo img')) images.push(root);
    images.push(...(root.querySelectorAll?.('.activity-print-logo img') || []));
    images.forEach((image) => {
      if (image.dataset.originalPrintAsset === '1') return;
      image.src = 'https://raw.githubusercontent.com/Rasmcom/N48/main/logomoe.png';
      image.dataset.originalPrintAsset = '1';
    });
  }

  function addStyle(href, attribute) {
    if (document.querySelector(`link[${attribute}]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(attribute, '1');
    document.head.appendChild(link);
  }

  function addScript(src, attribute) {
    if (document.querySelector(`script[${attribute}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.setAttribute(attribute, '1');
    document.head.appendChild(script);
  }

  /* تحميل صفحة الطباعة وتقرير المشاركة كوحدات مستقلة. */
  function loadModules() {
    addStyle('print-page.css', 'data-activity-print-style');
    addStyle('print-assets-main.css', 'data-original-print-assets');
    addStyle('distribution-report.css', 'data-distribution-report-style');
    addScript('print-page.js', 'data-activity-print-script');
    addScript('distribution-report.js', 'data-distribution-report-script');
  }

  function uid(prefix = 'distribution') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function clean(value = '') {
    return String(value).trim().replace(/\s+/g, ' ');
  }

  function teacherLoad(teacher) {
    return (teacher?.assignments || []).reduce(
      (sum, assignment) => sum + Number(assignment?.weeklyPeriods || 0),
      0
    );
  }

  function teacherComplete(teacher) {
    return Boolean(
      clean(teacher?.name) &&
      clean(teacher?.specialty) &&
      Number(teacher?.load) > 0 &&
      (teacher?.assignments || []).length &&
      teacherLoad(teacher) === Number(teacher.load)
    );
  }

  function semesterWeeks(state) {
    return Math.max(1, Math.floor(Number(state?.settings?.weeks || 36) / 2));
  }

  function semesterCapacity(state, assignment) {
    return Math.floor(
      Number(assignment?.weeklyPeriods || 0) * semesterWeeks(state) * 0.10 + 1e-9
    );
  }

  function stageGradeDefinitions() {
    return {
      primary: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
      middle: ['m1', 'm2', 'm3'],
      secondary: ['s1', 's2', 's3']
    };
  }

  function gradeLabel(gradeId) {
    const labels = {
      p1: 'الأول الابتدائي', p2: 'الثاني الابتدائي', p3: 'الثالث الابتدائي',
      p4: 'الرابع الابتدائي', p5: 'الخامس الابتدائي', p6: 'السادس الابتدائي',
      m1: 'الأول المتوسط', m2: 'الثاني المتوسط', m3: 'الثالث المتوسط',
      s1: 'الأول الثانوي', s2: 'الثاني الثانوي', s3: 'الثالث الثانوي'
    };
    return labels[gradeId] || gradeId;
  }

  function allSections(state) {
    const definitions = stageGradeDefinitions();
    const sections = [];
    Object.entries(state?.settings?.stages || {}).forEach(([stage, config]) => {
      if (!config?.enabled) return;
      (definitions[stage] || []).forEach((gradeId) => {
        const count = Number(state?.settings?.gradeSections?.[gradeId] || 0);
        for (let index = 1; index <= count; index += 1) {
          sections.push({
            id: `${gradeId}_${index}`,
            gradeId,
            number: index,
            label: `${gradeLabel(gradeId)}/${index}`
          });
        }
      });
    });
    return sections;
  }

  function normalizeKey(value = '') {
    return clean(value)
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/\s+/g, '');
  }

  function specialtyMatch(specialty, subject) {
    const first = normalizeKey(specialty);
    const second = normalizeKey(subject);
    if (!first || !second) return false;
    if (first.includes(second) || second.includes(first)) return true;
    return (
      (first.includes('اسلام') || first.includes('دين') || first.includes('قران')) &&
      (second.includes('اسلام') || second.includes('قران'))
    );
  }

  function openStateDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function readSavedState() {
    try {
      const db = await openStateDB();
      if (db.objectStoreNames.contains(STORE_NAME)) {
        const state = await new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const get = tx.objectStore(STORE_NAME).get(STATE_KEY);
          get.onsuccess = () => resolve(get.result || null);
          get.onerror = () => resolve(null);
        });
        db.close();
        if (state) return state;
      } else {
        db.close();
      }
    } catch (error) {
      console.warn('تعذر قراءة IndexedDB:', error);
    }

    try {
      return JSON.parse(localStorage.getItem('activity10State') || 'null');
    } catch {
      return null;
    }
  }

  async function writeSavedState(state) {
    state.lastSavedAt = new Date().toISOString();
    localStorage.setItem('activity10State', JSON.stringify(state));

    try {
      const db = await openStateDB();
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        return;
      }
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(state, STATE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (error) {
      console.warn('تعذر حفظ IndexedDB:', error);
    }
  }

  function eligibleTeacherIdsForReadySections(state, readySectionIds) {
    const ids = new Set();
    (state?.teachers || []).forEach((teacher) => {
      if (teacher?.excluded || !teacherComplete(teacher)) return;
      const hasCapacity = (teacher.assignments || []).some(
        (assignment) =>
          readySectionIds.has(assignment.sectionId) &&
          semesterCapacity(state, assignment) > 0
      );
      if (hasCapacity) ids.add(teacher.id);
    });
    return ids;
  }

  function normalizeValidationForActualLoads(state) {
    if (!Array.isArray(state?.validation?.teachers)) return;
    const teachersById = new Map((state.teachers || []).map((teacher) => [teacher.id, teacher]));
    state.validation.teachers = state.validation.teachers.map((item) => {
      const teacher = teachersById.get(item.teacherId);
      if (!teacher || teacher.excluded || !teacherComplete(teacher)) return item;
      return {
        ...item,
        targetLoad: Number(teacher.load || 0),
        currentLoad: teacherLoad(teacher),
        status: 'eligible',
        message: `جاهز للدخول في المقارنة · النصاب المسجل ${teacher.load}`
      };
    });
  }

  function buildSourceGroups(state, sectionId) {
    const groups = new Map();
    (state.teachers || [])
      .filter((teacher) => !teacher.excluded && teacherComplete(teacher))
      .forEach((teacher) => {
        (teacher.assignments || [])
          .filter((assignment) => assignment.sectionId === sectionId)
          .forEach((assignment) => {
            const capacity = semesterCapacity(state, assignment);
            if (!capacity) return;
            const group = groups.get(teacher.id) || {
              teacher,
              assignments: []
            };
            group.assignments.push({
              id: assignment.id || `${teacher.id}|${sectionId}|${assignment.subject}`,
              teacherId: teacher.id,
              teacherName: teacher.name,
              specialty: teacher.specialty,
              subject: assignment.subject,
              weeklyPeriods: Number(assignment.weeklyPeriods || 0),
              capacity,
              remaining: capacity
            });
            groups.set(teacher.id, group);
          });
      });
    return [...groups.values()];
  }

  function fairTargets(models, length, state) {
    const teacherCapacity = new Map();
    models.forEach((model) => {
      model.candidates.forEach((candidate) => {
        teacherCapacity.set(
          candidate.teacherId,
          (teacherCapacity.get(candidate.teacherId) || 0) + Number(candidate.capacity || 0)
        );
      });
    });

    const teachersById = new Map((state.teachers || []).map((teacher) => [teacher.id, teacher]));
    const teacherIds = [...teacherCapacity.keys()];
    const targets = new Map(teacherIds.map((id) => [id, 0]));
    const effectiveCapacity = (id) => Math.min(length, Number(teacherCapacity.get(id) || 0));
    let remainingSlots = models.length * length;

    while (remainingSlots > 0) {
      const available = teacherIds.filter(
        (id) => (targets.get(id) || 0) < effectiveCapacity(id)
      );
      if (!available.length) break;

      available.sort((firstId, secondId) => {
        const shareDifference = (targets.get(firstId) || 0) - (targets.get(secondId) || 0);
        if (shareDifference) return shareDifference;

        const loadDifference =
          Number(teachersById.get(secondId)?.load || 0) -
          Number(teachersById.get(firstId)?.load || 0);
        if (loadDifference) return loadDifference;

        return clean(teachersById.get(firstId)?.name).localeCompare(
          clean(teachersById.get(secondId)?.name),
          'ar'
        );
      });

      for (const teacherId of available) {
        if (remainingSlots <= 0) break;
        if ((targets.get(teacherId) || 0) < effectiveCapacity(teacherId)) {
          targets.set(teacherId, (targets.get(teacherId) || 0) + 1);
          remainingSlots -= 1;
        }
      }
    }

    return targets;
  }

  function distributeFairSemester(state, semester, readySectionIds, firstMap = null) {
    const length = semesterWeeks(state);
    const teacherActivityCount = new Map();
    const teacherSectionUse = new Map();
    const firstPairs = new Map();

    if (firstMap) {
      firstMap.forEach((item, sectionId) => {
        firstPairs.set(
          sectionId,
          new Set((item.summary || []).map((entry) => `${entry.teacherId}|${entry.subject}`))
        );
      });
    }

    const models = allSections(state)
      .filter((section) => readySectionIds.has(section.id))
      .map((section) => ({
        section,
        candidates: buildSourceGroups(state, section.id).flatMap((group) =>
          group.assignments.map((assignment) => ({ ...assignment, teacher: group.teacher }))
        ),
        weeks: [],
        blocks: [],
        currentSourceId: '',
        currentTeacherId: '',
        closedSources: new Set()
      }));

    const teacherTargetShare = fairTargets(models, length, state);

    const candidateOptions = (model, usedTeachers) => {
      const firstSet = firstPairs.get(model.section.id) || new Set();
      const byTeacher = new Map();

      model.candidates.forEach((candidate) => {
        if (
          candidate.remaining <= 0 ||
          model.closedSources.has(candidate.id) ||
          usedTeachers.has(candidate.teacherId)
        ) {
          return;
        }

        const sameSource = candidate.id === model.currentSourceId ? 1 : 0;
        const sameTeacher = candidate.teacherId === model.currentTeacherId ? 1 : 0;
        const repeatedPair = firstSet.has(`${candidate.teacherId}|${candidate.subject}`) ? 1 : 0;
        const repeatedTeacher = [...firstSet].some((pair) =>
          pair.startsWith(`${candidate.teacherId}|`)
        ) ? 1 : 0;
        const load = Number(candidate.teacher.load || state.settings?.targetLoad || 24);
        const lowLoadAdvantage = Math.max(
          0,
          Number(state.settings?.targetLoad || 24) - load
        );
        const sectionSet = teacherSectionUse.get(candidate.teacherId) || new Set();
        const usedCount = teacherActivityCount.get(candidate.teacherId) || 0;
        const fairTarget = teacherTargetShare.get(candidate.teacherId) || 0;
        const fairDeficit = Math.max(0, fairTarget - usedCount);
        const fairnessBonus = fairDeficit > 0 ? 2000000 + fairDeficit * 2000 : 0;

        const score =
          fairnessBonus +
          sameSource * 700000 +
          sameTeacher * 140000 +
          Number(candidate.weeklyPeriods) * 5000 +
          (specialtyMatch(candidate.specialty, candidate.subject) ? 1200 : 0) +
          candidate.remaining * 90 +
          lowLoadAdvantage * 300 -
          usedCount * 900 -
          sectionSet.size * 260 -
          (semester === 2 ? repeatedPair * 50000 + repeatedTeacher * 12000 : 0);

        const existing = byTeacher.get(candidate.teacherId);
        if (!existing || score > existing.score) {
          byTeacher.set(candidate.teacherId, { candidate, score });
        }
      });

      return [...byTeacher.values()].sort((first, second) => second.score - first.score);
    };

    for (let week = 1; week <= length; week += 1) {
      let best = [];
      let bestScore = -Infinity;

      const search = (pending, usedTeachers, chosen, totalScore) => {
        if (
          chosen.length > best.length ||
          (chosen.length === best.length && totalScore > bestScore)
        ) {
          best = [...chosen];
          bestScore = totalScore;
        }
        if (!pending.length) return true;

        let pickIndex = 0;
        let pickOptions = null;
        for (let index = 0; index < pending.length; index += 1) {
          const options = candidateOptions(pending[index], usedTeachers);
          if (pickOptions === null || options.length < pickOptions.length) {
            pickIndex = index;
            pickOptions = options;
            if (!options.length) break;
          }
        }

        const model = pending[pickIndex];
        const rest = pending.filter((_, index) => index !== pickIndex);
        for (const option of (pickOptions || []).slice(0, 20)) {
          usedTeachers.add(option.candidate.teacherId);
          chosen.push({ model, option });
          if (
            search(rest, usedTeachers, chosen, totalScore + option.score) &&
            best.length === models.length
          ) {
            return true;
          }
          chosen.pop();
          usedTeachers.delete(option.candidate.teacherId);
        }

        search(rest, usedTeachers, chosen, totalScore - 1000000);
        return false;
      };

      search(models, new Set(), [], 0);
      const selected = new Map(
        best.map((entry) => [entry.model.section.id, entry.option.candidate])
      );

      models.forEach((model) => {
        const candidate = selected.get(model.section.id);
        if (!candidate) return;

        if (model.currentSourceId && model.currentSourceId !== candidate.id) {
          model.closedSources.add(model.currentSourceId);
        }
        model.currentSourceId = candidate.id;
        model.currentTeacherId = candidate.teacherId;
        candidate.remaining -= 1;

        const item = {
          semester,
          semesterWeek: week,
          annualWeek: (semester - 1) * length + week,
          teacherId: candidate.teacherId,
          teacherName: candidate.teacherName,
          specialty: candidate.specialty,
          subject: candidate.subject,
          weeklyPeriods: candidate.weeklyPeriods,
          capacity: candidate.capacity
        };
        model.weeks.push(item);

        const last = model.blocks.at(-1);
        if (
          last &&
          last.sourceId === candidate.id &&
          last.endWeek === week - 1
        ) {
          last.endWeek = week;
          last.used += 1;
        } else {
          model.blocks.push({
            sourceId: candidate.id,
            teacherId: candidate.teacherId,
            teacherName: candidate.teacherName,
            subject: candidate.subject,
            weeklyPeriods: candidate.weeklyPeriods,
            used: 1,
            capacity: candidate.capacity,
            startWeek: week,
            endWeek: week
          });
        }

        teacherActivityCount.set(
          candidate.teacherId,
          (teacherActivityCount.get(candidate.teacherId) || 0) + 1
        );
        const sectionSet = teacherSectionUse.get(candidate.teacherId) || new Set();
        sectionSet.add(model.section.id);
        teacherSectionUse.set(candidate.teacherId, sectionSet);
      });
    }

    const result = new Map();
    models.forEach((model) => {
      result.set(model.section.id, {
        semester,
        sectionId: model.section.id,
        sectionLabel: model.section.label,
        weeks: model.weeks,
        summary: model.blocks,
        complete: model.weeks.length === length,
        missing: length - model.weeks.length,
        mode: semester === 1 ? 'first' : 'different'
      });
    });
    return result;
  }

  function cloneSemesterDistribution(state, firstMap) {
    const length = semesterWeeks(state);
    const cloned = new Map();
    firstMap.forEach((item, sectionId) => {
      cloned.set(sectionId, {
        ...item,
        semester: 2,
        weeks: (item.weeks || []).map((week) => ({
          ...week,
          semester: 2,
          annualWeek: length + week.semesterWeek
        })),
        summary: (item.summary || []).map((entry) => ({ ...entry })),
        mode: 'keep'
      });
    });
    return cloned;
  }

  async function applyFairDistribution(button) {
    if (fairDistributionRunning) return;
    fairDistributionRunning = true;
    const originalText = button?.textContent || '';
    if (button) {
      button.disabled = true;
      button.textContent = 'جارٍ موازنة جميع المعلمين…';
    }

    try {
      /* انتظار حفظ نتيجة المحرك الأصلي ثم إعادة بنائها بالموازنة العادلة. */
      await new Promise((resolve) => setTimeout(resolve, 430));
      const state = await readSavedState();
      if (!state) return;

      normalizeValidationForActualLoads(state);
      const readySectionIds = new Set(
        (state.validation?.sections || [])
          .filter((item) => item.status === 'eligible')
          .map((item) => item.sectionId)
      );
      if (!readySectionIds.size) return;

      const eligibleIds = eligibleTeacherIdsForReadySections(state, readySectionIds);
      if (!eligibleIds.size) return;

      state.distributionConfig = {
        secondSemesterMode: 'keep',
        activeSemester: 1,
        ...(state.distributionConfig || {})
      };

      const firstMap = distributeFairSemester(state, 1, readySectionIds, null);
      const secondMap =
        state.distributionConfig.secondSemesterMode === 'keep'
          ? cloneSemesterDistribution(state, firstMap)
          : distributeFairSemester(state, 2, readySectionIds, firstMap);

      state.distributions = allSections(state)
        .filter((section) => readySectionIds.has(section.id))
        .map((section) => ({
          id: uid(),
          sectionId: section.id,
          sectionLabel: section.label,
          semesters: [firstMap.get(section.id), secondMap.get(section.id)]
        }));
      state.distributionConfig.activeSemester = 1;
      state.fairDistributionVersion = 2;

      await writeSavedState(state);
      sessionStorage.setItem('activity10FairDistributionNotice', '1');
      location.reload();
    } catch (error) {
      console.error('تعذر تطبيق موازنة المعلمين:', error);
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
      fairDistributionRunning = false;
    }
  }

  function patchValidationDisplay(root = document) {
    const rows = root.querySelectorAll?.('#validationTable tbody tr') || [];
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 6) return;
      const target = Number(cells[3].textContent.replace(/[^0-9٠-٩]/g, '').replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
      const assigned = Number(cells[4].textContent.replace(/[^0-9٠-٩]/g, '').replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
      const chip = cells[5].querySelector('.status-chip');
      if (!chip || target <= 0 || target !== assigned || !chip.textContent.includes('النصاب ليس')) return;
      chip.textContent = `جاهز للدخول في المقارنة · النصاب المسجل ${target}`;
      chip.className = 'status-chip status-complete';
    });
  }

  function showFairDistributionNotice() {
    if (sessionStorage.getItem('activity10FairDistributionNotice') !== '1') return;
    sessionStorage.removeItem('activity10FairDistributionNotice');
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = 'تمت موازنة التوزيع على جميع المعلمين المؤهلين بغض النظر عن كون النصاب ١٥ أو ١٨ أو ٢٤.';
    toast.className = 'toast show success';
    setTimeout(() => {
      toast.className = 'toast';
    }, 4200);
  }

  document.addEventListener('DOMContentLoaded', () => {
    normalizeButtons();
    loadModules();
    syncOriginalPrintAssets();
    enforceProductTitle();
    patchValidationDisplay();
    showFairDistributionNotice();

    document.addEventListener('click', (event) => {
      const generateButton = event.target.closest('#generateDistributionBtn');
      if (generateButton) {
        setTimeout(() => applyFairDistribution(generateButton), 0);
      }
      if (event.target.closest('#runValidationBtn')) {
        setTimeout(() => patchValidationDisplay(document), 280);
      }
    });

    const observer = new MutationObserver((mutations) => {
      let titleMayHaveChanged = false;

      for (const mutation of mutations) {
        if (mutation.type === 'characterData') titleMayHaveChanged = true;

        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches('button:not([type])')) node.setAttribute('type', 'button');
          normalizeButtons(node);
          syncOriginalPrintAssets(node);
          patchValidationDisplay(node);

          if (
            node.matches('#pageTitle, .brand-block, .brand-block strong') ||
            node.querySelector?.('#pageTitle, .brand-block strong')
          ) {
            titleMayHaveChanged = true;
          }
        }

        if (
          mutation.target instanceof Element &&
          mutation.target.matches('#pageTitle, .brand-block strong')
        ) {
          titleMayHaveChanged = true;
        }
      }

      if (titleMayHaveChanged) enforceProductTitle();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  });
})();
