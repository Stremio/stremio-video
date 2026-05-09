import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([globalIgnores(["*", "!src"]), {
    extends: compat.extends("eslint:recommended"),

    languageOptions: {
        globals: {
            ...globals.commonjs,
            ...globals.browser,
            YT: "readonly",
            Promise: "readonly",
            cast: "readonly",
        },

        ecmaVersion: 8,
        sourceType: "script",
    },

    rules: {
        "arrow-parens": "error",
        "arrow-spacing": "error",
        "block-spacing": "error",
        "comma-spacing": "error",
        "eol-last": "error",
        eqeqeq: "error",
        "func-call-spacing": "error",

        indent: ["error", 4, {
            SwitchCase: 1,
        }],

        "no-console": ["error", {
            allow: ["warn"],
        }],

        "no-extra-semi": "error",
        "no-eq-null": "error",
        "no-multi-spaces": "error",

        "no-multiple-empty-lines": ["error", {
            max: 1,
        }],

        "no-empty": ["error", {
            allowEmptyCatch: true,
        }],

        "no-inner-declarations": "off",
        "no-prototype-builtins": "off",
        "no-template-curly-in-string": "error",
        "no-trailing-spaces": "error",
        "no-useless-concat": "error",
        "no-unreachable": "error",

        "no-unused-vars": ["error", {
            varsIgnorePattern: "^_",
            argsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_"
        }],

        quotes: ["error", "single"],

        "quote-props": ["error", "as-needed", {
            unnecessary: false,
        }],

        semi: "error",
        "semi-spacing": "error",
        curly: ["error", "multi-line"],
        "space-before-blocks": "error",

        "valid-typeof": ["error", {
            requireStringLiterals: true,
        }],

        "no-redeclare": "off",
    },
}]);