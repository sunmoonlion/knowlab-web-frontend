import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MyData } from '@/components/knowbots/my-data'
import { ApiClientError } from '@/lib/common/api-client'
import { deleteDataset, fetchMyData, uploadDataset } from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

vi.mock('@/lib/knowbots/client', () => ({
  fetchMyData: vi.fn(),
  uploadDataset: vi.fn(),
  deleteDataset: vi.fn(),
}))

const CSRF = 'csrf-token-value-that-is-long-enough-1234'
const DATASET = {
  dataset_id: '3b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
  name: '年报.pdf',
  version: '1',
  content_type: 'application/pdf',
  size_bytes: 2 * 1024 * 1024,
  sha256: 'a'.repeat(64),
  created_at: null,
}
const MINE = {
  contract_version: 1 as const,
  datasets: [DATASET],
  used_bytes: 2 * 1024 * 1024,
  quota_bytes: 1024 ** 3,
  max_file_bytes: 50 * 1024 * 1024,
}

function problem(status: number, code: string) {
  return new ApiClientError(status, {
    code,
    message_key: 'x',
    retryable: false,
    correlation_id: 'c',
  })
}

function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh-CN" messages={messages}>
        <MyData csrfToken={CSRF} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(fetchMyData).mockReset().mockResolvedValue(MINE)
  vi.mocked(uploadDataset).mockReset()
  vi.mocked(deleteDataset).mockReset()
})

describe('我的数据', () => {
  it('lists my data with usage and uploads a chosen file', async () => {
    vi.mocked(uploadDataset).mockResolvedValue(DATASET)
    page()
    expect(await screen.findByText('年报.pdf')).toBeInTheDocument()
    expect(screen.getByText('已用 2.0 MB，上限 1.0 GB')).toBeInTheDocument()
    const file = new File(['%PDF-1.7'], '新的.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('选择要上传的文件'), { target: { files: [file] } })
    await waitFor(() => expect(uploadDataset).toHaveBeenCalledWith(file, CSRF))
  })

  it('explains refusals in plain words', async () => {
    vi.mocked(uploadDataset).mockRejectedValue(problem(400, 'dataset_type_not_allowed'))
    vi.mocked(deleteDataset).mockRejectedValue(problem(409, 'dataset_in_use'))
    page()
    await screen.findByText('年报.pdf')
    fireEvent.change(screen.getByLabelText('选择要上传的文件'), {
      target: { files: [new File(['MZ'], 'a.exe')] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('只收 PDF、Excel、CSV、文本文件')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('有在做的或已交付的专家用着这份数据'),
    )
    expect(deleteDataset).toHaveBeenCalledWith(DATASET.dataset_id, CSRF)
  })
})
