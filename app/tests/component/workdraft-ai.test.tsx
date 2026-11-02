import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkdraftView } from '@/components/knowbots/workdraft-view'
import type { Round, Suggestion, Workdraft, WorkdraftBody } from '@/contracts/workdraft'
import { ApiClientError } from '@/lib/common/api-client'
import {
  acceptStep,
  cancelRound,
  decideSuggestion,
  fetchDetail,
  fetchLibrary,
  fetchRound,
  fetchRoundComputers,
  fetchRounds,
  fetchWorkdraft,
  pickData,
  previewWorkdraft,
  refreshRound,
  saveWorkdraftCells,
  seedSkill,
  startRound,
} from '@/lib/knowbots/client'
import { newStep } from '@/lib/knowbots/workdraft'
import messages from '@/messages/zh-CN.json'

import { CSRF, QUESTION, REQUEST, detail, renderWith, testRecord } from './knowbot-fixtures'

// 工作稿上的 AI（专家孵化方案第八、九节）：两个按钮发起一轮（费用上限、选电脑默认上次）、进行中
// 与取消、格子旁的建议三个按钮、核不上的只能改了再接受、加一步的建议是待接受的新步、缺口区、导入
// skill 当种子。

vi.mock('@/lib/knowbots/client', () => ({
  fetchWorkdraft: vi.fn(),
  saveWorkdraftCells: vi.fn(),
  importWorkdraft: vi.fn(),
  copyWorkdraft: vi.fn(),
  previewWorkdraft: vi.fn(),
  publishWorkdraft: vi.fn(),
  fetchDetail: vi.fn(),
  fetchRounds: vi.fn(),
  fetchRound: vi.fn(),
  refreshRound: vi.fn(),
  startRound: vi.fn(),
  cancelRound: vi.fn(),
  decideSuggestion: vi.fn(),
  seedSkill: vi.fn(),
  fetchRoundComputers: vi.fn(),
  acceptStep: vi.fn(),
  fetchLibrary: vi.fn(),
  pickData: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const w = messages.workdraft
const a = messages.workdraft.ai
const ROUND = '7b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
const ENV = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'

function body(over: Partial<WorkdraftBody> = {}): WorkdraftBody {
  return {
    name: '',
    tagline: '',
    scope: { does: '', does_not: '', elsewhere: '' },
    data_picks: [],
    steps: [{ ...newStep('s1'), title: '数据摸底' }],
    ...over,
  }
}

function workdraft(over: Partial<Workdraft> = {}): Workdraft {
  return {
    contract_version: 1,
    request_id: REQUEST,
    title: '财务分析与预测',
    revision: 2,
    body: body(),
    sources: {},
    origins: {},
    data_formats: {},
    updated_at: null,
    ...over,
  }
}

function suggestion(over: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 's1',
    path: 'scope/does',
    op: 'set',
    value: '分析一家公司的三张表',
    reason: '创意里写了解决什么',
    sources: [{ path: 'scope/does', kind: 'idea', quote: '按我的口径分析一家公司的三张表' }],
    kinds: ['idea'],
    verified: true,
    problems: [],
    state: 'pending',
    ...over,
  }
}

function round(over: Partial<Round> = {}): Round {
  return {
    incubation_id: ROUND,
    round: 1,
    action: 'draft',
    instruction: null,
    step_id: null,
    status: 'succeeded',
    budget_limit: '20',
    spent: '3.5',
    currency: 'CNY',
    waiting_for: null,
    error: null,
    started_at: '2026-10-28T01:00:00Z',
    finished_at: '2026-10-28T01:05:00Z',
    suggestions: [],
    gaps: [],
    ...over,
  }
}

function refused(code: string, status = 409): ApiClientError {
  return new ApiClientError(status, {
    code,
    message_key: 'errors.requestFailed',
    retryable: false,
    correlation_id: 'c',
  })
}

function page() {
  return renderWith(<WorkdraftView requestId={REQUEST} csrfToken={CSRF} saveDelay={5} />)
}

/** 有一轮成了的：列表里一条，取它回这一份。 */
function withRound(full: Round) {
  const { suggestions: _s, gaps: _g, ...brief } = full
  void _s
  void _g
  vi.mocked(fetchRounds).mockResolvedValue([brief])
  vi.mocked(fetchRound).mockResolvedValue(full)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchDetail).mockResolvedValue(detail())
  vi.mocked(fetchWorkdraft).mockResolvedValue(workdraft())
  vi.mocked(saveWorkdraftCells).mockResolvedValue(workdraft())
  vi.mocked(previewWorkdraft).mockResolvedValue({
    contract_version: 1,
    version: '1',
    manifest: {},
    problems: [],
  })
  vi.mocked(fetchRounds).mockResolvedValue([])
  vi.mocked(fetchRoundComputers).mockResolvedValue({
    computers: [
      { environment_id: ENV, name: '我的电脑', online: true, roots: ['/home/me/work'] },
      { environment_id: OTHER, name: '公司电脑', online: true, roots: ['/w1', '/w2'] },
    ],
    last: { environment_id: OTHER, workspace_root: '/w2' },
    model_key: true,
  })
})

