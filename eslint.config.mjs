import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint 9 flat config — migrated from .eslintrc.json.
 * `npm run lint` was broken after the ESLint 9 / eslint-config-next 16
 * upgrade: v9 requires eslint.config.*, and eslint-config-next 16 ships
 * native flat configs (no FlatCompat needed).
 */
const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "gateway/**",
      "electron/**",
      "public/embed/**",
      "next-env.d.ts",
      "__sim.js",
      "check-divs.js",
      "scripts/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@next/next/no-img-element": "warn",
    },
  },
];

export default eslintConfig;
