import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Save, ArrowLeft, Trash2, Type, Eye, EyeOff, Eye as EyeIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'
import FontPicker from '../components/FontPicker'
import CertPreviewModal from '../components/CertPreviewModal'

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72]

// 8 resize handles: defines position (% of box) and which dimension each drags
const HANDLES = [
  { id: 'nw', cursor: 'nw-resize', top: '0%',   left: '0%',   moveX: true,  moveY: true,  resizeW: true,  resizeH: true,  invertW: true,  invertH: true  },
  { id: 'n',  cursor: 'n-resize',  top: '0%',   left: '50%',  moveX: false, moveY: true,  resizeW: false, resizeH: true,  invertW: false, invertH: true  },
  { id: 'ne', cursor: 'ne-resize', top: '0%',   left: '100%', moveX: false, moveY: true,  resizeW: true,  resizeH: true,  invertW: false, invertH: true  },
  { id: 'e',  cursor: 'e-resize',  top: '50%',  left: '100%', moveX: false, moveY: false, resizeW: true,  resizeH: false, invertW: false, invertH: false },
  { id: 'se', cursor: 'se-resize', top: '100%', left: '100%', moveX: false, moveY: false, resizeW: true,  resizeH: true,  invertW: false, invertH: false },
  { id: 's',  cursor: 's-resize',  top: '100%', left: '50%',  moveX: false, moveY: false, resizeW: false, resizeH: true,  invertW: false, invertH: false },
  { id: 'sw', cursor: 'sw-resize', top: '100%', left: '0%',   moveX: true,  moveY: false, resizeW: true,  resizeH: true,  invertW: true,  invertH: false },
  { id: 'w',  cursor: 'w-resize',  top: '50%',  left: '0%',   moveX: true,  moveY: false, resizeW: true,  resizeH: false, invertW: true,  invertH: false },
]

function makeField() {
  return {
    id: crypto.randomUUID(),
    variable: 'name',
    x: 20, y: 40, width: 60, height: 10,
    font_family: 'Helvetica',
    font_size: 28,
    font_bold: false,
    font_italic: false,
    font_weight: 400,
    color: '#ffffff',
    alignment: 'center',
  }
}

