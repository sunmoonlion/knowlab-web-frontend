'use client'

import { useTranslations } from 'next-intl'

type Rule = { column: string; type: 'text' | 'number' | 'boolean'; value: string }
export type RowConditions = string | Rule[]

export function selectedRowConditions(input: RowConditions) {
  if (typeof input === 'string') return input.trim() ? JSON.parse(input) : undefined
  if (!input.length) return undefined
  if (new Set(input.map((r) => r.column)).size !== input.length) throw Error('Duplicate column')
  return Object.fromEntries(
    input.map((r) => {
      if (!r.column.trim()) throw Error('Missing column')
      if (r.type === 'number' && (!r.value.trim() || !Number.isFinite(Number(r.value))))
        throw Error('Invalid number')
      return [
        r.column,
        r.type === 'number' ? Number(r.value) : r.type === 'boolean' ? r.value === 'true' : r.value,
      ]
    }),
  )
}

export function RowConditionFields({
  value,
  onChange,
}: {
  value: RowConditions
  onChange: (v: RowConditions) => void
}) {
  const t = useTranslations('knowbotRequests.form')
  let rules: Rule[] = []
  try {
    if (typeof value === 'string') {
      const parsed: unknown = selectedRowConditions(value)
      if (parsed !== undefined) {
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error()
        rules = Object.entries(parsed).map(([column, v]) => {
          if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean')
            throw Error()
          return {
            column,
            type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'text',
            value: String(v),
          }
        })
      }
    } else {
      rules = value
    }
  } catch {
    if (typeof value === 'string')
      return (
        <div>
          <p>{t('rowInvalid')}</p>
          <button type="button" onClick={() => onChange([])}>
            {t('replaceRow')}
          </button>
        </div>
      )
  }
  const field = 'rounded border p-1'
  const update = (i: number, rule: Rule) => onChange(rules.map((r, j) => (j === i ? rule : r)))
  return (
    <fieldset className="space-y-2">
      <legend>{t('selectRow')}</legend>
      {rules.map((r, i) => (
        <div key={i} className="flex flex-wrap gap-2">
          <label>
            {t('rowColumn')}
            <input
              className={field}
              value={r.column}
              onChange={(e) => update(i, { ...r, column: e.target.value })}
            />
          </label>
          <select
            aria-label={t('rowType')}
            className={field}
            value={r.type}
            onChange={(e) => {
              const type = e.target.value as Rule['type']
              update(i, { ...r, type, value: type === 'boolean' ? 'true' : r.value })
            }}
          >
            {(['text', 'number', 'boolean'] as const).map((type) => (
              <option key={type} value={type}>
                {t(type)}
              </option>
            ))}
          </select>
          <label>
            {t('rowValue')}
            {r.type === 'boolean' ? (
              <select
                value={r.value}
                className={field}
                onChange={(e) => update(i, { ...r, value: e.target.value })}
              >
                <option value="true">{t('yes')}</option>
                <option value="false">{t('no')}</option>
              </select>
            ) : (
              <input
                className={field}
                value={r.value}
                onChange={(e) => update(i, { ...r, value: e.target.value })}
              />
            )}
          </label>
          <button type="button" onClick={() => onChange(rules.filter((_, j) => i !== j))}>
            {t('removeRule')}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={rules.length >= 8}
        onClick={() => onChange([...rules, { column: '', type: 'text', value: '' }])}
      >
        {t('addRule')}
      </button>
    </fieldset>
  )
}
