import seed from "../../server/data/seed.json";
const key = "ksnk_pages_store_v1";
let queue = Promise.resolve();

export async function readStore() {
  const raw = localStorage.getItem(key);
  if (raw !== null) return JSON.parse(raw);
  const initial = JSON.stringify(seed);
  localStorage.setItem(key, initial);
  return JSON.parse(initial);
}
export async function updateStore(mutator) {
  const run = queue.then(async () => {
    const data = await readStore();
    const result = await mutator(data);
    localStorage.setItem(key, JSON.stringify(data));
    return result;
  });
  queue = run.catch(() => {});
  return run;
}
export function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
