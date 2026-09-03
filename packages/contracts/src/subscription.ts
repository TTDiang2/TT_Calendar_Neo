import { z } from 'zod'
import { DateTimeStr } from './common'

/**
 * 订阅：一切外部数据源都是订阅（docs/PHILOSOPHY.md §3）。
 *
 * 自定义订阅由用户在面板登记 url + 自然语言抓取规则，status='pending'，
 * 等 agent 读登记信息后现场写适配代码再置 active。
 */
export const SubscriptionStatus = z.enum(['active', 'pending', 'error'])
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>

export const SubscriptionRow = z.object({
  id: z.string(),
  display_name: z.string(),
  source_key: z.string(),
  url: z.string().nullable().optional(),
  rules_text: z.string().nullable().optional(),
  enabled: z.number().int().nullable().optional(),
  auto_update: z.number().int().nullable().optional(),
  status: z.string().nullable().optional(),
  last_synced_at: DateTimeStr.nullable().optional(),
  config_json: z.string().nullable().optional(),
  created_at: DateTimeStr.nullable().optional(),
  updated_at: DateTimeStr.nullable().optional(),
})
export type SubscriptionRow = z.infer<typeof SubscriptionRow>

export const Subscription = z.object({
  id: z.string(),
  display_name: z.string(),
  source_key: z.string(),
  url: z.string().nullable(),
  rules_text: z.string().nullable(),
  enabled: z.boolean(),
  auto_update: z.boolean(),
  status: SubscriptionStatus,
  last_synced_at: DateTimeStr.nullable(),
  last_error: z.string().nullable().optional(),
  created_at: DateTimeStr.nullable(),
})
export type Subscription = z.infer<typeof Subscription>

export const NewSubscription = z.object({
  display_name: z.string().min(1),
  url: z.string().nullable().optional(),
  rules_text: z.string().nullable().optional(),
  auto_update: z.boolean().optional(),
})
export type NewSubscription = z.infer<typeof NewSubscription>

/** meta 表：键值配置 */
export const MetaRow = z.object({
  key: z.string().nullable().optional(),
  value: z.string().nullable().optional(),
  updated_at: DateTimeStr.nullable().optional(),
})
export type MetaRow = z.infer<typeof MetaRow>

/** 同步墓碑：删除的行靠它跨设备传播 */
export const SyncTombstone = z.object({
  table_name: z.string(),
  row_key: z.string(),
  deleted_at: DateTimeStr,
})
export type SyncTombstone = z.infer<typeof SyncTombstone>
