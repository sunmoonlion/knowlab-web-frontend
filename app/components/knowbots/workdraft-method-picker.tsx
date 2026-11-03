'use client'

import { useTranslations } from 'next-intl'
import { methodView } from '@/contracts/author-methods'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { BindMethodCommand, BindingPreview, MethodVersion } from '@/contracts/author-methods'
import type { MethodReference, Step } from '@/contracts/workdraft'
import { ApiClientError } from '@/lib/common/api-client'
import { previewMethodBinding } from '@/lib/knowbots/methods'
import { same } from '@/lib/knowbots/workdraft'

import { INPUT, SELECT } from './workdraft-cells'
import { Panel } from './workdraft-panels'

import type { MethodChoice } from '@/contracts/method-choice'
import { MethodVersionBrowser } from './method-version-browser'

export function MethodPickerPanel({
  requestId,
  revision,
  step,
  sources,
  currentRef,
  initialChoice,
  csrfToken,
  onApply,
  onClose,
}: {
  requestId: string
  revision: number
  step: Step
  sources: Step[]
  currentRef?: MethodReference
  initialChoice?: MethodChoice
  csrfToken: string
  onApply: (methodId: string, version: number, command: BindMethodCommand) => Promise<void>
  onClose: () => void
}) {
  const t = useTranslations('workdraft.methods')
  const [busy, setBusy] = useState(false)
  return (
    <Panel
      title={t('title', { title: step.title || step.id })}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <p>{t('hint')}</p>
      {currentRef ? <p>{t('current', { version: currentRef.version })}</p> : null}
      <MethodVersionBrowser initialChoice={initialChoice ?? currentRef} disabled={busy}>
        {(method) => (
          <BindingForm
            key={`${method.method_id}:${method.version}`}
            method={method}
            requestId={requestId}
            revision={revision}
            step={step}
            sources={sources}
            currentRef={currentRef}
            csrfToken={csrfToken}
            onApply={onApply}
            setBusy={setBusy}
          />
        )}
      </MethodVersionBrowser>
    </Panel>
  )
}

function BindingForm({
  method,
  requestId,
  revision,
  step,
  sources,
  currentRef,
  csrfToken,
  onApply,
  setBusy,
}: {
  method: MethodVersion
  requestId: string
  revision: number
  step: Step
  sources: Step[]
  currentRef?: MethodReference
  csrfToken: string
  onApply: (id: string, version: number, command: BindMethodCommand) => Promise<void>
  setBusy: (busy: boolean) => void
}) {
  const t = useTranslations('workdraft.methods')
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    currentRef?.method_id === method.method_id ? { ...currentRef.inputs } : {},
  )
  const [required, setRequired] = useState(step.selection?.required ?? false)
  const callLimit =
    method.definition.schema === 'knowlab/method-definition/v3'
      ? 100
      : method.definition.step.selection.max_calls
  const [maxCalls, setMaxCalls] = useState(Math.min(step.selection?.max_calls ?? 1, callLimit))
  const [preview, setPreview] = useState<{
    command: BindMethodCommand
    value: BindingPreview
  } | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slots = Object.keys(methodView(method.definition).input_schemas)
  const selectedInputs = Object.fromEntries(
    slots.filter((s) => inputs[s]).map((s) => [s, inputs[s]]),
  )
  const command: BindMethodCommand = {
    request_id: requestId,
    revision,
    alias: step.id,
    digest: method.digest,
    inputs: selectedInputs,
    required,
    max_calls: maxCalls,
    ...(method.definition.schema === 'knowlab/method-definition/v3'
      ? {
          execution: {
            ask_before: step.ask_before,
            on_fail: step.on_fail,
            advanced: { ...step.advanced, output_schema: null },
          },
        }
      : {}),
  }
  const valid =
    slots.every((s) => sources.some((e) => e.id === inputs[s])) &&
    new Set(Object.values(selectedInputs)).size === slots.length
  const checked = preview !== null && same(preview.command, command)
  const run = async (apply: boolean) => {
    setWorking(true)
    setBusy(true)
    setError(null)
    try {
      if (apply) {
        if (!checked) return
        await onApply(method.method_id, method.version, command)
      } else {
        setPreview(null)
        const value = await previewMethodBinding(
          method.method_id,
          method.version,
          command,
          csrfToken,
        )
        setPreview({ command, value })
      }
    } catch (err) {
      setPreview(null)
      setError(err instanceof ApiClientError ? err.problem.code : 'contract_or_network_error')
    } finally {
      setWorking(false)
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3 border-t pt-3">
      <h3 className="font-medium">
        {methodView(method.definition).step.title} · {t('version', { version: method.version })}
      </h3>
      <p className="whitespace-pre-wrap">{methodView(method.definition).step.does}</p>
      <p className="text-muted-foreground text-xs">
        {t('applies')}: {methodView(method.definition).step.selection.applies_when}
      </p>
      <details>
        <summary>{t('identity')}</summary>
        <p className="text-xs break-all">
          {method.method_id}
          <br />
          {method.digest}
        </p>
      </details>
      {method.definition.schema === 'knowlab/method-definition/v3' ? (
        <p className="text-muted-foreground text-sm">{t('executionSeparate')}</p>
      ) : null}
      <fieldset disabled={working} className="space-y-3">
        {slots.map((slot) => (
          <label key={slot} className="block">
            {t('input', { slot })}
            <span className="text-muted-foreground ml-2 text-xs">
              {t(
                (method.definition.schema === 'knowlab/method-definition/v2' &&
                  !method.definition.input_required[slot]) ||
                  (method.definition.schema === 'knowlab/method-definition/v3' &&
                    !method.definition.inputs[slot].required)
                  ? 'slotOptional'
                  : 'slotRequired',
              )}
            </span>
            <select
              aria-label={t('input', { slot })}
              className={SELECT}
              value={inputs[slot] ?? ''}
              onChange={(e) => setInputs({ ...inputs, [slot]: e.target.value })}
            >
              <option value="">{t('chooseInput')}</option>
              {sources.map((source) => (
                <option value={source.id} key={source.id}>
                  {source.title || source.id}
                </option>
              ))}
            </select>
          </label>
        ))}
        {slots.length > 0 && sources.length === 0 ? <p>{t('noInput')}</p> : null}
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          {t('required')}
        </label>
        <label className="block">
          {t('maxCalls')}
          <input
            className={INPUT}
            type="number"
            min={1}
            max={callLimit}
            value={maxCalls}
            onChange={(e) => {
              const value = Number(e.target.value)
              if (Number.isInteger(value) && value >= 1 && value <= callLimit) setMaxCalls(value)
            }}
          />
        </label>
      </fieldset>
      {error ? (
        <p role="alert" className="text-destructive">
          {t(error === 'workdraft_revision' ? 'conflict' : 'failed', { code: error })}
        </p>
      ) : null}
      {checked ? <p role="status">{t('previewReady')}</p> : null}
      <div className="flex gap-2">
        <Button variant="outline" disabled={!valid || working} onClick={() => void run(false)}>
          {t('preview')}
        </Button>
        <Button disabled={!valid || working || !checked} onClick={() => void run(true)}>
          {t(currentRef ? 'replace' : 'bind')}
        </Button>
      </div>
    </div>
  )
}
