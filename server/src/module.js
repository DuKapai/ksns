import { Router } from "express";
import { readStore, updateStore, makeId } from "./store.js";
import { validDate, validDateTime, validMonth } from "./validation.js";

const networkRoles = ["MEMBER_DOCTOR", "MEMBER_NURSE", "NETWORK_MEMBER", "DEPARTMENT_HEAD",
  "KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY", "NETWORK_SECRETARY"];
export const isNetworkReader = (user) => user.roles?.some((role) => [...networkRoles, "DEPARTMENT_HEAD"].includes(role));
export const seesAll = (user) => user.roles?.some((role) => ["KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY", "NETWORK_SECRETARY"].includes(role));
export const canRecord = (data, user) => user.roles?.some((role) => networkRoles.includes(role)) &&
  data.members.some((member) => member.active && member.employeeCode === user.employeeCode && member.departmentCode === user.departmentCode);
export const visibleRisk = (user, item) => Boolean(user.employeeCode) && item.subjectEmployeeCode === user.employeeCode ||
  isNetworkReader(user) && (seesAll(user) || item.departmentCode === user.departmentCode);

export function vietnamDate(value = new Date().toISOString()) {
  if (validDate(value)) return value;
  if (!validDateTime(value)) return "";
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) return value.slice(0, 10);
  return new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function responseWindow(item, now = new Date().toISOString()) {
  const month = vietnamDate(item.createdAt).slice(0, 7);
  const current = vietnamDate(now).slice(0, 7);
  return { responseMonth: month, responseOpen: Boolean(month) && month === current };
}

export async function requireRecorder(req, res, next) {
  try {
    if (!canRecord(await readStore(), req.user)) return res.status(403).json({ message: "Chỉ thành viên mạng lưới đang hoạt động được lập phiếu." });
    next();
  } catch (error) { next(error); }
}

export function requireNetworkReader(req, res, next) {
  if (!isNetworkReader(req.user)) return res.status(403).json({ message: "Tài khoản chỉ được xem và phản hồi phiếu liên quan đến mình." });
  next();
}

export const canManage = (user) => user.roles?.some((role) => ["KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY"].includes(role));

// Legacy records keep technical action names; show users one consistent vocabulary.
export function plainAction(action = "") {
  if (/phản hồi/i.test(action)) return "Gửi phản hồi";
  if (/chưa đạt/i.test(action)) return "Chưa đạt – cần xử lý tiếp";
  if (/kiểm tra lại đạt|đóng vấn đề|hoàn thành/i.test(action)) return "Xác nhận hoàn thành";
  if (/khắc phục|đã xử lý/i.test(action) && !/tiếp nhận/i.test(action)) return "Báo đã xử lý";
  if (/tiếp nhận/i.test(action)) return "Tiếp nhận xử lý";
  if (/tạo|báo cáo nguy cơ|ghi nhận vấn đề/i.test(action)) return "Ghi nhận vấn đề";
  return action;
}

const owned = (user, item, code, name) => item.departmentCode === user.departmentCode &&
  (item[code] ? item[code] === user.employeeCode : item[name] === user.fullName);
