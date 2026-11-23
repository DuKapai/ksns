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
const nurse = { ...member, id: "nurse", username: "nurse", employeeCode: "DEMO-DD-001",
  fullName: "Nurse demo", roles: ["MEMBER_NURSE"] };
const colleague = { ...nurse, id: "colleague", username: "colleague", employeeCode: "COLLEAGUE",
  fullName: "Colleague", departmentCode: "A", departmentName: "Ward A" };
const genericMember = { ...member, id: "generic-member", username: "generic-member", employeeCode: "TECH-001",
  fullName: "Technician demo", position: "Kỹ thuật viên", roles: ["NETWORK_MEMBER"] };
const departmentHead = { ...member, id: "department-head", username: "department-head", employeeCode: "HEAD-001",
  fullName: "Department head", roles: ["DEPARTMENT_HEAD"] };
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
  assert.equal(summary.departmentCompliance.find((row) => row.departmentCode === "A" && row.area === "Hand hygiene").total, 100);
  const allDepartments = summarize(data, { ...member, roles: ["KSNK_ADMIN"] }, "2024-02-01", "2024-02-29");
  assert.equal(allDepartments.departmentCompliance.find((row) => row.departmentCode === "B" && row.area === "Hand hygiene").rate, 100);
  assert.equal(summarize(data, member, "2023-01-01", "2023-01-31").closureRate, null);
});

