import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MethodStudioHome } from '@/components/knowbots/method-studio'
import { CSRF, renderWith } from './knowbot-fixtures'

vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())
afterEach(() => vi.restoreAllMocks())

it('cancels without sending a request and deletes only the confirmed same-name draft', async () => {
  const ids = ['12345678-3eb6-4386-981a-680058123f05', 'abcdef01-a154-4f14-ac29-52009ea6bd5a']
  let items = ids.map((method_id) => ({
    method_id,
    request_id: null,
    revision: 1,
    archetype: 'S1',
    method_kind: 'expert',
    title: '三表核验',
    purpose: '核对',
    ready_to_freeze: false,
    updated_at: null,
  }))
  const deletes: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, opts) => {
    if (opts?.method === 'DELETE') {
      deletes.push(String(path))
      expect(new Headers(opts.headers).get('X-CSRF-Token')).toBe(CSRF)
      items = items.filter((d) => d.method_id !== ids[1])
      return new Response(null, { status: 204 })
    }
    return Response.json({ items })
  })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  renderWith(<MethodStudioHome csrfToken={CSRF} />)
  const card = (await screen.findByText(/草稿编号 abcdef01/)).closest('li')!
  const button = within(card).getByRole('button', { name: '删除草稿' })
  fireEvent.click(button)
  expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/三表核验.*abcdef01/))
  expect(deletes).toEqual([])
  fireEvent.click(button)
  await waitFor(() => expect(screen.queryByText(/草稿编号 abcdef01/)).toBeNull())
  expect(deletes).toEqual(['/api/web/v1/method-drafts/' + ids[1] + '?revision=1'])
  expect(screen.getByText(/草稿编号 12345678/)).toBeVisible()
})
