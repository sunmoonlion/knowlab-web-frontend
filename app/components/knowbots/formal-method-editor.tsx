'use client'

import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  formalDefinitionSchema,
  formalDraftSchema,
  receiptCoversCallers,
  validatedCallers,
  type FormalDefinition,
  type FormalDraft,
  type FormalSource,
  type FormalValidation,
  type FormalVersion,
} from '@/contracts/formal-methods'
import type { Workdraft } from '@/contracts/workdraft'
import { Link } from '@/i18n/navigation'
import { ApiClientError } from '@/lib/common/api-client'
import { fetchWorkdraft, saveWorkdraftCells } from '@/lib/knowbots/client'
import {
  formalSources,
  submitSelfListing,
  listFormalMethods,
  getFormalVersion,
  formalValidation,
  freezeFormalMethod,
  validateFormalMethod,
  type ValidationCommand,
} from '@/lib/knowbots/formal-methods'
import { ExpertInputBinding } from './expert-input-binding'
import { ExpertFromTool } from './expert-from-tool'
import { same } from '@/lib/knowbots/workdraft'
import { KEY } from './shared'
import { FormalMethodExecution } from './formal-method-execution'
import { DeliveryPromises } from './delivery-promises'
import { ToolSlotEditor } from './tool-slot-editor'
import { P5Choice } from './p5-choice'
import { P4Comparison } from './p4-comparison'
import { P2Join } from './p2-join'
import { P1Predecessor } from './p1-predecessor'
import { ReviewRequirements } from './review-requirements'
import { FormalOrchestrationSummary } from './formal-orchestration-summary'
import type { FormalExecutionResult } from '@/contracts/formal-method-execution'

const input = 'mt-1 w-full rounded border bg-background p-2 text-sm'
type Resume = {
  method?: string
  run?: string
  revision?: string
  version?: string
  execution?: string
}
const id = (value?: string) => (z.uuid().safeParse(value).success ? value! : null)
const sourceKey = (source: FormalSource) => JSON.stringify(source)

export function FormalMethodEditor({
  requestId,
  csrfToken,
  resume = {},
}: {
  requestId: string
  csrfToken: string
  resume?: Resume
}) {
  const t = useTranslations('formalMethod')
  const loaded = useQuery({
    queryKey: [...KEY, 'workdraft', requestId],
    queryFn: () => fetchWorkdraft(requestId),
  })
  if (loaded.isError) return <p role="alert">{t('loadFailed')}</p>
  if (!loaded.data) return <p>{t('loading')}</p>
  const body = loaded.data.body
  if (
    !body.formal_method &&
    (body.steps.length || body.planning || body.method_refs || body.public_capabilities)
  )
    return (
      <div className="mt-5 space-y-3">
        <p role="status">{t('existingDraft')}</p>
        <Link className="underline" href={`/names/${requestId}/workdraft`}>
          {t('back')}
        </Link>
      </div>
    )
  return <FormalForm initial={loaded.data} csrfToken={csrfToken} resume={resume} />
}

