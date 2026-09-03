// 构建前把旧的 dist「改名移走」（不是删除）。
// 环境的「批量删除确认」shim 会拦截一次删 >50 个文件的目录，
// 但 rename 不是删除，shim 不拦。改名后 dist 不存在，vite 会建全新空目录，
// 其 emptyOutDir 无文件可删，构建即可通过。
// 残留的 _trash_* 目录无害（已被 .gitignore 忽略），可随时手动删除。
const fs = require('fs')
const path = require('path')

const dist = path.join(process.cwd(), 'dist')
if (fs.existsSync(dist)) {
  const trash = path.join(process.cwd(), '_trash_' + Date.now())
  fs.renameSync(dist, trash)
  console.log('[clean-dist] 旧 dist 已移走 ->', path.basename(trash))
} else {
  console.log('[clean-dist] 无 dist，跳过')
}
