'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { formalDefinitionSchema, type FormalDefinition } from '@/contracts/formal-methods'
import { combinedRequirements, replaceP1Tool } from '@/lib/knowbots/formal-orchestration'
import { matchingToolOutputs, scanToolOutputs } from '@/lib/knowbots/formal-methods'
import { AdoptTool, ToolInstallationChoice, useToolVersion } from './tool-version-choice'
import { same } from '@/lib/knowbots/workdraft'
import { FormalOrchestrationSummary } from './formal-orchestration-summary'

function prepend(
  draft: FormalDefinition,
  input: string,
  upstream: FormalDefinition,
  output: string,
) {
  const graph = draft.procedure,
    source = upstream.procedure
  if (graph.kind !== 'orchestration' || graph.steps.length !== 1 || source.kind !== 'orchestration')
    return null
  const target = graph.steps[0],
    gap = target.inputs[input]?.slot
  const provider = source.steps[0],
    provided = provider.outputs[output]
  if (
    !provided ||
    !gap ||
    !same(provided.schema, gap.schema) ||
    !same(provided.meaning, gap.meaning) ||
    (gap.required && !provided.required)
  )
    return null
  const id = target.id === 'prepare' ? 'prepare_1' : 'prepare'
  const inputs = structuredClone(provider.inputs)
  const aliases = new Map(
    Object.entries(target.inputs)
      .filter(([name, value]) => name !== input && value.binding.source === 'caller')
      .flatMap(([, value]) =>
        value.binding.source === 'caller' ? [[value.binding.name, value.slot] as const] : [],
      ),
  )
  for (const entry of Object.values(inputs)) {
    if (entry.binding.source !== 'caller') return null
    let key = entry.binding.name,
      n = 0
    while (aliases.has(key) && !same(aliases.get(key), entry.slot)) key = 'prepare_input_' + ++n
    entry.binding.name = key
    aliases.set(key, entry.slot)
  }
  const result = formalDefinitionSchema.safeParse({
    ...draft,
    ...combinedRequirements(draft, upstream),
    procedure: {
      ...graph,
      max_steps: Math.max(graph.max_steps, 2),
      max_expansions: Math.max(graph.max_expansions, 3),
      steps: [
        { ...provider, id, inputs },
        {
          ...target,
          depends_on: [id],
          inputs: {
            ...target.inputs,
            [input]: { slot: gap, binding: { source: 'step', step: id, output } },
          },
        },
      ],
    },
  })
  return result.success ? result.data : null
}