function FormalForm({
  initial,
  csrfToken,
  resume,
}: {
  initial: Workdraft
  csrfToken: string
  resume: Resume
}) {
  const t = useTranslations('formalMethod')
  const client = useQueryClient()
  const [document, setDocument] = useState(initial)
  const [reviewedPlan, setReviewedPlan] = useState<FormalDefinition | null>(null)
  const [definition, setDefinition] = useState<FormalDefinition | null>(
    initial.body.formal_method?.definition ?? null,
  )
  const [source, setSource] = useState<FormalSource | null>(
    initial.body.formal_method?.source ?? null,
  )
  const [callers, setCallers] = useState<FormalDraft['allowed_callers']>(
    initial.body.formal_method?.allowed_callers ?? ['host'],
  )
  const [newMethodId] = useState(() => crypto.randomUUID())
  const [methodId, setMethodId] = useState(() => id(resume.method) ?? newMethodId)
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null)
  const [methodPage, setMethodPage] = useState(0)
  const methods = useQuery({
    queryKey: ['formal-methods', initial.request_id, methodPage],
    queryFn: () => listFormalMethods(methodPage * 30, initial.request_id),
    retry: false,
  })
  const [run, setRun] = useState<ValidationCommand | null>(() =>
    id(resume.method) && id(resume.run) && Number(resume.revision) === initial.revision
      ? { request_id: initial.request_id, revision: initial.revision, run_id: resume.run! }
      : null,
  )
  const [executionRun, setExecutionRun] = useState(resume.execution === '1')
  const [executionActive, setExecutionActive] = useState(!!run && resume.execution === '1')
  const [validation, setValidation] = useState<FormalValidation | null>(null)
  const [version, setVersion] = useState(() => {
    const value = Number(resume.version)
    return Number.isInteger(value) && value >= 1 && value <= 999999 ? value : 1
  })
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [frozen, setFrozen] = useState<FormalVersion | null>(null)
  const [inspected, setInspected] = useState<FormalVersion | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const sources = useQuery({
    queryKey: ['formal-method-sources', initial.request_id],
    queryFn: () => formalSources(initial.request_id),
    retry: false,
    enabled: definition?.procedure.kind === 'direct',
  })
  const draft = definition ? { definition, source, allowed_callers: callers } : null
  const [collaboration, setCollaboration] = useState(initial.body.collaboration ?? null)
  const reviewChanged = !same(collaboration, document.body.collaboration ?? null)
  const methodChanged = !same(draft, document.body.formal_method ?? null)
  const dirty = reviewChanged || methodChanged
  const adoption = { mutationKey: ['adopt-tool', initial.request_id] }
  const adopting = useIsMutating(adoption) > 0
  const ready =
    !adopting &&
    !!draft &&
    formalDraftSchema.safeParse(draft).success &&
    (definition?.procedure.kind !== 'direct' || !!source)
  const receipt = validation?.receipt
  const shownVersion = frozen ?? inspected
  const selectedMethod = methods.data?.find((method) => method.method_id === methodId)
  const runtimeGaps = document.runtime_gaps ?? []
  const instruction =
    source?.kind === 'skill_instruction' || source?.kind === 'registered_instruction'
  const privateTrial =
    instruction || source?.kind === 'registered_script' || source?.kind === 'service_function'
  const requiresTrial =
    privateTrial || Object.keys(definition?.capability_declaration.conditions ?? {}).length > 0
  const validated =
    !adopting &&
    runtimeGaps.length === 0 &&
    !dirty &&
    run?.revision === document.revision &&
    validation?.status === 'passed' &&
    !!receipt &&
    receipt.run_id === run.run_id &&
    receipt.request_id === initial.request_id &&
    receipt.method_id === methodId &&
    receipt.revision === document.revision &&
    (!requiresTrial || !!receipt.execution) &&
    receiptCoversCallers(receipt, callers)
  const publicReady =
    definition?.procedure.kind !== 'orchestration' &&
    !privateTrial &&
    !!receipt?.execution &&
    validated &&
    receipt.checks.includes('business') &&
    !receipt.uncovered.length
  const problem = (exc: unknown) =>
    exc instanceof ApiClientError ? exc.problem.code : 'contract_or_network_error'
  const changed = () => {
    setValidation(null)
    setFrozen(null)
    setNotice(null)
  }
  const editDefinition = (next: FormalDefinition) => {
    setDefinition(next)
    changed()
  }
  const rememberRun = useCallback(
    (command: ValidationCommand, execution?: boolean) => {
      const url = new URL(window.location.href)
      url.searchParams.set('method', methodId)
      url.searchParams.set('run', command.run_id)
      url.searchParams.set('revision', String(command.revision))
      url.searchParams.set('version', String(version))
      if (execution !== undefined) {
        if (execution) url.searchParams.set('execution', '1')
        else url.searchParams.delete('execution')
      }
      window.history.replaceState(null, '', url.pathname + url.search)
    },
    [methodId, version],
  )
  const executionStarted = useCallback(
    (command: ValidationCommand) => {
      setRun(command)
      setExecutionRun(true)
      setValidation(null)
      setFrozen(null)
      rememberRun(command, true)
    },
    [rememberRun],
  )
  const executionReceived = useCallback(
    (result: FormalExecutionResult) => {
      if (executionRun && result.run_id === run?.run_id) setValidation(result.admission)
    },
    [executionRun, run?.run_id],
  )
  const save = async () => {
    if (!draft || !ready || client.isMutating(adoption)) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await saveWorkdraftCells(
        initial.request_id,
        {
          revision: document.revision,
          ...(methodChanged && definition === reviewedPlan ? { adopt_plan: true } : {}),
          cells: [
            ...(methodChanged ? [{ path: 'formal_method', value: draft }] : []),
            ...(reviewChanged ? [{ path: 'collaboration', value: collaboration }] : []),
          ],
        },
        csrfToken,
      )
      if (!same(saved.body.formal_method, draft)) throw new Error('saved_definition_mismatch')
      if (!same(saved.body.collaboration ?? null, collaboration))
        throw new Error('saved_collaboration_mismatch')
      setDocument(saved)
      setReviewedPlan(null)
      setValidation(null)
      setRun(null)
      setFrozen(null)
      setNotice(t('saved'))
      setMethodPage(0)
      await Promise.all([
        client.invalidateQueries({ queryKey: [...KEY, 'workdraft', initial.request_id] }),
        client.invalidateQueries({ queryKey: ['formal-methods', initial.request_id] }),
      ])
    } catch (exc) {
      setError(problem(exc))
    } finally {
      setWorking(false)
    }
  }
  const validate = async (refresh: boolean) => {
    if (dirty || !ready || document.revision < 1) return
    const command =
      !executionRun && run?.revision === document.revision
        ? run
        : {
            request_id: initial.request_id,
            revision: document.revision,
            run_id: crypto.randomUUID(),
          }
    setRun(command)
    setValidation(null)
    setFrozen(null)
    rememberRun(command, false)
    setExecutionRun(false)
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      setValidation(
        await (refresh
          ? formalValidation(methodId, command)
          : validateFormalMethod(methodId, command, csrfToken)),
      )
    } catch (exc) {
      setError(problem(exc))
    } finally {
      setWorking(false)
    }
  }
  const freeze = async () => {
    if (!validated || !run || (visibility === 'public' && !publicReady)) return
    rememberRun(run)
    setWorking(true)
    setError(null)
    try {
      const result = await freezeFormalMethod(methodId, version, { ...run, visibility }, csrfToken)
      if (result.digest !== receipt.definition_digest || !same(result.definition, definition))
        throw new Error('frozen_definition_mismatch')
      setFrozen(result)
    } catch (exc) {
      setError(problem(exc))
    } finally {
      setWorking(false)
    }
  }
  return (
    <div className="mt-6 space-y-5">
      <Link className="text-sm underline" href={`/names/${initial.request_id}`}>
        {t('backToName')}
      </Link>
      <p className="text-sm">{t('draftNotice')}</p>
      {document.plan_adoption && (
        <p className="text-sm">
          {t('planLastAdoption', {
            base: document.plan_adoption.base_revision,
            saved: document.plan_adoption.saved_revision,
          })}
        </p>
      )}
      <fieldset
        disabled={working || executionActive || adopting}
        className="space-y-2 rounded border p-4 text-sm"
      >
        <legend className="px-1 font-medium">{t('methodTarget')}</legend>
        <label>
          {t('chooseMethod')}
          <select
            className={input}
            value={methodId}
            onChange={(e) => {
              setMethodId(e.target.value)
              setValidation(null)
              setRun(null)
              setFrozen(null)
              setInspected(null)
              setSelectedTitle(
                methods.data?.find((method) => method.method_id === e.target.value)?.title ?? null,
              )
              setVersion(
                (methods.data?.find((method) => method.method_id === e.target.value)
                  ?.latest_version ?? 0) + 1,
              )
            }}
          >
            <option value={newMethodId}>{t('newMethod')}</option>
            {methodId !== newMethodId &&
            !methods.data?.some((method) => method.method_id === methodId) ? (
              <option value={methodId}>{selectedTitle ?? t('resumedMethod')}</option>
            ) : null}
            {methods.data
              ?.filter((method) => method.method_id !== newMethodId)
              .map((method) => (
                <option key={method.method_id} value={method.method_id}>
                  {method.title} · {t(`kind.${method.method_kind}`)} · {method.latest_version}
                </option>
              ))}
          </select>
        </label>
        {methods.isError ? <p role="alert">{t('methodsFailed')}</p> : null}
        {selectedMethod ? (
          <Button
            variant="outline"
            onClick={async () => {
              setWorking(true)
              setError(null)
              try {
                setInspected(
                  await getFormalVersion(selectedMethod.method_id, selectedMethod.latest_version),
                )
              } catch (exc) {
                setError(problem(exc))
              } finally {
                setWorking(false)
              }
            }}
          >
            {t('viewFrozen')}
          </Button>
        ) : null}
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!methodPage || methods.isFetching}
            onClick={() => setMethodPage((page) => page - 1)}
          >
            {t('previous')}
          </Button>
          <Button
            variant="outline"
            disabled={methods.data?.length !== 30 || methods.isFetching}
            onClick={() => setMethodPage((page) => page + 1)}
          >
            {t('next')}
          </Button>
        </div>
      </fieldset>
      <fieldset
        disabled={working || executionActive || adopting}
        className="space-y-4 rounded border p-4"
      >
        <legend className="px-1 font-medium">{t('definition')}</legend>
        {!definition ? (
          <ExpertFromTool
            csrfToken={csrfToken}
            requestId={initial.request_id}
            targetMethodId={methodId}
            onAdopt={(next) => {
              editDefinition(next)
              setSource(null)
              setCallers(['host'])
              setVisibility('private')
              setRun(null)
              setExecutionRun(false)
              setInspected(null)
              setError(null)
            }}
          />
        ) : null}
        <ReviewRequirements
          definition={definition}
          collaboration={collaboration}
          onChange={(value) => {
            setCollaboration(value)
            changed()
          }}
        />
        <label className="block text-sm">
          {t('import')}
          <input
            className={input}
            type="file"
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              setError(null)
              try {
                if (file.size > 1_000_000) throw new Error('definition_size')
                const parsed = formalDefinitionSchema.parse(JSON.parse(await file.text()))
                if (parsed.procedure.kind === 'orchestration') {
                  const { collaboration: importedRoles, ...procedure } = parsed.procedure
                  if (importedRoles) setCollaboration(importedRoles)
                  editDefinition({ ...parsed, procedure })
                } else {
                  editDefinition(parsed)
                }
                setSource(null)
              } catch {
                setError('definition_invalid')
              }
            }}
          />
        </label>
        <p className="text-muted-foreground text-sm">{t('importHint')}</p>
        {definition ? (
          <>
            <label className="block text-sm">
              {t('methodTitle')}
              <input
                className={input}
                value={definition.capability_declaration.title}
                onChange={(e) =>
                  editDefinition({
                    ...definition,
                    capability_declaration: {
                      ...definition.capability_declaration,
                      title: e.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="block text-sm">
              {t('purpose')}
              <textarea
                className={input}
                value={definition.capability_declaration.purpose}
                onChange={(e) =>
                  editDefinition({
                    ...definition,
                    capability_declaration: {
                      ...definition.capability_declaration,
                      purpose: e.target.value,
                    },
                  })
                }
              />
            </label>
            <DeliveryPromises definition={definition} onChange={editDefinition} />
            <label className="block text-sm">
              {t('procedure')}
              <textarea
                className={input}
                rows={6}
                value={definition.procedure.instructions}
                onChange={(e) =>
                  editDefinition({
                    ...definition,
                    procedure: { ...definition.procedure, instructions: e.target.value },
                  })
                }
              />
            </label>
            <p className="text-sm">
              {t(definition.procedure.kind === 'direct' ? 'direct' : 'orchestration')}
            </p>
            {definition.procedure.kind === 'direct' ? (
              <>
                <ToolSlotEditor
                  tool={definition.procedure}
                  onChange={(procedure) => editDefinition({ ...definition, procedure })}
                />
                <label className="block text-sm">
                  {t('source')}
                  <select
                    className={input}
                    value={source ? sourceKey(source) : ''}
                    onChange={(e) => {
                      const selected =
                        sources.data?.find((item) => sourceKey(item) === e.target.value) ?? null
                      setSource(selected)
                      changed()
                      if (selected && definition.procedure.kind === 'direct') {
                        setDefinition({
                          ...definition,
                          procedure: {
                            ...definition.procedure,
                            max_model_turns: [
                              'registered_instruction',
                              'skill_instruction',
                            ].includes(selected.kind)
                              ? Math.max(1, definition.procedure.max_model_turns)
                              : 0,
                            implementation: {
                              kind: selected.kind,
                              source: selected.source,
                              version: selected.version,
                              digest: selected.digest,
                              entry: selected.entry,
                              requirement_ids: definition.procedure.implementation.requirement_ids,
                            },
                          },
                        })
                      }
                    }}
                  >
                    <option value="">{t('chooseSource')}</option>
                    {source && !sources.data?.some((item) => same(item, source)) ? (
                      <option value={sourceKey(source)}>
                        {t('pinnedSource', { source: source.source, version: source.version })}
                      </option>
                    ) : null}
                    {sources.data?.map((item) => (
                      <option key={sourceKey(item)} value={sourceKey(item)}>
                        {item.source} · {item.version} · {item.entry}
                      </option>
                    ))}
                  </select>
                </label>
                {sources.isError ? <p role="alert">{t('sourceFailed')}</p> : null}
                {sources.data?.length === 0 ? <p role="status">{t('noSources')}</p> : null}
                <p className="text-muted-foreground text-sm">{t('sourceHint')}</p>
                {source ? (
                  <p className="text-sm break-all">
                    {t('license')}:{' '}
                    {source.license_basis === 'pending'
                      ? t('licensePending')
                      : !sources.isError &&
                          !sources.isFetching &&
                          sources.data?.some((item) => same(item, source))
                        ? t('licenseVerified')
                        : t('licenseRecheck')}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <FormalOrchestrationSummary definition={definition} />
                {runtimeGaps.map((gap) => (
                  <p role="status" key={gap.step + gap.primitive}>
                    {t(gap.primitive, { step: gap.step })}
                  </p>
                ))}
                <P5Choice
                  draft={definition}
                  requestId={initial.request_id}
                  methodId={methodId}
                  csrfToken={csrfToken}
                  revision={document.revision}
                  key={JSON.stringify([
                    initial.request_id,
                    methodId,
                    document.revision,
                    definition,
                  ])}
                  onAdopt={(next) => {
                    setReviewedPlan(next)
                    editDefinition(next)
                  }}
                />
                {!definition.procedure.steps.some((s) => !!s.candidate_choice) && (
                  <P4Comparison
                    draft={definition}
                    requestId={initial.request_id}
                    methodId={methodId}
                    csrfToken={csrfToken}
                    key={JSON.stringify([document.revision, definition])}
                    onAdopt={(next) => {
                      setReviewedPlan(next)
                      editDefinition(next)
                    }}
                  />
                )}
                {!definition.procedure.object_batch &&
                  !definition.procedure.steps.some((s) => !!s.candidate_choice) && (
                    <>
                      <P1Predecessor
                        draft={definition}
                        methodId={methodId}
                        requestId={initial.request_id}
                        csrfToken={csrfToken}
                        revision={document.revision}
                        onAdopt={(next) => {
                          setReviewedPlan(next)
                          editDefinition(next)
                        }}
                      />
                      <P2Join
                        key={JSON.stringify([document.revision, methodId, definition])}
                        draft={definition}
                        methodId={methodId}
                        requestId={initial.request_id}
                        csrfToken={csrfToken}
                        revision={document.revision}
                        onAdopt={(next) => {
                          setReviewedPlan(next)
                          editDefinition(next)
                        }}
                      />
                      <ExpertInputBinding
                        graph={definition.procedure}
                        onChange={(procedure) => editDefinition({ ...definition, procedure })}
                      />
                    </>
                  )}
              </>
            )}
            <div className="space-y-2 text-sm">
              <h3 className="font-medium">{t('permissions')}</h3>
              {definition.access_requirements.length ? (
                definition.access_requirements.map((requirement) => (
                  <p key={requirement.requirement_id}>
                    {requirement.capability_ref} · {requirement.operations.join(', ')} ·{' '}
                    {requirement.data_transfer.purpose}
                  </p>
                ))
              ) : (
                <p>{t('none')}</p>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <h3 className="font-medium">{t('approvals')}</h3>
              {definition.what_requires_approval.length ? (
                definition.what_requires_approval.map((rule) => (
                  <p key={`${rule.requirement_id}:${rule.when}`}>
                    {rule.when} · {rule.operations.join(', ')}
                  </p>
                ))
              ) : (
                <p>{t('platformApprovals')}</p>
              )}
            </div>
            <fieldset className="space-x-4 text-sm">
              <legend>{t('callers')}</legend>
              <p className="text-muted-foreground text-sm">{t('callerQualificationHint')}</p>
              {(['host', 'model'] as const).map((caller) => (
                <label key={caller}>
                  <input
                    type="checkbox"
                    checked={callers.includes(caller)}
                    onChange={(e) => {
                      setCallers(
                        e.target.checked
                          ? [...callers, caller]
                          : callers.filter((c) => c !== caller),
                      )
                      changed()
                    }}
                  />{' '}
                  {t(caller)}
                </label>
              ))}
            </fieldset>
          </>
        ) : null}
        <Button type="button" disabled={!ready || !dirty} onClick={() => void save()}>
          {t('save')}
        </Button>
      </fieldset>
      <section className="space-y-3 rounded border p-4">
        <h2 className="font-medium">{t('validation')}</h2>
        <p className="text-muted-foreground text-sm">{t('validationHint')}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={
              working ||
              executionActive ||
              dirty ||
              !ready ||
              runtimeGaps.length > 0 ||
              document.revision < 1
            }
            onClick={() => void validate(false)}
          >
            {t('validate')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={working || executionActive || executionRun || dirty || !run}
            onClick={() => void validate(true)}
          >
            {t('refresh')}
          </Button>
        </div>
        {validation ? (
          <div className="space-y-2 text-sm" role="status">
            <p>{t(`status.${validation.status}`)}</p>
            {validation.details.map((detail, i) => (
              <p key={i}>{detail}</p>
            ))}
            {validation.missing_checks.length ? (
              <p>
                {t('missing')}:{' '}
                {validation.missing_checks.map((check) => t(`checks.${check}`)).join('、')}
              </p>
            ) : null}
            {receipt?.uncovered.map((gap, i) => (
              <p key={i}>
                {gap.scenario} · {gap.reason} · {gap.scope}
              </p>
            ))}
          </div>
        ) : null}
      </section>
      <FormalMethodExecution
        key={`${methodId}:${document.revision}`}
        methodId={methodId}
        requestId={initial.request_id}
        revision={document.revision}
        draft={draft}
        disabled={working || dirty || !ready || runtimeGaps.length > 0 || document.revision < 1}
        csrfToken={csrfToken}
        resume={executionRun ? run : null}
        onRun={executionStarted}
        onResult={executionReceived}
        onActiveChange={setExecutionActive}
      />
      <fieldset
        disabled={working || executionActive || !validated}
        className="space-y-3 rounded border p-4"
      >
        <legend className="px-1 font-medium">{t('freeze')}</legend>
        <p className="text-muted-foreground text-sm">{t('freezeHint')}</p>
        {definition?.procedure.kind === 'orchestration' ? <p>{t('orchestrationPrivate')}</p> : null}
        <label className="block text-sm">
          {t('version')}
          <input
            type="number"
            className={input}
            min={1}
            max={999999}
            value={version}
            onChange={(e) => {
              setVersion(Number(e.target.value))
              setFrozen(null)
            }}
          />
        </label>
        <label className="block text-sm">
          {t('visibility')}
          <select
            className={input}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'private' | 'public')}
          >
            <option value="private">{t('private')}</option>
            <option value="public" disabled={!publicReady}>
              {t('public')}
            </option>
          </select>
        </label>
        <Button
          type="button"
          disabled={
            !!frozen ||
            !Number.isInteger(version) ||
            version < 1 ||
            (visibility === 'public' && !publicReady)
          }
          onClick={() => void freeze()}
        >
          {t('confirmFreeze')}
        </Button>
      </fieldset>
      {shownVersion ? (
        <section className="space-y-2 rounded border p-4 text-sm">
          {frozen ? (
            <p role="status">{t('frozen', { version: frozen.version })}</p>
          ) : (
            <h2>{t('frozenVersion', { version: shownVersion.version })}</h2>
          )}
          <p>
            {shownVersion.definition.capability_declaration.title} ·{' '}
            {t(`kind.${shownVersion.provenance.method_kind}`)}
          </p>
          <SelfListing
            key={[shownVersion.method_id, shownVersion.version, shownVersion.digest].join(':')}
            version={shownVersion}
            csrfToken={csrfToken}
          />
          <FormalOrchestrationSummary definition={shownVersion.definition} />
          <p>
            {t('verifiedCallers')}:{' '}
            {shownVersion.provenance.validation
              ? validatedCallers(shownVersion.provenance.validation)
                  .map((caller) => t(caller))
                  .join(' · ')
              : t('qualificationUnknown')}
          </p>
          <h3 className="font-medium">{t('generatedInterfaces')}</h3>
          <p className="text-muted-foreground">{t('generatedHint')}</p>
          <h4>{t('inputs')}</h4>
          {Object.entries(shownVersion.provenance.interfaces.inputs).map(([name, entry]) => (
            <p key={name}>
              {name} · {entry.slot.description} ·{' '}
              {t(entry.required_by.length ? 'required' : 'conditional')}
            </p>
          ))}
          <h4>{t('outputs')}</h4>
          {Object.entries(shownVersion.provenance.interfaces.outputs).map(([name, entry]) => (
            <p key={name}>
              {name} · {entry.slot.description} ·{' '}
              {t(entry.always_present ? 'required' : 'conditional')}
            </p>
          ))}
          <details>
            <summary>{t('versionReference')}</summary>
            <p className="break-all">
              {shownVersion.method_id} · {shownVersion.version} · {shownVersion.digest}
            </p>
          </details>
        </section>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {t.has(`errors.${error}`) ? t(`errors.${error}`) : t('requestFailed', { code: error })}
        </p>
      ) : null}
    </div>
  )
}

function SelfListing({ version, csrfToken }: { version: FormalVersion; csrfToken: string }) {
  const t = useTranslations('formalMethod')
  const [status, setStatus] = useState<
    Awaited<ReturnType<typeof submitSelfListing>> | 'error' | null
  >(null)
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    try {
      const { method_id, digest, version: number } = version
      setStatus(await submitSelfListing({ method_id, version: number, digest }, csrfToken))
    } catch {
      setStatus('error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <p>{t('selfListingHint')}</p>
      <Button
        type="button"
        variant="outline"
        disabled={busy || status === 'listed'}
        onClick={() => void submit()}
      >
        {t('selfListingSubmit')}
      </Button>
      {status && (
        <p role={status === 'error' ? 'alert' : 'status'}>{t(`selfListingStatus.${status}`)}</p>
      )}
    </div>
  )
}
