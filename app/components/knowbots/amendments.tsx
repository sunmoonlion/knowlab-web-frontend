'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Amendment } from '@/contracts/knowbots'
import { amendRequest } from '@/lib/knowbots/client'

import { MY_REQUESTS_KEY } from './shared'

type Translate = ReturnType<typeof useTranslations<'knowbotRequests'>>

export function amendmentStatus(a: Amendment, t: Translate): string {
  if (a.status === 'used') return t('amend.status.used', { revision: a.used_in_revision ?? 0 })
  if (a.status === 'declined')
    return t('amend.status.declined', { reason: a.declined_reason ?? '' })
  return t('amend.status.open')
}

// 补充方法（SDD 0035）：看了测试结果想改某一步，在创意下面写；原话写下后不能改，
// 我们照着孵化下一个分身（原话进它的规则出处）。状态由各个分身推出来。
export function Amendments({
  requestId,
  written,
  csrfToken,
}: {
  requestId: string
  written: Amendment[]
  csrfToken: string
}) {
  const t = useTranslations('knowbotRequests')
  const client = useQueryClient()
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')
  const amend = useMutation({
    mutationFn: () => amendRequest(requestId, text.trim(), csrfToken),
    onSuccess: () => {
      setWriting(false)
      setText('')
      return client.invalidateQueries({ queryKey: MY_REQUESTS_KEY })
    },
  })
  const label = t('amend.label')
  return (
    <section
      className="bg-card space-y-2 rounded-xl border p-4 text-sm shadow-sm"
      aria-label={t('amend.title')}
    >
      <h3 className="font-medium">{t('amend.title')}</h3>
      {written.length > 0 ? (
        <>
          <p className="text-muted-foreground">{t('amend.written')}</p>
          <ul className="space-y-2">
            {written.map((a) => (
              <li key={a.amendment_id}>
                <p className="whitespace-pre-wrap">{a.text}</p>
                <p className="text-muted-foreground">{amendmentStatus(a, t)}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {writing ? (
        <div className="space-y-2">
          <p className="text-muted-foreground">{t('amend.intro')}</p>
          <textarea
            aria-label={label}
            placeholder={label}
            className="min-h-24 w-full rounded-md border px-3 py-2"
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {amend.isError ? (
            <p className="text-destructive" role="alert">
              {t('amend.failed')}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={amend.isPending || !text.trim()}
              onClick={() => amend.mutate()}
            >
              {t('amend.submit')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setWriting(false)}>
              {t('amend.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setWriting(true)}>
          {t('amend.open')}
        </Button>
      )}
    </section>
  )
}
