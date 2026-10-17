import { describe, expect, it } from 'vitest'

import { loginPath, nextPath } from '@/lib/auth/next-path'

describe('登录之后回到哪', () => {
  const fallback = '/zh-CN/dashboard'
  it('本站、本语言下的路径：原样回去，参数还在', () => {
    expect(nextPath('zh-CN', '/zh-CN/requests/new?code=600585&from=knowbench', fallback)).toBe(
      '/zh-CN/requests/new?code=600585&from=knowbench',
    )
  })
  it('别的一律回默认页', () => {
    for (const bad of [
      undefined,
      null,
      '',
      'https://evil.example/zh-CN/x',
      '//evil.example/zh-CN/x',
      '/zh-CN//evil.example',
      '/en/requests', // 别的语言
      '/zh-CN\\evil',
      '/zh-CN/a\nb',
      '/zh-CN/login?next=/zh-CN/login',
      `/zh-CN/${'a'.repeat(3000)}`,
    ]) {
      expect(nextPath('zh-CN', bad, fallback)).toBe(fallback)
    }
  })
  it('去登录时把要回的地方带上', () => {
    expect(loginPath('zh-CN')).toBe('/zh-CN/login')
    expect(loginPath('zh-CN', '/zh-CN/requests/new?code=600585')).toBe(
      '/zh-CN/login?next=%2Fzh-CN%2Frequests%2Fnew%3Fcode%3D600585',
    )
  })
})
