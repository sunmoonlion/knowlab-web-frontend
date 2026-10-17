import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SignedInAs, signedInName } from '@/components/auth/signed-in-as'

describe('SignedInAs', () => {
  it('names the display name first, then the email, then the account id', () => {
    const id = '7a1f0e52-3c4b-4d6e-8f90-1a2b3c4d5e6f'
    expect(signedInName({ actor_id: id, display_name: '分身测试', email: 't@example.com' })).toBe(
      '分身测试',
    )
    expect(signedInName({ actor_id: id, display_name: '', email: 't@example.com' })).toBe(
      't@example.com',
    )
    expect(signedInName({ actor_id: id, display_name: null, email: null })).toBe(id)
  })

  it('shows the label and puts the email on hover', () => {
    render(<SignedInAs label="Signed in as 分身测试" email="t@example.com" />)
    expect(screen.getByText('Signed in as 分身测试').getAttribute('title')).toBe('t@example.com')
  })
})
