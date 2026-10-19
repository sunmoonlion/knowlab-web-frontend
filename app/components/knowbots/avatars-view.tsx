'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Link } from '@/i18n/navigation'
import { fetchDraftDetail, fetchRequestDetail } from '@/lib/knowbots/client'

import { QuestionsHere } from './my-questions'
import { Picker, rememberPick, type PickerGroup } from './picker'
import { Cases, Method, RuleSources } from './reference'
import {
  AvatarBadge,
  Card,
  Progress,
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

// 选择框里怎么分组：等你回答的在前，然后在做的、已成专家的，最后是旧的（已有更新的分身）
type Group = 'mine' | 'working' | 'expert' | 'history'
const GROUPS: readonly Group[] = ['mine', 'working', 'expert', 'history']

function groupOf(a: Avatar): Group {
  if (a.status === 'waiting') return 'mine'
  if (!a.latest) return 'history'
  return a.status === 'delivered' ? 'expert' : 'working'
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
  const groups: PickerGroup[] = GROUPS.map((g) => ({
    key: g,
    label: t(`picker.groups.${g}`),
    items: avatars
      .filter((a) => groupOf(a) === g)
      .map((a) => ({
        id: a.draft.draft_id,
        title: `${avatarName(t, a.draft)} · ${a.request.title}`,
        badge: <AvatarBadge status={a.status} />,
      })),
  }))
  // 没点名的：等你回答的第一件，没有就在做的
  const first = groups.flatMap((g) => g.items)[0]?.id
  const current =
    avatars.find((a) => a.draft.draft_id === picked) ??
    avatars.find((a) => a.draft.draft_id === first) ??
    null

  return (
    <div className="mt-6 space-y-4">
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {t('loadFailed')}
        </p>
      ) : pending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : avatars.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('avatars.empty')}</p>
      ) : (
        <>
          <Picker
            label={t('avatars.list')}
            groups={groups}
            value={current?.draft.draft_id ?? null}
            onPick={(id) => {
              setPicked(id)
              rememberPick({ draft: id })
            }}
          />
          {current ? (
            <div className="flex flex-col items-start gap-6 lg:flex-row">
              <Workspace key={current.draft.draft_id} avatar={current} csrfToken={csrfToken} />
            </div>
          ) : null}
        </>
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
