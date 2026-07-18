import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';

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
  await page.locator('[data-grade-count="p4"]').fill('1');
  await page.locator('[data-grade-count="p5"]').fill('1');
  await page.locator('#settingsNextBtn').click();
  await page.locator('#settingsNextBtn').click();
  assert.equal(await page.locator('[data-view-panel="import"].active').count(), 1, `${name}: import opens`);

  const csv = '\ufeffاسم المعلم,التخصص,النصاب\nأحمد سعد أحمد الغامدي,دين,24\nخالد علي الزهراني,رياضيات,24\nمحمد عبدالله الحربي,علوم,24';
  await page.locator('#excelInput').setInputFiles({ name: 'teachers.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.locator('#teacherSelectionModal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#teacherSelectionList [data-selection-index]').count(), 3, `${name}: automatic Excel rows`);
  await page.locator('[data-clear-all]').click();
  await page.locator('#teacherSelectionCount').fill('1');
  await page.locator('[data-select-count]').click();
  await page.locator('#confirmTeacherSelection').click();

  await page.waitForSelector('#importPreview tbody tr');
  assert.equal(await page.locator('#importPreview tbody tr').count(), 1, `${name}: one selected teacher in preview`);
  assert.equal(await page.locator('[data-preview-field="name"]').inputValue(), 'أحمد سعد أحمد الغامدي', `${name}: name auto detected`);
  assert.equal(await page.locator('[data-preview-field="specialty"]').inputValue(), 'دراسات إسلامية', `${name}: specialty auto detected`);
  assert.equal(await page.locator('[data-preview-field="load"]').inputValue(), '24', `${name}: load auto detected`);
  assert.equal(await page.locator('#columnMappingModal').isVisible(), false, `${name}: mapping dialog not required`);

  await page.locator('#addManualPreviewBtn').click();
  await page.waitForFunction(() => document.querySelectorAll('#importPreview tbody tr').length === 2);
  assert.equal(await page.locator('#importPreview tbody tr').count(), 2, `${name}: manual teacher added`);
  await page.locator('#importPreview tbody tr').last().locator('[data-preview-delete]').click();
  await page.waitForFunction(() => document.querySelectorAll('#importPreview tbody tr').length === 1);
  assert.equal(await page.locator('#importPreview tbody tr').count(), 1, `${name}: preview teacher deleted`);

  await page.locator('#commitImportBtn').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-view-panel="classify"].active').count(), 1, `${name}: classify opens`);
  assert.equal(await page.locator('.teacher-list-item').count(), 1, `${name}: teacher imported`);

  await page.locator('.teacher-list-item').click();
  await page.locator('[data-teacher-field="rank"]').selectOption('advanced');
  await page.locator('[data-batch-section][value="p4_1"]').check();
  await page.locator('[data-batch-section][value="p5_1"]').check();
  await page.locator('[data-batch-subject][value="القرآن الكريم والدراسات الإسلامية"]').check();
  await page.locator('[data-batch-subject][value="التجويد"]').check();
  await page.locator('[data-batch-subject][value="المهارات الحياتية والأسرية"]').check();
  await page.locator('[data-batch-subject][value="الدراسات الاجتماعية"]').check();

  const previewText = await page.locator('#batchAssignmentPreview').innerText();
  assert.match(previewText, /24|٢٤/, `${name}: batch total 24`);
  assert.match(previewText, /16|١٦/, `${name}: Quran total 16`);
  assert.match(previewText, /2|٢/, `${name}: Tajweed/life totals`);
  await page.locator('#addBatchAssignmentsBtn').click();
  await page.waitForFunction(() => document.querySelectorAll('#teacherAssignmentsTable tbody tr').length === 8, null, { timeout: 5000 });
  assert.equal(await page.locator('#teacherAssignmentsTable tbody tr').count(), 8, `${name}: eight assignments added in batch`);

  await page.locator('[data-action="save-teacher"]').click();
  await openNav('validate');
  await page.locator('#runValidationBtn').click();
  assert.ok(await page.locator('#validationTable').innerText(), `${name}: validation renders`);

  await openNav('distribution');
  await page.locator('#generateDistributionBtn').click();
  await page.waitForTimeout(150);
  assert.ok(await page.locator('#distributionResults').innerText(), `${name}: distribution renders`);

  const firstCard = page.locator('.section-distribution-card').first();
  const weekSubjects = await firstCard.locator('.week-item > span').allTextContents();
  assert.equal(weekSubjects.length, 36, `${name}: 36 activity weeks generated`);

  const seenBlocks = [];
  for (const subject of weekSubjects.map(value => value.trim())) {
    if (seenBlocks.at(-1) !== subject) seenBlocks.push(subject);
  }
  assert.equal(new Set(seenBlocks).size, seenBlocks.length, `${name}: a subject never returns after its block ends`);
  assert.equal(weekSubjects.slice(0, 28).every(subject => subject.trim() === 'القرآن الكريم والدراسات الإسلامية'), true, `${name}: highest-capacity subject continues for its full allowance`);
  assert.equal(seenBlocks.length <= 3, true, `${name}: distribution uses the minimum practical number of continuous sources`);

  if (errors.length) throw new Error(`${name}: browser errors\n${errors.join('\n')}`);
  await browser.close();
}

await runScenario('desktop', { viewport: { width: 1440, height: 1000 } });
await runScenario('mobile', { ...devices['iPhone 13'] });
console.log('UI smoke tests passed');
