'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

const SEZIONI = [
  { key: 'dashboard',          label: 'Dashboard' },
  { key: 'progetti',           label: 'Progetti' },
  { key: 'costi_cantiere',     label: 'Costi Cantiere' },
  { key: 'ddt',                label: 'DDT' },
  { key: 'da_ricevere',        label: 'Da Ricevere' },
  { key: 'fatture_fornitori',  label: 'Fatt. Fornitori' },
  { key: 'fatture_clienti',    label: 'Fatt. Clienti' },
  { key: 'import_sdi',         label: 'Import SDI' },
  { key: 'scadenzario',        label: 'Scadenzario' },
  { key: 'cashflow',           label: 'Cash Flow' },
  { key: 'budget',             label: 'Budget' },
  { key: 'anagrafiche',        label: 'Anagrafiche' },
  { key: 'dipendenti',         label: 'Dipendenti' },
  { key: 'utenti',             label: 'Utenti' },
  { key: 'solo_cantieri_assegnati', label: '🔒 Solo cantieri assegnati' },
]

const ADMIN_EMAIL = 'bonarrigogiuseppe05@gmail.com'

type Permessi = Record<string, boolean>
type UtenteRow = {
  id: string
  email: string
  nome?: string
  ruolo?: string
}

export default function Utenti() {
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [utenti, setUtenti] = useState<UtenteRow[]>([])
  const [permessi, setPermessi] = useState<Record<string, Permessi>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const isAdmin = currentUserEmail === ADMIN_EMAIL

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserEmail(data.user?.email ?? null)
    })
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    // Carica utenti dalla tabella utenti
    const { data: utentiData } = await supabase
      .from('utenti')
      .select('id, email, nome, ruolo')
      .order('email')

    // Carica permessi
    const { data: permData } = await supabase
      .from('permessi_utenti')
      .select('*')

    const permMap: Record<string, Permessi> = {}
    for (const p of permData ?? []) {
      const { utente_id, ...rest } = p
      permMap[utente_id] = rest
    }

    setUtenti(utentiData ?? [])
    setPermessi(permMap)
    setLoading(false)
  }

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function togglePermesso(utenteId: string, key: string) {
    if (!isAdmin) return

    const current = permessi[utenteId] ?? {}
    const newVal = !current[key]

    // Ottimistic update
    setPermessi(prev => ({
      ...prev,
      [utenteId]: { ...prev[utenteId], [key]: newVal }
    }))

    setSaving(prev => ({ ...prev, [utenteId]: true }))

    // Upsert su Supabase
    const row: Record<string, unknown> = { utente_id: utenteId, [key]: newVal }
    const { error } = await supabase
      .from('permessi_utenti')
      .upsert(row, { onConflict: 'utente_id' })

    setSaving(prev => ({ ...prev, [utenteId]: false }))

    if (error) {
      showToast('Errore salvataggio: ' + error.message, 'err')
      // Rollback
      setPermessi(prev => ({
        ...prev,
        [utenteId]: { ...prev[utenteId], [key]: !newVal }
      }))
    } else {
      showToast('Permesso aggiornato', 'ok')
    }
  }

  async function setPreset(utenteId: string, preset: 'geometra' | 'capo_geometra' | 'admin' | 'nessuno') {
    if (!isAdmin) return

    const presets: Record<string, Permessi> = {
      nessuno: {
        dashboard: false, progetti: false, costi_cantiere: false,
        ddt: false, da_ricevere: false, fatture_fornitori: false,
        fatture_clienti: false, import_sdi: false, scadenzario: false,
        cashflow: false, budget: false, anagrafiche: false,
        dipendenti: false, utenti: false, solo_cantieri_assegnati: false,
      },
      geometra: {
        dashboard: false, progetti: true, costi_cantiere: true,
        ddt: true, da_ricevere: false, fatture_fornitori: false,
        fatture_clienti: false, import_sdi: false, scadenzario: false,
        cashflow: false, budget: false, anagrafiche: true,
        dipendenti: true, utenti: false, solo_cantieri_assegnati: true,
      },
      capo_geometra: {
        dashboard: true, progetti: true, costi_cantiere: true,
        ddt: true, da_ricevere: true, fatture_fornitori: false,
        fatture_clienti: false, import_sdi: false, scadenzario: true,
        cashflow: false, budget: true, anagrafiche: true,
        dipendenti: true, utenti: false, solo_cantieri_assegnati: false,
      },
      admin: {
        dashboard: true, progetti: true, costi_cantiere: true,
        ddt: true, da_ricevere: true, fatture_fornitori: true,
        fatture_clienti: true, import_sdi: true, scadenzario: true,
        cashflow: true, budget: true, anagrafiche: true,
        dipendenti: true, utenti: true, solo_cantieri_assegnati: false,
      },
    }

    const newPerm = presets[preset]
    setPermessi(prev => ({ ...prev, [utenteId]: newPerm }))
    setSaving(prev => ({ ...prev, [utenteId]: true }))

    const { error } = await supabase
      .from('permessi_utenti')
      .upsert({ utente_id: utenteId, ...newPerm }, { onConflict: 'utente_id' })

    setSaving(prev => ({ ...prev, [utenteId]: false }))
    if (error) {
      showToast('Errore: ' + error.message, 'err')
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
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.msg}
          </div>
        )}

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Utenti e permessi</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin ? 'Sei loggato come amministratore — puoi modificare tutti i permessi.' : 'Solo l\'amministratore può modificare i permessi.'}
          </p>
        </div>

        {/* Istruzioni aggiunta utente */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
          <strong>Come aggiungere un utente:</strong> vai su{' '}
          <strong>supabase.com → Authentication → Users → Invite user</strong>.
          L'utente riceve email con link per impostare la password.
          Poi inseriscilo anche nella tabella <strong>utenti</strong> con id, email e nome.
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Caricamento utenti...</div>
        ) : utenti.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Nessun utente trovato nella tabella <code>utenti</code>.</div>
        ) : (
          <div className="space-y-6">
            {utenti.map(u => {
              const perm = permessi[u.id] ?? {}
              const isSelf = u.email === ADMIN_EMAIL
              const isSaving = saving[u.id]

              return (
                <div key={u.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isSelf ? 'border-blue-300' : 'border-gray-200'}`}>
                  {/* Header utente */}
                  <div className={`px-5 py-4 flex items-center justify-between ${isSelf ? 'bg-blue-50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white ${isSelf ? 'bg-blue-600' : 'bg-gray-500'}`}>
                        {(u.nome ?? u.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{u.nome ?? '—'}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                      {isSelf && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">HOST / ADMIN</span>}
                      {isSaving && <span className="text-xs text-gray-400 animate-pulse">Salvataggio...</span>}
                    </div>

                    {/* Preset buttons */}
                    {isAdmin && !isSelf && (
                      <div className="flex gap-2">
                        <span className="text-xs text-gray-400 self-center mr-1">Preset:</span>
                        {(['nessuno', 'geometra', 'capo_geometra', 'admin'] as const).map(p => (
                          <button
                            key={p}
                            onClick={() => setPreset(u.id, p)}
                            className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 transition"
                          >
                            {p === 'nessuno' ? '🚫 Nessuno' : p === 'geometra' ? '📐 Geometra' : p === 'capo_geometra' ? '🏗️ Capo Geom.' : '🔑 Admin'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Griglia permessi */}
                  <div className="p-5">
                    {isSelf ? (
                      <p className="text-sm text-blue-700 font-medium">✓ Accesso completo a tutto — account host</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {SEZIONI.map(s => {
                          const active = !!perm[s.key]
                          const isSpecial = s.key === 'solo_cantieri_assegnati'
                          return (
                            <button
                              key={s.key}
                              onClick={() => togglePermesso(u.id, s.key)}
                              disabled={!isAdmin}
                              className={`relative text-xs px-3 py-2 rounded-lg border text-left transition-all duration-150 ${
                                isSpecial
                                  ? active
                                    ? 'bg-orange-50 border-orange-400 text-orange-800 font-medium'
                                    : 'bg-gray-50 border-gray-200 text-gray-400'
                                  : active
                                  ? 'bg-green-50 border-green-400 text-green-800 font-medium'
                                  : 'bg-gray-50 border-gray-200 text-gray-400'
                              } ${isAdmin ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}`}
                            >
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
