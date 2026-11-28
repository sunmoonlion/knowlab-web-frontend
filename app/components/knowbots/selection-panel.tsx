'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import {
  ACTIVE_ROUNDS,
  type Round,
  type MethodTemplate,
  type RoundStart,
} from '@/contracts/workdraft'
import { ApiClientError } from '@/lib/common/api-client'
import {
  fetchRounds,
  fetchRound,
  refreshRound,
  startRound,
  cancelRound,
  confirmSelection,
} from '@/lib/knowbots/client'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { DraftMethodDirectory, type DirectoryPick } from './method-directory'
import { RoundPanel } from './workdraft-ai'

type Props = {
  requestId: string
  revision: number
  binding: MethodTemplate
  methodId: string
  csrfToken: string
  onConfirmed: () => Promise<void>
}
export function SelectionPanel(props: Props) {
  const { requestId: rid, revision, csrfToken } = props
  const t = useTranslations('selection'),
    w = useTranslations('workdraft.ai'),
    cache = useQueryClient()
  const [focus, setFocus] = useState('')
  const [approach, setApproach] = useState('revise')
  const [picked, setPicked] = useState<DirectoryPick | null>(null)
  const method = approach !== 'revise' && approach !== 'split' ? approach : ''
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const key = ['selection-rounds', rid]
  const rounds = useQuery({ queryKey: key, queryFn: () => fetchRounds(rid), retry: false })
  const last = rounds.data?.filter((r) => r.selection_round).at(-1)
  const otherBusy = rounds.data?.some((r) => !r.selection_round && ACTIVE_ROUNDS.includes(r.status))
  const detailKey = ['selection-round', rid, last?.incubation_id]
  const detail = useQuery({
    queryKey: detailKey,
    enabled: !!last,
    queryFn: async () => {
      if (!last) throw Error('no_round')
      const current = cache.getQueryData<Round>(detailKey) ?? last
      return ACTIVE_ROUNDS.includes(current.status)
        ? refreshRound(rid, last.incubation_id, csrfToken)
        : fetchRound(rid, last.incubation_id)
    },
    refetchInterval: (q) =>
      q.state.data && ACTIVE_ROUNDS.includes(q.state.data.status) ? 3000 : false,
    retry: false,
  })
  const current = detail.data ?? last
  const active = current && ACTIVE_ROUNDS.includes(current.status)
  const act = async (action: () => Promise<void>) => {
    setError('')
    setBusy(true)
    try {
      await action()
    } catch (e) {
      setError(e instanceof ApiClientError ? e.problem.code : 'network')
    } finally {
      setBusy(false)
    }
  }
  const begin = (body: RoundStart) =>
    void act(async () => {
      const started = await startRound(
        rid,
        {
          ...body,
          ...(focus
            ? {
                node_edit: {
                  node: focus,
                  mode: method
                    ? ('method' as const)
                    : approach === 'split'
                      ? ('split' as const)
                      : ('revise' as const),
                  ...(method
                    ? {
                        method:
                          approach === 'directory'
                            ? picked?.reference
                            : current?.method_pins?.[method],
                      }
                    : {}),
                },
              }
            : {}),
          selection_revision: revision,
        },
        csrfToken,
      )
      cache.setQueryData<Round[]>(key, (old) => [
        ...(old ?? []).filter((r) => r.incubation_id !== started.incubation_id),
        started,
      ])
      setOpen(false)
      setFocus('')
      setApproach('revise')
    })
  return (
    <section className="space-y-3 rounded border p-4">
      <h2 className="font-medium">{t('title')}</h2>
      <p>{t('intro')}</p>
      <DraftMethodDirectory
        requestId={rid}
        revision={revision}
        onPick={
          focus && !active
            ? (row) => {
                setPicked(row)
                setApproach('directory')
                setOpen(false)
              }
            : undefined
        }
      />
      {current && (
        <p role="status">
          {w('round', { n: current.round })} · {w('status.' + current.status)}
          {current.spent && ' · ¥' + current.spent}
        </p>
      )}
      {current?.error && <p role="alert">{current.error}</p>}
      {rounds.isError || detail.isError ? (
        <Button
          variant="outline"
          onClick={() => {
            void rounds.refetch()
            void detail.refetch()
          }}
        >
          {t('retry')}
        </Button>
      ) : null}
      {active ? (
        <Button
          disabled={busy}
          variant="outline"
          onClick={() =>
            void act(async () => {
              const done = await cancelRound(rid, current.incubation_id, csrfToken)
              cache.setQueryData(detailKey, done)
            })
          }
        >
          {t('cancel')}
        </Button>
      ) : null}
      {current?.selection_issue && (
        <p role="alert">
          {t.has('errors.' + current.selection_issue)
            ? t('errors.' + current.selection_issue)
            : t('error', { code: current.selection_issue })}
        </p>
      )}
      {current?.selection?.tree && (
        <section className="space-y-2">
          <h3>{t('treeTitle')}</h3>
          <ul>
            {current.selection.tree.nodes.map((n) => (
              <li key={n.id} style={{ marginInlineStart: (n.id.split('_').length - 1) * 16 }}>
                <strong>{n.goal}</strong> · {t('nodeState.' + n.status)}
                {n.operator && ' · ' + t('operator.' + n.operator)}
                {n.reason && <p>{n.reason}</p>}
                {(n.status === 'gap' || n.status === 'split') && (
                  <Link
                    href={{
                      pathname: '/studio',
                      query: {
                        title: n.goal,
                        purpose: n.reason || n.goal,
                        method_kind: n.status === 'split' ? 'expert' : 'tool',
                      },
                    }}
                  >
                    {t(n.status === 'split' ? 'newExpert' : 'newTool')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {!active && (
            <label>
              {t('focus')}{' '}
              <select
                value={focus}
                onChange={(e) => {
                  setPicked(null)
                  setFocus(e.target.value)
                  setApproach('revise')
                  setOpen(false)
                }}
              >
                <option value="">{t('whole')}</option>
                {current.selection.tree.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.goal}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!active && focus && (
            <label>
              {t('editGoal')}{' '}
              <select
                value={approach}
                onChange={(e) => {
                  setApproach(e.target.value)
                  setOpen(false)
                }}
              >
                {picked && (
                  <option value="directory">
                    {picked.title} · v{picked.reference.version}
                  </option>
                )}
                <option value="revise">{t('editScope')}</option>
                <option value="split">{t('splitGoal')}</option>
                {Object.keys(current.method_pins ?? {}).map((alias) => (
                  <option key={alias} value={alias}>
                    {t('chooseMethod', {
                      title: current.method_titles?.[alias] ?? alias,
                      version: current.method_pins![alias]!.version,
                    })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
      )}
      {current?.selection && !current.selection_issue && (
        <Review key={current.incubation_id} {...props} round={current} busy={busy} act={act} />
      )}
      {!active && !open && (
        <Button disabled={busy || !!otherBusy} onClick={() => setOpen(true)}>
          {current?.selection ? t('revise') : t('start')}
        </Button>
      )}
      {open && (
        <RoundPanel
          requestId={rid}
          initialInstruction={
            focus && method
              ? t('chooseMethod', {
                  title:
                    approach === 'directory' && picked
                      ? picked.title
                      : (current?.method_titles?.[method] ?? method),
                  version:
                    approach === 'directory' && picked
                      ? picked.reference.version
                      : (current?.method_pins?.[method]?.version ?? 1),
                })
              : focus && approach === 'split'
                ? t('splitGoal')
                : ''
          }
          action={current?.selection ? 'revise' : 'draft'}
          busy={busy}
          error={null}
          onStart={begin}
          onClose={() => setOpen(false)}
        />
      )}
      {error && (
        <p role="alert">
          {t.has('errors.' + error) ? t('errors.' + error) : t('error', { code: error })}
        </p>
      )}
    </section>
  )
}

function Review({
  requestId,
  revision,
  binding,
  methodId,
  csrfToken,
  onConfirmed,
  round,
  busy,
  act,
}: Props & { round: Round; busy: boolean; act: (run: () => Promise<void>) => Promise<void> }) {
  const t = useTranslations('selection'),
    proposal = round.selection!
  const [routing, setRouting] = useState(''),
    [cases, setCases] = useState<Record<string, string[]>>({}),
    [checked, setChecked] = useState(false)
  const [edits, setEdits] = useState(() =>
    Object.fromEntries(proposal.steps.map((s) => [s.id, s.task])),
  )
  const titles = round.method_titles ?? {}
  const branches = proposal.steps.filter((step) => Object.keys(step.cases).length)
  const expected = Object.fromEntries(
    branches.map((step) => [step.id, [...(cases[step.id] ?? [])].sort()]),
  )
  const matches =
    routing === 'yes'
      ? branches.length > 0 &&
        branches.every(
          (step) =>
            JSON.stringify(Object.keys(step.cases).sort()) === JSON.stringify(expected[step.id]),
        )
      : routing === 'no' && branches.length === 0
  const stale = revision !== round.workdraft_revision
  return (
    <div className="space-y-3">
      <p>
        <strong>{t(proposal.status)}</strong> {proposal.reason}
      </p>
      {round.catalog_partial && <p>{t('partial')}</p>}
      {stale && <p role="status">{t('stale')}</p>}
      {proposal.status === 'ready' && (
        <>
          <ol className="space-y-2">
            {proposal.steps.map((s, i) => (
              <li key={s.id}>
                <label className="block">
                  {t('step', { n: i + 1 })}
                  <textarea
                    maxLength={1500}
                    className="block w-full rounded border p-2"
                    value={edits[s.id]}
                    onChange={(e) => {
                      setEdits({ ...edits, [s.id]: e.target.value })
                      setChecked(false)
                    }}
                  />
                </label>
                <p>{t('method', { name: titles[s.method] ?? s.method })}</p>
                {round.method_purposes?.[s.method] && <p>{round.method_purposes[s.method]}</p>}
                {Object.entries(s.inputs).map(([n, v]) => (
                  <p key={n}>
                    {n} ← {v.step ? (edits[v.step] ?? v.step) + ' / ' + v.output : (v.name ?? n)}
                  </p>
                ))}
                {Object.entries(s.deliver_as ?? {}).map(([output, name]) => (
                  <p key={`delivery-${name}`}>{t('deliverOutput', { output, name })}</p>
                ))}
                {s.reviews.length > 0 && (
                  <p>
                    {t('reviews', { steps: s.reviews.map((id) => edits[id] ?? id).join('、') })}
                  </p>
                )}
                {Object.entries(s.cases).map(([value, alias]) => (
                  <p key={value}>
                    {s.route_input} = {value} → {titles[alias] ?? alias}
                  </p>
                ))}
              </li>
            ))}
          </ol>
          {proposal.object_batch && <p>{t('batch', { n: proposal.object_batch.max_objects })}</p>}
          {round.routing_alternatives?.length ? (
            <p>{t('alternatives', { names: round.routing_alternatives.join('、') })}</p>
          ) : null}
          <label className="block">
            {t('routing')}
            <select
              className="block rounded border p-2"
              value={routing}
              onChange={(e) => {
                setRouting(e.target.value)
                setChecked(false)
              }}
            >
              <option value="">—</option>
              <option value="no">{t('no')}</option>
              <option value="yes">{t('yes')}</option>
            </select>
          </label>
          {routing === 'yes' &&
            branches.map((step) => (
              <fieldset key={step.id} className="space-y-2">
                <legend>
                  {edits[step.id]} · {t('cases')}
                </legend>
                {Object.keys(step.cases).map((label, index) => (
                  <label key={label} className="block">
                    {t('caseEntry', { n: index + 1 })}
                    <textarea
                      className="block w-full rounded border p-2"
                      value={cases[step.id]?.[index] ?? ''}
                      onChange={(e) => {
                        const next = [...(cases[step.id] ?? [])]
                        next[index] = e.target.value
                        setCases({ ...cases, [step.id]: next })
                        setChecked(false)
                      }}
                    />
                  </label>
                ))}
              </fieldset>
            ))}
          {routing && !matches && <p role="status">{t('mismatch')}</p>}
          <label className="block">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />{' '}
            {t('checked')}
          </label>
          <Button
            disabled={
              busy ||
              stale ||
              !matches ||
              !checked ||
              Object.values(edits).some((v) => !v.trim()) ||
              Object.values(binding).some((v) => !v.trim())
            }
            onClick={() =>
              void act(async () => {
                await confirmSelection(
                  requestId,
                  round.incubation_id,
                  {
                    method_id: methodId,
                    revision: revision,
                    confirmed: true,
                    confirm_brief: true,
                    cases: routing === 'yes' ? expected : {},
                    template: binding,
                    step_text: edits,
                  },
                  csrfToken,
                )
                const location = new URL(window.location.href)
                for (const old of ['method', 'run', 'revision', 'execution', 'version'])
                  location.searchParams.delete(old)
                window.history.replaceState(window.history.state, '', location)
                await onConfirmed()
              })
            }
          >
            {t('confirm')}
          </Button>
        </>
      )}
    </div>
  )
}
