import { transferableAbortController } from 'node:util'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FormalMethodEditor } from '@/components/knowbots/formal-method-editor'
import messages from '@/messages/zh-CN.json'
import { renderWith } from './knowbot-fixtures'

vi.mock('@/i18n/navigation', () => ({ Link: 'a' }))

const url = process.env.LUNA_P1_URL
const modes = ['bridge', 'replace']
if (process.env.LUNA_P1_SAMPLE) modes.push('internal')
if (process.env.LUNA_P5_REQUEST) modes.push('choice')
if (process.env.LUNA_P4_REQUEST) modes.push('comparison')
if (process.env.LUNA_P3_REQUEST) modes.push('review')
if (process.env.LUNA_P2_REQUEST) modes.push('join')
it.skipIf(!url).each(modes)(
  'adopts, saves and reopens the indexed %s plan',
  async (mode) => {
    const base = new URL(url!)
    if (base.hostname !== '127.0.0.1') throw Error('Expected loopback integration fixture')
    const fetchLocal = globalThis.fetch
    let replayAdoption: (() => Promise<Response>) | undefined
    let searches = 0
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      if (/\/(scan|matching)-outputs$/.test(path)) searches++
      const headers = new Headers(init.headers)
      headers.set(
        'Cookie',
        'sunmoonai_knowlab_web_sid=' + (process.env.LUNA_P1_SHARED ? 'other' : 'author'),
      )
      headers.set('Origin', 'http://localhost:3000')
      if (mode === 'review' && path.endsWith('/cells') && init.method === 'POST') {
        const request = { method: 'POST', headers, body: init.body }
        replayAdoption = () => fetchLocal(new URL(path, base), request)
      }
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
      const prefix = {
        choice: 'LUNA_P5',
        comparison: 'LUNA_P4',
        join: 'LUNA_P2',
        review: 'LUNA_P3',
        bridge: 'LUNA_P1',
        internal: 'LUNA_P1_INTERNAL',
        replace: 'LUNA_P1_RESELECT',
      }[mode]
      const open = () =>
        renderWith(
          <FormalMethodEditor
            requestId={process.env[prefix + '_REQUEST']!}
            csrfToken="csrf-token-with-at-least-thirty-two-characters"
            resume={{ method: process.env[prefix + '_METHOD'] }}
          />,
        )
      const view = open()
      const choose = await screen.findByLabelText<HTMLSelectElement>(t.registeredTool)
      const firstTool =
        mode === 'comparison'
          ? process.env.LUNA_P4_COLLECTOR!
          : mode === 'join' || mode === 'review'
            ? process.env.LUNA_P2_JOIN!
            : mode === 'replace'
              ? process.env.LUNA_P1_STRICT!
              : leaf
      await waitFor(() =>
        expect([...choose.options].some((o) => o.value.startsWith(firstTool))).toBe(true),
      )
      fireEvent.change(choose, {
        target: { value: [...choose.options].find((o) => o.value.startsWith(firstTool))!.value },
      })
      const adopt = screen.getByRole('button', { name: t.useToolAsStep })
      await waitFor(() => expect(adopt).toBeEnabled())
      fireEvent.click(adopt)
      if (mode === 'choice') {
        const nested = process.env.LUNA_P5_EXPERT!
        fireEvent.click(screen.getByRole('button', { name: t.p5Configure }))
        const panel = within(screen.getByRole('group', { name: t.p5Title }))
        fireEvent.change(
          panel.getByLabelText(t.p5Equals.replace('{method}', leaf).replace('{version}', '1')),
          { target: { value: 'direct' } },
        )
        fireEvent.change(panel.getByLabelText(t.p5NewValue), { target: { value: 'review' } })
        const picker = panel.getByRole<HTMLSelectElement>('combobox', { name: t.p5Candidate })
        await waitFor(() =>
          expect([...picker.options].some((o) => o.value.startsWith(nested))).toBe(true),
        )
        fireEvent.change(picker, {
          target: { value: [...picker.options].find((o) => o.value.startsWith(nested))!.value },
        })
        const check = await panel.findByRole('button', { name: t.p5Check })
        fireEvent.click(check)
        await panel.findByText(
          t.p5Limits.replace('{depth}', '3').replace('{steps}', '2').replace('{expansions}', '3'),
        )
        expect(panel.getByRole('button', { name: t.p5Apply })).toBeDisabled()
        fireEvent.change(panel.getByLabelText(t.max_depth), { target: { value: '3' } })
        fireEvent.change(panel.getByLabelText(t.max_expansions), { target: { value: '3' } })
        fireEvent.change(panel.getByLabelText(t.max_steps), { target: { value: '2' } })
        fireEvent.change(panel.getByLabelText(t.p5NewValue), { target: { value: 'direct' } })
        expect(panel.getByRole('button', { name: t.p5Apply })).toBeDisabled()
        fireEvent.change(panel.getByLabelText(t.p5NewValue), { target: { value: 'review' } })
        fireEvent.click(panel.getByRole('button', { name: t.p5Check }))
        await waitFor(() => expect(panel.getByRole('button', { name: t.p5Apply })).toBeEnabled())
        fireEvent.click(panel.getByRole('button', { name: t.p5Apply }))
        fireEvent.click(screen.getByRole('button', { name: t.save }))
        await screen.findByText(t.saved)
        view.unmount()
        open()
        await screen.findByText(t.planLastAdoption.replace('{base}', '0').replace('{saved}', '1'))
        const sample = screen.getByLabelText(t.p5Sample)
        fireEvent.change(sample, { target: { value: 'review' } })
        expect(
          screen.getByText(t.p5Match.replace('{method}', nested).replace('{version}', '1')),
        ).toBeVisible()
        fireEvent.change(sample, { target: { value: 'unknown' } })
        expect(screen.getByText(t.p5NoMatch)).toBeVisible()
        return
      }
      if (mode === 'comparison') {
        fireEvent.click(screen.getByRole('button', { name: t.p4Configure }))
        const panel = within(screen.getByRole('group', { name: t.p4Title }))
        fireEvent.change(panel.getByLabelText(t.p4Max), { target: { value: '3' } })
        fireEvent.change(panel.getByLabelText(t.p4Missing), {
          target: { value: 'request_partial' },
        })
        const picker = panel.getByLabelText<HTMLSelectElement>(t.registeredTool)
        await waitFor(() =>
          expect([...picker.options].some((o) => o.value.startsWith(leaf))).toBe(true),
        )
        fireEvent.change(picker, {
          target: { value: [...picker.options].find((o) => o.value.startsWith(leaf))!.value },
        })
        const apply = await panel.findByRole('button', { name: t.p4Apply })
        await waitFor(() => expect(apply).toBeEnabled())
        fireEvent.click(apply)
        fireEvent.click(screen.getByRole('button', { name: t.save }))
        await screen.findByText(t.saved)
        view.unmount()
        open()
        await screen.findByText(t.planLastAdoption.replace('{base}', '0').replace('{saved}', '1'))
        expect(screen.getByLabelText(t.p4Max)).toHaveValue(3)
        expect(screen.getByLabelText(t.p4Missing)).toHaveValue('request_partial')
        expect(screen.queryByText(t.bounded_fanout.replace('{step}', 'per_object'))).toBeNull()
        return
      }
      if (mode === 'join' || mode === 'review') {
        const review = mode === 'review'
        const apply = review ? t.p3Adopt : t.p2Adopt
        const panel = within(
          await screen.findByRole('group', { name: review ? t.p3Review : t.p2Join }),
        )
        if (!review)
          fireEvent.change(panel.getByLabelText(t.p2Target), { target: { value: 'step_1' } })
        for (const port of ['to', 'other']) {
          fireEvent.change(panel.getByLabelText(t.p2Input), { target: { value: port } })
          const picker = await panel.findByLabelText<HTMLSelectElement>(t.p1Provider)
          const selected = [...picker.options].find((o) => o.value.startsWith(leaf))!
          fireEvent.change(picker, { target: { value: selected.value } })
          const add = panel.getByRole('button', { name: t.p2Add })
          await waitFor(() => expect(add).toBeEnabled())
          fireEvent.click(add)
          if (port === 'to') expect(panel.getByRole('button', { name: apply })).toBeDisabled()
        }
        expect(panel.getByText(/other ← 前置步骤输出: branch_1.receipt/)).toBeVisible()
        if (review) {
          for (const id of ['branch', 'branch_1', 'step_1']) {
            expect(panel.getByText(t.p3Group.replace('{group}', id))).toBeVisible()
            expect(panel.getByText(id + '.collaboration')).toBeInTheDocument()
          }
          expect(
            panel.getByText(t.p3Handoffs.replace('{sources}', 'branch, branch_1')),
          ).toBeVisible()
        }
        fireEvent.click(panel.getByRole('button', { name: apply }))
        await waitFor(() => expect(screen.queryByRole('button', { name: apply })).toBeNull())
        fireEvent.click(screen.getByRole('button', { name: t.save }))
        await screen.findByText(t.saved)
        view.unmount()
        open()
        await screen.findByText(t.planLastAdoption.replace('{base}', '0').replace('{saved}', '1'))
        expect(screen.getByText(/to ← 前置步骤输出: branch.receipt/)).toBeVisible()
        expect(screen.getByText(/other ← 前置步骤输出: branch_1.receipt/)).toBeVisible()
        if (review) {
          const replay = await replayAdoption!()
          expect(replay.status).toBe(200)
          expect((await replay.json()).revision).toBe(1)
          expect(
            screen.getByText(t.p3Handoffs.replace('{sources}', 'branch, branch_1')),
          ).toBeVisible()
          for (const id of ['branch', 'branch_1', 'step_1'])
            expect(screen.getByText(t.p3Group.replace('{group}', id))).toBeVisible()
        }
        return
      }
      if (mode === 'internal') {
        const chooseOutput = async (id: string) => {
          const picker = await screen.findByLabelText<HTMLSelectElement>(t.p1Provider)
          const value = () =>
            [...picker.options].find((option) => option.value.startsWith(id))?.value
          await waitFor(() => expect(value()).toBeTruthy())
          fireEvent.change(picker, { target: { value: value() } })
        }
        const save = async () => {
          fireEvent.click(screen.getByRole('button', { name: t.save }))
          await screen.findByText(t.saved)
        }
        fireEvent.change(await screen.findByLabelText(t.p1Input), { target: { value: 'to' } })
        await chooseOutput(process.env.LUNA_P1_STRICT!)
        fireEvent.click(await screen.findByRole('button', { name: t.p1Adopt }))
        await save()
        view.unmount()
        const pair = open()
        fireEvent.click(await screen.findByLabelText(t.p1Automatic))
        fireEvent.change(screen.getByLabelText(t.p1Target), { target: { value: 'prepare' } })
        fireEvent.change(screen.getByLabelText(t.p1Input), { target: { value: 'to' } })
        fireEvent.click(screen.getByRole('button', { name: t.p1Scan }))
        await screen.findByText(t.p1ScanStatus.no_progress, { exact: false })
        fireEvent.change(screen.getByLabelText(t.p1SearchBy), { target: { value: '@receipt' } })
        fireEvent.click(screen.getByRole('button', { name: t.p1Scan }))
        await chooseOutput(leaf)
        const section = within(screen.getByRole('group', { name: t.p1Find }))
        fireEvent.change(await section.findByRole('textbox'), { target: { value: 'buildSource' } })
        fireEvent.click(await section.findByRole('button', { name: t.p1AdoptReplacement }))
        await save()
        pair.unmount()
        open()
        await screen.findByText(t.planLastAdoption.replace('{base}', '1').replace('{saved}', '2'))
        expect(await screen.findByText(/to ← 前置步骤输出: prepare.receipt/)).toBeVisible()
        return
      }
      const automatic = !!process.env.LUNA_P1_SHARED || mode === 'replace'
      if (automatic) fireEvent.click(await screen.findByLabelText(t.p1Automatic))
      fireEvent.change(await screen.findByLabelText(t.p1Input), { target: { value: 'to' } })
      if (mode === 'replace') {
        if (process.env.LUNA_P1_SAMPLE)
          fireEvent.change(screen.getByLabelText(t.p1PageBudget), { target: { value: '1' } })
        fireEvent.click(screen.getByRole('button', { name: t.p1Scan }))
        await screen.findByText(t.p1ScanStatus.no_progress, { exact: false })
        fireEvent.change(screen.getByLabelText(t.p1SearchBy), { target: { value: 'receipt' } })
      }
      if (mode === 'replace' && process.env.LUNA_P1_SAMPLE) {
        fireEvent.click(screen.getByRole('button', { name: t.p1Scan }))
        await screen.findByText(t.p1ScanStatus.budget, { exact: false })
        expect(screen.queryByRole('button', { name: t.p1AdoptReplacement })).toBeNull()
        fireEvent.change(screen.getByLabelText(t.p1PageBudget), { target: { value: '6' } })
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
      const reopened = open()
      expect(
        await screen.findByText(
          mode === 'bridge' ? /to ← 前置步骤输出: prepare.receipt/ : /to ← .*: buildSource/,
        ),
      ).toBeInTheDocument()
      expect(
        await screen.findByText(t.planLastAdoption.replace('{base}', '0').replace('{saved}', '1')),
      ).toBeInTheDocument()
      if (mode === 'bridge' && !process.env.LUNA_P1_SHARED) {
        const prior = searches
        if (process.env.LUNA_P1_SAMPLE)
          fireEvent.click(screen.getByRole('button', { name: t.sampleCheck }))
        fireEvent.change(await screen.findByLabelText(t.p1Target), { target: { value: 'prepare' } })
        fireEvent.change(screen.getByLabelText(t.p1Input), { target: { value: 'to' } })
        if (process.env.LUNA_P1_SAMPLE) {
          const version = await screen.findByRole<HTMLOptionElement>('option', {
            name: 'builds.csv · v1',
          })
          fireEvent.change(screen.getByLabelText(t.sampleVersion), {
            target: { value: version.value },
          })
          const check = async (name: string, status: string) => {
            fireEvent.change(screen.getByLabelText(t.sampleColumn), { target: { value: name } })
            fireEvent.click(screen.getByRole('button', { name: t.sampleRead }))
            await screen.findByText(status, { exact: false })
          }
          fireEvent.change(screen.getByLabelText(t.sampleSheet), {
            target: { value: 'not-a-sheet' },
          })
          await check('release', t.sampleUnknown)
          expect(screen.queryByRole('button', { name: t.sampleBridge })).toBeNull()
          fireEvent.change(screen.getByLabelText(t.sampleSheet), { target: { value: '' } })
          await check('release', t.samplePresent)
          await check('revision', t.sampleMissing)
          expect(searches).toBe(prior)
          fireEvent.click(screen.getByRole('button', { name: t.sampleBridge }))
          fireEvent.click(screen.getByRole('button', { name: t.p1Scan }))
        }
        const tool = await screen.findByLabelText<HTMLSelectElement>(t.p1Provider)
        await waitFor(() =>
          expect([...tool.options].some((o) => o.value.startsWith(leaf))).toBe(true),
        )
        fireEvent.change(tool, {
          target: { value: [...tool.options].find((o) => o.value.startsWith(leaf))!.value },
        })
        const preview = await screen.findByRole('button', { name: t.p1Adopt })
        expect(
          screen.getByText(t.p1PreviewRevision.replace('{revision}', '1'), { exact: false }),
        ).toBeInTheDocument()
        fireEvent.click(preview)
        fireEvent.click(screen.getByRole('button', { name: t.save }))
        await screen.findByText(t.saved)
        reopened.unmount()
        const threeSteps = open()
        await screen.findByText(t.planLastAdoption.replace('{base}', '1').replace('{saved}', '2'))
        expect(await screen.findByText(/to ← 前置步骤输出: prepare_1.receipt/)).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText(t.targetInput), {
          target: { value: 'prepare_1.to' },
        })
        fireEvent.change(screen.getByLabelText(t.bindFrom), { target: { value: 'literal' } })
        fireEvent.change(screen.getByLabelText(t.fixedText), {
          target: { value: 'sandbox-provisioner' },
        })
        fireEvent.click(screen.getByRole('button', { name: t.adoptBinding }))
        fireEvent.click(screen.getByRole('button', { name: t.save }))
        await screen.findByText(t.saved)
        threeSteps.unmount()
        open()
        expect(await screen.findByText(/to ← 固定值: "sandbox-provisioner"/)).toBeInTheDocument()
      }
    } finally {
      vi.unstubAllGlobals()
    }
  },
  20000,
)
