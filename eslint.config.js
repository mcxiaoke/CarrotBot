import eslint from "@eslint/js"
import prettierConfig from "eslint-config-prettier"
import prettierPlugin from "eslint-plugin-prettier"
import tseslint from "typescript-eslint"
import nodeGlobals from "globals"

const prettierRules = {
    ...prettierConfig.rules,
    "prettier/prettier": "off",
}

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,

    {
        languageOptions: {
            globals: {
                ...nodeGlobals.node,
            },
            ecmaVersion: "latest",
            sourceType: "module",
        },
        rules: {
            "no-useless-assignment": "off",
            "no-console": "off",
            "no-unused-vars": "off",
            "no-empty": "off",
            "no-fallthrough": "off",
            "no-prototype-builtins": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-require-imports": "off",
        },
    },

    {
        plugins: {
            prettier: prettierPlugin,
        },
        rules: prettierRules,
    },

    {
        ignores: [
            "node_modules/**",
            "dist/**",
            "coverage/**",
            "*.log",
            "**/node_modules/*",
        ],
    },
)
