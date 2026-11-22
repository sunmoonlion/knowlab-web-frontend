'use client'

import { useTranslations } from 'next-intl'

export function StructuredValue({
  value,
  label,
  labels = {},
  onChange,
}: {
  value: unknown
  label: string
  labels?: Record<string, string>
  onChange?: (v: unknown) => void
}) {
  const t = useTranslations('workdraft')
  if (Array.isArray(value))
    return (
      <ol className="list-decimal pl-5">
        {value.map((v, i) => (
          <li key={i}>
            <StructuredValue
              labels={labels}
              label={label}
              value={v}
              onChange={
                onChange && ((next) => onChange(value.map((entry, j) => (j === i ? next : entry))))
              }
            />
          </li>
        ))}
      </ol>
    )
  if (value !== null && typeof value === 'object') {
    return (
      <dl>
        {Object.entries(value).map(([key, v]) => (
          <div key={key}>
            <dt className="font-medium">{Object.hasOwn(labels, key) ? labels[key] : key}</dt>
            <dd className="pl-3">
              <StructuredValue
                labels={labels}
                label={Object.hasOwn(labels, key) ? labels[key] : key}
                value={v}
                onChange={onChange && ((next) => onChange({ ...value, [key]: next }))}
              />
            </dd>
          </div>
        ))}
      </dl>
    )
  }
  if (onChange && typeof value === 'boolean')
    return (
      <input
        type="checkbox"
        aria-label={label}
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    )
  if (onChange && typeof value === 'number')
    return (
      <input
        type="number"
        aria-label={label}
        value={value}
        onChange={(e) => {
          if (Number.isFinite(e.target.valueAsNumber)) onChange(e.target.valueAsNumber)
        }}
      />
    )
  if (onChange && typeof value === 'string')
    return <textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  return (
    <span>
      {typeof value === 'boolean' ? t(value ? 'valueYes' : 'valueNo') : String(value ?? '—')}
    </span>
  )
}
