/**
 * 浏览器端持久化：把内存 SQLite 的二进制快照存进 IndexedDB。
 *
 * 方案取舍：sql.js 是纯内存库，没有增量写盘；快照整存整取对日历这种
 * 小体量数据（数百 KB ~ 数 MB）开销可忽略，且跨 iOS WKWebView / 安卓 /
 * 桌面浏览器行为一致。写入时机（调用方控制）：
 *   - 每次写操作后防抖触发（openLocalDb 内置）
 *   - 页面隐藏/关闭时强制 flush
 */

const DB_NAME = 'tt-calendar-local'
const STORE = 'kv'
const KEY = 'sqlite-bytes'

function withStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE)
    }
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction(STORE, mode)
      resolve(tx.objectStore(STORE))
      // 事务完成后关闭连接，避免长期占用（iOS 对持久连接更挑剔）
      tx.oncomplete = () => db.close()
    }
    open.onerror = () => reject(open.error ?? new Error('IndexedDB 打开失败'))
  })
}

/** 读取上次保存的库快照；首次使用返回 null */
export function idbGetBytes(): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    void withStore('readonly')
      .then((store) => {
        const req = store.get(KEY)
        req.onsuccess = () => {
          const v = req.result
          resolve(v instanceof Uint8Array ? v : v ? new Uint8Array(v as ArrayBuffer) : null)
        }
        req.onerror = () => reject(req.error ?? new Error('IndexedDB 读取失败'))
      })
      .catch(reject)
  })
}

/** 保存库快照 */
export function idbPutBytes(bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    void withStore('readwrite')
      .then((store) => {
        const req = store.put(bytes, KEY)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error ?? new Error('IndexedDB 写入失败'))
      })
      .catch(reject)
  })
}
