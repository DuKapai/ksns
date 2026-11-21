import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDepartments } from '../src/departments.js';

test('department catalog uses the demo code/name schema', async () => {
  const departments = await readDepartments();
  assert.ok(departments.length > 0);
  assert.ok(departments.some((department) =>
    department.makhoa === 'DEMO-A' && department.tenkhoa === 'Khoa A (mô phỏng)'));
  assert.ok(departments.some((department) =>
    department.makhoa === 'DEMO-K' && department.tenkhoa === 'Khoa KSNK (mô phỏng)'));
  assert.ok(departments.every((department) =>
    typeof department.makhoa === 'string' && typeof department.tenkhoa === 'string'));
});
