import assert from "node:assert/strict";
import test from "node:test";
import { getStartupLesson, lessonCatalog, searchEntries, startupBase, startupLessons } from "../src/content/business-for-startup/index";
import { breakEvenUnits, caseOperatingBudget, financialCase, pilotBudgetTotal, yearOneFixedCashCosts } from "../src/content/business-for-startup/financial-example";
import { searchStartup } from "../src/lib/startup-search";

test("the curriculum preserves supplied chapters and every searchable anchor resolves", () => {
  assert.deepEqual(lessonCatalog.filter(l => l.chapter !== null).map(l => l.chapter), [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
  assert.equal(new Set(lessonCatalog.map(l => l.slug)).size, lessonCatalog.length);
  assert.equal(getStartupLesson("chuong-khong-ton-tai"), undefined);
  assert.equal(lessonCatalog.at(-1)?.slug, "proposal-va-quy-trinh");
  for (const lesson of startupLessons) {
    assert.match(lesson.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(new Set(lesson.sections.map(s => s.id)).size, lesson.sections.length);
    for (const section of lesson.sections) {
      assert.match(section.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      for (const block of section.blocks) if (block.kind === "table") for (const row of block.rows) assert.equal(row.length, block.columns.length, `${lesson.slug}#${section.id}: table has a missing cell`);
    }
  }
  for (const entry of searchEntries) {
    const [path, anchor] = entry.href.split("#");
    const lesson = getStartupLesson(path.slice(startupBase.length + 1));
    assert.ok(lesson?.sections.some(s => s.id === anchor), entry.href);
  }
});

test("readers can find accented Vietnamese, plain Vietnamese and body-only terms", () => {
  const accented = searchStartup(searchEntries, "dòng tiền"), plain = searchStartup(searchEntries, "DONG TIEN");
  assert.deepEqual(accented.map(e => e.href), plain.map(e => e.href));
  assert.ok(accented.some(e => e.href.includes("tai-chinh-startup")));
  assert.ok(plain.every(e => e.exactPhrase), "A phrase match must not be diluted by common words scattered through unrelated sections");
  assert.ok(searchStartup(searchEntries, "liability of newness").some(e => e.href.includes("xay-dung-doi-ngu")));
  assert.ok(searchStartup(searchEntries, "BARRINGER").some(e => e.href.includes("mo-hinh-kinh-doanh")));
  assert.deepEqual(searchStartup(searchEntries, "   "), []);
  assert.deepEqual(searchStartup(searchEntries, "zzyy-khongco-76543"), []);
  for (const result of plain) assert.ok(result.snippet.length > 0 && result.snippet.length <= 172);
});

test("the worked proposal reconciles sales, pretax profit, cash and the balance sheet", () => {
  assert.deepEqual(financialCase.map(y => y.revenue), [240, 600, 1080]);
  assert.deepEqual(financialCase.map(y => y.contribution), [192, 480, 864]);
  assert.deepEqual(financialCase.map(y => y.profitBeforeTax), [-60, 108, 372]);
  assert.deepEqual(financialCase.map(y => y.closingCash), [116, 236, 620]);
  assert.deepEqual(financialCase.map(y => y.assets), [140, 248, 620]);
  for (const y of financialCase) {
    assert.equal(y.contribution - y.fixedCashCosts - y.depreciation, y.profitBeforeTax);
    assert.equal(y.openingCash + y.operatingCash - y.investment, y.closingCash);
    assert.equal(y.profitBeforeTax + y.depreciation, y.operatingCash);
    assert.equal(y.assets, y.liabilities + y.equity);
  }
});

test("the free pilot is included once in year-one funding and operating costs", () => {
  assert.equal(pilotBudgetTotal, 12);
  assert.equal(yearOneFixedCashCosts, 240);
  assert.ok(caseOperatingBudget.every(item => item.pilot >= 0 && item.pilot <= item.annual));
  const y = financialCase[0];
  assert.equal(y.fixedCashCosts, yearOneFixedCashCosts);
  assert.equal(y.openingCash + y.revenue, y.fixedCashCosts + y.variableCosts + y.investment + y.closingCash);
  assert.ok(pilotBudgetTotal <= y.openingCash, "The pilot cannot depend on later commercial sales to fund its launch");
});

test("break-even rounds up indivisible units and handles nonpositive margins and invalid inputs", () => {
  assert.equal(breakEvenUnits(100, 40, 1500), 25);
  assert.equal(breakEvenUnits(100, 40, 1501), 26);
  assert.equal(breakEvenUnits(100, 40, 0), 0);
  for (const args of [[100, 100, 1], [100, 101, 1], [0, 0, 1], [10, -1, 2], [10, 1, -2], [Infinity, 1, 2], [NaN, 1, 2]]) assert.equal(breakEvenUnits(...args as [number, number, number]), null);
});
