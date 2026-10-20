'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Link } from '@/i18n/navigation'
import { fetchDraftDetail, fetchRequestDetail } from '@/lib/knowbots/client'

import { QuestionsHere } from './my-questions'
import { Cases, Method, RuleSources } from './reference'
import {
  AvatarBadge,
  Card,
  Progress,
  Row,
  avatarName,
  useMine,
  type Avatar,
  type AvatarStatus,
} from './shared'
import { SidePanel, type PanelTab } from './side-panel'
import { TestResults } from './test-results'

// 分身（SDD 0037 §四.3）：照我的创意孵化出来、拿去测的那一个。一生四段，用我的说法：孵化 → 核对 → 测试 → 成为专家。
// 测试中只给一句进度（管理端那样的细进度不给用户）；测完每条用例一块，成稿在最前。

const STEP_AT: Record<AvatarStatus, number> = {
  hatching: 0,
  pending: 1,
  testing: 2,
  waiting: 2,
  failed: 2,
  passed: 3,
  delivered: 4,
}

// 列表里谁排前面：等我答的、在测的，其余照创意与分身的先后
function rank(a: Avatar): number {
  return a.status === 'waiting' ? 0 : a.status === 'testing' ? 1 : 2
}

export function AvatarsView({
  csrfToken,
  picked: initial,
}: {
  csrfToken: string
  picked?: string
}) {
  const t = useTranslations('knowbots')
  const { avatars, error, pending } = useMine()
  const [picked, setPicked] = useState<string | null>(initial ?? null)
  const sorted = [...avatars].sort((a, b) => rank(a) - rank(b))
  const current = sorted.find((a) => a.draft.draft_id === picked) ?? sorted[0] ?? null

  return (
    <div className="mt-6 space-y-4">
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {t('loadFailed')}
        </p>
      ) : pending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : sorted.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('avatars.empty')}</p>
      ) : (
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <aside aria-label={t('avatars.list')} className="w-full space-y-2 lg:w-72 lg:shrink-0">
            <ul className="space-y-2">
              {sorted.map((a) => (
                <li key={a.draft.draft_id}>
                  <Row
                    selected={a.draft.draft_id === current?.draft.draft_id}
                    onPick={() => setPicked(a.draft.draft_id)}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-medium">
                        {avatarName(t, a.draft)} · {a.request.title}
                      </span>
                      <AvatarBadge status={a.status} />
                    </span>
                    {a.latest ? null : (
                      <span className="text-muted-foreground mt-1 block text-xs">
                        {t('avatars.superseded')}
                      </span>
                    )}
                  </Row>
                </li>
              ))}
            </ul>
          </aside>
          {current ? (
            <Workspace key={current.draft.draft_id} avatar={current} csrfToken={csrfToken} />
          ) : null}
        </div>
      )}
    </div>
  )
}

function Workspace({ avatar, csrfToken }: { avatar: Avatar; csrfToken: string }) {
  const t = useTranslations('knowbots')
  const { draft, request, status } = avatar
  const detail = useQuery({
    queryKey: ['web', 'knowbot-draft', draft.draft_id],
    queryFn: () => fetchDraftDetail(draft.draft_id),
  })
  const idea = useQuery({
    queryKey: ['web', 'knowbot-request', request.request_id],
    queryFn: () => fetchRequestDetail(request.request_id),
  })
  const cases = idea.data?.cases
  const done = draft.report?.cases.length ?? 0
  const tabs: PanelTab[] = [
    ...(detail.data
      ? [
          {
            key: 'rules',
            label: t('tabs.rules'),
            count: detail.data.rule_sources.length,
            content: <RuleSources draft={detail.data} />,
          },
        ]
      : []),
    ...(idea.data
      ? [
          { key: 'method', label: t('tabs.method'), content: <Method detail={idea.data} /> },
          {
            key: 'cases',
            label: t('tabs.cases'),
            count: idea.data.cases.length,
            content: <Cases cases={idea.data.cases} />,
          },
        ]
      : []),
  ]
  return (
    <>
      <section aria-label={avatarName(t, draft)} className="min-w-0 flex-1 space-y-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">
              {avatarName(t, draft)} · {request.title}
            </h2>
            <AvatarBadge status={status} />
          </div>
          <p className="text-sm">
            <Link
              href={{ pathname: '/ideas', query: { request: request.request_id } }}
              className="text-muted-foreground underline underline-offset-2"
            >
              {t('avatars.toIdea')}
            </Link>
          </p>
          <Progress
            steps={['hatch', 'review', 'test', 'expert'].map((s) => t(`avatarSteps.${s}`))}
            at={STEP_AT[status]}
            bad={status === 'failed'}
            label={t('progress')}
          />
        </header>
        <Card>
          <p>{t(`avatars.now.${status}`)}</p>
          {(status === 'testing' || status === 'waiting') && done > 0 ? (
            <p className="text-muted-foreground">
              {cases
                ? t('avatars.doneOf', { done, total: cases.length })
                : t('avatars.done', { done })}
            </p>
          ) : null}
        </Card>
        <QuestionsHere questions={avatar.questions} csrfToken={csrfToken} cases={cases} />
        <TestResults draft={draft} cases={cases} />
        {detail.isError || idea.isError ? (
          <p className="text-destructive text-sm">{t('loadFailed')}</p>
        ) : null}
      </section>
      {tabs.length > 0 ? <SidePanel label={t('side.label')} tabs={tabs} /> : null}
    </>
  )
}
