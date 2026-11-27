import { expect, test } from '@playwright/test'

test('runtime health endpoint is dynamic and non-cacheable', async ({ request }) => {
  const response = await request.get('/healthz')

  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(response.headers()['x-deployment-id']).toBe('arch-v2-r2-web-e2e')
  expect(await response.json()).toMatchObject({
    status: 'ok',
    surface: 'web',
    deployment_id: 'arch-v2-r2-web-e2e',
  })
})

test('public route is rendered and indexable', async ({ page }) => {
  const response = await page.goto('/en')

  expect(response?.status()).toBe(200)
  await expect(
    page.getByRole('heading', {
      name: 'A dependable foundation for product web applications',
    }),
  ).toBeVisible()
  await expect(page.locator('[data-route-class="public-content"]')).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})

test('anonymous workspace request is redirected by the SSR authorization boundary', async ({
  page,
}) => {
  // Stop at the provider entry: this test covers the real SSR redirect chain,
  // without depending on an external identity provider or its login state.
  await page.route('**/api/auth/web/login?**', (route) =>
    route.fulfill({ contentType: 'text/plain', body: 'SSO authorization started' }),
  )
  await page.goto('/en/dashboard')

  await expect(page).toHaveURL(/\/api\/auth\/web\/login\?return_to=%2Fen%2Fdashboard$/)
  await expect(page.getByText('SSO authorization started')).toBeVisible()
  await expect(page.locator('[data-route-class="login"]')).toHaveCount(0)
})

test('workspace route renders only after the paired backend validates its opaque session', async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: 'sunmoonai_knowlab_web_sid',
      value: 'e2e-session',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  const response = await page.goto('/en/dashboard')

  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page.locator('[data-route-class="authenticated-workspace"]')).toBeVisible()
  await expect(page.getByText('Signed in as Paired E2E User')).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('opens the method directory from the signed-in sidebar before an incubation exists', async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: 'sunmoonai_knowlab_web_sid',
      value: 'e2e-session',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  await page.route('**/api/web/v1/method-units?**', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            method_id: 'b5ae2229-dfbc-46ac-9c30-895e75571c01',
            latest_version: 2,
            digest: 'sha256:' + 'a'.repeat(64),
            method_kind: 'tool',
            title: 'Opening balance check',
            summary: 'Compare the two periods.',
            created_at: '2026-11-24',
          },
        ],
      },
    }),
  )
  await page.goto('/en/dashboard')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Methods and skills', exact: true })
    .click()
  await expect(page).toHaveURL(/\/en\/methods$/)
  await expect(page.getByRole('heading', { name: 'Methods and skills', exact: true })).toBeVisible()
  await expect(page.getByText('Opening balance check', { exact: true })).toBeVisible()
  const categoriesSeen: (string | null)[] = []
  await page.route('**/api/web/v1/method-directory/browse/owned?**', (route) => {
    categoriesSeen.push(new URL(route.request().url()).searchParams.get('category'))
    return route.fulfill({
      json: {
        items: [],
        next: null,
        total: 0,
        categories: [
          {
            code: 'financial.reconciliation',
            group: 'financial',
            group_name: '财务核验',
            name: '报表勾稽',
            count: 0,
          },
        ],
      },
    })
  })
  await page.getByRole('combobox', { name: 'Method type', exact: true }).selectOption('tool')
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('financial')
  await page
    .getByRole('combobox', { name: 'Subcategory', exact: true })
    .selectOption('financial.reconciliation')
  await expect.poll(() => categoriesSeen.at(-1)).toBe('financial.reconciliation')
  await expect(page.getByText('0 methods', { exact: true })).toBeVisible()
})

