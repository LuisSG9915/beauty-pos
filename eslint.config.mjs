import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".open-next/**",
    ".wrangler/**",
    "next-env.d.ts",
    // Generado por `wrangler types` (cf:typegen): sus eslint-disable sin uso
    // cambian con cada versión de workerd y no son accionables.
    "worker-configuration.d.ts",
  ]),
]);

export default eslintConfig;
