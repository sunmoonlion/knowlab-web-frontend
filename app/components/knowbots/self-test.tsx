'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CrossAppLink } from '@/components/common/cross-app-link'
import { Button } from '@/components/ui/button'
import type {
  Detail,
  Grant,
  Test,
  TestDataItem,
  TestDataNeed,
  TestDataRequest,
} from '@/contracts/knowbots'
import { ApiClientError } from '@/lib/common/api-client'
import {
  confirmTestData,
  declineTestData,
  fetchComputers,
  fetchTestData,
  askPlatformTest,
  refreshMyTest,
  startSelfTest,
  type TestDataChoice,
  withdrawPlatformTest,
} from '@/lib/knowbots/client'

import { Card, KEY, useWhen } from './shared'

const ACTIVE = new Set(['queued', 'running', 'waiting'])
const field = 'h-8 rounded-lg border bg-transparent px-2 text-sm'
const SUBJECT = /^(\d{6}\.(SH|SZ|BJ)|\d{5}\.HK|[A-Z][A-Z0-9.-]{0,9}\.US|org:[0-9A-Za-z:-]{3,60})$/
const ADDABLE = ['annual_report', 'semiannual_report', 'interim_announcement', 'research_company']
// 发起时后端说没有能测的电脑（作者没接入过、那台或那个目录用不了了）：说清楚先去 knowbench 接入
// 模型 key 没填（SDD 0046 第三节「没填不能发起」）也说清楚去哪填
export const NO_COMPUTER = [
  'author_has_no_computer',
  'test_computer_unavailable',
  'model_key_missing',
] as const

/** 没发起成的话：认得的错误码说清楚怎么办，别的说「再试一次」。 */
export function startFailure(error: unknown, t: (key: string) => string): string {
  const code = error instanceof ApiClientError ? error.problem.code : ''
  return (NO_COMPUTER as readonly string[]).includes(code) ? t(`errors.${code}`) : t('startFailed')
}

// 测试（SDD 0046 第三节）：自己在自己的电脑上测一次（选电脑、费用上限）；在跑的测试里专家提出的
// 数据由我确认（换一份、改主体或年份、去掉、自己加一样），定下来的记成测试集，重测直接用。
export function SelfTests({ life, csrfToken }: { life: Detail; csrfToken: string }) {
  const t = useTranslations('knowbots.selfTest')
  const active = life.tests.filter((x) => ACTIVE.has(x.status))
  const latest = life.drafts.at(-1)
  const pending = active.length === 0 && latest?.status === 'pending_test' ? latest : undefined
  if (!pending && active.length === 0) return null
  return (
    <Card title={t('title')}>
      {pending ? <StartSelfTest draftId={pending.draft_id} csrfToken={csrfToken} /> : null}
      {pending && pending.mode === 'self' ? (
        <PlatformTest
          draftId={pending.draft_id}
          grant={[...life.grants]
            .reverse()
            .find((g) => g.kind === 'test' && g.draft_id === pending.draft_id)}
          csrfToken={csrfToken}
        />
      ) : null}
      {active.map((x) => (
        <ActiveTest key={x.test_id} test={x} csrfToken={csrfToken} />
      ))}
    </Card>
  )
}

