// Bundles the API into dist/server/index.js. node_modules stay external (installed in production).
import { build } from "esbuild";

await build({
  entryPoints: ["server/src/index.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
});
