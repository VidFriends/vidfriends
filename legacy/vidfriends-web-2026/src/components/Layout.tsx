import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Layout() {
  const { logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium ${isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold text-indigo-400">VidFriends</span>
              <div className="hidden md:flex gap-1">
                <NavLink to="/send" className={linkClass} onClick={closeMenu}>Send</NavLink>
                <NavLink to="/inbox" className={linkClass} onClick={closeMenu}>Inbox</NavLink>
                <NavLink to="/history" className={linkClass} onClick={closeMenu}>History</NavLink>
                <NavLink to="/collections" className={linkClass} onClick={closeMenu}>Collections</NavLink>
                <NavLink to="/collections/import" className={linkClass} onClick={closeMenu}>Import</NavLink>
                {isAdmin && <NavLink to="/admin" className={linkClass} onClick={closeMenu}>Admin</NavLink>}
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <NavLink to="/profile" className={linkClass} onClick={closeMenu}>Profile</NavLink>
              <button
                onClick={handleLogout}
                className="px-3 py-2 rounded-md text-sm font-medium text-red-400 hover:bg-red-900/50 hover:text-red-300"
              >
                Logout
              </button>
            </div>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="md:hidden p-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

          {menuOpen && (
          <div className="md:hidden border-t border-gray-800 px-4 sm:px-6 pb-4 pt-2 space-y-1">
            <NavLink to="/send" className={linkClass} onClick={closeMenu}>Send</NavLink>
            <NavLink to="/inbox" className={linkClass} onClick={closeMenu}>Inbox</NavLink>
            <NavLink to="/history" className={linkClass} onClick={closeMenu}>History</NavLink>
            <NavLink to="/collections" className={linkClass} onClick={closeMenu}>Collections</NavLink>
            <NavLink to="/collections/import" className={linkClass} onClick={closeMenu}>Import</NavLink>
            {isAdmin && <NavLink to="/admin" className={linkClass} onClick={closeMenu}>Admin</NavLink>}
            <NavLink to="/profile" className={linkClass} onClick={closeMenu}>Profile</NavLink>
            <button
              onClick={() => { handleLogout(); closeMenu() }}
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-red-400 hover:bg-red-900/50 hover:text-red-300"
            >
              Logout
            </button>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
