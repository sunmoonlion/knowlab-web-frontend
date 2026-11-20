import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FormalMethodEditor } from '@/components/knowbots/formal-method-editor'
import messages from '@/messages/zh-CN.json'
import { renderWith } from './knowbot-fixtures'

vi.mock('@/i18n/navigation', () => ({ Link: 'a' }))

const url = process.env.LUNA_P1_URL
it.skipIf(!url)(
  'adopts an indexed P1 predecessor and reopens the persisted graph',
  async () => {
    const base = new URL(url!)
    if (base.hostname !== '127.0.0.1') throw Error('Expected loopback integration fixture')
    const fetchLocal = globalThis.fetch
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      headers.set('Cookie', 'sunmoonai_knowlab_web_sid=author')
      headers.set('Origin', 'http://localhost:3000')
      return fetchLocal(new URL(path, base), { ...init, headers })
    })
    try {
      const t = messages.formalMethod,
        leaf = process.env.LUNA_P1_LEAF!
      const open = () =>
        renderWith(
          <FormalMethodEditor
            requestId={process.env.LUNA_P1_REQUEST!}
            csrfToken="csrf-token-with-at-least-thirty-two-characters"
            resume={{ method: process.env.LUNA_P1_METHOD! }}
          />,
        )
      const view = open()
      const choose = await screen.findByLabelText<HTMLSelectElement>(t.registeredTool)
      await waitFor(() => expect(choose.options.length).toBe(2))
      fireEvent.change(choose, { target: { value: choose.options[1].value } })
      const adopt = screen.getByRole('button', { name: t.useToolAsStep })
      await waitFor(() => expect(adopt).toBeEnabled())
      fireEvent.click(adopt)
      fireEvent.change(await screen.findByLabelText(t.p1Input), { target: { value: 'to' } })
      const providers = await screen.findByLabelText<HTMLSelectElement>(t.p1Provider)
      await waitFor(() => expect(providers.options.length).toBe(2))
      expect(providers.options[1].value).toContain(leaf)
      fireEvent.change(providers, { target: { value: providers.options[1].value } })
      fireEvent.click(await screen.findByRole('button', { name: t.p1Adopt }))
      fireEvent.click(screen.getByRole('button', { name: t.save }))
      await screen.findByText(t.saved)
      view.unmount()
      open()
      expect(await screen.findByText(/to ← 前置步骤输出: prepare.receipt/)).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  },
  20000,
)
