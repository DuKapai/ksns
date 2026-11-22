import { readStore } from "./store.js";
const key = "ksnk_pages_sessions_v2";
export function safeUser(user) { const { password, ...safe } = user; return safe; }
export function constantTimeEqual(left, right) { return String(left) === String(right); }
export function issueToken(user) {
  const token = crypto.randomUUID();
  const sessions = JSON.parse(localStorage.getItem(key) || "{}");
  sessions[token] = { id: user.id, expires: Date.now() + 8 * 60 * 60 * 1000 };
  localStorage.setItem(key, JSON.stringify(sessions));
  return token;
}
export async function authenticateToken(token) {
  const session = JSON.parse(localStorage.getItem(key) || "{}")[token];
  if (!session || session.expires < Date.now()) return null;
  return (await readStore()).users.find((user) => user.id === session.id && user.active) || null;
}
