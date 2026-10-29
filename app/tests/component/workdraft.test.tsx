import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkdraftView } from '@/components/knowbots/workdraft-view'
import type { CellEdit, Preview, Step, Workdraft, WorkdraftBody } from '@/contracts/workdraft'
import { ApiClientError } from '@/lib/common/api-client'
import {
  copyWorkdraft,
  decideProposal,
  fetchDetail,
  fetchWorkdraft,
  importWorkdraft,
  previewWorkdraft,
  publishWorkdraft,
  saveWorkdraftCells,
} from '@/lib/knowbots/client'
import { diffEdits, newStep } from '@/lib/knowbots/workdraft'
import messages from '@/messages/zh-CN.json'

import { CSRF, DRAFT, REQUEST, detail, draft, renderWith, router } from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({
  fetchWorkdraft: vi.fn(),
  saveWorkdraftCells: vi.fn(),
  importWorkdraft: vi.fn(),
  copyWorkdraft: vi.fn(),
  previewWorkdraft: vi.fn(),
  publishWorkdraft: vi.fn(),
  fetchDetail: vi.fn(),
  // AI 孵化的各轮（这里没有，见 workdraft-ai.test）
  fetchRounds: vi.fn(async () => []),
  fetchRound: vi.fn(),
  refreshRound: vi.fn(),
  startRound: vi.fn(),
  cancelRound: vi.fn(),
  decideSuggestion: vi.fn(),
  decideProposal: vi.fn(),
  seedSkill: vi.fn(),
  fetchRoundComputers: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const w = messages.workdraft

function emptyBody(): WorkdraftBody {
  return {
    name: '',
    tagline: '',
    scope: { does: '', does_not: '', elsewhere: '' },
    data_picks: [],
    steps: [],
  }
}

function step(id: string, over: Partial<Step> = {}): Step {
  return { ...newStep(id), ...over }
}

function workdraft(over: Partial<Workdraft> = {}): Workdraft {
  return {
    contract_version: 1,
    request_id: REQUEST,
    title: '财务分析与预测',
    revision: 0,
    body: emptyBody(),
    sources: {},
    origins: {},
    updated_at: null,
    ...over,
  }
}

function preview(over: Partial<Preview> = {}): Preview {
  return {
    contract_version: 1,
    version: '1',
    manifest: { schema: 'knowbot-manifest/v2' },
    problems: [],
    ...over,
  }
}

/** 后端存格子的样子（只管测试里用到的几种路径）：回改后的整份，revision 加 1，改过的格子算作者写的。 */
function stored(current: Workdraft, cells: CellEdit[]): Workdraft {
  const body = structuredClone(current.body)
  const origins = { ...current.origins }
  for (const { path, value } of cells) {
    const parts = path.split('/')
    if (parts[0] === 'scope') body.scope[parts[1] as 'does'] = value as string
    else if (parts.length === 1) (body as Record<string, unknown>)[path] = value
    else {
      const at = body.steps.findIndex((s) => s.id === parts[1])
      body.steps[at] = { ...body.steps[at], [parts[2]]: value }
    }
    origins[path] = 'edit'
  }
  return { ...current, body, origins, revision: current.revision + 1 }
}

let server: Workdraft

function conflict(): ApiClientError {
  return new ApiClientError(409, {
    code: 'workdraft_revision',
    message_key: 'errors.requestFailed',
    retryable: false,
    correlation_id: 'c',
  })
}

function refused(code: string, status = 400): ApiClientError {
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

beforeEach(() => {
  server = workdraft()
  vi.mocked(fetchWorkdraft)
    .mockReset()
    .mockImplementation(async () => server)
  vi.mocked(saveWorkdraftCells)
    .mockReset()
    .mockImplementation(async (_, { cells }) => {
      server = stored(server, cells)
      return server
    })
  vi.mocked(previewWorkdraft).mockReset().mockResolvedValue(preview())
  vi.mocked(publishWorkdraft).mockReset()
  vi.mocked(importWorkdraft).mockReset()
  vi.mocked(copyWorkdraft).mockReset()
  vi.mocked(fetchDetail).mockReset().mockResolvedValue(detail())
})

describe('工作稿：格子与自动保存（专家孵化方案第六节）', () => {
  it('改一格过一会儿自动存，带读到的 revision；存了标「作者写的」，下一次带新的 revision', async () => {
    page()
    const name = await screen.findByLabelText(w.expert.name)
    fireEvent.change(name, { target: { value: '财务分析' } })
    expect(screen.getByRole('status')).toHaveTextContent(w.status.pending)
    await waitFor(() =>
      expect(saveWorkdraftCells).toHaveBeenCalledWith(
        REQUEST,
        { revision: 0, cells: [{ path: 'name', value: '财务分析' }] },
        CSRF,
      ),
    )
    expect(await screen.findByTestId('origin-name')).toHaveTextContent(w.origin.edit)
    expect(screen.getByRole('status')).toHaveTextContent(w.status.saved)
    fireEvent.change(screen.getByLabelText(w.expert.does), { target: { value: 'A 股公司' } })
    await waitFor(() =>
      expect(saveWorkdraftCells).toHaveBeenLastCalledWith(
        REQUEST,
        { revision: 1, cells: [{ path: 'scope/does', value: 'A 股公司' }] },
        CSRF,
      ),
    )
  })

  it('别处改过（409）：提示已重新载入，换成后端那一份', async () => {
    page()
    const name = await screen.findByLabelText(w.expert.name)
    vi.mocked(saveWorkdraftCells).mockRejectedValueOnce(conflict())
    server = workdraft({ revision: 3, body: { ...emptyBody(), name: '别处写的' } })
    fireEvent.change(name, { target: { value: '我写的' } })
    expect(await screen.findByText(w.conflict)).toBeInTheDocument()
    expect(fetchWorkdraft).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.getByLabelText(w.expert.name)).toHaveValue('别处写的'))
    fireEvent.change(screen.getByLabelText(w.expert.name), { target: { value: '再改' } })
    await waitFor(() =>
      expect(saveWorkdraftCells).toHaveBeenLastCalledWith(
        REQUEST,
        { revision: 3, cells: [{ path: 'name', value: '再改' }] },
        CSRF,
      ),
    )
  })

  it('步骤可以加、上移、删（删要再点一次确认），整列存', async () => {
    server = workdraft({
      revision: 2,
      body: {
        ...emptyBody(),
        steps: [step('s1', { title: '数据摸底' }), step('s2', { title: '算比率' })],
      },
    })
    page()
    fireEvent.click(await screen.findByRole('button', { name: '上移第 2 步' }))
    await waitFor(() =>
      expect(saveWorkdraftCells).toHaveBeenLastCalledWith(
        REQUEST,
        {
          revision: 2,
          cells: [
            {
              path: 'steps',
              value: [step('s2', { title: '算比率' }), step('s1', { title: '数据摸底' })],
            },
          ],
        },
        CSRF,
      ),
    )
    expect(screen.getByRole('button', { name: '上移第 1 步' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '删掉第 1 步' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删掉第 1 步' }))
    await waitFor(() =>
      expect(saveWorkdraftCells).toHaveBeenLastCalledWith(
        REQUEST,
        { revision: 3, cells: [{ path: 'steps', value: [step('s1', { title: '数据摸底' })] }] },
        CSRF,
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: w.steps.add }))
    await waitFor(() =>
      expect(saveWorkdraftCells).toHaveBeenLastCalledWith(
        REQUEST,
        {
          revision: 4,
          cells: [{ path: 'steps', value: [step('s1', { title: '数据摸底' }), step('s2')] }],
        },
        CSRF,
      ),
    )
    expect(screen.getByRole('region', { name: '第 2 步' })).toBeInTheDocument()
  })

  it('一步里的格子：规则、交回项、用上哪几步，改哪格存哪格', async () => {
    server = workdraft({ body: { ...emptyBody(), steps: [step('s1'), step('s2')] } })
    page()
    const second = within(await screen.findByRole('region', { name: '第 2 步' }))
    fireEvent.click(second.getByRole('checkbox', { name: '第 1 步' }))
    await waitFor(() =>
      expect(saveWorkdraftCells).toHaveBeenLastCalledWith(
        REQUEST,
        { revision: 0, cells: [{ path: 'steps/s2/uses', value: ['s1'] }] },
        CSRF,
      ),
    )
    fireEvent.click(second.getByRole('button', { name: w.step.addRule }))
    fireEvent.change(second.getByLabelText('规则 1'), {
      target: { value: '合并、母公司都有时问用户' },
    })
    await waitFor(() =>
      expect(saveWorkdraftCells).toHaveBeenLastCalledWith(
        REQUEST,
        {
          revision: 1,
          cells: [
            { path: 'steps/s2/rules', value: [{ id: 'r1', text: '合并、母公司都有时问用户' }] },
          ],
        },
        CSRF,
      ),
    )
    // 交回项名字没填好之前不存
    const calls = vi.mocked(saveWorkdraftCells).mock.calls.length
    fireEvent.click(second.getByRole('button', { name: w.step.addOutput }))
    expect(await second.findByText(w.step.nameInvalid)).toBeInTheDocument()
    fireEvent.change(second.getByLabelText('第 1 项的类型'), { target: { value: 'list' } })
    await new Promise((r) => setTimeout(r, 30))
    expect(saveWorkdraftCells).toHaveBeenCalledTimes(calls)
    fireEvent.change(second.getByLabelText('第 1 项的名字'), { target: { value: 'ratios' } })
    await waitFor(() =>
      expect(saveWorkdraftCells).toHaveBeenLastCalledWith(
        REQUEST,
        {
          revision: 2,
          cells: [
            { path: 'steps/s2/outputs', value: [{ name: 'ratios', type: 'list', items: null }] },
          ],
        },
        CSRF,
      ),
    )
  })

  it('怎样算对：选验收模板，参数表单跟着模板换；换模板时「哪一项」留着', async () => {
    server = workdraft({
      body: {
        ...emptyBody(),
        steps: [
          step('s1', {
            title: '数据摸底',
            outputs: [{ name: 'periods', type: 'list', items: null }],
          }),
          step('s2', { outputs: [{ name: 'ratios', type: 'list', items: null }] }),
        ],
      },
    })
    page()
    const second = within(await screen.findByRole('region', { name: '第 2 步' }))
    fireEvent.click(second.getByRole('button', { name: w.step.addCheck }))
    expect(second.getByTestId('params-required')).toBeInTheDocument()
    fireEvent.click(second.getByRole('checkbox', { name: 'ratios' }))
    await waitFor(() =>
      expect(saveWorkdraftCells).toHaveBeenLastCalledWith(
        REQUEST,
        {
          revision: 0,
          cells: [
            {
              path: 'steps/s2/checks',
              value: [{ template: 'required', params: { keys: ['ratios'] } }],
            },
          ],
        },
        CSRF,
      ),
    )
    const template = second.getByLabelText('第 1 条的验收模板')
    fireEvent.change(template, { target: { value: 'list_min' } })
    const params = within(second.getByTestId('params-list_min'))
    fireEvent.change(params.getByLabelText(w.params.path), { target: { value: 'ratios' } })
    fireEvent.change(params.getByLabelText(w.params.min), { target: { value: '3' } })
    await waitFor(() =>
      expect(saveWorkdraftCells).toHaveBeenLastCalledWith(
        REQUEST,
        expect.objectContaining({
          cells: [
            {
              path: 'steps/s2/checks',
              value: [{ template: 'list_min', params: { path: 'ratios', min: 3 } }],
            },
          ],
        }),
        CSRF,
      ),
    )
    fireEvent.change(second.getByLabelText('第 1 条的验收模板'), { target: { value: 'covers' } })
    const covers = within(second.getByTestId('params-covers'))
    expect(covers.getByLabelText(w.params.source_step)).toBeInTheDocument()
    expect(covers.getByLabelText(w.params.path)).toHaveValue('ratios')
    expect(covers.queryByLabelText(w.params.min)).toBeNull()
    fireEvent.change(covers.getByLabelText(w.params.source_step), { target: { value: 's1' } })
    expect(
      within(covers.getByLabelText(w.params.source_path)).getByRole('option', { name: 'periods' }),
    ).toBeInTheDocument()
    fireEvent.change(second.getByLabelText('第 1 条的验收模板'), { target: { value: 'max_chars' } })
    expect(
      within(second.getByTestId('params-max_chars')).getByLabelText(w.params.max),
    ).toBeInTheDocument()
  })

  it('删了前面一条验收，后面那条的参数照它自己的显示', async () => {
    server = workdraft({
      body: {
        ...emptyBody(),
        steps: [
          step('s1', {
            outputs: [{ name: 'ratios', type: 'list', items: null }],
            checks: [
              { template: 'list_min', params: { path: 'ratios', min: 3 } },
              { template: 'list_min', params: { path: 'ratios', min: 5 } },
            ],
          }),
        ],
      },
    })
    page()
    const first = within(await screen.findByTestId('check-0'))
    expect(first.getByLabelText(w.params.min)).toHaveValue('3')
    fireEvent.click(screen.getByRole('button', { name: '删掉第 1 条' }))
    expect(within(screen.getByTestId('check-0')).getByLabelText(w.params.min)).toHaveValue('5')
    expect(screen.queryByTestId('check-1')).toBeNull()
  })

  it('后端预览回来的问题按格子标红；页面上没有那一格的列在顶上', async () => {
    server = workdraft({ body: { ...emptyBody(), steps: [step('s1')] } })
    vi.mocked(previewWorkdraft).mockResolvedValue(
      preview({
        problems: [
          { path: 'steps/s1/title', message: 'name this step' },
          { path: 'scope/does', message: 'say what this expert does' },
          { path: 'pack.workflow[0].tools', message: 'a knowbot cannot use these' },
        ],
      }),
    )
    page()
    const title = await screen.findByLabelText(w.step.title)
    await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByTestId('problem-steps/s1/title')).toHaveTextContent(w.problems.noTitle)
    expect(screen.getByLabelText(w.expert.does)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(w.expert.name)).not.toHaveAttribute('aria-invalid')
    expect(screen.getByTestId('problems-elsewhere')).toHaveTextContent('a knowbot cannot use these')
  })
})

describe('工作稿：顶上的按钮', () => {
  it('AI 起草、让 AI 改…打开了（没有在跑的一轮时能点）', async () => {
    page()
    expect(await screen.findByRole('button', { name: w.toolbar.aiDraft })).toBeEnabled()
    expect(screen.getByRole('button', { name: w.toolbar.aiRevise })).toBeEnabled()
  })

  it('预览清单：弹出编出的清单与问题', async () => {
    vi.mocked(previewWorkdraft).mockResolvedValue(
      preview({ problems: [{ path: 'steps', message: 'add at least one step' }] }),
    )
    page()
    fireEvent.click(await screen.findByRole('button', { name: w.toolbar.preview }))
    const dialog = within(await screen.findByRole('dialog', { name: w.preview.title }))
    expect(dialog.getByText('出不了版本的地方：1 处')).toBeInTheDocument()
    expect(dialog.getByText(w.problems.noSteps)).toBeInTheDocument()
    expect(dialog.getByTestId('preview-manifest')).toHaveTextContent('knowbot-manifest/v2')
  })

  it('出一版成功：提示准专家版本，回名称页', async () => {
    const push = vi.spyOn(router, 'push')
    vi.mocked(publishWorkdraft).mockResolvedValue({
      contract_version: 1,
      draft_id: DRAFT,
      version: '1',
      revision: 2,
      request_version: 1,
      mode: 'self',
    })
    page()
    fireEvent.change(await screen.findByLabelText(w.expert.name), { target: { value: '财务' } })
    fireEvent.click(screen.getByRole('button', { name: w.toolbar.publish }))
    expect(await screen.findByText('出了准专家 1.2。')).toBeInTheDocument()
    // 没存的先存了再出
    expect(saveWorkdraftCells).toHaveBeenCalledTimes(1)
    expect(publishWorkdraft).toHaveBeenCalledWith(REQUEST, CSRF)
    expect(push).toHaveBeenCalledWith(`/names/${REQUEST}?published=1.2`)
    push.mockRestore()
  })

  it('出一版没过：重新预览，问题标到格子上', async () => {
    server = workdraft({ body: { ...emptyBody(), steps: [step('s1')] } })
    vi.mocked(publishWorkdraft).mockRejectedValue(refused('workdraft_invalid'))
    page()
    await screen.findByLabelText(w.step.does)
    vi.mocked(previewWorkdraft).mockResolvedValue(
      preview({ problems: [{ path: 'steps/s1/does', message: 'say what this step does' }] }),
    )
    fireEvent.click(screen.getByRole('button', { name: w.toolbar.publish }))
    expect(await screen.findByText(w.publish.refused)).toBeInTheDocument()
    expect(screen.getByLabelText(w.step.does)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('problem-steps/s1/does')).toHaveTextContent(w.problems.noDoes)
  })

  it('有改动没存上（存的时候出错）：先不出版本', async () => {
    vi.mocked(saveWorkdraftCells).mockRejectedValue(refused('workdraft_invalid'))
    page()
    fireEvent.change(await screen.findByLabelText(w.expert.name), { target: { value: '财务' } })
    fireEvent.click(screen.getByRole('button', { name: w.toolbar.publish }))
    expect(await screen.findByText(w.publish.unsaved)).toBeInTheDocument()
    expect(publishWorkdraft).not.toHaveBeenCalled()
    expect(screen.getByText('没存上（workdraft_invalid），再改一下会重存。')).toBeInTheDocument()
  })

  it('离开页面时还没到点的那次照样存', async () => {
    const { unmount } = renderWith(
      <WorkdraftView requestId={REQUEST} csrfToken={CSRF} saveDelay={10_000} />,
    )
    fireEvent.change(await screen.findByLabelText(w.expert.name), { target: { value: '财务' } })
    expect(saveWorkdraftCells).not.toHaveBeenCalled()
    unmount()
    expect(saveWorkdraftCells).toHaveBeenCalledWith(
      REQUEST,
      { revision: 0, cells: [{ path: 'name', value: '财务' }] },
      CSRF,
    )
  })

  it('导入：贴一份清单 JSON，整份换掉，标「导入」，列没能留下的', async () => {
    const manifest = { schema: 'knowbot-manifest/v2', pack: { workflow: [] } }
    vi.mocked(importWorkdraft).mockResolvedValue(
      workdraft({
        revision: 1,
        body: { ...emptyBody(), name: '导入的专家' },
        origins: { name: 'import' },
        notes: ['pack dossier was dropped'],
      }),
    )
    page()
    fireEvent.click(await screen.findByRole('button', { name: w.toolbar.import }))
    const dialog = within(screen.getByRole('dialog', { name: w.import.title }))
    fireEvent.change(dialog.getByLabelText(w.import.text), { target: { value: '{不是 JSON' } })
    fireEvent.click(dialog.getByRole('button', { name: w.import.submit }))
    expect(dialog.getByText(w.import.badJson)).toBeInTheDocument()
    fireEvent.change(dialog.getByLabelText(w.import.text), {
      target: { value: JSON.stringify(manifest) },
    })
    fireEvent.click(dialog.getByRole('button', { name: w.import.submit }))
    await waitFor(() =>
      expect(importWorkdraft).toHaveBeenCalledWith(REQUEST, { revision: 0, manifest }, CSRF),
    )
    expect(await screen.findByDisplayValue('导入的专家')).toBeInTheDocument()
    expect(screen.getByTestId('origin-name')).toHaveTextContent(w.origin.import)
    expect(screen.getByText('pack dossier was dropped')).toBeInTheDocument()
  })

  it('导入不进来：说只认清单 v2', async () => {
    vi.mocked(importWorkdraft).mockRejectedValue(refused('manifest_invalid'))
    page()
    fireEvent.click(await screen.findByRole('button', { name: w.toolbar.import }))
    const dialog = within(screen.getByRole('dialog', { name: w.import.title }))
    fireEvent.change(dialog.getByLabelText(w.import.text), { target: { value: '{"schema": "x"}' } })
    fireEvent.click(dialog.getByRole('button', { name: w.import.submit }))
    expect(
      await dialog.findByText('这份清单导不进来：只认清单 v2（manifest_invalid）。'),
    ).toBeInTheDocument()
  })

  it('从我的准专家复制：列这个名称下的准专家，选一位整份换掉', async () => {
    vi.mocked(fetchDetail).mockResolvedValue(detail({ drafts: [draft()] }))
    vi.mocked(copyWorkdraft).mockResolvedValue(
      workdraft({
        revision: 1,
        body: { ...emptyBody(), steps: [step('overview', { title: '数据摸底' })] },
        origins: { 'steps/overview/title': 'copy' },
        notes: [],
      }),
    )
    page()
    fireEvent.click(await screen.findByRole('button', { name: w.toolbar.copy }))
    const dialog = within(screen.getByRole('dialog', { name: w.copy.title }))
    fireEvent.change(await dialog.findByLabelText(w.copy.label), { target: { value: DRAFT } })
    fireEvent.click(dialog.getByRole('button', { name: w.copy.submit }))
    await waitFor(() =>
      expect(copyWorkdraft).toHaveBeenCalledWith(REQUEST, { revision: 0, draft_id: DRAFT }, CSRF),
    )
    expect(await screen.findByDisplayValue('数据摸底')).toBeInTheDocument()
    expect(screen.getByTestId('origin-steps/overview/title')).toHaveTextContent(w.origin.copy)
    expect(screen.getByText(w.copy.done)).toBeInTheDocument()
  })
})

describe('要存的几格', () => {
  it('没变就不存；步骤顺序变了整列换；改了的步骤只存那一格', () => {
    const saved = { ...emptyBody(), steps: [step('s1'), step('s2')] }
    expect(diffEdits(saved, saved)).toEqual([])
    const moved = { ...saved, steps: [saved.steps[1], saved.steps[0]] }
    expect(diffEdits(saved, moved)).toEqual([{ path: 'steps', value: moved.steps }])
    const titled = { ...saved, steps: [step('s1', { title: '摸底' }), step('s2')] }
    expect(diffEdits(saved, titled)).toEqual([{ path: 'steps/s1/title', value: '摸底' }])
    // 空的选项不带，名字不行的交回项照存着的
    const half = {
      ...saved,
      steps: [
        step('s1', {
          ask_before: [{ id: 'q1', question: '看哪几年？', options: ['近三年', ''] }],
          outputs: [{ name: '', type: 'number', items: null }],
        }),
        step('s2'),
      ],
    }
    expect(diffEdits(saved, half)).toEqual([
      {
        path: 'steps/s1/ask_before',
        value: [{ id: 'q1', question: '看哪几年？', options: ['近三年'] }],
      },
    ])
  })
})

describe('平台人员的提议（专家孵化方案第十二节）', () => {
  it('放在格子旁边，标明是平台人员提的；接受后换成后端那一份，不再显示', async () => {
    server = workdraft({
      revision: 3,
      body: { ...emptyBody(), scope: { does: '财务分析', does_not: '', elsewhere: '' } },
      proposals: [
        {
          proposal_id: '11111111-1111-4111-8111-111111111111',
          path: 'scope/does',
          op: 'set',
          value: 'A 股非金融公司的财务分析',
          reason: '范围写清楚',
          state: 'pending',
          proposed_at: '2026-10-29T08:00:00Z',
          decided_at: null,
        },
      ],
    })
    const after = workdraft({
      revision: 4,
      body: {
        ...emptyBody(),
        scope: { does: 'A 股非金融公司的财务分析', does_not: '', elsewhere: '' },
      },
    })
    vi.mocked(decideProposal).mockResolvedValue({
      workdraft: after,
      proposal: {
        proposal_id: '11111111-1111-4111-8111-111111111111',
        path: 'scope/does',
        op: 'set',
        value: 'A 股非金融公司的财务分析',
        reason: '范围写清楚',
        state: 'accepted',
        proposed_at: '2026-10-29T08:00:00Z',
        decided_at: '2026-10-29T09:00:00Z',
      },
    })
    page()
    expect(await screen.findByText(`${w.ai.operatorLabel} · ${w.ai.op.set}`)).toBeInTheDocument()
    expect(screen.getByText(w.ai.fromOperator)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: w.ai.accept }))
    await waitFor(() =>
      expect(decideProposal).toHaveBeenCalledWith(
        REQUEST,
        '11111111-1111-4111-8111-111111111111',
        { action: 'accept', revision: 3 },
        CSRF,
      ),
    )
    await waitFor(() => expect(screen.queryByText(w.ai.fromOperator)).toBeNull())
  })
})
