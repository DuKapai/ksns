import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { responseWindow, summarize, vietnamDate } from "../src/module.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const member = { id: "doctor", username: "doctor", employeeCode: "DEMO-BS-001", fullName: "Doctor demo",
  departmentCode: "A", departmentName: "Ward A", roles: ["MEMBER_DOCTOR"], active: true, password: "test" };
const staff = { ...member, id: "staff", username: "staff", employeeCode: "DEMO-NV-001", fullName: "Staff demo", roles: ["STAFF"] };
const other = { ...staff, id: "other", username: "other", employeeCode: "OTHER" };
const admin = { ...member, id: "ksnk", username: "ksnk", employeeCode: "DEMO-KSNK-001", fullName: "KSNK demo",
  departmentCode: "CDC", departmentName: "KSNK", roles: ["KSNK_ADMIN"] };
const month = vietnamDate().slice(0, 7);

test("response closes exactly at the Vietnam month boundary, including leap February", () => {
  const issue = { createdAt: "2024-02-01T00:00:00Z" };
  assert.equal(responseWindow(issue, "2024-02-29T16:59:59.999Z").responseOpen, true);
  assert.equal(responseWindow(issue, "2024-02-29T17:00:00Z").responseOpen, false);
  assert.deepEqual(responseWindow({ createdAt: "2024-01-31T17:00:00Z" }, "2024-02-01T01:00:00Z"),
    { responseMonth: "2024-02", responseOpen: true });
  assert.equal(responseWindow({ createdAt: "bad-date" }).responseOpen, false);
});

test("period totals use scoped records, correct denominators and null for no samples", () => {
  const data = {
    monitorings: [
      { date: "2024-02-01", departmentCode: "A", area: "Hand hygiene", sampleSize: 10, compliant: 8 },
      { date: "2024-02-02", departmentCode: "A", area: "Hand hygiene", sampleSize: 90, compliant: 45 },
      { date: "2024-02-02", departmentCode: "A", area: "PPE", sampleSize: 0, compliant: 0 },
      { date: "2024-02-02", departmentCode: "B", area: "Hand hygiene", sampleSize: 100, compliant: 100 },
    ],
    risks: [
      { departmentCode: "A", createdAt: "2024-01-31T17:00:00Z", category: "Hand hygiene", status: "Đã đóng" },
      { departmentCode: "A", createdAt: "2024-02-02T10:00:00Z", category: "Hand hygiene", status: "Mới ghi nhận" },
      { departmentCode: "A", createdAt: "2024-02-02T10:00:00Z", category: "PPE", status: "Đã đóng" },
      { departmentCode: "A", createdAt: "2024-02-29T17:00:00Z", category: "PPE", status: "Đã đóng" },
      { departmentCode: "B", createdAt: "2024-02-02T10:00:00Z", category: "PPE", status: "Đã đóng" },
    ],
  };
  const summary = summarize(data, member, "2024-02-01", "2024-02-29");
  assert.equal(summary.monitoringCount, 3);
  assert.equal(summary.risksFound, 3);
  assert.equal(summary.risksClosed, 2);
  assert.equal(summary.closureRate, 66.7);
  assert.equal(summary.categories[0].share, 66.7);
  assert.equal(summary.categories[0].rate, 50);
  assert.deepEqual(summary.compliance.map((row) => row.rate), [53, null]);
  assert.equal(summarize(data, member, "2023-01-01", "2023-01-31").closureRate, null);
});

