'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { fetchLibrary } from '@/lib/knowbots/client'
import { checkSampleColumn } from '@/lib/knowbots/formal-methods'

export function SampleColumnCheck({
  requestId,
  csrfToken,
  onClose,
  onMissing,
}: {
  requestId: string
  csrfToken: string
  onClose: () => void
  onMissing: () => void
}) {
  const t = useTranslations('formalMethod')
  const library = useQuery({
    queryKey: ['sample-column-library', requestId],
    queryFn: fetchLibrary,
    retry: false,
    gcTime: 0,
  })
  const [selected, setSelected] = useState('')
  const [sheet, setSheet] = useState('')
  const [column, setColumn] = useState('')
  const [attempt, setAttempt] = useState('')
  const keyOf = (item: {
    material_id: string
    version_no?: number | null
    sha256?: string | null
  }) => JSON.stringify([item.material_id, item.version_no, item.sha256])
  const versions = library.data?.filter((item) => item.version_no && item.sha256) ?? []
  const material = versions.find((item) => keyOf(item) === selected)
  const pin =
    material?.version_no && material.sha256 && column.trim()
      ? {
          material_id: material.material_id,
          version_no: material.version_no,
          sha256: material.sha256,
          sheet,
          column: column.trim(),
        }
      : null
  const check = useQuery({
    queryKey: ['sample-column-check', requestId, pin, attempt],
    enabled: !!pin && !!attempt,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => checkSampleColumn(requestId, pin!, csrfToken, signal),
  })
  const receipt = check.data
  return (
    <fieldset className="grid gap-2 rounded border p-3">
      <legend>{t('sampleCheck')}</legend>
      <label>
        {t('sampleVersion')}{' '}
        <select
          value={material ? selected : ''}
          onChange={(e) => {
            setAttempt('')
            setSelected(e.target.value)
            setSheet('')
          }}
        >
          <option value="">—</option>
          {versions.map((item) => (
            <option key={keyOf(item)} value={keyOf(item)}>
              {item.name} · v{item.version_no}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('sampleSheet')}{' '}
        <input
          maxLength={255}
          value={sheet}
          onChange={(e) => {
            setAttempt('')
            setSheet(e.target.value)
          }}
        />
      </label>
      <label>
        {t('sampleColumn')}{' '}
        <input
          maxLength={200}
          value={column}
          onChange={(e) => {
            setAttempt('')
            setColumn(e.target.value)
          }}
        />
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={!pin || check.isFetching}
        onClick={() => setAttempt(crypto.randomUUID())}
      >
        {t('sampleRead')}
      </Button>
      {library.isPending || check.isFetching ? <p role="status">{t('loading')}</p> : null}
      {library.isSuccess && !versions.length && <p>{t('sampleEmpty')}</p>}
      {(library.isError || check.isError) && <p role="alert">{t('sampleError')}</p>}
      {receipt && (
        <p role="status">
          {t(
            receipt.status === 'present'
              ? 'samplePresent'
              : receipt.status === 'missing'
                ? 'sampleMissing'
                : 'sampleUnknown',
          )}{' '}
          · v{receipt.version_no} · {receipt.sha256}
        </p>
      )}
      {receipt?.status === 'missing' && (
        <Button type="button" onClick={onMissing}>
          {t('sampleBridge')}
        </Button>
      )}
      <Button type="button" variant="outline" onClick={onClose}>
        {t('sampleBack')}
      </Button>
    </fieldset>
  )
}
