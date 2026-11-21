import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { loginWithHospitalApi } from '../src/his-adapter.js';

const settings = [
  'AUTH_MODE',
  'HIS_API_BASE_URL',
  'HIS_AUTH_PROTOCOL',
  'HIS_AUTH_PATH',
  'HIS_AUTH_USERNAME_FIELD',
  'HIS_AUTH_PASSWORD_FIELD',
  'HIS_PROFILE_EMPLOYEE_CODE_PATH',
  'HIS_PROFILE_FULL_NAME_PATH',
  'HIS_PROFILE_POSITION_PATH',
  'HIS_PROFILE_DEPARTMENT_CODE_PATH',
  'HIS_PROFILE_DEPARTMENT_NAME_PATH',
];
const original = Object.fromEntries(settings.map((key) => [key, process.env[key]]));

after(() => {
  for (const key of settings) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test('maps the reference employee-cookie API profile and keeps department scope from the profile', async () => {
  process.env.HIS_API_BASE_URL = 'https://hospital.example';
  process.env.HIS_AUTH_PROTOCOL = 'employee-cookie-api';
  for (const key of settings.slice(3)) delete process.env[key];

  const user = await loginWithHospitalApi('EMP001', 'test-password', {
    assignments: {
      EMP001: {
        roles: ['MEMBER_DOCTOR', 'UNRECOGNIZED_ROLE'],
        departmentCode: 'UNTRUSTED',
        departmentName: 'Untrusted department',
      },
    },
    fetchImpl: async (url, options) => {
      assert.equal(String(url), 'https://hospital.example/api/login');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), {
        manv: 'EMP001',
        password: 'test-password',
      });
      return new Response(JSON.stringify({
        manv: 'EMP001',
        tennv: 'Bác sĩ mô phỏng',
        makhoa: 'DEMO-A',
        tenkhoa: 'Khoa A (mô phỏng)',
        macv: 'NV',
        tencv: 'Bác sĩ',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.deepEqual(user, {
    id: 'his_EMP001',
    username: 'EMP001',
    employeeCode: 'EMP001',
    fullName: 'Bác sĩ mô phỏng',
    position: 'Bác sĩ',
    departmentCode: 'DEMO-A',
    departmentName: 'Khoa A (mô phỏng)',
    roles: ['MEMBER_DOCTOR'],
    active: true,
    authSource: 'hospital-api',
  });
});

test('rejects a hospital account that has no approved KSNK role mapping', async () => {
  process.env.HIS_API_BASE_URL = 'https://hospital.example';
  process.env.HIS_AUTH_PROTOCOL = 'employee-cookie-api';
  for (const key of settings.slice(3)) delete process.env[key];

  await assert.rejects(
    loginWithHospitalApi('EMP002', 'test-password', {
      assignments: {},
      fetchImpl: async () => new Response(JSON.stringify({
        manv: 'EMP002',
        tennv: 'Nhân viên mô phỏng',
        makhoa: 'DEMO-A',
        tenkhoa: 'Khoa A (mô phỏng)',
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    }),
    (error) => error.code === 'ROLE_ASSIGNMENT_MISSING',
  );
});
