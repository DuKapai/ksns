import { Router } from "express";
import { readStore, updateStore, makeId } from "./store.js";
import { validDate, validDateTime, validMonth } from "./validation.js";

const networkRoles = ["MEMBER_DOCTOR", "MEMBER_NURSE", "KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY", "NETWORK_SECRETARY"];
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
    return { name, total, met, rate: percent(met, total) };
  });
  return {
    monitoringCount: monitorings.length + observations.length + daily.length,
    risksFound: risks.length, risksClosed: closed, closureRate: percent(closed, risks.length),
    categories, compliance,
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
    const reportTypes = ["Bác sĩ", "Điều dưỡng", "Hộ sinh", "Kỹ thuật y"];
    const monthText = (value) => `${value.slice(5, 7)}/${value.slice(0, 4)}`;
    const required = isNetworkReader(req.user) ? data.members.filter((member) => member.active &&
      reportTypes.includes(member.memberType) &&
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
          reportTypes.includes(member.memberType)),
      },
      tasks: dueTasks, notices, activity,
    });
  }));
  router.get("/report-summary", requireRecorder, asyncRoute(async (req, res) => {
    if (!validMonth(req.query.month)) return res.status(400).json({ message: "Tháng báo cáo không hợp lệ." });
    res.json({ summary: monthlySummary(await readStore(), req.user, req.query.month) });
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
