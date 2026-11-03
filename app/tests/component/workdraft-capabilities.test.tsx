import { fireEvent, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CapabilityCard } from '@/components/knowbots/workdraft-capabilities'
import { InputRequirements } from '@/components/knowbots/workdraft-inputs'
import { workdraftSchema, bodySchema } from '@/contracts/workdraft'
import { methodVersionSchema } from '@/contracts/author-methods'
import { diffEdits, newStep } from '@/lib/knowbots/workdraft'
import fixture from '../fixtures/author-method.json'
import { renderWith } from './knowbot-fixtures'

const body = workdraftSchema.parse(fixture.workdraft).body

it('作者明确保存公开承诺和私有支撑，同一请求重开保持全部字段', () => {
  const save = vi.fn()
  renderWith(<CapabilityCard body={body} disabled={false} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑能力声明' }))
  fireEvent.click(screen.getByRole('button', { name: '添加能力' }))
  fireEvent.change(screen.getByLabelText('能解决什么'), { target: { value: '核对材料' } })
  fireEvent.change(screen.getByLabelText('交付什么（每行一条）'), {
    target: { value: '核对报告\n' },
  })
  const upstream = body.steps.find((s) => s.id === 'inspect')!
  fireEvent.click(screen.getByRole('checkbox', { name: upstream.title }))
  fireEvent.click(
    screen.getByRole('checkbox', { name: `${upstream.title} · ${upstream.outputs[0].name}` }),
  )
  fireEvent.click(screen.getByRole('button', { name: '确认并保存' }))
  expect(save).toHaveBeenCalledOnce()
  const saved = bodySchema.parse(save.mock.calls[0][0])
  expect(saved.public_capabilities?.[0].delivers).toEqual(['核对报告'])
  expect(saved.planning?.capability_bindings?.cap1.required_units).toEqual(['inspect'])
  expect(diffEdits(body, saved).map((e) => e.path)).toEqual(['planning', 'public_capabilities'])
  expect(bodySchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
})

it('可选覆盖输入必须同时明确条件，不能直接关闭验收', () => {
  const save = vi.fn()
  const step = {
    ...newStep('report'),
    uses: ['inspect'],
    checks: [
      {
        template: 'covers' as const,
        params: { path: 'rows', field: 'name', source_step: 'inspect', source_path: 'rows' },
      },
    ],
  }
  renderWith(
    <InputRequirements
      step={step}
      earlier={[{ ...newStep('inspect'), title: '核对' }]}
      onChange={save}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '设置必需输入与验收条件' }))
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('button', { name: '确认并保存' })).toBeDisabled()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'inspect' } })
  fireEvent.click(screen.getByRole('button', { name: '确认并保存' }))
  expect(save.mock.calls[0][0]).toMatchObject({
    input_required: { inspect: false },
    checks: [{ when_input_present: 'inspect' }],
  })
})

it('新独立方法版本和条件字段不会被网页契约剥掉', () => {
  const source = methodVersionSchema.parse(fixture.method)
  if (source.definition.schema === 'knowlab/method-definition/v3')
    throw new Error('legacy fixture expected')
  const next = methodVersionSchema.parse({
    ...source,
    definition: {
      ...source.definition,
      schema: 'knowlab/method-definition/v2',
      input_required: { records: false },
      step: {
        ...source.definition.step,
        checks: [
          { template: 'non_empty', params: { path: 'report' }, when_input_present: 'records' },
        ],
      },
    },
  })
  expect(next.definition).toHaveProperty('input_required.records', false)
  if (next.definition.schema !== 'knowlab/method-definition/v2') throw new Error('v2 expected')
  expect(next.definition.step.checks[0].when_input_present).toBe('records')
  expect(methodVersionSchema.parse(fixture.method)).toEqual(source)
})
