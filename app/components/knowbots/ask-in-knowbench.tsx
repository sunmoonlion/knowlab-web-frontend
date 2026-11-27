'use client'

import { useTranslations } from 'next-intl'

import { CrossAppLink } from '@/components/common/cross-app-link'
import type { ExpertItem } from '@/contracts/knowbots'

export function AskInKnowbench({ expert, name }: { expert: ExpertItem; name: string }) {
  const t = useTranslations('knowbots')
  if (!expert.knowbot_id) return null
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
