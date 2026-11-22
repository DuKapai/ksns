import { Router } from "express";
import { readStore, updateStore, makeId } from "./store.js";
import { validDate, validDateTime, validMonth } from "./validation.js";
import { requireRecorder } from "./module.js";

const defaults = { dailyMinutes: 15, weeklyMinutes: 30, monthlyWeeklyTarget: 4, reportDay: 5 };
const periods = ["Hằng ngày", "Hằng tuần", "Đột xuất"];
const results = ["Đạt", "Chưa đạt", "Không áp dụng", "Không đánh giá được"];
const text = (value) => typeof value === "string";
const filled = (value) => text(value) && value.trim().length > 0;
const optionalText = (value) => value === undefined || text(value);

function riskMonth(value) {
  if (!validDateTime(value)) return "";
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) return value.slice(0, 7);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit",
  }).formatToParts(new Date(value));
  return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}`;
}

function summaryFor(data, doctor, month) {
  const identifiable = filled(doctor.employeeCode) && filled(doctor.departmentCode);
  const observations = (data.doctorObservations || []).filter((item) =>
    identifiable && item.employeeCode === doctor.employeeCode &&
    item.departmentCode === doctor.departmentCode &&
    validDate(item.date) && item.date.slice(0, 7) === month
  );
  const risks = (data.risks || []).filter((risk) =>
    identifiable && risk.departmentCode === doctor.departmentCode &&
    (risk.employeeCode ? risk.employeeCode === doctor.employeeCode :
      filled(doctor.fullName) && risk.reporter === doctor.fullName) &&
    riskMonth(risk.createdAt) === month
  );
  const criteria = observations.flatMap((item) => Array.isArray(item.criteria) ? item.criteria : []);
  const criteriaMet = criteria.filter((item) => item?.result === "Đạt").length;
  const criteriaNotMet = criteria.filter((item) => item?.result === "Chưa đạt").length;
  const closedRiskCount = risks.filter((risk) => risk.status === "Đã đóng").length;
  return {
    month,
    monitoringCount: observations.length,
    weeklyCount: observations.filter((item) => item.period === "Hằng tuần").length,
    sampleSize: observations.reduce((sum, item) =>
      sum + (Number.isSafeInteger(item.sampleSize) && item.sampleSize >= 0 ? item.sampleSize : 0), 0),
    criteriaApplicable: criteriaMet + criteriaNotMet,
    criteriaMet,
    criteriaNotMet,
    criteriaUnknown: criteria.filter((item) => item?.result === "Không đánh giá được").length,
    riskCount: risks.length,
    openRiskCount: risks.length - closedRiskCount,
    closedRiskCount,
  };
}

function validIdentity(user) {
  return filled(user.employeeCode) && filled(user.fullName) && filled(user.departmentCode) && filled(user.departmentName);
}

export function doctorRouter({ currentUser, hasRole, sameDepartmentOrAdmin, audit }) {
  const router = Router();
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const doctorOnly = hasRole("MEMBER_DOCTOR");
  const leaders = hasRole("KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY");
  const network = hasRole("KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY", "NETWORK_SECRETARY");
  const identity = (req, res, next) => {
    if (!validIdentity(req.user)) return res.status(400).json({ message: "Tài khoản thiếu mã nhân viên hoặc thông tin khoa." });
    next();
  };
  const monthQuery = (req, res, next) => {
    if (!validMonth(req.query.month)) return res.status(400).json({ message: "Tháng phải có dạng YYYY-MM hợp lệ." });
    next();
  };
  const visible = (req, item) => filled(item.departmentCode) && sameDepartmentOrAdmin(req, item.departmentCode);

  router.use(currentUser);

  router.get("/config", asyncRoute(async (_req, res) => {
    const data = await readStore();
    const config = Object.fromEntries(Object.keys(defaults).map((key) => [key, data.doctorConfig?.[key] ?? defaults[key]]));
    res.json({ config });
  }));
  router.put("/config", leaders, asyncRoute(async (req, res) => {
    const config = req.body?.config ?? req.body;
    const limits = { dailyMinutes: 480, weeklyMinutes: 480, monthlyWeeklyTarget: 31, reportDay: 28 };
    if (!config || typeof config !== "object" || Array.isArray(config) ||
        Object.entries(limits).some(([key, max]) => !Number.isInteger(config[key]) || config[key] < 1 || config[key] > max)) {
      return res.status(400).json({ message: "Cấu hình phải gồm bốn số nguyên trong giới hạn cho phép." });
    }
    const saved = await updateStore((data) => {
      data.doctorConfig = Object.fromEntries(Object.keys(limits).map((key) => [key, config[key]]));
      audit(data, req.user, "Cập nhật cấu hình bác sĩ", "doctorConfig", "doctorConfig");
      return data.doctorConfig;
    });
    res.json({ config: saved });
  }));

  router.get("/observations", asyncRoute(async (req, res) => {
    const data = await readStore();
    res.json({ items: (data.doctorObservations || []).filter((item) => visible(req, item))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))) });
  }));
  router.post("/observations", doctorOnly, requireRecorder, identity, asyncRoute(async (req, res) => {
    const b = req.body || {};
    if (!validDate(b.date) || !periods.includes(b.period) || !filled(b.topic) ||
        !filled(b.method) || !filled(b.location) || !Number.isSafeInteger(b.sampleSize) || b.sampleSize < 0 ||
        !["summary", "followUp", "notifiedTo", "notifiedAt"].every((key) => optionalText(b[key])) ||
        (b.notifiedAt && !validDateTime(b.notifiedAt)) ||
        !Array.isArray(b.criteria) || !b.criteria.length ||
        b.criteria.some((c) => !c || !filled(c.label) || !results.includes(c.result) ||
          !optionalText(c.evidence) || !optionalText(c.reason) ||
          (c.result === "Chưa đạt" && !filled(c.evidence)) ||
          (["Không áp dụng", "Không đánh giá được"].includes(c.result) && !filled(c.reason)))) {
      return res.status(400).json({ message: "Phiếu giám sát không hợp lệ: kiểm tra ngày, nội dung, mẫu và minh chứng hoặc lý do của từng tiêu chí." });
    }
    const item = await updateStore((data) => {
      data.doctorObservations ||= [];
      const id = makeId("doctorObservation");
      const record = {
        id, code: `BS-${b.date.slice(0, 4)}-${id}`,
        date: b.date, period: b.period, topic: b.topic, method: b.method, location: b.location,
        sampleSize: b.sampleSize,
        criteria: b.criteria.map((c) => ({ label: c.label, result: c.result, evidence: c.evidence || "", reason: c.reason || "" })),
        summary: b.summary || "", followUp: b.followUp || "", notifiedTo: b.notifiedTo || "", notifiedAt: b.notifiedAt || "",
        employeeCode: req.user.employeeCode, observer: req.user.fullName,
        departmentCode: req.user.departmentCode, departmentName: req.user.departmentName, createdAt: new Date().toISOString(),
      };
      data.doctorObservations.unshift(record);
      audit(data, req.user, "Tạo phiếu giám sát bác sĩ", "doctorObservation", id);
      return record;
    });
    res.status(201).json({ item });
  }));

  router.get("/summary", doctorOnly, identity, monthQuery, asyncRoute(async (req, res) => {
    res.json({ summary: summaryFor(await readStore(), req.user, req.query.month) });
  }));
  router.get("/reports", asyncRoute(async (req, res) => {
    const data = await readStore();
    res.json({ items: (data.doctorReports || []).filter((item) => visible(req, item))
      .sort((a, b) => String(b.month || "").localeCompare(String(a.month || ""))) });
  }));
  router.post("/reports", doctorOnly, requireRecorder, identity, asyncRoute(async (req, res) => {
    const b = req.body || {};
    if (!validMonth(b.month) || !["activities", "incidents", "recommendations"].every((key) => text(b[key]))) {
      return res.status(400).json({ message: "Tháng hoặc nội dung báo cáo không hợp lệ." });
    }
    const result = await updateStore((data) => {
      data.doctorReports ||= [];
      if (data.doctorReports.some((item) => item.month === b.month && item.employeeCode === req.user.employeeCode)) return null;
      const record = {
        id: makeId("doctorReport"), month: b.month, employeeCode: req.user.employeeCode,
        submittedBy: req.user.fullName, departmentCode: req.user.departmentCode, departmentName: req.user.departmentName,
        activities: b.activities, incidents: b.incidents, recommendations: b.recommendations,
        summary: summaryFor(data, req.user, b.month), createdAt: new Date().toISOString(), status: "Đã gửi",
      };
      data.doctorReports.unshift(record);
      audit(data, req.user, "Gửi báo cáo tháng bác sĩ", "doctorReport", record.id);
      return record;
    });
    if (!result) return res.status(409).json({ message: "Bác sĩ đã gửi báo cáo tháng này." });
    res.status(201).json({ item: result });
  }));
  router.post("/assessments", leaders, asyncRoute(async (req, res) => {
    const b = req.body || {};
    if (!validMonth(b.month) || !filled(b.employeeCode) || !filled(b.departmentCode) ||
        !["hasEvidence", "riskFollowed", "verified"].every((key) => typeof b[key] === "boolean") ||
        !filled(b.evidence) || !filled(b.note)) {
      return res.status(400).json({ message: "Cần chọn bác sĩ, kỳ, kết quả kiểm tra và ghi rõ minh chứng, nhận xét." });
    }
    const result = await updateStore((data) => {
      const member = (data.members || []).find((item) => item.active === true && item.memberType === "Bác sĩ" &&
        item.employeeCode === b.employeeCode && item.departmentCode === b.departmentCode);
      if (!member) return null;
      const summary = summaryFor(data, member, b.month);
      const target = data.doctorConfig?.monthlyWeeklyTarget ?? defaults.monthlyWeeklyTarget;
      const reportSubmitted = (data.doctorReports || []).some((report) =>
        report.month === b.month && report.employeeCode === member.employeeCode && report.departmentCode === member.departmentCode);
      const assessment = {
        id: makeId("doctorAssessment"), month: b.month, employeeCode: member.employeeCode,
        departmentCode: member.departmentCode, weeklyCount: summary.weeklyCount, weeklyTarget: target,
        reportSubmitted, hasEvidence: b.hasEvidence, riskFollowed: b.riskFollowed, verified: b.verified,
        evidence: b.evidence.trim(), note: b.note.trim(), reviewer: req.user.fullName, createdAt: new Date().toISOString(),
        status: summary.weeklyCount >= target && reportSubmitted && b.hasEvidence && b.riskFollowed && b.verified
          ? "Đạt tiêu chí demo" : "Chưa đạt tiêu chí demo",
      };
      data.doctorAssessments ||= [];
      data.doctorAssessments.unshift(assessment);
      audit(data, req.user, "Đánh giá bác sĩ mạng lưới", "doctorAssessment", assessment.id);
      return assessment;
    });
    if (!result) return res.status(404).json({ message: "Không tìm thấy bác sĩ hoạt động tại khoa." });
    res.status(201).json({ item: result });
  }));
  router.get("/tracker", network, monthQuery, asyncRoute(async (req, res) => {
    const data = await readStore();
    const month = req.query.month;
    const items = (data.members || []).filter((member) => member.active === true &&
      member.memberType === "Bác sĩ").map((member) => {
      const summary = summaryFor(data, member, month);
      return {
        employeeCode: member.employeeCode, fullName: member.fullName,
        departmentCode: member.departmentCode, departmentName: member.departmentName,
        monitoringCount: summary.monitoringCount, weeklyCount: summary.weeklyCount,
        riskCount: summary.riskCount, openRiskCount: summary.openRiskCount, closedRiskCount: summary.closedRiskCount,
        reportStatus: (data.doctorReports || []).some((report) =>
          filled(member.employeeCode) && filled(member.departmentCode) &&
          report.month === month && report.employeeCode === member.employeeCode &&
          report.departmentCode === member.departmentCode) ? "Đã gửi" : "Chưa gửi",
        assessment: (data.doctorAssessments || []).find((item) => item.month === month &&
          item.employeeCode === member.employeeCode && item.departmentCode === member.departmentCode) || null,
      };
    });
    res.json({ month, items });
  }));
  return router;
}
