import { useState, useEffect } from 'react'
import { Download, RefreshCw, Clock, CheckCircle, XCircle, Loader, Archive } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'

const statusConfig = {
  pending: { icon: Clock, color: 'var(--text3)', badge: 'badge-info', label: 'Pending' },
  processing: { icon: Loader, color: 'var(--accent)', badge: 'badge-info', label: 'Processing' },
  completed: { icon: CheckCircle, color: 'var(--success)', badge: 'badge-success', label: 'Completed' },
  failed: { icon: XCircle, color: 'var(--danger)', badge: 'badge-danger', label: 'Failed' },
}

function JobCard({ job, onRefresh }) {
  const cfg = statusConfig[job.status] || statusConfig.pending
  const StatusIcon = cfg.icon
  const pct = job.total_records > 0
    ? Math.round((job.completed_records / job.total_records) * 100) : 0

  const download = async () => {
    try {
      const resp = await api.get(`/certificates/jobs/${job.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data)
      const a = document.createElement('a')
      a.href = url; a.download = `${job.job_name}_certificates.zip`
      a.click(); URL.revokeObjectURL(url)
    } catch { toast.error('Download failed') }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          background: job.status === 'completed' ? 'rgba(16,185,129,0.1)' :
            job.status === 'processing' ? 'rgba(139,92,246,0.1)' :
            job.status === 'failed' ? 'rgba(239,68,68,0.1)' : 'rgba(107,95,143,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <StatusIcon size={20} color={cfg.color}
            style={job.status === 'processing' ? { animation: 'spin 1s linear infinite' } : {}} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{job.job_name}</span>
            <span className={`badge ${cfg.badge}`} style={{ fontSize: 11 }}>{cfg.label}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
            Template: {job.template_name} · {new Date(job.created_at).toLocaleString()}
          </div>

          {/* Progress */}
          {(job.status === 'processing' || job.status === 'completed') && job.total_records > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                <span>{job.completed_records} / {job.total_records} certificates</span>
                <span>{pct}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {job.status === 'completed' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={download} style={{ fontSize: 13, padding: '7px 14px' }}>
                <Archive size={13} /> Download All (ZIP)
              </button>
              <div style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle size={13} /> {job.total_records} certificates ready
              </div>
            </div>
          )}

          {job.status === 'failed' && (
            <div style={{ fontSize: 13, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <XCircle size={13} /> Generation failed. Please check your template fields and CSV.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function JobsPage() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await api.get('/certificates/jobs')
      setJobs(r.data)
    } catch { toast.error('Failed to load jobs') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    // Auto-refresh if any job is processing
    const interval = setInterval(() => {
      setJobs(prev => {
        if (prev.some(j => j.status === 'processing' || j.status === 'pending')) {
          load(true)
        }
        return prev
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Generation Jobs</h1>
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>
            Track and download your certificate batches
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => load()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
      ) : jobs.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          background: 'var(--surface)', borderRadius: 12, border: '1px dashed var(--border2)'
        }}>
          <Clock size={48} color="var(--text3)" style={{ margin: '0 auto 16px', display: 'block' }} />
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>No jobs yet</h3>
          <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 20 }}>
            Go to Generate to create your first certificate batch
          </p>
          <a href="/generate" className="btn btn-primary">Generate Certificates →</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Summary stats */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 6 }}>
            {[
              { label: 'Total Jobs', value: jobs.length, color: 'var(--text)' },
              { label: 'Completed', value: jobs.filter(j => j.status === 'completed').length, color: 'var(--success)' },
              { label: 'Processing', value: jobs.filter(j => j.status === 'processing').length, color: 'var(--accent2)' },
              { label: 'Total Certs', value: jobs.reduce((s, j) => s + (j.completed_records || 0), 0), color: 'var(--gold)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card" style={{ flex: 1, padding: '14px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: 'Cinzel, serif' }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {jobs.map(job => <JobCard key={job.id} job={job} />)}
        </div>
      )}
    </div>
  )
}
