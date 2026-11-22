import { Router } from "express";
import { readStore, updateStore, makeId } from "./store.js";
import { validDate, validDateTime, validMonth } from "./validation.js";
import { requireRecorder } from "./module.js";

const BUNDLES = ["VAP", "CAUTI", "SSI", "CLABSI"];
const CASE_TYPES = ["Nghi ngờ NKBV", "Bệnh truyền nhiễm cần đánh giá", "Nguy cơ lây truyền khác"];
const ISOLATION_STATUSES = ["Đã áp dụng", "Đang bố trí", "Chưa chỉ định", "Không áp dụng"];
const ISOLATION_TYPES = ["Tiếp xúc", "Giọt bắn", "Không khí", "Kết hợp", "Theo chỉ định", "Chưa xác định"];
const COUNCIL_DECISIONS = [
  "Đạt định nghĩa ca theo kết luận HĐKH",
  "Không đạt định nghĩa ca theo kết luận HĐKH",
  "Chưa đủ dữ liệu",
];
const text = (value) => typeof value === "string";
const filled = (value) => text(value) && value.trim().length > 0;
const roles = (user) => user.roles || [];
const canViewAll = (user) => roles(user).some((role) =>
  ["KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY", "NETWORK_SECRETARY"].includes(role));
const isNetwork = (user) => roles(user).some((role) => ["MEMBER_DOCTOR", "MEMBER_NURSE"].includes(role));
const eligibleMembers = (data) => (data.members || []).filter((member) =>
  member.active === true && ["Bác sĩ", "Điều dưỡng"].includes(member.memberType));
const departmentVisible = (user, departmentCode) =>
  canViewAll(user) || user.departmentCode === departmentCode;
const dateQuery = (req, res, next) => {
  if (!validDate(req.query.date)) return res.status(400).json({ message: "Ngày phải hợp lệ theo định dạng YYYY-MM-DD." });
  next();
};
const monthQuery = (req, res, next) => {
  if (!validMonth(req.query.month)) return res.status(400).json({ message: "Tháng phải hợp lệ theo định dạng YYYY-MM." });
  next();
};
const rangeQuery = (req, res, next) => {
  const { from, to } = req.query;
  if (!validDate(from) || !validDate(to) || from > to) {
    return res.status(400).json({ message: "Khoảng ngày không hợp lệ." });
  }
  next();
};

function currentVietnamDateTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
}

function dailyStats(data, member, date) {
  const entry = (data.dailySurveillance || []).find((item) =>
    item.date === date && item.departmentCode === member.departmentCode);
  const departmentNurses = eligibleMembers(data).filter((item) =>
    item.memberType === "Điều dưỡng" && item.departmentCode === member.departmentCode);
  const handHygiene = (data.monitorings || []).filter((item) => {
    if (item.date !== date || item.departmentCode !== member.departmentCode || item.area !== "Vệ sinh tay") return false;
    if (item.observerRole === "MEMBER_NURSE") return true;
    return !item.observerRole && departmentNurses.some((nurse) => nurse.fullName === item.observer);
  });
  const opportunities = handHygiene.reduce((sum, item) => sum + (Number.isSafeInteger(item.sampleSize) ? item.sampleSize : 0), 0);
  const actions = handHygiene.reduce((sum, item) => sum + (Number.isSafeInteger(item.compliant) ? item.compliant : 0), 0);
  const cases = (data.surveillanceCases || []).filter((item) =>
    item.date === date && item.departmentCode === member.departmentCode);
  const values = Object.fromEntries(BUNDLES.map((key) => {
    const value = entry?.bundles?.[key] || { eligible: 0, compliant: 0 };
    return [key, { eligible: value.eligible, compliant: value.compliant,
      rate: value.eligible > 0 ? Math.round((value.compliant / value.eligible) * 1000) / 10 : null }];
  }));
  return {
    departmentCode: member.departmentCode, departmentName: member.departmentName,
    doctorNames: eligibleMembers(data).filter((item) => item.departmentCode === member.departmentCode && item.memberType === "Bác sĩ").map((item) => item.fullName),
    nurseNames: departmentNurses.map((item) => item.fullName),
    doctorSubmitted: Boolean(entry), doctorEntry: entry || null,
    nurseHandHygieneSubmitted: handHygiene.length > 0, handHygieneCount: handHygiene.length,
    handHygieneOpportunities: opportunities, handHygieneCompliant: actions,
    handHygieneRate: opportunities > 0 ? Math.round((actions / opportunities) * 1000) / 10 : null,
    bundles: values,
    suspectedCaseCount: cases.length,
    awaitingCouncilCount: cases.filter((item) => ["Chưa trình", "Chờ HĐKH thẩm định"].includes(item.councilStatus)).length,
  };
}

