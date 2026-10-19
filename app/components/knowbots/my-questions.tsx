'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { MyQuestion } from '@/contracts/knowbots'
import { answerMyQuestion } from '@/lib/knowbots/client'

import { QUESTIONS_KEY, caseName, useMyQuestions } from './shared'

// 测试中需要你回答的问题（SDD 0027 §3.4、0037 §四）：涉及你的方法上的判断，只能你自己答（C-L1）。
// 答完测试接着跑；你的回答会记进下一个分身的规则出处。「待我回答」页按创意分组，创意页、分身页就地答。

function useAnswer(csrfToken: string) {
  const client = useQueryClient()
  const [failed, setFailed] = useState(false)
  const answer = useMutation({
    mutationFn: ({ id, value }: { id: string; value: { option_id?: string; text?: string } }) =>
      answerMyQuestion(id, value, csrfToken),
    onSuccess: () => {
      setFailed(false)
      return client.invalidateQueries({ queryKey: QUESTIONS_KEY })
    },
    onError: () => setFailed(true),
  })
  return { answer, failed }
}

/** 「待我回答」页：全部要我答的问题，按创意分组。 */
export function MyQuestions({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('knowbotQuestions')
  const list = useMyQuestions()
  const { answer, failed } = useAnswer(csrfToken)
  if (list.isPending) return <p className="text-muted-foreground mt-6">{t('loading')}</p>
  if (list.isError)
    return (
      <p className="text-destructive mt-6" role="alert">
        {t('loadFailed')}
      </p>
    )
  if (list.data.length === 0) return <p className="text-muted-foreground mt-6">{t('empty')}</p>
  const groups = new Map<string, MyQuestion[]>()
  for (const q of list.data) groups.set(q.title, [...(groups.get(q.title) ?? []), q])
  return (
    <div className="mt-6 space-y-4">
      <p className="text-muted-foreground text-sm">{t('intro')}</p>
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {t('failed')}
        </p>
      ) : null}
      {[...groups].map(([title, questions]) => (
        <section
          key={title}
          aria-label={title}
          className="bg-card space-y-4 rounded-xl border p-4 shadow-sm"
        >
          <h2 className="font-medium">{title}</h2>
          {questions.map((q) => (
            <QuestionRow
              key={q.question_id}
              question={q}
              busy={answer.isPending}
              onAnswer={(value) => answer.mutate({ id: q.question_id, value })}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

/** 创意页、分身页上就地答：只列这个创意或分身的问题，没有就什么都不显示。 */
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
  onAnswer: (value: { option_id?: string; text?: string }) => void
}) {
  const t = useTranslations('knowbotQuestions')
  const tk = useTranslations('knowbots')
  const [text, setText] = useState('')
  return (
    <article className="space-y-2 text-sm">
      <p className="text-muted-foreground">
        {t('where', {
          avatar: tk('avatar', { version: q.version, revision: q.revision }),
          case: caseName(tk, q.case_id, cases),
        })}
      </p>
      <p className="whitespace-pre-wrap">{q.text}</p>
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
