/**
 * 移动端运行环境的低成本兜底（在 worker 与主线程两个 realm 都会执行，
 * 因为 db-core.ts 同时存在于两者的模块图里）。
 *
 * tauri:// 自定义协议 origin 不是安全上下文（SecureContext），而
 * crypto.randomUUID 是 [SecureContext] API——在 iOS WKWebView 里很可能拿
 * 不到，一旦缺失，本地库能打开但所有新建操作都会报
 * "crypto.randomUUID is not a function"。getRandomValues 不受安全上下文
 * 限制，用它补一个 v4 实现。
 *
 * AbortSignal.timeout 要 Safari 16.4+，App 声明的最低版本是 15.0，这里
 * 补一个最小实现（jisilu 源的请求超时用）。
 */

// crypto.randomUUID polyfill（v4，来自 getRandomValues）
const cryptoOwner = globalThis as { crypto?: Crypto }
if (typeof cryptoOwner.crypto?.randomUUID !== 'function') {
  const getRandom =
    cryptoOwner.crypto?.getRandomValues?.bind(cryptoOwner.crypto) ??
    (() => {
      throw new Error('crypto.getRandomValues 不可用，无法生成 UUID')
    })
  const uuidV4 = (): `${string}-${string}-${string}-${string}-${string}` => {
    const b = getRandom(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  if (cryptoOwner.crypto) {
    ;(cryptoOwner.crypto as unknown as { randomUUID?: () => string }).randomUUID = uuidV4
  } else {
    ;(globalThis as unknown as { crypto: unknown }).crypto = { randomUUID: uuidV4 }
  }
}

// AbortSignal.timeout polyfill（Safari 16.4+ 才有）
const signalOwner = globalThis as unknown as {
  AbortSignal?: { timeout?: (ms: number) => AbortSignal }
  AbortController?: typeof AbortController
}
if (signalOwner.AbortSignal && typeof signalOwner.AbortSignal.timeout !== 'function' && signalOwner.AbortController) {
  signalOwner.AbortSignal.timeout = (ms: number): AbortSignal => {
    const controller = new signalOwner.AbortController!()
    setTimeout(() => controller.abort(new Error(`timeout ${ms}ms`)), ms)
    return controller.signal
  }
}

export {}