function monthlyStats(data, user, month) {
  const monthEntries = (data.dailySurveillance || []).filter((item) =>
    item.date?.startsWith(month) && departmentVisible(user, item.departmentCode));
  const monitorings = (data.monitorings || []).filter((item) =>
    item.date?.startsWith(month) && item.area === "Vệ sinh tay" &&
    departmentVisible(user, item.departmentCode) &&
    (item.observerRole === "MEMBER_NURSE" ||
      (!item.observerRole && eligibleMembers(data).some((nurse) =>
        nurse.memberType === "Điều dưỡng" && nurse.departmentCode === item.departmentCode && nurse.fullName === item.observer))));
  const cases = (data.surveillanceCases || []).filter((item) =>
    item.date?.startsWith(month) && departmentVisible(user, item.departmentCode));
  const opportunities = monitorings.reduce((sum, item) => sum + (Number.isSafeInteger(item.sampleSize) ? item.sampleSize : 0), 0);
  const compliant = monitorings.reduce((sum, item) => sum + (Number.isSafeInteger(item.compliant) ? item.compliant : 0), 0);
  return {
    month,
    handHygiene: {
      observationCount: monitorings.length, opportunities, compliant,
      rate: opportunities > 0 ? Math.round((compliant / opportunities) * 1000) / 10 : null,
    },
    bundles: Object.fromEntries(BUNDLES.map((key) => {
      const entries = monthEntries.map((item) => item.bundles[key]);
      const eligible = entries.reduce((sum, item) => sum + (item?.eligible || 0), 0);
      const bundleCompliant = entries.reduce((sum, item) => sum + (item?.compliant || 0), 0);
      return [key, { eligible, compliant: bundleCompliant,
        rate: eligible > 0 ? Math.round((bundleCompliant / eligible) * 1000) / 10 : null }];
    })),
    suspectedCaseCount: cases.length,
    submittedToCouncilCount: cases.filter((item) => item.councilStatus === "Chờ HĐKH thẩm định" || item.councilStatus === "Đã thẩm định").length,
    awaitingCouncilCount: cases.filter((item) => ["Chưa trình", "Chờ HĐKH thẩm định"].includes(item.councilStatus)).length,
    isolation: Object.fromEntries(ISOLATION_STATUSES.map((status) =>
      [status, cases.filter((item) => item.isolationStatus === status).length])),
  };
}

