import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const month = new Date().toISOString().slice(0, 7);
const users = [
  { id: "d1", username: "doctor", employeeCode: "D1", fullName: "Bác sĩ Một", departmentCode: "A", departmentName: "Khoa A", roles: ["MEMBER_DOCTOR"] },
  { id: "d2", username: "other", employeeCode: "D2", fullName: "Bác sĩ Hai", departmentCode: "B", departmentName: "Khoa B", roles: ["MEMBER_DOCTOR"] },
  { id: "n", username: "nurse", employeeCode: "N1", fullName: "Điều dưỡng", departmentCode: "A", departmentName: "Khoa A", roles: ["MEMBER_NURSE"] },
  { id: "a", username: "admin", employeeCode: "A1", fullName: "Quản trị", departmentCode: "K", departmentName: "KSNK", roles: ["KSNK_ADMIN"] },
  { id: "s", username: "secretary", employeeCode: "S1", fullName: "Thư ký", departmentCode: "K", departmentName: "KSNK", roles: ["NETWORK_SECRETARY"] },
].map((user) => ({ ...user, password: "test", active: true }));

test("doctor endpoints use isolated store, enforce permissions and snapshot consistent summaries", async (t) => {
  const file = path.join(serverDir, "test", `store-${randomUUID()}.json`);
  const fixture = {
    users,
    members: [
      ...users.slice(0, 2).map((u) => ({ ...u, memberType: "Bác sĩ" })),
      { ...users[2], memberType: "Điều dưỡng" },
      { ...users[0], employeeCode: "D3", memberType: "Bác sĩ", active: false },
    ],
    risks: [
      { id: "legacy", reporter: users[0].fullName, departmentCode: "A", createdAt: `${month}-01T10:00:00Z`, status: "Đã đóng" },
      { id: "wrongDept", reporter: users[0].fullName, departmentCode: "B", createdAt: `${month}-01T10:00:00Z`, status: "Mới ghi nhận" },
      { id: "wrongCode", employeeCode: "D2", reporter: users[0].fullName, departmentCode: "A", createdAt: `${month}-01T10:00:00Z`, status: "Mới ghi nhận" },
      { id: "old", employeeCode: "D1", departmentCode: "A", createdAt: "2001-01-01T10:00:00Z", status: "Mới ghi nhận" },
      { id: "local-february", employeeCode: "D1", departmentCode: "A", createdAt: "2002-01-31T18:00:00Z", status: "Mới ghi nhận" },
      { id: "local-march", employeeCode: "D1", departmentCode: "A", createdAt: "2002-02-28T17:00:00Z", status: "Mới ghi nhận" },
    ],
    audit: [], monitorings: [], monthlyReports: [], tasks: [],
  };
  await writeFile(file, JSON.stringify(fixture));
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: serverDir, env: { ...process.env, DATA_FILE: file, PORT: String(port), JWT_SECRET: "test-secret" }, stdio: "ignore",
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await unlink(file);
  });
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; ; i++) {
    try { await fetch(`${base}/health`); break; }
    catch (error) { if (i === 100 || child.exitCode !== null) throw error; await new Promise((resolve) => setTimeout(resolve, 50)); }
  }
  async function request(route, { method = "GET", token, body } = {}) {
    const response = await fetch(base + route, {
      method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  const tokens = {};
  for (const user of users) {
    const login = await request("/auth/login", { method: "POST", body: { username: user.username, password: "test" } });
    assert.equal(login.status, 200);
    tokens[user.username] = login.body.token;
  }
  const { doctor, other, nurse, admin, secretary } = tokens;
  const get = (route, token) => request(route, { token });
  const post = (route, token, body) => request(route, { method: "POST", token, body });
  assert.equal((await get("/doctor/summary?month=2002-02", doctor)).body.summary.riskCount, 1);
  assert.equal((await get("/doctor/summary?month=2002-03", doctor)).body.summary.riskCount, 1);
  assert.equal((await get("/doctor/config")).status, 401);
  assert.deepEqual((await get("/doctor/config", doctor)).body.config, { dailyMinutes: 15, weeklyMinutes: 30, monthlyWeeklyTarget: 4, reportDay: 5 });
  const config = { dailyMinutes: 20, weeklyMinutes: 40, monthlyWeeklyTarget: 5, reportDay: 10 };
  assert.equal((await request("/doctor/config", { method: "PUT", token: secretary, body: config })).status, 403);
  assert.equal((await request("/doctor/config", { method: "PUT", token: admin, body: { ...config, reportDay: 29 } })).status, 400);
  assert.equal((await request("/doctor/config", { method: "PUT", token: admin, body: config })).status, 200);
  assert.deepEqual((await get("/doctor/config", doctor)).body.config, config);

  const observation = {
    date: `${month}-01`, period: "Hằng tuần", topic: "Demo", method: "Quan sát", location: "Khoa A", sampleSize: 4,
    criteria: [
      { label: "Một", result: "Đạt" }, { label: "Hai", result: "Chưa đạt", evidence: "Mô tả demo" },
      { label: "Ba", result: "Không áp dụng", reason: "Không liên quan" },
      { label: "Bốn", result: "Không đánh giá được", reason: "Thiếu dữ liệu" },
    ], summary: "", followUp: "", notifiedTo: "", notifiedAt: "",
  };
  assert.equal((await post("/doctor/observations", nurse, observation)).status, 403);
  assert.equal((await post("/doctor/observations", doctor, { ...observation, date: "2025-02-29" })).status, 400);
  assert.equal((await post("/doctor/observations", doctor, { ...observation, criteria: [{ label: "x", result: "Chưa đạt" }] })).status, 400);
  assert.equal((await post("/doctor/observations", doctor, { ...observation, criteria: [{ label: "x", result: "Không áp dụng", reason: " " }] })).status, 400);
  assert.equal((await post("/doctor/observations", doctor, { ...observation, sampleSize: "4" })).status, 400);
  const created = await post("/doctor/observations", doctor, observation);
  assert.equal(created.status, 201);
  assert.equal(created.body.item.employeeCode, "D1");
  assert.equal((await post("/doctor/observations", other, { ...observation, location: "Khoa B" })).status, 201);
  assert.equal((await get("/doctor/observations", nurse)).body.items.length, 0);
  assert.equal((await get("/doctor/observations", admin)).body.items.length, 2);
  assert.equal((await get("/doctor/summary?month=2025-13", doctor)).status, 400);
  assert.equal((await get(`/doctor/summary?month=${month}`, nurse)).status, 403);

  const risk = { title: "Demo", category: "Demo", severity: "Cao", description: "Demo",
    discoveredAt: `${month}-01T10:15`, location: "Khoa", source: "Quan sát",
    notificationTarget: "KSNK", notificationAt: `${month}-01T10:30:00Z`, notificationMethod: "Điện thoại" };
  assert.equal((await post("/risks", doctor, { ...risk, discoveredAt: "2025-02-29T10:00" })).status, 400);
  assert.equal((await post("/risks", doctor, { ...risk, source: 3 })).status, 400);
  const riskResult = await post("/risks", doctor, risk);
  assert.equal(riskResult.status, 201);
  assert.equal(riskResult.body.alertRequired, true);
  assert.equal(riskResult.body.item.employeeCode, "D1");
  for (const key of ["discoveredAt", "location", "source", "notificationTarget", "notificationAt", "notificationMethod"]) assert.equal(riskResult.body.item[key], risk[key]);
  assert.equal((await post("/risks", other, { title: "Demo", category: "Demo", severity: "Cao", description: "Demo" })).status, 201);
  const monitoring = { area: "Demo", method: "Quan sát", findings: "Demo",
    observedRole: "Bác sĩ", observedPerson: "Nhân viên mô phỏng", observationMoment: "Trước thủ thuật",
    practiceResult: "Đạt", procedure: "Demo", wasteType: "Demo" };
  assert.equal((await post("/monitorings", doctor, { ...monitoring, observedRole: 1 })).status, 400);
  const practice = await post("/monitorings", doctor, monitoring);
  assert.equal(practice.status, 201);
  for (const key of ["observedRole", "observedPerson", "observationMoment", "practiceResult", "procedure", "wasteType"]) assert.equal(practice.body.item[key], monitoring[key]);
  assert.equal(practice.body.item.sampleSize, 0);
  assert.equal(practice.body.item.compliant, 0);
  const numericStrings = await post("/monitorings", doctor, { ...monitoring, sampleSize: "10", compliant: "8" });
  assert.equal(numericStrings.status, 201);
  assert.equal(numericStrings.body.item.sampleSize, 10);
  assert.equal(numericStrings.body.item.compliant, 8);
  for (const values of [
    { sampleSize: -1 }, { sampleSize: 1.5 }, { sampleSize: "abc" }, { sampleSize: true },
    { sampleSize: 2, compliant: -1 }, { sampleSize: 2, compliant: 0.5 },
    { sampleSize: 2, compliant: 3 }, { compliant: 1 }, { sampleSize: 9007199254740992 },
  ]) {
    assert.equal((await post("/monitorings", doctor, { ...monitoring, ...values })).status, 400);
  }
  const summary = (await get(`/doctor/summary?month=${month}`, doctor)).body.summary;
  assert.deepEqual(summary, { month, monitoringCount: 1, weeklyCount: 1, sampleSize: 4, criteriaApplicable: 2, criteriaMet: 1, criteriaNotMet: 1, criteriaUnknown: 1, riskCount: 2, openRiskCount: 1, closedRiskCount: 1 });
  assert.equal((await get(`/doctor/tracker?month=${month}`, doctor)).status, 403);
  const report = { month, activities: "Demo", incidents: "", recommendations: "" };
  assert.equal((await post("/doctor/reports", nurse, report)).status, 403);
  assert.equal((await post("/doctor/reports", doctor, { ...report, incidents: {} })).status, 400);
  const [submitted, duplicate] = await Promise.all([post("/doctor/reports", doctor, report), post("/doctor/reports", doctor, report)]);
  assert.deepEqual([submitted.status, duplicate.status].sort(), [201, 409]);
  const saved = submitted.status === 201 ? submitted : duplicate;
  assert.deepEqual(saved.body.item.summary, summary);
  assert.equal(saved.body.item.status, "Đã gửi");
  assert.equal((await get("/doctor/reports", other)).body.items.length, 0);
  assert.equal((await get("/doctor/reports", admin)).body.items.length, 1);
  const tracker = await get(`/doctor/tracker?month=${month}`, secretary);
  assert.equal(tracker.status, 200);
  assert.equal(tracker.body.items.length, 2);
  assert.equal(tracker.body.items[0].reportStatus, "Đã gửi");
  assert.equal(tracker.body.items[0].riskCount, summary.riskCount);
  assert.equal(tracker.body.items[1].reportStatus, "Chưa gửi");
  const assessment = { month, employeeCode: "D1", departmentCode: "A", hasEvidence: true, riskFollowed: true, verified: true, evidence: "Phiếu demo", note: "Đã đối chiếu" };
  assert.equal((await post("/doctor/assessments", doctor, assessment)).status, 403);
  assert.equal((await post("/doctor/assessments", admin, { ...assessment, evidence: " " })).status, 400);
  const incomplete = await post("/doctor/assessments", admin, assessment);
  assert.equal(incomplete.body.item.status, "Chưa đạt tiêu chí demo");
  assert.equal(incomplete.body.item.weeklyTarget, 5);
  assert.equal((await request("/doctor/config", { method: "PUT", token: admin, body: { ...config, monthlyWeeklyTarget: 1 } })).status, 200);
  const complete = await post("/doctor/assessments", admin, assessment);
  assert.equal(complete.body.item.status, "Đạt tiêu chí demo");
  assert.equal((await get(`/doctor/tracker?month=${month}`, secretary)).body.items[0].assessment.id, complete.body.item.id);
  assert.equal((await post("/doctor/assessments", admin, { ...assessment, verified: false })).body.item.status, "Chưa đạt tiêu chí demo");
  const patch = (id, token, body) => request(`/risks/${id}`, { method: "PATCH", token, body });
  const riskId = riskResult.body.item.id;
  assert.equal((await patch("missing", admin, { action: "accept" })).status, 404);
  assert.equal((await patch(riskId, other, { action: "accept" })).status, 403);
  assert.equal((await patch(riskId, admin, { action: "correct", correction: "Demo" })).status, 409);
  assert.equal((await patch(riskId, admin, { action: "verify", verification: "Demo", passed: true })).status, 409);
  assert.equal((await patch(riskId, admin, { action: "accept" })).status, 200);
  assert.equal((await patch(riskId, admin, { action: "accept" })).status, 409);
  assert.equal((await patch(riskId, admin, { action: "correct", correction: "Demo", dueDate: "2025-02-29" })).status, 400);
  const correction = { action: "correct", correction: "Khắc phục demo", responsible: "Nhân viên mô phỏng", dueDate: "2024-02-29", evidence: "Minh chứng demo" };
  const firstCorrection = await patch(riskId, doctor, correction);
  assert.equal(firstCorrection.status, 200);
  assert.equal(firstCorrection.body.item.correctionHistory[0].responsible, correction.responsible);
  assert.equal(firstCorrection.body.item.correctionHistory[0].dueDate, correction.dueDate);
  assert.equal(firstCorrection.body.item.correctionHistory[0].evidence, correction.evidence);
  assert.equal((await patch(riskId, doctor, correction)).status, 409);
  assert.equal((await patch(riskId, admin, { action: "verify", verification: "Demo", passed: "false" })).status, 400);
  assert.equal((await patch(riskId, admin, { action: "verify", verification: "Demo", passed: false })).body.item.status, "Đang khắc phục");
  assert.equal((await patch(riskId, doctor, { action: "correct", correction: "Khắc phục lần hai" })).status, 200);
  const closed = await patch(riskId, admin, { action: "verify", verification: "Demo", passed: true });
  assert.equal(closed.body.item.status, "Đã đóng");
  assert.equal(closed.body.item.correctionHistory.length, 2);
  assert.equal((await patch(riskId, admin, { action: "verify", verification: "Demo", passed: true })).status, 409);
  assert.equal((await get("/doctor/reports", admin)).body.items[0].summary.openRiskCount, 1);
  assert.equal((await get(`/doctor/summary?month=${month}`, doctor)).body.summary.closedRiskCount, 2);
  assert.equal((await patch("old", admin, { action: "accept" })).status, 200);
  const legacyCorrection = await patch("old", doctor, { action: "correct", correction: "Demo cũ" });
  assert.equal(legacyCorrection.status, 200);
  assert.equal(legacyCorrection.body.item.correctionHistory.length, 1);
  const stored = JSON.parse(await readFile(file, "utf8"));
  assert.equal(stored.monitorings.length, 2);
  assert.ok(stored.audit.some((entry) => entry.entity === "doctorConfig"));
  assert.ok(stored.audit.some((entry) => entry.entity === "doctorObservation"));
  assert.ok(stored.audit.some((entry) => entry.entity === "doctorReport"));
  assert.equal(stored.risks.length, 8);
});
