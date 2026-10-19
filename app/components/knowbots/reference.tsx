'use client'

import { useTranslations } from 'next-intl'

import type { Amendment, DraftDetail, RequestDetail } from '@/contracts/knowbots'

import { amendmentStatus } from './amendments'
import { caseName, caseQuestion } from './shared'

// 右边「我的方法与用例」栏的页签内容（SDD 0037 §四）：都是用户自己交来的东西，用用户的说法，不放原始 JSON。

export function Method({ detail }: { detail: RequestDetail }) {
  const t = useTranslations('knowbotRequests')
  const { idea } = detail
  if (idea.kind === 'skill')
    return (
      <pre className="bg-muted overflow-x-auto rounded-md p-3 whitespace-pre-wrap">
        {idea.skill}
      </pre>
    )
  return (
    <dl className="space-y-3">
      {(Object.keys(idea.answers) as (keyof typeof idea.answers)[]).map((k) => (
        <div key={k}>
          <dt className="text-muted-foreground">{t(`form.q.${k}`)}</dt>
          <dd className="whitespace-pre-wrap">{idea.answers[k] || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

type Expectation = {
  artifact?: unknown
  path?: unknown
  kind?: unknown
  value?: unknown
  tolerance?: unknown
}

const KINDS = ['equals', 'approx', 'contains'] as const

export function Cases({ cases }: { cases: RequestDetail['cases'] }) {
  const t = useTranslations('knowbots')
  const tForm = useTranslations('knowbotRequests.form')
  if (cases.length === 0) return <p className="text-muted-foreground">{t('cases.none')}</p>
  return (
    <ul className="space-y-4">
      {cases.map((raw, i) => {
        const id = String(raw.case_id ?? '')
        const question = caseQuestion(raw)
        const expectations = Array.isArray(raw.expectations)
          ? (raw.expectations as Expectation[])
          : []
        return (
          <li key={id || i}>
            <p className="font-medium">{caseName(t, id, cases)}</p>
            {question ? <p className="whitespace-pre-wrap">{question}</p> : null}
            {expectations.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t('cases.noExpectation')}</p>
            ) : (
              <table className="mt-1 w-full text-xs">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    <th className="py-1 pr-2 font-normal">{t('cases.where')}</th>
                    <th className="py-1 pr-2 font-normal">{tForm('kind')}</th>
                    <th className="py-1 pr-2 font-normal">{tForm('value')}</th>
                    <th className="py-1 font-normal">{t('cases.tolerance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {expectations.map((e, j) => {
                    const kind = KINDS.find((k) => k === e.kind)
                    return (
                      <tr key={j} className="border-t">
                        <td className="py-1 pr-2 break-all">
                          {String(e.artifact ?? '')} · {String(e.path ?? '')}
                        </td>
                        <td className="py-1 pr-2">
                          {kind ? tForm(`kinds.${kind}`) : String(e.kind ?? '')}
                        </td>
                        <td className="py-1 pr-2 break-all">{String(e.value ?? '')}</td>
                        <td className="py-1">{e.tolerance == null ? '—' : String(e.tolerance)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** 我写过的补充（只看；写新的在创意页主栏）。 */
export function AmendmentList({ amendments }: { amendments: Amendment[] }) {
  const t = useTranslations('knowbotRequests')
  if (amendments.length === 0) return <p className="text-muted-foreground">{t('amend.none')}</p>
  return (
    <ul className="space-y-3">
      {amendments.map((a) => (
        <li key={a.amendment_id}>
          <p className="whitespace-pre-wrap">{a.text}</p>
          <p className="text-muted-foreground text-xs">{amendmentStatus(a, t)}</p>
        </li>
      ))}
    </ul>
  )
}

/** 我的话用在了哪：这个分身的每条规则，出自我写的哪句话。 */
export function RuleSources({ draft }: { draft: DraftDetail }) {
  const t = useTranslations('knowbots')
  if (draft.rule_sources.length === 0)
    return <p className="text-muted-foreground">{t('rules.none')}</p>
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">{t('rules.intro')}</p>
      <ol className="list-decimal space-y-2 pl-5">
        {draft.rule_sources.map((s, i) => (
          <li key={i}>
            <p>{s.rule}</p>
            {s.ref ? (
              <p className="text-muted-foreground text-xs">{t('rules.from', { ref: s.ref })}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