export default function TemplateEditor() {
  const { id }     = useParams()
  const navigate   = useNavigate()

  const [template,         setTemplate]         = useState(null)
  const [fields,           setFields]           = useState([])
  const [selected,         setSelected]         = useState(null)
  const [saving,           setSaving]           = useState(false)
  const [showPreview,      setShowPreview]      = useState(true)
  const [activeOp,         setActiveOp]         = useState(null) // null | 'move' | 'resize'
  const [showFormModal,    setShowFormModal]    = useState(false) // Show form to fill sample data
  const [showCertModal,    setShowCertModal]    = useState(false) // Show certificate preview
  const [sampleData,       setSampleData]       = useState({})

  const canvasRef = useRef()
  // dragRef stores everything needed for the drag/resize operation
  // It is set on mousedown and read on mousemove — no stale-closure risk
  // because setFields always uses the functional updater pattern.
  const dragRef = useRef(null)

  // ── Load template ──────────────────────────────────────────────
  useEffect(() => {
    api.get(`/templates/${id}`)
      .then(r => { setTemplate(r.data); setFields(r.data.fields || []) })
      .catch(() => { toast.error('Template not found'); navigate('/') })
  }, [id])

  // ── Load font list from API ────────────────────────────────────
  useEffect(() => {
    api.get('/fonts/')
      .then(r => { if (r.data?.fonts?.length) setFontList(r.data.fonts) })
      .catch(() => {}) // silently fall back to default list
  }, [])

  // ── Global mouse listeners (registered once) ───────────────────
  useEffect(() => {
    const getRect  = () => canvasRef.current?.getBoundingClientRect()
    const toPctX   = px => { const r = getRect(); return r ? (px / r.width)  * 100 : 0 }
    const toPctY   = px => { const r = getRect(); return r ? (px / r.height) * 100 : 0 }

    const onMove = e => {
      const d = dragRef.current
      if (!d) return

      const rawDx = toPctX(e.clientX - d.startX)
      const rawDy = toPctY(e.clientY - d.startY)

      if (d.mode === 'move') {
        setFields(fs => fs.map(f => {
          if (f.id !== d.fid) return f
          return {
            ...f,
            x: Math.max(0, Math.min(100 - f.width,  d.ox + rawDx)),
            y: Math.max(0, Math.min(100 - f.height, d.oy + rawDy)),
          }
        }))
        return
      }

      // mode === 'resize' — handle-aware
      const h = d.handle
      setFields(fs => fs.map(f => {
        if (f.id !== d.fid) return f
        let nx = d.ox, ny = d.oy, nw = d.ow, nh = d.oh

        if (h.resizeW) {
          const wDelta = h.invertW ? -rawDx : rawDx
          nw = Math.max(3, d.ow + wDelta)
          if (h.invertW) nx = Math.min(d.ox + d.ow - 3, d.ox + rawDx)
        }
        if (h.resizeH) {
          const hDelta = h.invertH ? -rawDy : rawDy
          nh = Math.max(2, d.oh + hDelta)
          if (h.invertH) ny = Math.min(d.oy + d.oh - 2, d.oy + rawDy)
        }

        // Clamp to canvas bounds
        nx = Math.max(0, Math.min(100 - nw, nx))
        ny = Math.max(0, Math.min(100 - nh, ny))
        nw = Math.min(100 - nx, nw)
        nh = Math.min(100 - ny, nh)

        return { ...f, x: nx, y: ny, width: nw, height: nh }
      }))
    }

    const onUp = () => { dragRef.current = null; setActiveOp(null) }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, []) // empty — uses functional setFields, no stale state

  // ── Arrow key navigation for selected field ────────────────────
  useEffect(() => {
    const onKeyDown = e => {
      if (!selected) return

      const STEP = .33 // percentage step per key press

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          setFields(fs => {
            const f = fs.find(f => f.id === selected)
            if (!f) return fs
            return fs.map(field =>
              field.id === selected
                ? { ...field, y: Math.max(0, field.y - STEP) }
                : field
            )
          })
          break
        case 'ArrowDown':
          e.preventDefault()
          setFields(fs => {
            const f = fs.find(f => f.id === selected)
            if (!f) return fs
            return fs.map(field =>
              field.id === selected
                ? { ...field, y: Math.min(100 - field.height, field.y + STEP) }
                : field
            )
          })
          break
        case 'ArrowLeft':
          e.preventDefault()
          setFields(fs => {
            const f = fs.find(f => f.id === selected)
            if (!f) return fs
            return fs.map(field =>
              field.id === selected
                ? { ...field, x: Math.max(0, field.x - STEP) }
                : field
            )
          })
          break
        case 'ArrowRight':
          e.preventDefault()
          setFields(fs => {
            const f = fs.find(f => f.id === selected)
            if (!f) return fs
            return fs.map(field =>
              field.id === selected
                ? { ...field, x: Math.min(100 - field.width, field.x + STEP) }
                : field
            )
          })
          break
        default:
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected]) // depends on selected

  // ── Helpers ────────────────────────────────────────────────────
  const selectedField = fields.find(f => f.id === selected)

  const updateField = (fid, changes) =>
    setFields(fs => fs.map(f => f.id === fid ? { ...f, ...changes } : f))

  const addField = () => {
    const f = makeField()
    setFields(fs => [...fs, f])
    setSelected(f.id)
  }

  const deleteField = fid => {
    setFields(fs => fs.filter(f => f.id !== fid))
    if (selected === fid) setSelected(null)
  }

  const save = async () => {
    setSaving(true)
    try { await api.put(`/templates/${id}`, { fields }); toast.success('Template saved!') }
    catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  // ── Start a MOVE drag ──────────────────────────────────────────
  const startMove = (e, fid) => {
    e.preventDefault(); e.stopPropagation()
    setSelected(fid)
    const f = fields.find(f => f.id === fid)
    if (!f) return
    dragRef.current = { mode: 'move', fid, startX: e.clientX, startY: e.clientY, ox: f.x, oy: f.y }
    setActiveOp('move')
  }

  // ── Start a RESIZE drag ────────────────────────────────────────
  const startResize = (e, fid, handle) => {
    e.preventDefault(); e.stopPropagation()
    const f = fields.find(f => f.id === fid)
    if (!f) return
    dragRef.current = {
      mode: 'resize', fid, handle,
      startX: e.clientX, startY: e.clientY,
      ox: f.x, oy: f.y, ow: f.width, oh: f.height,
    }
    setActiveOp('resize')
  }

  // ── Certificate Preview Logic ──────────────────────────────────
  const getStorageKey = () => `cert-preview-${id}`
  
  const loadSampleDataFromStorage = () => {
    const stored = localStorage.getItem(getStorageKey())
    return stored ? JSON.parse(stored) : null
  }

  const saveSampleDataToStorage = (data) => {
    localStorage.setItem(getStorageKey(), JSON.stringify(data))
  }

  const getDefaultFormData = () => {
    const storedData = loadSampleDataFromStorage()
    if (storedData) return storedData
    
    const data = {}
    fields.forEach(f => {
      data[f.variable] = `Sample ${f.variable}`
    })
    return data
  }

  const handleOpenCertificatePreview = () => {
    setShowFormModal(true)
  }

  const handleSaveSampleData = (data) => {
    saveSampleDataToStorage(data)
    setSampleData(data)
    setShowFormModal(false)
  }

  const handlePreviewCertificate = (data) => {
    setSampleData(data)
    setShowCertModal(true)
  }

  // ── Render ─────────────────────────────────────────────────────
  if (!template) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)',
      }}>
        <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ padding: '8px 12px' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ fontSize: 22, marginBottom: 2 }}>{template.name}</h1>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {template.orientation} · {template.image_width_px}×{template.image_height_px}px
          </span>
        </div>
        <button className="btn btn-secondary" onClick={() => setShowPreview(s => !s)}>
          {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
          {showPreview ? 'Hide' : 'Show'} Preview
        </button>
        <button className="btn btn-secondary" onClick={addField}>
          <Plus size={14} /> Add Field
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={handleOpenCertificatePreview}
          disabled={fields.length === 0}
          style={{ opacity: fields.length === 0 ? 0.5 : 1, cursor: fields.length === 0 ? 'not-allowed' : 'pointer' }}
        >
          <EyeIcon size={14} /> Certificate Preview
        </button>
        <button className="btn btn-gold" onClick={save} disabled={saving}>
          {saving
            ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving...</>
            : <><Save size={14} /> Save</>}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* Canvas */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          <div
            ref={canvasRef}
            style={{ position: 'relative', display: 'inline-block', userSelect: 'none' }}
            onClick={() => setSelected(null)}
          >
            <img
              src={`/${template.image_path}`}
              alt="template"
              style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(100vh - 200px)' }}
              draggable={false}
            />

            {fields.map(f => {
              const isSel = f.id === selected
              return (
                <div
                  key={f.id}
                  style={{
                    position: 'absolute',
                    left: `${f.x}%`, top: `${f.y}%`,
                    width: `${f.width}%`, height: `${f.height}%`,
                    border: `2px ${isSel ? 'solid' : 'dashed'} ${isSel ? '#f59e0b' : 'rgba(139,92,246,0.75)'}`,
                    borderRadius: 4,
                    boxSizing: 'border-box',
                    background: isSel ? 'rgba(245,158,11,0.07)' : 'rgba(139,92,246,0.05)',
                    cursor: activeOp === 'move' && isSel ? 'grabbing' : 'grab',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: f.alignment === 'center' ? 'center' : f.alignment === 'right' ? 'flex-end' : 'flex-start',
                    overflow: 'hidden',
                  }}
                  onMouseDown={e => startMove(e, f.id)}
                  onClick={e => { e.stopPropagation(); setSelected(f.id) }}
                >
                  {/* Preview label */}
                  {showPreview && (
                    <span style={{
                      fontSize: `clamp(8px, ${f.font_size * 0.55}px, 48px)`,
                      fontWeight: f.font_bold ? 'bold' : 'normal',
                      fontStyle: f.font_italic ? 'italic' : 'normal',
                      color: f.color,
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      padding: '0 4px',
                      textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                      fontFamily: f.font_family,
                    }}>
                      {`{${f.variable}}`}
                    </span>
                  )}

                  {/* Variable name tag */}
                  <div style={{
                    position: 'absolute', top: -22, left: 0,
                    background: isSel ? '#f59e0b' : '#7c3aed',
                    color: isSel ? '#1a0a00' : 'white',
                    fontSize: 10, fontWeight: 600, padding: '2px 6px',
                    borderRadius: '3px 3px 0 0', whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                  }}>
                    {f.variable}
                  </div>

                  {/* 8 resize handles (only for selected field) */}
                  {isSel && HANDLES.map(h => (
                    <div
                      key={h.id}
                      onMouseDown={e => startResize(e, f.id, h)}
                      style={{
                        position: 'absolute',
                        top: h.top, left: h.left,
                        width: 10, height: 10,
                        marginTop: -5, marginLeft: -5,
                        background: '#f59e0b',
                        border: '2px solid #1a0a00',
                        borderRadius: 2,
                        cursor: h.cursor,
                        zIndex: 20,
                        pointerEvents: 'all',
                      }}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {/* Properties panel */}
        <div style={{
          width: 285, background: 'var(--bg2)', borderRadius: 12,
          border: '1px solid var(--border)', overflow: 'auto', flexShrink: 0,
        }}>
          {/* Field list */}
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Fields ({fields.length})
            </div>
            {fields.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '10px 0' }}>
                No fields yet. Click "Add Field".
              </div>
            )}
            {fields.map(f => (
              <div
                key={f.id}
                onClick={() => setSelected(f.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                  background: selected === f.id ? 'rgba(245,158,11,0.1)' : 'transparent',
                  border: `1px solid ${selected === f.id ? 'rgba(245,158,11,0.3)' : 'transparent'}`,
                }}
              >
                <Type size={13} color={selected === f.id ? '#f59e0b' : 'var(--text3)'} />
                <span style={{ flex: 1, fontSize: 13, color: selected === f.id ? '#f59e0b' : 'var(--text)' }}>
                  {`{${f.variable}}`}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); deleteField(f.id) }}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', padding: 2, cursor: 'pointer' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Properties */}
          {selectedField && (
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
                Field Properties
              </div>

              <PropRow label="Variable Name">
                <input className="input" style={{ fontSize: 13 }}
                  value={selectedField.variable}
                  onChange={e => updateField(selectedField.id, { variable: e.target.value.replace(/\s+/g, '_') })}
                  placeholder="e.g. student_name"
                />
              </PropRow>

              <PropRow label={`Font Family`}>
                <FontPicker
                  value={selectedField.font_family}
                  weight={selectedField.font_weight || 400}
                  onChange={val => updateField(selectedField.id, { font_family: val })}
                  onWeightChange={w => updateField(selectedField.id, { font_weight: w, font_bold: w >= 600 })}
                />
              </PropRow>

              <PropRow label="Font Size (pt)">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select className="input" style={{ fontSize: 13, flex: 1 }}
                    value={selectedField.font_size}
                    onChange={e => updateField(selectedField.id, { font_size: Number(e.target.value) })}>
                    {FONT_SIZES.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <input className="input" type="number" min="6" max="200" style={{ fontSize: 13, width: 64 }}
                    value={selectedField.font_size}
                    onChange={e => updateField(selectedField.id, { font_size: Number(e.target.value) })}
                  />
                </div>
              </PropRow>

              <PropRow label="Style">
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['B', 'font_bold', { fontWeight: 'bold' }], ['I', 'font_italic', { fontStyle: 'italic' }]].map(([lbl, key, st]) => (
                    <button key={key}
                      onClick={() => updateField(selectedField.id, { [key]: !selectedField[key] })}
                      style={{
                        flex: 1, padding: '7px', borderRadius: 6, cursor: 'pointer', fontSize: 14, ...st,
                        border: `1px solid ${selectedField[key] ? 'var(--accent)' : 'var(--border)'}`,
                        background: selectedField[key] ? 'rgba(139,92,246,0.25)' : 'var(--bg2)',
                        color: selectedField[key] ? 'var(--accent2)' : 'var(--text2)',
                      }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </PropRow>

              <PropRow label="Alignment">
                <div style={{ display: 'flex', gap: 6 }}>
                  {['left', 'center', 'right'].map(a => (
                    <button key={a}
                      onClick={() => updateField(selectedField.id, { alignment: a })}
                      style={{
                        flex: 1, padding: '7px', borderRadius: 6, cursor: 'pointer',
                        fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
                        border: `1px solid ${selectedField.alignment === a ? 'var(--accent)' : 'var(--border)'}`,
                        background: selectedField.alignment === a ? 'rgba(139,92,246,0.25)' : 'var(--bg2)',
                        color: selectedField.alignment === a ? 'var(--accent2)' : 'var(--text2)',
                      }}>
                      {a}
                    </button>
                  ))}
                </div>
              </PropRow>

              <PropRow label="Text Color">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={selectedField.color}
                    onChange={e => updateField(selectedField.id, { color: e.target.value })}
                    style={{ width: 40, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  />
                  <input className="input" style={{ flex: 1, fontSize: 13 }}
                    value={selectedField.color}
                    onChange={e => updateField(selectedField.id, { color: e.target.value })}
                  />
                </div>
              </PropRow>

              {/* Position & Size — auto-updated by mouse drag, also manually editable */}
              <PropRow label="Position & Size (%) · drag to update">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[['x', 'X (left)'], ['y', 'Y (top)'], ['width', 'Width'], ['height', 'Height']].map(([key, lbl]) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{lbl}</div>
                      <input
                        className="input"
                        type="number" min="0" max="100" step="0.1"
                        style={{ fontSize: 13 }}
                        value={Number(selectedField[key]).toFixed(1)}
                        onChange={e => updateField(selectedField.id, { [key]: Number(e.target.value) })}
                      />
                    </div>
                  ))}
                </div>
              </PropRow>

              <button className="btn btn-danger"
                style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
                onClick={() => deleteField(selectedField.id)}>
                <Trash2 size={13} /> Delete Field
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Form Modal to Fill Sample Data */}
      {showFormModal && (
        <SampleDataFormModal 
          fields={fields}
          defaultData={getDefaultFormData()}
          onSave={handleSaveSampleData}
          onPreview={handlePreviewCertificate}
          onClose={() => setShowFormModal(false)}
        />
      )}

      {/* Certificate Preview Modal */}
      {showCertModal && (
        <CertPreviewModal
          template={template}
          sampleRow={sampleData}
          onClose={() => setShowCertModal(false)}
        />
      )}
    </div>
  )
}

// ── Sample Data Form Modal Component ───────────────────────────
function SampleDataFormModal({ fields, defaultData, onSave, onPreview, onClose }) {
  const [formData, setFormData] = useState(defaultData || {})

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    onSave(formData)
  }

  const handlePreview = () => {
    onPreview(formData)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, backdropFilter: 'blur(6px)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 14,
        border: '1px solid var(--border)', padding: 24,
        maxWidth: '500px', width: '90%',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Fill Sample Data</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text3)',
            cursor: 'pointer', padding: 4, fontSize: 20,
          }}>
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflow: 'auto' }}>
          {fields.map(f => (
            <div key={f.id}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', marginBottom: 6, display: 'block' }}>
                {f.variable.toUpperCase()}
              </label>
              <input
                type="text"
                className="input"
                value={formData[f.variable] || ''}
                onChange={e => handleChange(f.variable, e.target.value)}
                placeholder={`Enter ${f.variable}`}
                style={{ fontSize: 13, width: '100%' }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-secondary" onClick={handleSave}>
            Save
          </button>
          <button className="btn btn-gold" onClick={handlePreview}>
            Preview Certificate
          </button>
        </div>
      </div>
    </div>
  )
}

function PropRow({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}