import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, Trash2, Upload, LayoutTemplate, Image, Award, Zap, Clock, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const [templates, setTemplates] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [newName, setNewName] = useState('')
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()
  const navigate = useNavigate()
  const { user } = useAuth()

  const load = async () => {
    try {
      const [tmplR, statsR] = await Promise.all([
        api.get('/templates/'),
        api.get('/certificates/stats').catch(() => ({ data: null })),
      ])
      setTemplates(tmplR.data)
      setStats(statsR.data)
    } catch { toast.error('Failed to load templates') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleUpload = async e => {
    e.preventDefault()
    if (!file || !newName.trim()) return toast.error('Please provide a name and image')
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', newName.trim())
    try {
      await api.post('/templates/upload', fd)
      toast.success('Template uploaded!')
      setShowUpload(false); setFile(null); setNewName('')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed')
    } finally { setUploading(false) }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/templates/${id}`)
      toast.success('Template deleted')
      setTemplates(t => t.filter(x => x.id !== id))
    } catch { toast.error('Delete failed') }
  }

  const dropHandler = e => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f && f.type.startsWith('image/')) setFile(f)
    else toast.error('Please drop an image file')
  }

  return (
    <div>
      {/* Welcome + Stats */}
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">
          Welcome back, {user?.username} 👋
        </h1>
        <p style={{ color: 'var(--text3)', fontSize: 14 }}>
          Manage your certificate templates and generate PDFs at scale
        </p>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
          {[
            { icon: LayoutTemplate, label: 'Templates', value: stats.templates, color: '#a78bfa' },
            { icon: Zap, label: 'Jobs Run', value: stats.jobs, color: '#f59e0b' },
            { icon: Clock, label: 'Completed', value: stats.completed_jobs, color: '#10b981' },
            { icon: Award, label: 'Certs Generated', value: stats.certificates_generated.toLocaleString(), color: '#ec4899' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="card" style={{
              padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: `${color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={18} color={color} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'Cinzel, serif', lineHeight: 1.1 }}>
                  {value}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Templates header */}
      <div className="section-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Certificate Templates</h2>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>
            Upload blank certificate images, then drag-drop fields to configure variable positions
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
          <Plus size={16} /> New Template
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, backdropFilter: 'blur(4px)',
        }} onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="card" style={{ width: 500, padding: 32 }}>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 20, marginBottom: 6 }}>Upload Template</h2>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>
              Upload a blank certificate image. Portrait or landscape — both supported.
            </p>
            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
                  Template Name
                </label>
                <input className="input" placeholder="e.g. Course Completion Certificate"
                  value={newName} onChange={e => setNewName(e.target.value)} required />
              </div>
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={dropHandler}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border2)'}`,
                  borderRadius: 10, padding: 32, textAlign: 'center', cursor: 'pointer',
                  background: dragOver ? 'rgba(139,92,246,0.06)' : 'var(--bg2)', transition: 'all 0.2s',
                }}>
                {file ? (
                  <>
                    <Image size={32} color="var(--accent2)" style={{ margin: '0 auto 8px', display: 'block' }} />
                    <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{file.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                      {(file.size / 1024).toFixed(0)} KB · Click to change
                    </div>
                  </>
                ) : (
                  <>
                    <Upload size={32} color="var(--text3)" style={{ margin: '0 auto 8px', display: 'block' }} />
                    <div style={{ fontSize: 14, color: 'var(--text2)' }}>
                      Drop certificate image here or click to browse
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                      PNG, JPG, JPEG · Portrait or Landscape · High resolution recommended
                    </div>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => setFile(e.target.files[0])} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setShowUpload(false); setFile(null); setNewName('') }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading
                    ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Uploading...</>
                    : <><Upload size={14} /> Upload Template</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Templates Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ height: 160, background: 'var(--bg3)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ padding: 16 }}>
                <div style={{ height: 16, background: 'var(--bg3)', borderRadius: 4, marginBottom: 8, width: '70%' }} />
                <div style={{ height: 12, background: 'var(--bg3)', borderRadius: 4, width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          background: 'var(--surface)', borderRadius: 12,
          border: '1px dashed var(--border2)',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
            background: 'rgba(139,92,246,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LayoutTemplate size={32} color="var(--accent2)" />
          </div>
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>No templates yet</h3>
          <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 20, maxWidth: 340, margin: '0 auto 20px' }}>
            Upload a blank certificate image to get started. PNG or JPG, portrait or landscape.
          </p>
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
            <Plus size={16} /> Upload First Template
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {templates.map(t => (
            <div key={t.id} className="card" style={{
              padding: 0, overflow: 'hidden',
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'default',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
              <div style={{ height: 170, overflow: 'hidden', background: 'var(--bg3)', position: 'relative' }}>
                <img src={`/${t.image_path}`} alt={t.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: '3px 8px',
                  fontSize: 10, color: 'var(--text2)', backdropFilter: 'blur(4px)',
                  textTransform: 'capitalize',
                }}>
                  {t.orientation}
                </div>
                {t.fields.length > 0 ? (
                  <div style={{
                    position: 'absolute', bottom: 8, left: 8,
                    background: 'rgba(139,92,246,0.85)', borderRadius: 6, padding: '3px 9px',
                    fontSize: 10, color: 'white', backdropFilter: 'blur(4px)',
                  }}>
                    {t.fields.length} field{t.fields.length !== 1 ? 's' : ''} configured
                  </div>
                ) : (
                  <div style={{
                    position: 'absolute', bottom: 8, left: 8,
                    background: 'rgba(245,158,11,0.85)', borderRadius: 6, padding: '3px 9px',
                    fontSize: 10, color: '#1a0a00', backdropFilter: 'blur(4px)', fontWeight: 600,
                  }}>
                    ⚠ No fields yet
                  </div>
                )}
              </div>
              <div style={{ padding: '14px 16px 16px' }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
                  Added {new Date(t.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center', fontSize: 13, padding: '8px 12px' }}
                    onClick={() => navigate(`/templates/${t.id}/edit`)}>
                    <Edit2 size={13} />
                    {t.fields.length > 0 ? 'Edit Fields' : 'Add Fields'}
                  </button>
                  <button className="btn btn-secondary"
                    style={{ padding: '8px 12px', fontSize: 13 }}
                    onClick={() => navigate('/generate')}
                    title="Generate certificates with this template">
                    <Zap size={13} />
                  </button>
                  <button className="btn btn-danger" style={{ padding: '8px 12px' }}
                    onClick={() => handleDelete(t.id, t.name)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
