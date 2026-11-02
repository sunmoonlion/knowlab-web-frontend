import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { MethodFreezePanel } from '@/components/knowbots/workdraft-method-freeze'
import { PlanningCard, SelectionEditor } from '@/components/knowbots/workdraft-planning'
import { workdraftSchema } from '@/contracts/workdraft'
import { diffEdits, newStep } from '@/lib/knowbots/workdraft'
import fixture from '../fixtures/author-method.json'
import { CSRF, renderWith } from './knowbot-fixtures'

const doc = workdraftSchema.parse(fixture.workdraft)
const step = doc.body.steps[0]
const fetcher = vi.fn()
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

beforeEach(() => {
  fetcher.mockReset()
  vi.stubGlobal('fetch', fetcher)
  fetcher.mockImplementation(async (url: string, options: RequestInit) => {
    if (options.method === 'GET') return response({ items: [] })
    const [, id, version] = url.match(/method-units\/([^/]+)\/versions\/(\d+)$/)!
    return response({ ...fixture.method, method_id: id, version: Number(version) })
  })
})
afterEach(() => vi.unstubAllGlobals())

function show(over: Partial<React.ComponentProps<typeof MethodFreezePanel>> = {}) {
  const done = vi.fn()
  renderWith(
    <MethodFreezePanel
      requestId={doc.request_id}
      revision={doc.revision}
      step={step}
      csrfToken={CSRF}
      onDone={done}
      onClose={vi.fn()}
      {...over}
    />,
  )
  return done
}

it('creates a real method identity only after explicit slot naming and confirmation', async () => {
  const done = show()
  expect(screen.getByRole('button', { name: '确认冻结这个版本' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('将来源「inspect」命名为输入槽'), {
    target: { value: 'records' },
  })
  expect(fetcher.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '确认冻结这个版本' }))
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1))
  const [url, options] = fetcher.mock.calls.find(([, options]) => options.method === 'PUT')!
  expect(url).toMatch(/^\/api\/web\/v1\/method-units\/[0-9a-f-]{36}\/versions\/1$/)
  expect(options.headers['X-CSRF-Token']).toBe(CSRF)
  expect(JSON.parse(options.body)).toEqual({
    request_id: doc.request_id,
    revision: doc.revision,
    step_id: 'report',
    input_slots: { inspect: 'records' },
  })
  expect(done.mock.calls[0][0].method_id).not.toBe('00000000-0000-0000-0000-000000000001')
  expect(
    fetcher.mock.calls.some(([url]) => url.includes('/publish') || url.endsWith('/bind')),
  ).toBe(false)
})

it('retries a lost response with the same method identity, version and source revision', async () => {
  let first = true
  fetcher.mockImplementation(async (url: string, options: RequestInit) => {
    if (options.method === 'GET') return response({ items: [] })
    if (first) {
      first = false
      throw new TypeError('synthetic lost response')
    }
    return response({ ...fixture.method, method_id: url.split('/')[5] })
  })
  const done = show()
  fireEvent.change(screen.getByLabelText('将来源「inspect」命名为输入槽'), {
    target: { value: 'records' },
  })
  fireEvent.click(screen.getByRole('button', { name: '确认冻结这个版本' }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '确认冻结这个版本' }))
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1))
  const writes = fetcher.mock.calls.filter(([, options]) => options.method === 'PUT')
  expect(writes).toHaveLength(2)
  expect(writes[0][0]).toBe(writes[1][0])
  expect(writes[0][1].body).toBe(writes[1][1].body)
})

it('shows source failures without inventing provenance or clearing the entered slots', async () => {
  fetcher.mockImplementation(async (_url: string, options: RequestInit) =>
    options.method === 'GET'
      ? response({ items: [] })
      : response({ code: 'method_source_invalid', message_key: 'invalid' }, 400),
  )
  const done = show()
  fireEvent.change(screen.getByLabelText('将来源「inspect」命名为输入槽'), {
    target: { value: 'records' },
  })
  fireEvent.click(screen.getByRole('button', { name: '确认冻结这个版本' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('作者出处和编译问题')
  expect(screen.getByLabelText('将来源「inspect」命名为输入槽')).toHaveValue('records')
  expect(done).not.toHaveBeenCalled()
})

it('adds the explicitly chosen next version to an existing identity', async () => {
  fetcher.mockImplementation(async (url: string, options: RequestInit) =>
    options.method === 'GET'
      ? response({
          items: [
            {
              method_id: fixture.method.method_id,
              latest_version: 1,
              created_at: fixture.method.created_at,
              title: '已有文档方法',
            },
          ],
        })
      : response({ ...fixture.method, version: 2 }),
  )
  const done = show()
  await screen.findByRole('option', { name: '已有文档方法 · 已有版本 1' })
  fireEvent.change(screen.getByLabelText('保存到哪个方法'), {
    target: { value: fixture.method.method_id },
  })
  fireEvent.change(screen.getByLabelText('将来源「inspect」命名为输入槽'), {
    target: { value: 'records' },
  })
  expect(screen.getByText('本次将保存为版本 2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认冻结这个版本' }))
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1))
  expect(fetcher.mock.calls.find(([, options]) => options.method === 'PUT')![0]).toBe(
    `/api/web/v1/method-units/${fixture.method.method_id}/versions/2`,
  )
})

it('does not create author planning rules until instructions and final methods are confirmed', () => {
  const save = vi.fn()
  renderWith(<PlanningCard steps={doc.body.steps} disabled={false} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: '设置动态方法规划' }))
  expect(screen.getByRole('button', { name: '确认保存规划' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('作者规划说明'), {
    target: { value: '根据问题选择已写定的方法，始终交回汇总。' },
  })
  fireEvent.click(screen.getByLabelText('汇总'))
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认保存规划' }))
  const planning = save.mock.calls[0][0]
  expect(planning.final_units).toEqual(['report'])
  expect(diffEdits({ ...doc.body, planning: undefined }, { ...doc.body, planning })).toEqual([
    { path: 'planning', value: planning },
  ])
})

it('saves a method selection only with author conditions and bounded counts', () => {
  const change = vi.fn()
  renderWith(<SelectionEditor step={newStep('inspect')} onChange={change} />)
  fireEvent.click(screen.getByRole('button', { name: '设置选择条件' }))
  expect(screen.getByRole('button', { name: '确认保存选择条件' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('何时使用这个方法'), {
    target: { value: '问题要求核对文档时' },
  })
  fireEvent.change(screen.getByLabelText('一次计划最多调用几次（1～100）'), {
    target: { value: '101' },
  })
  expect(screen.getByRole('button', { name: '确认保存选择条件' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('一次计划最多调用几次（1～100）'), {
    target: { value: '2' },
  })
  fireEvent.click(screen.getByRole('button', { name: '确认保存选择条件' }))
  expect(change.mock.calls[0][0].selection).toEqual({
    applies_when: '问题要求核对文档时',
    required: false,
    max_calls: 2,
  })
})
