'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  formalExecutionSpecSchema,
  type FormalExecutionResult,
} from '@/contracts/formal-method-execution'
import type { FormalDraft } from '@/contracts/formal-methods'
import { ApiClientError } from '@/lib/common/api-client'
import { fetchRoundComputers } from '@/lib/knowbots/client'
import {
  cancelFormalExecution,
  decideFormalExecution,
  getFormalExecution,
  getFormalSuite,
  startFormalExecution,
  type FormalExecutionCommand,
} from '@/lib/knowbots/formal-method-execution'
import type { ValidationCommand } from '@/lib/knowbots/formal-methods'

const input = 'mt-1 w-full rounded border bg-background p-2 text-sm'
const terminal = (r?: FormalExecutionResult) =>
  !!r && ['passed', 'failed', 'cancelled'].includes(r.status)
type CaseEditor = {
  case_id: string
  values: string
  assertions: string
  outcome: 'succeeded' | 'rejected'
  rejection_code: 'authorization_denied' | 'approval_denied' | 'input_invalid'
  repetitions: number
  minimum_passes: number
}
const blank = (n: number): CaseEditor => ({
  case_id: `case_${n}`,
  values: '{}',
  assertions: '[]',
  outcome: 'succeeded',
  rejection_code: 'authorization_denied',
  repetitions: 1,
  minimum_passes: 1,
})

