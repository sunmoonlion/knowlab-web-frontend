import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { MethodFreezePanel } from '@/components/knowbots/workdraft-method-freeze'
import { MethodPickerPanel } from '@/components/knowbots/workdraft-method-picker'
import { methodVersionSchema, methodView } from '@/contracts/author-methods'
import { bodySchema } from '@/contracts/workdraft'
import fixture from '../fixtures/atomic-method.json'
import { CSRF, REQUEST, renderWith } from './knowbot-fixtures'

const method = methodVersionSchema.parse(fixture.method)
const body = bodySchema.parse(fixture.body)
const step = body.steps[0]
const respond = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
afterEach(() => vi.unstubAllGlobals())

it('作者选取输入字段后保存独立定义，不把执行策略发送为方法正文', async () => {
  const calls = vi.fn(async (url: string, options: RequestInit) => {
    if (options.method === 'GET') return respond({ items: [] })
    return respond({ ...method, method_id: url.split('/')[5] })
  })
  vi.stubGlobal('fetch', calls)
  const done = vi.fn()
  renderWith(
    <MethodFreezePanel
      requestId={REQUEST}
      revision={1}
      step={step}
      sources={body.steps}
      atomicAvailable
      csrfToken={CSRF}
      onClose={vi.fn()}
      onDone={done}
    />,
  )
  fireEvent.click(
    screen.getByRole('checkbox', { name: '只保存方法本身，执行方式由使用它的专家决定' }),
  )
  fireEvent.change(screen.getByLabelText('将来源「inspect」命名为输入槽'), {
    target: { value: 'records' },
  })
  fireEvent.change(screen.getByLabelText('将来源「review」命名为输入槽'), {
    target: { value: 'verification' },
  })
  fireEvent.click(screen.getByRole('checkbox', { name: 'rows' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'notes' }))
  fireEvent.change(screen.getByLabelText('inspect 的输入含义'), { target: { value: '核对条目' } })
  fireEvent.change(screen.getByLabelText('review 的输入含义'), { target: { value: '可选复核' } })
  fireEvent.click(screen.getByRole('button', { name: '确认冻结这个版本' }))
  await waitFor(() => expect(done).toHaveBeenCalledOnce())
  const write = calls.mock.calls.find(([, options]) => options.method === 'PUT')!
  const command = JSON.parse(write[1].body as string)
  expect(command.definition_contract).toBe('knowlab/method-definition/v3')
  expect(command.input_fields).toEqual({ records: ['rows'], verification: ['notes'] })
  expect(command).not.toHaveProperty('execution')
  expect(method.definition).not.toHaveProperty('step')
})

it('读取独立方法时保留真实定义，并把当前专家执行设置独立送去预览', async () => {
  const calls = vi.fn(async (url: string, options: RequestInit) => {
    if (url.includes('?'))
      return respond({
        items: [
          {
            method_id: method.method_id,
            latest_version: 1,
            created_at: method.created_at,
            title: methodView(method.definition).step.title,
          },
        ],
      })
    if (options.method === 'GET') return respond(method)
    const command = JSON.parse(options.body as string)
    return respond({
      method_id: method.method_id,
      version: 1,
      digest: method.digest,
      workdraft_revision: 1,
      inputs: command.inputs,
      step,
      preview_only: true,
    })
  })
  vi.stubGlobal('fetch', calls)
  renderWith(
    <MethodPickerPanel
      requestId={REQUEST}
      revision={1}
      step={step}
      sources={body.steps.slice(1)}
      csrfToken={CSRF}
      onClose={vi.fn()}
      onApply={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /条目标识覆盖核对/ }))
  fireEvent.change(await screen.findByLabelText('输入「records」来自'), {
    target: { value: 'inspect' },
  })
  fireEvent.change(screen.getByLabelText('输入「verification」来自'), {
    target: { value: 'review' },
  })
  fireEvent.click(screen.getByRole('button', { name: '核对这次装配' }))
  await waitFor(() =>
    expect(calls.mock.calls.some(([url]) => url.endsWith('/preview-binding'))).toBe(true),
  )
  const write = calls.mock.calls.find(([url]) => url.endsWith('/preview-binding'))!
  expect(JSON.parse(write[1].body as string).execution).toEqual({
    ask_before: step.ask_before,
    on_fail: step.on_fail,
    advanced: { ...step.advanced, output_schema: null },
  })
  expect(calls.mock.calls.some(([url]) => url.endsWith('/bind'))).toBe(false)
})
