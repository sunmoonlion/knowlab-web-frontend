'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CORE_14_FINANCIAL_METHODS } from '@/lib/knowbots/methods'
import type { MethodReference, Step } from '@/contracts/workdraft'

export function MethodPickerModal({
  step,
  earlier,
  currentRef,
  onSelectMethod,
  onClose,
}: {
  step: Step
  earlier: Step[]
  currentRef?: MethodReference
  onSelectMethod: (ref: MethodReference) => void
  onClose: () => void
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [activeMethodId, setActiveMethodId] = useState<string>(
    currentRef ? currentRef.method_id : CORE_14_FINANCIAL_METHODS[0].id
  )
  const [slotMapping, setSlotMapping] = useState<Record<string, string>>(
    currentRef ? { ...currentRef.inputs } : {}
  )

  const categories = [
    { id: 'all', label: '全部方法 (14)' },
    { id: 'accounting', label: '三表与勾稽' },
    { id: 'profitability', label: '盈利与杜邦' },
    { id: 'solvency', label: '偿债与流动性' },
    { id: 'efficiency', label: '营运与CCC' },
    { id: 'quality', label: '收益质量' },
    { id: 'valuation', label: '估值模型' },
    { id: 'strategy', label: '竞争与护城河' },
  ]

  const filtered = selectedCategory === 'all'
    ? CORE_14_FINANCIAL_METHODS
    : CORE_14_FINANCIAL_METHODS.filter((m) => m.category === selectedCategory)

  const active = CORE_14_FINANCIAL_METHODS.find((m) => m.id === activeMethodId) || CORE_14_FINANCIAL_METHODS[0]

  const handleApply = () => {
    // Generate synthetic digest for demo / assembly preview
    const fakeDigest = currentRef?.digest || `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
    const ref: MethodReference = {
      method_id: active.id.length === 36 ? active.id : '00000000-0000-0000-0000-000000000001',
      version: currentRef?.version || 1,
      digest: fakeDigest,
      inputs: {
        [active.slot]: slotMapping[active.slot] || (earlier[0] ? earlier[0].id : 'intake'),
      },
    }
    onSelectMethod(ref)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[680px] w-[960px] flex-col rounded-xl bg-white shadow-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              装配作者方法库 (不可变版本)
            </h3>
            <p className="text-xs text-zinc-500">
              精确绑定作者已冻结的方法版本，不可篡改方法正文与工具权限。
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        {/* Categories Bar */}
        <div className="flex gap-2 border-b bg-zinc-50/50 px-6 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategory === c.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="grid flex-1 grid-cols-12 overflow-hidden">
          {/* Method List */}
          <div className="col-span-5 overflow-y-auto border-r p-4 dark:border-zinc-800">
            <div className="space-y-2">
              {filtered.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setActiveMethodId(m.id)}
                  className={`cursor-pointer rounded-lg border p-3 transition-all ${
                    activeMethodId === m.id
                      ? 'border-blue-500 bg-blue-50/50 dark:border-blue-500/50 dark:bg-blue-950/20'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      {m.title}
                    </span>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      v1
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-[11px] text-zinc-500">{m.provenance}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Details & Slot Binding */}
          <div className="col-span-7 flex flex-col justify-between overflow-y-auto p-6">
            <div className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  方法不可变快照预览
                </span>
                <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {active.title}
                </h4>
                <p className="mt-1 text-xs text-zinc-500">出处依据：{active.provenance}</p>
              </div>

              {/* Slot Mapping */}
              <div className="rounded-lg border bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  输入槽映射 (Input Slot Binding)
                </span>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  为方法的独立输入槽匹配专家本地方案中的上游输出步骤。
                </p>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">
                    插槽: <strong className="text-blue-600">{active.slot}</strong>
                  </span>
                  <span className="text-zinc-400">← 映射到 ←</span>
                  <select
                    className="rounded border bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    value={slotMapping[active.slot] || (earlier[0] ? earlier[0].id : '')}
                    onChange={(e) =>
                      setSlotMapping({ ...slotMapping, [active.slot]: e.target.value })
                    }
                  >
                    {earlier.length === 0 ? (
                      <option value="intake">financial_data_intake (前置接入)</option>
                    ) : (
                      earlier.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id} ({s.title || '步骤'})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Outputs Preview */}
              <div>
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  方法固定输出项 (只读)
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {active.outputs.map((out) => (
                    <span
                      key={out}
                      className="rounded border bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {out}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="mt-6 flex justify-end gap-3 border-t pt-4 dark:border-zinc-800">
              <Button variant="outline" size="sm" onClick={onClose}>
                取消
              </Button>
              <Button size="sm" onClick={handleApply}>
                确认装配至当前步骤
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
