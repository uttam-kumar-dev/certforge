import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Award, LayoutTemplate, Zap, Clock, LogOut, ChevronRight } from 'lucide-react'

const nav = [
  { to: '/', label: 'Templates', icon: LayoutTemplate, exact: true },
  { to: '/generate', label: 'Generate', icon: Zap },
  { to: '/jobs', label: 'Jobs', icon: Clock },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240, background: 'var(--bg2)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', flexShrink: 0
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #7c3aed, #f59e0b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Award size={20} color="white" />
            </div>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: 18, fontWeight: 700,
              background: 'linear-gradient(135deg, #e2d9f3, #f59e0b)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>CertForge</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {nav.map(({ to, label, icon: Icon, exact }) => (
            <NavLink key={to} to={to} end={exact} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, marginBottom: 4,
              fontSize: 14, fontWeight: 500, transition: 'all 0.15s',
              background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: isActive ? 'var(--accent2)' : 'var(--text2)',
              borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent'
            })}>
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, color: 'white'
            }}>
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.username}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{user?.email}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ width: '100%', fontSize: 13 }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
        <Outlet />
      </main>
    </div>
  )
}
