'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import type { KnowbotRequest } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import { acceptConsent, fetchRequestDetail } from '@/lib/knowbots/client'

import { Amendments } from './amendments'
import { QuestionsHere } from './my-questions'
import { Picker, rememberPick, type PickerGroup } from './picker'
import { AmendmentList, Cases, Method } from './reference'
import {
  AvatarBadge,
  Card,
  IdeaBadge,
  Progress,
  avatarName,
  casesLine,
  useMine,
  useWhen,
  type Avatar,
  type Idea,
} from './shared'
import { SidePanel } from './side-panel'

// 创意（SDD 0037 §四.3）：我交来的方法、用例，之后写的补充也挂在这里。
// 主栏：走到哪、要我答的问题（就地答）、补充方法（写、看状态）、它的分身（点了去分身页）。
// 选哪个创意用页面顶上的选择框，中间整块是它的详情。

// 选择框里怎么分组：等你回答的在前，然后在做的，最后已出专家的
type Group = 'mine' | 'working' | 'expert'
const GROUPS: readonly Group[] = ['mine', 'working', 'expert']

function groupOf(idea: Idea): Group {
  return idea.status === 'waiting' ? 'mine' : idea.status === 'expert' ? 'expert' : 'working'
}

export function IdeasView({ csrfToken, picked: initial }: { csrfToken: string; picked?: string }) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  const { ideas, avatars, error, pending } = useMine()
  const [picked, setPicked] = useState<string | null>(initial ?? null)
  const groups: PickerGroup[] = GROUPS.map((g) => ({
    key: g,
    label: t(`picker.groups.${g}`),
    items: ideas
      .filter((i) => groupOf(i) === g)
      .map((i) => {
        const at = when(i.request.created_at)
        return {
          id: i.request.request_id,
          title: i.request.title,
          sub: at ? t('ideas.submittedAt', { at }) : undefined,
          badge: <IdeaBadge status={i.status} />,
        }
      }),
  }))
  // 没点名的：等你回答的第一件，没有就最近的
  const first = groups.flatMap((g) => g.items)[0]?.id
  const current =
    ideas.find((i) => i.request.request_id === picked) ??
    ideas.find((i) => i.request.request_id === first) ??
    null

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {ideas.length > 0 ? (
          <Picker
            label={t('ideas.list')}
            groups={groups}
            value={current?.request.request_id ?? null}
            onPick={(id) => {
              setPicked(id)
              rememberPick({ request: id })
            }}
          />
        ) : null}
        <Link href="/ideas/new" className={buttonVariants()}>
          {t('ideas.new')}
        </Link>
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {t('loadFailed')}
        </p>
      ) : pending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : ideas.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('ideas.empty')}</p>
      ) : current ? (
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <Workspace
            key={current.request.request_id}
            idea={current}
            avatars={avatars.filter((a) => a.request.request_id === current.request.request_id)}
            csrfToken={csrfToken}
          />
        </div>
      ) : null}
    </div>
  )
}

function Workspace({
  idea,
  avatars,
  csrfToken,
}: {
  idea: Idea
  avatars: Avatar[]
  csrfToken: string
}) {
  const t = useTranslations('knowbots')
  const { request, status } = idea
  const detail = useQuery({
    queryKey: ['web', 'knowbot-request', request.request_id],
    queryFn: () => fetchRequestDetail(request.request_id),
  })
  const amendments = request.amendments ?? []
  return (
    <>
      <section aria-label={request.title} className="min-w-0 flex-1 space-y-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{request.title}</h2>
            <IdeaBadge status={status} />
          </div>
          <Progress
            steps={['submit', 'hatch', 'test', 'expert'].map((s) => t(`ideaSteps.${s}`))}
            // 还没有分身：在孵化；有分身在测或没通过：在测试；出了专家：都走完
            at={status === 'expert' ? 4 : avatars.length === 0 ? 1 : 2}
            bad={status === 'failed'}
            label={t('progress')}
          />
          <p className="text-muted-foreground text-sm">{t(`ideas.next.${status}`)}</p>
        </header>
        <ConsentNotice request={request} csrfToken={csrfToken} />
        <QuestionsHere
          questions={idea.questions}
          csrfToken={csrfToken}
          cases={detail.data?.cases}
        />
        <Amendments requestId={request.request_id} written={amendments} csrfToken={csrfToken} />
        <Card title={t('ideas.avatars')}>
          {avatars.length === 0 ? (
            <p className="text-muted-foreground">{t('ideas.noAvatar')}</p>
          ) : (
            <ul className="divide-y">
              {avatars.map((a) => {
                const line = casesLine(t, a.draft)
                return (
                  <li key={a.draft.draft_id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link
                      href={{ pathname: '/avatars', query: { draft: a.draft.draft_id } }}
                      className="font-medium underline underline-offset-2"
                    >
                      {avatarName(t, a.draft)}
                    </Link>
                    <AvatarBadge status={a.status} />
                    {line ? <span className="text-muted-foreground text-xs">{line}</span> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        {detail.isError ? <p className="text-destructive text-sm">{t('loadFailed')}</p> : null}
      </section>
      {detail.data ? (
        <SidePanel
          label={t('side.label')}
          tabs={[
            { key: 'method', label: t('tabs.method'), content: <Method detail={detail.data} /> },
            {
              key: 'cases',
              label: t('tabs.cases'),
              count: detail.data.cases.length,
              content: <Cases cases={detail.data.cases} />,
            },
            {
              key: 'amendments',
              label: t('tabs.amendments'),
              count: amendments.length,
              content: <AmendmentList amendments={amendments} />,
            },
          ]}
        />
      ) : null}
    </>
  )
}

/** 这个创意是在旧的测试数据说明下提交的：同意新说明之前，测试产出不取、不显示（审读 10-19）。 */
function ConsentNotice({ request, csrfToken }: { request: KnowbotRequest; csrfToken: string }) {
  const t = useTranslations('knowbots')
  const client = useQueryClient()
  const accept = useMutation({
    mutationFn: () => acceptConsent(request.request_id, csrfToken),
    onSuccess: () => client.invalidateQueries({ queryKey: ['web'] }),
  })
  if (!request.consent_version || !request.consent_current) return null
  if (request.consent_version >= request.consent_current) return null
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 p-4 text-sm" role="status">
      <p>{t('consent.needed')}</p>
      <p className="text-muted-foreground">{t('consent.text')}</p>
      {accept.isError ? (
        <p className="text-destructive" role="alert">
          {t('consent.failed')}
        </p>
      ) : null}
      <Button size="sm" disabled={accept.isPending} onClick={() => accept.mutate()}>
        {t('consent.accept')}
      </Button>
    </div>
  )
}
