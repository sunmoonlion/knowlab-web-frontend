'use client'

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  ACTIVE_ROUNDS,
  type Proposal,
  type Round,
  type RoundStart,
  type Suggestion,
  type Workdraft,
  type WorkdraftBody,
} from '@/contracts/workdraft'
import { Link, useRouter } from '@/i18n/navigation'
import { ApiClientError } from '@/lib/common/api-client'
import {
  acceptStep,
  cancelRound,
  copyWorkdraft,
  decideProposal,
  decideSuggestion,
  fetchRound,
  fetchRounds,
  fetchWorkdraft,
  importWorkdraft,
  pickData,
  previewWorkdraft,
  publishWorkdraft,
  refreshRound,
  saveWorkdraftCells,
  seedSkill,
  startRound,
} from '@/lib/knowbots/client'
import { diffEdits, freshId, newStep, placed, withoutStep } from '@/lib/knowbots/workdraft'

import { Card, KEY } from './shared'
import { GapsCard, RoundBar, RoundPanel, startFailure } from './workdraft-ai'
import { Field, Group, INPUT, MarksContext, useProblemText } from './workdraft-cells'
import { DataCard } from './workdraft-data'
import { CopyPanel, ImportPanel, PreviewPanel } from './workdraft-panels'
import { StepEditor } from './workdraft-step'
import {
  OtherSuggestions,
  PendingSteps,
  SuggestionsContext,
  homeOf,
  type Choice,
} from './workdraft-suggestions'

// 工作稿页面（专家孵化方案第六、八节）：名称页「孵化」栏点进来。一个分格子的表单，作者看不到 JSON：
// 整个专家的格子、一步一步的格子；改了自动保存（带 revision，别处改过回 409 就重新载入）。每格
// 旁边小字标出处，后端预览回来的问题按格子路径标红。顶上：AI 起草、让 AI 改…、导入（专家包或
// skill 当种子）、从我的准专家复制、预览清单、出一版；进行中的那一轮与历次在工具条下面，这一轮的
// 建议显示在格子旁边，缺口列在页面底下。

type Doc = {
  body: WorkdraftBody // 页面上的这一份（可能还没存）
  saved: WorkdraftBody // 后端存着的那一份
  revision: number
  origins: Record<string, string>
  formats: Workdraft['data_formats'] // 挑的数据的格式（挑的时候后端记下的）
}
type Status = { kind: 'idle' | 'pending' | 'saving' | 'saved' } | { kind: 'failed'; code: string }
type Panels = 'preview' | 'import' | 'copy' | 'draft' | 'revise' | null
const POLL_MS = 10_000

const docOf = (w: Workdraft): Doc => ({
  body: w.body,
  saved: w.body,
  revision: w.revision,
  origins: w.origins,
  formats: w.data_formats ?? {},
})
const codeOf = (error: unknown) =>
  error instanceof ApiClientError ? error.problem.code : 'unexpected'
const conflict = (error: unknown) =>
  error instanceof ApiClientError && error.problem.code === 'workdraft_revision'

export function WorkdraftView({
  requestId,
  csrfToken,
  saveDelay = 800,
}: {
  requestId: string
  csrfToken: string
  saveDelay?: number
}) {
  const t = useTranslations('workdraft')
  const loaded = useQuery({
    queryKey: [...KEY, 'workdraft', requestId],
    queryFn: () => fetchWorkdraft(requestId),
  })
  // 别处改过（409）：重新取一份，编辑器整个换成新的
  const [generation, setGeneration] = useState(0)
  const [reloaded, setReloaded] = useState(false)
  if (loaded.isError)
    return (
      <p className="text-destructive mt-6 text-sm" role="alert">
        {t('loadFailed')}
      </p>
    )
  if (!loaded.data) return <p className="text-muted-foreground mt-6 text-sm">{t('loading')}</p>
  return (
    <Editor
      key={generation}
      initial={loaded.data}
      requestId={requestId}
      csrfToken={csrfToken}
      saveDelay={saveDelay}
      reloaded={reloaded}
      onConflict={async () => {
        await loaded.refetch()
        setReloaded(true)
        setGeneration((g) => g + 1)
      }}
    />
  )
}

