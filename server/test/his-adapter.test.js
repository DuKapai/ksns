import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { access, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
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

test('allows an explicitly assigned non-doctor network member to use member workflows', async () => {
  process.env.HIS_API_BASE_URL = 'https://hospital.example';
  process.env.HIS_AUTH_PROTOCOL = 'employee-cookie-api';
  for (const key of settings.slice(3)) delete process.env[key];

  const user = await loginWithHospitalApi('EMP003', 'test-password', {
    assignments: { EMP003: { roles: ['NETWORK_MEMBER'] } },
    fetchImpl: async () => new Response(JSON.stringify({
      manv: 'EMP003',
      tennv: 'Kỹ thuật viên mô phỏng',
      makhoa: 'DEMO-A',
      tenkhoa: 'Khoa A (mô phỏng)',
      tencv: 'Kỹ thuật y',
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  assert.deepEqual(user.roles, ['NETWORK_MEMBER']);
  assert.equal(user.position, 'Kỹ thuật y');
});

test('hospital startup rejects unsafe configuration without creating demo data', async () => {
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const missing = path.join(serverDir, 'test', `missing-${randomUUID()}.json`);
  const validSecret = 'test-only-secret-at-least-thirty-two-characters';
  for (const [file, secret, expected] of [
    ['', validSecret, 'DATA_FILE'],
    ['./data/demo-store.json', validSecret, 'DATA_FILE'],
    [missing, validSecret, 'chưa tồn tại'],
    [missing, '', 'JWT_SECRET'],
    [missing, 'short', 'JWT_SECRET'],
    [missing, 'demo-only-change-this-secret-before-use', 'JWT_SECRET'],
  ]) {
    const child = spawn(process.execPath, ['src/index.js'], {
      cwd: serverDir,
      env: { ...process.env, AUTH_MODE: 'hospital', DATA_FILE: file, JWT_SECRET: secret },
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    const code = await new Promise(resolve => child.once('close', resolve));
    assert.notEqual(code, 0);
    assert.ok(stderr.includes(expected), stderr);
  }
  await assert.rejects(access(missing), { code: 'ENOENT' });
});

test('hospital login uses the verified profile and never falls back to demo accounts', async (t) => {
  const hospital = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/me') {
      if (req.headers.cookie !== 'irw_session=valid_session') { res.writeHead(401).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ manv: 'REPLACE_WITH_DOCTOR_MANV', tennv: 'Bác sĩ phiên',
        tencv: 'Bác sĩ', makhoa: 'TEST', tenkhoa: 'Khoa kiểm thử' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { manv, password } = JSON.parse(body);
      if (password !== 'test-password') { res.writeHead(401).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ manv, tennv: 'Bác sĩ kiểm thử', tencv: 'Bác sĩ',
        makhoa: 'TEST', tenkhoa: 'Khoa kiểm thử' }));
    });
  });
  await new Promise(resolve => hospital.listen(0, '127.0.0.1', resolve));
  const tmp = await mkdtemp(path.join(tmpdir(), 'ksnk-his-test-'));
  const file = path.join(tmp, 'data.json');
  const code = 'REPLACE_WITH_DOCTOR_MANV';
  await writeFile(file, JSON.stringify({
    users: [{ id: 'demo', username: 'demo', password: 'demo', active: true }],
    members: [{ id: 'member', employeeCode: code, fullName: 'Bác sĩ kiểm thử',
      departmentCode: 'TEST', departmentName: 'Khoa kiểm thử', memberType: 'Bác sĩ', active: true }],
    tasks: [], monitorings: [], monthlyReports: [], risks: [], audit: [],
  }));
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const child = spawn(process.execPath, ['src/index.js'], { cwd: serverDir, stdio: 'ignore',
    env: { ...process.env, AUTH_MODE: 'hospital', HIS_API_BASE_URL: `http://127.0.0.1:${hospital.address().port}`,
      HIS_AUTH_PROTOCOL: 'employee-cookie-api', DATA_FILE: file, PORT: String(port),
      JWT_SECRET: 'test-only-secret-at-least-thirty-two-characters',
      HIS_ROLE_ASSIGNMENTS: JSON.stringify({ [code]: { roles: ['MEMBER_DOCTOR'] } }), NODE_ENV: 'test' } });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    await new Promise(resolve => hospital.close(resolve));
    await unlink(file);
    await rmdir(tmp);
  });
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; ; i++) {
    try { await fetch(`${base}/health`); break; }
    catch (error) { if (i === 100 || child.exitCode !== null) throw error; await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  assert.equal((await (await fetch(`${base}/health`)).json()).mode, 'hospital');
  const login = async (username, password) => fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  assert.deepEqual(await (await fetch(`${base}/auth/demo-accounts`)).json(), { accounts: [] });
  assert.equal((await fetch(`${base}/auth/session`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${base}/auth/session`, { method: 'POST',
    headers: { cookie: 'irw_session=expired' } })).status, 401);
  const restored = await fetch(`${base}/auth/session`, { method: 'POST',
    headers: { cookie: 'other=secret; irw_session=valid_session' } });
  assert.equal(restored.status, 200);
  const restoredSession = await restored.json();
  assert.equal(restoredSession.user.fullName, 'Bác sĩ phiên');
  assert.deepEqual(restoredSession.user.roles, ['MEMBER_DOCTOR']);
  const restoredContext = await fetch(`${base}/module/context`, {
    headers: { authorization: `Bearer ${restoredSession.token}` },
  });
  assert.equal((await restoredContext.json()).canRecord, true);
  assert.equal((await login('demo', 'demo')).status, 401);
  assert.equal((await login('UNASSIGNED', 'test-password')).status, 403);
  const response = await login(code, 'test-password');
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.deepEqual(session.user.roles, ['MEMBER_DOCTOR']);
  const context = await fetch(`${base}/module/context`, { headers: { authorization: `Bearer ${session.token}` } });
  assert.equal((await context.json()).canRecord, true);
});
