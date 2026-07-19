import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto(`${baseURL}/tests/print-gender-fixture.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('#activityAssignmentsPrintBtn');

async function inspectGender(gender) {
  await page.evaluate(async (value) => window.seedPrintState(value), gender);
  await page.locator('#activityAssignmentsPrintBtn').click();
  await page.locator('#activityPrintPreview.show').waitFor({ state: 'visible' });

  const previewText = await page.locator('#activityPrintPage').innerText();
  const expected = gender === 'girls'
    ? { title: 'تكليف المعلمات', teacher: 'اسم المعلمة', leader: 'رائدة النشاط', manager: 'مديرة المدرسة' }
    : { title: 'تكليف المعلمين', teacher: 'اسم المعلم', leader: 'رائد النشاط', manager: 'مدير المدرسة' };

  assert.match(previewText, new RegExp(expected.title), `${gender}: title wording`);
  assert.match(previewText, new RegExp(expected.teacher), `${gender}: teacher column wording`);
  assert.match(previewText, new RegExp(expected.leader), `${gender}: activity leader wording`);
  assert.match(previewText, new RegExp(expected.manager), `${gender}: principal wording`);
  assert.doesNotMatch(previewText, /وكيل|وكيلة/, `${gender}: vice principal wording removed`);

  const subjectHeadings = page.locator('.activity-assignment-line b');
  assert.equal(await subjectHeadings.count(), 1, `${gender}: repeated subject printed once`);
  assert.equal((await subjectHeadings.first().innerText()).trim(), 'الرياضيات', `${gender}: grouped subject is correct`);
  assert.equal(await page.locator('.activity-subject-ranges small').count(), 2, `${gender}: two section/week ranges remain under one subject`);

  await page.locator('#closeActivityPrintPreview').click();
  await page.locator('#activityPrintPreview').waitFor({ state: 'hidden' });
}

await inspectGender('boys');
await inspectGender('girls');

await browser.close();
console.log('Print gender and grouping tests passed');
