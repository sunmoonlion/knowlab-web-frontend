'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { Button } from '@/components/ui/button'

// 工作稿顶上几个按钮弹出的面板（专家孵化方案第六、十节）：预览清单、导入专家包或 skill 当种子、从我的
// 准专家复制。

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