export function surveillanceRouter({ currentUser, hasRole, audit }) {
  const router = Router();
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const departmentMember = hasRole("MEMBER_DOCTOR", "MEMBER_NURSE");
  const ksnkReaders = hasRole("KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY", "NETWORK_SECRETARY");
  const ksnkLeaders = hasRole("KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY");

  router.use(currentUser);

  router.get("/daily", dateQuery, asyncRoute(async (req, res) => {
    const data = await readStore();
    const memberships = eligibleMembers(data).filter((member) => departmentVisible(req.user, member.departmentCode));
    const departments = [...new Map(memberships.map((member) => [member.departmentCode, member])).values()]
      .map((member) => dailyStats(data, member, req.query.date))
      .filter((item) => item.doctorNames.length || item.nurseNames.length);
    const current = currentVietnamDateTime();
    const overdue = req.query.date < current.date || (req.query.date === current.date && current.hour >= 16);
    const alerts = overdue ? departments.flatMap((item) => [
      ...(!item.doctorSubmitted ? [{ departmentCode: item.departmentCode, departmentName: item.departmentName, missing: "Báo cáo chuyên môn hằng ngày của bác sĩ" }] : []),
      ...(item.nurseNames.length && !item.nurseHandHygieneSubmitted ? [{ departmentCode: item.departmentCode, departmentName: item.departmentName, missing: "Phiếu giám sát vệ sinh tay của điều dưỡng" }] : []),
    ]) : [];
    res.json({ date: req.query.date, overdue, dueTime: "16:00 (mốc demo, cần cấu hình/phê duyệt)", departments, alerts });
  }));

  router.put("/daily", departmentMember, hasRole("MEMBER_DOCTOR"), requireRecorder, asyncRoute(async (req, res) => {
    const body = req.body || {};
    const validBundles = body.bundles && typeof body.bundles === "object" && !Array.isArray(body.bundles) &&
      BUNDLES.every((key) => {
        const bundle = body.bundles[key];
        return bundle && Number.isSafeInteger(bundle.eligible) && bundle.eligible >= 0 &&
          Number.isSafeInteger(bundle.compliant) && bundle.compliant >= 0 &&
          bundle.compliant <= bundle.eligible;
      });
    if (!validDate(body.date) || !validBundles ||
        (body.note !== undefined && !text(body.note)) ||
        (body.caseDeclaration !== undefined && !["none", "reported"].includes(body.caseDeclaration))) {
      return res.status(400).json({ message: "Báo cáo ngày không hợp lệ; kiểm tra ngày và số liệu bốn gói phòng ngừa." });
    }
    const saved = await updateStore((data) => {
      const matchingCases = (data.surveillanceCases || []).some((item) =>
        item.date === body.date && item.departmentCode === req.user.departmentCode);
      if (body.caseDeclaration !== undefined &&
          (body.caseDeclaration === "reported") !== matchingCases) return null;
      data.dailySurveillance ||= [];
      const existing = data.dailySurveillance.find((item) =>
        item.date === body.date && item.departmentCode === req.user.departmentCode);
      const record = {
        id: existing?.id || makeId("dailySurveillance"),
        date: body.date, departmentCode: req.user.departmentCode, departmentName: req.user.departmentName,
        bundles: Object.fromEntries(BUNDLES.map((key) => [key, {
          eligible: body.bundles[key].eligible, compliant: body.bundles[key].compliant,
        }])),
        ...(body.caseDeclaration !== undefined ? { caseDeclaration: body.caseDeclaration } : {}),
        note: body.note === undefined ? (existing?.note || "") : body.note.trim(),
        employeeCode: req.user.employeeCode, submittedBy: req.user.fullName,
        submittedAt: new Date().toISOString(),
      };
      if (existing) {
        Object.assign(existing, record);
        if (body.caseDeclaration === undefined) delete existing.caseDeclaration;
      }
      else data.dailySurveillance.unshift(record);
      audit(data, req.user, "Gửi/cập nhật báo cáo KSNK hằng ngày", "dailySurveillance", record.id);
      return record;
    });
    if (!saved) return res.status(409).json({ message: "Trạng thái ca nghi ngờ phải khớp với phiếu ca của khoa trong ngày." });
    res.json({ item: saved });
  }));

  router.get("/summary", monthQuery, asyncRoute(async (req, res) => {
    const data = await readStore();
    res.json({ summary: monthlyStats(data, req.user, req.query.month) });
  }));

  router.get("/cases", rangeQuery, asyncRoute(async (req, res) => {
    const data = await readStore();
    const items = (data.surveillanceCases || []).filter((item) =>
      item.date >= req.query.from && item.date <= req.query.to &&
      departmentVisible(req.user, item.departmentCode))
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    res.json({ items });
  }));

  router.post("/cases", departmentMember, requireRecorder, asyncRoute(async (req, res) => {
    const body = req.body || {};
    if (!validDateTime(body.detectedAt) || !CASE_TYPES.includes(body.type) ||
        !filled(body.location) || !filled(body.findings) || !filled(body.initialAction) ||
        !ISOLATION_STATUSES.includes(body.isolationStatus) ||
        !ISOLATION_TYPES.includes(body.isolationType) ||
        !["notifiedTo", "notifiedAt"].every((key) => body[key] === undefined || text(body[key])) ||
        (body.notifiedAt && !validDateTime(body.notifiedAt))) {
      return res.status(400).json({ message: "Phiếu ca nghi ngờ chưa đủ trường hoặc có dữ liệu không hợp lệ." });
    }
    const item = await updateStore((data) => {
      data.surveillanceCases ||= [];
      const id = makeId("suspectedCase");
      const date = body.detectedAt.slice(0, 10);
      const record = {
        id, code: `NC-NKBV-${date.slice(0, 4)}-${id}`,
        date, detectedAt: body.detectedAt, type: body.type,
        departmentCode: req.user.departmentCode, departmentName: req.user.departmentName,
        location: body.location.trim(), findings: body.findings.trim(),
        isolationStatus: body.isolationStatus, isolationType: body.isolationType,
        initialAction: body.initialAction.trim(), notifiedTo: body.notifiedTo?.trim() || "",
        notifiedAt: body.notifiedAt || "", reportedBy: req.user.fullName,
        employeeCode: req.user.employeeCode, status: "Chờ KSNK tiếp nhận",
        councilStatus: "Chưa trình", councilReference: "", committeeDecision: "",
        decisionRationale: "", reviewedBy: "", decisionAt: "",
        timeline: [{ at: new Date().toISOString(), by: req.user.fullName, action: "Ghi nhận ca nghi ngờ; cần báo trực tiếp theo quy trình" }],
      };
      data.surveillanceCases.unshift(record);
      audit(data, req.user, "Ghi nhận ca nghi ngờ/cách ly", "surveillanceCase", id);
      return record;
    });
    res.status(201).json({ item, immediateNotificationRequired: true });
  }));

  router.patch("/cases/:id", ksnkReaders, asyncRoute(async (req, res) => {
    const body = req.body || {};
    const submitting = body.action === "submit-to-council" &&
      filled(body.councilReference);
    const adjudicating = body.action === "adjudicate" &&
      COUNCIL_DECISIONS.includes(body.decision) && filled(body.rationale);
    if (!submitting && !adjudicating) {
      return res.status(400).json({ message: "Thao tác thẩm định không hợp lệ hoặc thiếu mã biên bản/minh chứng." });
    }
    if (adjudicating && !roles(req.user).some((role) =>
      ["KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY"].includes(role))) {
      return res.status(403).json({ message: "Chỉ đầu mối KSNK được phân quyền mới được cập nhật kết luận do HĐKH cung cấp." });
    }
    const result = await updateStore((data) => {
      const item = (data.surveillanceCases || []).find((record) => record.id === req.params.id);
      if (!item) return { error: "Không tìm thấy phiếu ca nghi ngờ.", status: 404 };
      if (!departmentVisible(req.user, item.departmentCode)) return { error: "Không có quyền xem khoa này.", status: 403 };
      const now = new Date().toISOString();
      item.timeline ||= [];
      if (submitting) {
        if (item.councilStatus !== "Chưa trình") return { error: "Phiếu đã được trình hoặc thẩm định.", status: 409 };
        item.councilStatus = "Chờ HĐKH thẩm định";
        item.status = "Chờ HĐKH thẩm định";
        item.councilReference = body.councilReference.trim();
        item.councilSubmittedAt = now;
        item.timeline.push({ at: now, by: req.user.fullName, action: "Ghi nhận đã trình HĐKH thẩm định" });
      } else {
        if (item.councilStatus !== "Chờ HĐKH thẩm định") return { error: "Ca phải được ghi nhận trình HĐKH trước khi nhập kết luận.", status: 409 };
        item.councilStatus = body.decision === "Chưa đủ dữ liệu" ? "Chờ bổ sung" : "Đã thẩm định";
        item.status = item.councilStatus;
        item.committeeDecision = body.decision;
        item.decisionRationale = body.rationale.trim();
        item.reviewedBy = req.user.fullName;
        item.decisionAt = now;
        item.timeline.push({ at: now, by: req.user.fullName, action: `Cập nhật kết luận HĐKH: ${body.decision}` });
      }
      audit(data, req.user, "Cập nhật trình/kết luận ca nghi ngờ", "surveillanceCase", item.id);
      return { item };
    });
    if (result.error) return res.status(result.status).json({ message: result.error });
    res.json(result);
  }));

  router.get("/daily-status", ksnkReaders, dateQuery, asyncRoute(async (req, res) => {
    const data = await readStore();
    const memberships = eligibleMembers(data);
    const departments = [...new Map(memberships.map((member) => [member.departmentCode, member])).values()]
      .map((member) => dailyStats(data, member, req.query.date));
    const current = currentVietnamDateTime();
    const due = req.query.date < current.date || (req.query.date === current.date && current.hour >= 16);
    const missing = due ? departments.flatMap((item) => [
      ...(!item.doctorSubmitted ? [{ departmentCode: item.departmentCode, departmentName: item.departmentName, role: "Bác sĩ mạng lưới" }] : []),
      ...(item.nurseNames.length && !item.nurseHandHygieneSubmitted ? [{ departmentCode: item.departmentCode, departmentName: item.departmentName, role: "Điều dưỡng giám sát vệ sinh tay" }] : []),
    ]) : [];
    res.json({ date: req.query.date, due, dueTime: "16:00 (mốc demo, cần cấu hình/phê duyệt)", departments: departments.map((item) => ({
      ...item, alerts: missing.filter((alert) => alert.departmentCode === item.departmentCode),
    })), missing });
  }));

  router.get("/monthly-status", ksnkReaders, monthQuery, asyncRoute(async (req, res) => {
    const data = await readStore();
    const summary = monthlyStats(data, req.user, req.query.month);
    const departments = [...new Map(eligibleMembers(data)
      .filter((item) => departmentVisible(req.user, item.departmentCode))
      .map((item) => [item.departmentCode, item])).values()];
    const monthStart = `${req.query.month}-01`;
    const year = Number(req.query.month.slice(0, 4));
    const monthNumber = Number(req.query.month.slice(5, 7));
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const days = Array.from({ length: lastDay }, (_, index) => {
      const date = `${req.query.month}-${String(index + 1).padStart(2, "0")}`;
      return {
        date,
        departments: departments.map((member) => {
          const stats = dailyStats(data, member, date);
          return {
            departmentCode: member.departmentCode,
            departmentName: member.departmentName,
            doctorSubmitted: stats.doctorSubmitted,
            nurseHandHygieneSubmitted: stats.nurseHandHygieneSubmitted,
          };
        }),
      };
    });
    res.json({ summary, days, monthStart });
  }));
  return router;
}
