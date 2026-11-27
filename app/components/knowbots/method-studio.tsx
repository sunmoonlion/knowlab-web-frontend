'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CrossAppLink } from '@/components/common/cross-app-link'
import { Button } from '@/components/ui/button'
import {
  formalDraftSchema,
  receiptCoversCallers,
  type FormalDraft,
  type FormalSource,
  type FormalValidation,
  type FormalVersion,
} from '@/contracts/formal-methods'
import { Link, useRouter } from '@/i18n/navigation'
import { ApiClientError } from '@/lib/common/api-client'
import {
  formalSources,
  formalValidation,
  freezeFormalMethod,
  registerDirectorySource,
  submitSelfListing,
  validateFormalMethod,
  type ValidationCommand,
} from '@/lib/knowbots/formal-methods'
import {
  bindGapResolution,
  createMethodDraft,
  ensureMethodDraftRuntimeAnchor,
  fetchMethodDraft,
  fetchSlotVocabulary,
  listMethodDrafts,
  patchMethodDraft,
  spawnGapChild,
  type ArchetypeId,
  type MethodDraftDetail,
} from '@/lib/knowbots/method-drafts'
import { FormalMethodExecution } from './formal-method-execution'
import { DraftMethodDirectory } from './method-directory'

const ARCHETYPES: readonly ArchetypeId[] = ['S1', 'S2', 'S3', 'S4']
const V0_KINDS = [
  'schema_and_range',
  'numeric_identity',
  'sourced_citation',
  'collection_coverage',
  'prohibited_terms',
] as const
const inputCls = 'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm'

function errorCode(exc: unknown) {
  return exc instanceof ApiClientError ? exc.problem.code : 'request_failed'
}

export type StudioInitialParams = {
  archetype?: string
  method_kind?: string
  source_kind?: string
  source_id?: string
  source_version?: string
  source_name?: string
}

