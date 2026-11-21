import crypto from "node:crypto";
import { readStore } from "./store.js";

const secret =
  process.env.JWT_SECRET || "demo-only-change-this-secret-before-use";
const ttlSeconds = 60 * 60 * 8;

function b64(value) {
  return Buffer.from(value).toString("base64url");
}
function sign(value) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}
export function issueToken(user) {
  const { password, ...safe } = user;
  const payload = b64(
    JSON.stringify({
      user: safe,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    }),
  );
  const content = `v1.${payload}`;
  return `${content}.${sign(content)}`;
}

export async function authenticateToken(token) {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const content = `${parts[0]}.${parts[1]}`;
  const expected = sign(content);
  const actual = parts[2];

  const a = Buffer.from(expected);
  const b = Buffer.from(actual);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );

    if (!payload.user?.id || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    // Tài khoản demo được khai báo trực tiếp trong index.js.
    if (payload.user.authSource === "demo") {
      return payload.user;
    }

    // Tài khoản có trong dữ liệu nội bộ.
    const store = await readStore();
    const local = store.users.find((u) => u.id === payload.user.id);

    if (local) {
      return local.active ? local : null;
    }

    // Tài khoản xác thực từ hệ thống bệnh viện.
    if (payload.user.authSource === "hospital-api") {
      return payload.user;
    }

    return null;
  } catch {
    return null;
  }
}

export function safeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

export function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
