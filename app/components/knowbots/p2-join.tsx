'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { FormalDefinition } from '@/contracts/formal-methods'
import { matchingToolOutputs } from '@/lib/knowbots/formal-methods'
import { prependTool } from '@/lib/knowbots/formal-orchestration'
import { same } from '@/lib/knowbots/workdraft'
import { FormalOrchestrationSummary } from './formal-orchestration-summary'
import { PlanChanges } from './plan-changes'
import {
  ToolInstallationChoice,
  useToolVersion,
  verifyToolInstallation,
} from './tool-version-choice'

type Props = {
  draft: FormalDefinition
  methodId: string
  requestId: string
  csrfToken: string
  revision: number
  onAdopt: (value: FormalDefinition) => void
}
type Graph = Extract<FormalDefinition['procedure'], { kind: 'orchestration' }>
type Step = Graph['steps'][number]
type Branch = { plan: FormalDefinition; recheck: () => Promise<void> }

function callerPorts(step: Step) {
  return Object.keys(step.inputs).filter((name) => step.inputs[name].binding.source === 'caller')
}

export function P2Join(props: Props) {
  const t = useTranslations('formalMethod')
  const [target, setTarget] = useState('')
  const graph = props.draft.procedure
  if (graph.kind !== 'orchestration') return null
  const targets = graph.steps.filter(
    (s) => s.always_required && s.candidates.length === 1 && callerPorts(s).length >= 2,
  )
  if (!targets.length) return null
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend>{t('p2Join')}</legend>
      <label>
        {t('p2Target')}{' '}
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{t('p1ChooseTarget')}</option>
          {targets.map((s) => (
            <option key={s.id}>{s.id}</option>
          ))}
        </select>
      </label>
      {target && <JoinPreview key={target} {...props} target={target} />}
    </fieldset>
  )
}

export function P3Review(props: Props) {
  const t = useTranslations('formalMethod')
  const graph = props.draft.procedure
  if (graph.kind !== 'orchestration' || graph.steps.length !== 1 || graph.collaboration) return null
  const [reviewer] = graph.steps
  const eligible =
    reviewer.always_required &&
    reviewer.candidates.length === 1 &&
    reviewer.depends_on.length === 0 &&
    Object.keys(reviewer.inputs).length === 2 &&
    callerPorts(reviewer).length === 2
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend>{t('p3Review')}</legend>
      {eligible ? <JoinPreview {...props} target={reviewer.id} review /> : <p>{t('p3Start')}</p>}
    </fieldset>
  )
}

