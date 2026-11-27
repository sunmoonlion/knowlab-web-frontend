'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { listMethodDrafts } from '@/lib/knowbots/method-drafts'

import { Card } from './shared'

const FEW = 5

export function Overview() {
  const t = useTranslations('knowbots')
  const studioDrafts = useQuery({
    queryKey: ['method-drafts'],
    queryFn: listMethodDrafts,
    retry: false,
  })
  return (
    <div className="mt-6 space-y-4">
      <Card title={t('home.studioTitle')}>
        <p className="text-muted-foreground text-sm">{t('home.studioLead')}</p>
        {studioDrafts.isError && <p role="alert">{t('loadFailed')}</p>}
        {studioDrafts.data && studioDrafts.data.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm">
            {studioDrafts.data.slice(0, FEW).map((d) => (
              <li key={d.method_id} className="flex flex-wrap items-center gap-2">
                <Link href={`/studio/${d.method_id}`} className="font-medium hover:underline">
                  {d.title}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {d.archetype} · rev {d.revision}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <Link href="/studio" className="font-medium underline underline-offset-2">
            {t('home.openStudio')}
          </Link>
          <Link href="/methods" className="underline underline-offset-2">
            {t('home.openMethods')}
          </Link>
        </div>
      </Card>
    </div>
  )
}
