'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  formalDefinitionSchema,
  formalDraftSchema,
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
  listFormalMethods,
  getFormalVersion,
  formalValidation,
  freezeFormalMethod,
  validateFormalMethod,
  type ValidationCommand,
} from '@/lib/knowbots/formal-methods'
import { same } from '@/lib/knowbots/workdraft'
import { KEY } from './shared'

const input = 'mt-1 w-full rounded border bg-background p-2 text-sm'
type Resume = { method?: string; run?: string; revision?: string; version?: string }
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
    queryKey: ['formal-methods', methodPage],
    queryFn: () => listFormalMethods(methodPage * 30),
    retry: false,
  })
  const [run, setRun] = useState<ValidationCommand | null>(() =>
    id(resume.method) && id(resume.run) && Number(resume.revision) === initial.revision
      ? { request_id: initial.request_id, revision: initial.revision, run_id: resume.run! }
      : null,
  )
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
  const dirty = !same(draft, document.body.formal_method ?? null)
  const ready =
    !!draft &&
    formalDraftSchema.safeParse(draft).success &&
    (definition?.procedure.kind !== 'direct' || !!source)
  const receipt = validation?.receipt
  const shownVersion = frozen ?? inspected
  const selectedMethod = methods.data?.find((method) => method.method_id === methodId)
  const validated =
    !dirty && run?.revision === document.revision && validation?.status === 'passed' && !!receipt
  const publicReady = validated && receipt.checks.includes('business') && !receipt.uncovered.length
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
  const rememberRun = (command: ValidationCommand) => {
    const url = new URL(window.location.href)
    url.searchParams.set('method', methodId)
    url.searchParams.set('run', command.run_id)
    url.searchParams.set('revision', String(command.revision))
    url.searchParams.set('version', String(version))
    window.history.replaceState(null, '', url.pathname + url.search)
  }
  const save = async () => {
    if (!draft || !ready) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await saveWorkdraftCells(
        initial.request_id,
        {
          revision: document.revision,
          cells: [{ path: 'formal_method', value: draft }],
        },
        csrfToken,
      )
      if (!same(saved.body.formal_method, draft)) throw new Error('saved_definition_mismatch')
      setDocument(saved)
      setValidation(null)
      setRun(null)
      setFrozen(null)
      setNotice(t('saved'))
      await client.invalidateQueries({ queryKey: [...KEY, 'workdraft', initial.request_id] })
    } catch (exc) {
      setError(problem(exc))
    } finally {
      setWorking(false)
    }
  }
  const validate = async (refresh: boolean) => {
    if (dirty || !ready || document.revision < 1) return
    const command =
      run?.revision === document.revision
        ? run
        : {
            request_id: initial.request_id,
            revision: document.revision,
            run_id: crypto.randomUUID(),
          }
    setRun(command)
    rememberRun(command)
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
      <fieldset disabled={working} className="space-y-2 rounded border p-4 text-sm">
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
      <fieldset disabled={working} className="space-y-4 rounded border p-4">
        <legend className="px-1 font-medium">{t('definition')}</legend>
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
                editDefinition(parsed)
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
            <p className="text-sm">
              {t('applies')}: {definition.capability_declaration.applies_when.join('；')}
            </p>
            <p className="text-sm">
              {t('excludes')}: {definition.capability_declaration.excludes.join('；') || t('none')}
            </p>
            <ul className="list-inside list-disc text-sm">
              {Object.entries(definition.capability_declaration.promises).map(([key, value]) => (
                <li key={key}>{value}</li>
              ))}
            </ul>
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
                    {t('license')}: {source.license_basis}
                  </p>
                ) : null}
              </>
            ) : (
              <ol className="list-inside list-decimal space-y-1 text-sm">
                {definition.procedure.steps.map((step) => (
                  <li key={step.id}>
                    {step.id} · {step.select_when} ·{' '}
                    {t('candidateCount', { count: step.candidates.length })}
                  </li>
                ))}
              </ol>
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
              <h3 className="font-medium">{t('validationRules')}</h3>
              {definition.how_to_validate.map((rule, index) => (
                <label className="block" key={rule.promise_id}>
                  {definition.capability_declaration.promises[rule.promise_id] ?? rule.promise_id}
                  <textarea
                    className={input}
                    value={rule.check}
                    onChange={(e) =>
                      editDefinition({
                        ...definition,
                        how_to_validate: definition.how_to_validate.map((r, i) =>
                          i === index ? { ...r, check: e.target.value } : r,
                        ),
                      })
                    }
                  />
                  <span className="text-muted-foreground">{rule.evidence}</span>
                </label>
              ))}
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
            disabled={working || dirty || !ready || document.revision < 1}
            onClick={() => void validate(false)}
          >
            {t('validate')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={working || dirty || !run}
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
      <fieldset disabled={working || !validated} className="space-y-3 rounded border p-4">
        <legend className="px-1 font-medium">{t('freeze')}</legend>
        <p className="text-muted-foreground text-sm">{t('freezeHint')}</p>
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
