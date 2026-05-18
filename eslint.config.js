import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        ignores: ["coverage/**", "dist/**"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                window: "readonly",
                document: "readonly",
                localStorage: "readonly",
                navigator: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                performance: "readonly",
                requestAnimationFrame: "readonly",
                cancelAnimationFrame: "readonly",
                URLSearchParams: "readonly",
                Math: "readonly",
                Audio: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "warn",
            "no-undef": "warn"
        }
    }
];