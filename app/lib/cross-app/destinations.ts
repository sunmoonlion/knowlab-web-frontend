import { defineDestinations } from '@/lib/cross-app/links'

// 这个应用会把用户带去的页面，都登记在这里。
export const destinations = defineDestinations({
  // 「去 knowbench 请它」（专家孵化方案第十三节第 5 条）：带 knowbot=<knowmart 上的专家>@<版本>，
  // knowbench 按用户自己的会话向 knowmart 核验、钉住。申请是在 knowbench 找专家没找到时建的，
  // 再带 task=那一轮找专家的编号：knowbench 取回当初的问题和项目，直接到那个项目的请专家页
  'knowbench.ask': { target: 'knowbench', segments: ['workbench'], params: ['knowbot', 'task'] },
})

export type DestinationKey = keyof typeof destinations
