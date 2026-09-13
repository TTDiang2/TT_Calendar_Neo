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
 * 补一个最小实现（jisilu 源的请求超时用）；throwIfAborted/reason 要
 * Safari 15.4+，同批补齐（同步层 p-retry 会调）。
 *
 * 整体 try/catch：本文件在模块顶层执行，任何一条赋值在某个 WebView 上抛
 * TypeError（平台对象不可扩展之类）都会让模块求值失败 → 直接白屏且
 * bootlog 一行都没有——绝不能让兜底本身变成事故（智者 P1）。
 */

type CryptoLike = {
  randomUUID?: () => string
  getRandomValues?: (b: Uint8Array) => Uint8Array
}

function installCryptoPolyfill(): void {
  const cryptoOwner = globalThis as { crypto?: CryptoLike }
  if (typeof cryptoOwner.crypto?.randomUUID === 'function') return
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
    ;(cryptoOwner.crypto as { randomUUID?: () => string }).randomUUID = uuidV4
  } else {
    ;(globalThis as unknown as { crypto: CryptoLike }).crypto = { randomUUID: uuidV4 }
  }
}

function installAbortSignalPolyfills(): void {
  const owner = globalThis as unknown as {
    AbortSignal?: (typeof AbortSignal) & { timeout?: (ms: number) => AbortSignal }
    AbortController?: typeof AbortController
  }
  // AbortSignal.timeout（Safari 16.4+ 才有）
  if (
    owner.AbortSignal &&
    typeof (owner.AbortSignal as { timeout?: unknown }).timeout !== 'function' &&
    owner.AbortController
  ) {
    owner.AbortSignal.timeout = (ms: number): AbortSignal => {
      const controller = new owner.AbortController!()
      setTimeout(() => controller.abort(new Error(`timeout ${ms}ms`)), ms)
      return controller.signal
    }
  }
  // AbortSignal.prototype.throwIfAborted / signal.reason（Safari 15.4+）
  const proto = owner.AbortSignal?.prototype as
    | ({ throwIfAborted?: () => void } & AbortSignal)
    | undefined
  if (proto && typeof proto.throwIfAborted !== 'function') {
    proto.throwIfAborted = function (this: AbortSignal): void {
      if (this.aborted) {
        const reason = (this as unknown as { reason?: unknown }).reason
        throw reason instanceof Error ? reason : new Error(String(reason ?? 'Aborted'))
      }
    }
  }
}

try {
  installCryptoPolyfill()
} catch {
  // 兜底失败不能拖垮模块求值；真机会在第一次建 UUID 时报出具体错误
}
try {
  installAbortSignalPolyfills()
} catch {
  // 同上：没有 timeout/throwIfAborted 时，相关请求路径会自己报错暴露问题
}

export {}
