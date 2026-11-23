'use client'

import { useTranslations } from 'next-intl'
import type { FormalDefinition } from '@/contracts/formal-methods'

/** Bind scalar examples by slot; complex or previously authored examples stay intact. */
export function TrialExample({
  definition,
  values,
  assertions,
  success,
  onChange,
}: {
  definition: FormalDefinition
  values: string
  assertions: string
  success: boolean
  onChange: (delta: { values?: string; assertions?: string }) => void
}) {
  const t = useTranslations('methodTemplate')
  const w = useTranslations('workdraft')
  const p = definition.procedure
  const inputs =
    p.kind === 'direct'
      ? p.inputs
      : Object.fromEntries(
          p.steps.flatMap((step) =>
            Object.values(step.inputs).flatMap(({ binding, slot }) =>
              binding.source === 'caller' ? [[binding.name, slot]] : [],
            ),
          ),
        )
  const outputs =
    p.kind === 'direct'
      ? p.outputs
      : Object.fromEntries(
          Object.entries(p.exports).flatMap(([name, exp]) => {
            const slot = p.steps.find((s) => s.id === exp.step)?.outputs[exp.output]
            return slot ? [[name, slot]] : []
          }),
        )
  let given: Record<string, unknown>,
    checks: Array<{ kind: string; pointer: string; value: unknown }>
  try {
    given = JSON.parse(values)
    checks = JSON.parse(assertions)
    if (
      !given ||
      typeof given !== 'object' ||
      Array.isArray(given) ||
      !Array.isArray(checks) ||
      checks.some((r) => !r || typeof r !== 'object')
    )
      return null
  } catch {
    return null
  }
  const field = (
    name: string,
    type: unknown,
    value: unknown,
    set: (value: string | number | boolean | undefined) => void,
    output: boolean,
  ) => {
    if (type === 'boolean' && (value === undefined || typeof value === 'boolean'))
      return (
        <label className="block" key={name}>
          {t(output ? 'sampleOutput' : 'sampleInput')} · {name}
          <select
            className="block w-full rounded border p-2"
            value={value === undefined ? '' : String(value)}
            onChange={(e) => set(e.target.value === '' ? undefined : e.target.value === 'true')}
          >
            <option value="">—</option>
            <option value="true">{w('valueYes')}</option>
            <option value="false">{w('valueNo')}</option>
          </select>
        </label>
      )
    if (
      !['string', 'integer', 'number'].includes(String(type)) ||
      (value !== undefined && typeof value !== 'string' && typeof value !== 'number')
    )
      return null
    const numeric = type !== 'string'
    return (
      <label className="block" key={name}>
        {t(output ? 'sampleOutput' : 'sampleInput')} · {name}
        {numeric ? (
          <input
            className="block w-full rounded border p-2"
            type="number"
            step={type === 'integer' ? 1 : 'any'}
            value={String(value ?? '')}
            onChange={(e) => {
              if (!e.target.value) set(undefined)
              else if (Number.isFinite(e.target.valueAsNumber)) set(e.target.valueAsNumber)
            }}
          />
        ) : (
          <textarea
            className="block w-full rounded border p-2"
            rows={3}
            value={String(value ?? '')}
            onChange={(e) => set(e.target.value || undefined)}
          />
        )}
      </label>
    )
  }
  return (
    <fieldset className="space-y-2">
      <legend>{t('example')}</legend>
      {Object.entries(inputs).map(([name, slot]) =>
        field(
          name,
          slot.schema.type,
          given[name],
          (value) => {
            const next = { ...given, [name]: value }
            onChange({ values: JSON.stringify(next) })
          },
          false,
        ),
      )}
      {success &&
        Object.entries(outputs).map(([name, slot]) => {
          const pointer = '/' + name
          const index = checks.findIndex((r) => r.kind === 'equals' && r.pointer === pointer)
          return field(
            name,
            slot.schema.type,
            checks[index]?.value,
            (value) => {
              const next = [...checks]
              if (value === undefined) {
                if (index >= 0) next.splice(index, 1)
              } else if (index < 0) next.push({ kind: 'equals', pointer, value })
              else next[index] = { kind: 'equals', pointer, value }
              onChange({ assertions: JSON.stringify(next) })
            },
            true,
          )
        })}
    </fieldset>
  )
}