function StartSelfTest({ draftId, csrfToken }: { draftId: string; csrfToken: string }) {
  const t = useTranslations('knowbots.selfTest')
  const client = useQueryClient()
  const computers = useQuery({
    queryKey: [...KEY, 'computers', draftId],
    queryFn: () => fetchComputers(draftId),
  })
  const [picked, setPicked] = useState<string | null>(null)
  const [root, setRoot] = useState<string | null>(null)
  const [budget, setBudget] = useState('10')
  const start = useMutation({
    mutationFn: (body: { environment_id: string; workspace_root: string; budget_limit: string }) =>
      startSelfTest(draftId, body, csrfToken),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  })
  if (!computers.data) {
    return <p className="text-muted-foreground">{computers.isError ? t('failed') : t('loading')}</p>
  }
  const { computers: list, last } = computers.data
  const online = list.filter((c) => c.online)
  // 默认：上次用的那台在线就是它；只有一台在线就是那台
  const fallback =
    online.find((c) => c.environment_id === last?.environment_id) ??
    (online.length === 1 ? online[0] : undefined)
  const env = list.find((c) => c.environment_id === (picked ?? fallback?.environment_id))
  const folder =
    root ??
    (env && last?.environment_id === env.environment_id && last.workspace_root
      ? last.workspace_root
      : env?.roots[0]) ??
    ''
  const okBudget = /^[0-9]{1,6}(\.[0-9]{1,2})?$/.test(budget) && Number(budget) > 0
  if (computers.data.model_key === false)
    return (
      <p className="text-amber-700" role="alert" data-testid="no-model-key">
        {t('noModelKey')}{' '}
        <CrossAppLink to="knowbench.settings" className="underline underline-offset-2">
          {t('toSettings')}
        </CrossAppLink>
      </p>
    )
  if (online.length === 0)
    return (
      <p className="text-amber-700">
        {t('noComputer')}{' '}
        <CrossAppLink to="knowbench.machines" className="underline underline-offset-2">
          {t('toMachines')}
        </CrossAppLink>
      </p>
    )
  return (
    <div className="space-y-2" data-testid="self-test-start">
      <p>{t('lead')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('computer')}
          className={field}
          value={env?.environment_id ?? ''}
          onChange={(event) => {
            setPicked(event.target.value)
            setRoot(null)
          }}
        >
          <option value="">{t('choose')}</option>
          {list.map((c) => (
            <option key={c.environment_id} value={c.environment_id} disabled={!c.online}>
              {c.online ? c.name : t('offline', { name: c.name })}
            </option>
          ))}
        </select>
        {env ? (
          <select
            aria-label={t('folder')}
            className={field}
            value={folder}
            onChange={(event) => setRoot(event.target.value)}
          >
            {env.roots.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : null}
        <label className="flex items-center gap-1">
          {t('budget')}
          <input
            aria-label={t('budget')}
            className={`${field} w-20`}
            inputMode="decimal"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
        </label>
        <Button
          size="sm"
          disabled={!env || !folder || !okBudget || start.isPending}
          onClick={() =>
            env &&
            start.mutate({
              environment_id: env.environment_id,
              workspace_root: folder,
              budget_limit: budget,
            })
          }
        >
          {start.isPending ? t('starting') : t('start')}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t('keyNote')}</p>
      {start.isError ? (
        <p role="alert" className="text-destructive">
          {startFailure(start.error, (key) => t(key as never))}
        </p>
      ) : null}
    </div>
  )
}

// 交平台测这一次（SDD 0046 第四节「自助孵化 + 平台测试」）：确认框写明平台会看到什么，同意就是
// 本人授权；平台轻受理后由平台发起，仍在我的电脑上、用我的 key 跑，上限我设。还没开测可以收回。
function PlatformTest({
  draftId,
  grant,
  csrfToken,
}: {
  draftId: string
  grant: Grant | undefined
  csrfToken: string
}) {
  const t = useTranslations('knowbots.platformTest')
  const client = useQueryClient()
  const [asking, setAsking] = useState(false)
  const [budget, setBudget] = useState('10')
  const run = useMutation({
    mutationFn: async (action: 'ask' | 'withdraw') => {
      if (action === 'ask') await askPlatformTest(draftId, budget, csrfToken)
      else if (grant) await withdrawPlatformTest(grant.grant_id, csrfToken)
    },
    onSuccess: async () => {
      setAsking(false)
      await client.invalidateQueries({ queryKey: KEY })
    },
  })
  const okBudget = /^[0-9]{1,4}(\.[0-9]{1,2})?$/.test(budget) && Number(budget) > 0
  const live = grant && (grant.state === 'pending' || grant.state === 'active')
  return (
    <div className="space-y-2 border-t pt-2" data-testid="platform-test">
      {live ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>{t(`state.${grant.state}`, { budget: grant.budget_limit })}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={run.isPending}
            onClick={() => run.mutate('withdraw')}
          >
            {t('withdraw')}
          </Button>
        </div>
      ) : asking ? (
        <div role="dialog" className="space-y-2 rounded-lg border p-3">
          <p className="font-medium">{t('confirmTitle')}</p>
          <ul className="text-muted-foreground list-disc space-y-0.5 pl-5">
            {(['who', 'key', 'pay'] as const).map((line) => (
              <li key={line}>{t(`lines.${line}`)}</li>
            ))}
          </ul>
          <label className="flex items-center gap-1">
            {t('budget')}
            <input
              aria-label={t('budget')}
              className={`${field} w-20`}
              inputMode="decimal"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!okBudget || run.isPending}
              onClick={() => run.mutate('ask')}
            >
              {t('agree')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {grant?.state === 'declined' && grant.reason ? (
            <span className="text-muted-foreground">{t('declined', { reason: grant.reason })}</span>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
            {t('ask')}
          </Button>
        </div>
      )}
      {run.isError ? (
        <p role="alert" className="text-destructive">
          {t('failed')}
        </p>
      ) : null}
    </div>
  )
}

function ActiveTest({ test, csrfToken }: { test: Test; csrfToken: string }) {
  const t = useTranslations('knowbots.selfTest')
  const tc = useTranslations('knowbots.testsColumn')
  const when = useWhen()
  const client = useQueryClient()
  const testId = test.test_id
  const failedCases = test.report?.cases
    .filter((c) => c.status === 'failed' || c.status === 'error')
    .map((c) => c.case_id)
  // 先请后端问一次运行方（记下新问题、查在取的数据），再列这次测试里等我定的数据
  const data = useQuery({
    queryKey: [...KEY, 'test-data', testId],
    queryFn: async () => {
      await refreshMyTest(testId, csrfToken)
      // 刷新实际状态与已完成用例；只失效详情，避免递归重取本查询。
      await client.invalidateQueries({ queryKey: [...KEY, 'detail'] })
      return fetchTestData(testId)
    },
    refetchInterval: 15_000,
  })
  return (
    <div className="space-y-2 border-t pt-2" data-testid="self-test-active">
      <p className="font-medium">{t(`activeStatus.${test.status}`, { number: test.number })}</p>
      <p className="text-muted-foreground text-sm">
        {[
          tc(`mode.${test.mode}`),
          test.label ? t('draft', { label: test.label }) : '',
          when(test.started_at),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <p className="text-muted-foreground text-sm">{t('executionLocation')}</p>
      {failedCases?.length ? (
        <p role="status" className="text-amber-700">
          {t('failedCases', { cases: failedCases.join('、') })}
        </p>
      ) : null}
      {data.isError ? <p role="alert">{t('dataRefreshFailed')}</p> : null}
      {(data.data ?? []).map((request) => (
        <DataRequest key={request.question_id} request={request} csrfToken={csrfToken} />
      ))}
    </div>
  )
}

type Changes = {
  picks: Record<string, { material_id: string; version_no: number }>
  dropped: string[]
  edits: Record<string, { subject: string | null; from: number; to: number }>
  added: { doc_type: string; subject: string | null; from: number; to: number }[]
}
const none: Changes = { picks: {}, dropped: [], edits: {}, added: [] }

function fixed(from: number, to: number) {
  const [a, b] = from <= to ? [from, to] : [to, from]
  return { kind: 'fixed', start: `${a}-01-01`, end: `${b}-12-31` }
}

// 交给后端的：改了主体、年份或自己加了的，带整份 needs（去掉的不带）；否则只带换选与去掉的
export function choiceOf(request: TestDataRequest, changes: Changes): TestDataChoice {
  const touched = Object.keys(changes.edits).length > 0 || changes.added.length > 0
  if (!touched) {
    return {
      ...(Object.keys(changes.picks).length ? { picks: changes.picks } : {}),
      ...(changes.dropped.length ? { dropped: changes.dropped } : {}),
    }
  }
  const gone = new Set(
    request.items.filter((i) => changes.dropped.includes(i.ref)).map((i) => i.need_key),
  )
  return {
    needs: [
      ...request.needs
        .filter((n) => !gone.has(n.key))
        .map((n) => {
          const edit = changes.edits[n.key]
          return edit ? { ...n, subject: edit.subject, period: fixed(edit.from, edit.to) } : n
        }),
      ...changes.added.map((a) => ({
        doc_type: a.doc_type,
        name: a.doc_type,
        ...(a.subject ? { subject: a.subject } : {}),
        period: fixed(a.from, a.to),
        reading: 'pages',
      })),
    ],
  }
}

function DataRequest({ request, csrfToken }: { request: TestDataRequest; csrfToken: string }) {
  const t = useTranslations('knowbots.testData')
  const client = useQueryClient()
  const [changes, setChanges] = useState<Changes>(none)
  const done = () => {
    setChanges(none)
    return client.invalidateQueries({ queryKey: KEY })
  }
  const confirm = useMutation({
    mutationFn: () => confirmTestData(request.question_id, choiceOf(request, changes), csrfToken),
    onSuccess: done,
  })
  const decline = useMutation({
    mutationFn: () => declineTestData(request.question_id, csrfToken),
    onSuccess: done,
  })
  const busy = confirm.isPending || decline.isPending
  if (request.status === 'supplying') return <p className="text-amber-700">{t('supplying')}</p>
  if (request.status === 'missing') {
    return (
      <div className="space-y-1" data-testid="test-data-missing">
        <p className="text-amber-700">{t('missing', { items: request.missing.join('；') })}</p>
        <Button size="sm" disabled={busy} onClick={() => decline.mutate()}>
          {t('goOn')}
        </Button>
      </div>
    )
  }
  if (request.status !== 'proposed') return null
  const byKey = new Map(request.needs.map((n) => [n.key, n]))
  const unchosen = request.items.filter(
    (i) =>
      i.status === 'ambiguous' &&
      !changes.dropped.includes(i.ref) &&
      !changes.picks[i.ref] &&
      !(i.need_key in changes.edits),
  ).length
  return (
    <div className="space-y-2" data-testid="test-data-request">
      <p className="text-amber-700">{t('lead', { caseId: request.case_id })}</p>
      <ul className="space-y-1.5">
        {request.items.map((item) => (
          <Row
            key={item.ref}
            item={item}
            need={byKey.get(item.need_key)}
            changes={changes}
            onChange={setChanges}
          />
        ))}
        {changes.added.map((a, n) => (
          <li key={n} className="rounded-lg border border-dashed p-2">
            {t(`docType.${a.doc_type}`)} · {a.subject ?? t('anySubject')} · {a.from}–{a.to}
          </li>
        ))}
      </ul>
      <Add onAdd={(a) => setChanges({ ...changes, added: [...changes.added, a] })} />
      {unchosen ? <p className="text-amber-700">{t('unchosen', { count: unchosen })}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || unchosen > 0} onClick={() => confirm.mutate()}>
          {confirm.isPending ? t('confirming') : t('confirm')}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => decline.mutate()}>
          {t('decline')}
        </Button>
      </div>
      {confirm.isError || decline.isError ? (
        <p role="alert" className="text-destructive">
          {t('failed')}
        </p>
      ) : null}
    </div>
  )
}

const year = (text: string) => {
  const n = Number(text)
  return Number.isInteger(n) && n >= 1990 && n <= new Date().getFullYear() + 1 ? n : null
}
const normal = (text: string) => {
  const v = text.trim()
  if (!v) return null
  return v.startsWith('org:') ? v : v.toUpperCase()
}

function Row({
  item,
  need,
  changes,
  onChange,
}: {
  item: TestDataItem
  need: TestDataNeed | undefined
  changes: Changes
  onChange: (next: Changes) => void
}) {
  const t = useTranslations('knowbots.testData')
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState(item.key.subject ?? '')
  const [from, setFrom] = useState(item.key.period_start?.slice(0, 4) ?? '')
  const [to, setTo] = useState(item.key.period_end?.slice(0, 4) ?? '')
  const off = changes.dropped.includes(item.ref)
  const edit = need ? changes.edits[need.key] : undefined
  const pool = [...item.chosen, ...item.candidates]
  const value = (c: { material_id: string; version_no: number }) =>
    `${c.material_id}@${c.version_no}`
  const subject = edit ? edit.subject : item.key.subject
  const period = edit
    ? `${edit.from}–${edit.to}`
    : [item.key.period_start, item.key.period_end].filter(Boolean).join(' ~ ')
  const c = normal(code)
  const [a, b] = [year(from), year(to)]
  const reading =
    typeof need?.reading === 'string' &&
    ['original', 'pages', 'text', 'table'].includes(need.reading)
      ? t(`reading.${need.reading}`)
      : ''
  return (
    <li className={`rounded-lg border p-2 ${off ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{need?.name ?? item.need_key}</span>
        <span className="text-muted-foreground text-xs">
          {[subject ?? t('anySubject'), period, reading, need?.required ? t('essential') : '']
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="text-muted-foreground ml-auto text-xs">
          {off ? t('dropped') : edit ? t('changed') : t(`status.${item.status}`)}
        </span>
      </div>
      {!off && !edit && pool.length > 1 ? (
        <select
          aria-label={t('pick', { name: need?.name ?? item.need_key })}
          className={`${field} mt-1 w-full`}
          value={changes.picks[item.ref] ? value(changes.picks[item.ref]) : ''}
          onChange={(event) => {
            const found = pool.find((p) => value(p) === event.target.value)
            const picks = { ...changes.picks }
            if (found)
              picks[item.ref] = { material_id: found.material_id, version_no: found.version_no }
            else delete picks[item.ref]
            onChange({ ...changes, picks })
          }}
        >
          <option value="">{item.status === 'ambiguous' ? t('choose') : t('asListed')}</option>
          {pool.map((p) => (
            <option key={value(p)} value={value(p)}>
              {p.name || p.material_id}
            </option>
          ))}
        </select>
      ) : !off && !edit && item.chosen.length ? (
        <p className="text-muted-foreground mt-1 truncate">
          {item.chosen.map((p) => p.name || p.material_id).join(' · ')}
        </p>
      ) : null}
      {editing && need ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            aria-label={t('subject')}
            className={`${field} w-36`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <input
            aria-label={t('from')}
            className={`${field} w-20`}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            aria-label={t('to')}
            className={`${field} w-20`}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={(c !== null && !SUBJECT.test(c)) || a === null || b === null}
            onClick={() => {
              setEditing(false)
              if (a !== null && b !== null)
                onChange({
                  ...changes,
                  edits: { ...changes.edits, [need.key]: { subject: c, from: a, to: b } },
                })
            }}
          >
            {t('editDone')}
          </Button>
        </div>
      ) : null}
      <div className="mt-1 flex gap-3 text-xs">
        <button
          type="button"
          className="text-muted-foreground underline"
          onClick={() =>
            onChange({
              ...changes,
              dropped: off
                ? changes.dropped.filter((r) => r !== item.ref)
                : [...changes.dropped, item.ref],
            })
          }
        >
          {off ? t('undrop') : t('drop')}
        </button>
        {!off && need && !editing ? (
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => setEditing(true)}
          >
            {t('edit')}
          </button>
        ) : null}
      </div>
    </li>
  )
}

function Add({ onAdd }: { onAdd: (a: Changes['added'][number]) => void }) {
  const t = useTranslations('knowbots.testData')
  const [open, setOpen] = useState(false)
  const [docType, setDocType] = useState(ADDABLE[0])
  const [code, setCode] = useState('')
  const last = String(new Date().getFullYear() - 1)
  const [from, setFrom] = useState(last)
  const [to, setTo] = useState(last)
  const c = normal(code)
  const [a, b] = [year(from), year(to)]
  if (!open) {
    return (
      <button
        type="button"
        className="text-muted-foreground text-xs underline"
        onClick={() => setOpen(true)}
      >
        {t('add')}
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="test-data-add">
      <select
        aria-label={t('docTypeLabel')}
        className={field}
        value={docType}
        onChange={(e) => setDocType(e.target.value)}
      >
        {ADDABLE.map((d) => (
          <option key={d} value={d}>
            {t(`docType.${d}`)}
          </option>
        ))}
      </select>
      <input
        aria-label={t('subject')}
        className={`${field} w-36`}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <input
        aria-label={t('from')}
        className={`${field} w-20`}
        value={from}
        onChange={(e) => setFrom(e.target.value)}
      />
      <input
        aria-label={t('to')}
        className={`${field} w-20`}
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={(c !== null && !SUBJECT.test(c)) || a === null || b === null}
        onClick={() => {
          if (a === null || b === null) return
          onAdd({ doc_type: docType, subject: c, from: a, to: b })
          setOpen(false)
        }}
      >
        {t('addDone')}
      </Button>
    </div>
  )
}
