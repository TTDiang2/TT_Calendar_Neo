import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import { readFileSync } from 'node:fs'

// i18n 中文棘轮白名单（scripts/i18n-allowlist.mjs 生成/修剪）：
// 还没完成抽词的文件列在这里面（中文串规则对它们暂不生效）。
// 每抽完一个文件重跑脚本，文件会自动移出白名单；白名单归零 = 抽词完成。
// 规则细节见 scripts/i18n-allowlist.mjs 头注释。
const i18nAllowlist = JSON.parse(readFileSync('./eslint-i18n-allowlist.json', 'utf8'))

const CN_STRING_RULES = [
  {
    selector: 'Literal[value=/[\\u4e00-\\u9fff]/]',
    message: 'UI 字符串字面量含中文：必须走 t()（packages/ui/src/i18n）。用户数据/持久化 key 除外——若属此类请勿写在本目录。',
  },
  {
    selector: 'JSXText[value=/[\\u4e00-\\u9fff]/]',
    message: 'JSX 文本含中文：必须改为 {t(...)}（packages/ui/src/i18n）。',
  },
  {
    selector: 'TemplateElement[value.raw=/[\\u4e00-\\u9fff]/]',
    message: '模板串含中文：必须走 t()/tPlural() 具名插值（packages/ui/src/i18n）。',
  },
]

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/target/**',
      '**/src-tauri/**',
      '**/.vite/**',
      '**/_trash_*/**',
      '**/_tmp_*/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // 20260917 智者终审建议：tsc/冒烟测试是 hooks 顺序违规的盲区
      // （StatsView 曾因此漏过必崩 bug），规则能查每一次
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // 本项目大量使用 Record<string, any> 描述 SQLite 的 extra_json / config_json
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'module' },
  },
  {
    // Node 脚本（如 scripts/make-icon.cjs）跑在 Node 里、用 CommonJS，
    // 需要 Node 全局对象；否则 require/process/Buffer 会被当成未定义。
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2022,
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        globalThis: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  {
    // Node 脚本（ESM，.mjs，如 scripts/patch-ios-plist.mjs）跑在 Node 里
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 2022,
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        globalThis: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    // 各端的数据服务（server.ts）同样跑在 Node 里
    files: ['apps/*/server.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    // ── i18n 中文棘轮（2026-09-30 本地化任务书）───────────────────────────────
    // 面向用户的 UI 代码禁止硬编码中文字符串字面量；白名单外的文件每新增一条
    // 中文串（字面量/JSX 文本/模板串）都会报错。注释不受影响（不是 AST Literal）。
    // 豁免：测试文件、i18n 字典本身、白名单（未抽完的存量文件）。
    files: [
      'packages/ui/src/**/*.{ts,tsx}',
      'apps/mobile/src/**/*.{ts,tsx}',
      'packages/domain/src/**/*.ts',
    ],
    ignores: [
      '**/__tests__/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      'packages/ui/src/i18n/**',
      ...i18nAllowlist,
    ],
    rules: {
      'no-restricted-syntax': ['error', ...CN_STRING_RULES],
    },
  },
)