test("simplified module persists notices, restricts responses and automatically confirms reports", async (t) => {
  const file = path.join(serverDir, "test", `module-${randomUUID()}.json`);
  await writeFile(file, JSON.stringify({
    users: [member, staff, other, admin, { ...admin, id: "secretary", username: "secretary", roles: ["NETWORK_SECRETARY"] }],
    members: [{ ...member, memberType: "Bác sĩ" }, { ...admin, memberType: "KSNK" },
      { id: "colleague", employeeCode: "COLLEAGUE", fullName: "Colleague", departmentCode: "A", memberType: "Điều dưỡng", active: true }],
    tasks: [], monitorings: [], monthlyReports: [], audit: [],
    risks: [{ id: "expired", code: "OLD", createdAt: "2000-01-01T00:00:00Z", departmentCode: "A",
      subjectEmployeeCode: staff.employeeCode, title: "Old issue", status: "Đã đóng" },
    { id: "late-fixing", code: "LATE1", createdAt: "2000-01-01T00:00:00Z", departmentCode: "A", title: "Late fixing",
      status: "Đang khắc phục", dueDate: "2000-01-15" },
    { id: "late-waiting", code: "LATE2", createdAt: "2000-01-01T00:00:00Z", departmentCode: "A", title: "Late waiting",
      status: "Chờ kiểm tra lại", dueDate: "2000-01-15" }],
  }));
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const child = spawn(process.execPath, ["src/index.js"], { cwd: serverDir,
    env: { ...process.env, DATA_FILE: file, PORT: String(port), JWT_SECRET: "isolated-test-secret", DEMO_AUTO_LOGIN: "true", NODE_ENV: "test" },
    stdio: "ignore" });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await new Promise((resolve) => child.once("exit", resolve)); }
    await unlink(file);
  });
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; ; i++) {
    try { await fetch(`${base}/health`); break; }
    catch (error) { if (i === 100 || child.exitCode !== null) throw error; await new Promise((resolve) => setTimeout(resolve, 50)); }
  }
  async function request(route, token, body, method = body ? "POST" : "GET") {
    const result = await fetch(base + route, { method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: result.status, body: await result.json() };
  }
  const doctor = (await request("/auth/demo-session", null, { persona: "doctor" })).body.token;
  const employee = (await request("/auth/demo-session", null, { persona: "staff" })).body.token;
  const unrelated = (await request("/auth/login", null, { username: "other", password: "test" })).body.token;
  assert.equal((await request("/module/context")).status, 401);
  assert.equal((await request("/auth/demo-session", null, { persona: "arbitrary" })).status, 400);
  assert.equal((await request("/module/context", employee)).body.canRecord, false);
  assert.deepEqual((await request("/module/context", employee)).body.people, []);
  assert.equal((await request("/monitorings", employee)).status, 403);
  assert.equal((await request("/doctor/observations", employee)).status, 403);
  assert.equal((await request("/surveillance/daily?date=2024-01-01", employee)).status, 403);
  const form = { title: "Demo finding", category: "Hand hygiene", severity: "Cao", description: "Demo evidence",
    subjectEmployeeCode: staff.employeeCode, kind: "Sai sót" };
  assert.equal((await request("/risks", employee, form)).status, 403);
  assert.equal((await request("/risks", doctor, { ...form, severity: "anything" })).status, 400);
  assert.equal((await request("/risks", doctor, { ...form, subjectEmployeeCode: "missing" })).status, 400);
  const created = await request("/risks", doctor, form);
  assert.equal(created.status, 201);
  assert.equal(created.body.item.kind, "Sai sót");
  const id = created.body.item.id;
  assert.equal((await request("/module/issues", unrelated)).body.items.length, 0);
  assert.equal((await request("/module/issues", employee)).body.items.find((item) => item.id === id).canRespond, true);
  const reply = { explanation: "Demo explanation", evidence: "Demo reference" };
  assert.equal((await request(`/module/issues/${id}/responses`, unrelated, reply)).status, 404);
  assert.equal((await request(`/module/issues/${id}/responses`, doctor, reply)).status, 403);
  assert.equal((await request("/module/issues/expired/responses", employee, reply)).status, 409);
  assert.equal((await request(`/module/issues/${id}/responses`, employee, { ...reply, evidence: "" })).status, 400);
  assert.equal((await request(`/module/issues/${id}/responses`, employee, reply)).status, 201);
  const overview = await request(`/module/overview?from=${month}-01&to=${vietnamDate()}`, employee);
  const notification = overview.body.notices.find((notice) => notice.recipient === staff.employeeCode);
  assert.ok(notification);
  assert.equal((await request(`/module/notifications/${notification.id}/read`, unrelated, {}, "PATCH")).status, 404);
  assert.equal((await request(`/module/notifications/${notification.id}/read`, employee, {}, "PATCH")).status, 200);
  assert.equal((await request("/module/overview?from=2024-02-30&to=2024-03-01", doctor)).status, 400);
  const monitoring = { date: `${month}-01`, area: "Hand hygiene", method: "Observation", findings: "Demo", sampleSize: 10, compliant: 8 };
  assert.equal((await request("/monitorings", doctor, monitoring)).status, 201);
  const report = await request("/reports", doctor, { month, monitoringCount: 999, risksFound: 999 });
  assert.equal(report.status, 201);
  assert.equal(report.body.item.monitoringCount, 1);
  assert.equal(report.body.item.risksFound, 1);
  await request("/reports", doctor, { month });
  const stored = JSON.parse(await readFile(file, "utf8"));
  assert.equal(stored.monthlyReports.length, 1);
  assert.equal(stored.monthlyReports[0].versions.length, 1);
  assert.equal(stored.risks.find((item) => item.id === id).responses.length, 1);
  assert.ok(stored.notifications.some((notice) => notice.recipient === member.employeeCode));

  const quick = await request("/risks", doctor, { category: "Hand hygiene", severity: "Thấp", description: "  Short line\nMore detail" });
  assert.equal(quick.status, 201);
  assert.equal(quick.body.item.title, "Short line");
  const check = { date: `${month}-01`, area: "Hand hygiene", sampleSize: 5 };
  assert.equal((await request("/monitorings", doctor, { ...check, compliant: 5 })).status, 201);
  assert.equal((await request("/monitorings", doctor, { ...check, compliant: 4 })).status, 400);

  const ksnk = (await request("/auth/demo-session", null, { persona: "ksnk" })).body.token;
  const people = (await request("/module/context", ksnk)).body.people;
  assert.equal(people.filter((person) => person.employeeCode === admin.employeeCode).length, 1,
    "one employee with multiple role accounts appears only once in the person picker");
  assert.equal((await request("/module/context", doctor)).body.people.some((person) => person.employeeCode === admin.employeeCode), false);
  const range = `from=${month}-01&to=${vietnamDate()}`;
  const doctorWork = (await request(`/module/overview?${range}`, doctor)).body.work;
  const doctorNotices = (await request(`/module/overview?${range}`, doctor)).body.notices;
  assert.equal(doctorNotices.some((notice) => notice.id === "due-late-waiting"), false);
  assert.equal(doctorNotices.some((notice) => notice.id === "report-COLLEAGUE"), false);
  assert.equal(doctorWork.ownReportRequired, true);
  assert.equal(doctorWork.overdue, 1, "issues waiting for KSNK confirmation are not overdue for the department");
  assert.ok(doctorWork.reportMissing.some((person) => person.fullName === member.fullName));
  assert.equal((await request(`/module/overview?${range}`, ksnk)).body.work.ownReportRequired, false);

  assert.equal((await request("/module/settings", doctor, { reportDay: 10 }, "PUT")).status, 403);
  assert.equal((await request("/module/settings", ksnk, { reportDay: 29 }, "PUT")).status, 400);
  assert.equal((await request("/module/settings", ksnk, { reportDay: 10 }, "PUT")).status, 200);
  assert.equal((await request("/module/context", doctor)).body.reportDay, 10);
  assert.match((await request(`/module/overview?${range}`, doctor)).body.work.reportDue, /-10$/);

  assert.equal((await request("/module/members/doctor", doctor, { active: false }, "PATCH")).status, 403);
  assert.equal((await request("/module/members/doctor", ksnk, { active: "no" }, "PATCH")).status, 400);
  assert.equal((await request("/module/members/missing", ksnk, { active: false }, "PATCH")).status, 404);
  assert.equal((await request("/module/members/ksnk", ksnk, { active: false }, "PATCH")).status, 400);
  assert.equal((await request("/module/members/doctor", ksnk, { active: false }, "PATCH")).status, 200);
  assert.equal((await request("/module/context", doctor)).body.canRecord, false);
  assert.equal((await request("/risks", doctor, form)).status, 403);
  assert.equal((await request("/module/members/doctor", ksnk, { active: true }, "PATCH")).status, 200);
  assert.equal((await request("/module/context", doctor)).body.canRecord, true);
});
