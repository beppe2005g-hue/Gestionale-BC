'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'bonarrigogiuseppe05@gmail.com'

const SEZIONI = [
  { key: 'perm_dashboard',               label: 'Dashboard',           icon: '▦' },
  { key: 'perm_progetti',                label: 'Progetti',             icon: '🏗' },
  { key: 'perm_costi_cantiere',          label: 'Costi Cantiere',       icon: '💰' },
  { key: 'perm_ddt',                     label: 'DDT',                  icon: '📋' },
  { key: 'perm_da_ricevere',             label: 'Da Ricevere',          icon: '⏳' },
  { key: 'perm_fatture_fornitori',       label: 'Fatt. Fornitori',      icon: '📄' },
  { key: 'perm_fatture_clienti',         label: 'Fatt. Clienti',        icon: '🧾' },
  { key: 'perm_import_sdi',             label: 'Import SDI',           icon: '📥' },
  { key: 'perm_scadenzario',             label: 'Scadenzario',          icon: '📅' },
  { key: 'perm_cashflow',               label: 'Cash Flow',            icon: '📈' },
  { key: 'perm_budget',                  label: 'Budget',               icon: '⚖' },
  { key: 'perm_anagrafiche',             label: 'Anagrafiche',          icon: '👥' },
  { key: 'perm_dipendenti',              label: 'Dipendenti',           icon: '👷' },
  { key: 'perm_utenti',                  label: 'Utenti',               icon: '🔒' },
  { key: 'perm_solo_cantieri_assegnati', label: '🔒 Solo cant. assegnati', icon: '' },
]

const PRESETS: Record<string, Record<string, boolean>> = {
  nessuno: {
    perm_dashboard: false, perm_progetti: false, perm_costi_cantiere: false,
    perm_ddt: false, perm_da_ricevere: false, perm_fatture_fornitori: false,
    perm_fatture_clienti: false, perm_import_sdi: false, perm_scadenzario: false,
    perm_cashflow: false, perm_budget: false, perm_anagrafiche: false,
    perm_dipendenti: false, perm_utenti: false, perm_solo_cantieri_assegnati: false,
  },
  geometra: {
    perm_dashboard: false, perm_progetti: true, perm_costi_cantiere: true,
    perm_ddt: true, perm_da_ricevere: false, perm_fatture_fornitori: false,
    perm_fatture_clienti: false, perm_import_sdi: false, perm_scadenzario: false,
    perm_cashflow: false, perm_budget: false, perm_anagrafiche: true,
    perm_dipendenti: true, perm_utenti: false, perm_solo_cantieri_assegnati: true,
  },
  capo_geometra: {
    perm_dashboard: true, perm_progetti: true, perm_costi_cantiere: true,
    perm_ddt: true, perm_da_ricevere: true, perm_fatture_fornitori: false,
    perm_fatture_clienti: false, perm_import_sdi: false, perm_scadenzario: true,
    perm_cashflow: false, perm_budget: true, perm_anagrafiche: true,
    perm_dipendenti: true, perm_utenti: false, perm_solo_cantieri_assegnati: false,
  },
  admin: {
    perm_dashboard: true, perm_progetti: true, perm_costi_cantiere: true,
    perm_ddt: true, perm_da_ricevere: true, perm_fatture_fornitori: true,
    perm_fatture_clienti: true, perm_import_sdi: true, perm_scadenzario: true,
    perm_cashflow: true, perm_budget: true, perm_anagrafiche: true,
    perm_dipendenti: true, perm_utenti: true, perm_solo_cantieri_assegnati: false,
  },
}

type Utente = {
  id: string
  nome: string
  ruolo: string
  [key: string]: any
}

