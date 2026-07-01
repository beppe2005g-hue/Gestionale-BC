'use client'
import { useState, useRef, useEffect } from 'react'

export interface SelectOption {
  value: string
  label: string
  sublabel?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  /** Se passata, mostra un bottone "+ Crea nuovo" in fondo alla lista */
  onCreateNew?: (query: string) => void
  createNewLabel?: string
  className?: string
}

export default function SearchableSelect({
  value, onChange, options, placeholder = '— seleziona —',
  disabled, onCreateNew, createNewLabel = 'Crea nuovo', className = ''
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)

  const filtered = options.filter(o => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q)
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen() {
    if (disabled) return
    setOpen(true); setQuery('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleSelect(val: string) {
    onChange(val); setOpen(false); setQuery('')
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <div
        onClick={handleOpen}
        className={`input flex items-center justify-between gap-2 cursor-pointer select-none
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:border-blue-400 focus-within:border-blue-500'}`}>
        <span className={`truncate text-sm ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="text-gray-300 text-xs flex-shrink-0">{open ? '▲' : '▼'}</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[999] mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
          style={{ maxHeight: 300 }}>
          {/* Search input */}
          <div className="p-2 border-b border-gray-100 bg-gray-50">
            <input
              ref={inputRef}
              type="text"
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white"
              placeholder="🔍 Cerca..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Escape') { setOpen(false); setQuery('') }
                if (e.key === 'Enter' && filtered.length === 1) handleSelect(filtered[0].value)
              }}
            />
          </div>

          {/* Options list */}
          <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
            {/* Opzione vuota */}
            <div
              className={`px-3 py-2 text-sm cursor-pointer text-gray-400 hover:bg-gray-50 transition-colors
                ${!value ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}
              onClick={() => handleSelect('')}>
              {placeholder}
            </div>

            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">
                Nessun risultato per "{query}"
              </div>
            ) : filtered.map(o => (
              <div key={o.value}
                className={`px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors
                  ${value === o.value ? 'bg-blue-50' : ''}`}
                onClick={() => handleSelect(o.value)}>
                <p className={`text-sm ${value === o.value ? 'font-semibold text-blue-700' : 'text-gray-900'}`}>
                  {o.label}
                </p>
                {o.sublabel && <p className="text-xs text-gray-400 mt-0.5">{o.sublabel}</p>}
              </div>
            ))}
          </div>

          {/* Crea nuovo */}
          {onCreateNew && (
            <div className="border-t border-gray-100 p-2 bg-gray-50">
              <button
                type="button"
                className="w-full text-left text-xs text-blue-600 font-semibold hover:bg-blue-50 rounded-lg px-3 py-2 transition-colors"
                onClick={e => { e.stopPropagation(); onCreateNew(query); setOpen(false); setQuery('') }}>
                + {createNewLabel}{query.trim() ? ` "${query.trim()}"` : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
