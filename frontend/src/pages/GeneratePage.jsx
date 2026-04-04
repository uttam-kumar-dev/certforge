import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, Zap, CheckCircle, AlertCircle, Eye, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'
import CertPreviewModal from '../components/CertPreviewModal'

function StepNum({ n }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, color: 'white',
    }}>{n}</div>
  )
}

export default function GeneratePage() {
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [jobName, setJobName] = useState('')
  const [csvFile, setCsvFile] = useState(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const fileRef = useRef()
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/templates/').then(r => {
      setTemplates(r.data)
      if (r.data.length > 0) setSelectedTemplate(String(r.data[0].id))
    })
  }, [])

  const handleCSV = file => {
    if (!file || !file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file'); return
    }
    setCsvFile(file)
    const reader = new FileReader()
    reader.onload = e => {
      const lines = e.target.result.split('\n').filter(l => l.trim())
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
      const rows = lines.slice(1, 4).map(l => l.split(',').map(v => v.trim().replace(/"/g, '')))
      const allRows = lines.slice(1).map(l => {
        const vals = l.split(',').map(v => v.trim().replace(/"/g, ''))
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']))
      })
      setCsvPreview({ headers, rows, total: lines.length - 1, allRows })
    }
    reader.readAsText(file)
  }

  const currentTemplate = templates.find(t => String(t.id) === selectedTemplate)
  const templateVars = currentTemplate?.fields?.map(f => f.variable) || []
  const missingVars = templateVars.filter(v =>
    csvPreview && !csvPreview.headers.some(h => h.toLowerCase() === v.toLowerCase())
  )
  const sampleRow = csvPreview?.allRows?.[0]
    || Object.fromEntries(templateVars.map(v => [v, `Sample ${v}`]))

  const downloadSampleCSV = () => {
    if (!templateVars.length) { toast.error('Template has no fields defined'); return }
    const header = templateVars.join(',')
    const row1 = templateVars.map(v => `Sample ${v}`).join(',')
    const row2 = templateVars.map(v => `Another ${v}`).join(',')
    const csv = `${header}\n${row1}\n${row2}\n`
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${currentTemplate?.name || 'template'}_sample.csv`
    a.click(); URL.revokeObjectURL(url)
    toast.success('Sample CSV downloaded!')
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!csvFile || !selectedTemplate || !jobName.trim()) { toast.error('Please fill all fields'); return }
    if (missingVars.length > 0) { toast.error(`CSV missing: ${missingVars.join(', ')}`); return }
    setLoading(true)
    const fd = new FormData()
    fd.append('template_id', selectedTemplate)
    fd.append('job_name', jobName.trim())
    fd.append('csv_file', csvFile)
    try {
      await api.post('/certificates/generate', fd)
      toast.success('Certificate generation started!')
      navigate('/jobs')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start generation')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 820 }}>
      {showPreview && currentTemplate && (
        <CertPreviewModal template={currentTemplate} sampleRow={sampleRow} onClose={() => setShowPreview(false)} />
      )}

      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">Generate Certificates</h1>
        <p style={{ color: 'var(--text3)', fontSize: 14 }}>Upload a CSV with student data to bulk-generate PDF certificates</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Step 1 */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <StepNum n={1} />
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Select Certificate Template</h3>
          </div>
          {templates.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 14 }}>
              No templates yet. <a href="/" style={{ color: 'var(--accent2)' }}>Upload one first →</a>
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
              {templates.map(t => (
                <div key={t.id} onClick={() => setSelectedTemplate(String(t.id))} style={{
                  border: `2px solid ${selectedTemplate === String(t.id) ? '#f59e0b' : 'var(--border)'}`,
                  borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                  background: selectedTemplate === String(t.id) ? 'rgba(245,158,11,0.06)' : 'var(--bg2)',
                  transition: 'all 0.15s',
                }}>
                  <img src={`/${t.image_path}`} alt={t.name}
                    style={{ width: '100%', height: 88, objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: selectedTemplate === String(t.id) ? '#f59e0b' : 'var(--text)' }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {t.fields.length} fields · {t.orientation}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {currentTemplate && (
            <div style={{ marginTop: 14 }}>
              {templateVars.length > 0 ? (
                <div style={{
                  padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8,
                  display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10,
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Required CSV columns:</span>
                  {templateVars.map(v => (
                    <span key={v} style={{
                      padding: '2px 9px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      background: 'rgba(139,92,246,0.15)', color: 'var(--accent2)',
                      border: '1px solid rgba(139,92,246,0.25)',
                    }}>{v}</span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--warning)', marginBottom: 10 }}>
                  ⚠️ This template has no fields configured. Edit it first.
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={downloadSampleCSV} style={{ fontSize: 12, padding: '7px 12px' }}>
                  <Download size={12} /> Download Sample CSV
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPreview(true)} style={{ fontSize: 12, padding: '7px 12px' }}>
                  <Eye size={12} /> Preview Certificate
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Step 2 */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <StepNum n={2} />
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Job Name</h3>
          </div>
          <input className="input" placeholder="e.g. Python Fundamentals — December 2024"
            value={jobName} onChange={e => setJobName(e.target.value)} required />
        </div>

        {/* Step 3 */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <StepNum n={3} />
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Upload Student CSV</h3>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleCSV(e.dataTransfer.files[0]) }}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border2)'}`,
              borderRadius: 10, padding: 28, textAlign: 'center', cursor: 'pointer',
              background: dragOver ? 'rgba(139,92,246,0.06)' : 'var(--bg2)', transition: 'all 0.2s',
            }}>
            {csvFile ? (
              <>
                <FileText size={32} color="var(--success)" style={{ margin: '0 auto 8px', display: 'block' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>{csvFile.name}</div>
                {csvPreview && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                    {csvPreview.total} records · {csvPreview.headers.length} columns
                  </div>
                )}
              </>
            ) : (
              <>
                <Upload size={32} color="var(--text3)" style={{ margin: '0 auto 8px', display: 'block' }} />
                <div style={{ fontSize: 14, color: 'var(--text2)' }}>Drop CSV here or click to browse</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                  First row must be headers matching the template variable names above
                </div>
              </>
            )}
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => handleCSV(e.target.files[0])} />
          </div>

          {csvPreview && (
            <div style={{ marginTop: 16 }}>
              {missingVars.length > 0 ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                  background: 'rgba(239,68,68,0.1)', borderRadius: 8, marginBottom: 12,
                  border: '1px solid rgba(239,68,68,0.25)',
                }}>
                  <AlertCircle size={16} color="var(--danger)" />
                  <span style={{ fontSize: 13, color: 'var(--danger)' }}>
                    Missing required columns: <strong>{missingVars.join(', ')}</strong>
                  </span>
                </div>
              ) : templateVars.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                  background: 'rgba(16,185,129,0.1)', borderRadius: 8, marginBottom: 12,
                  border: '1px solid rgba(16,185,129,0.25)',
                }}>
                  <CheckCircle size={16} color="var(--success)" />
                  <span style={{ fontSize: 13, color: 'var(--success)' }}>
                    All columns matched — {csvPreview.total} certificate{csvPreview.total !== 1 ? 's' : ''} will be generated
                  </span>
                </div>
              )}

              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Data preview (first 3 rows)</div>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {csvPreview.headers.map(h => (
                        <th key={h} style={{
                          padding: '8px 12px', textAlign: 'left', background: 'var(--bg3)',
                          color: templateVars.includes(h) ? 'var(--accent2)' : 'var(--text2)',
                          borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap',
                        }}>
                          {h} {templateVars.includes(h) && <span style={{ color: 'var(--success)' }}>✓</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.rows.map((row, i) => (
                      <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                        {row.map((cell, j) => (
                          <td key={j} style={{
                            padding: '7px 12px', color: 'var(--text2)',
                            borderBottom: i < csvPreview.rows.length - 1 ? '1px solid var(--border)' : 'none',
                          }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {missingVars.length === 0 && csvPreview.total > 0 && (
                <button type="button" className="btn btn-secondary"
                  onClick={() => setShowPreview(true)} style={{ marginTop: 12, fontSize: 13 }}>
                  <Eye size={14} /> Preview with first row data
                </button>
              )}
            </div>
          )}
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button className="btn btn-gold" type="submit"
            disabled={loading || !csvFile || !selectedTemplate || !jobName.trim() || missingVars.length > 0}
            style={{ padding: '12px 28px', fontSize: 15 }}>
            {loading
              ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Starting...</>
              : <><Zap size={16} /> Generate {csvPreview?.total ? `${csvPreview.total} ` : ''}Certificate{csvPreview?.total !== 1 ? 's' : ''}</>}
          </button>
          {csvPreview?.total > 0 && missingVars.length === 0 && (
            <span style={{ fontSize: 13, color: 'var(--text3)' }}>
              PDFs will be packaged into a ZIP for download
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
