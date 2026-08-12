import js from "@eslint/js";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * ESLint 9 flat config for the root TanStack Start application.
 * Next.js-specific presets were intentionally removed during the root
 * promotion so linting no longer depends on the retired Next runtime.
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
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.cjs"],
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly",
      },
    },
  },
  {
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-require-imports": "warn",
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
      "no-constant-binary-expression": "warn",
      "no-control-regex": "warn",
      "no-empty": "warn",
      "no-irregular-whitespace": "warn",
      "no-shadow-restricted-names": "warn",
      "no-useless-escape": "warn",
    },
  },
];

export default eslintConfig;