const percent = (part, total) => total ? Math.round(part / total * 1000) / 10 : null;
const during = (value, from, to) => { const date = vietnamDate(value); return date && date >= from && date <= to; };
const filled = (value) => typeof value === "string" && value.trim().length > 0;
const caseReportTypes = ["hospital-infection", "transmission-disease"];
const interventions = ["no", "dept", "ksnk", "hospital"];
const transmissionOutcomes = ["ongoing", "admitted", "discharged", "transferred", "deceased"];
const reportMemberTypes = ["Bác sĩ", "Điều dưỡng", "Hộ sinh", "Kỹ thuật y", "Lãnh đạo đơn vị"];
const weeklyReportMemberTypes = ["Bác sĩ", "Điều dưỡng", "Hộ sinh", "Kỹ thuật y", "Lãnh đạo đơn vị"];
const otherWeeklyReportMemberTypes = weeklyReportMemberTypes.filter((type) => type !== "Bác sĩ");
const canFollowReports = (user) => seesAll(user) || user.roles?.includes("DEPARTMENT_HEAD");
const validWeekRange = (from, to) => validDate(from) && validDate(to) && from <= to &&
  to <= vietnamDate() && (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 === 6;

function summarizeWeeklyGroup(data, user, from, to, memberTypes) {
  const members = data.members.filter((member) => member.active && memberTypes.includes(member.memberType) &&
    (seesAll(user) || member.departmentCode === user.departmentCode));
  const codes = new Set(members.map((member) => member.employeeCode).filter(Boolean));
  const names = new Set(members.map((member) => member.fullName));
  const scoped = {
    ...data,
    monitorings: (data.monitorings || []).filter((item) => codes.has(item.observerEmployeeCode) || names.has(item.observer)),
    doctorObservations: (data.doctorObservations || []).filter((item) => codes.has(item.employeeCode) || names.has(item.observer)),
    dailySurveillance: (data.dailySurveillance || []).filter((item) => codes.has(item.employeeCode) || names.has(item.submittedBy)),
    risks: (data.risks || []).filter((item) => codes.has(item.employeeCode) || names.has(item.reporter)),
  };
  return summarize(scoped, user, from, to);
}

export function summarize(data, user, from, to, personal = false) {
  const allowed = (item, code, name) => isNetworkReader(user) && (personal ? owned(user, item, code, name) :
    seesAll(user) || item.departmentCode === user.departmentCode);
  const monitorings = data.monitorings.filter((item) => allowed(item, "observerEmployeeCode", "observer") && during(item.date, from, to));
  const observations = (data.doctorObservations || []).filter((item) => allowed(item, "employeeCode", "observer") && during(item.date, from, to));
  const daily = (data.dailySurveillance || []).filter((item) => allowed(item, "employeeCode", "submittedBy") && during(item.date, from, to));
  const risks = data.risks.filter((item) => (personal ? owned(user, item, "employeeCode", "reporter") : visibleRisk(user, item)) && during(item.createdAt, from, to));
  const closed = risks.filter((item) => item.status === "Đã đóng").length;
  const categories = [...new Set(risks.map((item) => item.category || "Chưa phân loại"))].sort().map((name) => {
    const items = risks.filter((item) => (item.category || "Chưa phân loại") === name);
    const done = items.filter((item) => item.status === "Đã đóng").length;
    return { name, total: items.length, closed: done, share: percent(items.length, risks.length), rate: percent(done, items.length) };
  });
  // Different observation units must not be merged into one compliance denominator.
  const compliance = [...new Set(monitorings.map((item) => item.area))].map((name) => {
    const items = monitorings.filter((item) => item.area === name);
    const total = items.reduce((sum, item) => sum + item.sampleSize, 0);
    const met = items.reduce((sum, item) => sum + item.compliant, 0);
    const notPerformed = items.reduce((sum, item) => sum + (item.notPerformed || 0), 0);
    return { name, total, met, notPerformed, rate: percent(met, total) };
  });
  const departmentCompliance = [...new Set(monitorings.map((item) => `${item.departmentCode}\u0000${item.area}`))]
    .map((key) => {
      const [departmentCode, area] = key.split("\u0000");
      const items = monitorings.filter((item) => item.departmentCode === departmentCode && item.area === area);
      const total = items.reduce((sum, item) => sum + item.sampleSize, 0);
      const met = items.reduce((sum, item) => sum + item.compliant, 0);
      const notPerformed = items.reduce((sum, item) => sum + (item.notPerformed || 0), 0);
      return { departmentCode, departmentName: items[0].departmentName || departmentCode, area, total, met, notPerformed,
        rate: percent(met, total) };
    }).sort((a, b) => String(a.departmentName || "").localeCompare(String(b.departmentName || ""), "vi") ||
      a.area.localeCompare(b.area, "vi"));
  const roleCompliance = [...new Set(monitorings.filter((item) => item.observedRole)
    .map((item) => `${item.observedRole}\u0000${item.area}`))].map((key) => {
      const [role, area] = key.split("\u0000");
      const items = monitorings.filter((item) => item.observedRole === role && item.area === area);
      const total = items.reduce((sum, item) => sum + item.sampleSize, 0);
      const met = items.reduce((sum, item) => sum + item.compliant, 0);
      const notPerformed = items.reduce((sum, item) => sum + (item.notPerformed || 0), 0);
      return { role, area, total, met, notPerformed, rate: percent(met, total) };
    }).sort((a, b) => a.role.localeCompare(b.role, "vi") || a.area.localeCompare(b.area, "vi"));
  return {
    monitoringCount: monitorings.length + observations.length + daily.length,
    risksFound: risks.length, risksClosed: closed, closureRate: percent(closed, risks.length),
    categories, compliance, departmentCompliance, roleCompliance,
  };
}

export function monthlySummary(data, user, month) {
  return summarize(data, user, `${month}-01`, `${month}-31`, true);
}

function reportFor(data, member, month) {
  return [...data.monthlyReports, ...(data.doctorReports || [])].find((report) =>
    report.month === month && owned(member, report, "employeeCode", "submittedBy"));
}

export function moduleRouter({ currentUser, audit }) {
  const router = Router();
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const hasDoctorRole = (req, res, next) => req.user.roles?.includes("MEMBER_DOCTOR")
    ? next() : res.status(403).json({ message: "Chỉ bác sĩ được lập phiếu ca bệnh." });
  router.use(currentUser);
  router.get("/context", asyncRoute(async (req, res) => {
    const data = await readStore();
    const tasks = isNetworkReader(req.user) ? data.tasks.filter((task) => task.area !== "Báo cáo" &&
      (seesAll(req.user) || task.departmentCode === req.user.departmentCode) &&
      (seesAll(req.user) || req.user.roles.includes(task.assigneeRole))) : [];
    const people = new Map();
    if (canRecord(data, req.user)) {
      for (const { active, employeeCode, fullName, departmentCode, departmentName } of data.users) {
        if (active && employeeCode && !people.has(employeeCode) &&
          (seesAll(req.user) || departmentCode === req.user.departmentCode)) {
          people.set(employeeCode, { employeeCode, fullName, departmentName });
        }
      }
    }
    res.json({
      canRecord: Boolean(canRecord(data, req.user)), isNetworkReader: Boolean(isNetworkReader(req.user)),
      seesAll: Boolean(seesAll(req.user)), canManage: Boolean(canManage(req.user)),
      reportDay: data.doctorConfig?.reportDay ?? 5,
      tasks,
      people: [...people.values()],
    });
  }));
  router.get("/overview", asyncRoute(async (req, res) => {
    const { from, to } = req.query;
    if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ message: "Chọn khoảng ngày hợp lệ." });
    const data = await readStore();
    const today = vietnamDate();
    const month = today.slice(0, 7);
    const risks = data.risks.filter((item) => visibleRisk(req.user, item));
    const open = risks.filter((item) => item.status !== "Đã đóng");
    const tasks = isNetworkReader(req.user) ? data.tasks.filter((item) => item.area !== "Báo cáo" &&
      (seesAll(req.user) || item.departmentCode === req.user.departmentCode) &&
      (seesAll(req.user) || req.user.roles.includes(item.assigneeRole)) && item.status !== "Đã hoàn thành") : [];
    const dueTasks = tasks.filter((item) => validDate(item.dueDate) && item.dueDate <= today);
    const previous = new Date(`${month}-01T00:00:00Z`);
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    const reportMonth = previous.toISOString().slice(0, 7);
    const reportDay = data.doctorConfig?.reportDay ?? 5;
    const reportDue = `${month}-${String(reportDay).padStart(2, "0")}`;
    const monthText = (value) => `${value.slice(5, 7)}/${value.slice(0, 4)}`;
    const required = isNetworkReader(req.user) ? data.members.filter((member) => member.active &&
      reportMemberTypes.includes(member.memberType) &&
      (seesAll(req.user) || member.departmentCode === req.user.departmentCode)) : [];
    const missing = required.filter((member) => !reportFor(data, member, reportMonth));
    const notices = [
      ...open.filter((item) => item.severity === "Cao").map((item) => ({
        id: `high-${item.id}`, text: `Nguy hiểm: ${item.title}`, urgent: true, section: "risks", riskId: item.id,
      })),
      ...open.filter((item) => item.status !== "Chờ kiểm tra lại" && item.dueDate && item.dueDate < today).map((item) => ({
        id: `due-${item.id}`, text: `Quá hạn xử lý: ${item.title}`, urgent: true, section: "risks", riskId: item.id,
      })),
      ...(today > reportDue ? missing.filter((member) => seesAll(req.user) || req.user.roles.includes("DEPARTMENT_HEAD") ||
        member.employeeCode === req.user.employeeCode).map((member) => ({
        id: `report-${member.employeeCode}`, text: `${member.fullName}: chưa xác nhận báo cáo tháng ${monthText(reportMonth)}`,
        urgent: true, section: "reports", reportMonth,
      })) : []),
      ...(data.notifications || []).filter((item) => item.recipient === req.user.employeeCode && !item.readAt)
        .map((item) => ({ ...item, section: "risks" })),
    ];
    const activity = [
      ...risks.flatMap((item) => (item.timeline || []).map((event) => ({
        id: item.id, title: item.title, by: event.by, at: event.at, status: item.status, action: plainAction(event.action),
      }))),
      ...(isNetworkReader(req.user) ? data.monitorings.filter((item) => seesAll(req.user) || item.departmentCode === req.user.departmentCode)
        .map((item) => ({ id: item.id, title: item.area, by: item.observer, at: item.createdAt || `${item.date}T00:00:00+07:00`, status: item.status, action: "Ghi nhận giám sát" })) : []),
      ...(isNetworkReader(req.user) ? data.monthlyReports.filter((item) => seesAll(req.user) || item.departmentCode === req.user.departmentCode)
        .map((item) => ({ id: item.id, title: `Báo cáo tháng ${monthText(item.month)}`, by: item.submittedBy, at: item.createdAt, status: item.status, action: "Xác nhận báo cáo" })) : []),
      ...(isNetworkReader(req.user) ? (data.doctorObservations || []).filter((item) => seesAll(req.user) || item.departmentCode === req.user.departmentCode)
        .map((item) => ({ id: item.id, title: item.topic, by: item.observer, at: item.createdAt, status: "Đã ghi nhận", action: "Ghi nhận giám sát" })) : []),
      ...(isNetworkReader(req.user) ? (data.dailySurveillance || []).filter((item) => seesAll(req.user) || item.departmentCode === req.user.departmentCode)
        .map((item) => ({ id: item.id, title: "Giám sát phòng ngừa", by: item.submittedBy, at: item.submittedAt, status: "Đã ghi nhận", action: "Ghi nhận giám sát" })) : []),
    ].filter((item) => during(item.at, from, to)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
    res.json({
      summary: summarize(data, req.user, from, to),
      work: {
        due: dueTasks.length, unscheduled: tasks.filter((item) => !validDate(item.dueDate)).length,
        new: open.filter((item) => item.status === "Mới ghi nhận").length,
        processing: open.filter((item) => ["Đã tiếp nhận", "Đang khắc phục"].includes(item.status)).length,
        waiting: open.filter((item) => item.status === "Chờ kiểm tra lại").length,
        overdue: open.filter((item) => item.status !== "Chờ kiểm tra lại" && item.dueDate && item.dueDate < today).length,
        reportMonth, reportDue, reportRequired: required.length, reportConfirmed: required.length - missing.length,
        reportMissing: missing.map(({ fullName, departmentName }) => ({ fullName, departmentName })),
        ownReportConfirmed: Boolean(reportFor(data, req.user, reportMonth)),
        ownReportRequired: data.members.some((member) => member.active && member.employeeCode === req.user.employeeCode &&
          reportMemberTypes.includes(member.memberType)),
      },
      tasks: dueTasks, notices, activity,
    });
  }));
  router.get("/report-summary", requireRecorder, asyncRoute(async (req, res) => {
    if (!validMonth(req.query.month)) return res.status(400).json({ message: "Tháng báo cáo không hợp lệ." });
    res.json({ summary: monthlySummary(await readStore(), req.user, req.query.month) });
  }));
  router.get("/report-readiness", asyncRoute(async (req, res) => {
    if (!canFollowReports(req.user)) {
      return res.status(403).json({ message: "Chỉ Khoa KSNK hoặc lãnh đạo khoa được theo dõi tình trạng đủ mẫu." });
    }
    const { from, to } = req.query;
    if (!validMonth(from) || !validMonth(to) || from > to) {
      return res.status(400).json({ message: "Chọn khoảng tháng hợp lệ để kiểm tra đủ mẫu báo cáo." });
    }
    const start = new Date(`${from}-01T00:00:00Z`);
    const end = new Date(`${to}-01T00:00:00Z`);
    const monthCount = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      end.getUTCMonth() - start.getUTCMonth() + 1;
    if (monthCount > 24) return res.status(400).json({ message: "Khoảng tổng hợp không được vượt quá 24 tháng." });
    const data = await readStore();
    const members = data.members.filter((member) => member.active && reportMemberTypes.includes(member.memberType) &&
      (seesAll(req.user) || member.departmentCode === req.user.departmentCode));
    const months = Array.from({ length: monthCount }, (_, index) => {
      const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
      return month.toISOString().slice(0, 7);
    });
    const groups = {
      doctors: { required: 0, submitted: 0 },
      members: { required: 0, submitted: 0 },
    };
    const missing = [];
    for (const month of months) {
      for (const member of members) {
        const group = member.memberType === "Bác sĩ" ? groups.doctors : groups.members;
        group.required += 1;
        if (reportFor(data, member, month)) group.submitted += 1;
        else missing.push({ month, fullName: member.fullName, departmentName: member.departmentName, memberType: member.memberType });
      }
    }
    const withReadiness = (group) => ({
      ...group,
      rate: percent(group.submitted, group.required),
      complete: group.required > 0 && group.submitted === group.required,
    });
    const doctors = withReadiness(groups.doctors);
    const otherMembers = withReadiness(groups.members);
    const required = doctors.required + otherMembers.required;
    const submitted = doctors.submitted + otherMembers.submitted;
    res.json({
      from, to, required, submitted, rate: percent(submitted, required),
      complete: doctors.required > 0 && otherMembers.required > 0 && doctors.complete && otherMembers.complete,
      doctors, members: otherMembers, missing,
    });
  }));
  router.get("/weekly-reports", requireNetworkReader, asyncRoute(async (req, res) => {
    const { from, to } = req.query;
    if (!validWeekRange(from, to)) {
      return res.status(400).json({ message: "Chọn đúng khoảng 7 ngày trong quá khứ để xem báo cáo tuần." });
    }
    const data = await readStore();
    const visibleMembers = data.members.filter((member) => member.active &&
      weeklyReportMemberTypes.includes(member.memberType) &&
      (seesAll(req.user) || member.departmentCode === req.user.departmentCode));
    const weeklyReports = data.weeklyReports || [];
    const members = visibleMembers.filter((member) => otherWeeklyReportMemberTypes.includes(member.memberType));
    const doctors = visibleMembers.filter((member) => member.memberType === "Bác sĩ");
    const submitted = (member) => weeklyReports.some((report) => report.from === from && report.to === to &&
      report.employeeCode === member.employeeCode && report.departmentCode === member.departmentCode);
    const readinessGroup = (group) => {
      const count = group.filter(submitted).length;
      return { required: group.length, submitted: count, rate: percent(count, group.length),
        complete: group.length > 0 && count === group.length };
    };
    const doctorReadiness = readinessGroup(doctors);
    const memberReadiness = readinessGroup(members);
    const required = doctorReadiness.required + memberReadiness.required;
    const confirmed = doctorReadiness.submitted + memberReadiness.submitted;
    const canReview = canFollowReports(req.user);
    const byGroup = (types) => weeklyReports.filter((item) => item.from === from && item.to === to &&
      types.includes(item.memberType) &&
      (seesAll(req.user) || item.departmentCode === req.user.departmentCode))
      .sort((a, b) => String(a.departmentName).localeCompare(String(b.departmentName), "vi") ||
        String(a.submittedBy).localeCompare(String(b.submittedBy), "vi"));
    const visibleReports = weeklyReports.filter((item) => item.from === from && item.to === to &&
      (seesAll(req.user) || item.departmentCode === req.user.departmentCode) &&
      (canReview || item.employeeCode === req.user.employeeCode));
    const allSummary = summarizeWeeklyGroup(data, req.user, from, to, weeklyReportMemberTypes);
    res.json({
      from, to,
      items: visibleReports,
      summaries: {
        all: allSummary,
        doctors: summarizeWeeklyGroup(data, req.user, from, to, ["Bác sĩ"]),
        members: summarizeWeeklyGroup(data, req.user, from, to, otherWeeklyReportMemberTypes),
      },
      readiness: canReview ? {
        required, submitted: confirmed, rate: percent(confirmed, required),
        complete: doctorReadiness.complete && memberReadiness.complete,
        doctors: doctorReadiness, members: memberReadiness,
        missing: visibleMembers.filter((member) => !submitted(member)).map((member) => ({
          fullName: member.fullName, departmentName: member.departmentName, memberType: member.memberType,
        })),
      } : null,
    });
  }));
  router.post("/weekly-reports", requireRecorder, asyncRoute(async (req, res) => {
    const body = req.body || {};
    const fields = ["activities", "difficulties", "nextWeekPlan", "recommendations"];
    if (!validWeekRange(body.from, body.to) ||
        fields.some((key) => body[key] !== undefined && (typeof body[key] !== "string" || body[key].length > 4000)) ||
        !filled(body.activities)) {
      return res.status(400).json({ message: "Báo cáo tuần cần đúng 7 ngày và có nội dung công việc đã triển khai." });
    }
    const result = await updateStore((data) => {
      const member = data.members.find((item) => item.active && item.employeeCode === req.user.employeeCode &&
        item.departmentCode === req.user.departmentCode && weeklyReportMemberTypes.includes(item.memberType));
      if (!member) return { status: 403, message: "Chỉ bác sĩ hoặc điều dưỡng đang là thành viên mạng lưới được gửi báo cáo tuần." };
      data.weeklyReports ||= [];
      const existing = data.weeklyReports.find((item) => item.from === body.from && item.to === body.to &&
        item.employeeCode === req.user.employeeCode && item.departmentCode === req.user.departmentCode);
      const { versions, ...previous } = existing || {};
      const record = {
        id: existing?.id || makeId("weeklyReport"),
        from: body.from, to: body.to,
        activities: body.activities.trim(),
        difficulties: body.difficulties?.trim() || "",
        nextWeekPlan: body.nextWeekPlan?.trim() || "",
        recommendations: body.recommendations?.trim() || "",
        employeeCode: req.user.employeeCode, submittedBy: req.user.fullName,
        memberType: member.memberType, departmentCode: req.user.departmentCode,
        departmentName: req.user.departmentName, createdAt: new Date().toISOString(),
        status: "Đã gửi",
      };
      if (existing) Object.assign(existing, record, { versions: [...(versions || []), previous] });
      else data.weeklyReports.unshift(record);
      audit(data, req.user, "Gửi báo cáo tuần thành viên mạng lưới", "weeklyReport", record.id);
      return { status: 201, item: record };
    });
    res.status(result.status).json(result.item ? { item: result.item } : { message: result.message });
  }));
  router.get("/case-reports", asyncRoute(async (req, res) => {
    if (!req.user.roles?.includes("MEMBER_DOCTOR") && !seesAll(req.user)) {
      return res.status(403).json({ message: "Chỉ bác sĩ và Khoa KSNK được xem báo cáo ca bệnh." });
    }
    const { from, to } = req.query;
    if (!validDate(from) || !validDate(to) || from > to) {
      return res.status(400).json({ message: "Chọn khoảng ngày hợp lệ để tổng hợp ca bệnh." });
    }
    const data = await readStore();
    const items = (data.caseReports || []).filter((item) =>
      (seesAll(req.user) || item.departmentCode === req.user.departmentCode) &&
      during(item.date, from, to)
    ).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    const infectionTypes = ["urinary", "respiratory", "bloodstream", "surgical-wound"].map((type) => ({
      type, count: items.filter((item) => item.type === "hospital-infection" && item.infectionType === type).length,
      rate: percent(items.filter((item) => item.type === "hospital-infection" && item.infectionType === type).length,
        items.filter((item) => item.type === "hospital-infection").length),
    }));
    const interventionStats = interventions.map((value) => ({
      value, count: items.filter((item) => item.interventionNeeded === value).length,
      rate: percent(items.filter((item) => item.interventionNeeded === value).length, items.length),
    }));
    const transmissionCases = items.filter((item) => item.type === "transmission-disease");
    const transmissionByDisease = [...new Set(transmissionCases.map((item) => item.diagnosisName))]
      .sort((a, b) => a.localeCompare(b, "vi")).map((disease) => {
        const cases = transmissionCases.filter((item) => item.diagnosisName === disease);
        return {
          disease, total: cases.length,
          suspected: cases.filter((item) => item.caseClassification === "suspected").length,
          confirmed: cases.filter((item) => item.caseClassification === "confirmed").length,
          admitted: cases.filter((item) => item.outcome === "admitted").length,
          discharged: cases.filter((item) => item.outcome === "discharged").length,
          transferred: cases.filter((item) => item.outcome === "transferred").length,
          deceased: cases.filter((item) => item.outcome === "deceased").length,
          rate: percent(cases.length, transmissionCases.length),
          suspectedRate: percent(cases.filter((item) => item.caseClassification === "suspected").length, cases.length),
          confirmedRate: percent(cases.filter((item) => item.caseClassification === "confirmed").length, cases.length),
          admittedRate: percent(cases.filter((item) => item.outcome === "admitted").length, cases.length),
          dischargedRate: percent(cases.filter((item) => item.outcome === "discharged").length, cases.length),
          transferredRate: percent(cases.filter((item) => item.outcome === "transferred").length, cases.length),
          deceasedRate: percent(cases.filter((item) => item.outcome === "deceased").length, cases.length),
        };
      });
    res.json({
      items,
      summary: {
        total: items.length,
        hospitalInfections: items.filter((item) => item.type === "hospital-infection").length,
        transmissionDiseases: items.filter((item) => item.type === "transmission-disease").length,
        interventionStats, infectionTypes, transmissionByDisease,
      },
    });
  }));
  router.post("/case-reports", hasDoctorRole, requireRecorder, asyncRoute(async (req, res) => {
    const b = req.body || {};
    const today = vietnamDate();
    const optionalString = (value, max) => value === undefined || (typeof value === "string" && value.length <= max);
    const genderValues = ["Nam", "Nữ", "Khác/không rõ"];
    const validBirthYear = b.patientBirthYear === undefined || b.patientBirthYear === null ||
      Number.isInteger(b.patientBirthYear) && b.patientBirthYear >= 1900 &&
      b.patientBirthYear <= Number(today.slice(0, 4));
    const validAdmissionDate = b.admissionDate === undefined || b.admissionDate === "" ||
      validDate(b.admissionDate) && b.admissionDate <= today;
    const baseValid = caseReportTypes.includes(b.type) && validDate(b.date) && b.date <= today &&
      filled(b.diagnosisName) && b.diagnosisName.length <= 200 &&
      interventions.includes(b.interventionNeeded) &&
      (b.interventionNeeded === "no" || filled(b.interventionDetails)) &&
      optionalString(b.patientName, 120) && optionalString(b.diagnosisCode, 40) &&
      validBirthYear && (b.patientGender === undefined || b.patientGender === "" || genderValues.includes(b.patientGender)) &&
      optionalString(b.patientAddress, 200) && validAdmissionDate &&
      optionalString(b.interventionDetails, 2000) &&
      (b.onsetDate === undefined || b.onsetDate === "" || validDate(b.onsetDate) && b.onsetDate <= b.date);
    const infectionValid = b.type !== "hospital-infection" ||
      ["urinary", "respiratory", "bloodstream", "surgical-wound"].includes(b.infectionType);
    const transmissionValid = b.type !== "transmission-disease" ||
      (["suspected", "confirmed"].includes(b.caseClassification) &&
       transmissionOutcomes.includes(b.outcome) &&
       optionalString(b.labResult, 1000) && optionalString(b.caseNote, 2000) &&
       optionalString(b.preventiveMeasures, 2000) &&
       (b.isolationStartDate === undefined || b.isolationStartDate === "" || validDate(b.isolationStartDate)) &&
       (b.isolationEndDate === undefined || b.isolationEndDate === "" || validDate(b.isolationEndDate)) &&
       (!b.isolationStartDate || !b.isolationEndDate || b.isolationEndDate >= b.isolationStartDate));
    if (!baseValid || !infectionValid || !transmissionValid) {
      return res.status(400).json({ message: "Phiếu ca bệnh chưa hợp lệ. Kiểm tra ngày, chẩn đoán, loại bệnh và phương án xử trí." });
    }
    const item = await updateStore((data) => {
      data.caseReports ||= [];
      const record = {
        id: makeId("caseReport"), type: b.type, date: b.date,
        employeeCode: req.user.employeeCode, doctor: req.user.fullName,
        departmentCode: req.user.departmentCode, departmentName: req.user.departmentName,
        patientName: b.patientName?.trim() || "", diagnosisCode: b.diagnosisCode?.trim() || "",
        patientBirthYear: Number.isInteger(b.patientBirthYear) ? b.patientBirthYear : null,
        patientGender: b.patientGender || "", patientAddress: b.patientAddress?.trim() || "",
        admissionDate: b.admissionDate || "",
        diagnosisName: b.diagnosisName.trim(), onsetDate: b.onsetDate || "",
        infectionType: b.type === "hospital-infection" ? b.infectionType : "",
        isolationStartDate: b.type === "transmission-disease" ? b.isolationStartDate || "" : "",
        isolationEndDate: b.type === "transmission-disease" ? b.isolationEndDate || "" : "",
        preventiveMeasures: b.type === "transmission-disease" ? b.preventiveMeasures?.trim() || "" : "",
        caseClassification: b.type === "transmission-disease" ? b.caseClassification : "",
        outcome: b.type === "transmission-disease" ? b.outcome : "",
        labResult: b.type === "transmission-disease" ? b.labResult?.trim() || "" : "",
        caseNote: b.type === "transmission-disease" ? b.caseNote?.trim() || "" : "",
        interventionNeeded: b.interventionNeeded,
        interventionDetails: b.interventionNeeded === "no" ? "" : b.interventionDetails.trim(),
        createdAt: new Date().toISOString(),
      };
      data.caseReports.unshift(record);
      if (["ksnk", "hospital"].includes(record.interventionNeeded)) {
        const recipients = new Set((data.users || []).filter((user) => user.active &&
          user.roles?.some((role) => ["KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY", "NETWORK_SECRETARY"].includes(role)))
          .map((user) => user.employeeCode).filter(Boolean));
        for (const recipient of recipients) {
          (data.notifications ||= []).unshift({
            id: makeId("notice"), recipient, reportMonth: record.date.slice(0, 7),
            text: `Bác sĩ cần ${record.interventionNeeded === "hospital" ? "phối hợp toàn viện" : "Khoa KSNK phối hợp"}: ${record.diagnosisName}`,
            urgent: record.interventionNeeded === "hospital", at: record.createdAt,
          });
        }
      }
      audit(data, req.user, "Tạo phiếu ca bệnh KSNK", "caseReport", record.id);
      return record;
    });
    res.status(201).json({ item });
  }));
  router.get("/issues", asyncRoute(async (req, res) => {
    const data = await readStore();
    res.json({ items: data.risks.filter((item) => visibleRisk(req.user, item)).map((item) => ({
      ...item, ...responseWindow(item),
      timeline: (item.timeline || []).map((event) => ({ ...event, action: plainAction(event.action) })),
      canRespond: Boolean(req.user.employeeCode) && item.subjectEmployeeCode === req.user.employeeCode && responseWindow(item).responseOpen,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  }));
  router.post("/issues/:id/responses", asyncRoute(async (req, res) => {
    const { explanation, evidence } = req.body || {};
    if (![explanation, evidence].every((value) => typeof value === "string" && value.trim() && value.length <= 4000)) {
      return res.status(400).json({ message: "Nhập nội dung phản hồi và minh chứng (tối đa 4.000 ký tự mỗi mục)." });
    }
    const result = await updateStore((data) => {
      const item = data.risks.find((risk) => risk.id === req.params.id);
      if (!item || !visibleRisk(req.user, item)) return { status: 404, message: "Không tìm thấy phiếu." };
      if (!req.user.employeeCode || item.subjectEmployeeCode !== req.user.employeeCode) return { status: 403, message: "Chỉ người được ghi nhận trong phiếu được gửi phản hồi." };
      if (!responseWindow(item).responseOpen) return { status: 409, message: "Đã hết tháng lập phiếu. Chỉ được xem lịch sử phản hồi." };
      const response = { id: makeId("response"), explanation: explanation.trim(), evidence: evidence.trim(),
        by: req.user.fullName, employeeCode: req.user.employeeCode, at: new Date().toISOString() };
      (item.responses ||= []).push(response);
      (item.timeline ||= []).push({ at: response.at, by: response.by, action: "Gửi phản hồi" });
      const recipients = new Set([item.employeeCode, ...data.users.filter((user) => user.active &&
        (seesAll(user) || (user.departmentCode === item.departmentCode && user.roles.includes("DEPARTMENT_HEAD")))).map((user) => user.employeeCode)]);
      for (const recipient of recipients) {
        if (recipient) (data.notifications ||= []).unshift({ id: makeId("notice"), recipient, riskId: item.id,
          text: `Có phản hồi mới: ${item.title}`, urgent: false, at: response.at });
      }
      audit(data, req.user, "Gửi phản hồi", "risk", item.id);
      return { status: 201, item: response };
    });
    res.status(result.status).json(result.item ? { item: result.item } : { message: result.message });
  }));
  router.patch("/notifications/:id/read", asyncRoute(async (req, res) => {
    const item = await updateStore((data) => {
      const notification = (data.notifications || []).find((entry) => entry.id === req.params.id && entry.recipient === req.user.employeeCode);
      if (!notification) return null;
      notification.readAt = new Date().toISOString();
      return notification;
    });
    if (!item) return res.status(404).json({ message: "Không tìm thấy thông báo." });
    res.json({ item });
  }));
  const manager = (req, res, next) => canManage(req.user) ? next() :
    res.status(403).json({ message: "Chỉ Khoa KSNK/lãnh đạo mạng lưới được thay đổi mục này." });
  router.patch("/members/:id", manager, asyncRoute(async (req, res) => {
    if (typeof req.body?.active !== "boolean") return res.status(400).json({ message: "Chọn đang tham gia hoặc ngừng tham gia." });
    let self = false;
    const item = await updateStore((data) => {
      const member = data.members.find((entry) => entry.id === req.params.id);
      if (!member) return null;
      if (member.employeeCode === req.user.employeeCode && !req.body.active) { self = true; return null; }
      member.active = req.body.active;
      audit(data, req.user, member.active ? "Mở lại thành viên mạng lưới" : "Ngừng thành viên mạng lưới", "member", member.id);
      return member;
    });
    if (self) return res.status(400).json({ message: "Không thể tự ngừng tham gia của chính mình." });
    if (!item) return res.status(404).json({ message: "Không tìm thấy thành viên." });
    res.json({ item });
  }));
  router.put("/settings", manager, asyncRoute(async (req, res) => {
    const reportDay = req.body?.reportDay;
    if (!Number.isInteger(reportDay) || reportDay < 1 || reportDay > 28) return res.status(400).json({ message: "Chọn ngày từ 1 đến 28." });
    const saved = await updateStore((data) => {
      data.doctorConfig = { ...data.doctorConfig, reportDay };
      audit(data, req.user, `Đổi hạn báo cáo thành ngày ${reportDay} hằng tháng`, "settings", "reportDay");
      return { reportDay };
    });
    res.json(saved);
  }));
  return router;
}
