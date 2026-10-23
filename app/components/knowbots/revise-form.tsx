'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { fetchDetail } from '@/lib/knowbots/client'

import { RequestForm } from './request-form'
import { KEY } from './shared'

// 改创意（SDD 0037 第八节）：从最新一版带过来改，交了出一个新版本；名称、运行方不变。
export function ReviseForm({ csrfToken, requestId }: { csrfToken: string; requestId: string }) {
  const t = useTranslations('knowbots')
  const detail = useQuery({
    queryKey: [...KEY, 'detail', requestId],
    queryFn: () => fetchDetail(requestId),
  })
  if (detail.isError)
    return (
      <p className="text-destructive mt-6 text-sm" role="alert">
        {t('loadFailed')}
      </p>
    )
  if (detail.isPending) return <p className="text-muted-foreground mt-6 text-sm">{t('loading')}</p>
  const latest = detail.data.versions.find((v) => v.version === detail.data.latest_version)
  if (!latest) return null
  return (
    <>
      <p className="text-muted-foreground mt-2">
        {t('applications.reviseFrom', { title: detail.data.title, version: latest.version })}
      </p>
      <RequestForm csrfToken={csrfToken} revise={{ requestId, version: latest }} />
    </>
  )
}
