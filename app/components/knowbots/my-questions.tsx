'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { MyQuestion } from '@/contracts/knowbots'
import { answerMyQuestion, fetchMyQuestions } from '@/lib/knowbots/client'

const KEY = ['web', 'knowbot-questions'] as const

// 测试中需要你回答的问题（SDD 0027 §3.4）：涉及你的方法上的判断，只能你自己答（C-L1）。
// 答完测试接着跑；你的回答会记进下一版分身的规则出处。
export function MyQuestions({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('knowbotQuestions')
  const client = useQueryClient()
  const list = useQuery({ queryKey: KEY, queryFn: fetchMyQuestions })
  const [failed, setFailed] = useState(false)
  const answer = useMutation({
    mutationFn: ({ id, value }: { id: string; value: { option_id?: string; text?: string } }) =>
      answerMyQuestion(id, value, csrfToken),
    onSuccess: () => {
      setFailed(false)
      return client.invalidateQueries({ queryKey: KEY })
    },
    onError: () => setFailed(true),
  })
  if (list.isPending || list.isError || list.data.length === 0) return null
  return (
    <section
      aria-label={t('title')}
      className="mt-6 space-y-3 rounded-lg border border-amber-300 p-4"
    >
      <h2 className="font-medium">{t('title')}</h2>
      <p className="text-muted-foreground text-sm">{t('intro')}</p>
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {t('failed')}
        </p>
      ) : null}
      {list.data.map((q) => (
        <QuestionRow
          key={q.question_id}
          question={q}
          busy={answer.isPending}
          onAnswer={(value) => answer.mutate({ id: q.question_id, value })}
        />
      ))}
    </section>
  )
}

function QuestionRow({
  question: q,
  busy,
  onAnswer,
}: {
  question: MyQuestion
  busy: boolean
  onAnswer: (value: { option_id?: string; text?: string }) => void
}) {
  const t = useTranslations('knowbotQuestions')
  const [text, setText] = useState('')
  return (
    <article className="space-y-2 text-sm">
      <p className="text-muted-foreground">{t('where', { title: q.title, version: q.version })}</p>
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
