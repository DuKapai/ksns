
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { readStore, updateStore, makeId } from "./store.js";
import { doctorRouter } from "./doctor.js";
import { surveillanceRouter } from "./surveillance.js";
import { readDepartments } from "./departments.js";
import { validDate, validDateTime } from "./validation.js";
import {
  authenticateToken,
  constantTimeEqual,
  issueToken,
  safeUser,
} from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:4200";

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: allowedOrigin, credentials: false }));
app.use(express.json({ limit: "1mb" }));

// =====================================================
// 1. TÀI KHOẢN DEMO MẶC ĐỊNH
// Không cần HIS, không cần database để đăng nhập
// =====================================================

// =====================================================
// 2. HEALTH CHECK
// =====================================================

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    service: "ksnk-network-api",
    mode: "demo",
  }),
);

// =====================================================
// 3. XÁC THỰC NGƯỜI DÙNG
// =====================================================

async function currentUser(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(
      /^Bearer\s+/i,
      "",
    );

    const user = await authenticateToken(token);

    if (!user) {
      return res.status(401).json({
        message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("AUTH ERROR:", error.message);

    return res.status(401).json({
      message: "Không thể xác thực phiên đăng nhập.",
    });
  }
}

const hasRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.some((role) => req.user.roles?.includes(role))) {
      return res.status(403).json({
        message: "Tài khoản không có quyền truy cập chức năng này.",
      });
    }

    next();
  };

const canSeeAll = (user) =>
  user.roles?.some((role) =>
    [
      "KSNK_ADMIN",
      "NETWORK_LEAD",
      "NETWORK_DEPUTY",
      "NETWORK_SECRETARY",
    ].includes(role),
  );

const sameDepartmentOrAdmin = (req, departmentCode) =>
  canSeeAll(req.user) || req.user.departmentCode === departmentCode;

const audit = (data, user, action, entity, entityId) => {
  data.audit ||= [];

  data.audit.unshift({
    id: makeId("log"),
    at: new Date().toISOString(),
    user: user.fullName,
    username: user.username,
    action,
    entity,
    entityId,
  });

  data.audit = data.audit.slice(0, 500);
};

// =====================================================
// 4. ĐĂNG NHẬP DEMO
// =====================================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password, portal } = req.body || {};

    if (typeof username !== "string" || !username.trim() ||
        typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập tên đăng nhập và mật khẩu.",
      });
    }

    const portalRoles = {
      member: ["MEMBER_DOCTOR", "MEMBER_NURSE"],
      head: ["DEPARTMENT_HEAD"],
      ksnk: [
        "KSNK_ADMIN",
        "NETWORK_LEAD",
        "NETWORK_DEPUTY",
        "NETWORK_SECRETARY",
      ],
    };

    const normalizedUsername = username.trim().toLowerCase();
    const data = await readStore();
    const user = data.users.find(
      (item) =>
        item.username.toLowerCase() === normalizedUsername &&
        item.active &&
        constantTimeEqual(password, item.password),
    );
    if (!user) {
      return res.status(401).json({
        message: "Tên đăng nhập hoặc mật khẩu không đúng.",
      });
    }

    if (
      portal &&
      !portalRoles[portal]?.some((role) => user.roles.includes(role))
    ) {
      return res.status(403).json({
        message: "Tài khoản không được phân quyền vào phân hệ đã chọn.",
      });
    }

    const token = issueToken(user);

    return res.json({
      token,
      user: safeUser(user),
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      message: error.message || "Không thể đăng nhập DEMO.",
    });
  }
});

// =====================================================
// 5. THÔNG TIN TÀI KHOẢN ĐANG ĐĂNG NHẬP
// =====================================================

app.get("/api/auth/me", currentUser, (req, res) =>
  res.json({ user: safeUser(req.user) }),
);

