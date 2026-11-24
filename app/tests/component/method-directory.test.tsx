import { fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DraftMethodDirectory, MethodDirectory } from '@/components/knowbots/method-directory'
import * as api from '@/lib/knowbots/formal-methods'
import zh from '@/messages/zh-CN.json'
import { REQUEST, renderWith } from './knowbot-fixtures'

afterEach(() => vi.restoreAllMocks())

it('browses the same version on the homepage and in a draft and requires an explicit pick', async () => {
  const reference = { method_id: REQUEST, version: 2, digest: 'sha256:' + 'a'.repeat(64) }
  const title = '期初余额连续性核验'
  const list = vi.spyOn(api, 'listFormalMethods').mockResolvedValue([
    {
      method_id: reference.method_id,
      latest_version: reference.version,
      digest: reference.digest,
      method_kind: 'tool',
      title,
      summary: '比较两期原行',
      created_at: '2026-11-24',
    },
  ])
  const facets = [
    {
      code: 'financial.reconciliation',
      name: '报表勾稽',
      group: 'financial',
      group_name: '财务核验',
      count: 1,
    },
  ]
  const response = {
    categories: facets,
    total: 1,
    next: null,
    items: [
      {
        method_id: reference.method_id,
        latest_version: reference.version,
        digest: reference.digest,
        method_kind: 'tool' as const,
        title,
        summary: '核对',
        category: 'financial.reconciliation',
        usable: true,
      },
    ],
  }
  const browse = vi.spyOn(api, 'browseIncubationDirectory').mockResolvedValue(response)
  const home = renderWith(<MethodDirectory />)
  expect(await screen.findByText(title)).toBeVisible()
  expect(list).toHaveBeenCalledWith(0, undefined)
  expect(screen.queryByText(zh.methodDirectory.pick)).toBeNull()

  fireEvent.change(screen.getByLabelText(zh.directoryFacets.kind), { target: { value: 'tool' } })
  await screen.findByRole('option', { name: '财务核验' })
  fireEvent.change(screen.getByLabelText(zh.directoryFacets.group), {
    target: { value: 'financial' },
  })
  await screen.findByRole('option', { name: '报表勾稽' })
  fireEvent.change(screen.getByLabelText(zh.directoryFacets.category), {
    target: { value: 'financial.reconciliation' },
  })
  expect(await screen.findByText('共 1 项')).toBeVisible()
  expect(browse).toHaveBeenLastCalledWith(
    'owned',
    { kind: 'tool', group: 'financial', category: 'financial.reconciliation' },
    0,
    undefined,
  )
  home.unmount()
  const pick = vi.fn()
  renderWith(<DraftMethodDirectory requestId={REQUEST} revision={3} onPick={pick} />)
  fireEvent.click(screen.getByRole('button', { name: zh.methodDirectory.title }))
  expect(await screen.findByText(title)).toBeVisible()
  expect(list).toHaveBeenCalledWith(0, REQUEST)
  expect(pick).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: zh.methodDirectory.pick }))
  expect(pick).toHaveBeenCalledWith({ reference, title })
  vi.spyOn(api, 'sharedIncubationTools').mockResolvedValue({
    items: [{ reference, title: '共享核验', scope: 'acquired', installations: [], selected: null }],
    next: null,
  })
  fireEvent.click(screen.getByRole('button', { name: zh.methodDirectory.shared }))
  expect(await screen.findByText(zh.methodDirectory.needsInstallation)).toBeVisible()
  expect(screen.queryByRole('button', { name: zh.methodDirectory.pick })).toBeNull()
})
