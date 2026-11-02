import { screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { TestResults } from '@/components/knowbots/test-results'
import { caseOutputsSchema } from '@/contracts/knowbots'
import { outputs, renderWith, testRecord } from './knowbot-fixtures'

afterEach(() => vi.unstubAllGlobals())

it('renders every final result and file while marking invalidated attempts as history', async () => {
  const payload = outputs()
  payload.cases[0].outputs = caseOutputsSchema.parse({
    contract: 'knowbot-test-run/v1',
    run_id: 'synthetic-dynamic-test',
    case_id: 'c1',
    plan_version: 3,
    deliverable: null,
    final_outputs: [
      {
        method_id: 'inspection',
        instance_id: 'inspection_2',
        result: { id: '32adb685-ab1a-4ad3-a542-b7df318f67da', version: 2, digest: 'a'.repeat(64) },
        artifact: { rows: ['synthetic checked item'] },
        deliverable: { path: 'inspection.md', text: '# Inspection file' },
      },
      {
        method_id: 'report',
        instance_id: 'report_7',
        result: { id: '42adb685-ab1a-4ad3-a542-b7df318f67da', version: 1, digest: 'b'.repeat(64) },
        artifact_omitted_bytes: 300000,
        deliverable: { path: 'report.md', text: '# Report file', truncated: true },
        note: 'synthetic size note',
      },
      {
        method_id: 'appendix',
        instance_id: 'appendix_1',
        result: null,
        note: 'synthetic pending note',
      },
    ],
    steps: [
      {
        step_id: 'inspection_1',
        title: 'Earlier inspection',
        outcome: 'accepted',
        current: false,
        artifact: { old: true },
      },
    ],
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
  )
  renderWith(<TestResults test={testRecord()} cases={[]} />)
  await screen.findByText('采用计划版本 3')
  expect(screen.getByRole('heading', { name: 'Inspection file' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Report file' })).toBeInTheDocument()
  expect(screen.getByText('尚无当前有效成果')).toBeInTheDocument()
  expect(screen.getByText('此尝试已失效，仅保留历史记录。')).toBeInTheDocument()
  expect(screen.getByText('synthetic size note')).toBeInTheDocument()
  expect(screen.getByText('synthetic pending note')).toBeInTheDocument()
})
