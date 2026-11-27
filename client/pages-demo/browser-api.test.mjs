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
  const accounts = await request("GET", "/auth/demo-accounts");
  assert.deepEqual(accounts.body.accounts.map(account => account.username), ["bs.nguyen", "dd.tran", "ksnk.admin"]);
  assert.ok(accounts.body.accounts.every(account => account.password === "Demo@123"));
  assert.equal((await request("GET", "/doctor/config")).status, 401);
  assert.equal((await request("POST", "/auth/login", { username: "bs.nguyen", password: "wrong" })).status, 401);
  assert.equal((await request("POST", "/auth/login", { username: "bs.nguyen", password: "Demo@123", portal: "ksnk" })).status, 403);
  const doctor = await login("bs.nguyen", "member");
  const nurse = await login("dd.tran", "member");
  const admin = await login("ksnk.admin", "ksnk");
  assert.equal((await request("GET", "/dashboard", null, doctor)).status, 403);
  assert.equal((await request("GET", "/dashboard", null, admin)).status, 200);
  assert.equal((await request("GET", "/module/context", null, doctor)).body.canRecord, true);
  assert.equal((await request("GET", "/module/context", null, nurse)).body.canRecord, true);
  assert.equal((await request("GET", "/module/context", null, admin)).body.seesAll, true);
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
  const overviewPath = "/module/overview?from=2026-04-01&to=2026-04-30";
  const overview = await request("GET", overviewPath, null, admin);
  assert.equal(overview.status, 200);
  assert.ok(overview.body.notices.some(item => item.text.includes("Nguyễn Minh An") && item.text.includes("báo cáo")));
  assert.equal(overview.body.summary.departmentReportCounts.find(item =>
    item.departmentCode === "DEMO-A" && item.type === "Giám sát bác sĩ").count, 1);
  assert.equal(overview.body.summary.departmentReportCounts.find(item =>
    item.departmentCode === "DEMO-A" && item.type === "Báo cáo hằng ngày").count, 1);
  const nurseOverview = await request("GET", overviewPath, null, nurse);
  assert.equal(nurseOverview.body.summary.monitoringCount, 0);
  const caseBody = { detectedAt: `${date}T10:15`, type: "Nghi ngờ NKBV", location: "Buồng demo", findings: "Demo",
    initialAction: "Báo trực tiếp", isolationStatus: "Đang bố trí", isolationType: "Theo chỉ định",
    notifiedTo: "Lãnh đạo khoa", notifiedAt: `${date}T10:20` };
  assert.equal((await request("POST", "/surveillance/cases", caseBody, nurse)).status, 201);
  const casesPath = "/surveillance/cases?from=2026-04-01&to=2026-04-30";
  assert.equal((await request("GET", casesPath, null, doctor)).body.items.length, 0);
  assert.equal((await request("GET", casesPath, null, nurse)).body.items.length, 1);

  const reloaded = await import("../src/demo-api.generated.mjs?reload");
  const summary = await reloaded.dispatch("GET", "/api/doctor/summary?month=2026-04", null, { authorization: `Bearer ${doctor}` });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.summary.monitoringCount, 1);
  const cases = await reloaded.dispatch("GET", `/api${casesPath}`, null, { authorization: `Bearer ${admin}` });
  assert.equal(cases.body.items.length, 1);
  assert.equal((await request("GET", "/unknown", null, doctor)).status, 404);
  const setItem = localStorage.setItem;
  localStorage.setItem = () => { throw new Error("storage full"); };
  assert.equal((await request("PUT", "/surveillance/daily", daily, doctor)).status, 500);
  localStorage.setItem = setItem;
  assert.equal((await request("PUT", "/surveillance/daily", daily, doctor)).status, 200);
});
