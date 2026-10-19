'use client'

import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import {
  AvatarBadge,
  Card,
  IdeaBadge,
  avatarName,
  casesLine,
  useMine,
  useMyKnowbots,
} from './shared'

// 首页「我的进展一览」（SDD 0037 §四.2）：进来先知道到哪了、要我做什么——
// 待我回答、进行中的创意、最近的测试结果、做出来的专家（直接写专家名），各几条。

const FEW = 5

export function Overview() {
  const t = useTranslations('knowbots')
  const { ideas, avatars, questions, error, pending } = useMine()
  const knowbots = useMyKnowbots()
  const going = ideas.filter((i) => i.status !== 'expert')
  const tested = avatars
    .filter((a) => (a.draft.report?.cases.length ?? 0) > 0 && a.draft.status !== 'testing')
    .sort((a, b) =>
      (b.draft.report?.finished_at ?? '').localeCompare(a.draft.report?.finished_at ?? ''),
    )
  const experts = [...(knowbots.data ?? [])].sort((a, b) =>
    (b.delivered_at ?? '').localeCompare(a.delivered_at ?? ''),
  )

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <Card
        title={t('home.questions')}
        className={questions.length > 0 ? 'border-amber-300' : undefined}
      >
        {questions.length === 0 ? (
          <p className="text-muted-foreground">{t('home.questionsNone')}</p>
        ) : (
          <>
            <p>{t('home.questionsSome', { n: questions.length })}</p>
            <ul className="space-y-1">
              {questions.slice(0, 3).map((q) => (
                <li key={q.question_id} className="truncate">
                  <span className="text-muted-foreground">{q.title} · </span>
                  {q.text}
                </li>
              ))}
            </ul>
            <Link href="/questions" className="font-medium underline underline-offset-2">
              {t('home.toQuestions')}
            </Link>
          </>
        )}
      </Card>
      <Card title={t('home.ideas')}>
        {error ? (
          <p className="text-destructive">{t('loadFailed')}</p>
        ) : pending ? (
          <p className="text-muted-foreground">{t('loading')}</p>
        ) : going.length === 0 ? (
          <p className="text-muted-foreground">{t('home.ideasNone')}</p>
        ) : (
          <ul className="space-y-2">
            {going.slice(0, FEW).map((i) => (
              <li key={i.request.request_id} className="flex items-center justify-between gap-2">
                <Link
                  href={{ pathname: '/ideas', query: { request: i.request.request_id } }}
                  className="truncate underline-offset-2 hover:underline"
                >
                  {i.request.title}
                </Link>
                <IdeaBadge status={i.status} />
              </li>
            ))}
          </ul>
        )}
        <Link href="/ideas" className="text-muted-foreground text-xs underline underline-offset-2">
          {t('home.allIdeas')}
        </Link>
      </Card>
      <Card title={t('home.results')}>
        {pending || error ? null : tested.length === 0 ? (
          <p className="text-muted-foreground">{t('home.resultsNone')}</p>
        ) : (
          <ul className="space-y-2">
            {tested.slice(0, FEW).map((a) => (
              <li key={a.draft.draft_id} className="flex flex-wrap items-center gap-2">
                <Link
                  href={{ pathname: '/avatars', query: { draft: a.draft.draft_id } }}
                  className="underline-offset-2 hover:underline"
                >
                  {avatarName(t, a.draft)} · {a.request.title}
                </Link>
                <AvatarBadge status={a.status} />
                <span className="text-muted-foreground text-xs">{casesLine(t, a.draft)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t('home.experts')}>
        {knowbots.isError ? (
          <p className="text-destructive">{t('loadFailed')}</p>
        ) : knowbots.isPending ? (
          <p className="text-muted-foreground">{t('loading')}</p>
        ) : experts.length === 0 ? (
          <p className="text-muted-foreground">{t('home.expertsNone')}</p>
        ) : (
          <ul className="space-y-1">
            {experts.slice(0, FEW).map((k) => (
              <li key={k.draft_id}>
                <Link
                  href={{ pathname: '/experts', query: { draft: k.draft_id } }}
                  className="underline-offset-2 hover:underline"
                >
                  {k.name ?? k.title}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {' '}
                  · {t('experts.version', { version: k.version })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
