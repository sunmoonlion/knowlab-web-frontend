import { defineDestinations } from '@/lib/cross-app/links'

// 这个应用会把用户带去的页面，都登记在这里。
export const destinations = defineDestinations({
  // 「去 knowbench 请它」（专家孵化方案第十三节第 5 条）：带 knowbot=<knowmart 上的专家>@<版本>，
  // knowbench 按用户自己的会话向 knowmart 核验、钉住。申请是在 knowbench 找专家没找到时建的，
  // 再带 task=那一轮找专家的编号：knowbench 取回当初的问题和项目，直接到那个项目的请专家页
  'knowbench.ask': { target: 'knowbench', segments: ['workbench'], params: ['knowbot', 'task'] },
  // 「去 knowbench 填模型 key」（SDD 0046 第三节：模型 key 没填不能发起测试、AI 一轮）
  'knowbench.settings': { target: 'knowbench', segments: ['workbench', 'settings'] },
  // 「去 knowbench 接入电脑」（SDD 0046 第三节「怎么选电脑」）
  'knowbench.machines': { target: 'knowbench', segments: ['workbench', 'machines'] },
  // 知识库栏「在 knowbase 管理」（SDD 0046 第六节：只展示给了 knowlab 的数据，链到 knowbase 去管）：
  // knowbase web端的总栏（SDD 0044 第 2.1 节）
  'knowbase.library': { target: 'knowbase', segments: ['dashboard'] },
  // 交付过了「进 knowmart 小店」（SDD 0046 第五节）：knowmart 的「我的小店」
  'knowmart.shop': { target: 'knowmart', segments: ['shop'] },
})

export type DestinationKey = keyof typeof destinations
