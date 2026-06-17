import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { Layout } from '../../components/Layout'
import { AuthProvider } from '../../context/AuthContext'

function renderLayout() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Layout />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  it('renders navigation with brand name', () => {
    renderLayout()
    expect(screen.getByText('VidFriends')).toBeInTheDocument()
  })

  it('renders all navigation links', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: /send/i })).toHaveAttribute('href', '/send')
    expect(screen.getByRole('link', { name: /inbox/i })).toHaveAttribute('href', '/inbox')
    expect(screen.getByRole('link', { name: /history/i })).toHaveAttribute('href', '/history')
    expect(screen.getByRole('link', { name: /admin/i })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/profile')
  })

  it('renders logout button', () => {
    renderLayout()
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument()
  })

  it('has a mobile menu toggle', () => {
    renderLayout()
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })
})
