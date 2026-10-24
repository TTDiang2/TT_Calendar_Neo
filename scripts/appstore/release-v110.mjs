#!/usr/bin/env node
/**
 * release-v110.mjs — 1.1.0 版本的 ASC 发布自动化（本地直连 API，凭据走环境变量）
 *
 * 用法:
 *   export ASC_KEY_PATH=... ASC_KEY_ID=... ASC_ISSUER_ID=...
 *   node release-v110.mjs create   # 建 1.1.0 版本记录 + 8 语言本地化 + 年龄分级 + 审核信息
 *   node release-v110.mjs screens  # 给全部 8 个本地化传截图（slide-01..08 按 ASO 顺序）
 *   node release-v110.mjs submit   # 等 1.1.0 构建 VALID → 挂构建 → 提交审核
 *   node release-v110.mjs status   # 打印当前版本/构建/截图就绪状态
 *
 * 幂等：每阶段先查后写，重复运行安全。状态落在 artifacts/asc/v110-state.json。
 * 复刻 1.0.0 提审流（reviewSubmissions 三步），排错诀窍：associatedErrors 逐项列缺。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createSign } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const META = JSON.parse(readFileSync(join(HERE, 'v110', 'metadata.json'), 'utf8'))
const STATE_PATH = join(ROOT, 'artifacts', 'asc', 'v110-state.json')
const TMP = join(ROOT, 'artifacts', 'asc', '_tmp-v110.json')

const APP_ID = META.appId
const APPINFO_ID = META.appInfoId
const V110 = META.versionString

// ---------- JWT + API（照抄 upload-screenshots.mjs 的成熟封装，curl 加 -g 防括号通配）----------
const KEY_ID = process.env.ASC_KEY_ID
const ISSUER = process.env.ASC_ISSUER_ID
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
function api(method, path, body) {
  const args = ['-sS', '-g', '--max-time', '120', '-X', method,
    `https://api.appstoreconnect.apple.com${path}`,
    '-H', `Authorization: Bearer ${jwt()}`, '-H', 'Content-Type: application/json']
  if (body) {
    writeFileSync(TMP, JSON.stringify(body))
    args.push('--data', `@${TMP}`)
  }
  const r = spawnSync('curl', args, { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('curl 失败: ' + r.stderr)
  if (!r.stdout.trim()) return {}
  const out = JSON.parse(r.stdout)
  if (out.errors) {
    const e = out.errors[0]
    const assoc = e.meta?.associatedErrors ? '\n关联错误: ' + JSON.stringify(e.meta.associatedErrors, null, 1) : ''
    throw new Error(`${method} ${path} → ${e.code} ${e.title}: ${e.detail}${assoc}`)
  }
  return out
}
const loadState = () => (existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {})
const saveState = (s) => writeFileSync(STATE_PATH, JSON.stringify(s, null, 2))

// 1.0.0 的年龄分级答案（artifacts/asc/body-agerating.json 实证通过的表单值，纯「无」→ 4+）
const AGE_ATTRS = {
  alcoholTobaccoOrDrugUseOrReferences: 'NONE', contests: 'NONE', gambling: false,
  gamblingSimulated: 'NONE', gunsOrOtherWeapons: 'NONE', healthOrWellnessTopics: false,
  lootBox: false, medicalOrTreatmentInformation: 'NONE', messagingAndChat: false,
  parentalControls: false, advertising: false, ageAssurance: false,
  sexualContentGraphicAndNudity: 'NONE', sexualContentOrNudity: 'NONE', socialMedia: false,
  socialMediaAgeRestricted: false, horrorOrFearThemes: 'NONE', matureOrSuggestiveThemes: 'NONE',
  unrestrictedWebAccess: false, userGeneratedContent: false, violenceCartoonOrFantasy: 'NONE',
  violenceRealisticProlongedGraphicOrSadistic: 'NONE', violenceRealistic: 'NONE',
  profanityOrCrudeHumor: 'NONE',
}

// ---------- 工具 ----------
async function getVersion() {
  const versions = api('GET', `/v1/apps/${APP_ID}/appStoreVersions?limit=20`).data ?? []
  return versions.find((v) => v.attributes.versionString === V110)
}

// ---------- create ----------
async function stageCreate() {
  const st = loadState()
  let ver = await getVersion()
  if (!ver) {
    console.log(`[create] 不存在 ${V110} 版本记录，创建（releaseType=${META.releaseType}）…`)
    ver = api('POST', '/v1/appStoreVersions', {
      data: {
        type: 'appStoreVersions',
        attributes: { platform: 'IOS', versionString: V110, releaseType: META.releaseType },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    }).data
    console.log('[create] 版本已创建:', ver.id, ver.attributes.appStoreState)
  } else {
    console.log('[create] 版本已存在:', ver.id, ver.attributes.appStoreState)
  }
  st.versionId = ver.id
  const vid = ver.id

  // --- 版本页本地化（描述/关键词/宣传文本/新功能）---
  const existingLocs = api('GET', `/v1/appStoreVersions/${vid}/appStoreVersionLocalizations?limit=30`)
  const byLocale = Object.fromEntries((existingLocs.data ?? []).map((l) => [l.attributes.locale, l]))
  st.locIds = {}
  for (const [locale, copy] of Object.entries(META.locales)) {
    const attrs = {
      description: copy.description, keywords: copy.keywords,
      promotionalText: copy.promotionalText, whatsNew: copy.whatsNew,
      supportUrl: META.supportUrl, marketingUrl: META.marketingUrl,
    }
    if (byLocale[locale]) {
      api('PATCH', `/v1/appStoreVersionLocalizations/${byLocale[locale].id}`, {
        data: { type: 'appStoreVersionLocalizations', id: byLocale[locale].id, attributes: attrs },
      })
      st.locIds[locale] = byLocale[locale].id
      console.log(`[create] 版本本地化已更新: ${locale}`)
    } else {
      const created = api('POST', '/v1/appStoreVersionLocalizations', {
        data: {
          type: 'appStoreVersionLocalizations',
          attributes: { locale, ...attrs },
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: vid } } },
        },
      }).data
      st.locIds[locale] = created.id
      console.log(`[create] 版本本地化已创建: ${locale}`)
    }
  }

  // --- App 信息本地化（名称/副标题）---
  const infoLocs = api('GET', `/v1/appInfos/${APPINFO_ID}/appInfoLocalizations?limit=30`)
  const infoBy = Object.fromEntries((infoLocs.data ?? []).map((l) => [l.attributes.locale, l]))
  for (const [locale, copy] of Object.entries(META.locales)) {
    if (infoBy[locale]) {
      api('PATCH', `/v1/appInfoLocalizations/${infoBy[locale].id}`, {
        data: { type: 'appInfoLocalizations', id: infoBy[locale].id,
          attributes: { name: copy.name, subtitle: copy.subtitle } },
      })
      console.log(`[create] App 名称已更新: ${locale} → ${copy.name}`)
    } else {
      api('POST', '/v1/appInfoLocalizations', {
        data: { type: 'appInfoLocalizations',
          attributes: { locale, name: copy.name, subtitle: copy.subtitle },
          relationships: { appInfo: { data: { type: 'appInfos', id: APPINFO_ID } } } },
      })
      console.log(`[create] App 名称已创建: ${locale} → ${copy.name}`)
    }
  }

  // --- 年龄分级 ---
  const ard = api('GET', `/v1/appStoreVersions/${vid}/ageRatingDeclaration`)
  if (ard.data?.id) {
    api('PATCH', `/v1/ageRatingDeclarations/${ard.data.id}`, {
      data: { type: 'ageRatingDeclarations', id: ard.data.id, attributes: AGE_ATTRS },
    })
    console.log('[create] 年龄分级已按 1.0.0 同款提交（预期 4+）')
  } else {
    console.log('[create] ⚠️ 版本未带 ageRatingDeclaration 资源，提交时看 readiness 报错再处理')
  }

  // --- 审核信息（联系方式沿用 1.0.0 的，备注换 1.1.0 版）---
  const details = api('GET', `/v1/appStoreVersions/${vid}/appStoreReviewDetails`)
  const notes = META.reviewNotes
  const contact = {}
  const OLD = '0256e99c-f213-44db-a096-05b217cfb621' // 1.0.0 的 review details，抄联系方式
  try {
    const old = api('GET', `/v1/appStoreReviewDetails/${OLD}`).data?.attributes ?? {}
    for (const k of ['contactFirstName', 'contactLastName', 'contactPhone', 'contactEmail'])
      if (old[k]) contact[k] = old[k]
  } catch { /* 1.0.0 资源可能随版本只读，抄不到就跳过（提审 readiness 会点名） */ }
  if (details.data?.id) {
    api('PATCH', `/v1/appStoreReviewDetails/${details.data.id}`, {
      data: { type: 'appStoreReviewDetails', id: details.data.id, attributes: { notes, ...contact } },
    })
    console.log('[create] 审核备注已写入（含联系方式）')
  } else {
    api('POST', '/v1/appStoreReviewDetails', {
      data: { type: 'appStoreReviewDetails', attributes: { notes, demoAccountRequired: false, ...contact },
        relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: vid } } } },
    })
    console.log('[create] 审核信息已创建（含联系方式）')
  }

  saveState(st)
  console.log('[create] 完成。状态已存', STATE_PATH)
}

