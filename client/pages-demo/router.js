function matchPath(pattern, pathname, prefix) {
  const expected = pattern.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  if (actual.length < expected.length || (!prefix && actual.length !== expected.length)) return null;
  const params = {};
  for (let i = 0; i < expected.length; i++) {
    if (expected[i].startsWith(":")) params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
    else if (expected[i] !== actual[i]) return null;
  }
  return params;
}

class RouterImpl {
  constructor() { this.layers = []; }
  use(path, ...handlers) {
    if (typeof path !== "string") { handlers.unshift(path); path = "/"; }
    for (const handler of handlers) {
      if (handler instanceof RouterImpl) {
        for (const layer of handler.layers) {
          this.layers.push({ ...layer, path: `${path.replace(/\/$/, "")}${layer.path}` || "/" });
        }
      } else if (handler.length !== 4) {
        this.layers.push({ path, handlers: [handler], prefix: true });
      }
    }
  }
  route(method, path, handlers) { this.layers.push({ method, path, handlers, prefix: false }); }
  get(path, ...handlers) { this.route("GET", path, handlers); }
  post(path, ...handlers) { this.route("POST", path, handlers); }
  put(path, ...handlers) { this.route("PUT", path, handlers); }
  patch(path, ...handlers) { this.route("PATCH", path, handlers); }

  async dispatch(method, url, body, headers) {
    const parsed = new URL(url, "https://demo.invalid");
    const req = { body, headers, query: Object.fromEntries(parsed.searchParams), params: {} };
    const res = {
      statusCode: 200, finished: false, body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; this.finished = true; return this; }
    };
    const handlers = [];
    for (const layer of this.layers) {
      if (layer.method && layer.method !== method) continue;
      const params = matchPath(layer.path, parsed.pathname, layer.prefix);
      if (params !== null) handlers.push(...layer.handlers.map((handler) => ({ handler, params })));
    }
    async function run(index) {
      if (res.finished || index >= handlers.length) return;
      const { handler, params } = handlers[index];
      req.params = params;
      let nextPromise;
      const next = (error) => {
        nextPromise = error ? Promise.reject(error) : run(index + 1);
        return nextPromise;
      };
      await handler(req, res, next);
      if (nextPromise) await nextPromise;
    }
    try {
      await run(0);
      if (!res.finished) return { status: 404, body: { message: "Không tìm thấy chức năng demo." } };
      return { status: res.statusCode, body: res.body };
    } catch (error) {
      console.error("Browser demo API error:", error);
      return { status: 500, body: { message: "Không thể xử lý hoặc lưu dữ liệu demo trong trình duyệt. Kiểm tra bộ nhớ trình duyệt." } };
    }
  }
}

export function Router() { return new RouterImpl(); }
function express() { return new RouterImpl(); }
express.json = () => (_req, _res, next) => next();
export default express;
