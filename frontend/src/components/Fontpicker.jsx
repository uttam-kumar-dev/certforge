/**
 * FontPicker — Advanced font selector with:
 *  - Font name rendered in its own typeface (Canva-style)
 *  - Weight/variant sub-selection
 *  - Grouped: System fonts | Your Fonts
 *  - Live preview of typed text in selected font
 *  - Keyboard navigation
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, Search, Upload } from 'lucide-react'
import api from '../api/client'

const WEIGHT_LABELS = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light',
  400: 'Regular', 500: 'Medium', 600: 'SemiBold',
  700: 'Bold', 800: 'ExtraBold', 900: 'Black',
}

// Cache loaded blob URLs so we don't re-fetch on every render
const fontBlobCache = {} // fontId -> css font-family name

async function loadUserFontFace(fontId, weight = 400, isItalic = false) {
  const cacheKey = String(fontId)
  if (fontBlobCache[cacheKey]) return fontBlobCache[cacheKey]

  const cssName = `uf_${fontId}`
  const token   = localStorage.getItem('token')
  try {
    const resp = await fetch(`/api/user-fonts/${fontId}/file`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!resp.ok) return null
    const buf     = await resp.arrayBuffer()
    const blob    = new Blob([buf], { type: 'font/ttf' })
    const blobUrl = URL.createObjectURL(blob)
    const ff      = new FontFace(cssName, `url("${blobUrl}")`, {
      weight: String(weight),
      style:  isItalic ? 'italic' : 'normal',
    })
    const loaded = await ff.load()
    document.fonts.add(loaded)
    fontBlobCache[cacheKey] = cssName
    return cssName
  } catch {
    return null
  }
}

export default function FontPicker({ value, weight = 400, onChange, onWeightChange }) {
  const [open,          setOpen]          = useState(false)
  const [search,        setSearch]        = useState('')
  const [systemFonts,   setSystemFonts]   = useState([])
  const [userFamilies,  setUserFamilies]  = useState([])
  const [loadedFaces,   setLoadedFaces]   = useState({})
  const [weightOptions, setWeightOptions] = useState([]) // for selected font
  const [activeIdx,     setActiveIdx]     = useState(-1)

  const dropRef    = useRef()
  const searchRef  = useRef()
  const listRef    = useRef()

  // Load font lists
  useEffect(() => {
    api.get('/fonts/')
      .then(r => setSystemFonts(r.data.fonts || []))
      .catch(() => {})
    api.get('/user-fonts/')
      .then(r => {
        const fams = r.data.families || []
        setUserFamilies(fams)
        // Pre-load font faces for preview
        fams.forEach(fam =>
          fam.variants.forEach(v => {
            loadUserFontFace(v.id, v.weight, v.is_italic)
              .then(name => {
                if (name) setLoadedFaces(prev => ({ ...prev, [v.id]: name }))
              })
          })
        )
      })
      .catch(() => {})
  }, [])

  // When selected font changes, compute weight options
  useEffect(() => {
    const userFam = userFamilies.find(f => f.family_name === value)
    if (userFam) {
      const opts = userFam.variants
        .filter(v => !v.is_italic)
        .map(v => ({ weight: v.weight, label: WEIGHT_LABELS[v.weight] || String(v.weight), fontId: v.id }))
        .sort((a, b) => a.weight - b.weight)
      setWeightOptions(opts)
    } else {
      setWeightOptions([])
    }
  }, [value, userFamilies])

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Focus search when open
  useEffect(() => {
    if (open) { setTimeout(() => searchRef.current?.focus(), 50) }
    else { setSearch(''); setActiveIdx(-1) }
  }, [open])

  // Build flat option list for keyboard nav
  const allOptions = useCallback(() => {
    const q = search.toLowerCase()
    const sys = systemFonts.filter(f => f.toLowerCase().includes(q))
      .map(f => ({ type: 'system', label: f, key: f }))
    const usr = userFamilies
      .filter(f => f.family_name.toLowerCase().includes(q))
      .map(f => ({ type: 'user', label: f.family_name, key: f.family_name, variants: f.variants }))
    return { sys, usr, flat: [...usr, ...sys] }
  }, [search, systemFonts, userFamilies])

  const handleSelect = (fontName) => {
    onChange(fontName)
    // Auto-set weight to Regular (400) or first available
    const userFam = userFamilies.find(f => f.family_name === fontName)
    if (userFam && onWeightChange) {
      const regularVariant = userFam.variants.find(v => v.weight === 400 && !v.is_italic)
      const firstVariant   = userFam.variants.filter(v => !v.is_italic).sort((a, b) => a.weight - b.weight)[0]
      onWeightChange((regularVariant || firstVariant)?.weight || 400)
    }
    setOpen(false)
  }

  const onKeyDown = e => {
    const { flat } = allOptions()
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flat.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && activeIdx >= 0) { handleSelect(flat[activeIdx].label) }
    if (e.key === 'Escape') setOpen(false)
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.querySelector(`[data-idx="${activeIdx}"]`)
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx])

  // Get CSS font family for a user font family (use first non-italic variant's face)
  const getUserFontCSS = (famName) => {
    const fam = userFamilies.find(f => f.family_name === famName)
    if (!fam) return 'inherit'
    const v = fam.variants.find(v => !v.is_italic) || fam.variants[0]
    if (!v) return 'inherit'
    const loaded = loadedFaces[v.id]
    return loaded ? `${loaded}, sans-serif` : 'inherit'
  }

  // Display font family for current value in trigger button
  const triggerFontCSS = getUserFontCSS(value) !== 'inherit'
    ? getUserFontCSS(value)
    : value

  const { sys, usr, flat } = allOptions()

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px', background: 'var(--bg2)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8, cursor: 'pointer', gap: 8,
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{
          fontFamily: triggerFontCSS,
          fontWeight: weight,
          fontSize: 14,
          color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value || 'Select font…'}
        </span>
        <ChevronDown size={14} color="var(--text3)"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          zIndex: 999, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          maxHeight: 360,
        }}>
          {/* Search */}
          <div style={{
            padding: '10px 12px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Search size={13} color="var(--text3)" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setActiveIdx(-1) }}
              onKeyDown={onKeyDown}
              placeholder="Search fonts…"
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                fontSize: 13, color: 'var(--text)',
              }}
            />
          </div>

          {/* List */}
          <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>

            {/* User fonts group */}
            {usr.length > 0 && (
              <>
                <div style={{
                  padding: '6px 12px 4px', fontSize: 10, fontWeight: 700,
                  color: 'var(--accent2)', textTransform: 'uppercase', letterSpacing: 1,
                  background: 'rgba(139,92,246,0.06)',
                }}>
                  Your Fonts ({usr.length})
                </div>
                {usr.map((opt, i) => {
                  const globalIdx = i
                  const isActive  = activeIdx === globalIdx
                  const isCurrent = value === opt.label
                  const cssFam    = getUserFontCSS(opt.label)
                  return (
                    <div
                      key={opt.key}
                      data-idx={globalIdx}
                      onClick={() => handleSelect(opt.label)}
                      style={{
                        padding: '9px 14px',
                        cursor: 'pointer',
                        background: isActive ? 'rgba(139,92,246,0.15)' : isCurrent ? 'rgba(245,158,11,0.08)' : 'transparent',
                        borderLeft: isCurrent ? '3px solid #f59e0b' : '3px solid transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <span style={{
                        fontFamily: cssFam,
                        fontWeight: 400,
                        fontSize: 16,
                        color: isCurrent ? '#f59e0b' : 'var(--text)',
                      }}>
                        {opt.label}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 8 }}>
                        {opt.variants?.length} variant{opt.variants?.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )
                })}
              </>
            )}

            {/* System fonts group */}
            {sys.length > 0 && (
              <>
                <div style={{
                  padding: '6px 12px 4px', fontSize: 10, fontWeight: 700,
                  color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1,
                  background: 'var(--bg3)',
                }}>
                  System Fonts ({sys.length})
                </div>
                {sys.map((opt, i) => {
                  const globalIdx = usr.length + i
                  const isActive  = activeIdx === globalIdx
                  const isCurrent = value === opt.label
                  return (
                    <div
                      key={opt.key}
                      data-idx={globalIdx}
                      onClick={() => handleSelect(opt.label)}
                      style={{
                        padding: '9px 14px',
                        cursor: 'pointer',
                        background: isActive ? 'rgba(139,92,246,0.15)' : isCurrent ? 'rgba(245,158,11,0.08)' : 'transparent',
                        borderLeft: isCurrent ? '3px solid #f59e0b' : '3px solid transparent',
                      }}
                    >
                      <span style={{
                        fontFamily: `"${opt.label}", sans-serif`,
                        fontWeight: 400,
                        fontSize: 16,
                        color: isCurrent ? '#f59e0b' : 'var(--text)',
                      }}>
                        {opt.label}
                      </span>
                    </div>
                  )
                })}
              </>
            )}

            {flat.length === 0 && (
              <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                No fonts match "{search}"
              </div>
            )}
          </div>

          {/* Upload shortcut */}
          <div style={{
            padding: '8px 12px', borderTop: '1px solid var(--border)',
            background: 'var(--bg3)',
          }}>
            <a href="/fonts" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: 'var(--accent2)', textDecoration: 'none',
            }}>
              <Upload size={12} /> Upload a new font
            </a>
          </div>
        </div>
      )}

      {/* Weight selector — shown below picker if user font with multiple weights */}
      {weightOptions.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>Font Weight</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {weightOptions.map(wo => (
              <button
                key={wo.weight}
                type="button"
                onClick={() => onWeightChange?.(wo.weight)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  fontFamily: getUserFontCSS(value),
                  fontWeight: wo.weight,
                  border: `1px solid ${weight === wo.weight ? 'var(--accent)' : 'var(--border)'}`,
                  background: weight === wo.weight ? 'rgba(139,92,246,0.2)' : 'var(--bg2)',
                  color: weight === wo.weight ? 'var(--accent2)' : 'var(--text2)',
                  transition: 'all 0.1s',
                }}
              >
                {wo.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}