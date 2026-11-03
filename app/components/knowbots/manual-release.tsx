'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { Detail, Draft, Test } from '@/contracts/knowbots'
import { fetchManualReleases, requestManualRelease } from '@/lib/knowbots/manual-release'
import { Button } from '@/components/ui/button'
import { Card, KEY } from './shared'

export function ManualReleaseRequest({ life, csrfToken }: { life: Detail; csrfToken: string }) {
  const t = useTranslations('knowbots.manualRelease')
  const [open, setOpen] = useState(false)
  const requests = useQuery({
    enabled: open,
    queryKey: [...KEY, 'manual-releases'],
    queryFn: fetchManualReleases,
  })
  const latest = life.drafts.at(-1)
  const baselines = life.tests.filter(
    (test) =>
      test.status === 'passed' &&
      life.drafts.some((d) => d.draft_id === test.draft_id && d.revision < (latest?.revision ?? 0)),
  )
  const history = requests.data?.filter((r) => r.request_id === life.request_id) ?? []
  const eligible =
    latest?.status === 'pending_test' &&
    latest.manifest_sha256 &&
    baselines.length > 0 &&
    !life.tests.some(
      (x) => ['queued', 'running', 'waiting'].includes(x.status) || x.draft_id === latest.draft_id,
    ) &&
    !life.experts.some((e) => e.draft_id === latest.draft_id) &&
    !history.some((r) => r.draft_id === latest.draft_id)
  if (
    !eligible &&
    history.length === 0 &&
    !life.experts.some((e) => e.manual_release) &&
    !requests.isError
  )
    return null
  return (
    <details
      className="rounded-lg border p-4 text-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">{t('title')}</summary>
      <p className="my-2">{t('lead')}</p>
      {requests.isError ? <p role="alert">{t('failed')}</p> : null}
      {eligible && !requests.isPending && !requests.isError ? (
        <RequestForm key={latest.draft_id} draft={latest} tests={baselines} csrfToken={csrfToken} />
      ) : null}
      {history.map((r) => (
        <Card key={r.id} title={t(r.status)}>
          <p>{t('notice')}</p>
          <p>{r.reason}</p>
          <p>{r.decision_reason}</p>
          <p>
            {t('digest')}: <code className="break-all">{r.manifest_sha256}</code>
          </p>
        </Card>
      ))}
    </details>
  )
}
function RequestForm({
  draft,
  tests,
  csrfToken,
}: {
  draft: Draft
  tests: Test[]
  csrfToken: string
}) {
  const t = useTranslations('knowbots.manualRelease')
  const cache = useQueryClient()
  const [baseline, setBaseline] = useState(tests.at(-1)?.test_id ?? '')
  const [fields, setFields] = useState({
    reason: '',
    change_summary: '',
    verification: '',
    limitations: '',
  })
  const [agree, setAgree] = useState(false)
  const mutation = useMutation({
    mutationFn: () =>
      requestManualRelease(
        draft.draft_id,
        {
          ...fields,
          baseline_test_id: baseline,
          manifest_sha256: draft.manifest_sha256!,
          authorize_reviewer: true,
          acknowledge_unretested: true,
        },
        csrfToken,
      ),
    onSuccess: () => cache.invalidateQueries({ queryKey: KEY }),
  })
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (agree && !mutation.isPending) mutation.mutate()
      }}
    >
      <p>{t('draft', { label: draft.label })}</p>
      <label className="block">
        {t('baseline')}
        <select
          value={baseline}
          onChange={(e) => setBaseline(e.target.value)}
          className="block rounded border p-2"
        >
          {tests.map((test) => (
            <option key={test.test_id} value={test.test_id}>
              {t('test', { number: test.number, label: test.label ?? '—' })}
            </option>
          ))}
        </select>
      </label>
      {(Object.keys(fields) as (keyof typeof fields)[]).map((key) => (
        <label className="block" key={key}>
          {t(key)}
          <textarea
            required
            maxLength={key === 'reason' ? 2000 : 4000}
            className="block w-full rounded border p-2"
            value={fields[key]}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
          />
        </label>
      ))}
      <label className="flex gap-2">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        {t('consent')}
      </label>
      {mutation.isError ? <p role="alert">{t('failed')}</p> : null}
      <Button
        type="submit"
        disabled={
          !agree || !baseline || Object.values(fields).some((s) => !s.trim()) || mutation.isPending
        }
      >
        {t('submit')}
      </Button>
    </form>
  )
}
