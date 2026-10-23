'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Answered, Draft, Expert, InboxItem, MyQuestion } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import { decideExpert, fetchDetail, fetchInbox, reviewDraft } from '@/lib/knowbots/client'

import { QuestionsHere } from './my-questions'
import { Cases, Method, RuleSources } from './reference'
import { Badge, Card, ColumnLayout, KEY, useWhen } from './shared'
import { SidePanel } from './side-panel'
import { TestResults } from './test-results'

// 审核（SDD 0037 第八节）：我的待办箱——孵化、测试、交回里所有要我做的事：回答问题（含测试中
// 冒出的问题）、审核准专家、决定要不要这一版专家（用户同意门）。右边是我答过、定过的记录。

const FILTERS = ['answer', 'review', 'decide'] as const
type Filter = (typeof FILTERS)[number]

const CATEGORY: Record<InboxItem['type'], Filter> = {
  question: 'answer',
  draft: 'review',
  expert: 'decide',
}

export function keyOf(item: InboxItem): string {
  return item.type === 'question'
    ? item.question_id
    : item.type === 'draft'
      ? item.draft_id
      : item.expert_id
}

export function ReviewView({ csrfToken, picked: initial }: { csrfToken: string; picked?: string }) {
  const t = useTranslations('knowbots')
  const inbox = useQuery({ queryKey: [...KEY, 'inbox'], queryFn: fetchInbox })
  const [picked, setPicked] = useState<string | null>(initial ?? null)
  const todo = (inbox.data?.items ?? []).filter((item) => item.state === 'todo')
  return (
    <ColumnLayout<Filter, InboxItem>
      title={t('columns.review')}
      filters={FILTERS}
      defaultFilter={todo[0] ? CATEGORY[todo[0].type] : 'answer'}
      items={todo}
      categoryOf={(item) => CATEGORY[item.type]}
      keyOf={keyOf}
      picked={picked}
      onPick={setPicked}
      empty={t('review.empty')}
      failed={inbox.isError}
      pending={inbox.isPending}
      renderRow={(item) => (
        <>
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">{item.title}</span>
            <Badge tone="todo">{t(`categories.${CATEGORY[item.type]}`)}</Badge>
          </span>
          <span className="text-muted-foreground mt-1 block truncate text-xs">
            {item.type === 'question'
              ? item.text
              : item.type === 'draft'
                ? t('draftLabel', { label: item.label })
                : t('expertVersion', { version: item.version })}
          </span>
        </>
      )}
    >
      {(current) => (
        <>
          <section className="min-w-0 flex-1 space-y-4">
            {current?.type === 'question' ? (
              <QuestionTodo key={current.question_id} question={current} csrfToken={csrfToken} />
            ) : current?.type === 'draft' ? (
              <DraftTodo key={current.draft_id} item={current} csrfToken={csrfToken} />
            ) : current?.type === 'expert' ? (
              <ExpertTodo key={current.expert_id} item={current} csrfToken={csrfToken} />
            ) : (
              <p className="text-muted-foreground text-sm">{t('review.allDone')}</p>
            )}
          </section>
          <SidePanel
            label={t('review.history')}
            tabs={[
              {
                key: 'history',
                label: t('review.history'),
                count:
                  (inbox.data?.items.filter((i) => i.state === 'done').length ?? 0) +
                  (inbox.data?.answered.length ?? 0),
                content: (
                  <History items={inbox.data?.items ?? []} answered={inbox.data?.answered ?? []} />
                ),
              },
            ]}
          />
        </>
      )}
    </ColumnLayout>
  )
}

function Header({ title, requestId }: { title: string; requestId: string }) {
  const t = useTranslations('knowbots')
  return (
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Link href={`/names/${requestId}`} className="text-sm underline underline-offset-2">
        {t('toName')}
      </Link>
    </header>
  )
}

function QuestionTodo({ question, csrfToken }: { question: MyQuestion; csrfToken: string }) {
  return (
    <>
      <Header title={question.title} requestId={question.request_id} />
      <QuestionsHere questions={[question]} csrfToken={csrfToken} />
    </>
  )
}

