import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const departmentsPath = path.resolve(here, '../data/departments.json');

export async function readDepartments() {
  const departments = JSON.parse(await fs.readFile(departmentsPath, 'utf8'));
  if (!Array.isArray(departments) || departments.some((item) =>
    typeof item.makhoa !== 'string' || typeof item.tenkhoa !== 'string')) {
    throw new Error('Department catalog has an invalid format.');
  }
  return departments;
}
