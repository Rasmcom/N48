import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';

async function runScenario(name, contextOptions) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

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

  await page.locator('[data-view="settings"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-view-panel="settings"].active').count(), 1, `${name}: settings opens`);

  await page.locator('#schoolNameInput').fill('مدرسة الاختبار');
  await page.locator('[data-choice="gender"][data-value="boys"]').click();
  await page.locator('#settingsNextBtn').click();
  assert.equal(await page.locator('[data-settings-panel="2"].active').count(), 1, `${name}: settings step 2`);

  await page.locator('[data-toggle-stage="primary"]').click();
  await page.locator('[data-stage-type="primary"][data-type="tahfiz"]').click();
  await page.locator('#settingsNextBtn').click();
  assert.equal(await page.locator('[data-settings-panel="3"].active').count(), 1, `${name}: settings step 3`);

  await page.locator('[data-grade-count="p4"]').fill('1');
  await page.locator('[data-grade-count="p5"]').fill('1');
  await page.locator('[data-grade-count="p6"]').fill('1');
  await page.locator('#settingsNextBtn').click();
  assert.equal(await page.locator('[data-settings-panel="4"].active').count(), 1, `${name}: settings step 4`);

  await page.locator('#settingsNextBtn').click();
  assert.equal(await page.locator('[data-view-panel="import"].active').count(), 1, `${name}: import opens`);

  await page.locator('[data-import-tab="text"]').click();
  await page.locator('#teachersTextInput').fill('Tea_1017100908\tاحمد سعد احمد الغامدي\t966530237122\tدائم\tمعلم\tدين\tدين');
  await page.locator('#parseTextBtn').click();
  assert.equal(await page.locator('#importPreview tbody tr').count(), 1, `${name}: text import preview`);

  await page.locator('[data-preview-field="load"]').fill('24');
  await page.locator('#commitImportBtn').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-view-panel="classify"].active').count(), 1, `${name}: classify opens`);
  assert.equal(await page.locator('.teacher-list-item').count(), 1, `${name}: teacher imported`);

  await page.locator('.teacher-list-item').click();
  await page.locator('[data-teacher-field="rank"]').selectOption('advanced');
  await page.locator('#autoSectionSelect').selectOption('p4_1');
  await page.locator('#autoSubjectSelect').selectOption({ label: 'الرياضيات' });
  assert.equal(await page.locator('#autoPeriodsPreview strong').innerText(), '٦', `${name}: automatic periods`);
  await page.locator('#addAutoAssignmentBtn').click();
  assert.equal(await page.locator('#teacherAssignmentsTable tbody tr').count(), 1, `${name}: assignment added`);

  await page.locator('[data-action="save-teacher"]').click();
  await page.locator('[data-view="validate"]').click();
  await page.locator('#runValidationBtn').click();
  assert.ok(await page.locator('#validationTable').innerText(), `${name}: validation renders`);

  await page.locator('[data-view="distribution"]').click();
  await page.locator('#generateDistributionBtn').click();
  assert.ok(await page.locator('#toast').innerText(), `${name}: distribution gives feedback`);

  if (errors.length) throw new Error(`${name}: browser errors\n${errors.join('\n')}`);
  await browser.close();
}

await runScenario('desktop', { viewport: { width: 1440, height: 1000 } });
await runScenario('mobile', { ...devices['iPhone 13'] });
console.log('UI smoke tests passed');
