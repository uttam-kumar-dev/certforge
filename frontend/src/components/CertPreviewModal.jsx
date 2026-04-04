import { useState } from 'react'
import { X, Eye } from 'lucide-react'

const FONT_FAMILY_CSS = {
  'Helvetica': 'Helvetica, Arial, sans-serif',
  'Arial': 'Arial, sans-serif',
  'Times New Roman': "'Times New Roman', Times, serif",
  'Courier': "'Courier New', Courier, monospace",
  'Serif': 'Georgia, serif',
  'Sans-Serif': 'Arial, sans-serif',
}

/**
 * Renders a live HTML preview of a certificate with filled-in sample data.
 * Props:
 *   template  – template object with image_path, fields, orientation
 *   sampleRow – object { variable: value } for substitution
 *   onClose   – close handler
 */
export default function CertPreviewModal({ template, sampleRow, onClose }) {
  if (!template) return null

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
        maxWidth: '90vw', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eye size={16} color="var(--accent2)" />
            <span style={{ fontWeight: 600, fontSize: 15 }}>Certificate Preview</span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text3)',
            cursor: 'pointer', padding: 4,
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Preview canvas */}
        <div style={{
          position: 'relative', display: 'inline-block',
          maxWidth: '80vw', maxHeight: '70vh', overflow: 'hidden',
          borderRadius: 8, border: '1px solid var(--border)',
        }}>
          <img
            src={`/${template.image_path}`}
            alt="certificate"
            style={{
              display: 'block',
              maxWidth: '80vw',
              maxHeight: '70vh',
              objectFit: 'contain',
            }}
          />
          {/* Overlay fields */}
          {(template.fields || []).map(f => {
            const value = sampleRow?.[f.variable] ?? `{${f.variable}}`
            const fontFamily = FONT_FAMILY_CSS[f.font_family] || 'Helvetica, sans-serif'
            const alignMap = { left: 'flex-start', center: 'center', right: 'flex-end' }
            const textAlign = f.alignment || 'center'
            return (
              <div key={f.id} style={{
                position: 'absolute',
                left: `${f.x}%`, top: `${f.y}%`,
                width: `${f.width}%`, height: `${f.height}%`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: alignMap[textAlign] || 'center',
                overflow: 'hidden',
                pointerEvents: 'none',
              }}>
                <span style={{
                  fontFamily,
                  fontSize: `clamp(8px, ${f.font_size * 0.55}px, 60px)`,
                  fontWeight: f.font_bold ? 'bold' : 'normal',
                  fontStyle: f.font_italic ? 'italic' : 'normal',
                  color: f.color || '#000000',
                  textAlign,
                  whiteSpace: 'nowrap',
                  padding: '0 4px',
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}>
                  {value}
                </span>
              </div>
            )
          })}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
          This is an approximate browser preview. The generated PDF may differ slightly in font rendering.
        </div>
      </div>
    </div>
  )
}