app.get("/api/departments", currentUser, async (_req, res, next) => {
  try {
    res.json({ items: await readDepartments() });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// 6. DASHBOARD
// =====================================================

app.get("/api/dashboard", currentUser, async (req, res) => {
  const data = await readStore();

  const admin = canSeeAll(req.user);
  const dept = req.user.departmentCode;

  const risks = data.risks.filter(
    (x) => admin || x.departmentCode === dept,
  );

  const monitorings = data.monitorings.filter(
    (x) => admin || x.departmentCode === dept,
  );

  const reports = data.monthlyReports.filter(
    (x) => admin || x.departmentCode === dept,
  );

  res.json({
    metrics: {
      monitoringCount: monitorings.length,

      riskOpen: risks.filter(
        (x) => x.status !== "Đã đóng",
      ).length,

      riskHigh: risks.filter(
        (x) => x.severity === "Cao" && x.status !== "Đã đóng",
      ).length,

      reportsCount: reports.length,

      membersCount: admin
        ? data.members.length
        : data.members.filter(
            (x) => x.departmentCode === dept,
          ).length,
    },

    risks: risks.slice(0, 6),
    monitorings: monitorings.slice(0, 5),
    reports: reports.slice(0, 4),
  });
});

// =====================================================
// 7. NHIỆM VỤ
// =====================================================

app.get("/api/tasks", currentUser, async (req, res) => {
  const data = await readStore();
  const roles = req.user.roles;

  const tasks = data.tasks.filter(
    (t) =>
      (t.departmentCode === req.user.departmentCode ||
        roles.includes("KSNK_ADMIN")) &&
      (!t.assigneeRole ||
        roles.includes(t.assigneeRole) ||
        roles.includes("DEPARTMENT_HEAD") ||
        roles.includes("KSNK_ADMIN")),
  );

  res.json({ items: tasks });
});

// =====================================================
// 8. PHIẾU GIÁM SÁT
// =====================================================

app.get("/api/monitorings", currentUser, async (req, res) => {
  const data = await readStore();

  const items = data.monitorings
    .filter((x) =>
      sameDepartmentOrAdmin(req, x.departmentCode),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  res.json({ items });
});

app.post(
  "/api/monitorings",
  currentUser,
  hasRole("MEMBER_DOCTOR", "MEMBER_NURSE", "KSNK_ADMIN"),
  async (req, res) => {
    const body = req.body || {};

    if (!body.area || !body.method || !body.findings) {
      return res.status(400).json({
        message: "Vui lòng nhập lĩnh vực, phương pháp và kết quả giám sát.",
      });
    }

    const optionalFields = [
      "observedRole", "observedPerson", "observationMoment",
      "practiceResult", "procedure", "wasteType",
    ];
    if (optionalFields.some((key) => body[key] !== undefined && typeof body[key] !== "string")) {
      return res.status(400).json({
        message: "Thông tin quan sát bổ sung phải là chuỗi.",
      });
    }

    const parseCount = (value) => {
      if (value === undefined || value === null || value === "") return 0;
      if (typeof value !== "number" && typeof value !== "string") return NaN;
      return Number(value);
    };
    const sampleSize = parseCount(body.sampleSize);
    const compliant = parseCount(body.compliant);
    if (!Number.isSafeInteger(sampleSize) || sampleSize < 0 ||
        !Number.isSafeInteger(compliant) || compliant < 0 || compliant > sampleSize) {
      return res.status(400).json({
        message: "Cỡ mẫu và số đạt phải là số nguyên không âm; số đạt không được vượt cỡ mẫu.",
      });
    }

    const item = await updateStore((data) => {
      const record = {
        id: makeId("gs"),

        code: `GS-${new Date().getFullYear()}-${String(
          data.monitorings.length + 1,
        ).padStart(3, "0")}`,

        date: body.date || new Date().toISOString().slice(0, 10),

        departmentCode: req.user.departmentCode,
        departmentName: req.user.departmentName,

        area: body.area,
        observer: req.user.fullName,
        observerEmployeeCode: req.user.employeeCode || "",
        observerRole: req.user.roles?.includes("MEMBER_NURSE") ? "MEMBER_NURSE" :
          req.user.roles?.includes("MEMBER_DOCTOR") ? "MEMBER_DOCTOR" : "KSNK",
        method: body.method,

        sampleSize,
        compliant,

        findings: body.findings,
        evidence: body.evidence || "",
        ...Object.fromEntries(optionalFields.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])),

        status: "Đã ghi nhận",
      };

      data.monitorings.unshift(record);

      audit(
        data,
        req.user,
        "Tạo phiếu giám sát",
        "monitoring",
        record.id,
      );

      return record;
    });

    res.status(201).json({ item });
  },
);

// =====================================================
// 9. NGUY CƠ VÀ SỰ CỐ
// =====================================================

app.get("/api/risks", currentUser, async (req, res) => {
  const data = await readStore();

  const items = data.risks
    .filter((x) =>
      sameDepartmentOrAdmin(req, x.departmentCode),
    )
    .sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );

  res.json({ items });
});

app.post(
  "/api/risks",
  currentUser,
  hasRole("MEMBER_DOCTOR", "MEMBER_NURSE", "KSNK_ADMIN"),
  async (req, res) => {
    const body = req.body || {};

    if (
      !body.title ||
      !body.category ||
      !body.severity ||
      !body.description
    ) {
      return res.status(400).json({
        message: "Vui lòng nhập tên nguy cơ, lĩnh vực, mức độ và mô tả.",
      });
    }

    const optionalFields = [
      "discoveredAt", "location", "source", "notificationTarget",
      "notificationAt", "notificationMethod",
    ];
    if (
      optionalFields.some((key) => body[key] !== undefined && typeof body[key] !== "string") ||
      ["discoveredAt", "notificationAt"].some((key) => body[key] && !validDateTime(body[key]))
    ) {
      return res.status(400).json({
        message: "Thông tin bổ sung phải là chuỗi; thời gian phải hợp lệ.",
      });
    }

    const item = await updateStore((data) => {
      const now = new Date().toISOString();

      const record = {
        id: makeId("risk"),

        code: `NC-${new Date().getFullYear()}-${String(
          data.risks.length + 1,
        ).padStart(3, "0")}`,

        createdAt: now,

        departmentCode: req.user.departmentCode,
        departmentName: req.user.departmentName,

        title: body.title,
        category: body.category,
        severity: body.severity,
        description: body.description,

        immediateAction: body.immediateAction || "",

        reporter: req.user.fullName,
        employeeCode: req.user.employeeCode || "",
        ...Object.fromEntries(optionalFields.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])),
        status: "Mới ghi nhận",

        assignedTo:
          body.severity === "Cao"
            ? "Khoa KSNK-PCBT và lãnh đạo đơn vị"
            : "Trưởng khoa/Điều dưỡng trưởng",

        dueDate: body.dueDate || "",

        correction: "",
        verification: "",
        verifiedBy: "",

        timeline: [
          {
            at: now,
            by: req.user.fullName,

            action:
              body.severity === "Cao"
                ? "Báo cáo nguy cơ cao – cần thông báo ngay"
                : "Tạo báo cáo nguy cơ",
          },
        ],
      };

      data.risks.unshift(record);

      audit(
        data,
        req.user,
        "Tạo báo cáo nguy cơ",
        "risk",
        record.id,
      );

      return record;
    });

    res.status(201).json({
      item,
      alertRequired: item.severity === "Cao",
    });
  },
);

