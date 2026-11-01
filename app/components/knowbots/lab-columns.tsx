'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { buttonVariants } from '@/components/ui/button'
import { ACTIVE_ROUNDS } from '@/contracts/workdraft'
import type { Application, Detail, ExpertItem, Test } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import { fetchApplications, fetchDetail, fetchExperts, fetchRounds } from '@/lib/knowbots/client'

import { IncubationMode } from './incubation-mode'
import { summaryParts } from './name-view'
import { DeliveryPanel } from './delivery-panel'
import { PlatformView } from './platform-asks'
import { Cases } from './reference'
import { SelfTests } from './self-test'
import {
  Badge,
  Card,
  ColumnLayout,
  EXPERT_TONE,
  KEY,
  TEST_TONE,
  useWhen,
  type Tone,
} from './shared'
import { TestResults } from './test-results'

// web端左边的孵化、测试、交付三栏（SDD 0046 第六节）。名称页照旧在，栏是同一批东西的另一种入口：
// 孵化按名称列、标现在的模式；测试列用例、测试集、确认数据、发起、历次测试；交付列各版专家，
// 在这里选一版、定自用或公开、授权审核员、提交，看审核进度，过了进 knowmart 小店（第五节）。

const ACTIVE_TESTS = new Set(['queued', 'running', 'waiting'])

function NameHeader({ item }: { item: Application }) {
  const t = useTranslations('knowbots')
  return (
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">{item.title}</h2>
      <p className="text-muted-foreground text-sm">
        {summaryParts(item.summary, t).join(' · ')} ·{' '}
        <Link href={`/names/${item.request_id}`} className="underline underline-offset-2">
          {t('toName')}
        </Link>
      </p>
    </header>
  )
}

function useDetail(requestId: string) {
  return useQuery({
    queryKey: [...KEY, 'detail', requestId],
    queryFn: () => fetchDetail(requestId),
  })
}

function Row({ item, tone, label }: { item: Application; tone: Tone; label: string }) {
  const t = useTranslations('knowbots')
  return (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="font-medium">{item.title}</span>
        <Badge tone={tone}>{label}</Badge>
      </span>
      <span className="text-muted-foreground mt-1 block truncate text-xs">
        {summaryParts(item.summary, t).join(' · ')}
      </span>
    </>
  )
}

// ---------- 孵化 ----------
const INCUBATION_FILTERS = ['self', 'platform'] as const
type IncubationFilter = (typeof INCUBATION_FILTERS)[number]

export function IncubationColumn({
  csrfToken,
  picked: initial,
}: {
  csrfToken: string
  picked?: string
}) {
  const t = useTranslations('knowbots')
  const list = useQuery({ queryKey: [...KEY, 'applications'], queryFn: fetchApplications })
  const [picked, setPicked] = useState<string | null>(initial ?? null)
  const items = (list.data ?? []).filter((i) => i.category !== 'rejected')
  return (
    <ColumnLayout<IncubationFilter, Application>
      title={t('columns.incubation')}
      filters={INCUBATION_FILTERS}
      defaultFilter={items.some((i) => i.incubation_mode === 'self') ? 'self' : 'platform'}
      items={items}
      categoryOf={(item) => item.incubation_mode}
      keyOf={(item) => item.request_id}
      picked={picked}
      onPick={setPicked}
      empty={items.length === 0 ? t('incubationColumn.empty') : t('empty')}
      failed={list.isError}
      pending={list.isPending}
      renderRow={(item) => (
        <Row
          item={item}
          tone={item.incubation_mode === 'platform' ? 'running' : 'muted'}
          label={t(`mode.${item.incubation_mode}`)}
        />
      )}
    >
      {(current) =>
        current ? (
          <IncubationMain key={current.request_id} item={current} csrfToken={csrfToken} />
        ) : null
      }
    </ColumnLayout>
  )
}

function IncubationMain({ item, csrfToken }: { item: Application; csrfToken: string }) {
  const t = useTranslations('knowbots')
  const detail = useDetail(item.request_id)
  const life = detail.data
  return (
    <section aria-label={item.title} className="min-w-0 flex-1 space-y-4">
      <NameHeader item={item} />
      {detail.isError ? <p className="text-destructive text-sm">{t('loadFailed')}</p> : null}
      {life ? <IncubationMode life={life} csrfToken={csrfToken} /> : null}
      {life && life.incubation_mode === 'platform' ? (
        <PlatformView life={life} progress={summaryParts(life.summary, t).join(' · ')} />
      ) : life ? (
        <SelfIncubation life={life} />
      ) : null}
    </section>
  )
}

