import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const configured = process.env.DATA_FILE || './data/demo-store.json';
const dataPath = path.resolve(here, '..', configured.startsWith('./') ? configured.slice(2) : configured);
const seedPath = path.resolve(here, '..', 'data/seed.json');
let queue = Promise.resolve();

async function ensureStore() {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  try { await fs.access(dataPath); }
  catch { await fs.copyFile(seedPath, dataPath); }
}

export async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(dataPath, 'utf8');
  return JSON.parse(raw);
}

export async function updateStore(mutator) {
  const run = queue.then(async () => {
    const data = await readStore();
    const result = await mutator(data);
    const temp = `${dataPath}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(temp, dataPath);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export function makeId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
