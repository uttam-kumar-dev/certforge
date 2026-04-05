import { useState, useEffect, useRef } from 'react'
import { Upload, Trash2, Type, AlertCircle, CheckCircle, Info, HardDrive } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'

const WEIGHT_LABELS = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light',
  400: 'Regular', 500: 'Medium', 600: 'SemiBold',
  700: 'Bold', 800: 'ExtraBold', 900: 'Black',
}

export default function FontManager() {
  const [families,   setFamilies]   = useState([])
  const [usage,      setUsage]      = useState(null)
  const [uploading,  setUploading]  = useState(false)
  const [dragOver,   setDragOver]   = useState(false)
  const [loadedFaces, setLoadedFaces] = useState({}) // fontId -> CSS font-family name loaded
  const fileRef = useRef()

  const load = async () => {
    try {
      const [fontsR, usageR] = await Promise.all([
        api.get('/user-fonts/'),
        api.get('/user-fonts/usage'),
      ])
      setFamilies(fontsR.data.families || [])
      setUsage(usageR.data)
      // Inject @font-face for each variant so names render in their own font
      fontsR.data.families?.forEach(fam =>
        fam.variants.forEach(v => injectFontFace(v))
      )
    } catch { toast.error('Failed to load fonts') }
  }

  useEffect(() => { load() }, [])

  // Dynamically load font into browser via authenticated endpoint
  const injectFontFace = (variant) => {
    const cssName = `uf_${variant.id}`
    if (loadedFaces[variant.id]) return
    const token = localStorage.getItem('token')
    const url   = `/api/user-fonts/${variant.id}/file`

    // Create a dynamic @font-face via CSS Font Loading API
    const fontFace = new FontFace(cssName, `url("${url}")`, {
      weight: String(variant.weight),
      style:  variant.is_italic ? 'italic' : 'normal',
    })
    // Inject auth header via fetch → blob URL (browser FontFace can't send headers)
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.arrayBuffer())
      .then(buf => {
        const blob    = new Blob([buf], { type: 'font/ttf' })
        const blobUrl = URL.createObjectURL(blob)
        const ff      = new FontFace(cssName, `url("${blobUrl}")`)
        return ff.load().then(loaded => {
          document.fonts.add(loaded)
          setLoadedFaces(prev => ({ ...prev, [variant.id]: cssName }))
        })
      })
      .catch(() => {}) // silently ignore preview load failure
  }

  const handleFiles = async files => {
    const arr = Array.from(files).filter(f =>
      f.name.endsWith('.ttf') || f.name.endsWith('.otf')
    )
    if (!arr.length) { toast.error('Only .ttf or .otf files accepted'); return }

    setUploading(true)
    let ok = 0, fail = 0
    for (const file of arr) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        const r = await api.post('/user-fonts/upload', fd)
        toast.success(`✅ ${r.data.family_name} ${r.data.variant_name} uploaded`)
        if (r.data.warning) toast(r.data.warning, { icon: '⚠️', duration: 5000 })
        ok++
      } catch (err) {
        toast.error(`❌ ${file.name}: ${err.response?.data?.detail || 'Upload failed'}`)
        fail++
      }
    }
    setUploading(false)
    if (ok) load()
  }

  const handleDrop = e => {
    e.preventDefault(); setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const deleteVariant = async (variantId, name) => {
    if (!confirm(`Delete "${name}"?`)) return
    try {
      await api.delete(`/user-fonts/${variantId}`)
      toast.success('Font deleted')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed')
    }
  }

  const fmtBytes = b => b < 1024*1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB`

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">My Fonts</h1>
        <p style={{ color: 'var(--text3)', fontSize: 14 }}>
          Upload your own TTF/OTF fonts. They are private to your account and available in the certificate editor.
        </p>
      </div>

      {/* Storage usage bar */}
      {usage && (
        <div className="card" style={{ marginBottom: 24, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HardDrive size={14} color="var(--accent2)" />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Font Storage</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
              {usage.count} / {usage.max_count} fonts · {fmtBytes(usage.bytes)} used
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${Math.max(usage.count_pct, 2)}%` }} />
          </div>
          {usage.count_pct > 80 && (
            <p style={{ fontSize: 12, color: 'var(--warning)', marginTop: 8 }}>
              ⚠️ You're using {usage.count_pct}% of your font limit. Delete unused fonts.
            </p>
          )}
        </div>
      )}

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border2)'}`,
          borderRadius: 12, padding: '36px 24px', textAlign: 'center',
          cursor: 'pointer', marginBottom: 28,
          background: dragOver ? 'rgba(139,92,246,0.06)' : 'var(--surface)',
          transition: 'all 0.2s',
        }}
      >
        <Upload size={36} color={dragOver ? 'var(--accent2)' : 'var(--text3)'}
          style={{ margin: '0 auto 10px', display: 'block' }} />
        <div style={{ fontSize: 15, color: 'var(--text2)', fontWeight: 500 }}>
          {uploading ? 'Uploading...' : 'Drop .ttf / .otf files here'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
          Or click to browse · Multiple files supported · 8 MB max per file
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          {['Validates magic bytes', 'Deep parse security check', 'Private to your account', 'PDF-ready'].map(t => (
            <span key={t} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, color: 'var(--success)', background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.2)', borderRadius: 20, padding: '3px 10px',
            }}>
              <CheckCircle size={10} /> {t}
            </span>
          ))}
        </div>
        <input ref={fileRef} type="file" accept=".ttf,.otf" multiple style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)} />
      </div>

      {/* Font families */}
      {families.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: 'var(--surface)', borderRadius: 12, border: '1px dashed var(--border2)',
        }}>
          <Type size={40} color="var(--text3)" style={{ margin: '0 auto 12px', display: 'block' }} />
          <h3 style={{ fontSize: 16, marginBottom: 6 }}>No custom fonts yet</h3>
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>
            Upload .ttf or .otf files above to add fonts available only to you.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {families.map(fam => (
            <div key={fam.family_name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Family header */}
              <div style={{
                padding: '14px 20px', background: 'var(--bg3)',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  fontFamily: loadedFaces[fam.variants[0]?.id]
                    ? `uf_${fam.variants[0].id}, sans-serif` : 'inherit',
                  fontSize: 22, fontWeight: 400, color: 'var(--text)',
                }}>
                  {fam.family_name}
                </div>
                <span style={{
                  fontSize: 11, color: 'var(--text3)', background: 'var(--border)',
                  padding: '2px 8px', borderRadius: 20,
                }}>
                  {fam.variants.length} variant{fam.variants.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Variant rows */}
              <div style={{ padding: '8px 0' }}>
                {fam.variants.map(v => {
                  const cssFam = loadedFaces[v.id] ? `uf_${v.id}, sans-serif` : 'inherit'
                  const weightLabel = WEIGHT_LABELS[v.weight] || 'Regular'
                  return (
                    <div key={v.id} style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: '10px 20px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      {/* Weight badge */}
                      <div style={{
                        width: 90, fontSize: 11, color: 'var(--text3)',
                        display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0,
                      }}>
                        <span style={{
                          background: 'var(--bg3)', borderRadius: 4,
                          padding: '2px 6px', fontSize: 10, textAlign: 'center',
                          color: 'var(--accent2)',
                        }}>
                          {v.weight}
                        </span>
                        <span style={{ textAlign: 'center', fontSize: 10 }}>{weightLabel}{v.is_italic ? ' Italic' : ''}</span>
                      </div>

                      {/* Preview text rendered in this actual font */}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{
                          fontFamily: cssFam,
                          fontWeight: v.weight,
                          fontStyle: v.is_italic ? 'italic' : 'normal',
                          fontSize: 20,
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          The quick brown fox jumps over the lazy dog
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                          {fmtBytes(v.file_size)}
                          {v.is_variable ? (
                            <span style={{ marginLeft: 8, color: 'var(--warning)' }}>
                              ⚠ Variable font — renders at default weight in PDF
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Delete */}
                      <button
                        className="btn btn-danger"
                        style={{ padding: '6px 10px', fontSize: 12, flexShrink: 0 }}
                        onClick={() => deleteVariant(v.id, `${fam.family_name} ${v.variant_name}`)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div style={{
        marginTop: 24, padding: '14px 18px', borderRadius: 10,
        background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <Info size={16} color="var(--accent2)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--accent2)' }}>Font isolation:</strong>{' '}
          Your uploaded fonts are stored in a private directory and are never accessible to other users.
          Font files are validated with deep security checks before storage.
          To use bold/italic variants, upload the separate weight file (e.g. <em>MyFont-Bold.ttf</em>).
        </div>
      </div>
    </div>
  )
}