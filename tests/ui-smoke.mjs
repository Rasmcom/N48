import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const subjectsForLoad24 = [
  'القرآن الكريم والدراسات الإسلامية',
  'التجويد',
  'اللغة العربية',
  'الدراسات الاجتماعية',
  'الرياضيات',
  'المهارات الحياتية والأسرية',
  'التربية الفنية',
];

async function runScenario(name, contextOptions) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });

  const openNav = async view => {
    if (contextOptions.isMobile) {
      const shellClass = await page.locator('.app-shell').getAttribute('class') || '';
      if (!shellClass.includes('sidebar-mobile-open')) {
        await page.locator('#mobileMenuBtn').click();
        await page.waitForTimeout(80);
      }
    }
    await page.locator(`[data-view="${view}"]`).click();
    await page.waitForTimeout(80);
  };

  const assignTeacher = async (teacherIndex, sectionId) => {
    await page.locator('.teacher-list-item').nth(teacherIndex).click();
    await page.locator(`[data-batch-section][value="${sectionId}"]`).check();
    await page.waitForSelector(`[data-batch-subject][value="${subjectsForLoad24[0]}"]`);
    for (const subject of subjectsForLoad24) {
      await page.locator(`[data-batch-subject][value="${subject}"]`).check();
    }
    const previewText = await page.locator('#batchAssignmentPreview').innerText();
    assert.match(previewText, /24|٢٤/, `${name}: teacher ${teacherIndex + 1} load totals 24`);
    await page.locator('#addBatchAssignmentsBtn').click();
    await page.waitForFunction(() => document.querySelectorAll('#teacherAssignmentsTable tbody tr').length === 7, null, { timeout: 5000 });
    assert.equal(await page.locator('#teacherAssignmentsTable tbody tr').count(), 7, `${name}: seven assignments added`);
    await page.locator('[data-action="save-teacher"]').click();
  };

  const inspectSemester = async semester => {
    await page.locator(`[data-semester-tab="${semester}"]`).click();
    const cards = page.locator('.section-distribution-card');
    assert.equal(await cards.count(), 2, `${name}: semester ${semester} has two sections`);

    const teacherByWeek = Array.from({ length: 18 }, () => []);
    for (let cardIndex = 0; cardIndex < 2; cardIndex += 1) {
      const card = cards.nth(cardIndex);
      const weeks = card.locator('.week-item');
      assert.equal(await weeks.count(), 18, `${name}: semester ${semester}, section ${cardIndex + 1} has 18 weeks`);

      const subjects = (await weeks.locator('> span').allTextContents()).map(value => value.trim());
      const blocks = [];
      for (const subject of subjects) if (blocks.at(-1) !== subject) blocks.push(subject);
      assert.equal(new Set(blocks).size, blocks.length, `${name}: semester ${semester} source never returns after its block`);
      assert.equal(subjects.slice(0, 14).every(subject => subject === 'القرآن الكريم والدراسات الإسلامية'), true, `${name}: semester ${semester} starts with the highest-period subject`);

      for (let weekIndex = 0; weekIndex < 18; weekIndex += 1) {
        const details = await weeks.nth(weekIndex).locator('small').innerText();
        teacherByWeek[weekIndex].push(details.split('·')[0].trim());
      }
    }

    teacherByWeek.forEach((teachers, weekIndex) => {
      assert.equal(new Set(teachers).size, teachers.length, `${name}: semester ${semester}, week ${weekIndex + 1} has no teacher conflict`);
    });
  };

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise(resolve => {
      const req = indexedDB.deleteDatabase('activity10LocalDB');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload({ waitUntil: 'networkidle' });

  assert.equal(await page.locator('.view.active').count(), 1, `${name}: initial active view`);
  assert.equal(await page.locator('[data-view-panel="dashboard"].active').count(), 1, `${name}: dashboard active`);

  if (contextOptions.isMobile) {
    await page.locator('#mobileMenuBtn').click();
    await page.waitForTimeout(100);
    assert.match(await page.locator('.app-shell').getAttribute('class'), /sidebar-mobile-open/, `${name}: mobile menu opens`);
  }

  await openNav('settings');
  await page.locator('#schoolNameInput').fill('مدرسة الاختبار');
  await page.locator('[data-choice="gender"][data-value="boys"]').click();
  await page.locator('#settingsNextBtn').click();
  await page.locator('[data-toggle-stage="primary"]').click();
  await page.locator('[data-stage-type="primary"][data-type="tahfiz"]').click();
  await page.locator('#settingsNextBtn').click();
  await page.locator('[data-grade-count="p4"]').fill('2');
  await page.locator('#settingsNextBtn').click();
  await page.locator('#settingsNextBtn').click();
  assert.equal(await page.locator('[data-view-panel="import"].active').count(), 1, `${name}: import opens`);

  const csv = '\ufeffاسم المعلم,التخصص,النصاب\nأحمد سعد أحمد الغامدي,دين,24\nخالد علي الزهراني,رياضيات,24\nمحمد عبدالله الحربي,علوم,24';
  await page.locator('#excelInput').setInputFiles({ name: 'teachers.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.locator('#teacherSelectionModal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#teacherSelectionList [data-selection-index]').count(), 3, `${name}: automatic Excel rows`);
  await page.locator('[data-clear-all]').click();
  await page.locator('#teacherSelectionCount').fill('3');
  await page.locator('[data-select-count]').click();
  await page.locator('#confirmTeacherSelection').click();

  await page.waitForSelector('#importPreview tbody tr');
  assert.equal(await page.locator('#importPreview tbody tr').count(), 3, `${name}: three selected teachers in preview`);
  assert.equal(await page.locator('#columnMappingModal').isVisible(), false, `${name}: mapping dialog not required`);

  await page.locator('#addManualPreviewBtn').click();
  await page.waitForFunction(() => document.querySelectorAll('#importPreview tbody tr').length === 4);
  await page.locator('#importPreview tbody tr').last().locator('[data-preview-delete]').click();
  await page.waitForFunction(() => document.querySelectorAll('#importPreview tbody tr').length === 3);

  await page.locator('#commitImportBtn').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-view-panel="classify"].active').count(), 1, `${name}: classify opens`);
  assert.equal(await page.locator('.teacher-list-item').count(), 3, `${name}: three teachers imported`);
  await page.locator('[data-bulk-teacher]').nth(2).check();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-delete-selected-teachers]').click();
  await page.waitForFunction(() => document.querySelectorAll('.teacher-list-item').length === 2);
  assert.equal(await page.locator('.teacher-list-item').count(), 2, `${name}: bulk deletion removes selected teacher`);

  await assignTeacher(0, 'p4_1');
  await assignTeacher(1, 'p4_2');

  await openNav('validate');
  await page.locator('#runValidationBtn').click();
  assert.ok(await page.locator('#validationTable').innerText(), `${name}: validation renders`);

  await openNav('distribution');
  assert.equal(await page.locator('#semesterDistributionControls').count(), 1, `${name}: semester controls render`);
  await page.locator('#generateDistributionBtn').click();
  await page.waitForTimeout(180);
  assert.ok(await page.locator('#distributionResults').innerText(), `${name}: distribution renders`);

  await inspectSemester(1);
  await inspectSemester(2);

  await page.locator('[name="secondSemesterMode"][value="different"]').check();
  await page.locator('#generateDistributionBtn').click();
  await page.waitForTimeout(220);
  assert.equal(await page.locator('[data-semester-tab="2"]').count(), 1, `${name}: different second-semester mode regenerates successfully`);

  await page.waitForSelector('#activityAssignmentsPrintBtn');
  await page.locator('#activityAssignmentsPrintBtn').click();
  await page.locator('#activityPrintPreview.show').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.activity-print-page.portrait').count(), 1, `${name}: portrait A4 print page renders`);
  assert.equal(await page.locator('.activity-print-table.single thead th').count(), 4, `${name}: short list uses four print columns`);
  assert.match(await page.locator('.activity-print-table').innerText(), /حصة النشاط|الأسابيع من/, `${name}: print table includes activity and week ranges`);
  assert.equal(await page.locator('.activity-print-logo img').count(), 1, `${name}: Ministry logo is present`);
  await page.locator('#closeActivityPrintPreview').click();
  assert.equal(await page.locator('#activityPrintPreview').isVisible(), false, `${name}: print preview closes`);

  if (errors.length) throw new Error(`${name}: browser errors\n${errors.join('\n')}`);
  await browser.close();
}

await runScenario('desktop', { viewport: { width: 1440, height: 1000 } });
await runScenario('mobile', { ...devices['iPhone 13'] });
console.log('UI smoke tests passed');
