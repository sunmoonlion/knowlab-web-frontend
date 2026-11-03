import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MethodDemandReference } from '@/components/knowbots/method-demand-reference'
import { detailSchema } from '@/contracts/knowbots'

import { detail, renderWith } from './knowbot-fixtures'

describe('从问题转入孵化的方法需求', () => {
  it('经详情契约解析后保留需求、建议、缺口，不能自动接受或绑定方法', () => {
    const parsed = detailSchema.parse(
      detail({
        origin: {
          app: 'knowbench',
          task_id: 'task-1',
          project_id: 'project-1',
          method_demand: {
            match_artifact_version: 2,
            question_revision: 1,
            outcome: 'none',
            requirements: [
              {
                id: 'r1',
                kind: 'result',
                statement: '预测下季营收',
                question_quote: '预测下季营收',
                required: true,
                origin: 'user_explicit',
                rationale: '问题明确要求预测',
              },
            ],
            method_proposals: [
              {
                id: 'm1',
                requirement_ids: ['r1'],
                approach: '考虑季节性同比预测',
                reason: '供作者选择的建议',
                data_requirements: ['历史季度营收'],
              },
            ],
            gaps: [{ requirement_id: 'r1', status: 'uncovered', reason: '现有专家只分析历史' }],
            clarification: null,
          },
        },
      }),
    )
    renderWith(<MethodDemandReference origin={parsed.origin} />)
    expect(screen.getByText(/建议尚未经你接受/)).toBeInTheDocument()
    expect(screen.getByText(/用户明确要求/)).toBeInTheDocument()
    expect(screen.getByText(/现有专家只分析历史/)).toBeInTheDocument()
    expect(screen.getByText('考虑季节性同比预测')).toBeInTheDocument()
    expect(screen.getByText(/历史季度营收/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('历史申请没有需求上下文时不显示空卡片', () => {
    const { container } = renderWith(<MethodDemandReference origin={{ app: 'knowbench' }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
