'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ApiClientError } from '@/lib/common/api-client'
import { deleteDataset, fetchMyData, uploadDataset } from '@/lib/knowbots/client'

const KEY = ['web', 'knowbot-datasets'] as const
const ACCEPT = '.pdf,.xlsx,.xls,.csv,.txt,.md'

function size(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// 知识库（SDD 0027 决定 4、SDD 0042 第七节，10-23 前叫「我的数据」）：只用于测试你的创意。只收 PDF、Excel、CSV、文本，
// 单个不超过 50 MB，一共不超过 1 GB；在做的或已交付的分身用着的不能删。
export function MyData({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('knowbotData')
  const client = useQueryClient()
  const list = useQuery({ queryKey: KEY, queryFn: fetchMyData })
  const input = useRef<HTMLInputElement>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const onError = (error: unknown) => {
    const code = error instanceof ApiClientError ? error.problem.code : ''
    setFailed(t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.other'))
  }
  const refresh = () => client.invalidateQueries({ queryKey: KEY })
  const upload = useMutation({
    mutationFn: (file: File) => uploadDataset(file, csrfToken),
    onSuccess: refresh,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteDataset(id, csrfToken),
    onSuccess: refresh,
    onError,
  })

  return (
    <section className="mt-8 space-y-3" aria-label={t('title')}>
      <h2 className="font-medium">{t('title')}</h2>
      <p className="text-muted-foreground text-sm">{t('intro')}</p>
      <p className="text-muted-foreground text-sm">{t('tableHint')}</p>
      {list.isPending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : list.isError ? (
        <p className="text-destructive text-sm">{t('loadFailed')}</p>
      ) : (
        <>
          <p className="text-sm">
            {t('usage', { used: size(list.data.used_bytes), quota: size(list.data.quota_bytes) })}
          </p>
          {list.data.datasets.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('empty')}</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {list.data.datasets.map((d) => (
                <li
                  key={d.dataset_id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate">
                    {d.name}
                    <span className="text-muted-foreground"> · {size(d.size_bytes)}</span>
                    {d.no_resale ? (
                      <span className="text-muted-foreground"> · {t('noResale')}</span>
                    ) : null}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => {
                      setFailed(null)
                      remove.mutate(d.dataset_id)
                    }}
                  >
                    {t('delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {failed}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="sr-only">{t('choose')}</span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          aria-label={t('choose')}
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setFailed(null)
            upload.mutate(file, {
              onSettled: () => {
                if (input.current) input.current.value = ''
              },
            })
          }}
        />
      </label>
      {upload.isPending ? <p className="text-muted-foreground text-sm">{t('uploading')}</p> : null}
    </section>
  )
}