export function MethodStudioHome({
  csrfToken,
  initial = {},
}: {
  csrfToken: string
  initial?: StudioInitialParams
}) {
  const t = useTranslations('studio')
  const router = useRouter()
  const client = useQueryClient()
  const [archetype, setArchetype] = useState<ArchetypeId>(
    ARCHETYPES.includes(initial.archetype as ArchetypeId)
      ? (initial.archetype as ArchetypeId)
      : 'S1',
  )
  const [methodKind, setMethodKind] = useState<'tool' | 'expert'>(
    initial.method_kind === 'tool' ? 'tool' : 'expert',
  )
  const [title, setTitle] = useState(initial.source_name ? `${initial.source_name}` : '')
  const [purpose, setPurpose] = useState('')

  const drafts = useQuery({
    queryKey: ['method-drafts'],
    queryFn: listMethodDrafts,
    retry: false,
  })

  const create = useMutation({
    mutationFn: () =>
      createMethodDraft(
        {
          archetype,
          method_kind: methodKind,
          title: title.trim(),
          ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
        },
        csrfToken,
      ),
    onSuccess: async (created) => {
      await client.invalidateQueries({ queryKey: ['method-drafts'] })
      router.push(`/studio/${created.method_id}`)
    },
  })

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-xl border p-5" aria-label={t('createTitle')}>
        <div>
          <h2 className="text-lg font-semibold">{t('createTitle')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('createLead')}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {ARCHETYPES.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={archetype === id}
              onClick={() => {
                setArchetype(id)
                if (id === 'S2' || id === 'S3') setMethodKind('expert')
              }}
              className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                archetype === id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
              }`}
            >
              <strong className="block">{t(`archetypes.${id}.title`)}</strong>
              <span className="text-muted-foreground mt-1 block text-xs">
                {t(`archetypes.${id}.desc`)}
              </span>
            </button>
          ))}
        </div>

        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim()) create.mutate()
          }}
        >
          <label className="text-sm">
            {t('methodTitle')}
            <input
              required
              maxLength={200}
              className={inputCls}
              value={title}
              placeholder={t('titlePlaceholder')}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="text-sm">
            {t('methodKind')}
            <select
              className={inputCls}
              value={methodKind}
              onChange={(e) => setMethodKind(e.target.value as 'tool' | 'expert')}
            >
              <option value="expert">{t('kind.expert')}</option>
              <option value="tool">{t('kind.tool')}</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            {t('purposeOptional')}
            <textarea
              rows={2}
              maxLength={4000}
              className={inputCls}
              value={purpose}
              placeholder={t('purposePlaceholder')}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </label>
          {initial.source_id ? (
            <p className="text-muted-foreground text-xs sm:col-span-2">
              {t('prefilledSource', {
                name: initial.source_name ?? initial.source_id,
                version: initial.source_version ?? '1',
              })}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              {t('createAction')}
            </Button>
          </div>
          {create.isError ? (
            <p role="alert" className="text-destructive text-sm sm:col-span-2">
              {t('saveError', { code: errorCode(create.error) })}
            </p>
          ) : null}
        </form>
      </section>

      <section className="space-y-3" aria-label={t('draftsTitle')}>
        <h2 className="text-lg font-semibold">{t('draftsTitle')}</h2>
        {drafts.isPending ? (
          <p className="text-muted-foreground text-sm">{t('loading')}</p>
        ) : drafts.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {t('loadError')}
          </p>
        ) : drafts.data.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            {t('emptyDrafts')}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {drafts.data.map((d) => (
              <li key={d.method_id} className="space-y-2 rounded-xl border p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/studio/${d.method_id}`} className="font-semibold hover:underline">
                    {d.title}
                  </Link>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">
                    {d.archetype} · {t(`kind.${d.method_kind}`)} · rev {d.revision}
                  </span>
                </div>
                <p className="text-muted-foreground line-clamp-2 text-xs">{d.purpose}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={
                      d.ready_to_freeze
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }
                  >
                    {t(d.ready_to_freeze ? 'readyBadge' : 'editingBadge')}
                  </span>
                  {d.parent_gap ? (
                    <span className="text-muted-foreground">
                      · {t('childOfStep', { step: d.parent_gap.step_id })}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function MethodStudioEditor({
  methodId,
  csrfToken,
}: {
  methodId: string
  csrfToken: string
}) {
  const t = useTranslations('studio')
  const client = useQueryClient()
  const router = useRouter()
  const [stepTab, setStepTab] = useState<'contract' | 'procedure' | 'trial' | 'freeze'>('contract')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const vocab = useQuery({
    queryKey: ['slot-vocabulary'],
    queryFn: fetchSlotVocabulary,
    retry: false,
  })
  const loaded = useQuery({
    queryKey: ['method-draft', methodId],
    queryFn: () => fetchMethodDraft(methodId),
    retry: false,
  })

  if (loaded.isPending) return <p>{t('loading')}</p>
  if (loaded.isError || !loaded.data)
    return (
      <p role="alert" className="text-destructive">
        {t('loadError')}
      </p>
    )

  return (
    <StudioForm
      key={`${loaded.data.method_id}:${loaded.data.revision}`}
      detail={loaded.data}
      domains={vocab.data?.domains ?? [{ domain_id: 'core.record.object', label: '结构化记录' }]}
      csrfToken={csrfToken}
      stepTab={stepTab}
      setStepTab={setStepTab}
      notice={notice}
      setNotice={setNotice}
      error={error}
      setError={setError}
      onUpdated={(saved) => client.setQueryData(['method-draft', methodId], saved)}
      onNavigate={(href) => router.push(href)}
    />
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawObj = Record<string, any>

function StudioForm({
  detail,
  domains,
  csrfToken,
  stepTab,
  setStepTab,
  notice,
  setNotice,
  error,
  setError,
  onUpdated,
  onNavigate,
}: {
  detail: MethodDraftDetail
  domains: { domain_id: string; label: string }[]
  csrfToken: string
  stepTab: 'contract' | 'procedure' | 'trial' | 'freeze'
  setStepTab: (v: 'contract' | 'procedure' | 'trial' | 'freeze') => void
  notice: string | null
  setNotice: (v: string | null) => void
  error: string | null
  setError: (v: string | null) => void
  onUpdated: (v: MethodDraftDetail) => void
  onNavigate: (href: string) => void
}) {
  const t = useTranslations('studio')
  const client = useQueryClient()
  const raw = detail.draft_contract as RawObj
  const [title, setTitle] = useState<string>(String(raw.title ?? ''))
  const [purpose, setPurpose] = useState<string>(String(raw.purpose ?? ''))
  const [appliesText, setAppliesText] = useState<string>(
    Array.isArray(raw.applies_when) ? raw.applies_when.join('\n') : '',
  )
  const [excludesText, setExcludesText] = useState<string>(
    Array.isArray(raw.excludes) ? raw.excludes.join('\n') : '',
  )
  const [deliverables, setDeliverables] = useState<RawObj[]>(() =>
    Array.isArray(raw.expected_deliverables) ? structuredClone(raw.expected_deliverables) : [],
  )
  const [rules, setRules] = useState<RawObj[]>(() =>
    Array.isArray(raw.validation_rules) ? structuredClone(raw.validation_rules) : [],
  )
  const [procedure, setProcedure] = useState<RawObj | null>(() =>
    raw.procedure ? structuredClone(raw.procedure) : null,
  )
  const [selectedSource, setSelectedSource] = useState<FormalSource | null>(detail.source ?? null)
  const [callers, setCallers] = useState<('host' | 'model')[]>(detail.allowed_callers ?? ['host'])
  const [inlineSourceOpen, setInlineSourceOpen] = useState(false)
  const [inlineSourceName, setInlineSourceName] = useState('')
  const [inlineSourceKind, setInlineSourceKind] = useState<'script' | 'instruction'>('script')
  const [inlineSourceBody, setInlineSourceBody] = useState('')
  const [gapStepId, setGapStepId] = useState('')
  const [gapTitle, setGapTitle] = useState('')
  const [gapKind, setGapKind] = useState<'tool' | 'expert'>('tool')

  const [anchorRequestId, setAnchorRequestId] = useState<string | null>(detail.request_id)
  const [runCmd, setRunCmd] = useState<ValidationCommand | null>(null)
  const [validation, setValidation] = useState<FormalValidation | null>(null)
  const [executionActive, setExecutionActive] = useState(false)
  const [versionNo, setVersionNo] = useState(1)
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [frozenVersion, setFrozenVersion] = useState<FormalVersion | null>(null)
  const [selfListingState, setSelfListingState] = useState<string | null>(null)
  const [boundParent, setBoundParent] = useState(false)

  const sourcesQuery = useQuery({
    queryKey: ['studio-sources', detail.request_id],
    queryFn: () => formalSources(detail.request_id ?? undefined),
    enabled: stepTab === 'procedure',
    retry: false,
  })

  const saveContract = useMutation({
    mutationFn: (confirmAll: boolean) =>
      patchMethodDraft(
        detail.method_id,
        {
          revision: detail.revision,
          elements: {
            title: title.trim(),
            purpose: purpose.trim(),
            applies_when: appliesText
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
            excludes: excludesText
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
            expected_deliverables: deliverables,
            validation_rules: rules,
            ...(procedure ? { procedure } : {}),
          },
          ...(confirmAll ? { confirm_paths: detail.projection.unconfirmed_paths } : {}),
          source: selectedSource,
          allowed_callers: callers,
        },
        csrfToken,
      ),
    onSuccess: (saved) => {
      setError(null)
      setNotice(t('savedNotice', { revision: saved.revision }))
      onUpdated(saved)
    },
    onError: (exc) => setError(errorCode(exc)),
  })

  const saveInlineSource = useMutation({
    mutationFn: () =>
      registerDirectorySource(
        crypto.randomUUID(),
        1,
        {
          kind: inlineSourceKind,
          name: inlineSourceName.trim(),
          content: inlineSourceBody,
          ...(detail.request_id ? { request_id: detail.request_id } : {}),
        },
        csrfToken,
      ),
    onSuccess: async (created) => {
      setInlineSourceOpen(false)
      setInlineSourceName('')
      setInlineSourceBody('')
      setNotice(t('sourceRegistered', { name: created.name, version: created.version }))
      await client.invalidateQueries({ queryKey: ['studio-sources'] })
    },
    onError: (exc) => setError(errorCode(exc)),
  })

  const spawnChild = useMutation({
    mutationFn: () =>
      spawnGapChild(
        detail.method_id,
        {
          revision: detail.revision,
          step_id: gapStepId,
          title: gapTitle.trim(),
          purpose: gapTitle.trim(),
          kind: gapKind,
        },
        csrfToken,
      ),
    onSuccess: (child) => {
      onNavigate(`/studio/${child.method_id}`)
    },
    onError: (exc) => setError(errorCode(exc)),
  })

  const ensureAnchor = useMutation({
    mutationFn: () => ensureMethodDraftRuntimeAnchor(detail.method_id, csrfToken),
    onSuccess: async (res) => {
      setAnchorRequestId(res.request_id)
      const refreshed = await fetchMethodDraft(detail.method_id)
      onUpdated(refreshed)
    },
    onError: (exc) => setError(errorCode(exc)),
  })

  const runValidate = useMutation({
    mutationFn: async () => {
      const reqId =
        anchorRequestId ??
        (await ensureMethodDraftRuntimeAnchor(detail.method_id, csrfToken)).request_id
      setAnchorRequestId(reqId)
      const cmd = runCmd ?? {
        request_id: reqId,
        revision: detail.revision,
        run_id: crypto.randomUUID(),
      }
      setRunCmd(cmd)
      return validateFormalMethod(detail.method_id, cmd, csrfToken)
    },
    onSuccess: (res) => {
      setError(null)
      setValidation(res)
    },
    onError: (exc) => setError(errorCode(exc)),
  })

  const refreshValidate = useMutation({
    mutationFn: async () => {
      if (!runCmd) throw new Error('no_run')
      return formalValidation(detail.method_id, runCmd)
    },
    onSuccess: (res) => setValidation(res),
    onError: (exc) => setError(errorCode(exc)),
  })

  const doFreeze = useMutation({
    mutationFn: async () => {
      if (!runCmd) throw new Error('missing_validation')
      return freezeFormalMethod(detail.method_id, versionNo, { ...runCmd, visibility }, csrfToken)
    },
    onSuccess: (frozen) => {
      setError(null)
      setFrozenVersion(frozen)
      setNotice(t('frozenNotice', { version: frozen.version }))
    },
    onError: (exc) => setError(errorCode(exc)),
  })

  const bindBackToParent = useMutation({
    mutationFn: async () => {
      if (!detail.parent_gap || !frozenVersion) throw new Error('missing_parent_or_frozen')
      const parentInfo = await fetchMethodDraft(detail.parent_gap.parent_method_id)
      return bindGapResolution(
        detail.parent_gap.parent_method_id,
        {
          revision: parentInfo.revision,
          step_id: detail.parent_gap.step_id,
          child_reference: {
            method_id: frozenVersion.method_id,
            version: frozenVersion.version,
            digest: frozenVersion.digest,
          },
        },
        csrfToken,
      )
    },
    onSuccess: () => {
      setBoundParent(true)
      if (detail.parent_gap) onNavigate(`/studio/${detail.parent_gap.parent_method_id}`)
    },
    onError: (exc) => setError(errorCode(exc)),
  })

  const builtDraft: FormalDraft | null = (() => {
    if (!detail.definition_digest || !procedure) return null
    const candidate = {
      definition: {
        contract: 'knowlab/formal-method/v1',
        capability_declaration: {
          title,
          purpose,
          applies_when: appliesText
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          excludes: excludesText
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          promises: Object.fromEntries(deliverables.map((d) => [d.promise_id, d.summary])),
        },
        access_requirements: raw.access_ceiling ?? [],
        procedure,
        how_to_validate: rules.map(({ v0_checks: _v0, ...rest }) => rest),
        what_requires_approval: (raw.approval_rules ?? []).map(
          ({ scope: _sc, ...rest }: RawObj) => rest,
        ),
      },
      source: selectedSource,
      allowed_callers: callers,
    }
    const parsed = formalDraftSchema.safeParse(candidate)
    return parsed.success ? parsed.data : null
  })()

  const canFreeze =
    validation?.status === 'passed' &&
    !!validation.receipt &&
    receiptCoversCallers(validation.receipt, callers)

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/studio" className="underline">
            {t('backToStudio')}
          </Link>
          {detail.parent_gap ? (
            <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100">
              {t('fractalGapBanner', { step: detail.parent_gap.step_id })} ·{' '}
              <Link href={`/studio/${detail.parent_gap.parent_method_id}`} className="underline">
                {t('openParentDraft')}
              </Link>
            </span>
          ) : null}
        </div>
        <span className="text-muted-foreground text-xs">
          {String(raw.archetype_id ?? 'S1')} · {t(`kind.${String(raw.method_kind ?? 'expert')}`)} ·
          rev {detail.revision}
        </span>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2 border-b pb-2">
        {(['contract', 'procedure', 'trial', 'freeze'] as const).map((tab, idx) => (
          <Button
            key={tab}
            role="tab"
            type="button"
            size="sm"
            variant={stepTab === tab ? 'default' : 'outline'}
            aria-selected={stepTab === tab}
            onClick={() => setStepTab(tab)}
          >
            {idx + 1}. {t(`steps.${tab}`)}
          </Button>
        ))}
      </div>

      {detail.projection.unconfirmed_paths.length > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/50"
        >
          <div>
            <strong>{t('unconfirmedTitle', { count: detail.projection.unconfirmed_paths.length })}</strong>
            <p className="text-muted-foreground text-xs">
              {detail.projection.unconfirmed_paths.join(' · ')}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={saveContract.isPending}
            onClick={() => saveContract.mutate(true)}
          >
            {t('confirmAllProvenance')}
          </Button>
        </div>
      ) : null}

      {stepTab === 'contract' ? (
        <section className="space-y-4 rounded-xl border p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t('methodTitle')}
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <fieldset className="text-sm">
              <legend className="font-medium">{t('allowedCallers')}</legend>
              <div className="mt-2 flex gap-4">
                {(['host', 'model'] as const).map((c) => (
                  <label key={c} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={callers.includes(c)}
                      onChange={(e) =>
                        setCallers(
                          e.target.checked ? [...callers, c] : callers.filter((x) => x !== c),
                        )
                      }
                    />
                    {t(`caller.${c}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <label className="block text-sm">
            {t('purpose')}
            <textarea
              rows={2}
              className={inputCls}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t('appliesWhen')}
              <textarea
                rows={3}
                className={inputCls}
                value={appliesText}
                onChange={(e) => setAppliesText(e.target.value)}
              />
            </label>
            <label className="text-sm">
              {t('excludes')}
              <textarea
                rows={3}
                className={inputCls}
                value={excludesText}
                onChange={(e) => setExcludesText(e.target.value)}
              />
            </label>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t('deliverablesTitle')}</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const pid = `deliverable_${deliverables.length + 1}`
                  setDeliverables([
                    ...deliverables,
                    {
                      promise_id: pid,
                      summary: t('defaultDeliverableSummary'),
                      expected_domain_id: domains[0]?.domain_id ?? 'core.record.object',
                      expected_schema: { type: 'object' },
                      delivery_mode: 'always',
                    },
                  ])
                  setRules([
                    ...rules,
                    {
                      promise_id: pid,
                      outputs: [pid],
                      check: t('defaultValidationCheck'),
                      evidence: t('defaultValidationEvidence'),
                      on_failure: 'fail',
                      v0_checks: [{ kind: 'schema_and_range', target_output: pid }],
                    },
                  ])
                }}
              >
                {t('addDeliverable')}
              </Button>
            </div>
            {deliverables.map((item, idx) => (
              <div key={item.promise_id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
                <label className="text-xs">
                  {t('promiseId')}
                  <input className={inputCls} value={item.promise_id} readOnly />
                </label>
                <label className="text-xs">
                  {t('domainVocabulary')}
                  <select
                    className={inputCls}
                    value={item.expected_domain_id ?? 'core.record.object'}
                    onChange={(e) => {
                      const next = [...deliverables]
                      next[idx] = { ...item, expected_domain_id: e.target.value }
                      setDeliverables(next)
                    }}
                  >
                    {domains.map((d) => (
                      <option key={d.domain_id} value={d.domain_id}>
                        {d.label} ({d.domain_id})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  {t('deliveryMode')}
                  <select
                    className={inputCls}
                    value={item.delivery_mode ?? 'always'}
                    onChange={(e) => {
                      const next = [...deliverables]
                      next[idx] = { ...item, delivery_mode: e.target.value }
                      setDeliverables(next)
                    }}
                  >
                    <option value="always">{t('mode.always')}</option>
                    <option value="conditional">{t('mode.conditional')}</option>
                    <option value="partial_allowed">{t('mode.partial_allowed')}</option>
                  </select>
                </label>
                <label className="text-xs sm:col-span-3">
                  {t('promiseSummary')}
                  <input
                    className={inputCls}
                    value={item.summary}
                    onChange={(e) => {
                      const next = [...deliverables]
                      next[idx] = { ...item, summary: e.target.value }
                      setDeliverables(next)
                    }}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">{t('v0RulesTitle')}</h3>
            {rules.map((r, idx) => (
              <div key={r.promise_id + idx} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
                <label className="text-xs sm:col-span-2">
                  {t('ruleCheck')} ({r.promise_id})
                  <input
                    className={inputCls}
                    value={r.check}
                    onChange={(e) => {
                      const next = [...rules]
                      next[idx] = { ...r, check: e.target.value }
                      setRules(next)
                    }}
                  />
                </label>
                <label className="text-xs">
                  {t('v0Operator')}
                  <select
                    className={inputCls}
                    value={r.v0_checks?.[0]?.kind ?? ''}
                    onChange={(e) => {
                      const next = [...rules]
                      next[idx] = {
                        ...r,
                        v0_checks: e.target.value
                          ? [{ kind: e.target.value, target_output: r.outputs?.[0] ?? r.promise_id }]
                          : [],
                      }
                      setRules(next)
                    }}
                  >
                    <option value="">{t('v0None')}</option>
                    {V0_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(`v0.${k}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              disabled={saveContract.isPending || !title.trim() || !purpose.trim()}
              onClick={() => saveContract.mutate(true)}
            >
              {t('saveAndConfirm')}
            </Button>
          </div>
        </section>
      ) : null}

      {stepTab === 'procedure' ? (
        <section className="space-y-4 rounded-xl border p-5">
          {raw.method_kind === 'tool' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{t('toolSourceTitle')}</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setInlineSourceOpen(!inlineSourceOpen)}
                >
                  {t('registerInlineSource')}
                </Button>
              </div>
              {inlineSourceOpen ? (
                <form
                  className="space-y-3 rounded-lg border p-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (inlineSourceName.trim() && inlineSourceBody.trim()) saveInlineSource.mutate()
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      {t('sourceKind')}
                      <select
                        className={inputCls}
                        value={inlineSourceKind}
                        onChange={(e) =>
                          setInlineSourceKind(e.target.value as 'script' | 'instruction')
                        }
                      >
                        <option value="script">{t('script')}</option>
                        <option value="instruction">{t('instruction')}</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      {t('sourceName')}
                      <input
                        required
                        className={inputCls}
                        value={inlineSourceName}
                        onChange={(e) => setInlineSourceName(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block text-sm">
                    {t('sourceContent')}
                    <textarea
                      required
                      rows={5}
                      className={`${inputCls} font-mono`}
                      value={inlineSourceBody}
                      onChange={(e) => setInlineSourceBody(e.target.value)}
                    />
                  </label>
                  <Button type="submit" size="sm" disabled={saveInlineSource.isPending}>
                    {t('saveInlineSource')}
                  </Button>
                </form>
              ) : null}

              <label className="block text-sm">
                {t('selectBoundSource')}
                <select
                  className={inputCls}
                  value={selectedSource ? JSON.stringify(selectedSource) : ''}
                  onChange={(e) => {
                    const picked =
                      sourcesQuery.data?.find((s) => JSON.stringify(s) === e.target.value) ?? null
                    setSelectedSource(picked)
                    if (picked) {
                      setProcedure({
                        ...(procedure ?? {}),
                        kind: 'direct',
                        instructions: procedure?.instructions || purpose,
                        stop_conditions: procedure?.stop_conditions ?? ['输入不合法'],
                        max_model_turns: ['registered_instruction', 'skill_instruction'].includes(
                          picked.kind,
                        )
                          ? 1
                          : 0,
                        inputs: procedure?.inputs ?? {
                          query: {
                            description: '输入参数',
                            schema: { type: 'string' },
                            required: true,
                            meaning: { domain_id: 'core.text.question', vocab_version: '1' },
                            on_missing: 'fail',
                          },
                        },
                        outputs:
                          procedure?.outputs ??
                          Object.fromEntries(
                            deliverables.map((d) => [
                              d.promise_id,
                              {
                                description: d.summary,
                                schema: d.expected_schema ?? { type: 'object' },
                                required: d.delivery_mode === 'always',
                                meaning: {
                                  domain_id: d.expected_domain_id ?? 'core.record.object',
                                  vocab_version: '1',
                                },
                                on_missing: 'fail',
                              },
                            ]),
                          ),
                        implementation: {
                          kind: picked.kind,
                          source: picked.source,
                          version: picked.version,
                          digest: picked.digest,
                          entry: picked.entry,
                          requirement_ids: [],
                        },
                      })
                    }
                  }}
                >
                  <option value="">{t('chooseSourceOption')}</option>
                  {(sourcesQuery.data ?? []).map((s) => (
                    <option key={JSON.stringify(s)} value={JSON.stringify(s)}>
                      {s.source} · {s.entry} · v{s.version}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                disabled={saveContract.isPending}
                onClick={() => saveContract.mutate(true)}
              >
                {t('saveProcedure')}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-3 rounded-lg border p-3">
                <h3 className="text-sm font-semibold">{t('canvasSteps')}</h3>
                <ul className="space-y-2 text-xs">
                  {(procedure?.steps ?? []).map((s: RawObj) => (
                    <li key={s.id} className="rounded border p-2">
                      <strong>{s.id}</strong>
                      <p className="text-muted-foreground">
                        {s.candidates?.length
                          ? t('pinnedCandidates', { count: s.candidates.length })
                          : t('gapUnbound')}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-1"
                        onClick={() => {
                          setGapStepId(s.id)
                          setGapTitle(`${title} - ${s.id}`)
                        }}
                      >
                        {t('spawnFromStep')}
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const nextSteps = [...(procedure?.steps ?? [])]
                    const stepId = `step_${nextSteps.length + 1}`
                    const outSlot = deliverables[0]?.promise_id ?? 'result'
                    nextSteps.push({
                      id: stepId,
                      candidates: [],
                      select_when: '满足输入条件时执行',
                      required_when: '需要交付目标承诺时必做',
                      always_required: true,
                      depends_on: nextSteps.length ? [nextSteps[nextSteps.length - 1].id] : [],
                      inputs: {},
                      outputs: {
                        [outSlot]: {
                          description: deliverables[0]?.summary ?? '步骤产物',
                          schema: deliverables[0]?.expected_schema ?? { type: 'object' },
                          required: true,
                          meaning: {
                            domain_id: deliverables[0]?.expected_domain_id ?? 'core.record.object',
                            vocab_version: '1',
                          },
                          on_missing: 'fail',
                        },
                      },
                      on_failure: 'fail',
                    })
                    setProcedure({
                      kind: 'orchestration',
                      instructions: procedure?.instructions || purpose,
                      steps: nextSteps,
                      exports: {
                        ...(procedure?.exports ?? {}),
                        [outSlot]: { step: stepId, output: outSlot, always_present: true },
                      },
                      max_depth: 4,
                      max_expansions: 16,
                      max_steps: 16,
                      max_replans: 0,
                    })
                  }}
                >
                  {t('addStepNode')}
                </Button>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <h3 className="text-sm font-semibold">{t('stepBindingColumn')}</h3>
                <DraftMethodDirectory
                  requestId={detail.request_id ?? undefined}
                  revision={detail.revision}
                  onPick={({ reference }) => {
                    const steps = [...(procedure?.steps ?? [])]
                    if (!steps.length) return
                    const targetIdx = gapStepId
                      ? Math.max(
                          0,
                          steps.findIndex((s) => s.id === gapStepId),
                        )
                      : steps.length - 1
                    steps[targetIdx] = { ...steps[targetIdx], candidates: [reference] }
                    setProcedure({ ...(procedure ?? {}), steps })
                  }}
                />
                {gapStepId ? (
                  <form
                    className="space-y-2 border-t pt-3 text-xs"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (gapTitle.trim()) spawnChild.mutate()
                    }}
                  >
                    <strong>{t('spawnGapTitle', { step: gapStepId })}</strong>
                    <input
                      required
                      className={inputCls}
                      value={gapTitle}
                      onChange={(e) => setGapTitle(e.target.value)}
                    />
                    <select
                      className={inputCls}
                      value={gapKind}
                      onChange={(e) => setGapKind(e.target.value as 'tool' | 'expert')}
                    >
                      <option value="tool">{t('kind.tool')}</option>
                      <option value="expert">{t('kind.expert')}</option>
                    </select>
                    <Button type="submit" size="sm" disabled={spawnChild.isPending}>
                      {t('confirmSpawnGap')}
                    </Button>
                  </form>
                ) : null}
              </div>

              <div className="space-y-3 rounded-lg border p-3 text-xs">
                <h3 className="text-sm font-semibold">{t('rollupColumn')}</h3>
                <p className="text-muted-foreground">{t('rollupHint')}</p>
                <Button
                  type="button"
                  size="sm"
                  disabled={saveContract.isPending}
                  onClick={() => saveContract.mutate(true)}
                >
                  {t('saveProcedure')}
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {stepTab === 'trial' ? (
        <section className="space-y-4 rounded-xl border p-5">
          {!anchorRequestId ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">{t('anchorHint')}</p>
              <Button
                type="button"
                disabled={ensureAnchor.isPending || !detail.provenance_verified}
                onClick={() => ensureAnchor.mutate()}
              >
                {t('prepareRuntimeAnchor')}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={runValidate.isPending || executionActive}
                  onClick={() => runValidate.mutate()}
                >
                  {t('runGovernanceCheck')}
                </Button>
                {runCmd ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={refreshValidate.isPending}
                    onClick={() => refreshValidate.mutate()}
                  >
                    {t('refreshGovernanceCheck')}
                  </Button>
                ) : null}
              </div>
              {validation ? (
                <div role="status" className="rounded-lg border p-3 text-sm">
                  <strong>{validation.status}</strong>
                  {validation.details.map((line, i) => (
                    <p key={i} className="text-muted-foreground text-xs">
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}
              <FormalMethodExecution
                methodId={detail.method_id}
                requestId={anchorRequestId}
                revision={detail.revision}
                draft={builtDraft}
                disabled={!builtDraft}
                csrfToken={csrfToken}
                onRun={(cmd) => setRunCmd(cmd)}
                onResult={(res) => setValidation(res.admission)}
                onActiveChange={setExecutionActive}
              />
            </>
          )}
        </section>
      ) : null}

      {stepTab === 'freeze' ? (
        <section className="space-y-4 rounded-xl border p-5 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              {t('freezeVersion')}
              <input
                type="number"
                min={1}
                className={inputCls}
                value={versionNo}
                onChange={(e) => setVersionNo(Number(e.target.value))}
              />
            </label>
            <label>
              {t('freezeVisibility')}
              <select
                className={inputCls}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'private' | 'public')}
              >
                <option value="private">{t('private')}</option>
                <option value="public">{t('public')}</option>
              </select>
            </label>
          </div>
          <Button type="button" disabled={!canFreeze || doFreeze.isPending} onClick={() => doFreeze.mutate()}>
            {t('confirmFreeze')}
          </Button>
          {frozenVersion ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <p className="font-medium">
                {t('frozenNotice', { version: frozenVersion.version })} · {frozenVersion.digest.slice(0, 20)}…
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const status = await submitSelfListing(
                      {
                        method_id: frozenVersion.method_id,
                        version: frozenVersion.version,
                        digest: frozenVersion.digest,
                      },
                      csrfToken,
                    )
                    setSelfListingState(status)
                  }}
                >
                  {t('syncSelfListing')}
                </Button>
                <CrossAppLink to="knowmart.shop" className="underline">
                  {t('openKnowMartShop')}
                </CrossAppLink>
                {detail.parent_gap && !boundParent ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={bindBackToParent.isPending}
                    onClick={() => bindBackToParent.mutate()}
                  >
                    {t('bindBackToParent', { step: detail.parent_gap.step_id })}
                  </Button>
                ) : null}
              </div>
              {selfListingState ? <p role="status">{selfListingState}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {notice ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {t('saveError', { code: error })}
        </p>
      ) : null}

      <aside
        aria-label={t('twoViewBar')}
        className="bg-background/95 sticky bottom-2 z-10 rounded-xl border p-3 text-xs shadow-sm backdrop-blur"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>{t('twoViewBar')}</strong>
          <span>
            {detail.provenance_verified ? t('cl1Verified') : t('cl1Pending')} ·{' '}
            {t(detail.projection.ready_to_freeze ? 'readyBadge' : 'editingBadge')}
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground font-medium">{t('viewInputs')}: </span>
            {detail.projection.public_inputs.length
              ? detail.projection.public_inputs
                  .map((s) => `${s.name}(${s.domain_label || s.domain_id || s.schema_type || 'any'})`)
                  .join(' · ')
              : t('none')}
          </div>
          <div>
            <span className="text-muted-foreground font-medium">{t('viewReturns')}: </span>
            {detail.projection.what_to_return.length
              ? detail.projection.what_to_return
                  .map((s) => `${s.name}(${s.domain_label || s.domain_id || s.schema_type || 'any'})`)
                  .join(' · ')
              : t('none')}
          </div>
        </div>
        {detail.projection.issues.length > 0 ? (
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            {detail.projection.issues.join('；')}
          </p>
        ) : null}
      </aside>
    </div>
  )
}
