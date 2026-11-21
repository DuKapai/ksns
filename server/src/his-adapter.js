import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const assignmentsPath = path.resolve(here, '../data/role-assignments.json');

function getPath(object, dottedPath) {
  if (!dottedPath) return undefined;
  return dottedPath.split('.').reduce((value, key) => value == null ? undefined : value[key], object);
}

const ALLOWED_ROLES = new Set([
  'MEMBER_DOCTOR',
  'MEMBER_NURSE',
  'DEPARTMENT_HEAD',
  'KSNK_ADMIN',
  'NETWORK_LEAD',
  'NETWORK_DEPUTY',
  'NETWORK_SECRETARY',
]);

export async function loginWithHospitalApi(username, password, options = {}) {
  const base = process.env.HIS_API_BASE_URL;
  if (!base || base.includes('replace-with-approved-api-host')) {
    throw new Error('Chưa cấu hình HIS_API_BASE_URL trong server/.env.');
  }
  const timeout = Number(process.env.HIS_API_TIMEOUT_MS || 10000);
  const fetchImpl = options.fetchImpl || fetch;
  const protocol = process.env.HIS_AUTH_PROTOCOL || 'token-profile';
  if (!['token-profile', 'employee-cookie-api'].includes(protocol)) {
    throw new Error('HIS_AUTH_PROTOCOL chỉ hỗ trợ token-profile hoặc employee-cookie-api.');
  }
  const employeeCookieProtocol = protocol === 'employee-cookie-api';
  const authUrl = new URL(
    process.env.HIS_AUTH_PATH || (employeeCookieProtocol ? '/api/login' : '/api/auth/login'),
    base,
  );
  const loginBody = {};
  loginBody[process.env.HIS_AUTH_USERNAME_FIELD || (employeeCookieProtocol ? 'manv' : 'username')] = username;
  loginBody[process.env.HIS_AUTH_PASSWORD_FIELD || 'password'] = password;
  const authResponse = await fetchImpl(authUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(loginBody),
    signal: AbortSignal.timeout(timeout)
  });
  if (!authResponse.ok) {
    const error = new Error(`Hệ thống xác thực từ chối đăng nhập (HTTP ${authResponse.status}).`);
    error.status = authResponse.status;
    throw error;
  }
  const authData = await authResponse.json();

  let profileData = authData;
  if (!employeeCookieProtocol) {
    const accessToken = getPath(authData, process.env.HIS_AUTH_TOKEN_PATH || 'data.accessToken');
    if (!accessToken) throw new Error('Không tìm thấy access token theo mapping HIS_AUTH_TOKEN_PATH.');

    const profileUrl = new URL(process.env.HIS_PROFILE_PATH || '/api/account/me', base);
    const profileResponse = await fetchImpl(profileUrl, {
      headers: {
        'accept': 'application/json',
        'authorization': process.env.HIS_PROFILE_STATIC_TOKEN
          ? `${process.env.HIS_TOKEN_PREFIX || 'Bearer'} ${process.env.HIS_PROFILE_STATIC_TOKEN}`
          : `${process.env.HIS_TOKEN_PREFIX || 'Bearer'} ${accessToken}`
      },
      signal: AbortSignal.timeout(timeout)
    });
    if (!profileResponse.ok) {
      const error = new Error(`Không lấy được hồ sơ nhân viên (HTTP ${profileResponse.status}).`);
      error.status = profileResponse.status;
      throw error;
    }
    profileData = await profileResponse.json();
  }

  const profilePath = (setting, cookiePath, tokenPath) =>
    process.env[setting] || (employeeCookieProtocol ? cookiePath : tokenPath);
  const profile = {
    employeeCode: getPath(profileData, profilePath('HIS_PROFILE_EMPLOYEE_CODE_PATH', 'manv', 'data.employeeCode')),
    fullName: getPath(profileData, profilePath('HIS_PROFILE_FULL_NAME_PATH', 'tennv', 'data.fullName')),
    position: getPath(profileData, employeeCookieProtocol
      ? process.env.HIS_PROFILE_POSITION_PATH || 'tencv'
      : process.env.HIS_PROFILE_POSITION_PATH || 'data.position.name'),
    departmentCode: getPath(profileData, profilePath('HIS_PROFILE_DEPARTMENT_CODE_PATH', 'makhoa', 'data.department.code')),
    departmentName: getPath(profileData, profilePath('HIS_PROFILE_DEPARTMENT_NAME_PATH', 'tenkhoa', 'data.department.name'))
  };
  if (!profile.employeeCode || !profile.fullName || !profile.departmentCode || !profile.departmentName) {
    throw new Error('Hồ sơ HIS thiếu mã nhân viên, họ tên hoặc khoa/phòng; hãy kiểm tra mapping.');
  }

  const assignments = options.assignments || JSON.parse(await fs.readFile(assignmentsPath, 'utf8'));
  const assignment = assignments[String(profile.employeeCode)];
  const assignedRoles = Array.isArray(assignment?.roles)
    ? assignment.roles.filter((role) => ALLOWED_ROLES.has(role))
    : [];
  if (!assignedRoles.length) {
    const error = new Error('Tài khoản đã xác thực nhưng chưa được gán vai trò KSNK. Liên hệ quản trị mạng lưới.');
    error.code = 'ROLE_ASSIGNMENT_MISSING';
    throw error;
  }
  return {
    id: `his_${profile.employeeCode}`,
    username,
    employeeCode: String(profile.employeeCode),
    fullName: String(profile.fullName),
    position: String(profile.position || 'Chưa đồng bộ chức vụ'),
    departmentCode: String(profile.departmentCode),
    departmentName: String(profile.departmentName),
    roles: assignedRoles,
    active: true,
    authSource: 'hospital-api'
  };
}