/** 审核准专家：我的话用在了哪、它照我哪一版创意做的；行 / 不行（不行要说哪里不对）。 */
function DraftTodo({
  item,
  csrfToken,
}: {
  item: Draft & { request_id: string; title: string }
  csrfToken: string
}) {
  const t = useTranslations('knowbots')
  const client = useQueryClient()
  const [note, setNote] = useState('')
  const detail = useQuery({
    queryKey: [...KEY, 'detail', item.request_id],
    queryFn: () => fetchDetail(item.request_id),
  })
  const version = detail.data?.versions.find((v) => v.version === item.request_version)
  const answer = useMutation({
    mutationFn: (ok: boolean) => reviewDraft(item.draft_id, { ok, note: note.trim() }, csrfToken),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  })
  return (
    <>
      <Header
        title={`${item.title} · ${t('draftLabel', { label: item.label })}`}
        requestId={item.request_id}
      />
      <Card title={t('review.draftTitle')}>
        <p className="text-muted-foreground">{t('review.draftHint')}</p>
        <RuleSources draft={item} />
      </Card>
      {version ? (
        <Card title={t('review.fromVersion', { version: version.version })}>
          <Method idea={version.idea} />
          <Cases cases={version.cases} />
        </Card>
      ) : null}
      <Card>
        <label className="block">
          {t('review.note')}
          <textarea
            className="mt-1 w-full rounded-md border px-3 py-2"
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {answer.isError ? (
          <p className="text-destructive" role="alert">
            {t('review.failed')}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={answer.isPending} onClick={() => answer.mutate(true)}>
            {t('review.ok')}
          </Button>
          <Button
            variant="outline"
            disabled={answer.isPending || !note.trim()}
            onClick={() => answer.mutate(false)}
          >
            {t('review.notOk')}
          </Button>
        </div>
      </Card>
    </>
  )
}

/** 用户同意门：看成稿与测试结果，要不要这一版。要了的等我们审核，审过才上架。 */
function ExpertTodo({
  item,
  csrfToken,
}: {
  item: Expert & { request_id: string; title: string }
  csrfToken: string
}) {
  const t = useTranslations('knowbots')
  const client = useQueryClient()
  const detail = useQuery({
    queryKey: [...KEY, 'detail', item.request_id],
    queryFn: () => fetchDetail(item.request_id),
  })
  const test = detail.data?.tests.find((x) => x.test_id === item.test_id)
  const draft = detail.data?.drafts.find((d) => d.draft_id === item.draft_id)
  const version = detail.data?.versions.find((v) => v.version === draft?.request_version)
  const decide = useMutation({
    mutationFn: (accept: boolean) => decideExpert(item.expert_id, accept, csrfToken),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  })
  return (
    <>
      <Header
        title={`${item.title} · ${t('expertVersion', { version: item.version })}`}
        requestId={item.request_id}
      />
      <Card title={t('review.expertTitle')}>
        <p>{t('review.expertHint')}</p>
        {decide.isError ? (
          <p className="text-destructive" role="alert">
            {t('review.failed')}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={decide.isPending} onClick={() => decide.mutate(true)}>
            {t('review.accept')}
          </Button>
          <Button
            variant="outline"
            disabled={decide.isPending}
            onClick={() => decide.mutate(false)}
          >
            {t('review.decline')}
          </Button>
        </div>
      </Card>
      {test ? <TestResults test={test} cases={version?.cases} /> : null}
    </>
  )
}

/** 右边：我答过、定过的记录。 */
function History({ items, answered }: { items: InboxItem[]; answered: Answered[] }) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  const done = items.filter((i) => i.state === 'done')
  if (done.length === 0 && answered.length === 0)
    return <p className="text-muted-foreground">{t('review.noHistory')}</p>
  return (
    <ul className="space-y-3">
      {done.map((item) => (
        <li key={keyOf(item)}>
          <p className="font-medium">{item.title}</p>
          <p className="text-muted-foreground text-xs">
            {item.type === 'draft'
              ? t(item.user_review?.state === 'ok' ? 'review.draftOk' : 'review.draftNotOk', {
                  label: item.label,
                  at: when(item.user_review?.answered_at) ?? '—',
                })
              : item.type === 'expert'
                ? t(item.user_accepted ? 'review.expertAccepted' : 'review.expertDeclined', {
                    version: item.version,
                    at: when(item.user_decided_at) ?? '—',
                  })
                : null}
          </p>
        </li>
      ))}
      {answered.map((a) => (
        <li key={a.question_id}>
          <p className="whitespace-pre-wrap">{a.text}</p>
          <p className="text-muted-foreground text-xs">
            {t('review.answered', {
              answer: a.answer?.text ?? a.answer?.option_id ?? '—',
              at: when(a.answered_at) ?? '—',
            })}
          </p>
        </li>
      ))}
    </ul>
  )
}
