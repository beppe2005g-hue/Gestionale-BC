'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'bonarrigogiuseppe05@gmail.com'

const SEZIONI = [
  { key: 'perm_dashboard',               label: 'Dashboard',              icon: '▦',  section: 'Principale' },
  { key: 'perm_progetti',                label: 'Progetti',               icon: '🏗', section: 'Principale' },
  { key: 'perm_archivia_progetti',       label: 'Archivia Cantieri',      icon: '📦', section: 'Principale' },
  { key: 'perm_costi_cantiere',          label: 'Costi Cantiere',         icon: '💰', section: 'Principale' },
  { key: 'perm_programmi',               label: 'Programmi',              icon: '📋', section: 'Principale' },
  { key: 'perm_ddt',                     label: 'DDT / Bolle',            icon: '📋', section: 'Ciclo Passivo' },
  { key: 'perm_import_ddt',             label: 'Import DDT con AI',      icon: '🤖', section: 'Ciclo Passivo' },
  { key: 'perm_da_ricevere',             label: 'Da Ricevere',            icon: '⏳', section: 'Ciclo Passivo' },
  { key: 'perm_fatture_fornitori',       label: 'Fatt. Fornitori',        icon: '📄', section: 'Ciclo Passivo' },
  { key: 'perm_import_sdi',             label: 'Import SDI',             icon: '📥', section: 'Ciclo Passivo' },
  { key: 'perm_prezzario',              label: 'Prezzario',              icon: '💹', section: 'Ciclo Passivo' },
  { key: 'perm_fatture_clienti',         label: 'Fatt. Clienti',          icon: '🧾', section: 'Ciclo Attivo' },
  { key: 'perm_fatture_da_emettere',    label: 'Fatture da Emettere',    icon: '🔔', section: 'Ciclo Attivo' },
  { key: 'perm_scadenzario',             label: 'Scadenzario',            icon: '📅', section: 'Controllo' },
  { key: 'perm_cashflow',               label: 'Cash Flow',              icon: '📈', section: 'Controllo' },
  { key: 'perm_budget',                  label: 'Budget vs Consuntivo',   icon: '⚖', section: 'Controllo' },
  { key: 'perm_anagrafiche',             label: 'Anagrafiche',            icon: '👥', section: 'Impostazioni' },
  { key: 'perm_dipendenti',              label: 'Dipendenti',             icon: '👷', section: 'Impostazioni' },
  { key: 'perm_utenti',                  label: 'Utenti e Permessi',      icon: '🔒', section: 'Impostazioni' },
  { key: 'perm_solo_cantieri_assegnati', label: '🔒 Solo cant. assegnati', icon: '', section: 'Speciale' },
]

const TUTTI_I_PERMESSI_FALSE: Record<string, boolean> = {
  perm_dashboard: false, perm_progetti: false, perm_archivia_progetti: false,
  perm_costi_cantiere: false, perm_programmi: false,
  perm_ddt: false, perm_import_ddt: false, perm_da_ricevere: false,
  perm_fatture_fornitori: false, perm_import_sdi: false, perm_prezzario: false,
  perm_fatture_clienti: false, perm_fatture_da_emettere: false,
  perm_scadenzario: false, perm_cashflow: false, perm_budget: false,
  perm_anagrafiche: false, perm_dipendenti: false, perm_utenti: false,
  perm_solo_cantieri_assegnati: false,
}

