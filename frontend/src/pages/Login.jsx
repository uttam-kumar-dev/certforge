import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Award, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handle = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
      backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(124,58,237,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(245,158,11,0.06) 0%, transparent 50%)'
    }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 20px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #7c3aed, #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 40px rgba(139,92,246,0.4)'
          }}>
            <Award size={28} color="white" />
          </div>
          <h1 style={{
            fontFamily: 'Cinzel, serif', fontSize: 28, fontWeight: 700,
            background: 'linear-gradient(135deg, #e2d9f3, #f59e0b)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>CertForge</h1>
          <p style={{ color: 'var(--text3)', marginTop: 6, fontSize: 14 }}>Sign in to your account</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                Username or Email
              </label>
              <input
                className="input"
                placeholder="Enter your username"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={show ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ paddingRight: 42 }}
                  required
                />
                <button type="button" onClick={() => setShow(s => !s)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text3)', padding: 0
                }}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4, justifyContent: 'center' }}>
              {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Signing in...</> : 'Sign In'}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text3)' }}>
            No account?{' '}
            <Link to="/register" style={{ color: 'var(--accent2)' }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
