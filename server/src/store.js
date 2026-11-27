import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const configured = process.env.DATA_FILE || './data/demo-store.json';
const dataPath = path.resolve(here, '..', configured.startsWith('./') ? configured.slice(2) : configured);
const seedPath = path.resolve(here, '..', 'data/seed.json');
const demoPath = path.resolve(here, '..', 'data/demo-store.json');
if (process.env.AUTH_MODE === 'hospital' && (!process.env.DATA_FILE || dataPath === demoPath || dataPath === seedPath)) {
  throw new Error('Chế độ bệnh viện cần DATA_FILE riêng, không dùng dữ liệu demo.');
}
let queue = Promise.resolve();
// This process is the only writer, so the saved JSON is kept in memory and the file is loaded only once.
let cachedRaw;

// Windows briefly locks a file while it is being replaced; retry instead of failing the request.
async function retryLocked(operation) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      if (attempt >= 10 || !['EPERM', 'EACCES', 'EBUSY'].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt));
    }
  }
}

async function loadRaw() {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  try { return await retryLocked(() => fs.readFile(dataPath, 'utf8')); }
  catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    if (process.env.AUTH_MODE === 'hospital') {
      throw new Error('DATA_FILE của bệnh viện chưa tồn tại. Hãy chuẩn bị kho dữ liệu trước khi khởi động.');
    }
    await fs.copyFile(seedPath, dataPath);
    return retryLocked(() => fs.readFile(dataPath, 'utf8'));
  }
}

export async function readStore() {
  const pending = cachedRaw ??= loadRaw();
  try { return JSON.parse(await pending); }
  catch (error) { if (cachedRaw === pending) cachedRaw = undefined; throw error; }
}

export async function updateStore(mutator) {
  const run = queue.then(async () => {
    const data = await readStore();
    const result = await mutator(data);
    const raw = JSON.stringify(data, null, 2);
    const temp = `${dataPath}.${process.pid}.tmp`;
    await fs.writeFile(temp, raw, 'utf8');
    await retryLocked(() => fs.rename(temp, dataPath));
    cachedRaw = Promise.resolve(raw);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export function makeId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
