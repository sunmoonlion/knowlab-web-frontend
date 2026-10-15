import { defineDestinations } from '@/lib/cross-app/links'

// 这个应用会把用户带去的页面，都登记在这里。模板没有要去的地方；各应用在自己的仓库里填。
//
// 例：
//   'info.request': { target: 'knowfeed', segments: ['requests', 'new'], params: ['code'] },
//   'knowledge.dataset': { target: 'knowbase', segments: ['catalog', ':dataset'] },
export const destinations = defineDestinations({})

export type DestinationKey = keyof typeof destinations
