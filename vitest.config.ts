import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * 单一 vitest 配置覆盖整个 monorepo。
 * include 用通配的星号前缀，这样无论从 monorepo 根目录还是从子包目录
 * （pnpm --filter xxx test）跑，模式都能命中。
 * packages/domain 与 packages/contracts 跑在 node 环境（零 IO 纯逻辑），
 * packages/ui 的组件测试跑在 jsdom（tsx 一律 jsdom）。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@tt-calendar/contracts': r('./packages/contracts/src/index.ts'),
      '@tt-calendar/domain': r('./packages/domain/src/index.ts'),
      '@tt-calendar/db': r('./packages/db/src/index.ts'),
      '@tt-calendar/ui': r('./packages/ui/src/index.ts'),
    },
  },
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.workbuddy/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    globals: false,
    // better-sqlite3 是原生模块，外部化避免被 vite 转换
    server: {
      deps: {
        external: [/better-sqlite3/, /drizzle-orm/],
      },
    },
  },
})