export function P1Predecessor({
  draft,
  requestId,
  methodId,
  csrfToken,
  onAdopt,
}: {
  draft: FormalDefinition
  requestId: string
  methodId: string
  csrfToken: string
  onAdopt: (value: FormalDefinition) => void
}) {
  const t = useTranslations('formalMethod')
  const [input, setInput] = useState('')
  const [shared, setShared] = useState(false)
  const [pages, setPages] = useState<(number | string | null)[]>([0])
  const page = pages[pages.length - 1]
  const [delivery, setDelivery] = useState('')
  const [automatic, setAutomatic] = useState(false)
  const [limit, setLimit] = useState('6')
  const [scan, setScan] = useState<{ id: string; scope: string; limit: number } | null>(null)
  const [choice, setChoice] = useState('')
  const [aliases, setAliases] = useState<Record<string, string>>({})
  function selectChoice(next: string) {
    setChoice(next)
    setAliases({})
  }
  const graph = draft.procedure
  const step = graph.kind === 'orchestration' && graph.steps.length === 1 ? graph.steps[0] : null
  const gap = step?.inputs[input]?.slot
  const exported = graph.kind === 'orchestration' ? graph.exports[delivery] : null
  const slot = delivery ? exported && step?.outputs[exported.output] : gap
  function changeSearch(nextDelivery: string) {
    setScan(null)
    setDelivery(nextDelivery)
    setPages([shared ? null : 0])
    selectChoice('')
  }
  const manual = useQuery({
    queryKey: ['p1-output-matches', requestId, methodId, slot, page],
    enabled: !!slot && !automatic,
    retry: false,
    queryFn: () => matchingToolOutputs(requestId, methodId, slot, page, csrfToken),
  })
  const excluded = delivery ? (step?.candidates ?? []) : []
  const scope = JSON.stringify([requestId, methodId, shared, slot, input, delivery, excluded])
  const active = automatic && scan?.scope === scope ? scan : null
  const search = useQuery({
    queryKey: ['p1-author-scan', active?.id],
    enabled: !!slot && !!active,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    queryFn: ({ signal }) => {
      if (!active) throw new Error('missing_search')
      return scanToolOutputs(
        requestId,
        methodId,
        slot,
        shared,
        active.limit,
        excluded,
        csrfToken,
        signal,
      )
    },
  })
  const matches = automatic ? search : manual
  const key = (r: NonNullable<typeof matches.data>['items'][number]) =>
    [r.reference.method_id, r.reference.version, r.reference.digest, r.output].join(':')
  const candidates = matches.data?.items.filter(
    (r) => !delivery || !step?.candidates.some((ref) => same(ref, r.reference)),
  )
  const selected = candidates?.find((r) => key(r) === choice)
  const { version, binding, item, proposed } = useToolVersion(
    requestId,
    selected?.reference,
    shared,
    csrfToken,
  )
  const nextPage = matches.data?.next
  const stalled = nextPage != null && pages.includes(nextPage)
  if (!step || !Object.keys(step.inputs).length) return null
  const replacement =
    selected && proposed && delivery
      ? replaceP1Tool(draft, input, delivery, proposed, selected.output, aliases)
      : null
  const bridge =
    !delivery && selected && proposed ? prepend(draft, input, proposed, selected.output) : null
  const preview = replacement && 'plan' in replacement ? replacement.plan : bridge
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend>{t('p1Find')}</legend>
      <label>
        <input
          type="checkbox"
          checked={automatic}
          onChange={(e) => {
            setAutomatic(e.target.checked)
            setScan(null)
            selectChoice('')
          }}
        />{' '}
        {t('p1Automatic')}
      </label>
      {automatic && (
        <label>
          {t('p1PageBudget')}{' '}
          <input
            type="number"
            min="1"
            max="100"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
      )}
      <label>
        {t('toolDirectory')}{' '}
        <select
          value={shared ? 'shared' : 'owned'}
          onChange={(event) => {
            const next = event.target.value === 'shared'
            setScan(null)
            setShared(next)
            setPages([next ? null : 0])
            selectChoice('')
          }}
        >
          <option value="owned">{t('ownTools')}</option>
          <option value="shared">{t('sharedTools')}</option>
        </select>
      </label>
      <label>
        {t('p1Input')}{' '}
        <select
          value={gap ? input : ''}
          onChange={(e) => {
            setInput(e.target.value)
            changeSearch('')
          }}
        >
          <option value="">{t('chooseInput')}</option>
          {Object.keys(step.inputs).map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      {gap && graph.kind === 'orchestration' && (automatic || delivery || matches.isSuccess) && (
        <label>
          {t('p1SearchBy')}{' '}
          <select value={delivery} onChange={(event) => changeSearch(event.target.value)}>
            <option value="">{t('p1BridgeMode')}</option>
            {Object.keys(graph.exports).map((name) => (
              <option key={name} value={name}>
                {t('p1ReplaceMode', { slot: name })}
              </option>
            ))}
          </select>
        </label>
      )}
      {slot && automatic && (
        <>
          <Button
            type="button"
            disabled={
              search.isFetching ||
              search.data?.reason === 'no_progress' ||
              (search.data?.reason === 'matches' && !search.data.has_more) ||
              (search.data &&
                ['matches', 'budget'].includes(search.data.reason) &&
                search.data.used >= Number(limit)) ||
              !Number.isInteger(Number(limit)) ||
              Number(limit) < 1 ||
              Number(limit) > 100
            }
            onClick={() => {
              selectChoice('')
              setScan({ id: crypto.randomUUID(), scope, limit: Number(limit) })
            }}
          >
            {t('p1Scan')}
          </Button>
          {search.isFetching && <p role="status">{t('p1Scanning')}</p>}
          {search.isError && <p role="alert">{t('p1SearchError')}</p>}
          {search.data && (
            <p role="status">
              {t('p1Used', {
                used: search.data.used,
                limit: search.data.limit,
                pages: search.data.pages_read,
              })}{' '}
              {t(`p1ScanStatus.${search.data.reason}`)}
            </p>
          )}
        </>
      )}
      {slot && matches.isSuccess && (!automatic || !!candidates?.length) && (
        <>
          <label>
            {t('p1Provider')}{' '}
            <select value={selected ? choice : ''} onChange={(e) => selectChoice(e.target.value)}>
              <option value="">{t('chooseRegisteredTool')}</option>
              {candidates?.map((r) => (
                <option key={key(r)} value={key(r)}>
                  {r.title} · v{r.reference.version} · {r.output}
                </option>
              ))}
            </select>
          </label>
          {!automatic && !candidates?.length && (
            <p>{t(delivery && matches.data.next === null ? 'p1NoReplacement' : 'noToolsOnPage')}</p>
          )}
          {!automatic && pages.length > 1 && (
            <Button
              type="button"
              onClick={() => {
                setPages(pages.slice(0, -1))
                selectChoice('')
              }}
            >
              {t('previous')}
            </Button>
          )}
          {stalled && <p role="status">{t('p1CursorStopped')}</p>}
          {nextPage != null && !stalled && (
            <Button
              type="button"
              onClick={() => {
                setPages([...pages, nextPage])
                selectChoice('')
              }}
            >
              {t('next')}
            </Button>
          )}
        </>
      )}
      {gap && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setInput('')
            changeSearch('')
          }}
        >
          {t('p1Stop')}
        </Button>
      )}
      <ToolInstallationChoice
        item={item}
        pending={binding.isPending || version.isFetching}
        failed={binding.isError}
        onChoose={(id) => binding.mutate(id)}
      />
      {proposed?.procedure.kind === 'orchestration' &&
        delivery &&
        Object.entries(proposed.procedure.steps[0].inputs)
          .filter(
            ([name]) =>
              Object.hasOwn(aliases, name) ||
              (replacement &&
                'issue' in replacement &&
                replacement.issue === 'p1NeedsCaller' &&
                replacement.slot === name),
          )
          .map(([name, { slot }]) => (
            <label key={name} className="block">
              {t('p1ReplacementAlias', { slot: name })}
              <input
                value={aliases[name] ?? ''}
                onChange={(event) => setAliases({ ...aliases, [name]: event.target.value })}
              />
              <span className="block">
                {slot.description} · {JSON.stringify(slot.meaning)} · {JSON.stringify(slot.schema)}
              </span>
            </label>
          ))}
      {replacement && 'issue' in replacement && (
        <p role="alert">{t(replacement.issue, { slot: replacement.slot })}</p>
      )}
      {slot &&
        ((!automatic && manual.isError) ||
          version.isError ||
          (selected && proposed && !preview && !replacement)) && (
          <p role="alert">{t('versionUnavailable')}</p>
        )}
      {preview && selected && (
        <>
          <p>
            {selected.title} · {selected.reference.digest} · {selected.output} →{' '}
            {delivery || step.id + '.' + input}
          </p>
          {delivery && proposed && (
            <>
              <p>{t('p1ReplacePreview', { slot: input })}</p>
              <details>
                <summary>{t('p1CandidateScope')}</summary>
                <p>{proposed.capability_declaration.purpose}</p>
                <p>
                  {t('applies')} · {proposed.capability_declaration.applies_when.join(' · ')}
                </p>
                <p>
                  {t('excludes')} ·{' '}
                  {proposed.capability_declaration.excludes.join(' · ') || t('none')}
                </p>
                <p>
                  {t('validationRules')} ·{' '}
                  {proposed.how_to_validate.map((r) => r.check).join(' · ')}
                </p>
              </details>
            </>
          )}
          {delivery && (
            <p>
              {draft.capability_declaration.purpose} ·{' '}
              {draft.how_to_validate.map((rule) => rule.check).join(' · ')}
            </p>
          )}
          <FormalOrchestrationSummary definition={preview} />
          <details>
            <summary>{t('permissions')}</summary>
            <pre>
              {JSON.stringify(
                { access: preview.access_requirements, approval: preview.what_requires_approval },
                null,
                2,
              )}
            </pre>
          </details>
          <AdoptTool
            key={JSON.stringify([
              requestId,
              choice,
              delivery,
              aliases,
              input,
              draft,
              item?.selected,
              item?.installations,
            ])}
            requestId={requestId}
            item={item}
            disabled={
              matches.isFetching || matches.isError || binding.isPending || version.isFetching
            }
            label={t(delivery ? 'p1AdoptReplacement' : 'p1Adopt')}
            onAdopt={() => {
              onAdopt(preview)
              setInput('')
              changeSearch('')
            }}
            onUnavailable={() => {
              void version.refetch()
              if (automatic) setScan(null)
              else void manual.refetch()
            }}
          />
        </>
      )}
    </fieldset>
  )
}
