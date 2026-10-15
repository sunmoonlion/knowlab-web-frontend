import { describe, expect, it } from 'vitest'

import {
  crossAppLinksSchema,
  crossAppOriginSchema,
  type CrossAppLinks,
} from '@/contracts/cross-app'
import { crossAppAnchorProps, crossAppHref, defineDestinations } from '@/lib/cross-app/links'

const links: CrossAppLinks = {
  app: 'investment',
  targets: {
    knowfeed: { web_base_url: 'https://knowfeed.example.test' },
    knowbase: { web_base_url: 'https://knowbase.example.test/' },
  },
}

const destinations = defineDestinations({
  'info.request': { target: 'knowfeed', segments: ['requests', 'new'], params: ['code'] },
  'knowledge.catalog': { target: 'knowbase', segments: ['catalog'] },
  'knowledge.dataset': { target: 'knowbase', segments: ['catalog', ':dataset'] },
  'elsewhere.page': { target: 'elsewhere', segments: ['page'] },
})

describe('cross-app links', () => {
  it('carries the business parameter, where it comes from and the reference', () => {
    expect(
      crossAppHref({
        links,
        destination: destinations['info.request'],
        locale: 'zh-CN',
        values: { code: '600519' },
        ref: 'task:42',
      }),
    ).toBe('https://knowfeed.example.test/zh-CN/requests/new?code=600519&from=investment&ref=task%3A42')
  })

  it('fills a path segment and escapes it', () => {
    expect(
      crossAppHref({
        links,
        destination: destinations['knowledge.dataset'],
        locale: 'en',
        values: { dataset: 'sh600276-financials/../x' },
      }),
    ).toBe('https://knowbase.example.test/en/catalog/sh600276-financials%2F..%2Fx?from=investment')
  })

  it('drops a reference that breaks the rule instead of failing', () => {
    for (const ref of ['bad ref', 'a/b', 'x'.repeat(129), '', 'https://evil.example.test']) {
      expect(
        crossAppHref({ links, destination: destinations['knowledge.catalog'], locale: 'en', ref }),
      ).toBe('https://knowbase.example.test/en/catalog?from=investment')
    }
  })

  it('leaves out a parameter that has no value', () => {
    expect(
      crossAppHref({
        links,
        destination: destinations['info.request'],
        locale: 'en',
        values: { code: undefined },
      }),
    ).toBe('https://knowfeed.example.test/en/requests/new?from=investment')
  })

  it('gives no link when the target application is not configured', () => {
    expect(
      crossAppHref({ links, destination: destinations['elsewhere.page'], locale: 'en' }),
    ).toBeNull()
  })

  it('refuses anything that was not registered for the destination', () => {
    expect(() =>
      crossAppHref({
        links,
        destination: destinations['info.request'],
        locale: 'en',
        values: { code: '600519', debug: '1' },
      }),
    ).toThrow('not registered')
    expect(() =>
      crossAppHref({ links, destination: destinations['knowledge.dataset'], locale: 'en' }),
    ).toThrow('required')
    expect(() =>
      crossAppHref({ links, destination: destinations['knowledge.catalog'], locale: '../en' }),
    ).toThrow('locale')
  })

  it('never lets identity, tokens or a way back be registered', () => {
    for (const name of [
      'token',
      'access_token',
      'session',
      'return_to',
      'return_url',
      'redirect',
      'from',
      'ref',
    ]) {
      expect(() =>
        defineDestinations({ x: { target: 'knowfeed', segments: ['p'], params: [name] } }),
      ).toThrow('must not be in a link')
      expect(() =>
        defineDestinations({ x: { target: 'knowfeed', segments: ['p', `:${name}`] } }),
      ).toThrow('must not be in a link')
    }
    expect(() => defineDestinations({ x: { target: 'Info', segments: ['p'] } })).toThrow('target')
    expect(() => defineDestinations({ x: { target: 'knowfeed', segments: [] } })).toThrow('no path')
    expect(() => defineDestinations({ x: { target: 'knowfeed', segments: ['a/b'] } })).toThrow(
      'segment',
    )
    expect(() => defineDestinations({ x: { target: 'knowfeed', segments: ['..'] } })).not.toThrow()
  })

  it('opens in a new tab without handing over the opener or the referrer', () => {
    expect(crossAppAnchorProps).toEqual({ target: '_blank', rel: 'noopener noreferrer' })
  })
})

describe('cross-app contracts', () => {
  it('accepts what the backend sends', () => {
    expect(crossAppLinksSchema.parse(links)).toEqual(links)
    expect(crossAppLinksSchema.parse({ app: 'tpl', targets: {} })).toEqual({
      app: 'tpl',
      targets: {},
    })
    expect(crossAppOriginSchema.parse(null)).toBeNull()
    expect(
      crossAppOriginSchema.parse({
        app: 'investment',
        ref: 'task:42',
        return_url: 'https://investment.example.test/zh-CN/workbench/back?ref=task%3A42',
      }),
    ).toMatchObject({ app: 'investment' })
    expect(
      crossAppOriginSchema.parse({ app: 'knowbase', ref: null, return_url: null }),
    ).toMatchObject({ return_url: null })
  })

  it('refuses addresses that are not plain web addresses', () => {
    for (const address of [
      'javascript:alert(1)',
      '/relative',
      'ftp://knowfeed.example.test',
      'https://u:p@knowfeed.example.test',
      'https://knowfeed.example.test/#x',
      'https://knowfeed.example.test/a b',
    ]) {
      expect(
        crossAppLinksSchema.safeParse({
          app: 'tpl',
          targets: { knowfeed: { web_base_url: address } },
        }).success,
      ).toBe(false)
      expect(
        crossAppOriginSchema.safeParse({ app: 'investment', ref: null, return_url: address })
          .success,
      ).toBe(false)
    }
    expect(crossAppLinksSchema.safeParse({ app: 'tpl', targets: {}, token: 'x' }).success).toBe(
      false,
    )
  })
})
