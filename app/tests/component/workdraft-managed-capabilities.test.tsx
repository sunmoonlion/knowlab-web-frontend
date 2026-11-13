import { fireEvent, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ManagedCapabilitiesEditor } from '@/components/knowbots/workdraft-managed-capabilities'
import { fetchMethodCapabilities } from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'
import { renderWith, REQUEST } from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({ fetchMethodCapabilities: vi.fn() }))
const labels = messages.workdraft.managed

it('explains the paused method entry without loading a capability catalog', () => {
  const saved = vi.fn()
  renderWith(<ManagedCapabilitiesEditor requestId={REQUEST} value={null} onChange={saved} />)
  expect(screen.getByRole('status')).toHaveTextContent(labels.authoringPaused)
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: labels.choose })).not.toBeInTheDocument()
  expect(fetchMethodCapabilities).not.toHaveBeenCalled()
  expect(saved).not.toHaveBeenCalled()
})

it('shows existing bindings and only clears them after the user requests removal', () => {
  const saved = vi.fn()
  const value = {
    tools: [{ url: 'https://tools.example.test/mcp', name: 'send' }],
    skills: [{ name: 'notice', version: '2', digest: 'a'.repeat(64) }],
  }
  renderWith(<ManagedCapabilitiesEditor value={value} onChange={saved} />)
  expect(screen.getByText('send')).toBeInTheDocument()
  expect(screen.getByText('notice · 2')).toBeInTheDocument()
  expect(saved).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: labels.clearBindings }))
  expect(saved).toHaveBeenCalledWith(null)
  expect(value.tools).toHaveLength(1)
  expect(fetchMethodCapabilities).not.toHaveBeenCalled()
})
