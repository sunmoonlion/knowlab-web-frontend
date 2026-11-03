import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkdraftView } from '@/components/knowbots/workdraft-view'
import { MethodPickerPanel } from '@/components/knowbots/workdraft-method-picker'
import { methodVersionSchema } from '@/contracts/author-methods'
import { workdraftSchema } from '@/contracts/workdraft'
import {
  bindMethod,
  getMethodVersion,
  listMethods,
  previewMethodBinding,
} from '@/lib/knowbots/methods'
import { diffEdits } from '@/lib/knowbots/workdraft'
import fixture from '../fixtures/author-method.json'
import { CSRF, detail, version, renderWith } from './knowbot-fixtures'

vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const doc = workdraftSchema.parse(fixture.workdraft)
const parsedMethod = methodVersionSchema.parse(fixture.method)
if (parsedMethod.definition.schema === 'knowlab/method-definition/v3')
  throw new Error('legacy fixture expected')
const method = { ...parsedMethod, definition: parsedMethod.definition }
const step = doc.body.steps.find((s) => s.id === 'report')!
const sources = doc.body.steps.filter((s) => s.id !== 'report')
const command = {
  request_id: doc.request_id,
  revision: doc.revision,
  alias: step.id,
  digest: method.digest,
  inputs: { records: 'inspect' },
  required: true,
  max_calls: 1,
}
const path = `/api/web/v1/method-units/${method.method_id}/versions/1`
const ref = {
  method_id: method.method_id,
  version: 1,
  digest: method.digest,
  inputs: command.inputs,
}
const preview = {
  method_id: method.method_id,
  version: 1,
  digest: method.digest,
  workdraft_revision: doc.revision,
  inputs: command.inputs,
  step,
  preview_only: true,
}
const bound = {
  ...doc,
  revision: doc.revision + 1,
  body: { ...doc.body, method_refs: { report: ref } },
}
const fetcher = vi.fn()

function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
function renderPicker(over: Partial<React.ComponentProps<typeof MethodPickerPanel>> = {}) {
  const onApply = vi.fn(async (id, version, command) => {
    await bindMethod(id, version, command, CSRF)
  })
  renderWith(
    <MethodPickerPanel
      requestId={doc.request_id}
      revision={doc.revision}
      step={step}
      sources={sources}
      csrfToken={CSRF}
      onApply={onApply}
      onClose={vi.fn()}
      {...over}
    />,
  )
  return onApply
}

