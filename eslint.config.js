import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

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
    // Node 脚本（ESM，.mjs，如 scripts/patch-ios-ats.mjs）跑在 Node 里
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
)
