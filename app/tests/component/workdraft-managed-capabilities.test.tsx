import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { ManagedCapabilitiesEditor } from '@/components/knowbots/workdraft-managed-capabilities'
import { fetchMethodCapabilities } from '@/lib/knowbots/client'
import type { Step } from '@/contracts/workdraft'
import messages from '@/messages/zh-CN.json'
import { renderWith, REQUEST } from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({ fetchMethodCapabilities: vi.fn() }))
vi.mock('@/components/common/cross-app-link', () => ({
  CrossAppLink: ({ children }: { children: React.ReactNode }) => (
    <a href="https://knowbench.example.test/settings">{children}</a>
  ),
}))
const labels = messages.workdraft.managed
const skill = {
  name: 'notice',
  version: '2',
  digest: 'a'.repeat(64),
  description: 'Prepare notice',
}
const tool = {
  url: 'https://tools.example.test/mcp',
  name: 'send',
  service_name: 'Mail',
  description: 'Send a notice',
}

type Requirements = NonNullable<Step['advanced']['managed_capabilities']>
function Editor({ saved }: { saved: (value: Requirements | null) => void }) {
  const [value, setValue] = useState<Requirements | null>(null)
  return (
    <ManagedCapabilitiesEditor
      requestId={REQUEST}
      value={value}
      onChange={(next) => {
        setValue(next)
        saved(next)
      }}
    />
  )
}

it('selects existing assets and pins the version automatically, with no configuration text entry', async () => {
  vi.mocked(fetchMethodCapabilities).mockResolvedValue({
    contract_version: 1,
    tools: [tool],
    skills: [skill],
  })
  const saved = vi.fn()
  renderWith(<Editor saved={saved} />)
  fireEvent.click(screen.getByRole('button', { name: labels.choose }))
  fireEvent.click(await screen.findByRole('checkbox', { name: /Mail · send/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /notice · 2/ }))
  expect(fetchMethodCapabilities).toHaveBeenCalledWith(REQUEST)
  expect(saved).toHaveBeenLastCalledWith({
    tools: [{ url: tool.url, name: tool.name }],
    skills: [{ name: skill.name, version: skill.version, digest: skill.digest }],
  })
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: labels.manage })).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: labels.remove })[0])
  expect(saved).toHaveBeenLastCalledWith({
    tools: [],
    skills: [{ name: skill.name, version: skill.version, digest: skill.digest }],
  })
})

it('keeps frozen requirements when the catalog cannot be loaded and offers a retry', async () => {
  vi.mocked(fetchMethodCapabilities).mockRejectedValue(new Error('offline'))
  const saved = vi.fn()
  renderWith(
    <ManagedCapabilitiesEditor
      requestId={REQUEST}
      value={{ tools: [], skills: [skill] }}
      onChange={saved}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: labels.choose }))
  expect(await screen.findByRole('alert')).toHaveTextContent(labels.unavailable)
  expect(screen.getByText('notice · 2')).toBeInTheDocument()
  expect(saved).not.toHaveBeenCalled()
  vi.mocked(fetchMethodCapabilities).mockResolvedValue({
    contract_version: 1,
    tools: [],
    skills: [],
  })
  fireEvent.click(screen.getByRole('button', { name: labels.reload }))
  await waitFor(() => expect(screen.getByText(labels.empty)).toBeInTheDocument())
  expect(saved).not.toHaveBeenCalled()
})

it('declares skill dependencies without account bindings and keeps them until the skill is removed', async () => {
  const required = { url: tool.url, name: tool.name }
  vi.mocked(fetchMethodCapabilities).mockResolvedValue({
    contract_version: 1,
    tools: [tool],
    skills: [{ ...skill, required_tools: [required] }],
  })
  const saved = vi.fn()
  renderWith(<Editor saved={saved} />)
  fireEvent.click(screen.getByRole('button', { name: labels.choose }))
  fireEvent.click(await screen.findByRole('checkbox', { name: /notice · 2/ }))
  expect(saved).toHaveBeenLastCalledWith({
    tools: [required],
    skills: [
      {
        name: skill.name,
        version: skill.version,
        digest: skill.digest,
        required_tools: [required],
      },
    ],
  })
  expect(screen.getByRole('checkbox', { name: /Mail · send/ })).toBeDisabled()
  expect(screen.getAllByRole('button', { name: labels.remove })[0]).toBeDisabled()
  fireEvent.click(screen.getAllByRole('button', { name: labels.remove })[1])
  expect(saved).toHaveBeenLastCalledWith({ tools: [required], skills: [] })
  expect(screen.getByRole('checkbox', { name: /Mail · send/ })).toBeEnabled()
})

it('prevents selecting a skill with unresolved connection dependencies', async () => {
  vi.mocked(fetchMethodCapabilities).mockResolvedValue({
    contract_version: 1,
    tools: [],
    skills: [{ ...skill, unresolved_dependencies: true }],
  })
  renderWith(<Editor saved={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: labels.choose }))
  expect(await screen.findByRole('checkbox', { name: /notice · 2/ })).toBeDisabled()
  expect(screen.getByText(labels.unresolvedDependencies)).toBeInTheDocument()
})