export default function Utenti() {
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [utenti, setUtenti] = useState<Utente[]>([])
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const isAdmin = currentUserEmail === ADMIN_EMAIL

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserEmail(data.user?.email ?? null)
    })
    loadUtenti()
  }, [])

  async function loadUtenti() {
    setLoading(true)
    const { data, error } = await supabase
      .from('utenti')
      .select('*')
      .order('nome')
    if (error) showToast('Errore caricamento: ' + error.message, 'err')
    setUtenti(data || [])
    setLoading(false)
  }

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function togglePermesso(utenteId: string, key: string, currentVal: boolean) {
    if (!isAdmin) return
    const newVal = !currentVal

    // Ottimistic update
    setUtenti(prev => prev.map(u => u.id === utenteId ? { ...u, [key]: newVal } : u))
    setSaving(prev => ({ ...prev, [utenteId]: true }))

    const { error } = await supabase
      .from('utenti')
      .update({ [key]: newVal })
      .eq('id', utenteId)

    setSaving(prev => ({ ...prev, [utenteId]: false }))

    if (error) {
      showToast('Errore: ' + error.message, 'err')
      // Rollback
      setUtenti(prev => prev.map(u => u.id === utenteId ? { ...u, [key]: currentVal } : u))
    } else {
      showToast('Permesso aggiornato', 'ok')
    }
  }

  async function applicaPreset(utenteId: string, preset: keyof typeof PRESETS) {
    if (!isAdmin) return
    const nuoviPermessi = PRESETS[preset]

    setUtenti(prev => prev.map(u => u.id === utenteId ? { ...u, ...nuoviPermessi } : u))
    setSaving(prev => ({ ...prev, [utenteId]: true }))

    const { error } = await supabase
      .from('utenti')
      .update(nuoviPermessi)
      .eq('id', utenteId)

    setSaving(prev => ({ ...prev, [utenteId]: false }))

    if (error) {
      showToast('Errore: ' + error.message, 'err')
      loadUtenti()
    } else {
      showToast(`Preset "${preset}" applicato`, 'ok')
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.msg}
          </div>
        )}

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Utenti e permessi</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin ? 'Sei loggato come amministratore — puoi modificare tutti i permessi.' : 'Solo l\'amministratore può modificare i permessi.'}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
          <strong>Come aggiungere un utente:</strong> vai su{' '}
          <strong>supabase.com → Authentication → Users → Add user</strong>.
          Poi esegui nel SQL Editor:{' '}
          <code className="bg-blue-100 px-1 rounded">INSERT INTO utenti (id, nome, ruolo) VALUES ('UUID', 'Nome', 'geometra');</code>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Caricamento utenti...</div>
        ) : utenti.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Nessun utente trovato nella tabella <code>utenti</code>.</div>
        ) : (
          <div className="space-y-5">
            {utenti.map(u => {
              const isSelf = currentUserEmail === ADMIN_EMAIL && u.ruolo === 'admin'
              const isSaving = saving[u.id]

              return (
                <div key={u.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isSelf ? 'border-blue-300' : 'border-gray-200'}`}>
                  {/* Header */}
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

                    {/* Preset */}
                    {isAdmin && !isSelf && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">Preset:</span>
                        {(['nessuno', 'geometra', 'capo_geometra', 'admin'] as const).map(p => (
                          <button
                            key={p}
                            onClick={() => applicaPreset(u.id, p)}
                            className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 transition">
                            {p === 'nessuno' ? '🚫 Nessuno' : p === 'geometra' ? '📐 Geometra' : p === 'capo_geometra' ? '🏗️ Capo Geom.' : '🔑 Admin'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Permessi */}
                  <div className="p-5">
                    {isSelf ? (
                      <p className="text-sm text-blue-700 font-medium">✓ Accesso completo a tutto — account host</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {SEZIONI.map(s => {
                          const active = !!u[s.key]
                          const isSpecial = s.key === 'perm_solo_cantieri_assegnati'
                          return (
                            <button
                              key={s.key}
                              onClick={() => togglePermesso(u.id, s.key, active)}
                              disabled={!isAdmin}
                              className={`text-xs px-3 py-2 rounded-lg border text-left transition-all duration-150
                                ${isSpecial
                                  ? active ? 'bg-orange-50 border-orange-400 text-orange-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-400'
                                  : active ? 'bg-green-50 border-green-400 text-green-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-400'
                                } ${isAdmin ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}`}>
                              <span className="mr-1">{active ? '✓' : '×'}</span>
                              {s.label}
                            </button>
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
      </main>
    </div>
  )
}