// =====================================================
// 10. CẬP NHẬT TIẾN ĐỘ XỬ LÝ NGUY CƠ
// =====================================================

app.patch("/api/risks/:id", currentUser, async (req, res) => {
  const body = req.body || {};

  const result = await updateStore((data) => {
    const item = data.risks.find(
      (x) => x.id === req.params.id,
    );

    if (!item) {
      return { error: "Không tìm thấy nguy cơ.", status: 404 };
    }

    if (!sameDepartmentOrAdmin(req, item.departmentCode)) {
      return { forbidden: true };
    }

    const now = new Date().toISOString();

    if (body.action === "accept") {
      if (
        !req.user.roles.some((r) =>
          [
            "DEPARTMENT_HEAD",
            "KSNK_ADMIN",
            "NETWORK_LEAD",
            "NETWORK_DEPUTY",
          ].includes(r),
        )
      ) {
        return { forbidden: true };
      }

      if (item.status !== "Mới ghi nhận") {
        return { error: "Chỉ được tiếp nhận nguy cơ mới ghi nhận.", status: 409 };
      }

      item.status = "Đã tiếp nhận";
      item.assignedTo = body.assignedTo || item.assignedTo;

      item.timeline ||= [];
      item.timeline.push({
        at: now,
        by: req.user.fullName,
        action: "Tiếp nhận và phân công xử lý",
      });
    } else if (body.action === "correct") {
      if (
        !req.user.roles.some((r) =>
          [
            "DEPARTMENT_HEAD",
            "KSNK_ADMIN",
            "MEMBER_DOCTOR",
            "MEMBER_NURSE",
          ].includes(r),
        )
      ) {
        return { forbidden: true };
      }

      if (typeof body.correction !== "string" || !body.correction.trim()) {
        return { error: "Cần mô tả biện pháp khắc phục." };
      }
      if (["responsible", "dueDate", "evidence"].some(
        (key) => body[key] !== undefined && typeof body[key] !== "string",
      ) || (body.dueDate && !validDate(body.dueDate))) {
        return { error: "Người phụ trách, hạn và minh chứng không hợp lệ." };
      }
      if (!["Đã tiếp nhận", "Đang khắc phục"].includes(item.status)) {
        return { error: "Chỉ được khắc phục nguy cơ đã tiếp nhận hoặc đang khắc phục.", status: 409 };
      }

      item.correction = body.correction;
      item.status = "Chờ kiểm tra lại";

      item.correctionHistory ||= [];
      item.correctionHistory.push({
        at: now,
        by: req.user.fullName,
        correction: body.correction,
        responsible: body.responsible || "",
        dueDate: body.dueDate || "",
        evidence: body.evidence || "",
      });
      item.timeline ||= [];
      item.timeline.push({
        at: now,
        by: req.user.fullName,
        action: "Cập nhật biện pháp khắc phục – chờ kiểm tra lại",
      });
    } else if (body.action === "verify") {
      if (
        !req.user.roles.some((r) =>
          ["KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY"].includes(r),
        )
      ) {
        return { forbidden: true };
      }

      if (typeof body.verification !== "string" || !body.verification.trim()) {
        return { error: "Cần ghi nhận kết quả kiểm tra lại." };
      }
      if (typeof body.passed !== "boolean") {
        return { error: "Kết quả kiểm tra passed phải là boolean." };
      }
      if (item.status !== "Chờ kiểm tra lại") {
        return { error: "Chỉ được kiểm tra nguy cơ đang chờ kiểm tra lại.", status: 409 };
      }

      item.verification = body.verification;
      item.verifiedBy = req.user.fullName;

      item.status = body.passed
        ? "Đã đóng"
        : "Đang khắc phục";

      item.timeline ||= [];
      item.timeline.push({
        at: now,
        by: req.user.fullName,

        action: body.passed
          ? "Kiểm tra lại đạt – đóng vấn đề"
          : "Kiểm tra lại chưa đạt – yêu cầu tiếp tục khắc phục",
      });
    } else {
      return { error: "Thao tác không hợp lệ." };
    }

    audit(
      data,
      req.user,
      `Cập nhật nguy cơ: ${body.action}`,
      "risk",
      item.id,
    );

    return { item };
  });

  if (result.error) {
    return res.status(result.status || 400).json({ message: result.error });
  }

  if (result.forbidden) {
    return res.status(403).json({
      message: "Không đủ quyền thực hiện thao tác này.",
    });
  }

  res.json(result);
});

