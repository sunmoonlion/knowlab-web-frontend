'use client'

import { useTranslations } from 'next-intl'

import { CrossAppLink } from '@/components/common/cross-app-link'
import type { Detail, Expert } from '@/contracts/knowbots'

// 专家能用了就去 knowbench 请它（专家孵化方案第十三节第 5 条）。申请是在 knowbench 找专家没找到时建的，
// 链接带上那一轮找专家的编号，knowbench 取回当初那句问题和项目，到那个项目的请专家页、选好这一位；
// 你在那一页看过、点了才交给专家。knowbench 的地址没配时只写一句怎么去。
export function AskInKnowbench({
  expert,
  origin,
  name,
}: {
  expert: Expert
  origin: Detail['origin']
  name: string
}) {
  const t = useTranslations('knowbots')
  if (expert.stage !== 'listed' || !expert.knowbot_id) return null
  const task = origin?.app === 'knowbench' ? (origin.task_id ?? null) : null
  return (
    <CrossAppLink
      to="knowbench.ask"
      values={{ knowbot: `${expert.knowbot_id}@${expert.version}`, task }}
      refValue={expert.expert_id}
      className="font-medium underline underline-offset-2"
      fallback={<p className="text-muted-foreground">{t('experts.hint', { name })}</p>}
    >
      {task ? t('experts.askWithQuestion') : t('experts.ask')}
    </CrossAppLink>
  )
}

// 这个名称里能请的那一版：上架了的里最新的
export function listedExpert(experts: Expert[]): Expert | null {
  const listed = experts.filter((e) => e.stage === 'listed' && e.knowbot_id)
  return listed.reduce<Expert | null>((a, e) => (a && a.version > e.version ? a : e), null)
}
