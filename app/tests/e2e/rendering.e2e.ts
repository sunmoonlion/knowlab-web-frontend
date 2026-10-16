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
  await page.goto('/en/dashboard')

  await expect(page).toHaveURL(/\/en\/login$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
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
