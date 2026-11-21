import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const users = [
  { id: 'doctor-a', username: 'doctor-a', employeeCode: 'DA', fullName: 'Bác sĩ A', departmentCode: 'A', departmentName: 'Khoa A', roles: ['MEMBER_DOCTOR'] },
  { id: 'nurse-a', username: 'nurse-a', employeeCode: 'NA', fullName: 'Điều dưỡng A', departmentCode: 'A', departmentName: 'Khoa A', roles: ['MEMBER_NURSE'] },
  { id: 'doctor-b', username: 'doctor-b', employeeCode: 'DB', fullName: 'Bác sĩ B', departmentCode: 'B', departmentName: 'Khoa B', roles: ['MEMBER_DOCTOR'] },
  { id: 'admin', username: 'admin', employeeCode: 'KS', fullName: 'Đầu mối KSNK', departmentCode: 'DEMO-K', departmentName: 'KSNK', roles: ['KSNK_ADMIN'] },
  { id: 'secretary', username: 'secretary', employeeCode: 'TH', fullName: 'Thư ký', departmentCode: 'DEMO-K', departmentName: 'KSNK', roles: ['NETWORK_SECRETARY'] },
].map((user) => ({ ...user, password: 'test', active: true }));

test('surveillance enforces department scope and returns per-department monthly status', async (t) => {
  const file = path.join(serverDir, 'test', `surveillance-${randomUUID()}.json`);
  const fixture = {
    users,
    members: [
      { ...users[0], memberType: 'Bác sĩ' },
      { ...users[1], memberType: 'Điều dưỡng' },
      { ...users[2], memberType: 'Bác sĩ' },
    ],
    risks: [],
    monitorings: [],
    monthlyReports: [],
    tasks: [],
    audit: [],
  };
  await writeFile(file, JSON.stringify(fixture));
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: serverDir,
    env: { ...process.env, DATA_FILE: file, PORT: String(port), JWT_SECRET: 'test-secret', AUTH_MODE: 'demo' },
    stdio: 'ignore',
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
    await unlink(file);
  });

  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; ; i++) {
    try {
      await fetch(`${base}/health`);
      break;
    } catch (error) {
      if (i === 100 || child.exitCode !== null) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function request(route, { method = 'GET', token, body } = {}) {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }

  const tokens = {};
  for (const user of users) {
    const login = await request('/auth/login', {
      method: 'POST',
      body: { username: user.username, password: 'test' },
    });
    assert.equal(login.status, 200);
    tokens[user.username] = login.body.token;
  }

  const date = '2026-04-03';
  const caseResponse = await request('/surveillance/cases', {
    method: 'POST',
    token: tokens['nurse-a'],
    body: {
      detectedAt: `${date}T10:15`,
      type: 'Nghi ngờ NKBV',
      location: 'Buồng bệnh demo',
      findings: 'Dấu hiệu cần đánh giá theo quy trình.',
      initialAction: 'Đã báo trực tiếp cho người phụ trách.',
      isolationStatus: 'Đang bố trí',
      isolationType: 'Theo chỉ định',
      notifiedTo: 'Lãnh đạo khoa',
      notifiedAt: `${date}T10:20`,
    },
  });
  assert.equal(caseResponse.status, 201);
  assert.equal((await request('/surveillance/cases?from=2026-04-01&to=2026-04-30', {
    token: tokens['doctor-b'],
  })).body.items.length, 0);
  assert.equal((await request('/surveillance/cases?from=2026-04-01&to=2026-04-30', {
    token: tokens.admin,
  })).body.items.length, 1);

  const invalidDaily = await request('/surveillance/daily', {
    method: 'PUT',
    token: tokens['doctor-a'],
    body: {
      date,
      note: 'Đối chiếu ca mô phỏng.',
      bundles: Object.fromEntries(['VAP', 'CAUTI', 'SSI', 'CLABSI'].map((key) =>
        [key, { eligible: 1, compliant: 2 }])),
    },
  });
  assert.equal(invalidDaily.status, 400);

  const daily = await request('/surveillance/daily', {
    method: 'PUT',
    token: tokens['doctor-a'],
    body: {
      date,
      note: 'Đối chiếu ca mô phỏng.',
      bundles: Object.fromEntries(['VAP', 'CAUTI', 'SSI', 'CLABSI'].map((key) =>
        [key, { eligible: 2, compliant: 1 }])),
    },
  });
  assert.equal(daily.status, 200);
  assert.equal(daily.body.item.caseDeclaration, undefined);
  assert.equal(daily.body.item.note, 'Đối chiếu ca mô phỏng.');
  const simplifiedUpdate = await request('/surveillance/daily', {
    method: 'PUT',
    token: tokens['doctor-a'],
    body: {
      date,
      bundles: Object.fromEntries(['VAP', 'CAUTI', 'SSI', 'CLABSI'].map((key) =>
        [key, { eligible: 2, compliant: 1 }])),
    },
  });
  assert.equal(simplifiedUpdate.status, 200);
  assert.equal(simplifiedUpdate.body.item.note, 'Đối chiếu ca mô phỏng.');
  assert.equal(simplifiedUpdate.body.item.caseDeclaration, undefined);

  const monthlyStatus = await request('/surveillance/monthly-status?month=2026-04', {
    token: tokens.admin,
  });
  assert.equal(monthlyStatus.status, 200);
  const day = monthlyStatus.body.days.find((item) => item.date === date);
  assert.deepEqual(day.departments.map((item) => item.departmentCode), ['A', 'B']);
  assert.equal(day.departments.find((item) => item.departmentCode === 'A').doctorSubmitted, true);
  assert.equal(day.departments.find((item) => item.departmentCode === 'B').doctorSubmitted, false);
  const dailyStatus = await request(`/surveillance/daily-status?date=${date}`, {
    token: tokens.admin,
  });
  assert.ok(dailyStatus.body.missing.some((item) =>
    item.departmentCode === 'B' && item.role === 'Bác sĩ mạng lưới'));
  assert.ok(dailyStatus.body.missing.some((item) =>
    item.departmentCode === 'A' && item.role === 'Điều dưỡng giám sát vệ sinh tay'));

  assert.equal((await request('/departments')).status, 401);
  const departments = await request('/departments', { token: tokens.admin });
  assert.ok(departments.body.items.some((item) =>
    item.makhoa === 'DEMO-A' && item.tenkhoa === 'Khoa A (mô phỏng)'));
  assert.equal((await request('/members', {
    method: 'POST',
    token: tokens.admin,
    body: {
      employeeCode: 'NEW-001',
      fullName: 'Nhân viên mô phỏng',
      memberType: 'Bác sĩ',
      departmentCode: 'DEMO-A',
      departmentName: 'Tên khoa không khớp',
    },
  })).status, 400);
  assert.equal((await request('/members', {
    method: 'POST',
    token: tokens.admin,
    body: {
      employeeCode: 'NEW-001',
      fullName: 'Nhân viên mô phỏng',
      memberType: 'Bác sĩ',
      departmentCode: 'DEMO-A',
      departmentName: 'Khoa A (mô phỏng)',
    },
  })).status, 201);

  const caseId = caseResponse.body.item.id;
  assert.equal((await request(`/surveillance/cases/${caseId}`, {
    method: 'PATCH',
    token: tokens.secretary,
    body: { action: 'submit-to-council', councilReference: 'HDKH-DEMO-001' },
  })).status, 200);
  assert.equal((await request(`/surveillance/cases/${caseId}`, {
    method: 'PATCH',
    token: tokens.secretary,
    body: { action: 'adjudicate', decision: 'Chưa đủ dữ liệu', rationale: 'Cần bổ sung minh chứng.' },
  })).status, 403);
  assert.equal((await request(`/surveillance/cases/${caseId}`, {
    method: 'PATCH',
    token: tokens.admin,
    body: { action: 'adjudicate', decision: 'Chưa đủ dữ liệu', rationale: 'Cần bổ sung minh chứng.' },
  })).status, 200);

  const stored = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(stored.surveillanceCases[0].departmentCode, 'A');
  assert.ok(stored.audit.some((entry) => entry.entity === 'dailySurveillance'));
});