// ---------- screens ----------
async function stageScreens() {
  const st = loadState()
  if (!st.locIds || Object.keys(st.locIds).length === 0) throw new Error('先跑 create')
  const files = META.screenshotOrder.map((f) => join(META.screenshotDir, f))
  for (const [locale, locId] of Object.entries(st.locIds)) {
    console.log(`\n[screens] ${locale} (${locId}) …`)
    const r = spawnSync(process.execPath, [join(HERE, 'upload-screenshots.mjs'), locId, META.screenshotDisplayType, ...files],
      { encoding: 'utf8' })
    console.log(r.stdout.trim())
    if (r.status !== 0) { console.error(r.stderr); throw new Error(`截图上传失败: ${locale}`) }
  }
  console.log('\n[screens] 全部语言截图就绪')
}

// ---------- submit ----------
async function waitValidBuild() {
  for (let i = 0; i < 60; i++) {
    const builds = api('GET', `/v1/builds?filter[app]=${APP_ID}&filter[preReleaseVersionVersionString]=${V110}&sort=-uploadedDate&limit=5`).data ?? []
    if (builds.length) {
      const b = builds[0]
      const s = b.attributes.processingState
      console.log(`[submit] 最新构建 #${b.attributes.version}: ${s}（${b.attributes.uploadedDate}）`)
      if (s === 'VALID') return b
      if (s === 'INVALID') throw new Error('构建 INVALID，需查 ASC 构建详情')
    } else {
      console.log(`[submit] 还没有 ${V110} 构建（等待 CI 上传）…`)
    }
    await new Promise((r) => setTimeout(r, 60_000))
  }
  throw new Error('等构建超时（60 分钟）')
}
async function stageSubmit() {
  const st = loadState()
  const ver = await getVersion()
  if (!ver) throw new Error(`ASC 上还没有 ${V110} 版本，先跑 create`)
  if (['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'READY_FOR_SALE'].includes(ver.attributes.appStoreState)) {
    console.log('[submit] 版本已在审核流中/已就绪:', ver.attributes.appStoreState, '— 无需重复提交')
    return
  }
  const build = await waitValidBuild()
  api('PATCH', `/v1/appStoreVersions/${ver.id}/relationships/build`, {
    data: { type: 'builds', id: build.id },
  })
  console.log(`[submit] 已挂构建 #${build.attributes.version}`)
  const rs = api('POST', '/v1/reviewSubmissions', {
    data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } } },
  }).data
  console.log('[submit] reviewSubmission:', rs.id, rs.attributes.state)
  api('POST', '/v1/reviewSubmissionItems', {
    data: { type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: rs.id } },
        appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } },
      } },
  })
  api('PATCH', `/v1/reviewSubmissions/${rs.id}`, {
    data: { type: 'reviewSubmissions', id: rs.id, attributes: { submitted: true } },
  })
  st.submissionId = rs.id
  saveState(st)
  const after = await getVersion()
  console.log(`[submit] ✅ 已提交审核，版本状态: ${after.attributes.appStoreState}`)
}

// ---------- status ----------
async function stageStatus() {
  const ver = await getVersion()
  if (!ver) return console.log(`status: 无 ${V110} 版本`)
  console.log(`版本 ${V110}: ${ver.attributes.appStoreState}`)
  const v = ver.relationships?.build?.data?.id
  if (v) {
    const b = api('GET', `/v1/builds/${v}`).data
    console.log(`构建 #${b.attributes.version}: ${b.attributes.processingState}`)
  } else console.log('构建: 未挂')
  const locs = api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=30&include=appScreenshotSets`).data ?? []
  for (const l of locs) console.log(`  ${l.attributes.locale.padEnd(8)} 截图集合 ${l.relationships.appScreenshotSets.data.length} 组`)
}

const stage = process.argv[2]
const map = { create: stageCreate, screens: stageScreens, submit: stageSubmit, status: stageStatus }
if (!map[stage]) { console.error('用法: node release-v110.mjs create|screens|submit|status'); process.exit(1) }
map[stage]().catch((e) => { console.error('❌', e.message); process.exit(1) })
