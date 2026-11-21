import { app } from "../../server/src/index.js";
export function dispatch(method, url, body, headers) {
  return app.dispatch(method, url, body, headers);
}
