import { z } from 'zod'

// ---------- 自助测试与测试里的数据（SDD 0046 第三节，decisions ⑭） ----------
export const computerSchema = z.object({
  environment_id: z.string().uuid(),
  name: z.string(),
  os: z.string().nullable().optional(),
  online: z.boolean(),
  roots: z.array(z.string()),
})
export const computersSchema = z.object({
  computers: z.array(computerSchema),
  last: z.object({ environment_id: z.string(), workspace_root: z.string().nullable() }).nullable(),
  // 我在 knowbench 填了模型 key 没有：false 时发起前就拦（SDD 0046 第三节）；null 是说不准
  model_key: z.boolean().nullable().default(null),
})
export type Computers = z.infer<typeof computersSchema>

// ---------- 知识库栏（SDD 0046 第六节）：knowbase 里我展示给 knowlab 的资料，在 knowbase 管 ----------
export const materialSchema = z.object({
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullish(),
  material_id: z.string(),
  name: z.string(),
  mine: z.boolean(),
  category: z.string().nullable().optional(),
  content_origin: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  description: z
    .object({
      subject: z.string().nullable().optional(),
      doc_type: z.string().nullable().optional(),
      period_start: z.string().nullable().optional(),
      period_end: z.string().nullable().optional(),
      data_format: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
    })
    .loose(),
  version_no: z.number().int().nullable().optional(),
  media_type: z.string().nullable().optional(),
  size_bytes: z.number().int().nullable().optional(),
  created_at: z.string().nullable().optional(),
})
export type Material = z.infer<typeof materialSchema>
export const librarySchema = z.object({
  contract_version: z.literal(1),
  materials: z.array(materialSchema),
})