beforeEach(() => {
  fetcher.mockReset()
  vi.stubGlobal('fetch', fetcher)
  fetcher.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/web/v1/method-units?'))
      return respond({
        items: [
          {
            method_id: method.method_id,
            latest_version: 1,
            created_at: method.created_at,
            title: '作者合成文档方法',
            summary: '没有财务假设的合成材料',
          },
        ],
      })
    if (url.endsWith('/workdraft')) return respond(doc)
    if (url.endsWith('/workdraft/preview'))
      return respond({ contract_version: 1, version: '1', manifest: {}, problems: [] })
    if (url.endsWith('/workdraft/incubations'))
      return respond({ contract_version: 1, incubations: [] })
    if (url === path) return respond(method)
    if (url === path + '/preview-binding') return respond(preview)
    if (url === path + '/bind') return respond(bound)
    if (url === `/api/web/v1/knowbot-requests/${doc.request_id}`)
      return respond(detail({ request_id: doc.request_id }))
    throw new Error('Unexpected route: ' + url)
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('author method contracts and exact binding', () => {
  it('assembles a shortlisted idea version through preview and the real binding endpoint', async () => {
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation(async (url: string, ...args: unknown[]) => {
      if (url === `/api/web/v1/knowbot-requests/${doc.request_id}`)
        return respond(
          detail({
            request_id: doc.request_id,
            latest_version: 1,
            versions: [
              version({
                idea: {
                  kind: 'question',
                  question: '整理证据',
                  method_choices: [
                    {
                      method_id: method.method_id,
                      version: method.version,
                      digest: method.digest,
                    },
                  ],
                },
              }),
            ],
          }),
        )
      return original(url, ...args)
    })
    renderWith(<WorkdraftView requestId={doc.request_id} csrfToken={CSRF} />)
    fireEvent.change(await screen.findByLabelText('装配到哪个方法位置', {}, { timeout: 5000 }), {
      target: { value: 'report' },
    })
    fireEvent.click(screen.getByRole('button', { name: '核对并装配' }))
    fireEvent.change(await screen.findByLabelText('输入「records」来自'), {
      target: { value: 'inspect' },
    })
    fireEvent.click(screen.getByRole('button', { name: '核对这次装配' }))
    await screen.findByText('输入连接和版本已通过核对；确认后才会保存到工作稿。')
    expect(fetcher.mock.calls.some(([url]) => url === path + '/bind')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '确认保存引用' }))
    await screen.findByText('方法引用已保存，尚未发布专家。')
    expect(screen.getByText('已装配到：' + step.title)).toBeInTheDocument()
    const [, options] = fetcher.mock.calls.find(([url]) => url === path + '/bind')!
    expect(JSON.parse(options.body)).toEqual(command)
  })

  it('does not offer binding when the idea digest does not match its pinned version', async () => {
    renderPicker({
      initialChoice: {
        method_id: method.method_id,
        version: 1,
        digest: 'sha256:' + '0'.repeat(64),
      },
    })
    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: '核对这次装配' })).not.toBeInTheDocument()
    expect(fetcher.mock.calls.some(([url]) => url === path + '/bind')).toBe(false)
  })
  it('commits the server workdraft after binding and locks the referenced method body', async () => {
    renderWith(<WorkdraftView requestId={doc.request_id} csrfToken={CSRF} />)
    fireEvent.click((await screen.findAllByRole('button', { name: '选择已有方法' }))[0])
    fireEvent.click(await screen.findByRole('button', { name: '作者合成文档方法 · 版本 1' }))
    fireEvent.change(await screen.findByLabelText('输入「records」来自'), {
      target: { value: 'inspect' },
    })
    fireEvent.click(screen.getByRole('button', { name: '核对这次装配' }))
    await screen.findByText('输入连接和版本已通过核对；确认后才会保存到工作稿。')
    fireEvent.click(screen.getByRole('button', { name: '确认保存引用' }))
    await screen.findByText('方法引用已保存，尚未发布专家。')
    expect(screen.getByText('已引用版本 1，正文只读')).toBeInTheDocument()
    expect(within(screen.getByTestId('step-report')).getAllByRole('textbox')[0]).toBeDisabled()
    expect(screen.getByRole('button', { name: '更换方法或版本' })).toBeEnabled()
    expect(fetcher.mock.calls.some(([url]) => url.endsWith('/cells'))).toBe(false)
  })

  it('preserves author planning and selection without generating edits for read-only references', () => {
    expect(doc.body.planning).toEqual(fixture.workdraft.body.planning)
    expect(step.selection).toEqual(fixture.workdraft.body.steps[0].selection)
    expect(diffEdits(doc.body, { ...doc.body, method_refs: { report: ref } })).toEqual([])
    const changed = structuredClone(doc.body)
    changed.steps[0].selection!.max_calls = 2
    expect(diffEdits(doc.body, changed)).toEqual([
      { path: 'steps/report/selection', value: changed.steps[0].selection },
    ])
  })

  it('reads provider items and sends the real version route, revision and CSRF', async () => {
    expect((await listMethods())[0].title).toBe('作者合成文档方法')
    expect(await getMethodVersion(method.method_id, 1)).toEqual(method)
    expect((await previewMethodBinding(method.method_id, 1, command, CSRF)).preview_only).toBe(true)
    expect((await bindMethod(method.method_id, 1, command, CSRF)).body.method_refs?.report).toEqual(
      ref,
    )
    const [, options] = fetcher.mock.calls.at(-1)!
    expect(options.headers['X-CSRF-Token']).toBe(CSRF)
    expect(JSON.parse(options.body)).toEqual(command)
    expect(fetcher.mock.calls.at(-1)![0]).toBe(path + '/bind')
  })

  it('rejects a mismatched method response before applying it', async () => {
    fetcher.mockResolvedValue(respond({ ...method, version: 2 }))
    await expect(getMethodVersion(method.method_id, 1)).rejects.toThrow('knowbot_contract_invalid')
    fetcher.mockResolvedValue(respond({ ...bound, body: { ...bound.body, method_refs: {} } }))
    await expect(bindMethod(method.method_id, 1, command, CSRF)).rejects.toThrow(
      'knowbot_contract_invalid',
    )
  })

  it('requires a checked composition and an explicit confirmation; chooses any catalog input', async () => {
    const apply = renderPicker()
    fireEvent.click(await screen.findByRole('button', { name: '作者合成文档方法 · 版本 1' }))
    const choose = await screen.findByLabelText('输入「records」来自')
    // The source follows report in the author catalog, which is not an execution order.
    fireEvent.change(choose, { target: { value: 'inspect' } })
    expect(screen.getByRole('button', { name: '确认保存引用' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '核对这次装配' }))
    await screen.findByText('输入连接和版本已通过核对；确认后才会保存到工作稿。')
    expect(apply).not.toHaveBeenCalled()
    expect(fetcher.mock.calls.some(([url]) => url === path + '/bind')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '确认保存引用' }))
    await waitFor(() => expect(apply).toHaveBeenCalledWith(method.method_id, 1, command))
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([url]) => url === path + '/bind')).toBe(true),
    )
  })

  it('invalidates preview after changing author composition bounds', async () => {
    renderPicker({ currentRef: ref })
    fireEvent.click(await screen.findByRole('button', { name: '核对这次装配' }))
    await screen.findByText('输入连接和版本已通过核对；确认后才会保存到工作稿。')
    fireEvent.click(screen.getByLabelText('每次计划必须包含这个方法'))
    expect(screen.getByRole('button', { name: '确认更换引用' })).toBeDisabled()
  })

  it('has no invented intake when there are no upstream methods', async () => {
    renderPicker({ currentRef: ref, sources: [] })
    await screen.findByText('当前没有可连接的上游方法。')
    expect(screen.getByRole('button', { name: '核对这次装配' })).toBeDisabled()
    expect(screen.queryByText('financial_data_intake')).not.toBeInTheDocument()
  })

  it('keeps an existing pinned version even when the list has a newer version', async () => {
    fetcher.mockImplementation(async (url: string) =>
      url === path
        ? respond(method)
        : respond({
            items: [
              {
                method_id: method.method_id,
                latest_version: 2,
                created_at: method.created_at,
                title: '作者合成文档方法',
              },
            ],
          }),
    )
    renderPicker({ currentRef: ref })
    await screen.findByRole('button', { name: '查看最新版本 2' })
    await screen.findByLabelText('输入「records」来自')
    expect(screen.getByLabelText('要引用的版本')).toHaveValue(1)
    expect(fetcher.mock.calls.some(([url]) => url.endsWith('/versions/2'))).toBe(false)
  })

  it('shows version changes and requires a new preview before explicitly upgrading', async () => {
    const newer = structuredClone(method)
    newer.version = 2
    newer.digest = 'sha256:' + 'b'.repeat(64)
    newer.definition.step.does = '作者新增逐条核对，并保留未核事项。'
    newer.definition.step.checks = [{ template: 'required', params: { keys: ['report'] } }]
    const nextPath = path.replace('/versions/1', '/versions/2')
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation(async (url: string, ...args: unknown[]) => {
      if (url.startsWith('/api/web/v1/method-units?'))
        return respond({
          items: [
            {
              method_id: method.method_id,
              latest_version: 2,
              created_at: method.created_at,
              title: '作者合成文档方法',
            },
          ],
        })
      if (url === nextPath) return respond(newer)
      if (url === nextPath + '/preview-binding')
        return respond({ ...preview, version: 2, digest: newer.digest })
      return original(url, ...args)
    })
    const apply = vi.fn(async () => undefined)
    renderPicker({ currentRef: ref, onApply: apply })
    fireEvent.click(await screen.findByRole('button', { name: '核对这次装配' }))
    await screen.findByText('输入连接和版本已通过核对；确认后才会保存到工作稿。')
    fireEvent.click(screen.getByRole('button', { name: '查看最新版本 2' }))
    await screen.findByRole('heading', { name: '核对方法变更：版本 1 → 版本 2' })
    expect(screen.getByText('做法')).toBeInTheDocument()
    expect(screen.getByText('验收规则')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认更换引用' })).toBeDisabled()
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '核对这次装配' }))
    await screen.findByText('输入连接和版本已通过核对；确认后才会保存到工作稿。')
    fireEvent.click(screen.getByRole('button', { name: '确认更换引用' }))
    await waitFor(() =>
      expect(apply).toHaveBeenCalledWith(method.method_id, 2, { ...command, digest: newer.digest }),
    )
  })

  it('cannot change versions without verifying the original pinned digest', async () => {
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation(async (url: string, ...args: unknown[]) => {
      if (url.endsWith('/versions/2'))
        return respond({ ...method, version: 2, digest: 'sha256:' + 'b'.repeat(64) })
      return original(url, ...args)
    })
    renderPicker({ currentRef: { ...ref, digest: 'sha256:' + '0'.repeat(64) } })
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('要引用的版本'), { target: { value: '2' } })
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([url]) => url.endsWith('/versions/2'))).toBe(true),
    )
    await screen.findByText('原引用版本未能核实，暂不能核对更换。请关闭后重试。')
    expect(screen.queryByRole('button', { name: '核对这次装配' })).not.toBeInTheDocument()
  })

  it('requires remapping a renamed input slot and preserves the old reference until confirmed', async () => {
    const newer = structuredClone(method)
    newer.version = 2
    newer.digest = 'sha256:' + 'c'.repeat(64)
    newer.definition.input_schemas = { observations: method.definition.input_schemas.records }
    newer.definition.step.uses = ['observations']
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation(async (url: string, ...args: unknown[]) => {
      if (url.endsWith('/versions/2')) return respond(newer)
      return original(url, ...args)
    })
    const apply = renderPicker({ currentRef: ref })
    await screen.findByLabelText('输入「records」来自')
    fireEvent.change(screen.getByLabelText('要引用的版本'), { target: { value: '2' } })
    expect(await screen.findByLabelText('输入「observations」来自')).toHaveValue('')
    expect(screen.getByText('输入结构')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '核对这次装配' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '确认更换引用' })).toBeDisabled()
    expect(apply).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('要引用的版本'), { target: { value: '1' } })
    expect(await screen.findByLabelText('输入「records」来自')).toHaveValue('inspect')
    expect(screen.queryByText('输入结构')).not.toBeInTheDocument()
    expect(fetcher.mock.calls.some(([url]) => url.endsWith('/bind'))).toBe(false)
  })

  it('leaves the selection visible after a revision conflict without reporting success', async () => {
    const apply = vi.fn(async () => {
      return await bindMethod(method.method_id, 1, command, CSRF).then(() => undefined)
    })
    fetcher.mockImplementation(async (url: string) => {
      if (url === path + '/bind')
        return respond({ code: 'workdraft_revision', message_key: 'conflict' }, 409)
      if (url === path + '/preview-binding') return respond(preview)
      if (url === path) return respond(method)
      return respond({ items: [] })
    })
    renderPicker({ currentRef: ref, onApply: apply })
    fireEvent.click(await screen.findByRole('button', { name: '核对这次装配' }))
    await screen.findByText('输入连接和版本已通过核对；确认后才会保存到工作稿。')
    fireEvent.click(screen.getByRole('button', { name: '确认更换引用' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('工作稿已更新')
    expect(screen.getByLabelText('输入「records」来自')).toHaveValue('inspect')
    expect(screen.getByRole('button', { name: '确认更换引用' })).toBeDisabled()
  })
})
