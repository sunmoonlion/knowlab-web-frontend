'use client'

import { useTranslations } from 'next-intl'

import { CrossAppLink } from '@/components/common/cross-app-link'
import type { Expert } from '@/contracts/knowbots'

export function AskInKnowbench({ expert, name }: { expert: Expert; name: string }) {
  const t = useTranslations('knowbots')
  if (expert.stage !== 'listed' || !expert.knowbot_id) return null
  return (
    <CrossAppLink
      to="knowbench.ask"
      values={{ knowbot: `${expert.knowbot_id}@${expert.version}` }}
      refValue={expert.expert_id}
      className="font-medium underline underline-offset-2"
      fallback={<p className="text-muted-foreground">{t('experts.hint', { name })}</p>}
    >
      {t('experts.ask')}
    </CrossAppLink>
  )
}

// 这个名称里能请的那一版：上架了的里最新的
export function listedExpert(experts: Expert[]): Expert | null {
  const listed = experts.filter((e) => e.stage === 'listed' && e.knowbot_id)
  return listed.reduce<Expert | null>((a, e) => (a && a.version > e.version ? a : e), null)
}