function JoinPreview({
  target,
  review = false,
  ...props
}: Props & { target: string; review?: boolean }) {
  const t = useTranslations('formalMethod')
  const [branches, setBranches] = useState<Branch[]>([])
  const [input, setInput] = useState('')
  const draft = branches.at(-1)?.plan ?? props.draft
  const step =
    draft.procedure.kind === 'orchestration' && draft.procedure.steps.find((s) => s.id === target)
  const confirm = useMutation({
    mutationKey: ['adopt-tool', props.requestId],
    mutationFn: () => Promise.all(branches.map((branch) => branch.recheck())),
  })
  if (!step) return null
  const ports = callerPorts(step)
  let preview = draft
  if (review && !ports.length && draft.procedure.kind === 'orchestration') {
    const roles: NonNullable<Graph['collaboration']> = {}
    for (const id of step.depends_on) roles[id] = { isolation_group: id, handoff_from: [] }
    roles[target] = {
      isolation_group: target,
      handoff_from: step.depends_on,
      review_requirements: Object.fromEntries(
        step.depends_on.map((id) => [id, 'isolated_reviewer' as const]),
      ),
    }
    preview = { ...draft, procedure: { ...draft.procedure, collaboration: roles } }
  }
  return (
    <>
      <p>{review ? t('p3Help', { reviewer: target }) : t('p2Help')}</p>
      {ports.length > 0 && (
        <label>
          {t('p2Input')}{' '}
          <select value={input} onChange={(e) => setInput(e.target.value)}>
            <option value="">{t('chooseInput')}</option>
            {ports.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      {ports.includes(input) && (
        <BranchChoice
          key={input}
          {...props}
          draft={draft}
          requireGuaranteedOutput={review}
          step={step}
          input={input}
          onAdd={(branch) => {
            setBranches([...branches, branch])
            setInput('')
            confirm.reset()
          }}
        />
      )}
      {branches.length > 0 && (
        <>
          <p>{t('p1PreviewRevision', { revision: props.revision })}</p>
          <PlanChanges before={props.draft} after={preview} />
          <FormalOrchestrationSummary definition={preview} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setBranches(branches.slice(0, -1))
              setInput('')
              confirm.reset()
            }}
          >
            {t('p2Undo')}
          </Button>
          <Button
            type="button"
            disabled={branches.length < 2 || confirm.isPending}
            onClick={() => confirm.mutate(undefined, { onSuccess: () => props.onAdopt(preview) })}
          >
            {t(review ? 'p3Adopt' : 'p2Adopt')}
          </Button>
          {confirm.isError && <p role="alert">{t('p2Stale')}</p>}
        </>
      )}
    </>
  )
}

function BranchChoice({
  draft,
  methodId,
  requestId,
  csrfToken,
  step,
  requireGuaranteedOutput,
  input,
  onAdd,
}: Props & {
  step: Step
  requireGuaranteedOutput: boolean
  input: string
  onAdd: (branch: Branch) => void
}) {
  const t = useTranslations('formalMethod')
  const [pages, setPages] = useState<(number | string | null)[]>([0])
  const [choice, setChoice] = useState('')
  const page = pages[pages.length - 1]
  const shared = typeof page !== 'number'
  const requiredSlot = step.inputs[input].slot
  const slot = requireGuaranteedOutput ? { ...requiredSlot, required: true } : requiredSlot
  const lookup = () => matchingToolOutputs(requestId, methodId, slot, page, csrfToken)
  const matches = useQuery({
    queryKey: ['p1-output-matches', requestId, methodId, slot, page],
    retry: false,
    queryFn: lookup,
  })
  const items = matches.data?.items ?? []
  const key = (r: (typeof items)[number]) =>
    [r.reference.method_id, r.reference.version, r.reference.digest, r.output].join(':')
  const selected = items.find((r) => key(r) === choice)
  const { version, binding, item, proposed } = useToolVersion(
    requestId,
    selected?.reference,
    shared,
    csrfToken,
  )
  const provider = proposed?.procedure
  const outputAvailable =
    !requireGuaranteedOutput ||
    (selected &&
      provider?.kind === 'orchestration' &&
      provider.steps[0]?.outputs[selected.output]?.required)
  const plan =
    selected &&
    proposed &&
    outputAvailable &&
    prependTool(draft, step.id, input, proposed, selected.output, 'branch')
  const publicInputs = new Set(
    plan && plan.procedure.kind === 'orchestration'
      ? plan.procedure.steps.flatMap((s) =>
          Object.values(s.inputs).flatMap((i) =>
            i.binding.source === 'caller' ? [i.binding.name] : [],
          ),
        )
      : [],
  )
  const missingCondition =
    plan &&
    Object.values(plan.capability_declaration.conditions ?? {})
      .flatMap((condition) => condition.input_slots)
      .find((name) => !publicInputs.has(name))
  const next = matches.data?.next
  function move(values: typeof pages) {
    setPages(values)
    setChoice('')
  }
  return (
    <>
      <label>
        {t('toolDirectory')}{' '}
        <select
          value={shared ? 'shared' : 'owned'}
          onChange={(e) => move([e.target.value === 'shared' ? null : 0])}
        >
          <option value="owned">{t('ownTools')}</option>
          <option value="shared">{t('sharedTools')}</option>
        </select>
      </label>
      {matches.isError && <p role="alert">{t('p1SearchError')}</p>}
      {matches.isSuccess && (
        <>
          <label>
            {t('p1Provider')}{' '}
            <select value={selected ? choice : ''} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{t('chooseRegisteredTool')}</option>
              {items.map((r) => (
                <option key={key(r)} value={key(r)}>
                  {r.title} · v{r.reference.version} · {r.output}
                </option>
              ))}
            </select>
          </label>
          {!items.length && <p>{t('noToolsOnPage')}</p>}
          {next != null &&
            (pages.includes(next) ? (
              <p>{t('p1CursorStopped')}</p>
            ) : (
              <Button type="button" onClick={() => move([...pages, next])}>
                {t('next')}
              </Button>
            ))}
        </>
      )}
      {pages.length > 1 && (
        <Button type="button" onClick={() => move(pages.slice(0, -1))}>
          {t('previous')}
        </Button>
      )}
      <ToolInstallationChoice
        item={item}
        pending={binding.isPending || version.isFetching}
        failed={binding.isError}
        onChoose={(id) => binding.mutate(id)}
      />
      {missingCondition && <p role="alert">{t('p2Condition', { slot: missingCondition })}</p>}
      {(version.isError || (proposed && !plan)) && <p role="alert">{t('versionUnavailable')}</p>}
      <Button
        type="button"
        disabled={!plan || !!missingCondition || matches.isFetching || binding.isPending}
        onClick={() => {
          if (!plan || !selected || missingCondition) return
          onAdd({
            plan,
            recheck: async () => {
              if (
                !(await lookup()).items.some(
                  (r) => r.output === selected.output && same(r.reference, selected.reference),
                )
              )
                throw Error('candidate_changed')
              if (item) await verifyToolInstallation(requestId, item)
            },
          })
        }}
      >
        {t('p2Add')}
      </Button>
    </>
  )
}