// =====================================================
// 11. BÁO CÁO HOẠT ĐỘNG
// =====================================================

app.get("/api/reports", currentUser, async (req, res) => {
  const data = await readStore();

  res.json({
    items: data.monthlyReports
      .filter((x) =>
        sameDepartmentOrAdmin(req, x.departmentCode),
      )
      .sort((a, b) => b.month.localeCompare(a.month)),
  });
});

app.post(
  "/api/reports",
  currentUser,
  hasRole("MEMBER_DOCTOR", "MEMBER_NURSE", "KSNK_ADMIN"),
  async (req, res) => {
    const body = req.body || {};

    const item = await updateStore((data) => {
      const record = {
        id: makeId("report"),

        month:
          body.month ||
          new Date().toISOString().slice(0, 7),

        departmentCode: req.user.departmentCode,
        departmentName: req.user.departmentName,

        activities: body.activities || "",

        monitoringCount: Number(body.monitoringCount || 0),
        risksFound: Number(body.risksFound || 0),
        risksClosed: Number(body.risksClosed || 0),

        incidents: body.incidents || "",
        recommendations: body.recommendations || "",

        submittedBy: req.user.fullName,
        status: "Đã gửi",

        createdAt: new Date().toISOString(),
      };

      data.monthlyReports.unshift(record);

      audit(
        data,
        req.user,
        "Gửi báo cáo tháng",
        "monthlyReport",
        record.id,
      );

      return record;
    });

    res.status(201).json({ item });
  },
);

