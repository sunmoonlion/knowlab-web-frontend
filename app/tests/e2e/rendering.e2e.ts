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

test('author opts into technical controls for one incubation, including direct links', async ({
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
  const requestId = '81a7fd82-9c80-41ea-8e12-973e61fca614'
  const other = '91a7fd82-9c80-41ea-8e12-973e61fca614'
  await page.route('**/knowbot-requests/*/workdraft', (route) =>
    route.fulfill({
      json: {
        contract_version: 1,
        request_id: new URL(route.request().url()).pathname.split('/').at(-2),
        title: '四行小计',
        revision: 1,
        body: {
          name: '汇总表',
          tagline: '',
          scope: { does: '编制汇总表', does_not: '', elsewhere: '' },
          data_picks: [],
          steps: [],
        },
        sources: {},
        origins: {},
        data_formats: {},
        updated_at: null,
      },
    }),
  )
  await page.route('**/workdraft/preview', (route) =>
    route.fulfill({
      json: {
        contract_version: 1,
        version: '1',
        manifest: { schema: 'knowbot-manifest/v2' },
        problems: [{ path: 'steps', message: 'add at least one step' }],
      },
    }),
  )
  await page.route('**/workdraft/incubations', (route) =>
    route.fulfill({ json: { contract_version: 1, incubations: [] } }),
  )
  const path = (id: string) => '/zh-CN/names/' + id
  const toggle = page.getByRole('switch', { name: '专业开发者模式' })
  await page.goto(path(requestId) + '/workdraft')
  await expect(toggle).not.toBeChecked()
  await expect(page.getByRole('button', { name: '出一版', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '正式方法定义与验证' })).toHaveCount(0)
  await page.getByRole('button', { name: '预览清单' }).click()
  await expect(page.getByRole('dialog').getByText('至少加一步。')).toBeVisible()
  await expect(page.getByTestId('preview-manifest')).toHaveCount(0)
  await toggle.check()
  await expect(page.getByTestId('preview-manifest')).toContainText('knowbot-manifest/v2')
  await page.getByRole('link', { name: '正式方法定义与验证' }).click()
  await expect(toggle).toBeChecked()
  await page.reload()
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await page.reload()
  await expect(toggle).not.toBeChecked()
  await expect(page.getByText(/选择一份完整的方法定义 JSON/)).toHaveCount(0)
  await toggle.check()
  await page.goto(path(other) + '/formal-method')
  await expect(toggle).not.toBeChecked()
  await expect(page.getByRole('link', { name: '工作稿', exact: true })).toBeVisible()
})