function Editor({
  initial,
  requestId,
  csrfToken,
  saveDelay,
  reloaded,
  onConflict,
}: {
  initial: Workdraft
  requestId: string
  csrfToken: string
  saveDelay: number
  reloaded: boolean
  onConflict: () => Promise<void>
}) {
  const t = useTranslations('workdraft')
  const ta = useTranslations('workdraft.ai')
  const router = useRouter()
  const client = useQueryClient()
  const problemText = useProblemText()
  const [doc, setDoc] = useState<Doc>(() => docOf(initial))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [panel, setPanel] = useState<Panels>(null)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [deciding, setDeciding] = useState(false)
  const [reviseText, setReviseText] = useState('')
  const [dataError, setDataError] = useState<string | null>(null)
  const docRef = useRef(doc)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const dead = useRef(false)
  useEffect(() => {
    dead.current = false
    const pending = timer
    return () => {
      dead.current = true
      if (!pending.current) return
      // 离开页面时还没到点的那次照样存（不等回包；别处改过就算了）
      clearTimeout(pending.current)
      const current = docRef.current
      const cells = diffEdits(current.saved, current.body)
      if (cells.length)
        saveWorkdraftCells(requestId, { revision: current.revision, cells }, csrfToken).catch(
          () => undefined,
        )
    }
  }, [requestId, csrfToken])

  const preview = useQuery({
    queryKey: [...KEY, 'workdraft-preview', requestId, doc.revision],
    queryFn: () => previewWorkdraft(requestId),
    placeholderData: keepPreviousData,
  })
  const problems = preview.data?.problems ?? []

  // AI 孵化的各轮：最后一轮在跑就每 10 秒刷新一次（问运行方）；格子旁边是最近一轮成了的建议
  const roundsKey = [...KEY, 'rounds', requestId]
  const rounds = useQuery({ queryKey: roundsKey, queryFn: () => fetchRounds(requestId) })
  const list = rounds.data ?? []
  const latest = list.at(-1)
  const running = latest !== undefined && ACTIVE_ROUNDS.includes(latest.status)
  const roundKey = (id: string | undefined) => [...KEY, 'round', requestId, id]
  const current = useQuery({
    queryKey: roundKey(latest?.incubation_id),
    enabled: latest !== undefined,
    queryFn: () => {
      const id = latest?.incubation_id ?? ''
      return running ? refreshRound(requestId, id, csrfToken) : fetchRound(requestId, id)
    },
    refetchInterval: running ? POLL_MS : false,
  })
  const currentStatus = current.data?.status
  useEffect(() => {
    // 刷新后这一轮结束了：各轮重新取，格子旁边换成这一轮的建议
    if (latest && currentStatus && currentStatus !== latest.status) void rounds.refetch()
  }, [latest, currentStatus, rounds])
  const done = [...list].reverse().find((r) => r.status === 'succeeded')
  const shownRound = useQuery({
    queryKey: roundKey(done?.incubation_id),
    enabled: done !== undefined,
    queryFn: () => fetchRound(requestId, done?.incubation_id ?? ''),
  })
  const shown: Round | undefined = done ? shownRound.data : undefined
  // 平台孵化时平台人员的提议（专家孵化方案第十二节）：和 AI 的建议一样放在格子旁边，标明是平台
  // 人员提的，接受了才算
  const [proposals, setProposals] = useState<Proposal[]>(() => initial.proposals ?? [])
  const pending = useMemo(
    () => [
      ...(shown?.suggestions ?? []).filter((s) => s.state === 'pending'),
      ...proposals.filter((p) => p.state === 'pending').map(asSuggestion),
    ],
    [shown, proposals],
  )

  const commit = (next: Doc) => {
    docRef.current = next
    setDoc(next)
  }

  // 存一次：拿存好的那份与页面上的比，改了的格子带 revision 存
  const save = async () => {
    if (dead.current) return
    const current = docRef.current
    const cells = diffEdits(current.saved, current.body)
    if (cells.length === 0) {
      setStatus((s) => (s.kind === 'pending' && !timer.current ? { kind: 'saved' } : s))
      return
    }
    setStatus({ kind: 'saving' })
    try {
      const got = await saveWorkdraftCells(
        requestId,
        { revision: current.revision, cells },
        csrfToken,
      )
      if (dead.current) return
      commit({ ...docRef.current, saved: got.body, revision: got.revision, origins: got.origins })
      setStatus({ kind: timer.current ? 'pending' : 'saved' })
    } catch (error) {
      if (dead.current) return
      if (conflict(error)) {
        dead.current = true
        await onConflict()
        return
      }
      setStatus({ kind: 'failed', code: codeOf(error) })
    }
  }

  // 一次只存一个：排在前一次后面
  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const next = queue.current.then(save)
    queue.current = next
    return next
  }

  const edit = (change: (body: WorkdraftBody) => WorkdraftBody) => {
    commit({ ...docRef.current, body: change(docRef.current.body) })
    setStatus({ kind: 'pending' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void flush()
    }, saveDelay)
  }

  // 整份换掉（导入、复制）：先把没存的存了，带最新的 revision
  const replace = async (
    run: (revision: number) => Promise<Workdraft>,
    failed: (code: string) => string,
    done: string,
  ) => {
    setBusy(true)
    setPanelError(null)
    try {
      await flush()
      if (dead.current) return
      const got = await run(docRef.current.revision)
      if (dead.current) return
      commit(docOf(got))
      setStatus({ kind: 'saved' })
      setNotes(got.notes ?? [])
      setMessage({ tone: 'ok', text: done })
      setPanel(null)
    } catch (error) {
      if (dead.current) return
      if (conflict(error)) {
        dead.current = true
        await onConflict()
        return
      }
      setPanelError(failed(codeOf(error)))
    } finally {
      if (!dead.current) setBusy(false)
    }
  }

  const publish = async () => {
    setBusy(true)
    setPublishing(true)
    setMessage(null)
    try {
      await flush()
      if (dead.current) return
      // 有改动没存上（存的时候出错了）：先别出，出的会是旧的那份
      if (diffEdits(docRef.current.saved, docRef.current.body).length) {
        setMessage({ tone: 'bad', text: t('publish.unsaved') })
        return
      }
      const got = await publishWorkdraft(requestId, csrfToken)
      const label = `${got.version}.${got.revision}`
      setMessage({ tone: 'ok', text: t('publish.done', { label }) })
      router.push(`/names/${encodeURIComponent(requestId)}?published=${encodeURIComponent(label)}`)
    } catch (error) {
      if (dead.current) return
      if (conflict(error)) {
        dead.current = true
        await onConflict()
        return
      }
      const refused = codeOf(error) === 'workdraft_invalid'
      // 出不了：重新预览一次，问题标到格子上
      if (refused) await preview.refetch()
      setMessage({
        tone: 'bad',
        text: refused ? t('publish.refused') : t('publish.failed', { code: codeOf(error) }),
      })
    } finally {
      if (!dead.current) {
        setBusy(false)
        setPublishing(false)
      }
    }
  }

  // 发起一轮：先把没存的存了，带着最新的工作稿去
  const start = async (round: RoundStart) => {
    setBusy(true)
    setPanelError(null)
    try {
      await flush()
      if (dead.current) return
      const got = await startRound(requestId, round, csrfToken)
      if (dead.current) return
      client.setQueryData(roundKey(got.incubation_id), got)
      await rounds.refetch()
      setPanel(null)
      setMessage({ tone: 'ok', text: ta('started', { n: got.round }) })
    } catch (error) {
      if (dead.current) return
      setPanelError(startFailure(error, (key) => ta(key as never)))
    } finally {
      if (!dead.current) setBusy(false)
    }
  }

  const cancel = async () => {
    if (!latest) return
    setBusy(true)
    try {
      const got = await cancelRound(requestId, latest.incubation_id, csrfToken)
      client.setQueryData(roundKey(got.incubation_id), got)
      await rounds.refetch()
    } catch (error) {
      setMessage({ tone: 'bad', text: ta('cancelFailed', { code: codeOf(error) }) })
    } finally {
      if (!dead.current) setBusy(false)
    }
  }

  // 一条建议：接受、改了再接受（改工作稿，带 revision）、不要
  const decide = async (suggestion: Suggestion, choice: Choice, value?: unknown) => {
    const operator = suggestion.kinds.includes('operator')
    if (!operator && !done) return
    setDeciding(true)
    setMessage(null)
    try {
      await flush()
      if (dead.current) return
      if (diffEdits(docRef.current.saved, docRef.current.body).length) {
        setMessage({ tone: 'bad', text: t('publish.unsaved') })
        return
      }
      const body = {
        action: choice,
        ...(choice === 'reject' ? {} : { revision: docRef.current.revision }),
        ...(value !== undefined ? { value } : {}),
      }
      if (operator) {
        const got = await decideProposal(requestId, suggestion.id.slice(3), body, csrfToken)
        if (dead.current) return
        if (choice !== 'reject') {
          commit(docOf(got.workdraft))
          setStatus({ kind: 'saved' })
        }
        setProposals((all) =>
          all.map((p) => (p.proposal_id === got.proposal.proposal_id ? got.proposal : p)),
        )
        return
      }
      if (!done) return
      const got = await decideSuggestion(
        requestId,
        done.incubation_id,
        suggestion.id,
        body,
        csrfToken,
      )
      if (dead.current) return
      if (choice !== 'reject') {
        commit(docOf(got.workdraft))
        setStatus({ kind: 'saved' })
      }
      client.setQueryData(roundKey(done.incubation_id), got.round)
    } catch (error) {
      if (dead.current) return
      if (conflict(error)) {
        dead.current = true
        await onConflict()
        return
      }
      setMessage({ tone: 'bad', text: ta('decideFailed', { code: codeOf(error) }) })
    } finally {
      if (!dead.current) setDeciding(false)
    }
  }

  // 挑数据：先把没存的存了，带最新的 revision 整份换（只能是知识库栏里的，后端记下格式）
  const pick = async (picks: string[]) => {
    setBusy(true)
    setDataError(null)
    try {
      await flush()
      if (dead.current) return
      const got = await pickData(requestId, { revision: docRef.current.revision, picks }, csrfToken)
      if (dead.current) return
      commit({ ...docOf(got), body: { ...docRef.current.body, data_picks: got.body.data_picks } })
      setStatus({ kind: 'saved' })
    } catch (error) {
      if (dead.current) return
      if (conflict(error)) {
        dead.current = true
        await onConflict()
        return
      }
      setDataError(t('data.failed', { code: codeOf(error) }))
    } finally {
      if (!dead.current) setBusy(false)
    }
  }

  // 一键接受一步的全部建议（专家孵化方案第 8.3 节）：出处核不上的、放不上去的跳过，照旧逐条处理
  const acceptAll = async (stepId: string) => {
    if (!done) return
    setDeciding(true)
    setMessage(null)
    try {
      await flush()
      if (dead.current) return
      if (diffEdits(docRef.current.saved, docRef.current.body).length) {
        setMessage({ tone: 'bad', text: t('publish.unsaved') })
        return
      }
      const got = await acceptStep(
        requestId,
        done.incubation_id,
        stepId,
        docRef.current.revision,
        csrfToken,
      )
      if (dead.current) return
      if (got.accepted.length) {
        commit(docOf(got.workdraft))
        setStatus({ kind: 'saved' })
      }
      client.setQueryData(roundKey(done.incubation_id), got.round)
      setMessage(
        got.skipped.length
          ? {
              tone: 'bad',
              text: ta('acceptedSome', { n: got.accepted.length, m: got.skipped.length }),
            }
          : { tone: 'ok', text: ta('acceptedAll', { n: got.accepted.length }) },
      )
    } catch (error) {
      if (dead.current) return
      if (conflict(error)) {
        dead.current = true
        await onConflict()
        return
      }
      setMessage({ tone: 'bad', text: ta('decideFailed', { code: codeOf(error) }) })
    } finally {
      if (!dead.current) setDeciding(false)
    }
  }

  // 导入 skill 当种子：存成创意的新一版，提示去点「AI 起草」
  const seed = async (skill: string) => {
    setBusy(true)
    setPanelError(null)
    try {
      const version = await seedSkill(requestId, skill, csrfToken)
      if (dead.current) return
      setPanel(null)
      setNotes([])
      setMessage({ tone: 'ok', text: t('import.seeded', { version }) })
    } catch (error) {
      if (dead.current) return
      setPanelError(t('import.seedFailed', { code: codeOf(error) }))
    } finally {
      if (!dead.current) setBusy(false)
    }
  }

  const { body } = doc
  const suggestions = {
    at: (home: string) => pending.filter((s) => homeOf(s, body) === home),
    busy: deciding || busy,
    decide: (s: Suggestion, choice: Choice, value?: unknown) => void decide(s, choice, value),
    // 这一步上还没处理的 AI 建议有几条（平台人员的提议逐条处理，不在里面）
    inStep: (stepId: string) =>
      pending.filter(
        (s) =>
          !s.kinds.includes('operator') &&
          (s.path === `steps/${stepId}` || s.path.startsWith(`steps/${stepId}/`)),
      ).length,
    acceptStep: (stepId: string) => void acceptAll(stepId),
  }
  const openRound = (action: 'draft' | 'revise', text = '') => {
    setPanelError(null)
    setReviseText(text)
    setPanel(panel === action ? null : action)
  }
  const elsewhere = problems.filter((p) => !placed(p.path, body))
  const setStep = (step: WorkdraftBody['steps'][number]) =>
    edit((b) => ({ ...b, steps: b.steps.map((s) => (s.id === step.id ? step : s)) }))
  const move = (id: string, by: -1 | 1) =>
    edit((b) => {
      const steps = [...b.steps]
      const index = steps.findIndex((s) => s.id === id)
      const to = index + by
      if (index < 0 || to < 0 || to >= steps.length) return b
      ;[steps[index], steps[to]] = [steps[to], steps[index]]
      return { ...b, steps }
    })
  const statusText =
    status.kind === 'failed'
      ? t('status.failed', { code: status.code })
      : t(`status.${status.kind}`)

  return (
    <MarksContext.Provider value={{ problems, origins: doc.origins }}>
      <SuggestionsContext.Provider value={suggestions}>
        <div className="mt-6 space-y-4">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold">
              {initial.title} · {t('title')}
            </h2>
            <span
              role="status"
              aria-live="polite"
              className={
                status.kind === 'failed'
                  ? 'text-destructive text-xs'
                  : 'text-muted-foreground text-xs'
              }
            >
              {statusText}
            </span>
            <Link
              href={`/names/${requestId}`}
              className="ml-auto text-sm underline underline-offset-2"
            >
              {t('backToName')}
            </Link>
          </header>
          <div role="toolbar" aria-label={t('toolbar.label')} className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || running}
              aria-expanded={panel === 'draft'}
              onClick={() => openRound('draft')}
            >
              {t('toolbar.aiDraft')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || running}
              aria-expanded={panel === 'revise'}
              onClick={() => openRound('revise')}
            >
              {t('toolbar.aiRevise')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              aria-expanded={panel === 'import'}
              onClick={() => {
                setPanelError(null)
                setPanel(panel === 'import' ? null : 'import')
              }}
            >
              {t('toolbar.import')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              aria-expanded={panel === 'copy'}
              onClick={() => {
                setPanelError(null)
                setPanel(panel === 'copy' ? null : 'copy')
              }}
            >
              {t('toolbar.copy')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-expanded={panel === 'preview'}
              onClick={async () => {
                if (panel === 'preview') return setPanel(null)
                setPanel('preview')
                await flush()
                void preview.refetch()
              }}
            >
              {t('toolbar.preview')}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void publish()}>
              {publishing ? t('toolbar.publishing') : t('toolbar.publish')}
            </Button>
          </div>
          <RoundBar
            rounds={list}
            current={current.data ?? latest}
            busy={busy}
            onCancel={() => void cancel()}
          />
          {reloaded ? (
            <p role="alert" className="text-sm text-amber-700">
              {t('conflict')}
            </p>
          ) : null}
          {message ? (
            <div
              role={message.tone === 'bad' ? 'alert' : 'status'}
              className={
                message.tone === 'bad'
                  ? 'text-destructive text-sm'
                  : 'text-sm text-emerald-700 dark:text-emerald-400'
              }
            >
              <p>{message.text}</p>
              {notes.length ? (
                <>
                  <p className="text-muted-foreground mt-1 text-xs">{t('import.notes')}</p>
                  <ul className="text-muted-foreground list-disc pl-5 text-xs">
                    {notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
          {panel === 'draft' || panel === 'revise' ? (
            <RoundPanel
              key={`${panel}-${reviseText}`}
              requestId={requestId}
              action={panel}
              steps={body.steps}
              busy={busy}
              error={panelError}
              initialInstruction={reviseText}
              onStart={(round) => void start(round)}
              onClose={() => setPanel(null)}
            />
          ) : panel === 'preview' ? (
            <PreviewPanel
              preview={preview.data}
              failed={preview.isError}
              onClose={() => setPanel(null)}
            />
          ) : panel === 'import' ? (
            <ImportPanel
              busy={busy}
              error={panelError}
              onClose={() => setPanel(null)}
              onSeedSkill={(skill) => void seed(skill)}
              onImport={(manifest) =>
                void replace(
                  (revision) => importWorkdraft(requestId, { revision, manifest }, csrfToken),
                  (code) => t('import.invalid', { code }),
                  t('import.done'),
                )
              }
            />
          ) : panel === 'copy' ? (
            <CopyPanel
              requestId={requestId}
              busy={busy}
              error={panelError}
              onClose={() => setPanel(null)}
              onCopy={(draftId) =>
                void replace(
                  (revision) =>
                    copyWorkdraft(requestId, { revision, draft_id: draftId }, csrfToken),
                  (code) => t('copy.failed', { code }),
                  t('copy.done'),
                )
              }
            />
          ) : null}
          <OtherSuggestions />
          {elsewhere.length ? (
            <Card title={t('problems.title')} className="border-destructive/50">
              <ul
                className="text-destructive list-disc space-y-0.5 pl-5 text-xs"
                data-testid="problems-elsewhere"
              >
                {elsewhere.map((p, i) => (
                  <li key={i}>
                    {p.path ? <code className="mr-1">{p.path}</code> : null}
                    {problemText(p)}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card title={t('expert.title')}>
            <Field label={t('expert.name')} path="name" filled={Boolean(body.name.trim())}>
              {(a11y) => (
                <input
                  {...a11y}
                  className={INPUT}
                  maxLength={80}
                  value={body.name}
                  onChange={(e) => edit((b) => ({ ...b, name: e.target.value }))}
                />
              )}
            </Field>
            <Field label={t('expert.tagline')} path="tagline" filled={Boolean(body.tagline.trim())}>
              {(a11y) => (
                <input
                  {...a11y}
                  className={INPUT}
                  maxLength={200}
                  value={body.tagline}
                  onChange={(e) => edit((b) => ({ ...b, tagline: e.target.value }))}
                />
              )}
            </Field>
            {(
              [
                ['does', 'expert.does'],
                ['does_not', 'expert.doesNot'],
                ['elsewhere', 'expert.elsewhere'],
              ] as const
            ).map(([key, label]) => (
              <Field
                key={key}
                label={t(label)}
                path={`scope/${key}`}
                filled={Boolean(body.scope[key].trim())}
              >
                {(a11y) => (
                  <textarea
                    {...a11y}
                    className={INPUT}
                    rows={2}
                    maxLength={2000}
                    value={body.scope[key]}
                    onChange={(e) =>
                      edit((b) => ({ ...b, scope: { ...b.scope, [key]: e.target.value } }))
                    }
                  />
                )}
              </Field>
            ))}
          </Card>
          <DataCard
            picks={body.data_picks}
            formats={doc.formats}
            busy={busy}
            error={dataError}
            onPick={(picks) => void pick(picks)}
          />
          <Group title={t('steps.title')} path="steps">
            {body.steps.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('steps.none')}</p>
            ) : null}
            <div className="space-y-4">
              {body.steps.map((step, index) => (
                <StepEditor
                  key={step.id}
                  step={step}
                  number={index + 1}
                  count={body.steps.length}
                  earlier={body.steps.slice(0, index)}
                  onChange={setStep}
                  onMove={(by) => move(step.id, by)}
                  onRemove={() => edit((b) => withoutStep(b, step.id))}
                />
              ))}
            </div>
            <PendingSteps />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                edit((b) => ({
                  ...b,
                  steps: [
                    ...b.steps,
                    newStep(
                      freshId(
                        's',
                        b.steps.map((s) => s.id),
                      ),
                    ),
                  ],
                }))
              }
            >
              {t('steps.add')}
            </Button>
          </Group>
          <GapsCard
            gaps={shown?.gaps ?? []}
            onRevise={() => openRound('revise', ta('withAnswers'))}
          />
        </div>
      </SuggestionsContext.Provider>
    </MarksContext.Provider>
  )
}

/** 平台人员的一条提议，放进建议框（编号带 op: 前缀，处理时走提议的接口）。 */
function asSuggestion(p: Proposal): Suggestion {
  return {
    id: `op:${p.proposal_id}`,
    path: p.path,
    op: p.op,
    value: p.value,
    reason: p.reason,
    sources: [],
    kinds: ['operator'],
    verified: true,
    problems: [],
    state: 'pending',
  }
}