test("simplified module persists notices, restricts responses and automatically confirms reports", async (t) => {
  const file = path.join(serverDir, "test", `module-${randomUUID()}.json`);
  await writeFile(file, JSON.stringify({
    users: [member, nurse, colleague, genericMember, departmentHead, staff, other, admin,
      { ...admin, id: "secretary", username: "secretary", roles: ["NETWORK_SECRETARY"] }],
    members: [{ ...member, memberType: "Bác sĩ" }, { ...nurse, memberType: "Điều dưỡng" }, { ...admin, memberType: "KSNK" },
      { ...colleague, memberType: "Điều dưỡng", active: true }, { ...genericMember, memberType: "Kỹ thuật y", active: true }],
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
    env: { ...process.env, DATA_FILE: file, PORT: String(port), CLIENT_ORIGIN: "http://localhost:4200",
      DEMO_AUTO_LOGIN: "true", NODE_ENV: "test" },
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
  const corsPreflight = await fetch(`${base}/auth/demo-session`, { method: "OPTIONS", headers: {
    origin: "http://127.0.0.1:4200", "access-control-request-method": "POST",
    "access-control-request-headers": "content-type",
  } });
  assert.equal(corsPreflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:4200");
  const localhostPreflight = await fetch(`${base}/auth/demo-session`, { method: "OPTIONS", headers: {
    origin: "http://localhost:4200", "access-control-request-method": "POST",
    "access-control-request-headers": "content-type",
  } });
  assert.equal(localhostPreflight.headers.get("access-control-allow-origin"), "http://localhost:4200");
  async function request(route, token, body, method = body ? "POST" : "GET") {
    const result = await fetch(base + route, { method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: result.status, body: await result.json() };
  }
  const demoDoctor = await request("/auth/demo-session", null, { persona: "doctor" });
  assert.equal(demoDoctor.body.user.employeeCode, member.employeeCode);
  assert.ok(demoDoctor.body.user.roles.includes("MEMBER_DOCTOR"));
  const doctor = demoDoctor.body.token;
  const demoMember = await request("/auth/demo-session", null, { persona: "member" });
  assert.equal(demoMember.body.user.employeeCode, nurse.employeeCode);
  assert.ok(demoMember.body.user.roles.includes("MEMBER_NURSE"));
  const demoNurse = await request("/auth/demo-session", null, { persona: "nurse" });
  assert.equal(demoNurse.body.user.employeeCode, nurse.employeeCode);
  assert.equal((await request("/module/context", demoNurse.body.token)).body.canRecord, true);
  const ksnk = (await request("/auth/demo-session", null, { persona: "ksnk" })).body.token;
  const nurseToken = (await request("/auth/login", null, { username: nurse.username, password: "test" })).body.token;
  const colleagueToken = (await request("/auth/login", null, { username: colleague.username, password: "test" })).body.token;
  const genericTokenResponse = await request("/auth/login", null, {
    username: genericMember.username, password: "test", portal: "member",
  });
  assert.equal(genericTokenResponse.status, 200);
  const genericToken = genericTokenResponse.body.token;
  assert.equal((await request("/module/context", genericToken)).body.canRecord, true);
  const departmentHeadToken = (await request("/auth/login", null, {
    username: departmentHead.username, password: "test",
  })).body.token;
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
  const nursingObservation = { date: vietnamDate(), area: "Vệ sinh tay", observedRole: "Điều dưỡng",
    observedPerson: "Nurse observed", observationMoment: "Trước tiếp xúc", practiceResult: "Đạt",
    sampleSize: 1, compliant: 1 };
  assert.equal((await request("/monitorings", nurseToken, nursingObservation)).status, 201);
  const noHandHygiene = await request("/monitorings", nurseToken, {
    ...nursingObservation, practiceResult: "Không VST", compliant: 0, findings: "Không thực hiện vệ sinh tay",
  });
  assert.equal(noHandHygiene.status, 201);
  assert.equal(noHandHygiene.body.item.notPerformed, 1);
  assert.equal((await request("/monitorings", nurseToken, {
    ...nursingObservation, area: "Sử dụng phòng hộ cá nhân", practiceResult: "Không VST", compliant: 0,
  })).status, 400);
  assert.equal((await request("/monitorings", nurseToken, { ...nursingObservation, compliant: 0 })).status, 400);
  assert.equal((await request("/monitorings", nurseToken, { ...nursingObservation,
    area: "Phân loại chất thải", wasteType: "" })).status, 400);
  const report = await request("/reports", doctor, { month, monitoringCount: 999, risksFound: 999 });
  assert.equal(report.status, 201);
  assert.equal(report.body.item.monitoringCount, 1);
  assert.equal(report.body.item.risksFound, 1);
  assert.equal(report.body.item.memberType, "Bác sĩ");
  const reportList = await request("/reports", doctor);
  assert.equal(reportList.body.items.find((item) => item.id === report.body.item.id).memberType, "Bác sĩ");
  assert.equal(reportList.body.items.find((item) => item.id === report.body.item.id).source, "doctor");
  const incompleteReadiness = await request(`/module/report-readiness?from=${month}&to=${month}`, ksnk);
  assert.equal(incompleteReadiness.status, 200);
  assert.equal(incompleteReadiness.body.complete, false);
  assert.equal(incompleteReadiness.body.doctors.submitted, 1);
  assert.equal(incompleteReadiness.body.members.submitted, 0);
  assert.ok(incompleteReadiness.body.departments.some((department) => department.departmentCode === "A"));
  assert.equal((await request(`/module/report-readiness?from=${month}&to=${month}`, doctor)).status, 403);
  assert.equal((await request("/module/report-readiness?from=2024-13&to=2025-01", ksnk)).status, 400);
  await request("/reports", doctor, { month });
  assert.equal((await request("/reports", nurseToken, { month })).status, 201);
  assert.equal((await request("/reports", colleagueToken, { month })).status, 201);
  assert.equal((await request("/reports", genericToken, { month })).status, 201);
  const completeReadiness = await request(`/module/report-readiness?from=${month}&to=${month}`, ksnk);
  assert.equal(completeReadiness.body.complete, true);
  assert.equal(completeReadiness.body.rate, 100);
  const week = { from: "2024-01-01", to: "2024-01-07" };
  assert.equal((await request("/module/weekly-reports", employee)).status, 403);
  assert.equal((await request(`/module/weekly-reports?from=${week.from}&to=2024-01-08`, ksnk)).status, 400);
  assert.equal((await request("/module/weekly-reports", doctor, { ...week, activities: "" })).status, 400);
  const doctorWeekly = await request("/module/weekly-reports", doctor, {
    ...week, submittedBy: "Tên giả", memberType: "Điều dưỡng", activities: "Giám sát nhiễm khuẩn",
  });
  assert.equal(doctorWeekly.status, 201);
  assert.equal(doctorWeekly.body.item.submittedBy, member.fullName);
  assert.equal(doctorWeekly.body.item.memberType, "Bác sĩ");
  assert.equal((await request(`/module/weekly-reports?from=${week.from}&to=${week.to}`, doctor)).body.readiness, null);
  assert.equal((await request(`/module/weekly-reports?from=${week.from}&to=${week.to}`, doctor)).body.items.length, 1);
  assert.equal((await request("/module/weekly-reports", nurseToken, {
    ...week, activities: "Thực hiện vệ sinh tay",
  })).status, 201);
  const partialWeekly = await request(`/module/weekly-reports?from=${week.from}&to=${week.to}`, ksnk);
  assert.equal(partialWeekly.body.readiness.doctors.submitted, 1);
  assert.equal(partialWeekly.body.readiness.members.submitted, 1);
  assert.equal(partialWeekly.body.readiness.complete, false);
  assert.ok(partialWeekly.body.readiness.missing.some((item) => item.fullName === colleague.fullName));
  assert.ok(partialWeekly.body.readiness.missing.some((item) => item.fullName === genericMember.fullName));
  assert.equal((await request("/module/weekly-reports", colleagueToken, {
    ...week, activities: "Tổng hợp hoạt động khoa",
  })).status, 201);
  const secondPartialWeekly = await request(`/module/weekly-reports?from=${week.from}&to=${week.to}`, ksnk);
  assert.equal(secondPartialWeekly.body.readiness.members.submitted, 2);
  assert.equal(secondPartialWeekly.body.readiness.complete, false);
  const genericWeekly = await request("/module/weekly-reports", genericToken, {
    ...week, activities: "Kiểm tra thiết bị",
  });
  assert.equal(genericWeekly.status, 201);
  assert.equal(genericWeekly.body.item.memberType, "Kỹ thuật y");
  const completeWeekly = await request(`/module/weekly-reports?from=${week.from}&to=${week.to}`, ksnk);
  assert.equal(completeWeekly.body.readiness.complete, true);
  assert.equal(completeWeekly.body.readiness.rate, 100);
  assert.equal(completeWeekly.body.items.length, 4);
  assert.equal(completeWeekly.body.summaries.all.monitoringCount, 0);
  const updatedWeekly = await request("/module/weekly-reports", doctor, {
    ...week, activities: "Cập nhật hoạt động",
  });
  assert.equal(updatedWeekly.body.item.id, doctorWeekly.body.item.id);
  assert.equal(JSON.parse(await readFile(file, "utf8")).weeklyReports
    .find((item) => item.employeeCode === member.employeeCode).versions.length, 1);
  const caseReport = {
    type: "hospital-infection", date: vietnamDate(), patientName: "Demo patient",
    patientBirthYear: 1990, patientGender: "Nam", patientAddress: "Địa chỉ giả", admissionDate: vietnamDate(),
    diagnosisName: "Nhiễm khuẩn tiết niệu", infectionType: "urinary",
    interventionNeeded: "ksnk", interventionDetails: "Phối hợp với Khoa KSNK",
  };
  assert.equal((await request("/module/case-reports", employee, caseReport)).status, 403);
  assert.equal((await request(`/module/case-reports?from=${month}-01&to=${vietnamDate()}`, nurseToken)).status, 403);
  assert.equal((await request("/module/case-reports", doctor, { ...caseReport, interventionDetails: "" })).status, 400);
  assert.equal((await request("/module/case-reports", doctor, { ...caseReport, patientBirthYear: 9999 })).status, 400);
  assert.equal((await request("/module/case-reports", doctor, { ...caseReport, patientGender: "invalid" })).status, 400);
  assert.equal((await request("/module/case-reports", doctor, {
    ...caseReport, admissionDate: "2999-01-01",
  })).status, 400);
  assert.equal((await request("/module/case-reports", doctor, {
    ...caseReport, type: "transmission-disease", diagnosisName: "Bệnh truyền nhiễm",
    isolationStartDate: "2024-01-03", isolationEndDate: "2024-01-02",
  })).status, 400);
  const savedCase = await request("/module/case-reports", doctor, { ...caseReport, doctor: "Tên giả", departmentCode: "FAKE" });
  assert.equal(savedCase.status, 201);
  assert.equal(savedCase.body.item.doctor, member.fullName);
  assert.equal(savedCase.body.item.departmentCode, member.departmentCode);
  assert.equal(savedCase.body.item.patientBirthYear, 1990);
  assert.equal(savedCase.body.item.patientGender, "Nam");
  assert.equal(savedCase.body.item.patientAddress, "Địa chỉ giả");
  assert.equal(savedCase.body.item.admissionDate, vietnamDate());
  assert.equal((await request(`/module/case-reports?from=${month}-01&to=${vietnamDate()}`, doctor)).body.summary.interventionStats
    .find((item) => item.value === "ksnk").rate, 100);
  const transmissionCase = await request("/module/case-reports", doctor, {
    type: "transmission-disease", date: vietnamDate(), diagnosisName: "Bệnh truyền nhiễm demo",
    caseClassification: "suspected", outcome: "admitted", isolationStartDate: vietnamDate(),
    interventionNeeded: "dept", interventionDetails: "Theo dõi và điều trị tại khoa",
  });
  assert.equal(transmissionCase.status, 201);
  const caseSummary = (await request(`/module/case-reports?from=${month}-01&to=${vietnamDate()}`, doctor)).body.summary;
  assert.equal(caseSummary.transmissionByDisease[0].suspected, 1);
  assert.equal(caseSummary.transmissionByDisease[0].admitted, 1);
  assert.equal(caseSummary.transmissionByDisease[0].suspectedRate, 100);
  assert.equal(caseSummary.transmissionByDisease[0].admittedRate, 100);
  assert.equal((await request("/module/case-reports?from=2024-02-30&to=2024-03-01", doctor)).status, 400);
  assert.equal((await request("/doctor/observations", doctor, {
    date: vietnamDate(), period: "Hằng tuần", topic: "01 · Rà soát nhiễm khuẩn bệnh viện",
    method: "Rà soát hồ sơ", location: "Ward A", sampleSize: 2,
    criteria: [{ label: "Tiêu chí đạt", result: "Đạt" },
      { label: "Tiêu chí chưa đạt", result: "Chưa đạt", evidence: "Thiếu minh chứng" }],
  })).status, 201);
  assert.equal((await request("/surveillance/daily", doctor, {
    date: vietnamDate(), bundles: {
      VAP: { eligible: 4, compliant: 3 }, CAUTI: { eligible: 0, compliant: 0 },
      SSI: { eligible: 0, compliant: 0 }, CLABSI: { eligible: 0, compliant: 0 },
    },
  }, "PUT")).status, 200);
  assert.equal((await request("/surveillance/cases", nurseToken, {
    detectedAt: `${vietnamDate()}T10:00:00+07:00`, type: "Nghi ngờ NKBV", location: "Ward A",
    findings: "Dấu hiệu cần đánh giá", initialAction: "Áp dụng phòng ngừa chuẩn",
    isolationStatus: "Đang bố trí", isolationType: "Tiếp xúc",
  })).status, 201);
  assert.equal((await request("/module/aggregate-report", nurseToken, {
    from: `${month}-01`, to: vietnamDate(), group: "all", issueStatus: "all", types: ["monitorings"],
  })).status, 403);
  assert.equal((await request("/module/aggregate-report", doctor, {
    from: `${month}-01`, to: vietnamDate(), group: "all", issueStatus: "all", types: ["caseReports"],
  })).status, 403);
  assert.equal((await request("/module/aggregate-report", ksnk, {
    from: `${month}-01`, to: vietnamDate(), group: "all", issueStatus: "all", types: ["not-a-report"],
  })).status, 400);
  const aggregate = await request("/module/aggregate-report", ksnk, {
    from: `${month}-01`, to: vietnamDate(), group: "all", departmentCode: "A", issueStatus: "all",
    types: ["monitorings", "doctorObservations", "dailySurveillance", "surveillanceCases", "risks",
      "caseReports", "weeklyReports", "monthlyReports"],
    includeDetails: true,
  });
  assert.equal(aggregate.status, 200);
  assert.ok(aggregate.body.counts.monitorings >= 3);
  assert.equal(aggregate.body.counts.doctorObservations, 1);
  assert.equal(aggregate.body.counts.dailySurveillance, 1);
  assert.equal(aggregate.body.counts.surveillanceCases, 1);
  assert.equal(aggregate.body.counts.caseReports, 2);
  const doctorObservationSheet = aggregate.body.sheets.find((sheet) => sheet.name === "Giám sát bác sĩ");
  assert.equal(doctorObservationSheet.rows[1][4], 1);
  assert.equal(doctorObservationSheet.rows[1][5], 1);
  assert.equal(doctorObservationSheet.rows[1][8], 50);
  const bundleSheet = aggregate.body.sheets.find((sheet) => sheet.name === "Gói phòng ngừa hằng ngày");
  assert.equal(bundleSheet.rows.find((row) => row[1] === "Viêm phổi liên quan thở máy")[6], 75);
  const caseDetailSheet = aggregate.body.sheets.find((sheet) => sheet.name === "Chi tiết ca bệnh");
  assert.ok(!caseDetailSheet.rows.flat().includes("Demo patient"));
  const closedOnly = await request("/module/aggregate-report", ksnk, {
    from: `${month}-01`, to: vietnamDate(), group: "all", departmentCode: "A", issueStatus: "closed",
    types: ["risks"], includeDetails: false,
  });
  assert.equal(closedOnly.body.counts.risks, 0);
  const departmentHeadAggregate = await request("/module/aggregate-report", departmentHeadToken, {
    from: `${month}-01`, to: vietnamDate(), group: "all", issueStatus: "all", types: ["monitorings"],
  });
  assert.equal(departmentHeadAggregate.body.departmentCode, "A");
  assert.equal((await request("/module/aggregate-report", departmentHeadToken, {
    from: `${month}-01`, to: vietnamDate(), group: "all", departmentCode: "B", issueStatus: "all",
    types: ["monitorings"],
  })).status, 403);
  assert.equal((await request(`/module/case-reports?from=${month}-01&to=${vietnamDate()}`, departmentHeadToken)).status, 403);
  assert.equal((await request("/module/aggregate-report", ksnk, {
    from: `${month}-01`, to: vietnamDate(), group: "all", departmentCode: "UNKNOWN", issueStatus: "all",
    types: ["risks"],
  })).status, 400);
  const stored = JSON.parse(await readFile(file, "utf8"));
  assert.equal(stored.monthlyReports.length, 4);
  assert.equal(stored.monthlyReports.find((item) => item.employeeCode === member.employeeCode).versions.length, 1);
  assert.equal(stored.monthlyReports.find((item) => item.employeeCode === nurse.employeeCode).memberType, "Điều dưỡng");
  assert.equal(stored.caseReports[0].employeeCode, member.employeeCode);
  assert.ok(stored.notifications.some((item) => item.recipient === admin.employeeCode && item.reportMonth === month));
  assert.equal(stored.risks.find((item) => item.id === id).responses.length, 1);
  assert.ok(stored.notifications.some((notice) => notice.recipient === member.employeeCode));

  const quick = await request("/risks", doctor, { category: "Hand hygiene", severity: "Thấp", description: "  Short line\nMore detail" });
  assert.equal(quick.status, 201);
  assert.equal(quick.body.item.title, "Short line");
  const check = { date: `${month}-01`, area: "Hand hygiene", sampleSize: 5 };
  assert.equal((await request("/monitorings", doctor, { ...check, compliant: 5 })).status, 201);
  assert.equal((await request("/monitorings", doctor, { ...check, compliant: 4 })).status, 400);

  const people = (await request("/module/context", ksnk)).body.people;
  assert.equal(people.filter((person) => person.employeeCode === admin.employeeCode).length, 1,
    "one employee with multiple role accounts appears only once in the person picker");
  assert.equal((await request("/module/context", doctor)).body.people.some((person) => person.employeeCode === admin.employeeCode), false);
  const range = `from=${month}-01&to=${vietnamDate()}`;
  const handSummary = (await request(`/module/overview?${range}`, ksnk)).body.summary.compliance
    .find((item) => item.name === "Vệ sinh tay");
  assert.equal(handSummary.total, 2);
  assert.equal(handSummary.met, 1);
  assert.equal(handSummary.notPerformed, 1);
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
