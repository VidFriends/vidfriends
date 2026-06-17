import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'

function renderApp(initialEntries = ['/login']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('App', () => {
  it('renders login page at /login', () => {
    renderApp()
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('renders register page at /register', () => {
    renderApp(['/register'])
    expect(screen.getByRole('heading', { name: /create an account/i })).toBeInTheDocument()
  })

  it('redirects unauthenticated users from / to /login', () => {
    renderApp(['/'])
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('redirects unknown routes to /', () => {
    renderApp(['/nonexistent'])
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })
})
