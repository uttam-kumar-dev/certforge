import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Save, ArrowLeft, Trash2, Type, Move, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'

const FONT_FAMILIES = ['Helvetica', 'Times New Roman', 'Courier', 'Arial', 'Serif']
const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72]

const defaultField = () => ({
  id: crypto.randomUUID(),
  variable: 'name',
  x: 20, y: 40, width: 60, height: 10,
  font_family: 'Helvetica',
  font_size: 28,
  font_bold: false,
  font_italic: false,
  color: '#ffffff',
  alignment: 'center'
})

export default function TemplateEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [template, setTemplate] = useState(null)
  const [fields, setFields] = useState([])
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [dragging, setDragging] = useState(null)
  const [resizing, setResizing] = useState(null)
  const canvasRef = useRef()
  const dragStart = useRef(null)

  useEffect(() => {
    api.get(`/templates/${id}`).then(r => {
      setTemplate(r.data)
      setFields(r.data.fields || [])
    }).catch(() => { toast.error('Template not found'); navigate('/') })
  }, [id])

  const selectedField = fields.find(f => f.id === selected)

  const updateField = (fid, changes) => {
    setFields(fs => fs.map(f => f.id === fid ? { ...f, ...changes } : f))
  }

  const addField = () => {
    const f = defaultField()
    setFields(fs => [...fs, f])
    setSelected(f.id)
  }

  const deleteField = fid => {
    setFields(fs => fs.filter(f => f.id !== fid))
    if (selected === fid) setSelected(null)
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/templates/${id}`, { fields })
      toast.success('Template saved!')
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  // Mouse drag logic on canvas overlay
  const getCanvasRect = () => canvasRef.current?.getBoundingClientRect()

  const toPct = (px, total) => Math.max(0, Math.min(100, (px / total) * 100))

  const handleCanvasMouseDown = (e, fid, mode = 'move') => {
    e.preventDefault(); e.stopPropagation()
    setSelected(fid)
    const rect = getCanvasRect()
    dragStart.current = {
      fid, mode,
      startX: e.clientX, startY: e.clientY,
      rectW: rect.width, rectH: rect.height,
      field: fields.find(f => f.id === fid)
    }
    if (mode === 'move') setDragging(fid)
    else setResizing(fid)
  }

  const handleMouseMove = useCallback(e => {
    if (!dragStart.current) return
    const { fid, mode, startX, startY, rectW, rectH, field } = dragStart.current
    const dx = toPct(e.clientX - startX, rectW)
    const dy = toPct(e.clientY - startY, rectH)

    if (mode === 'move') {
      updateField(fid, {
        x: Math.max(0, Math.min(100 - field.width, field.x + dx)),
        y: Math.max(0, Math.min(100 - field.height, field.y + dy))
      })
    } else {
      updateField(fid, {
        width: Math.max(5, field.width + dx),
        height: Math.max(3, field.height + dy)
      })
    }
  }, [fields])

  const handleMouseUp = useCallback(() => {
    dragStart.current = null
    setDragging(null); setResizing(null)
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  if (!template) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        paddingBottom: 20, borderBottom: '1px solid var(--border)'
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
          {showPreview ? 'Hide' : 'Show'} Preview Text
        </button>
        <button className="btn btn-secondary" onClick={addField}>
          <Plus size={14} /> Add Field
        </button>
        <button className="btn btn-gold" onClick={save} disabled={saving}>
          {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving...</> : <><Save size={14} /> Save</>}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Canvas area */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          <div style={{ position: 'relative', display: 'inline-block', userSelect: 'none' }} ref={canvasRef}
            onClick={() => setSelected(null)}>
            <img
              src={`/${template.image_path}`}
              alt="template"
              style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(100vh - 200px)' }}
              draggable={false}
            />

            {/* Field overlays */}
            {fields.map(f => {
              const isSel = f.id === selected
              return (
                <div key={f.id} style={{
                  position: 'absolute',
                  left: `${f.x}%`, top: `${f.y}%`,
                  width: `${f.width}%`, height: `${f.height}%`,
                  border: `2px ${isSel ? 'solid' : 'dashed'} ${isSel ? '#f59e0b' : 'rgba(139,92,246,0.7)'}`,
                  borderRadius: 4,
                  cursor: dragging === f.id ? 'grabbing' : 'grab',
                  boxSizing: 'border-box',
                  background: isSel ? 'rgba(245,158,11,0.08)' : 'rgba(139,92,246,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: f.alignment === 'center' ? 'center' : f.alignment === 'right' ? 'flex-end' : 'flex-start',
                  overflow: 'hidden'
                }}
                  onMouseDown={e => handleCanvasMouseDown(e, f.id, 'move')}
                  onClick={e => { e.stopPropagation(); setSelected(f.id) }}>

                  {/* Preview text */}
                  {showPreview && (
                    <span style={{
                      fontSize: `clamp(8px, ${f.font_size * 0.6}px, 40px)`,
                      fontWeight: f.font_bold ? 'bold' : 'normal',
                      fontStyle: f.font_italic ? 'italic' : 'normal',
                      color: f.color,
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      padding: '0 4px',
                      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                      fontFamily: f.font_family
                    }}>
                      {`{${f.variable}}`}
                    </span>
                  )}

                  {/* Label */}
                  <div style={{
                    position: 'absolute', top: -22, left: 0,
                    background: isSel ? '#f59e0b' : '#7c3aed',
                    color: isSel ? '#1a0a00' : 'white',
                    fontSize: 10, fontWeight: 600, padding: '2px 6px',
                    borderRadius: '3px 3px 0 0', whiteSpace: 'nowrap',
                    pointerEvents: 'none'
                  }}>
                    {f.variable}
                  </div>

                  {/* Resize handle */}
                  <div style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 12, height: 12,
                    background: isSel ? '#f59e0b' : '#7c3aed',
                    borderRadius: '3px 0 3px 0',
                    cursor: 'se-resize'
                  }}
                    onMouseDown={e => { e.stopPropagation(); handleCanvasMouseDown(e, f.id, 'resize') }} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Properties panel */}
        <div style={{
          width: 280, background: 'var(--bg2)', borderRadius: 12,
          border: '1px solid var(--border)', overflow: 'auto', flexShrink: 0
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
              <div key={f.id} onClick={() => setSelected(f.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                background: selected === f.id ? 'rgba(245,158,11,0.1)' : 'transparent',
                border: `1px solid ${selected === f.id ? 'rgba(245,158,11,0.3)' : 'transparent'}`
              }}>
                <Type size={13} color={selected === f.id ? '#f59e0b' : 'var(--text3)'} />
                <span style={{ flex: 1, fontSize: 13, color: selected === f.id ? '#f59e0b' : 'var(--text)' }}>
                  {'{'}{ f.variable}{'}'}
                </span>
                <button onClick={e => { e.stopPropagation(); deleteField(f.id) }}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', padding: 2, cursor: 'pointer' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Field properties */}
          {selectedField && (
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
                Field Properties
              </div>

              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                Variable Name
              </label>
              <input className="input" style={{ marginBottom: 14, fontSize: 13 }}
                value={selectedField.variable}
                onChange={e => updateField(selectedField.id, { variable: e.target.value.replace(/\s+/g, '_') })}
                placeholder="e.g. student_name" />

              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                Font Family
              </label>
              <select className="input" style={{ marginBottom: 14, fontSize: 13 }}
                value={selectedField.font_family}
                onChange={e => updateField(selectedField.id, { font_family: e.target.value })}>
                {FONT_FAMILIES.map(f => <option key={f}>{f}</option>)}
              </select>

              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                Font Size
              </label>
              <select className="input" style={{ marginBottom: 14, fontSize: 13 }}
                value={selectedField.font_size}
                onChange={e => updateField(selectedField.id, { font_size: Number(e.target.value) })}>
                {FONT_SIZES.map(s => <option key={s}>{s}</option>)}
              </select>

              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Style</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'B', key: 'font_bold', style: { fontWeight: 'bold' } },
                  { label: 'I', key: 'font_italic', style: { fontStyle: 'italic' } },
                ].map(({ label, key, style }) => (
                  <button key={key} onClick={() => updateField(selectedField.id, { [key]: !selectedField[key] })}
                    style={{
                      flex: 1, padding: '6px', borderRadius: 6, border: '1px solid var(--border)',
                      background: selectedField[key] ? 'rgba(139,92,246,0.25)' : 'var(--bg2)',
                      color: selectedField[key] ? 'var(--accent2)' : 'var(--text2)',
                      fontSize: 14, ...style, borderColor: selectedField[key] ? 'var(--accent)' : 'var(--border)'
                    }}>
                    {label}
                  </button>
                ))}
              </div>

              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Alignment</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {['left', 'center', 'right'].map(a => (
                  <button key={a} onClick={() => updateField(selectedField.id, { alignment: a })}
                    style={{
                      flex: 1, padding: '6px', borderRadius: 6, border: '1px solid var(--border)',
                      background: selectedField.alignment === a ? 'rgba(139,92,246,0.25)' : 'var(--bg2)',
                      color: selectedField.alignment === a ? 'var(--accent2)' : 'var(--text2)',
                      fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
                      borderColor: selectedField.alignment === a ? 'var(--accent)' : 'var(--border)'
                    }}>
                    {a}
                  </button>
                ))}
              </div>

              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
                <input type="color" value={selectedField.color}
                  onChange={e => updateField(selectedField.id, { color: e.target.value })}
                  style={{ width: 40, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                <input className="input" style={{ flex: 1, fontSize: 13 }}
                  value={selectedField.color}
                  onChange={e => updateField(selectedField.id, { color: e.target.value })} />
              </div>

              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Position & Size (%)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[['x', 'X'], ['y', 'Y'], ['width', 'W'], ['height', 'H']].map(([key, label]) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
                    <input className="input" type="number" min="0" max="100" step="0.5" style={{ fontSize: 13 }}
                      value={Number(selectedField[key]).toFixed(1)}
                      onChange={e => updateField(selectedField.id, { [key]: Number(e.target.value) })} />
                  </div>
                ))}
              </div>

              <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
                onClick={() => deleteField(selectedField.id)}>
                <Trash2 size={13} /> Delete Field
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
