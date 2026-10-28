'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Preview } from '@/contracts/workdraft'
import { fetchDetail } from '@/lib/knowbots/client'

import { SELECT, useProblemText } from './workdraft-cells'
import { KEY } from './shared'

// 工作稿顶上几个按钮弹出的面板（专家孵化方案第六、十节）：预览清单、导入专家包、从我的准专家复制。

/** 弹出的一块：有标题、能关上（Esc 也能关）。 */
export function Panel({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const t = useTranslations('workdraft.preview')
  const id = useId()
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={id}
      className="bg-card space-y-3 rounded-xl border p-4 text-sm shadow-md"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="flex items-center gap-2">
        <h2 id={id} className="font-medium">
          {title}
        </h2>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
      {children}
    </div>
  )
}

/** 预览清单：编出的清单 JSON 与出不了版本的地方。 */
export function PreviewPanel({
  preview,
  failed,
  onClose,
}: {
  preview: Preview | undefined
  failed: boolean
  onClose: () => void
}) {
  const t = useTranslations('workdraft.preview')
  const text = useProblemText()
  return (
    <Panel title={t('title')} onClose={onClose}>
      {failed ? (
        <p role="alert" className="text-destructive">
          {t('failed')}
        </p>
      ) : !preview ? (
        <p className="text-muted-foreground">{t('loading')}</p>
      ) : (
        <>
          <p>{t('version', { version: preview.version })}</p>
          {preview.problems.length ? (
            <div className="space-y-1">
              <p className="text-destructive font-medium">
                {t('problems', { count: preview.problems.length })}
              </p>
              <ul className="text-destructive list-disc space-y-0.5 pl-5 text-xs">
                {preview.problems.map((p, i) => (
                  <li key={i}>
                    {p.path ? <code className="mr-1">{p.path}</code> : null}
                    {text(p)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-emerald-700 dark:text-emerald-400">{t('none')}</p>
          )}
          <pre
            className="bg-muted max-h-96 overflow-auto rounded-md p-2 text-xs"
            data-testid="preview-manifest"
          >
            {JSON.stringify(preview.manifest, null, 2)}
          </pre>
        </>
      )}
    </Panel>
  )
}

/** 导入专家包：贴或选一份清单 v2 JSON。 */
export function ImportPanel({
  busy,
  error,
  onImport,
  onClose,
}: {
  busy: boolean
  error: string | null
  onImport: (manifest: Record<string, unknown>) => void
  onClose: () => void
}) {
  const t = useTranslations('workdraft.import')
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const submit = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
    const ok = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    setBad(!ok)
    if (ok) onImport(parsed as Record<string, unknown>)
  }
  return (
    <Panel title={t('title')} onClose={onClose}>
      <p className="text-muted-foreground">{t('hint')}</p>
      <label className="block">
        <span className="text-xs">{t('file')}</span>
        <input
          type="file"
          accept="application/json,.json"
          className="mt-1 block text-xs"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) setText(await file.text())
          }}
        />
      </label>
      <label className="block">
        <span className="text-xs">{t('text')}</span>
        <textarea
          className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {bad ? (
        <p role="alert" className="text-destructive">
          {t('badJson')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <Button size="sm" disabled={busy || !text.trim()} onClick={submit}>
        {t('submit')}
      </Button>
    </Panel>
  )
}

/** 从我的准专家复制：列这个名称下我的准专家，选一位作起点。 */
export function CopyPanel({
  requestId,
  busy,
  error,
  onCopy,
  onClose,
}: {
  requestId: string
  busy: boolean
  error: string | null
  onCopy: (draftId: string) => void
  onClose: () => void
}) {
  const t = useTranslations('workdraft.copy')
  const tk = useTranslations('knowbots')
  const detail = useQuery({
    queryKey: [...KEY, 'detail', requestId],
    queryFn: () => fetchDetail(requestId),
  })
  const [picked, setPicked] = useState('')
  const drafts = [...(detail.data?.drafts ?? [])].reverse()
  return (
    <Panel title={t('title')} onClose={onClose}>
      <p className="text-muted-foreground">{t('hint')}</p>
      {detail.isPending ? (
        <p className="text-muted-foreground">{tk('loading')}</p>
      ) : drafts.length === 0 ? (
        <p className="text-muted-foreground">{t('none')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t('label')}
            className={SELECT}
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
          >
            <option value="">{t('choose')}</option>
            {drafts.map((d) => (
              <option key={d.draft_id} value={d.draft_id}>
                {tk('draftLabel', { label: d.label })}
                {d.name ? ` · ${d.name}` : ''}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={busy || !picked} onClick={() => onCopy(picked)}>
            {t('submit')}
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </Panel>
  )
}
