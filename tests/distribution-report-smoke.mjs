import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${baseURL}/tests/distribution-report-fixture.html`, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase('activity10LocalDB');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
  await window.seedDistributionReportState();
});
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(async () => window.seedDistributionReportState());
await page.waitForSelector('#undistributedTeachersPanel');

const reportText = await page.locator('#undistributedTeachersPanel').innerText();
assert.match(reportText, /المعلم غير الموزع/, 'eligible unused teacher appears');
assert.doesNotMatch(reportText, /المعلم المستثنى/, 'excluded teacher does not appear');
assert.match(await page.locator('[data-undistributed-metric]').innerText(), /١|1/, 'metric shows one teacher without distribution');

const subjectOrder = await page.locator('#printFixture > .activity-assignment-line > b').allTextContents();
assert.deepEqual(subjectOrder.map((value) => value.trim()), ['الرياضيات', 'العلوم'], 'subject groups are sorted by their earliest week');

const scienceRanges = await page.locator('#printFixture > .activity-assignment-line').nth(1).locator('small').allTextContents();
assert.match(scienceRanges[0], /الأسبوع ٨/, 'ranges inside a subject are sorted chronologically');
assert.match(scienceRanges[1], /الأسبوع ١٤/, 'later range follows earlier range');

await browser.close();
console.log('Distribution report and print ordering tests passed');
