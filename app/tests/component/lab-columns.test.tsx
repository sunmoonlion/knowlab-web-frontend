import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KnowledgeView } from '@/components/knowbots/knowledge-view'
import { fetchLibrary } from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'
import { renderWith } from './knowbot-fixtures'
vi.mock('@/lib/knowbots/client', () => ({ fetchLibrary: vi.fn() }))
const k = messages.knowbots

describe('知识库栏', () => {
  it('只列展示给 knowlab 的资料；没有时说去 knowbase 打开', async () => {
    vi.mocked(fetchLibrary).mockResolvedValue([
      {
        material_id: 'm1',
        name: '2024 年报.pdf',
        mine: true,
        description: {
          subject: '600519.SH',
          doc_type: 'annual_report',
          period_start: '2024-01-01',
          period_end: '2024-12-31',
          status: 'unconfirmed',
        },
        version_no: 2,
        size_bytes: 2048,
      },
    ])
    const { unmount } = renderWith(<KnowledgeView />)
    const list = within(await screen.findByTestId('knowledge-list'))
    expect(list.getByText('2024 年报.pdf')).toBeInTheDocument()
    expect(list.getByText(k.knowledge.unconfirmed)).toBeInTheDocument()
    expect(
      list.getByText(/600519\.SH · annual_report · 2024-01-01 ~ 2024-12-31 · 第 2 版/),
    ).toBeInTheDocument()
    unmount()
    vi.mocked(fetchLibrary).mockResolvedValue([])
    renderWith(<KnowledgeView />)
    expect(await screen.findByText(k.knowledge.empty)).toBeInTheDocument()
  })
})
