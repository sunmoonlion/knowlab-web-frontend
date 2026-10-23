import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import type {
  Application,
  Detail,
  Draft,
  Expert,
  ExpertItem,
  MyQuestion,
  Outputs,
  Test,
  Version,
} from '@/contracts/knowbots'
import messages from '@/messages/zh-CN.json'

// 申请、审核、专家三栏与详情页的测试共用（SDD 0037）：样例数据与渲染。

export const CSRF = 'csrf-token-value-that-is-long-enough-1234'
export const REQUEST = '0b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
export const DRAFT = '1b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
export const TEST = '2b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
export const EXPERT = '6b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
export const QUESTION = '5b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
const BRIEF = { request_id: REQUEST, title: '财务分析与预测' }

const SUMMARY = {
  version: 2,
  acceptance: 'accepted' as const,
  draft: '2.3',
  test: { number: 5, status: 'passed' as const },
  expert: { version: 2, stage: 'awaiting_user' as const },
}

export function version(overrides: Partial<Version> = {}): Version {
  return {
    version: 1,
    idea: { kind: 'skill', skill: '# 我的方法' },
    cases: [
      {
        case_id: 'c1',
        input: { question: '茅台近三年营收？', answers: { period: '3y' } },
        expectations: [
          {
            artifact: 'official',
            path: 'revenue',
            kind: 'approx',
            value: 1708.99,
            tolerance: 0.001,
          },
        ],
      },
    ],
    consent_version: 2,
    created_at: '2026-10-18T10:00:00Z',
    acceptance: { accepted: true, reason: null, decided_at: '2026-10-18T11:00:00Z', trial: true },
    ...overrides,
  }
}

export function application(overrides: Partial<Application> = {}): Application {
  return {
    ...BRIEF,
    runtime: 'knowbench',
    created_at: '2026-10-18T10:00:00Z',
    latest_version: 2,
    summary: SUMMARY,
    consent_version: 2,
    consent_current: 2,
    category: 'working',
    ...overrides,
  }
}

export function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    draft_id: DRAFT,
    label: '2.3',
    version: '2',
    revision: 3,
    request_version: 2,
    status: 'pending_test',
    name: '财务分析与预测',
    created_at: '2026-10-24T09:00:00Z',
    user_review: { state: 'pending', note: null, requested_at: '2026-10-24T09:05:00Z' },
    rule_sources: [{ rule: '毛利率按营业收入减营业成本', ref: '创意 v2 第 4 问' }],
    ...overrides,
  }
}

export function testRecord(overrides: Partial<Test> = {}): Test {
  return {
    test_id: TEST,
    number: 5,
    draft_id: DRAFT,
    label: '2.3',
    status: 'passed',
    started_at: '2026-10-24T09:30:00Z',
    finished_at: '2026-10-24T10:00:00Z',
    report: {
      status: 'passed',
      cases: [{ case_id: 'c1', status: 'passed', steps: [], expectations: [true], note: null }],
      cost: null,
      finished_at: '2026-10-24T10:00:00Z',
    },
    backfilled: false,
    ...overrides,
  }
}

export function expert(overrides: Partial<Expert> = {}): Expert {
  return {
    expert_id: EXPERT,
    version: 2,
    name: '财务分析与预测',
    stage: 'awaiting_user',
    draft_id: DRAFT,
    label: '2.3',
    test_id: TEST,
    test_number: 5,
    created_at: '2026-10-24T10:00:00Z',
    returned_at: '2026-10-24T10:30:00Z',
    user_accepted: null,
    user_decided_at: null,
    review_approved: null,
    review_listing: null,
    review_reason: null,
    reviewed_at: null,
    listed_at: null,
    knowbot_id: null,
    listing_status: null,
    stopped_at: null,
    stop_reason: null,
    trial: false,
    ...overrides,
  }
}

export function expertItem(overrides: Partial<ExpertItem> = {}): ExpertItem {
  return { ...BRIEF, category: 'new', ...expert(), ...overrides }
}

export function question(overrides: Partial<MyQuestion> = {}): MyQuestion {
  return {
    question_id: QUESTION,
    kind: 'question',
    text: '毛利率按哪个口径？',
    options: [{ id: 'a', label: '营业收入口径' }],
    allow_free_text: true,
    case_id: 'c1',
    step_id: null,
    asked_at: '2026-10-24T09:40:00Z',
    title: '财务分析与预测',
    request_id: REQUEST,
    label: '2.3',
    draft_id: DRAFT,
    ...overrides,
  }
}

export function detail(overrides: Partial<Detail> = {}): Detail {
  return {
    contract_version: 1,
    ...BRIEF,
    runtime: 'knowbench',
    created_at: '2026-10-18T10:00:00Z',
    latest_version: 2,
    summary: SUMMARY,
    consent_version: 2,
    consent_current: 2,
    versions: [
      version(),
      version({
        version: 2,
        idea: { kind: 'skill', skill: '# 第二版方法' },
        acceptance: {
          accepted: true,
          reason: null,
          decided_at: '2026-10-24T08:00:00Z',
          trial: false,
        },
      }),
    ],
    drafts: [draft()],
    tests: [testRecord()],
    experts: [expert()],
    timeline: [],
    amendments: [],
    ...overrides,
  }
}

export function outputs(overrides: Partial<Outputs> = {}): Outputs {
  return {
    contract_version: 1,
    test_id: TEST,
    consent_needed: false,
    cases: [
      {
        case_id: 'c1',
        fetched_at: '2026-10-24T10:01:00Z',
        note: null,
        outputs: {
          contract: 'knowbot-test-run/v1',
          run_id: `knowlab-test-${TEST}`,
          case_id: 'c1',
          deliverable: { path: '底稿/成稿.md', text: '# 回答\n\n营业收入 2025 年下降。' },
          deliverable_note: null,
          steps: [{ step_id: 'scope', title: '定范围', outcome: 'accepted', checks: [] }],
          error: null,
        },
      },
    ],
    ...overrides,
  }
}

export function renderWith(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh-CN" messages={messages} timeZone="Asia/Shanghai">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

export const router = { push: () => {}, replace: () => {}, refresh: () => {} }

/** next-intl 的导航在测试里换成普通链接：href 照拼。 */
export function linkMock() {
  return {
    Link: ({
      href,
      children,
      ...rest
    }: {
      href: string | { pathname: string; query?: Record<string, string> }
      children: React.ReactNode
    }) => (
      <a
        href={
          typeof href === 'string'
            ? href
            : `${href.pathname}?${new URLSearchParams(href.query ?? {}).toString()}`
        }
        {...rest}
      >
        {children}
      </a>
    ),
    usePathname: () => '/applications',
    useRouter: () => router,
  }
}