/** 自助：工作稿入口，最近一轮 AI 到哪了。 */
function SelfIncubation({ life }: { life: Detail }) {
  const t = useTranslations('knowbots.incubationColumn')
  const ta = useTranslations('workdraft.ai')
  const rounds = useQuery({
    queryKey: [...KEY, 'rounds', life.request_id],
    queryFn: () => fetchRounds(life.request_id),
  })
  const latest = rounds.data?.at(-1)
  return (
    <Card title={t('workdraft')}>
      <p className="text-muted-foreground">{t('workdraftHint')}</p>
      {latest ? (
        <p data-testid="latest-round">
          {ta('round', { n: latest.round })} · {ta(`action.${latest.action}`)} ·{' '}
          <span className={ACTIVE_ROUNDS.includes(latest.status) ? 'text-amber-700' : ''}>
            {ta(`status.${latest.status}`)}
          </span>
        </p>
      ) : null}
      <Link
        href={`/names/${life.request_id}/workdraft`}
        className={buttonVariants({ size: 'sm', variant: 'outline' })}
      >
        {t('open')}
      </Link>
    </Card>
  )
}

// ---------- 测试 ----------
const TEST_FILTERS = ['to_test', 'testing', 'tested', 'no_draft'] as const
type TestFilter = (typeof TEST_FILTERS)[number]

function testCategory(item: Application): TestFilter {
  const test = item.summary.test
  if (test && ACTIVE_TESTS.has(test.status)) return 'testing'
  if (!item.summary.draft) return 'no_draft'
  if (!test) return 'to_test'
  return 'tested'
}

export function TestsColumn({
  csrfToken,
  picked: initial,
}: {
  csrfToken: string
  picked?: string
}) {
  const t = useTranslations('knowbots')
  const list = useQuery({ queryKey: [...KEY, 'applications'], queryFn: fetchApplications })
  const [picked, setPicked] = useState<string | null>(initial ?? null)
  const items = (list.data ?? []).filter((i) => i.category !== 'rejected')
  const tone: Record<TestFilter, Tone> = {
    to_test: 'todo',
    testing: 'running',
    tested: 'good',
    no_draft: 'muted',
  }
  return (
    <ColumnLayout<TestFilter, Application>
      title={t('columns.tests')}
      filters={TEST_FILTERS}
      defaultFilter={items.some((i) => testCategory(i) === 'testing') ? 'testing' : 'to_test'}
      items={items}
      categoryOf={testCategory}
      keyOf={(item) => item.request_id}
      picked={picked}
      onPick={setPicked}
      empty={items.length === 0 ? t('testsColumn.empty') : t('empty')}
      failed={list.isError}
      pending={list.isPending}
      renderRow={(item) => (
        <Row
          item={item}
          tone={tone[testCategory(item)]}
          label={t(`categories.${testCategory(item)}`)}
        />
      )}
    >
      {(current) =>
        current ? <TestsMain key={current.request_id} item={current} csrfToken={csrfToken} /> : null
      }
    </ColumnLayout>
  )
}

function TestsMain({ item, csrfToken }: { item: Application; csrfToken: string }) {
  const t = useTranslations('knowbots')
  const tc = useTranslations('knowbots.testsColumn')
  const detail = useDetail(item.request_id)
  const life = detail.data
  const latest = life?.versions.find((v) => v.version === item.latest_version)
  const setVersion = life?.tests.reduce<number | null>(
    (a, x) =>
      x.test_set_version !== null && (a === null || x.test_set_version > a)
        ? x.test_set_version
        : a,
    null,
  )
  return (
    <section aria-label={item.title} className="min-w-0 flex-1 space-y-4">
      <NameHeader item={item} />
      {detail.isError ? <p className="text-destructive text-sm">{t('loadFailed')}</p> : null}
      {life ? (
        <>
          <Card title={tc('cases')}>
            {latest ? <Cases cases={latest.cases} /> : null}
            <Link
              href={`/applications/${item.request_id}/revise`}
              className="text-sm underline underline-offset-2"
            >
              {tc('editCases')}
            </Link>
          </Card>
          <Card title={tc('testSet')}>
            <p data-testid="test-set">
              {setVersion ? tc('testSetVersion', { version: setVersion }) : tc('testSetNone')}
            </p>
            <p className="text-muted-foreground text-xs">{tc('testSetHint')}</p>
          </Card>
          <SelfTests life={life} csrfToken={csrfToken} />
          {!life.drafts.some((d) => d.status === 'pending_test') &&
          !life.tests.some((x) => ACTIVE_TESTS.has(x.status)) ? (
            <Card title={tc('start')}>
              <p className="text-muted-foreground">{tc('nothingToTest')}</p>
            </Card>
          ) : null}
          <Card title={tc('history')}>
            <TestHistory life={life} cases={latest?.cases} />
          </Card>
        </>
      ) : null}
    </section>
  )
}