const PRESETS: Record<string, Record<string, boolean>> = {
  nessuno: { ...TUTTI_I_PERMESSI_FALSE },
  geometra: {
    ...TUTTI_I_PERMESSI_FALSE,
    perm_progetti: true, perm_costi_cantiere: true, perm_programmi: true,
    perm_ddt: true, perm_import_ddt: true, perm_prezzario: true,
    perm_anagrafiche: true, perm_dipendenti: true,
    perm_solo_cantieri_assegnati: true,
  },
  capo_geometra: {
    ...TUTTI_I_PERMESSI_FALSE,
    perm_dashboard: true, perm_progetti: true, perm_archivia_progetti: true,
    perm_costi_cantiere: true, perm_programmi: true,
    perm_ddt: true, perm_import_ddt: true, perm_da_ricevere: true, perm_prezzario: true,
    perm_fatture_da_emettere: true, perm_scadenzario: true, perm_budget: true,
    perm_anagrafiche: true, perm_dipendenti: true,
  },
  admin: {
    ...TUTTI_I_PERMESSI_FALSE,
    perm_dashboard: true, perm_progetti: true, perm_archivia_progetti: true,
    perm_costi_cantiere: true, perm_programmi: true,
    perm_ddt: true, perm_import_ddt: true, perm_da_ricevere: true,
    perm_fatture_fornitori: true, perm_import_sdi: true, perm_prezzario: true,
    perm_fatture_clienti: true, perm_fatture_da_emettere: true,
    perm_scadenzario: true, perm_cashflow: true, perm_budget: true,
    perm_anagrafiche: true, perm_dipendenti: true, perm_utenti: true,
  },
}

const TABELLA_LABEL: Record<string, string> = {
  fatture_fornitori: '📄 Fatt. Ricevute', fatture_clienti: '🧾 Fatt. Emesse',
  ddt: '📋 DDT', progetti: '🏗 Cantieri', costi_cantiere: '💰 Costi Cantiere',
  dipendenti: '👷 Dipendenti', clienti: '👥 Clienti', fornitori: '👥 Fornitori',
}

const AZIONE_BADGE: Record<string, { label: string, cls: string }> = {
  inserimento: { label: '+ Inserito', cls: 'bg-green-100 text-green-700' },
  modifica: { label: '✏️ Modificato', cls: 'bg-blue-100 text-blue-700' },
  eliminazione: { label: '✕ Eliminato', cls: 'bg-red-100 text-red-700' },
}

type Utente = { id: string; nome: string; ruolo: string; [key: string]: any }
type LogRow = { id: string; created_at: string; utente_nome: string; azione: string; tabella: string; descrizione: string }

