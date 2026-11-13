import { expect, it } from 'vitest'
import { authorCapabilityCatalogSchema } from '@/contracts/workdraft'
import recorded from '../fixtures/author-capabilities.json'

it('accepts the recorded KnowLab HTTP envelope and retains portable dependencies', () => {
  const result = authorCapabilityCatalogSchema.parse(recorded)
  expect(result.contract_version).toBe(1)
  expect(result.skills[0].required_tools).toEqual([
    { url: 'https://tools.example.test/mcp', name: 'send' },
  ])
  expect(
    authorCapabilityCatalogSchema.safeParse({ ...recorded, contract_version: 2 }).success,
  ).toBe(false)
})