function TestHistory({ life, cases }: { life: Detail; cases?: Record<string, unknown>[] }) {
  const t = useTranslations('knowbots')
  const tc = useTranslations('knowbots.testsColumn')
  const when = useWhen()
  if (life.tests.length === 0) return <p className="text-muted-foreground">{tc('historyNone')}</p>
  return (
    <ul className="space-y-2" data-testid="test-history">
      {[...life.tests].reverse().map((x: Test) => (
        <li key={x.test_id}>
          <details className="rounded-lg border">
            <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 px-3 py-2">
              <span className="font-medium">{t('testNumber', { number: x.number })}</span>
              <Badge tone={TEST_TONE[x.status]}>{t(`testStatus.${x.status}`)}</Badge>
              <span className="text-muted-foreground text-xs">
                {[
                  tc(`mode.${x.mode}`),
                  x.label ? t('draftLabel', { label: x.label }) : '',
                  x.test_set_version ? tc('testSetVersion', { version: x.test_set_version }) : '',
                  when(x.started_at) ?? '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </summary>
            <div className="border-t p-3">
              {x.report?.cases.length ? (
                <TestResults test={x} cases={cases} />
              ) : (
                <p className="text-muted-foreground">{tc('noReport')}</p>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  )
}

// ---------- 交付（SDD 0046 第五节） ----------
const DELIVERY_FILTERS = ['new', 'accepted', 'usable', 'stopped', 'not_listed'] as const
type DeliveryFilter = (typeof DELIVERY_FILTERS)[number]

export function DeliveryColumn({
  csrfToken,
  picked: initial,
}: {
  csrfToken: string
  picked?: string
}) {
  const t = useTranslations('knowbots')
  const list = useQuery({ queryKey: [...KEY, 'experts'], queryFn: fetchExperts })
  const [picked, setPicked] = useState<string | null>(initial ?? null)
  const items = list.data ?? []
  return (
    <ColumnLayout<DeliveryFilter, ExpertItem>
      title={t('columns.delivery')}
      filters={DELIVERY_FILTERS}
      defaultFilter={items.some((i) => i.category === 'new') ? 'new' : 'accepted'}
      items={items}
      categoryOf={(item) => item.category}
      keyOf={(item) => item.expert_id}
      picked={picked}
      onPick={setPicked}
      empty={items.length === 0 ? t('deliveryColumn.empty') : t('empty')}
      failed={list.isError}
      pending={list.isPending}
      renderRow={(item) => (
        <>
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">{item.name ?? item.title}</span>
            <Badge tone={EXPERT_TONE[item.stage]}>{t(`expertStage.${item.stage}`)}</Badge>
          </span>
          <span className="text-muted-foreground mt-1 block text-xs">
            {t('expertVersion', { version: item.version })}
          </span>
        </>
      )}
    >
      {(current) =>
        current ? (
          <DeliveryMain key={current.expert_id} item={current} csrfToken={csrfToken} />
        ) : null
      }
    </ColumnLayout>
  )
}

/** 一版专家的交付：这一版到哪了、自用还是公开、审核员授权、提交与审核进度、进没进小店。 */
function DeliveryMain({ item, csrfToken }: { item: ExpertItem; csrfToken: string }) {
  const t = useTranslations('knowbots')
  const td = useTranslations('knowbots.deliveryColumn')
  const when = useWhen()
  const rows: [string, string][] = [
    [td('version'), t('expertVersion', { version: item.version })],
    [
      td('listing'),
      item.review_listing ? td(`listingKind.${item.review_listing}`) : td('listingUnset'),
    ],
    [
      td('progress'),
      [t(`expertStage.${item.stage}`), item.review_reason ?? ''].filter(Boolean).join('：'),
    ],
    [
      td('shop'),
      item.listed_at ? td('listed', { at: when(item.listed_at) ?? '' }) : td('notListed'),
    ],
  ]
  return (
    <section aria-label={item.name ?? item.title} className="min-w-0 flex-1 space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{item.name ?? item.title}</h2>
        <p className="text-muted-foreground text-sm">
          <Link href={`/names/${item.request_id}`} className="underline underline-offset-2">
            {t('toName')}
          </Link>
        </p>
      </header>
      <Card title={td('card')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5" data-testid="delivery-rows">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {item.stage === 'to_return' ? (
          <p className="text-muted-foreground">{td('waitReturn')}</p>
        ) : null}
      </Card>
      <DeliveryPanel expert={item} csrfToken={csrfToken} />
    </section>
  )
}