// =====================================================
// 12. QUẢN LÝ THÀNH VIÊN MẠNG LƯỚI
// =====================================================

app.get(
  "/api/members",
  currentUser,
  hasRole(
    "KSNK_ADMIN",
    "NETWORK_LEAD",
    "NETWORK_DEPUTY",
    "NETWORK_SECRETARY",
  ),
  async (_req, res) => {
    const data = await readStore();

    res.json({ items: data.members });
  },
);

app.post(
  "/api/members",
  currentUser,
  hasRole("KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_DEPUTY"),
  async (req, res, next) => {
    const body = req.body || {};

    if (
      !body.employeeCode ||
      !body.fullName ||
      !body.departmentCode ||
      !body.departmentName ||
      !body.memberType
    ) {
      return res.status(400).json({
        message: "Thiếu thông tin thành viên.",
      });
    }

    let departments;
    try {
      departments = await readDepartments();
    } catch (error) {
      return next(error);
    }
    const department = departments.find((item) =>
      item.makhoa === body.departmentCode && item.tenkhoa === body.departmentName);
    if (!department) {
      return res.status(400).json({
        message: "Khoa/phòng không có trong danh mục nhân sự hiện hành.",
      });
    }

    const item = await updateStore((data) => {
      const existing = data.members.find(
        (x) =>
          x.employeeCode === body.employeeCode &&
          x.departmentCode === body.departmentCode,
      );

      if (existing) {
        return {
          error: "Mã nhân viên đã có trong danh sách khoa.",
        };
      }

      const member = {
        id: makeId("member"),

        employeeCode: body.employeeCode,
        fullName: body.fullName,
        position: body.position || "",

        departmentCode: department.makhoa,
        departmentName: department.tenkhoa,

        memberType: body.memberType,

        networkTitle:
          body.networkTitle || "Thành viên mạng lưới",

        active: true,
      };

      data.members.push(member);

      audit(
        data,
        req.user,
        "Thêm thành viên mạng lưới",
        "member",
        member.id,
      );

      return { item: member };
    });

    if (item.error) {
      return res.status(409).json({
        message: item.error,
      });
    }

    res.status(201).json(item);
  },
);

// =====================================================
// 13. NHẬT KÝ HOẠT ĐỘNG
// =====================================================

app.get(
  "/api/audit",
  currentUser,
  hasRole("KSNK_ADMIN", "NETWORK_LEAD", "NETWORK_SECRETARY"),
  async (_req, res) => {
    const data = await readStore();

    res.json({
      items: data.audit.slice(0, 100),
    });
  },
);

// =====================================================
// 14. XỬ LÝ LỖI
// =====================================================

app.use("/api/doctor", doctorRouter({ currentUser, hasRole, sameDepartmentOrAdmin, audit }));
app.use("/api/surveillance", surveillanceRouter({ currentUser, hasRole, audit }));

app.use((err, _req, res, _next) => {
  console.error("API error:", err.message);

  res.status(500).json({
    message: "Có lỗi máy chủ. Kiểm tra nhật ký backend.",
  });
});

// =====================================================
// 15. KHỞI ĐỘNG SERVER
// =====================================================

app.listen(port, () => {
  console.log("-----------------------------------------");
  console.log("KSNK NETWORK API");
  console.log(`Địa chỉ: http://localhost:${port}`);
  console.log("Chế độ: DEMO");
  console.log("Đăng nhập: tài khoản trong dữ liệu demo");
  console.log("-----------------------------------------");
});
