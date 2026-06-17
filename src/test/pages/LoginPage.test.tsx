import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mockLogin = vi.fn()
const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual as Record<string, unknown>, useNavigate: () => mockNavigate }
})

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    isAuthenticated: false,
    isReady: true,
    token: null,
    user: null,
    register: vi.fn(),
    logout: vi.fn(),
  }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders sign in heading and form fields', async () => {
    const { LoginPage } = await import('../../pages/LoginPage')
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /sign in to vidfriends/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('calls login with email and password on submit', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    const { LoginPage } = await import('../../pages/LoginPage')
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123')
  })

  it('navigates to /send on successful login', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    const { LoginPage } = await import('../../pages/LoginPage')
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/send')
  })

  it('shows error message on failed login', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'))
    const { LoginPage } = await import('../../pages/LoginPage')
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument()
  })

  it('disables submit button while loading', async () => {
    mockLogin.mockImplementationOnce(() => new Promise(() => {}))
    const { LoginPage } = await import('../../pages/LoginPage')
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
  })

  it('has a link to register page', async () => {
    const { LoginPage } = await import('../../pages/LoginPage')
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const registerLink = screen.getByRole('link', { name: /register/i })
    expect(registerLink).toHaveAttribute('href', '/register')
  })
})
