import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const client = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL(`../node_modules/.mobile-zoom-test-${process.pid}.mjs`, import.meta.url));
let preventMobileZoom;

before(async () => {
  await build({
    absWorkingDir: client, entryPoints: ['src/mobile-zoom.ts'], outfile: output,
    bundle: true, platform: 'node', format: 'esm',
  });
  ({ preventMobileZoom } = await import(pathToFileURL(output).href));
});
after(async () => { await rm(output, { force: true }); });

test('blocks pinch gestures without blocking single-touch scrolling', () => {
  const target = new EventTarget();
  preventMobileZoom(target);
  for (const type of ['gesturestart', 'gesturechange']) {
    const event = new Event(type, { cancelable: true });
    assert.equal(target.dispatchEvent(event), false, type);
  }
  for (const [touches, allowed] of [[1, true], [2, false]]) {
    const event = new Event('touchmove', { cancelable: true });
    Object.defineProperty(event, 'touches', { value: Array(touches).fill({}) });
    assert.equal(target.dispatchEvent(event), allowed);
  }
});
