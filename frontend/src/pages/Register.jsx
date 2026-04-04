import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Award, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'

export default function Register() {
  const [form, setForm] = useState({ email: '', username: '', password: '' })
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handle = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/auth/register', form)
      toast.success('Account created! Please sign in.')
      navigate('/login')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
      backgroundImage: 'radial-gradient(ellipse at 80% 50%, rgba(124,58,237,0.08) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(245,158,11,0.06) 0%, transparent 50%)'
    }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 20px' }}>
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
          <p style={{ color: 'var(--text3)', marginTop: 6, fontSize: 14 }}>Create your account</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>Email</label>
              <input className="input" type="email" placeholder="you@example.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>Username</label>
              <input className="input" placeholder="Choose a username"
                value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input className="input" type={show ? 'text' : 'password'} placeholder="Min 8 characters"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ paddingRight: 42 }} required minLength={6} />
                <button type="button" onClick={() => setShow(s => !s)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text3)', padding: 0
                }}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}
              style={{ marginTop: 4, justifyContent: 'center' }}>
              {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Creating...</> : 'Create Account'}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text3)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent2)' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