describe('发起一轮', () => {
  it('AI 起草：费用上限默认 20，电脑默认上次那台与目录', async () => {
    vi.mocked(startRound).mockResolvedValue(round({ status: 'queued', spent: null }))
    page()
    fireEvent.click(await screen.findByRole('button', { name: w.toolbar.aiDraft }))
    const dialog = within(await screen.findByRole('dialog', { name: a.draftTitle }))
    await waitFor(() => expect(dialog.getByLabelText(a.computer)).toHaveValue(OTHER))
    expect(dialog.getByLabelText(a.folder)).toHaveValue('/w2')
    expect(dialog.getByLabelText(a.budget)).toHaveValue('20')
    fireEvent.click(dialog.getByRole('button', { name: a.start }))
    await waitFor(() =>
      expect(startRound).toHaveBeenCalledWith(
        REQUEST,
        {
          action: 'draft',
          budget_limit: '20',
          environment_id: OTHER,
          workspace_root: '/w2',
        },
        CSRF,
      ),
    )
    expect(await screen.findByText('第 1 轮发起了：跑完会把建议显示在格子旁边。')).toBeVisible()
  })

  it('让 AI 改…：一句话、可选某一步、费用上限与电脑可以改；没写那句话不能发', async () => {
    vi.mocked(startRound).mockResolvedValue(round({ status: 'queued', action: 'revise' }))
    page()
    fireEvent.click(await screen.findByRole('button', { name: w.toolbar.aiRevise }))
    const dialog = within(await screen.findByRole('dialog', { name: a.reviseTitle }))
    await waitFor(() => expect(dialog.getByLabelText(a.computer)).toHaveValue(OTHER))
    expect(dialog.getByRole('button', { name: a.start })).toBeDisabled()
    fireEvent.change(dialog.getByLabelText(a.instruction), { target: { value: '拆成两步' } })
    fireEvent.change(dialog.getByLabelText(a.whichStep), { target: { value: 's1' } })
    fireEvent.change(dialog.getByLabelText(a.computer), { target: { value: ENV } })
    fireEvent.change(dialog.getByLabelText(a.budget), { target: { value: '0' } })
    expect(dialog.getByRole('button', { name: a.start })).toBeDisabled()
    fireEvent.change(dialog.getByLabelText(a.budget), { target: { value: '8.5' } })
    fireEvent.click(dialog.getByRole('button', { name: a.start }))
    await waitFor(() =>
      expect(startRound).toHaveBeenCalledWith(
        REQUEST,
        {
          action: 'revise',
          instruction: '拆成两步',
          step_id: 's1',
          budget_limit: '8.5',
          environment_id: ENV,
          workspace_root: '/home/me/work',
        },
        CSRF,
      ),
    )
  })

  it('没有能用的电脑、已有一轮在跑：照说怎么办', async () => {
    vi.mocked(startRound).mockRejectedValue(refused('author_has_no_computer'))
    page()
    fireEvent.click(await screen.findByRole('button', { name: w.toolbar.aiDraft }))
    const dialog = within(await screen.findByRole('dialog', { name: a.draftTitle }))
    await waitFor(() => expect(dialog.getByLabelText(a.computer)).toHaveValue(OTHER))
    fireEvent.click(dialog.getByRole('button', { name: a.start }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(a.errors.author_has_no_computer)
  })
})

describe('发起前就拦、带测试报告（SDD 0046 第三节；专家孵化方案第 8.4 节）', () => {
  it('模型 key 没填：说清楚去 knowbench 填，发起点不了', async () => {
    vi.mocked(fetchRoundComputers).mockResolvedValue({
      computers: [{ environment_id: ENV, name: '我的电脑', online: true, roots: ['/w'] }],
      last: null,
      model_key: false,
    })
    page()
    fireEvent.click(await screen.findByRole('button', { name: w.toolbar.aiDraft }))
    const dialog = within(await screen.findByRole('dialog', { name: a.draftTitle }))
    expect(await dialog.findByTestId('no-model-key')).toHaveTextContent(a.noModelKey)
    expect(dialog.getByRole('button', { name: a.start })).toBeDisabled()
    expect(startRound).not.toHaveBeenCalled()
  })

  it('让 AI 改…：最近一次测试没通过时默认带上报告，可以不带', async () => {
    vi.mocked(fetchDetail).mockResolvedValue(
      detail({ tests: [testRecord({ number: 1 }), testRecord({ number: 2, status: 'failed' })] }),
    )
    vi.mocked(startRound).mockResolvedValue(round({ status: 'queued', action: 'revise' }))
    page()
    fireEvent.click(await screen.findByRole('button', { name: w.toolbar.aiRevise }))
    const dialog = within(await screen.findByRole('dialog', { name: a.reviseTitle }))
    const box = await dialog.findByRole('checkbox', { name: /第 2 次测试（没通过）/ })
    expect(box).toBeChecked()
    fireEvent.change(dialog.getByLabelText(a.instruction), { target: { value: '照报告改' } })
    await waitFor(() => expect(dialog.getByLabelText(a.computer)).toHaveValue(OTHER))
    fireEvent.click(dialog.getByRole('button', { name: a.start }))
    await waitFor(() =>
      expect(startRound).toHaveBeenCalledWith(
        REQUEST,
        expect.objectContaining({ action: 'revise', instruction: '照报告改', with_test: true }),
        CSRF,
      ),
    )
  })
})

describe('进行中的一轮', () => {
  it('在跑的：显示状态与花费，轮询刷新，可以取消；在跑时两个按钮不能点', async () => {
    const running = round({ status: 'running', spent: '1.2', suggestions: undefined })
    vi.mocked(fetchRounds).mockResolvedValue([running])
    vi.mocked(refreshRound).mockResolvedValue(running)
    vi.mocked(cancelRound).mockResolvedValue(round({ status: 'cancelled' }))
    page()
    const bar = within(await screen.findByTestId('round-bar'))
    expect(bar.getByText(a.status.running)).toBeInTheDocument()
    expect(bar.getByText('花了 1.2 / 上限 20 元')).toBeInTheDocument()
    await waitFor(() => expect(refreshRound).toHaveBeenCalledWith(REQUEST, ROUND, CSRF))
    expect(screen.getByRole('button', { name: w.toolbar.aiDraft })).toBeDisabled()
    expect(screen.getByRole('button', { name: w.toolbar.aiRevise })).toBeDisabled()
    vi.mocked(fetchRounds).mockResolvedValue([round({ status: 'cancelled' })])
    fireEvent.click(bar.getByRole('button', { name: a.cancel }))
    await waitFor(() => expect(cancelRound).toHaveBeenCalledWith(REQUEST, ROUND, CSRF))
    expect(await screen.findByText(a.status.cancelled)).toBeInTheDocument()
  })
})

describe('格子旁边的建议', () => {
  it('三个按钮：接受带 revision，改工作稿；不要不碰工作稿', async () => {
    withRound(
      round({
        suggestions: [
          suggestion(),
          suggestion({
            id: 's2',
            path: 'name',
            value: '财务分析',
            kinds: ['proposal'],
            sources: [],
          }),
        ],
      }),
    )
    const after = workdraft({
      revision: 3,
      body: body({ scope: { does: '分析一家公司的三张表', does_not: '', elsewhere: '' } }),
      sources: { 'scope/does': { kind: 'user_text', ref: 'idea:1:10+15:abcdefabcdef' } },
      origins: { 'scope/does': 'idea' },
    })
    vi.mocked(decideSuggestion).mockImplementation(async (_r, _i, id, decision) => ({
      workdraft: decision.action === 'reject' ? workdraft() : after,
      round: round({
        suggestions: [
          suggestion({ state: id === 's1' ? 'accepted' : 'pending' }),
          suggestion({ id: 's2', path: 'name', state: id === 's2' ? 'rejected' : 'pending' }),
        ],
      }),
    }))
    page()
    const box = within(await screen.findByTestId('suggestion-s1'))
    expect(box.getByText('分析一家公司的三张表')).toBeInTheDocument()
    expect(box.getByText('出自你创意里的原话：「按我的口径分析一家公司的三张表」')).toBeVisible()
    const other = within(screen.getByTestId('suggestion-s2'))
    expect(other.getByText(a.fromProposal)).toBeInTheDocument()
    fireEvent.click(box.getByRole('button', { name: a.accept }))
    await waitFor(() =>
      expect(decideSuggestion).toHaveBeenCalledWith(
        REQUEST,
        ROUND,
        's1',
        { action: 'accept', revision: 2 },
        CSRF,
      ),
    )
    await waitFor(() =>
      expect(screen.getByLabelText(w.expert.does)).toHaveValue('分析一家公司的三张表'),
    )
    expect(screen.getByTestId('origin-scope/does')).toHaveTextContent(w.origin.idea)
    await waitFor(() => expect(screen.queryByTestId('suggestion-s1')).toBeNull())
    fireEvent.click(
      within(screen.getByTestId('suggestion-s2')).getByRole('button', { name: a.reject }),
    )
    await waitFor(() =>
      expect(decideSuggestion).toHaveBeenLastCalledWith(
        REQUEST,
        ROUND,
        's2',
        { action: 'reject' },
        CSRF,
      ),
    )
  })

  it('出处核不上的：接受点不了，只能改了再接受，带改后的话', async () => {
    withRound(
      round({
        suggestions: [
          suggestion({
            id: 's3',
            path: 'tagline',
            value: '按我的方法分析财报',
            verified: false,
            sources: [{ path: 'tagline', kind: 'idea', quote: '我没说过' }],
            problems: [{ path: 'tagline', problem: 'quote_not_in_idea' }],
          }),
        ],
      }),
    )
    vi.mocked(decideSuggestion).mockResolvedValue({
      workdraft: workdraft({ revision: 3, body: body({ tagline: '我自己的话' }) }),
      round: round(),
    })
    page()
    const box = within(await screen.findByTestId('suggestion-s3'))
    expect(box.getByTestId('unverified-s3')).toHaveTextContent(a.unverified)
    expect(box.getByRole('button', { name: a.accept })).toBeDisabled()
    fireEvent.click(box.getByRole('button', { name: a.edit }))
    const edit = box.getByLabelText(a.editLabel)
    expect(edit).toHaveValue('按我的方法分析财报')
    fireEvent.change(edit, { target: { value: '我自己的话' } })
    fireEvent.click(box.getByRole('button', { name: a.acceptEdited }))
    await waitFor(() =>
      expect(decideSuggestion).toHaveBeenCalledWith(
        REQUEST,
        ROUND,
        's3',
        { action: 'accept_edited', revision: 2, value: '我自己的话' },
        CSRF,
      ),
    )
    await waitFor(() => expect(screen.getByLabelText(w.expert.tagline)).toHaveValue('我自己的话'))
  })

  it('加一步的建议在步骤列表里是待接受的新步；别处改过回 409 就重新载入', async () => {
    withRound(
      round({
        suggestions: [
          suggestion({
            id: 's4',
            path: 'steps/s2',
            op: 'add',
            value: { title: '看趋势', does: '看近三年收入' },
            kinds: ['proposal'],
            sources: [],
          }),
          suggestion({ id: 's5', path: 'steps/s1/title', value: '摸清数据' }),
        ],
      }),
    )
    vi.mocked(decideSuggestion).mockRejectedValue(refused('workdraft_revision'))
    page()
    const pending = within(await screen.findByTestId('pending-step-s4'))
    expect(pending.getByText('待接受的新步：看趋势')).toBeInTheDocument()
    // 一格的建议在那一格旁边
    const step = within(screen.getByTestId('step-s1'))
    expect(step.getByTestId('suggestion-s5')).toBeInTheDocument()
    fireEvent.click(pending.getByRole('button', { name: a.accept }))
    expect(await screen.findByText(w.conflict)).toBeInTheDocument()
    expect(fetchWorkdraft).toHaveBeenCalledTimes(2)
  })
})

describe('一键接受一步、挑数据', () => {
  it('一步头上「全部接受」：带 revision 交这一步，跳过的照实说', async () => {
    const pending = [
      suggestion({
        id: 'a1',
        path: 'steps/s1/why',
        value: '先知道手上有什么',
        kinds: ['proposal'],
        sources: [],
      }),
      suggestion({
        id: 'a2',
        path: 'steps/s1/title',
        value: '摸底',
        kinds: ['proposal'],
        sources: [],
      }),
    ]
    withRound(round({ suggestions: pending }))
    vi.mocked(acceptStep).mockResolvedValue({
      workdraft: workdraft({
        revision: 3,
        body: body({ steps: [{ ...newStep('s1'), title: '摸底' }] }),
      }),
      round: round({ suggestions: pending.map((x) => ({ ...x, state: 'accepted' as const })) }),
      accepted: ['a2'],
      skipped: ['a1'],
    })
    page()
    const step = within(await screen.findByTestId('step-s1'))
    fireEvent.click(await step.findByRole('button', { name: a.acceptStep.replace('{n}', '2') }))
    await waitFor(() => expect(acceptStep).toHaveBeenCalledWith(REQUEST, ROUND, 's1', 2, CSRF))
    expect(await screen.findByRole('alert')).toHaveTextContent('接受了 1 条；1 条')
  })

  it('数据：从知识库栏挑一份，后端记下格式，显示名字与读法', async () => {
    vi.mocked(fetchLibrary).mockResolvedValue([
      {
        material_id: 'm1',
        name: '2024 年报.pdf',
        mine: true,
        description: { subject: '600519.SH', doc_type: 'annual_report' },
      },
    ])
    vi.mocked(pickData).mockResolvedValue(
      workdraft({
        revision: 3,
        body: body({ data_picks: ['m1'] }),
        data_formats: {
          m1: {
            name: '2024 年报.pdf',
            media_type: 'application/pdf',
            description: {},
            readings: ['text'],
          },
        },
      }),
    )
    page()
    fireEvent.click(await screen.findByRole('button', { name: w.data.add }))
    const picker = within(await screen.findByTestId('data-picker'))
    fireEvent.click(await picker.findByRole('button', { name: w.data.pick }))
    await waitFor(() =>
      expect(pickData).toHaveBeenCalledWith(REQUEST, { revision: 2, picks: ['m1'] }, CSRF),
    )
    const picks = within(await screen.findByTestId('data-picks'))
    expect(picks.getByText('2024 年报.pdf')).toBeVisible()
    expect(picks.getByText(/读法：text/)).toBeVisible()
    expect(saveWorkdraftCells).not.toHaveBeenCalled()
  })
})

describe('缺口与导入 skill', () => {
  it('待你定的：列这一轮的缺口，链到审核栏去答；答过了可以让 AI 按答复改', async () => {
    withRound(
      round({
        gaps: [
          {
            gap_id: 'g1',
            question: '毛利率按哪个口径？',
            proposal: '营业收入减营业成本',
            options: [],
            question_id: QUESTION,
            answered: false,
            answer: null,
          },
          {
            gap_id: 'g2',
            question: '预测几年？',
            proposal: '三年',
            options: [],
            question_id: ROUND,
            answered: true,
            answer: { option_id: 'proposal' },
          },
        ],
      }),
    )
    page()
    const gaps = within(await screen.findByTestId('gaps'))
    expect(gaps.getByText('毛利率按哪个口径？')).toBeInTheDocument()
    expect(gaps.getByText('提议：营业收入减营业成本')).toBeInTheDocument()
    expect(gaps.getByRole('link', { name: a.toReview })).toHaveAttribute(
      'href',
      `/review?item=${QUESTION}`,
    )
    expect(gaps.getByText(a.gapAnswered)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: a.reviseWithAnswers }))
    const dialog = within(await screen.findByRole('dialog', { name: a.reviseTitle }))
    expect(dialog.getByLabelText(a.instruction)).toHaveValue(a.withAnswers)
  })

  it('导入 skill 当种子：存成创意的新一版，提示去点 AI 起草', async () => {
    vi.mocked(seedSkill).mockResolvedValue(3)
    page()
    fireEvent.click(await screen.findByRole('button', { name: w.toolbar.import }))
    const dialog = within(await screen.findByRole('dialog', { name: w.import.title }))
    fireEvent.click(dialog.getByLabelText(w.import.modeSkill))
    fireEvent.change(dialog.getByLabelText(w.import.skillText), {
      target: { value: '# 我的 skill' },
    })
    fireEvent.click(dialog.getByRole('button', { name: w.import.seedSubmit }))
    await waitFor(() => expect(seedSkill).toHaveBeenCalledWith(REQUEST, '# 我的 skill', CSRF))
    expect(await screen.findByText(/存成了创意第 3 版/)).toBeInTheDocument()
  })
})
