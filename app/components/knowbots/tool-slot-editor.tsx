'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { formalValueSlotSchema, type FormalDefinition } from '@/contracts/formal-methods'

type Direct = Extract<FormalDefinition['procedure'], { kind: 'direct' }>
type Slot = Direct['inputs'][string]

export function ToolSlotEditor({
  tool,
  onChange,
}: {
  tool: Direct
  onChange: (v: Direct) => void
}) {
  const t = useTranslations('formalMethod')
  const [direction, setDirection] = useState<'inputs' | 'outputs'>('inputs')
  const [selected, setSelected] = useState('')
  const current = tool[direction][selected]
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend>{t('editSlots')}</legend>
      <label>
        {t('slotDirection')}{' '}
        <select
          value={direction}
          onChange={(e) => {
            setDirection(e.target.value as typeof direction)
            setSelected('')
          }}
        >
          <option value="inputs">{t('inputs')}</option>
          <option value="outputs">{t('outputs')}</option>
        </select>
      </label>
      <label>
        {t('slotName')}{' '}
        <select value={current ? selected : ''} onChange={(e) => setSelected(e.target.value)}>
          <option value="">{t('newSlot')}</option>
          {Object.keys(tool[direction]).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <SlotFields
        key={[direction, selected, JSON.stringify(current)].join(':')}
        name={current ? selected : ''}
        slot={current}
        available={(n) => n === selected || !Object.hasOwn(tool[direction], n)}
        onAdopt={(name, value) => {
          onChange({ ...tool, [direction]: { ...tool[direction], [name]: value } })
          setSelected(name)
        }}
      />
    </fieldset>
  )
}
function SlotFields({
  name,
  slot,
  available,
  onAdopt,
}: {
  name: string
  slot?: Slot
  available: (n: string) => boolean
  onAdopt: (n: string, v: Slot) => void
}) {
  const t = useTranslations('formalMethod')
  const [id, setId] = useState(name),
    [description, setDescription] = useState(slot?.description ?? '')
  const [schema, setSchema] = useState(JSON.stringify(slot?.schema ?? { type: 'string' }))
  const [meaning, setMeaning] = useState(JSON.stringify(slot?.meaning ?? {}))
  const [required, setRequired] = useState(slot?.required ?? true)
  const [missing, setMissing] = useState<Slot['on_missing']>(slot?.on_missing ?? 'fail')
  let value: Slot | null = null
  try {
    const r = formalValueSlotSchema.safeParse({
      description,
      schema: JSON.parse(schema),
      meaning: JSON.parse(meaning),
      required,
      on_missing: missing,
    })
    if (r.success && (!required || missing !== 'omit')) value = r.data
  } catch {
    /* A partially edited JSON value stays local until adopted. */
  }
  return (
    <div className="grid gap-2 text-sm">
      <label>
        {t('slotId')} <input value={id} disabled={!!name} onChange={(e) => setId(e.target.value)} />
      </label>
      <label>
        {t('slotDescription')}{' '}
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        {t('slotPreset')}{' '}
        <select value="" onChange={(e) => setSchema(JSON.stringify({ type: e.target.value }))}>
          <option value="" disabled>
            {t('slotPreset')}
          </option>
          {['string', 'integer', 'number', 'boolean', 'object', 'array'].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        JSON Schema <textarea value={schema} onChange={(e) => setSchema(e.target.value)} />
      </label>
      <label>
        {t('slotMeaning')} <textarea value={meaning} onChange={(e) => setMeaning(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />{' '}
        {t('slotRequired')}
      </label>
      <label>
        {t('slotMissing')}{' '}
        <select value={missing} onChange={(e) => setMissing(e.target.value as typeof missing)}>
          {['fail', 'pause', 'omit'].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={!value || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id) || !available(id)}
        onClick={() => value && onAdopt(id, value)}
      >
        {t('adoptSlot')}
      </Button>
    </div>
  )
}
