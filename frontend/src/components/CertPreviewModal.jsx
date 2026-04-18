import { useState, useEffect } from 'react'
import { X, Eye } from 'lucide-react'
import api from '../api/client'

/**
 * Renders a PDF preview of a certificate (from server).
 * Props:
 *   template  – template object with image_path, fields, orientation, id
 *   sampleRow – object { variable: value } for substitution
 *   onClose   – close handler
 */
export default function CertPreviewModal({ template, sampleRow, onClose }) {
  const [pdfUrl, setPdfUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!template) return

    const loadPreview = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await api.post(`/certificates/preview/${template.id}`, sampleRow, {
          responseType: 'blob',
        })
        const blob = new Blob([response.data], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        setPdfUrl(url)
      } catch (err) {
        console.error('Failed to load preview:', err)
        setError('Failed to generate preview')
      } finally {
        setLoading(false)
      }
    }

    loadPreview()

    // Cleanup blob URL on unmount
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
  }, [template, sampleRow])

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
        width:'50vw', height: '50vw',
        maxWidth: '90vw', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', gap: 16,
        overflow: 'hidden',
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

        {/* PDF Preview */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, border: '1px solid var(--border)',
          overflow: 'hidden',
          background: 'var(--bg1)',
        }}>
          {loading ? (
            <div style={{ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div className="spinner" style={{ width: 40, height: 40 }} />
              <span style={{ fontSize: 13, color: 'var(--text3)' }}>Generating preview...</span>
            </div>
          ) : error ? (
            <div style={{ padding: 40, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>
              {error}
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl+'#toolbar=0&scrollbar=0&view=Fit'}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: 8,
                display: 'block',
              }}
              title="Certificate Preview"
              scrolling="no"
              frameBorder="0"
              allowFullScreen={true}
            />
          ) : (
            <div style={{ padding: 40, color: 'var(--text3)', fontSize: 13 }}>
              No preview available
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
          This is the actual PDF that will be generated.
        </div>
      </div>
    </div>
  )
}
