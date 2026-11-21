import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.resolve(here, "../../server/src");
const aliases = {
  express: "router.js", cors: "middleware.js", helmet: "middleware.js",
  "./store.js": "store.js", "./auth.js": "auth.js", "./departments.js": "departments.js"
};
await build({
  entryPoints: [path.join(here, "entry.js")],
  outfile: path.resolve(here, "../src/demo-api.generated.mjs"),
  bundle: true, platform: "browser", format: "esm",
  define: { "process.env.PORT": "undefined", "process.env.CLIENT_ORIGIN": "undefined" },
  plugins: [{
    name: "browser-adapters",
    setup(builder) {
      builder.onResolve({ filter: /^(express|cors|helmet)$/ }, args => ({ path: path.join(here, aliases[args.path]) }));
      builder.onResolve({ filter: /^\.\/(store|auth|departments)\.js$/ }, args =>
        args.resolveDir === server ? { path: path.join(here, aliases[args.path]) } : null);
      builder.onResolve({ filter: /^dotenv\/config$/ }, () => ({ path: path.join(here, "empty.js") }));
      builder.onLoad({ filter: /index\.js$/ }, async args => {
        if (args.path !== path.join(server, "index.js")) return null;
        const source = await readFile(args.path, "utf8");
        const marker = "\napp.listen(port,";
        const end = source.indexOf(marker);
        if (end < 0) throw new Error("Cannot locate backend startup; browser build aborted.");
        return { contents: source.slice(0, end) + "\nexport { app };\n", resolveDir: server };
      });
    }
  }]
});
