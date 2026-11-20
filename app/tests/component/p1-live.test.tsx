import { transferableAbortController } from 'node:util'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FormalMethodEditor } from '@/components/knowbots/formal-method-editor'
import messages from '@/messages/zh-CN.json'
import { renderWith } from './knowbot-fixtures'

vi.mock('@/i18n/navigation', () => ({ Link: 'a' }))

const url = process.env.LUNA_P1_URL
it.skipIf(!url).each(['bridge', 'replace'] as const)(
  'adopts, saves and reopens the indexed P1 %s plan',
  async (mode) => {
    const base = new URL(url!)
    if (base.hostname !== '127.0.0.1') throw Error('Expected loopback integration fixture')
    const fetchLocal = globalThis.fetch
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      headers.set(
        'Cookie',
        'sunmoonai_knowlab_web_sid=' + (process.env.LUNA_P1_SHARED ? 'other' : 'author'),
      )
      headers.set('Origin', 'http://localhost:3000')
      // The DOM component supplies a jsdom signal; Node's loopback fetch checks its realm.
      if (!init.signal) return fetchLocal(new URL(path, base), { ...init, headers })
      const controller = transferableAbortController()
      const abort = () => controller.abort()
      if (init.signal.aborted) abort()
      init.signal.addEventListener('abort', abort, { once: true })
      try {
        return await fetchLocal(new URL(path, base), {
          ...init,
          headers,
          signal: controller.signal,
        })
      } finally {
        init.signal.removeEventListener('abort', abort)
      }
    })
    try {
      const t = messages.formalMethod,
        leaf = process.env.LUNA_P1_LEAF!
      const predecessor = process.env.LUNA_P1_SHARED || leaf
      const open = () =>
        renderWith(
          <FormalMethodEditor
            requestId={
              (mode === 'bridge'
                ? process.env.LUNA_P1_REQUEST
                : process.env.LUNA_P1_RESELECT_REQUEST)!
            }
            csrfToken="csrf-token-with-at-least-thirty-two-characters"
            resume={{
              method:
                mode === 'bridge'
                  ? process.env.LUNA_P1_METHOD
                  : process.env.LUNA_P1_RESELECT_METHOD,
            }}
          />,
        )
      const view = open()
      const choose = await screen.findByLabelText<HTMLSelectElement>(t.registeredTool)
      const firstTool = mode === 'bridge' ? leaf : process.env.LUNA_P1_STRICT!
      await waitFor(() =>
        expect([...choose.options].some((o) => o.value.startsWith(firstTool))).toBe(true),
      )
      fireEvent.change(choose, {
        target: { value: [...choose.options].find((o) => o.value.startsWith(firstTool))!.value },
      })
      const adopt = screen.getByRole('button', { name: t.useToolAsStep })
      await waitFor(() => expect(adopt).toBeEnabled())
      fireEvent.click(adopt)
      const automatic = !!process.env.LUNA_P1_SHARED || mode === 'replace'
      if (automatic) fireEvent.click(await screen.findByLabelText(t.p1Automatic))
      fireEvent.change(await screen.findByLabelText(t.p1Input), { target: { value: 'to' } })
      if (mode === 'replace') {
        fireEvent.click(screen.getByRole('button', { name: t.p1Scan }))
        await screen.findByText(t.p1ScanStatus.no_progress, { exact: false })
        fireEvent.change(screen.getByLabelText(t.p1SearchBy), { target: { value: 'receipt' } })
      }
      if (process.env.LUNA_P1_SHARED) {
        const section = within(screen.getByRole('group', { name: t.p1Find }))
        fireEvent.change(section.getByLabelText(t.toolDirectory), { target: { value: 'shared' } })
      }
      if (automatic) fireEvent.click(screen.getByRole('button', { name: t.p1Scan }))
      const providers = await screen.findByLabelText<HTMLSelectElement>(t.p1Provider)
      await waitFor(() =>
        expect([...providers.options].some((o) => o.value.startsWith(predecessor))).toBe(true),
      )
      if (mode === 'replace')
        expect([...providers.options].some((o) => o.value.startsWith(firstTool))).toBe(false)
      fireEvent.change(providers, {
        target: {
          value: [...providers.options].find((o) => o.value.startsWith(predecessor))!.value,
        },
      })
      if (mode === 'replace') {
        const section = within(screen.getByRole('group', { name: t.p1Find }))
        expect(section.queryByRole('button', { name: t.p1AdoptReplacement })).toBeNull()
        fireEvent.change(await section.findByRole('textbox'), { target: { value: 'buildSource' } })
      }
      fireEvent.click(
        await screen.findByRole('button', {
          name: mode === 'bridge' ? t.p1Adopt : t.p1AdoptReplacement,
        }),
      )
      if (process.env.LUNA_P1_SHARED) {
        await waitFor(() => expect(screen.queryByRole('button', { name: t.p1Adopt })).toBeNull())
      }
      fireEvent.click(screen.getByRole('button', { name: t.save }))
      await screen.findByText(t.saved)
      view.unmount()
      open()
      expect(
        await screen.findByText(
          mode === 'bridge' ? /to ← 前置步骤输出: prepare.receipt/ : /to ← .*: buildSource/,
        ),
      ).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  },
  20000,
)
