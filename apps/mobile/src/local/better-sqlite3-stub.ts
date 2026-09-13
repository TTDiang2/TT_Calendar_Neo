/**
 * better-sqlite3 的浏览器占位。
 *
 * packages/db 走 drizzle-orm/better-sqlite3 的泛型入口，但实际传入的是
 * sql.js shim 客户端（SqlJsSqlite），永远不会构造原生 Client（只有把
 * 数据库文件路径字符串传给 drizzle() 时才会）。没有这个 stub，Vite 会把
 * better-sqlite3 及其 Node 依赖（bindings/fs/process）打进浏览器包，并在
 * 模块求值阶段就抛错——主包直接白屏（2026-09-13 智者用 Chromium 实测复现）。
 *
 * 本 stub 只存在于 apps/mobile 的构建里（vite resolve.alias 指向这里），
 * 不影响 Node 侧真实使用 better-sqlite3 的包。
 */
export default class BetterSqlite3Stub {
  constructor() {
    throw new Error(
      '[mobile] better-sqlite3 原生客户端不应在浏览器里被构造；数据库应使用 sql.js shim',
    )
  }
}