export function FormalMethodExecution({
  methodId,
  requestId,
  revision,
  draft,
  disabled,
  csrfToken,
  resume,
  onRun,
  onResult,
  onActiveChange,
}: {
  methodId: string
  requestId: string
  revision: number
  draft: FormalDraft | null
  disabled: boolean
  csrfToken: string
  resume?: ValidationCommand | null
  onRun: (command: ValidationCommand) => void
  onResult: (result: FormalExecutionResult) => void
  onActiveChange: (active: boolean) => void
}) {
  const t = useTranslations('formalExecution')
  const cache = useQueryClient()
  const supported =
    draft?.definition.procedure.kind === 'direct' &&
    draft.definition.procedure.implementation.kind === 'mcp' &&
    draft.definition.procedure.max_model_turns === 0 &&
    draft.allowed_callers.length === 1 &&
    draft.allowed_callers[0] === 'host'
  const [command, setCommand] = useState<ValidationCommand | null>(resume ?? null)
  const [submitted, setSubmitted] = useState<FormalExecutionCommand | null>(null)
  const [suite, setSuite] = useState(() => ({ suite_id: crypto.randomUUID(), version: 1 }))
  const [cases, setCases] = useState<CaseEditor[]>([blank(1)])
  const [environment, setEnvironment] = useState('')
  const [root, setRoot] = useState('')
  const [budget, setBudget] = useState('1.00')
  const [timeout, setTimeoutSeconds] = useState(300)
  const [wait, setWait] = useState(3600)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const computers = useQuery({
    queryKey: ['formal-computers', requestId],
    queryFn: () => fetchRoundComputers(requestId),
    enabled: !!supported && !command,
    retry: false,
  })
  const key = ['formal-execution', methodId, command?.run_id]
  const run = useQuery({
    queryKey: key,
    queryFn: () =>
      getFormalExecution(methodId, command!, cache.getQueryData<FormalExecutionResult>(key)),
    enabled: !!command && !busy,
    retry: false,
    refetchInterval: (query) => (terminal(query.state.data) ? false : 3000),
  })
  const result = run.data
  const active = !!command && !terminal(result)
  useEffect(() => {
    onActiveChange(active)
  }, [active, onActiveChange])
  useEffect(() => {
    if (result) onResult(result)
  }, [result, onResult])
  const selected = computers.data?.computers.find((c) => c.environment_id === environment)
  const validRoot = !!selected?.roots.includes(root)
  const problem = (e: unknown) =>
    e instanceof ApiClientError ? e.problem.code : 'contract_or_network_error'
  const perform = async (action: () => Promise<FormalExecutionResult>, target = command) => {
    setBusy(true)
    setError(null)
    try {
      await cache.cancelQueries({ queryKey: ['formal-execution', methodId, target?.run_id] })
      const value = await action()
      cache.setQueryData(['formal-execution', methodId, target?.run_id], value)
    } catch (e) {
      setError(problem(e))
    } finally {
      setBusy(false)
    }
  }
  const start = async () => {
    try {
      const execution = formalExecutionSpecSchema.parse({
        suite: {
          ...suite,
          cases: cases.map((c) => ({
            case_id: c.case_id,
            input: { values: JSON.parse(c.values) },
            repetitions: c.repetitions,
            minimum_passes: c.minimum_passes,
            expected: {
              outcome: c.outcome,
              rejection_code: c.outcome === 'rejected' ? c.rejection_code : null,
              assertions: c.outcome === 'succeeded' ? JSON.parse(c.assertions) : [],
            },
          })),
        },
        runner: { kind: 'user', environment_id: environment, workspace_root: root },
        budget: { limit: budget, currency: 'CNY' },
        timeout_seconds: timeout,
        max_wait_seconds: wait,
      })
      const identity = { request_id: requestId, revision, run_id: crypto.randomUUID() }
      const next = { ...identity, execution }
      setSubmitted(next)
      setCommand(identity)
      onRun(identity)
      await perform(() => startFormalExecution(methodId, next, csrfToken), next)
    } catch {
      setError('suite_invalid')
    }
  }
  const update = (index: number, change: Partial<CaseEditor>) =>
    setCases((items) => items.map((c, i) => (i === index ? { ...c, ...change } : c)))
  const nextSuite = async () => {
    if (!result) return
    setBusy(true)
    setError(null)
    try {
      const saved = await getFormalSuite(requestId, result.suite)
      setSuite({ suite_id: saved.suite_id, version: saved.version + 1 })
      setCases(
        saved.cases.map((c) => ({
          case_id: c.case_id,
          values: JSON.stringify(c.input.values, null, 2),
          assertions: JSON.stringify(c.expected.assertions, null, 2),
          outcome: c.expected.outcome,
          rejection_code: c.expected.rejection_code ?? 'authorization_denied',
          repetitions: c.repetitions,
          minimum_passes: c.minimum_passes,
        })),
      )
      setCommand(null)
      setSubmitted(null)
    } catch (e) {
      setError(problem(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-3 rounded border p-4">
      <h2 className="font-medium">{t('title')}</h2>
      <p className="text-muted-foreground text-sm">{t('hint')}</p>
      {!supported ? <p>{t('unsupported')}</p> : null}
      {supported && !command ? (
        <fieldset disabled={disabled || busy} className="space-y-3">
          <p>{t('suiteVersion', { version: suite.version })}</p>
          {cases.map((c, i) => (
            <fieldset key={i} className="space-y-2 rounded border p-3">
              <legend>{t('caseNumber', { number: i + 1 })}</legend>
              <label className="block">
                {t('caseId')}
                <input
                  className={input}
                  value={c.case_id}
                  onChange={(e) => update(i, { case_id: e.target.value })}
                />
              </label>
              <label className="block">
                {t('values')}
                <textarea
                  className={input}
                  rows={4}
                  value={c.values}
                  onChange={(e) => update(i, { values: e.target.value })}
                />
              </label>
              <label className="block">
                {t('outcome')}
                <select
                  className={input}
                  value={c.outcome}
                  onChange={(e) => update(i, { outcome: e.target.value as CaseEditor['outcome'] })}
                >
                  <option value="succeeded">{t('succeeded')}</option>
                  <option value="rejected">{t('rejected')}</option>
                </select>
              </label>
              {c.outcome === 'succeeded' ? (
                <label className="block">
                  {t('assertions')}
                  <textarea
                    className={input}
                    rows={4}
                    value={c.assertions}
                    onChange={(e) => update(i, { assertions: e.target.value })}
                  />
                  <span className="text-muted-foreground text-sm">{t('assertionHint')}</span>
                </label>
              ) : (
                <label className="block">
                  {t('rejection')}
                  <select
                    className={input}
                    value={c.rejection_code}
                    onChange={(e) =>
                      update(i, { rejection_code: e.target.value as CaseEditor['rejection_code'] })
                    }
                  >
                    {(['authorization_denied', 'approval_denied', 'input_invalid'] as const).map(
                      (code) => (
                        <option key={code} value={code}>
                          {t(code)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              )}
              <label className="block">
                {t('repetitions')}
                <input
                  className={input}
                  type="number"
                  min={1}
                  max={10}
                  value={c.repetitions}
                  onChange={(e) => update(i, { repetitions: Number(e.target.value) })}
                />
              </label>
              <label className="block">
                {t('minimumPasses')}
                <input
                  className={input}
                  type="number"
                  min={1}
                  max={c.repetitions}
                  value={c.minimum_passes}
                  onChange={(e) => update(i, { minimum_passes: Number(e.target.value) })}
                />
              </label>
              <Button
                variant="outline"
                disabled={cases.length === 1}
                onClick={() => setCases(cases.filter((_, n) => n !== i))}
              >
                {t('remove')}
              </Button>
            </fieldset>
          ))}
          <Button
            variant="outline"
            disabled={cases.length >= 50}
            onClick={() => {
              let number = 1
              while (cases.some((item) => item.case_id === `case_${number}`)) number++
              setCases([...cases, blank(number)])
            }}
          >
            {t('add')}
          </Button>
          <label className="block">
            {t('computer')}
            <select
              className={input}
              value={environment}
              onChange={(e) => {
                setEnvironment(e.target.value)
                setRoot('')
              }}
            >
              <option value="">{t('chooseComputer')}</option>
              {computers.data?.computers.map((c) => (
                <option key={c.environment_id} value={c.environment_id}>
                  {c.name}
                  {c.online ? '' : ` · ${t('offline')}`}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {t('workspace')}
            <select className={input} value={root} onChange={(e) => setRoot(e.target.value)}>
              <option value="">{t('chooseWorkspace')}</option>
              {selected?.roots.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {computers.isError ? <p role="alert">{t('computersFailed')}</p> : null}
          <label className="block">
            {t('budget')}
            <input className={input} value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label className="block">
            {t('timeout')}
            <input
              className={input}
              type="number"
              min={60}
              max={86400}
              value={timeout}
              onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
            />
          </label>
          <label className="block">
            {t('maxWait')}
            <input
              className={input}
              type="number"
              min={60}
              max={604800}
              value={wait}
              onChange={(e) => setWait(Number(e.target.value))}
            />
          </label>
          <Button disabled={!validRoot} onClick={() => void start()}>
            {t('start')}
          </Button>
        </fieldset>
      ) : null}
      {command ? (
        <div className="space-y-3">
          <p>
            {t('runReference')}: {command.run_id}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy || run.isFetching}
              onClick={() => void run.refetch()}
            >
              {t('refresh')}
            </Button>
            {active ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void perform(() => cancelFormalExecution(methodId, command, csrfToken, result))
                }
              >
                {t('cancel')}
              </Button>
            ) : null}
            {error && !result && submitted ? (
              <Button
                disabled={busy}
                onClick={() =>
                  void perform(() => startFormalExecution(methodId, submitted, csrfToken))
                }
              >
                {t('retry')}
              </Button>
            ) : null}
            {terminal(result) ? (
              <Button
                variant="outline"
                disabled={busy || disabled}
                onClick={() => void nextSuite()}
              >
                {t('nextVersion')}
              </Button>
            ) : null}
          </div>
          {result ? (
            <>
              <p role="status">
                {t(`status.${result.status}`)} · {t('spent', { value: result.spent })}
              </p>
              <p>{t('suiteVersion', { version: result.suite.version })}</p>
              {result.cases.map((c) => (
                <div key={`${c.case_id}:${c.repetition}`} className="rounded border p-2 text-sm">
                  <p>
                    {c.case_id} · {c.repetition} · {t(`status.${c.status}`)} ·{' '}
                    {t(`outcomes.${c.outcome}`)}
                  </p>
                  <p>{c.detail}</p>
                  {c.assertions.map((a) => (
                    <p key={a.index}>
                      {a.index + 1}: {t(a.passed ? 'assertionPassed' : 'assertionFailed')} ·{' '}
                      {a.detail}
                    </p>
                  ))}
                </div>
              ))}
              {result.actions.map((action) => (
                <div key={action.call_id} className="space-y-2 rounded border p-3">
                  <h3>{action.title}</h3>
                  <p>{action.question}</p>
                  <p>
                    {action.case_id} · {action.repetition}
                  </p>
                  <pre className="overflow-auto text-xs">
                    {JSON.stringify(action.subject, null, 2)}
                  </pre>
                  <Button
                    disabled={busy || Date.parse(action.expires_at) <= Date.now()}
                    onClick={() =>
                      void perform(() =>
                        decideFormalExecution(
                          methodId,
                          command,
                          action,
                          'accept',
                          csrfToken,
                          result,
                        ),
                      )
                    }
                  >
                    {t('accept')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || Date.parse(action.expires_at) <= Date.now()}
                    onClick={() =>
                      void perform(() =>
                        decideFormalExecution(
                          methodId,
                          command,
                          action,
                          'decline',
                          csrfToken,
                          result,
                        ),
                      )
                    }
                  >
                    {t('decline')}
                  </Button>
                </div>
              ))}
            </>
          ) : (
            <p>{t('loading')}</p>
          )}
        </div>
      ) : null}
      {error || run.isError ? (
        <p role="alert">
          {error === 'suite_invalid'
            ? t('invalid')
            : t('failed', { code: error ?? problem(run.error) })}
        </p>
      ) : null}
    </section>
  )
}
