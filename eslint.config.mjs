import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["components/decision-app.tsx"],
    rules: {
      // The decision model is restored from browser localStorage after hydration.
      // This is an intentional one-time synchronization with an external system.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "node_modules/**"]),
]);