export default function Utenti() {
  const [tab, setTab] = useState<'permessi' | 'log'>('permessi')
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [utenti, setUtenti] = useState<Utente[]>([])
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loadingLog, setLoadingLog] = useState(false)
  const [filtroUtente, setFiltroUtente] = useState('')
  const [filtroAzione, setFiltroAzione] = useState('')
  const [filtroTabella, setFiltroTabella] = useState('')

  const isAdmin = currentUserEmail === ADMIN_EMAIL

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserEmail(data.user?.email ?? null))
    loadUtenti()
  }, [])

  useEffect(() => { if (tab === 'log') loadLog() }, [tab])

  async function loadUtenti() {
    setLoading(true)
    const { data, error } = await supabase.from('utenti').select('*').order('nome')
    if (error) showToast('Errore caricamento: ' + error.message, 'err')
    setUtenti(data || [])
    setLoading(false)
  }

  async function loadLog() {
    setLoadingLog(true)
    const { data } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(500)
    setLogs(data || [])
    setLoadingLog(false)
  }

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function togglePermesso(utenteId: string, key: string, currentVal: boolean) {
    if (!isAdmin) return
    const newVal = !currentVal
    setUtenti(prev => prev.map(u => u.id === utenteId ? { ...u, [key]: newVal } : u))
    setSaving(prev => ({ ...prev, [utenteId]: true }))
    const { error } = await supabase.from('utenti').update({ [key]: newVal }).eq('id', utenteId)
    setSaving(prev => ({ ...prev, [utenteId]: false }))
    if (error) {
      showToast('Errore: ' + error.message, 'err')
      setUtenti(prev => prev.map(u => u.id === utenteId ? { ...u, [key]: currentVal } : u))
    } else showToast('Permesso aggiornato', 'ok')
  }

  async function applicaPreset(utenteId: string, preset: keyof typeof PRESETS) {
    if (!isAdmin) return
    const nuoviPermessi = PRESETS[preset]
    setUtenti(prev => prev.map(u => u.id === utenteId ? { ...u, ...nuoviPermessi } : u))
    setSaving(prev => ({ ...prev, [utenteId]: true }))
    const { error } = await supabase.from('utenti').update(nuoviPermessi).eq('id', utenteId)
    setSaving(prev => ({ ...prev, [utenteId]: false }))
    if (error) { showToast('Errore: ' + error.message, 'err'); loadUtenti() }
    else showToast(`Preset "${preset}" applicato`, 'ok')
  }

  const logsFiltrati = logs.filter(l => {
    if (filtroUtente && !l.utente_nome?.toLowerCase().includes(filtroUtente.toLowerCase())) return false
    if (filtroAzione && l.azione !== filtroAzione) return false
    if (filtroTabella && l.tabella !== filtroTabella) return false
    return true
  })

  const nomiUtenti = [...new Set(logs.map(l => l.utente_nome).filter(Boolean))].sort()

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.msg}
          </div>
        )}
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Utenti e permessi</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin ? 'Sei loggato come amministratore — puoi modificare tutti i permessi.' : 'Solo l\'amministratore può modificare i permessi.'}
          </p>
        </div>
        <div className="flex gap-1 mb-5 border-b border-gray-200">
          <button onClick={() => setTab('permessi')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'permessi' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            🔒 Permessi utenti
          </button>
          <button onClick={() => setTab('log')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'log' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            📋 Log attività
          </button>
        </div>

        {tab === 'permessi' && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
              <strong>Come aggiungere un utente:</strong> vai su <strong>supabase.com → Authentication → Users → Add user</strong>.
              Poi esegui nel SQL Editor: <code className="bg-blue-100 px-1 rounded">INSERT INTO utenti (id, nome, ruolo) VALUES ('UUID', 'Nome', 'geometra');</code>
            </div>
            {loading ? (
              <div className="text-center py-12 text-gray-400">Caricamento utenti...</div>
            ) : utenti.length === 0 ? (
              <div className="text-center py-12 text-gray-400">Nessun utente trovato.</div>
            ) : (
              <div className="space-y-5">
                {utenti.map(u => {
                  const isSelf = currentUserEmail === ADMIN_EMAIL && u.ruolo === 'admin'
                  const isSaving = saving[u.id]
                  return (
                    <div key={u.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isSelf ? 'border-blue-300' : 'border-gray-200'}`}>
                      <div className={`px-5 py-4 flex items-center justify-between flex-wrap gap-3 ${isSelf ? 'bg-blue-50' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white ${isSelf ? 'bg-blue-600' : 'bg-gray-500'}`}>
                            {u.nome?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{u.nome || '—'}</div>
                            <div className="text-xs text-gray-500 capitalize">{u.ruolo || '—'}</div>
                          </div>
                          {isSelf && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">HOST / ADMIN</span>}
                          {isSaving && <span className="text-xs text-gray-400 animate-pulse ml-2">Salvataggio...</span>}
                        </div>
                        {isAdmin && !isSelf && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-400">Preset:</span>
                            {(['nessuno', 'geometra', 'capo_geometra', 'admin'] as const).map(p => (
                              <button key={p} onClick={() => applicaPreset(u.id, p)}
                                className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 transition">
                                {p === 'nessuno' ? '🚫 Nessuno' : p === 'geometra' ? '📐 Geometra' : p === 'capo_geometra' ? '🏗️ Capo Geom.' : '🔑 Admin'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="p-5">
                        {isSelf ? (
                          <p className="text-sm text-blue-700 font-medium">✓ Accesso completo a tutto — account host</p>
                        ) : (
                          <div className="space-y-3">
                            {['Principale', 'Ciclo Passivo', 'Ciclo Attivo', 'Controllo', 'Impostazioni', 'Speciale'].map(sez => {
                              const voci = SEZIONI.filter(s => s.section === sez)
                              return (
                                <div key={sez}>
                                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{sez}</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {voci.map(s => {
                                      const active = !!u[s.key]
                                      const isSpecial = s.key === 'perm_solo_cantieri_assegnati'
                                      const isArchivia = s.key === 'perm_archivia_progetti'
                                      const isProgr = s.key === 'perm_programmi'
                                      return (
                                        <button key={s.key}
                                          onClick={() => togglePermesso(u.id, s.key, active)}
                                          disabled={!isAdmin}
                                          className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-150
                                            ${isSpecial
                                              ? active ? 'bg-orange-50 border-orange-400 text-orange-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-400'
                                              : isArchivia
                                                ? active ? 'bg-amber-50 border-amber-400 text-amber-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-400'
                                                : isProgr
                                                  ? active ? 'bg-purple-50 border-purple-400 text-purple-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-400'
                                                  : active ? 'bg-green-50 border-green-400 text-green-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-400'
                                            } ${isAdmin ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}`}>
                                          <span className="mr-1">{active ? '✓' : '×'}</span>
                                          {s.icon && <span className="mr-1">{s.icon}</span>}
                                          {s.label}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {tab === 'log' && (
          <>
            <div className="card mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="label">Utente</label>
                  <select className="input" value={filtroUtente} onChange={e => setFiltroUtente(e.target.value)}>
                    <option value="">Tutti gli utenti</option>
                    {nomiUtenti.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Azione</label>
                  <select className="input" value={filtroAzione} onChange={e => setFiltroAzione(e.target.value)}>
                    <option value="">Tutte le azioni</option>
                    <option value="inserimento">Inserimento</option>
                    <option value="modifica">Modifica</option>
                    <option value="eliminazione">Eliminazione</option>
                  </select>
                </div>
                <div>
                  <label className="label">Sezione</label>
                  <select className="input" value={filtroTabella} onChange={e => setFiltroTabella(e.target.value)}>
                    <option value="">Tutte le sezioni</option>
                    {Object.entries(TABELLA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <button className="btn btn-sm" onClick={loadLog}>↻ Aggiorna</button>
                  {(filtroUtente || filtroAzione || filtroTabella) && (
                    <button className="btn btn-sm" onClick={() => { setFiltroUtente(''); setFiltroAzione(''); setFiltroTabella('') }}>× Reset</button>
                  )}
                </div>
              </div>
              {(filtroUtente || filtroAzione || filtroTabella) && (
                <p className="text-xs text-gray-500 mt-2">{logsFiltrati.length} eventi su {logs.length}</p>
              )}
            </div>
            {loadingLog ? (
              <div className="text-center py-12 text-gray-400">Caricamento log...</div>
            ) : logsFiltrati.length === 0 ? (
              <div className="card text-center py-12 text-gray-400">
                {logs.length === 0 ? 'Nessuna attività registrata ancora.' : 'Nessun evento con questi filtri.'}
              </div>
            ) : (
              <div className="card overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>Data e ora</th><th>Utente</th><th>Azione</th><th>Sezione</th><th>Dettaglio</th></tr></thead>
                  <tbody>
                    {logsFiltrati.map(l => {
                      const badge = AZIONE_BADGE[l.azione] || { label: l.azione, cls: 'bg-gray-100 text-gray-600' }
                      return (
                        <tr key={l.id}>
                          <td className="text-xs text-gray-500 whitespace-nowrap">
                            {new Date(l.created_at).toLocaleDateString('it-IT')}
                            {' '}<span className="text-gray-400">{new Date(l.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          <td className="text-sm font-medium">{l.utente_nome || '—'}</td>
                          <td><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span></td>
                          <td className="text-xs text-gray-600">{TABELLA_LABEL[l.tabella] || l.tabella}</td>
                          <td className="text-xs text-gray-700 max-w-xs truncate" title={l.descrizione}>{l.descrizione}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
