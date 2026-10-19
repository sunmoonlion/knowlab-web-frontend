'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Amendment, CaseResult, KnowbotDraft, KnowbotRequest } from '@/contracts/knowbots'
import { amendRequest, fetchMyRequests } from '@/lib/knowbots/client'

export const MY_REQUESTS_KEY = ['web', 'knowbot-requests'] as const

type Translate = ReturnType<typeof useTranslations<'knowbotRequests'>>

// 我在做的分身（SDD 0027）：只有自己的提交。每版草稿显示状态，测过的显示运行正确性报告：
// 每条用例通过与否、哪一步哪条验收没过、期望满足几条。没有收益、胜率、评级，也没有分析内容（C-L5）。
// 看了结果想改某一步，在想法下面写补充方法（SDD 0035）：原话进下一稿的规则出处。
export function MyRequests({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('knowbotRequests')
  const list = useQuery({ queryKey: MY_REQUESTS_KEY, queryFn: fetchMyRequests })

  if (list.isPending) return <p className="text-muted-foreground mt-6">{t('loading')}</p>
  if (list.isError)
    return (
      <p className="text-destructive mt-6" role="alert">
        {t('loadFailed')}
      </p>
    )
  const requests = list.data.requests
  if (requests.length === 0) return <p className="text-muted-foreground mt-6">{t('empty')}</p>
  return (
    <section className="mt-6 space-y-4" aria-label={t('title')}>
      {requests.map((request) => (
        <RequestCard key={request.request_id} request={request} csrfToken={csrfToken} t={t} />
      ))}
    </section>
  )
}

function RequestCard({
  request,
  csrfToken,
  t,
}: {
  request: KnowbotRequest
  csrfToken: string
  t: Translate
}) {
  const newestFirst = [...request.drafts].reverse()
  return (
    <article className="rounded-lg border p-4">
      <h2 className="font-medium">{request.title}</h2>
      <p className="text-muted-foreground text-sm">{t('runtime', { runtime: request.runtime })}</p>
      {newestFirst.length === 0 ? (
        <p className="mt-3 text-sm">{t('noDraftYet')}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {newestFirst.map((draft) => (
            <DraftRow key={draft.draft_id} draft={draft} t={t} />
          ))}
        </ul>
      )}
      <Amendments
        requestId={request.request_id}
        written={request.amendments ?? []}
        csrfToken={csrfToken}
        t={t}
      />
    </article>
  )
}

function Amendments({
  requestId,
  written,
  csrfToken,
  t,
}: {
  requestId: string
  written: Amendment[]
  csrfToken: string
  t: Translate
}) {
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
    <section className="mt-4 space-y-2 border-t pt-3 text-sm" aria-label={t('amend.title')}>
      {written.length > 0 ? (
        <>
          <p className="font-medium">{t('amend.written')}</p>
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

function amendmentStatus(a: Amendment, t: Translate): string {
  if (a.status === 'used') return t('amend.status.used', { revision: a.used_in_revision ?? 0 })
  if (a.status === 'declined')
    return t('amend.status.declined', { reason: a.declined_reason ?? '' })
  return t('amend.status.open')
}

function DraftRow({ draft, t }: { draft: KnowbotDraft; t: Translate }) {
  return (
    <li className="text-sm">
      <p>
        {t('draft', { version: draft.version, revision: draft.revision })}
        <span className="text-muted-foreground"> · {t(`status.${draft.status}`)}</span>
      </p>
      {draft.status === 'delivered' ? (
        <p className="text-muted-foreground">{t('deliveredHint')}</p>
      ) : null}
      {draft.report ? (
        <ul className="mt-2 space-y-1 border-l pl-3" aria-label={t('report')}>
          {draft.report.cases.map((c) => (
            <CaseRow key={c.case_id} result={c} t={t} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function CaseRow({ result, t }: { result: CaseResult; t: Translate }) {
  const failedSteps = result.steps.filter((s) => !s.accepted)
  const met = result.expectations.filter(Boolean).length
  return (
    <li>
      <span>{t('case', { id: result.case_id })}</span>
      <span className="text-muted-foreground"> · {t(`caseStatus.${result.status}`)}</span>
      {result.expectations.length > 0 ? (
        <span className="text-muted-foreground">
          {' '}
          · {t('expectationsMet', { met, total: result.expectations.length })}
        </span>
      ) : null}
      {failedSteps.map((s) => (
        <div key={s.step_id} className="text-muted-foreground">
          <p>{t('failedStep', { step: s.step_id, checks: s.failed_checks.join('、') || '—' })}</p>
          {s.details?.length ? (
            <ul className="list-disc pl-5 text-xs">
              {s.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      {result.note ? <p className="text-muted-foreground">{result.note}</p> : null}
    </li>
  )
}
