'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { CrossAppLink } from '@/components/common/cross-app-link'
import { fetchLibrary } from '@/lib/knowbots/client'

import { Badge, Card, KEY } from './shared'
import { describe } from './workdraft-data'

// 知识库（SDD 0046 第六节，右边结果的一栏）：只列你在 knowbase 展示给 knowlab 的资料，在 knowbase 管——
// 上传、改描述、展示给哪里、许可档都在 knowbase，这里不改。孵化时在工作稿的「数据」一栏从这批里挑。

function size(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function KnowledgeView() {
  const t = useTranslations('knowbots.knowledge')
  const library = useQuery({ queryKey: [...KEY, 'library'], queryFn: fetchLibrary })
  const manage = (
    <CrossAppLink
      to="knowbase.library"
      className="font-medium underline underline-offset-2"
      fallback={<span className="text-muted-foreground">{t('manageHint')}</span>}
    >
      {t('manage')}
    </CrossAppLink>
  )
  return (
    <div className="mt-6 space-y-4">
      <p>{manage}</p>
      {library.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {t('loadFailed')}
        </p>
      ) : library.isPending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : library.data.length === 0 ? (
        <Card>
          <p className="text-muted-foreground">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="space-y-2" data-testid="knowledge-list">
          {library.data.map((m) => (
            <li key={m.material_id} className="bg-card rounded-lg border p-3 text-sm">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{m.name}</span>
                {m.description.status === 'unconfirmed' ? (
                  <Badge tone="todo">{t('unconfirmed')}</Badge>
                ) : null}
                {!m.mine ? <Badge tone="muted">{t('notMine')}</Badge> : null}
              </span>
              <span className="text-muted-foreground mt-1 block text-xs">
                {[
                  describe(m.description),
                  m.version_no ? t('version', { n: m.version_no }) : '',
                  size(m.size_bytes),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
