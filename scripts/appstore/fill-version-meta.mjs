// 一次性脚本：填充 App Store 版本页文案（描述/关键词/支持链接/宣传文本）
// 用法：node fill-version-meta.mjs <versionLocalizationId>
import { readFileSync } from 'node:fs'

const KEY_ID = process.env.ASC_KEY_ID
const ISSUER = process.env.ASC_ISSUER_ID
const { createSign } = await import('node:crypto')
const b64url = (b) => Buffer.from(b).toString('base64url')
function derToRaw(der) {
  let off = 2
  const readInt = () => {
    const len = der[off + 1]
    const v = der.subarray(off + 2, off + 2 + len)
    off += 2 + len
    return v
  }
  const r = readInt(), s = readInt()
  const pad = (v) => {
    const t = v.length > 32 ? v.subarray(v.length - 32) : v
    return Buffer.concat([Buffer.alloc(32 - t.length, 0), t])
  }
  return Buffer.concat([pad(r), pad(s)])
}
function jwt() {
  const now = Math.floor(Date.now() / 1000)
  const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }))
  const p = Buffer.from(JSON.stringify({ iss: ISSUER, iat: now - 10, exp: now + 1200, aud: 'appstoreconnect-v1' }))
  const si = `${b64url(h)}.${b64url(p)}`
  const der = createSign('SHA256').update(si).sign(readFileSync(process.env.ASC_KEY_PATH))
  return `${si}.${Buffer.from(derToRaw(der)).toString('base64url')}`
}

const DESCRIPTION = `TT 日历是一张「会记录你生活」的日历：月历上染色、待办里打勾、倒数日里期待——日子过成什么样，一眼看得见。

【染色月历】
每天一格，用颜色记录充实度与完成度：忙是暖黄，沉淀是绿，纪念是紫。一个月过得如何，开屏即见。

【待办管理】
· 截止日 + 计划日 + 重要性三轴排序，先做真正要紧的事
· 列表 / 四象限矩阵 / 甘特 / 便签多种视图，手机桌面一眼定位
· 重复待办：每日、每工作日、每周，完成后自动生成下一期，拖延补卡也不产生过期待办
· 闹钟提醒：到点弹系统通知，重要事项不错过

【日程与重要日期】
· 日程条目带起止时间，按「工作 / 课程 / 运动 / 玩耍」分色
· 重要日期单独标注，生日、纪念日、考试一页打尽

【倒数日】
距离考试、上线、假期还有几天？卡片倒排，每年重复的日子自动推算下一期。

【数据洞察】
· 贡献热力图：近 26 周每日完成量，GitHub 风格
· 连续打卡纪录与里程碑徽章：初试身手 → 千锤百炼
· 忙度预测：未来 14 天负载提前看见，合理安排加与减

【你的数据，完全属于你】
· 数据本地存储，离线全功能可用
· 可选 GitHub 私有仓多端同步：桌面、手机双向合并，换机不丢数据
· 无广告、无内嵌追踪

【桌面小组件】
今日待办、日程、倒数日直接铺在主屏；本月完成热力一格一格长出来。

让每一天被看见，把坚持留下来。`

const KEYWORDS = '日历,待办,倒数日,日程,打卡,习惯,计划,热力图,提醒,时间管理,清单,纪念日,月历,效率,小组件'
const PROMO = '重复待办上线：每天/每工作日/每周，点完自动排下一期，拖延补卡不过期。'

const id = process.argv[2]
const body = {
  data: {
    type: 'appStoreVersionLocalizations',
    id,
    attributes: {
      description: DESCRIPTION,
      keywords: KEYWORDS,
      promotionalText: PROMO,
      supportUrl: 'https://github.com/TTDiang2/TT_Calendar_Neo',
      marketingUrl: 'https://github.com/TTDiang2/TT_Calendar_Neo',
    },
  },
}
const { spawnSync } = await import('node:child_process')
const fs = await import('node:fs')
fs.writeFileSync('body-version-loc.json', JSON.stringify(body))
const r = spawnSync('curl', [
  '-sS', '--max-time', '60', '-X', 'PATCH',
  `https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/${id}`,
  '-H', `Authorization: Bearer ${jwt()}`,
  '-H', 'Content-Type: application/json',
  '--data', '@body-version-loc.json',
], { encoding: 'utf8' })
const out = JSON.parse(r.stdout)
if (out.errors) {
  console.error('ERR:', out.errors[0].detail)
  process.exit(1)
}
const a = out.data.attributes
console.log('描述长度:', a.description.length, '字符')
console.log('关键词:', a.keywords)
console.log('宣传文本:', a.promotionalText)
console.log('支持链接:', a.supportUrl)
