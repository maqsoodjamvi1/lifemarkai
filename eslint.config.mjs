import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

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
    // eslint-config-next registers its Next and TypeScript plugins, but its flat
    // presets do not expose the React plugins to this separate override object.
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      // The active application is TanStack Start, so Next.js page/image rules
      // produce false positives and filesystem warnings for valid Vite code.
      "@next/next/no-html-link-for-pages": "off",
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
