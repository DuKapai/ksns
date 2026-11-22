import { test } from "node:test";
import assert from "node:assert/strict";
const values = new Map();
globalThis.localStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value))
};
const { dispatch } = await import("../src/demo-api.generated.mjs");
const request = (method, path, body, token) => dispatch(method, `/api${path}`, body, token ? { authorization: `Bearer ${token}` } : {});
const login = async (username, portal) => {
  const result = await request("POST", "/auth/login", { username, password: "Demo@123", portal });
  assert.equal(result.status, 200);
  return result.body.token;
};

test("browser API persists demo workflows and enforces demo roles", async () => {
  assert.equal((await request("GET", "/doctor/config")).status, 401);
  assert.equal((await request("POST", "/auth/login", { username: "bs.nguyen", password: "wrong" })).status, 401);
  assert.equal((await request("POST", "/auth/login", { username: "bs.nguyen", password: "Demo@123", portal: "ksnk" })).status, 403);
  const doctor = await login("bs.nguyen", "member");
  const nurse = await login("dd.tran", "member");
  const admin = await login("ksnk.admin", "ksnk");
  assert.equal((await request("GET", "/dashboard", null, doctor)).status, 200);
  assert.equal((await request("GET", "/departments", null, admin)).body.items.length > 0, true);
  assert.equal((await request("GET", "/doctor/config", null, doctor)).status, 200);
  assert.equal((await request("GET", "/doctor/summary?month=2026-04", null, nurse)).status, 403);

  const date = "2026-04-03";
  const daily = { date, bundles: Object.fromEntries(["VAP", "CAUTI", "SSI", "CLABSI"].map(key => [key, { eligible: 4, compliant: 3 }])) };
  assert.equal((await request("PUT", "/surveillance/daily", daily, nurse)).status, 403);
  assert.equal((await request("PUT", "/surveillance/daily", daily, doctor)).status, 200);
  const observation = { date, period: "Hằng tuần", topic: "Demo", method: "Quan sát", location: "Khoa A", sampleSize: 1,
    criteria: [{ label: "Tiêu chí", result: "Đạt" }], summary: "", followUp: "", notifiedTo: "", notifiedAt: "" };
  assert.equal((await request("POST", "/doctor/observations", observation, doctor)).status, 201);
  const risk = { title: "Demo", category: "Demo", severity: "Cao", description: "Demo" };
  const createdRisk = await request("POST", "/risks", risk, doctor);
  assert.equal(createdRisk.status, 201);
  assert.equal((await request("PATCH", `/risks/${createdRisk.body.item.id}`, { action: "accept" }, admin)).status, 200);
  const report = { month: "2026-04", activities: "Demo", incidents: "", recommendations: "" };
  const reports = await Promise.all([
    request("POST", "/doctor/reports", report, doctor),
    request("POST", "/doctor/reports", report, doctor)
  ]);
  assert.deepEqual(reports.map(item => item.status).sort(), [201, 409]);
  const caseBody = { detectedAt: `${date}T10:15`, type: "Nghi ngờ NKBV", location: "Buồng demo", findings: "Demo",
    initialAction: "Báo trực tiếp", isolationStatus: "Đang bố trí", isolationType: "Theo chỉ định",
    notifiedTo: "Lãnh đạo khoa", notifiedAt: `${date}T10:20` };
  assert.equal((await request("POST", "/surveillance/cases", caseBody, nurse)).status, 201);

  const reloaded = await import("../src/demo-api.generated.mjs?reload");
  const summary = await reloaded.dispatch("GET", "/api/doctor/summary?month=2026-04", null, { authorization: `Bearer ${doctor}` });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.summary.monitoringCount, 1);
  const cases = await reloaded.dispatch("GET", "/api/surveillance/cases?from=2026-04-01&to=2026-04-30", null, { authorization: `Bearer ${admin}` });
  assert.equal(cases.body.items.length, 1);
  assert.equal((await request("GET", "/unknown", null, doctor)).status, 404);
  const setItem = localStorage.setItem;
  localStorage.setItem = () => { throw new Error("storage full"); };
  assert.equal((await request("PUT", "/surveillance/daily", daily, doctor)).status, 500);
  localStorage.setItem = setItem;
  assert.equal((await request("PUT", "/surveillance/daily", daily, doctor)).status, 200);
});

test("Pages opens the simple module without login and persists the three-role workflow", async () => {
  const tokens = {};
  for (const persona of ["doctor", "staff", "ksnk"]) {
    const session = await request("POST", "/auth/demo-session", { persona });
    assert.equal(session.status, 200);
    assert.equal(session.body.demo, true);
    tokens[persona] = session.body.token;
  }
  const { doctor, staff, ksnk } = tokens;
  const context = await request("GET", "/module/context", null, doctor);
  assert.equal(context.status, 200);
  assert.equal(context.body.canRecord, true);
  assert.ok(context.body.people.some(person => person.employeeCode === "DEMO-NV-001"));
  assert.equal((await request("GET", "/module/context", null, staff)).body.canRecord, false);
  const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const monitoring = { date: today, area: "Hand hygiene", sampleSize: 10, compliant: 8, findings: "Demo finding" };
  assert.equal((await request("POST", "/monitorings", monitoring, doctor)).status, 201);
  const form = { category: "Hand hygiene", severity: "Cao", description: "Pages demo issue", subjectEmployeeCode: "DEMO-NV-001" };
  assert.equal((await request("POST", "/risks", form, staff)).status, 403);
  const created = await request("POST", "/risks", form, doctor);
  assert.equal(created.status, 201);
  const id = created.body.item.id;
  const overview = await request("GET", `/module/overview?from=${month}-01&to=${today}`, null, staff);
  assert.ok(overview.body.notices.some(notice => notice.riskId === id));
  assert.equal((await request("POST", `/module/issues/${id}/responses`,
    { explanation: "Demo response", evidence: "Demo reference" }, staff)).status, 201);
  assert.equal((await request("PATCH", `/risks/${id}`, { action: "accept" }, ksnk)).status, 200);
  assert.equal((await request("PATCH", `/risks/${id}`, { action: "correct", correction: "Demo correction" }, doctor)).status, 200);
  assert.equal((await request("PATCH", `/risks/${id}`, { action: "verify", passed: true, verification: "Passed" }, ksnk)).status, 200);
  const summary = await request("GET", `/module/report-summary?month=${month}`, null, doctor);
  assert.equal(summary.status, 200);
  const report = await request("POST", "/reports", { month }, doctor);
  assert.equal(report.status, 201);
  for (const metric of ["monitoringCount", "risksFound", "risksClosed"]) {
    assert.equal(report.body.item[metric], summary.body.summary[metric]);
  }
  const reloaded = await import("../src/demo-api.generated.mjs?simple-module-reload");
  const issues = await reloaded.dispatch("GET", "/api/module/issues", null, { authorization: `Bearer ${staff}` });
  const saved = issues.body.items.find(issue => issue.id === id);
  assert.equal(saved.status, "Đã đóng");
  assert.equal(saved.responses.length, 1);
});
