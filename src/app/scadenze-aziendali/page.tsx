'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

type Tipo = 'affitto' | 'polizza_veicolo' | 'polizza_aziendale' | 'permesso' | 'certificazione' | 'tassa' | 'rata' | 'altro'

const TIPI: { value: Tipo; label: string; icon: string; color: string }[] = [
  { value: 'affitto',           label: 'Affitto',           icon: '🏠', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'polizza_veicolo',   label: 'Polizza veicolo',   icon: '🚐', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { value: 'polizza_aziendale', label: 'Polizza aziendale', icon: '🛡️', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'permesso',          label: 'Permesso/Licenza',  icon: '📋', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'certificazione',    label: 'Certificazione',    icon: '🏆', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'tassa',             label: 'Tassa/Imposta',     icon: '💳', color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'rata',              label: 'Rata/Pagamento',    icon: '💰', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'altro',             label: 'Altro',             icon: '📌', color: 'bg-gray-100 text-gray-700 border-gray-300' },
]

const FREQ: { value: number; label: string }[] = [
  { value: 1,  label: 'Mensile' },
  { value: 3,  label: 'Trimestrale' },
  { value: 6,  label: 'Semestrale' },
  { value: 12, label: 'Annuale' },
]

function tipoInfo(tipo: string) {
  return TIPI.find(t => t.value === tipo) || TIPI[TIPI.length - 1]
}

function urgenza(scadenza: string): { cls: string; label: string; giorni: number } {
  const oggi = new Date(); oggi.setHours(0,0,0,0)
  const d = new Date(scadenza + 'T12:00:00'); d.setHours(0,0,0,0)
  const giorni = Math.ceil((d.getTime() - oggi.getTime()) / 86400000)
  if (giorni < 0)  return { cls: 'bg-red-600 text-white',     label: `Scaduta da ${Math.abs(giorni)}gg`, giorni }
  if (giorni === 0) return { cls: 'bg-red-500 text-white',    label: 'Scade oggi!', giorni }
  if (giorni <= 7)  return { cls: 'bg-red-500 text-white',    label: `⚠️ ${giorni}gg`, giorni }
  if (giorni <= 30) return { cls: 'bg-orange-500 text-white', label: `${giorni}gg`, giorni }
  if (giorni <= 90) return { cls: 'bg-yellow-400 text-gray-900', label: `${giorni}gg`, giorni }
  return { cls: 'bg-green-500 text-white', label: `${giorni}gg`, giorni }
}

function formatData(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatImporto(n: number | null) {
  if (!n) return null
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)
}

const formVuoto = {
  tipo: 'altro' as Tipo,
  descrizione: '',
  importo: '',
  scadenza: '',
  note: '',
  ricorrente: false,
  frequenza_mesi: 12,
}

export default function ScadenzeAziendaliPage() {
  const [scadenze, setScadenze] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<string>('tutti')
  const [filtroStato, setFiltroStato] = useState<'tutte' | 'in_scadenza' | 'scadute'>('tutte')
  const [mostraInattive, setMostraInattive] = useState(false)
  const [modal, setModal] = useState<'nuovo' | 'modifica' | null>(null)
  const [form, setForm] = useState(formVuoto)
  const [editing, setEditing] = useState<any | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const q = supabase.from('scadenze_aziendali').select('*').order('scadenza', { ascending: true })
    const { data } = await q
    setScadenze(data || [])
    setLoading(false)
  }

  function apriNuovo() {
    setForm({ ...formVuoto, scadenza: '' })
    setEditing(null)
    setModal('nuovo')
  }

  function apriModifica(s: any) {
    setForm({
      tipo: s.tipo,
      descrizione: s.descrizione,
      importo: s.importo ? String(s.importo) : '',
      scadenza: s.scadenza,
      note: s.note || '',
      ricorrente: !!s.ricorrente,
      frequenza_mesi: s.frequenza_mesi || 12,
    })
    setEditing(s)
    setModal('modifica')
  }

  async function salva() {
    if (!form.descrizione.trim()) { alert('Inserisci una descrizione'); return }
    if (!form.scadenza) { alert('Inserisci la data di scadenza'); return }
    setSalvando(true)
    const payload = {
      tipo: form.tipo,
      descrizione: form.descrizione.trim(),
      importo: form.importo ? parseFloat(form.importo.replace(',', '.')) : null,
      scadenza: form.scadenza,
      note: form.note.trim() || null,
      ricorrente: form.ricorrente,
      frequenza_mesi: form.ricorrente ? form.frequenza_mesi : null,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      const { error } = await supabase.from('scadenze_aziendali').update(payload).eq('id', editing.id)
      if (error) { alert('Errore: ' + error.message); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('scadenze_aziendali').insert({ ...payload, attiva: true })
      if (error) { alert('Errore: ' + error.message); setSalvando(false); return }
    }
    setSalvando(false)
    setModal(null)
    load()
  }

  async function rinnova(s: any) {
    if (!s.ricorrente || !s.frequenza_mesi) return
    const nuova = new Date(s.scadenza + 'T12:00:00')
    nuova.setMonth(nuova.getMonth() + s.frequenza_mesi)
    const nuovaData = nuova.toISOString().split('T')[0]
    if (!confirm(`Rinnovare "${s.descrizione}" al ${formatData(nuovaData)}?`)) return
    await supabase.from('scadenze_aziendali').update({ scadenza: nuovaData, updated_at: new Date().toISOString() }).eq('id', s.id)
    load()
  }

  async function toggleAttiva(s: any) {
    await supabase.from('scadenze_aziendali').update({ attiva: !s.attiva }).eq('id', s.id)
    load()
  }

  async function elimina(s: any) {
    if (!confirm(`Eliminare "${s.descrizione}"?`)) return
    await supabase.from('scadenze_aziendali').delete().eq('id', s.id)
    load()
  }

  // Filtri applicati
  const oggi = new Date(); oggi.setHours(0,0,0,0)
  const filtrate = scadenze.filter(s => {
    if (!mostraInattive && !s.attiva) return false
    if (filtroTipo !== 'tutti' && s.tipo !== filtroTipo) return false
    if (filtroStato === 'in_scadenza') {
      const g = Math.ceil((new Date(s.scadenza + 'T12:00:00').getTime() - oggi.getTime()) / 86400000)
      if (g > 30 || g < 0) return false
    }
    if (filtroStato === 'scadute') {
      const g = Math.ceil((new Date(s.scadenza + 'T12:00:00').getTime() - oggi.getTime()) / 86400000)
      if (g >= 0) return false
    }
    return true
  })

  // Conteggi per riepilogo
  const nScadute = scadenze.filter(s => s.attiva && Math.ceil((new Date(s.scadenza + 'T12:00:00').getTime() - oggi.getTime()) / 86400000) < 0).length
  const nEntro30 = scadenze.filter(s => s.attiva && (() => { const g = Math.ceil((new Date(s.scadenza + 'T12:00:00').getTime() - oggi.getTime()) / 86400000); return g >= 0 && g <= 30 })()).length
  const nEntro90 = scadenze.filter(s => s.attiva && (() => { const g = Math.ceil((new Date(s.scadenza + 'T12:00:00').getTime() - oggi.getTime()) / 86400000); return g > 30 && g <= 90 })()).length

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden" style={{ height: '100vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold">⏰ Scadenze aziendali</h1>
            <p className="text-xs text-gray-500 mt-0.5">Affitti, polizze, permessi e altri impegni ricorrenti</p>
          </div>
          <button className="btn btn-primary" onClick={apriNuovo}>+ Nuova scadenza</button>
        </div>

        {/* Riepilogo urgenze */}
        <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <button onClick={() => setFiltroStato('scadute')}
            className={`rounded-xl p-3 border-2 text-center transition-all ${filtroStato === 'scadute' ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white hover:border-red-300'}`}>
            <p className="text-2xl font-black text-red-600">{nScadute}</p>
            <p className="text-xs text-red-700 font-medium">Scadute</p>
          </button>
          <button onClick={() => setFiltroStato(filtroStato === 'in_scadenza' ? 'tutte' : 'in_scadenza')}
            className={`rounded-xl p-3 border-2 text-center transition-all ${filtroStato === 'in_scadenza' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300'}`}>
            <p className="text-2xl font-black text-orange-500">{nEntro30}</p>
            <p className="text-xs text-orange-700 font-medium">Entro 30 giorni</p>
          </button>
          <div className="rounded-xl p-3 border-2 border-gray-200 bg-white text-center">
            <p className="text-2xl font-black text-yellow-500">{nEntro90}</p>
            <p className="text-xs text-yellow-700 font-medium">Entro 90 giorni</p>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* Filtri laterali */}
          <div className="w-48 flex-shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipo</p>
            <button onClick={() => setFiltroTipo('tutti')}
              className={`w-full text-left text-xs px-2 py-1.5 rounded-lg mb-0.5 font-medium transition-colors ${filtroTipo === 'tutti' ? 'bg-gray-800 text-white' : 'hover:bg-gray-200 text-gray-700'}`}>
              Tutti
            </button>
            {TIPI.map(t => (
              <button key={t.value} onClick={() => setFiltroTipo(t.value)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded-lg mb-0.5 transition-colors ${filtroTipo === t.value ? 'bg-gray-800 text-white' : 'hover:bg-gray-200 text-gray-700'}`}>
                {t.icon} {t.label}
              </button>
            ))}
            <div className="mt-4 border-t border-gray-200 pt-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
                <input type="checkbox" checked={mostraInattive} onChange={e => setMostraInattive(e.target.checked)} />
                Mostra archiviate
              </label>
            </div>
            <button onClick={() => setFiltroStato('tutte')}
              className="mt-2 w-full text-xs text-gray-400 hover:text-gray-600 text-left px-1">
              Rimuovi filtri stato
            </button>
          </div>

          {/* Lista scadenze */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading && <p className="text-gray-400 text-sm text-center py-12">Caricamento...</p>}
            {!loading && filtrate.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <p className="text-4xl mb-2">⏰</p>
                <p className="text-sm">Nessuna scadenza trovata</p>
                <button className="mt-3 text-sm text-blue-600 hover:underline" onClick={apriNuovo}>+ Aggiungi la prima</button>
              </div>
            )}
            {filtrate.map(s => {
              const t = tipoInfo(s.tipo)
              const u = urgenza(s.scadenza)
              return (
                <div key={s.id} className={`bg-white rounded-xl border border-gray-200 p-4 flex gap-4 items-start shadow-sm transition-opacity ${!s.attiva ? 'opacity-50' : ''}`}>
                  {/* Icona tipo */}
                  <div className="flex-shrink-0 text-2xl pt-0.5">{t.icon}</div>

                  {/* Contenuto */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 truncate">{s.descrizione}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${t.color}`}>{t.label}</span>
                          {s.ricorrente && (
                            <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                              🔄 {FREQ.find(f => f.value === s.frequenza_mesi)?.label || `ogni ${s.frequenza_mesi}m`}
                            </span>
                          )}
                          {!s.attiva && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Archiviata</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-sm text-gray-600">📅 {formatData(s.scadenza)}</span>
                          {s.importo && <span className="text-sm font-medium text-gray-800">💶 {formatImporto(s.importo)}</span>}
                        </div>
                        {s.note && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.note}</p>}
                      </div>

                      {/* Badge urgenza */}
                      <div className={`flex-shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-xl text-center ${u.cls}`} style={{ minWidth: 70 }}>
                        {u.label}
                      </div>
                    </div>
                  </div>

                  {/* Azioni */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => apriModifica(s)} className="btn btn-sm text-xs py-1">✏️</button>
                    {s.ricorrente && s.attiva && (
                      <button onClick={() => rinnova(s)} className="btn btn-sm text-xs py-1 bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" title="Rinnova data">🔄</button>
                    )}
                    <button onClick={() => toggleAttiva(s)} className="btn btn-sm text-xs py-1" title={s.attiva ? 'Archivia' : 'Riattiva'}>
                      {s.attiva ? '📦' : '♻️'}
                    </button>
                    <button onClick={() => elimina(s)} className="btn btn-sm text-xs py-1 text-red-500 hover:bg-red-50 border-red-200" title="Elimina">🗑️</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* Modal nuovo / modifica */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-base">{modal === 'nuovo' ? '+ Nuova scadenza' : '✏️ Modifica scadenza'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">

              {/* Tipo */}
              <div>
                <label className="label">Tipo</label>
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  {TIPI.map(t => (
                    <button key={t.value} onClick={() => setForm({ ...form, tipo: t.value as Tipo })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${form.tipo === t.value ? 'border-blue-600 bg-blue-50 text-blue-800 font-medium' : 'border-gray-200 hover:border-gray-400 text-gray-700'}`}>
                      <span>{t.icon}</span> {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descrizione */}
              <div>
                <label className="label">Descrizione *</label>
                <input className="input" placeholder="es. Affitto sede via Roma 14, Polizza RC Azienda..." value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Scadenza */}
                <div>
                  <label className="label">Data scadenza *</label>
                  <input type="date" className="input" value={form.scadenza} onChange={e => setForm({ ...form, scadenza: e.target.value })} />
                </div>
                {/* Importo */}
                <div>
                  <label className="label">Importo (€)</label>
                  <input className="input" placeholder="es. 1200,00" value={form.importo} onChange={e => setForm({ ...form, importo: e.target.value })} />
                </div>
              </div>

              {/* Ricorrente */}
              <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4" checked={form.ricorrente} onChange={e => setForm({ ...form, ricorrente: e.target.checked })} />
                  <span className="text-sm font-medium text-indigo-800">🔄 Scadenza ricorrente</span>
                </label>
                {form.ricorrente && (
                  <div className="mt-2">
                    <label className="label text-xs">Frequenza</label>
                    <div className="flex gap-2 flex-wrap mt-1">
                      {FREQ.map(f => (
                        <button key={f.value} onClick={() => setForm({ ...form, frequenza_mesi: f.value })}
                          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${form.frequenza_mesi === f.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'}`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Note */}
              <div>
                <label className="label">Note</label>
                <textarea className="input h-16 resize-none" placeholder="Riferimento contratto, contatti, istruzioni..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button className="btn" onClick={() => setModal(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={salvando}>
                {salvando ? 'Salvataggio...' : modal === 'nuovo' ? 'Aggiungi' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
