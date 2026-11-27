import { defineDestinations } from '@/lib/cross-app/links'

// 这个应用会把用户带去的页面，都登记在这里。
export const destinations = defineDestinations({
  // 历史分支复核兼容入口
  'knowbench.review': {
    target: 'knowbench',
    segments: ['workbench', 'review'],
    params: [
      'run_id',
      'request_id',
      'case_id',
      'repetition',
      'step',
      'scope_digest',
      'review_digest',
    ],
  },
  'knowbench.request': {
    target: 'knowbench',
    segments: ['workbench', 'projects', ':project', 'expert', 'new'],
    params: ['formal_match'],
  },
  'knowbench.ask': { target: 'knowbench', segments: ['workbench'], params: ['knowbot'] },
  // 直达 KnowBench 正式专家准备页（携带 mode=expert 与 formal_method）
  'knowbench.summonFormal': {
    target: 'knowbench',
    segments: ['workbench'],
    params: ['mode', 'formal_method'],
  },
  'knowbench.methods': { target: 'knowbench', segments: ['workbench', 'methods'] },
  'knowbench.settings': { target: 'knowbench', segments: ['workbench', 'settings'] },
  'knowbench.machines': { target: 'knowbench', segments: ['workbench', 'machines'] },
  'knowbase.library': { target: 'knowbase', segments: ['dashboard'] },
  'knowmart.shop': { target: 'knowmart', segments: ['shop'] },
  'knowmart.knowbots': { target: 'knowmart', segments: ['knowbots'] },
  'knowmart.formalDetail': {
    target: 'knowmart',
    segments: ['knowbots', 'formal', ':listing_id'],
  },
  'knowmart.demands': { target: 'knowmart', segments: ['publish', 'expert'] },
})

export type DestinationKey = keyof typeof destinations
