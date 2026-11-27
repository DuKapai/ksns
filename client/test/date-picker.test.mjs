import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const client = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL(`../node_modules/.calendar-test-${process.pid}.mjs`, import.meta.url));
let DatePickerComponent;

before(async () => {
  await build({
    absWorkingDir: client, entryPoints: ['src/app/pages/date-picker.component.ts'], outfile: output,
    bundle: true, platform: 'node', format: 'esm', packages: 'external',
  });
  await import('@angular/compiler');
  ({ DatePickerComponent } = await import(pathToFileURL(output).href));
});
after(async () => { await rm(output, { force: true }); });

test('calendar validates real dates and updates dynamic limits', () => {
  const picker = new DatePickerComponent({ detectChanges() {} });
  let revalidations = 0;
  picker.registerOnValidatorChange(() => revalidations++);
  picker.min = '2024-02-12';
  picker.max = '2024-03-10';
  assert.equal(revalidations, 2);
  assert.equal(picker.validate({ value: '' }), null);
  assert.equal(picker.validate({ value: '2024-02-29' }), null);
  assert.deepEqual(picker.validate({ value: '2023-02-29' }), { date: true });
  assert.ok(picker.validate({ value: '2024-02-11' }).dateMin);
  assert.ok(picker.validate({ value: '2024-03-11' }).dateMax);
});

test('calendar generates leap days and enforces limits when selecting', () => {
  const picker = new DatePickerComponent({ detectChanges() {} });
  const dialog = {
    open: false, offsetWidth: 292, offsetHeight: 350, style: {},
    showModal() { this.open = true; }, close() { this.open = false; }, querySelector() { return null; },
  };
  picker.calendar = { nativeElement: dialog };
  picker.trigger = { nativeElement: { getBoundingClientRect: () => ({ left: 20, top: 100, bottom: 140 }), focus() {} } };
  const originalWindow = globalThis.window;
  globalThis.window = { innerWidth: 390, innerHeight: 844 };
  try {
    picker.min = '2024-02-12';
    picker.max = '2024-03-10';
    picker.writeValue('2024-02-29');
    let selected;
    picker.registerOnChange(value => { selected = value; });
    picker.open();
    assert.equal(picker.days.filter(Boolean).length, 29);
    assert.equal(picker.days.filter(Boolean).at(-1).value, '2024-02-29');
    assert.equal(picker.canShift(-1), false);
    assert.equal(picker.canShift(1), true);
    assert.equal(picker.unavailable('2024-02-11'), true);
    picker.select('2024-02-11');
    assert.equal(selected, undefined);
    picker.select('2024-02-12');
    assert.equal(selected, '2024-02-12');
    assert.equal(dialog.open, false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
