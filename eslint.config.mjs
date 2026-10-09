import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".output/**",
      ".vercel/**",
      ".nitro/**",
      "node_modules/**",
      "src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["off", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='randomUUID']",
          message:
            "Use newId() from src/lib/id.ts — crypto.randomUUID is missing on Orion/WebKit and HTTP.",
        },
        {
          selector: "CallExpression[callee.name='randomUUID']",
          message:
            "Use newId() from src/lib/id.ts — crypto.randomUUID is missing on Orion/WebKit and HTTP.",
        },
      ],
    },
  },
  {
    files: ["src/lib/portal/types.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message:
                "portal/types.ts is imported by the client. Do not import Node builtins here.",
            },
            {
              group: ["./store", "./session", "./view", "./fns-*"],
              message:
                "portal/types.ts must stay isomorphic. Do not import store, session, view, or server fns.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/routes/**/*.{ts,tsx}",
      "src/lib/portal-dnd.ts",
      "src/lib/portal-ui.ts",
      "src/lib/layout-place.ts",
      "src/lib/tag-ui.ts",
      "src/lib/card-*.ts",
      "src/lib/use-portal-*.ts",
      "src/lib/i18n.ts",
      "src/lib/item-kind.ts",
      "src/lib/safe-href.ts",
      "src/lib/ui-prefs.ts",
      "src/lib/doc-rev.ts",
      "src/lib/session-gone.ts",
      "src/lib/portal-client-session.ts",
      "src/lib/icons.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message:
                "Client-reachable modules cannot import Node builtins. Keep them in *-runtime.ts or portal store/session/view/fns.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