test('paired unified Backend contract streams, cites, reconciles and accepts HITL', async ({
  context,
  page,
  request,
}) => {
  await context.addCookies([
    {
      name: 'sunmoonai_knowlab_web_sid',
      value: 'e2e-session',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  await page.goto('/en/dashboard')

  await expect(page.getByText('A streamed FastAPI response fragment.')).toBeVisible()
  const source = page.getByRole('link', { name: 'FastAPI authorized reference' })
  await expect(source).toBeVisible()
  await expect(page.getByTestId('run-status')).toHaveText('Waiting for input')

  const sourceHref = await source.getAttribute('href')
  if (!sourceHref) throw new Error('citation source href is missing')
  const anonymousSource = await request.get(sourceHref, { maxRedirects: 0 })
  expect(anonymousSource.status()).toBe(401)
  const sourceResponse = await request.get(sourceHref, {
    headers: { Cookie: 'sunmoonai_knowlab_web_sid=e2e-session' },
    maxRedirects: 0,
  })
  expect(sourceResponse.status()).toBe(302)
  expect(sourceResponse.headers().location).toContain('/api/web/v1/reference/sources/')

  await page.getByRole('button', { name: 'Confirm and continue' }).click()
  await expect(page.getByTestId('run-status')).toHaveText('Succeeded')
})

test('unknown route renders a not-found boundary', async ({ page }) => {
  const response = await page.goto('/en/route-that-does-not-exist')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('sitemap uses the runtime application origin', async ({ request, baseURL }) => {
  const response = await request.get('/sitemap.xml')

  expect(response.status()).toBe(200)
  expect(await response.text()).toContain(`${baseURL}/en`)
})

test('author reviews an AI proposal, checks routing and confirms an edited step', async ({
  context,
  page,
}) => {
  const id = '81a7fd82-9c80-41ea-8e12-973e61fca614'
  const roundId = '348e33aa-70a1-443c-aae2-1a79329659dd'
  await context.addCookies([
    {
      name: 'sunmoonai_knowlab_web_sid',
      value: 'e2e-session',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  const template = {
    template: 'checked_delivery/v1' as const,
    goal: '核对汇总',
    deliverable: '四行汇总结果',
    check: '逐行核对',
    evidence: '原表',
  }
  const source = {
    asset_id: null,
    asset_revision: null,
    kind: 'registered_instruction' as const,
    source: id,
    version: '1',
    digest: 'sha256:' + 'a'.repeat(64),
    entry: 'instruction',
    license_basis: 'author_owned',
  }
  const body = {
    method_template: template,
    name: '汇总',
    tagline: '',
    scope: { does: '核对表格', does_not: '', elsewhere: '' },
    data_picks: [],
    steps: [],
  }
  const initial = {
    contract_version: 1,
    request_id: id,
    title: '四行小计',
    revision: 1,
    body,
    sources: {},
    origins: {},
    data_formats: {},
    updated_at: null,
  }
  const round = {
    incubation_id: roundId,
    round: 1,
    action: 'draft',
    instruction: null,
    step_id: null,
    status: 'succeeded',
    budget_limit: '20',
    spent: '0.12',
    currency: 'CNY',
    waiting_for: null,
    error: null,
    started_at: null,
    finished_at: null,
    selection_round: true,
    workdraft_revision: 1,
  }
  const choice = {
    status: 'ready',
    reason: '已有核对指令',
    routing_required: false,
    tree: {
      nodes: [
        {
          id: 'n1',
          parent: null,
          status: 'hit',
          operator: 'leaf',
          goal: '逐行核对小计',
          reason: '目录有现成方法',
        },
      ],
    },
    steps: [{ id: 'n1', method: 'i1', task: '核对数据', inputs: {}, cases: {}, reviews: [] }],
  }
  const method = {
    definition: {
      contract: 'knowlab/formal-method/v1',
      capability_declaration: {
        title: '四行小计',
        purpose: template.goal,
        applies_when: [template.goal],
        excludes: [],
        promises: { template_delivery: template.deliverable },
      },
      access_requirements: [],
      what_requires_approval: [],
      how_to_validate: [
        {
          promise_id: 'template_delivery',
          outputs: ['result'],
          check: template.check,
          evidence: template.evidence,
          on_failure: 'fail',
        },
      ],
      procedure: {
        kind: 'direct',
        instructions: template.goal,
        stop_conditions: [template.check],
        max_model_turns: 1,
        implementation: {
          kind: source.kind,
          source: source.source,
          entry: source.entry,
          version: source.version,
          digest: source.digest,
          requirement_ids: [],
        },
        inputs: {},
        outputs: {
          result: {
            description: template.deliverable,
            required: true,
            meaning: {},
            schema: { type: 'string' },
            on_missing: 'fail',
          },
        },
      },
    },
    allowed_callers: ['host'],
    source,
  }
  const saved = { ...initial, revision: 2, body: { ...body, formal_method: method } }
  let confirmations = 0
  await page.route('**/knowbot-requests/*/workdraft', (r) =>
    r.fulfill({ json: confirmations ? saved : initial }),
  )
  await page.route('**/workdraft/incubations', (r) =>
    r.fulfill({ json: { contract_version: 1, incubations: [round] } }),
  )
  await page.route('**/workdraft/incubations/' + roundId, (r) =>
    r.fulfill({
      json: {
        contract_version: 1,
        incubation: {
          ...round,
          selection: choice,
          method_titles: { i1: '核对四行', m2: '标准小计' },
          method_pins: { m2: { method_id: id, version: 1, digest: 'sha256:' + '1'.repeat(64) } },
        },
      },
    }),
  )
  await page.route('**/formal-method-sources', (r) => r.fulfill({ json: { items: [source] } }))
  await page.route('**/confirm-selection', async (r) => {
    expect(r.request().postDataJSON()).toMatchObject({
      revision: 1,
      cases: {},
      confirmed: true,
      template,
      step_text: { n1: '逐行核对并留下依据' },
    })
    confirmations++
    await r.fulfill({ json: saved })
  })
  await page.goto('/zh-CN/names/' + id + '/formal-method')
  await expect(page).toHaveURL(new RegExp('/studio\\?workdraft=' + id))
  const confirm = page.getByRole('button', { name: '确认并存为正式工作稿' })
  await expect(page.getByText('采用方法：核对四行')).toBeVisible()
  await expect(page.getByText('查看使用的步骤模板')).toHaveCount(0)
  await expect(page.getByText('逐行核对小计', { exact: true }).first()).toBeVisible()
  const focus = page.getByLabel('本轮重拟范围')
  await focus.selectOption('n1')
  const action = page.getByLabel('这一步怎么改')
  await action.selectOption('split')
  await expect(action).toHaveValue('split')
  await action.selectOption({ label: '使用《标准小计》第 1 版' })
  await expect(action).toHaveValue('m2')
  await focus.selectOption('')
  await expect(confirm).toBeDisabled()
  await page.getByLabel('第 1 步').fill('逐行核对并留下依据')
  const routing = page.getByLabel(
    '除了现成方法内部已完成的工作，这份草图是否还需要按输入选择不同的方法？',
  )
  await routing.selectOption('yes')
  await page.getByLabel('我已核对业务步骤、分派和交付口径。').check()
  await expect(page.getByText('草图中的分派与要求不同，请补充要求并重拟。')).toBeVisible()
  await expect(confirm).toBeDisabled()
  await routing.selectOption('no')
  await expect(confirm).toBeDisabled()
  expect(confirmations).toBe(0)
  await page.getByLabel('我已核对业务步骤、分派和交付口径。').check()
  await confirm.click()
  await expect(confirm).toHaveCount(0)
  await expect(page).toHaveURL(/method=[\da-f-]{36}/)
  await page.reload()
  await expect(page.getByText('原表', { exact: true })).toBeVisible()
  expect(confirmations).toBe(1)
})
