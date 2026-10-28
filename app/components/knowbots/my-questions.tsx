'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { MyQuestion } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import { answerMyQuestion } from '@/lib/knowbots/client'

import { KEY, caseName } from './shared'

// 测试中需要你回答的问题（SDD 0027 §3.4、0037 第八节）：涉及你的方法上的判断，只能你自己答
// （C-L1）。答完测试接着跑；你的回答会记进下一位准专家的规则出处。在「审核」里答。你自助测试里
// 的工具审批也在这里批准或拒绝（SDD 0046 第四节）；专家要的数据在名称页的测试卡片里确认。AI 孵化
// 列的缺口（专家孵化方案第 8.4 节）也在这里答，可以答「按提议」；答完回工作稿点「让 AI 改…」带上。

type AnswerValue = { option_id?: string; text?: string; decision?: 'approve' | 'deny' }

function useAnswer(csrfToken: string) {
  const client = useQueryClient()
  const [failed, setFailed] = useState(false)
  const answer = useMutation({
    mutationFn: ({ id, value }: { id: string; value: AnswerValue }) =>
      answerMyQuestion(id, value, csrfToken),
    onSuccess: () => {
      setFailed(false)
      return client.invalidateQueries({ queryKey: KEY })
    },
    onError: () => setFailed(true),
  })
  return { answer, failed }
}

/** 「审核」里就地答：只列给进来的问题，没有就什么都不显示。 */
export function QuestionsHere({
  questions,
  csrfToken,
  cases,
}: {
  questions: MyQuestion[]
  csrfToken: string
  cases?: Record<string, unknown>[]
}) {
  const t = useTranslations('knowbotQuestions')
  const { answer, failed } = useAnswer(csrfToken)
  if (questions.length === 0) return null
  return (
    <section
      aria-label={t('title')}
      className="space-y-3 rounded-xl border border-amber-300 p-4 shadow-sm"
    >
      <h3 className="font-medium">{t('title')}</h3>
      <p className="text-muted-foreground text-sm">{t('intro')}</p>
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {t('failed')}
        </p>
      ) : null}
      {questions.map((q) => (
        <QuestionRow
          key={q.question_id}
          question={q}
          cases={cases}
          busy={answer.isPending}
          onAnswer={(value) => answer.mutate({ id: q.question_id, value })}
        />
      ))}
    </section>
  )
}

function QuestionRow({
  question: q,
  cases,
  busy,
  onAnswer,
}: {
  question: MyQuestion
  cases?: Record<string, unknown>[]
  busy: boolean
  onAnswer: (value: AnswerValue) => void
}) {
  const t = useTranslations('knowbotQuestions')
  const tk = useTranslations('knowbots')
  const [text, setText] = useState('')
  const where =
    q.kind === 'gap' ? (
      <p className="text-muted-foreground">{t('gapWhere')}</p>
    ) : (
      <p className="text-muted-foreground">
        {t('where', {
          draft: tk('draftLabel', { label: q.label ?? '' }),
          case: caseName(tk, q.case_id, cases),
        })}
      </p>
    )
  if (q.kind === 'tool_approval') {
    return (
      <article className="space-y-2 text-sm" data-testid="tool-approval">
        {where}
        <p className="text-muted-foreground">{t('approvalIntro')}</p>
        <p className="font-mono text-xs whitespace-pre-wrap">{q.text}</p>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => onAnswer({ decision: 'approve' })}>
            {t('approve')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onAnswer({ decision: 'deny' })}
          >
            {t('deny')}
          </Button>
        </div>
      </article>
    )
  }
  if (q.kind === 'data') {
    return (
      <article className="space-y-2 text-sm">
        {where}
        <p className="whitespace-pre-wrap">{q.text}</p>
        <p className="text-muted-foreground">{t('dataHere')}</p>
        <Link href={`/names/${q.request_id}`} className="underline underline-offset-2">
          {t('toData')}
        </Link>
      </article>
    )
  }
  return (
    <article className="space-y-2 text-sm">
      {where}
      <p className="whitespace-pre-wrap">{q.text}</p>
      {q.kind === 'gap' && q.proposal ? (
        <div className="space-y-1" data-testid="gap-proposal">
          <p className="text-muted-foreground">{t('proposal', { proposal: q.proposal })}</p>
          <Button size="sm" disabled={busy} onClick={() => onAnswer({ option_id: 'proposal' })}>
            {t('asProposed')}
          </Button>
        </div>
      ) : null}
      {q.options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {q.options.map((o) => (
            <Button
              key={o.id}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onAnswer({ option_id: o.id })}
            >
              {o.label}
            </Button>
          ))}
        </div>
      ) : null}
      {q.allow_free_text ? (
        <div className="flex gap-2">
          <input
            aria-label={t('ownWords')}
            placeholder={t('ownWords')}
            className="w-full rounded-md border px-3 py-2"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            size="sm"
            disabled={busy || !text.trim()}
            onClick={() => onAnswer({ text: text.trim() })}
          >
            {t('answer')}
          </Button>
        </div>
      ) : null}
    </article>
  )
}
