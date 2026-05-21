'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const formatData = (d: string) => d ? new Date(d).toLocaleDateString('it-IT') : '—'

function scadenzaAlert(data: string | null): 'scaduta' | 'anno_corrente' | 'ok' | 'nessuna' {
  if (!data) return 'nessuna'
  const anno = new Date().getFullYear()
  const d = new Date(data)
  if (d < new Date()) return 'scaduta'
  if (d.getFullYear() === anno) return 'anno_corrente'
  return 'ok'
}

function BadgeScadenza({ data, label }: { data: string | null, label: string }) {
  const stato = scadenzaAlert(data)
  if (stato === 'nessuna') return null
  if (stato === 'scaduta') return (
    <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
      🔴 {label} SCADUTA
    </span>
  )
  if (stato === 'anno_corrente') return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
      🟡 {label} scade nel {new Date().getFullYear()}
    </span>
  )
  return null
}

export default function Dipendenti() {
  const [dipendenti, setDipendenti] = useState<any[]>([])
  const [selezionato, setSelezionato] = useState<any>(null)
  const [corsi, setCorsi] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [modalCorso, setModalCorso] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filtroAzienda, setFiltroAzienda] = useState('')
  const [aziende, setAziende] = useState<string[]>([])

  const [form, setForm] = useState({
    nome: '', cognome: '', azienda: '', mansione: '',
    data_nascita: '', luogo_nascita: '', codice_fiscale: '',
    data_inizio_contratto: '', data_fine_contratto: '', tipo_contratto: '',
    scadenza_visita_medica: '', note: ''
  })

  const [formCorso, setFormCorso] = useState({
    nome_corso: '', ente_erogatore: '', data_conseguimento: '', scadenza: '', note: ''
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('dipendenti').select('*')
      .order('azienda').order('cognome').order('nome')
    setDipendenti(data || [])
const az = Array.from(new Set((data || []).map((d: any) => d.azienda))).sort()
    setAziende(az)
  }

  async function apriDipendente(dip: any) {
    setSelezionato(dip)
    const { data } = await supabase.from('corsi_dipendente')
      .select('*').eq('dipendente_id', dip.id).order('scadenza')
    setCorsi(data || [])
  }

  async function salva() {
    if (!form.nome || !form.cognome || !form.azienda) {
      alert('Nome, cognome e azienda sono obbligatori'); return
    }
    setLoading(true)
    await supabase.from('dipendenti').insert({
      nome: form.nome, cognome: form.cognome, azienda: form.azienda,
      mansione: form.mansione, data_nascita: form.data_nascita || null,
      luogo_nascita: form.luogo_nascita, codice_fiscale: form.codice_fiscale,
      data_inizio_contratto: form.data_inizio_contratto || null,
      data_fine_contratto: form.data_fine_contratto || null,
      tipo_contratto: form.tipo_contratto,
      scadenza_visita_medica: form.scadenza_visita_medica || null,
      note: form.note, attivo: true
    })
    setModal(false)
    setForm({ nome:'',cognome:'',azienda:'',mansione:'',data_nascita:'',luogo_nascita:'',codice_fiscale:'',data_inizio_contratto:'',data_fine_contratto:'',tipo_contratto:'',scadenza_visita_medica:'',note:'' })
    setLoading(false)
    load()
  }

  async function salvaCorso() {
    if (!formCorso.nome_corso || !selezionato) { alert('Inserisci il nome del corso'); return }
    await supabase.from('corsi_dipendente').insert({
      dipendente_id: selezionato.id,
      nome_corso: formCorso.nome_corso,
      ente_erogatore: formCorso.ente_erogatore,
      data_conseguimento: formCorso.data_conseguimento || null,
      scadenza: formCorso.scadenza || null,
      note: formCorso.note
    })
    setModalCorso(false)
    setFormCorso({ nome_corso:'',ente_erogatore:'',data_conseguimento:'',scadenza:'',note:'' })
    apriDipendente(selezionato)
  }

  async function eliminaCorso(id: string) {
    if (!confirm('Eliminare questo corso?')) return
    await supabase.from('corsi_dipendente').delete().eq('id', id)
    apriDipendente(selezionato)
  }

  async function eliminaDipendente(id: string) {
    if (!confirm('Eliminare questo dipendente? Verranno eliminati anche tutti i suoi corsi.')) return
    await supabase.from('dipendenti').delete().eq('id', id)
    setSelezionato(null)
    load()
  }

  async function toggleAttivo(id: string, attivo: boolean) {
    await supabase.from('dipendenti').update({ attivo: !attivo }).eq('id', id)
    load()
    if (selezionato?.id === id) setSelezionato({ ...selezionato, attivo: !attivo })
  }

  // Alert globali
  const alertVisita = dipendenti.filter(d => scadenzaAlert(d.scadenza_visita_medica) !== 'ok' && scadenzaAlert(d.scadenza_visita_medica) !== 'nessuna')
  const alertContratto = dipendenti.filter(d => scadenzaAlert(d.data_fine_contratto) !== 'ok' && scadenzaAlert(d.data_fine_contratto) !== 'nessuna')

  const filtered = dipendenti.filter(d => !filtroAzienda || d.azienda === filtroAzienda)

  // Raggruppa per azienda
  const perAzienda: Record<string, any[]> = {}
  filtered.forEach(d => {
    if (!perAzienda[d.azienda]) perAzienda[d.azienda] = []
    perAzienda[d.azienda].push(d)
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Dipendenti</h1>
          <button className="btn btn-primary text-sm" onClick={() => setModal(true)}>+ Nuovo dipendente</button>
        </div>

        {/* Alert globali */}
        {(alertVisita.length > 0 || alertContratto.length > 0) && (
          <div className="space-y-2 mb-4">
            {alertVisita.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-sm font-medium text-amber-800 mb-1">
                  ⚠️ Visite mediche in scadenza o scadute ({alertVisita.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {alertVisita.map(d => (
                    <span key={d.id}
                      className={`text-xs px-2 py-1 rounded-full cursor-pointer ${scadenzaAlert(d.scadenza_visita_medica) === 'scaduta' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}
                      onClick={() => apriDipendente(d)}>
                      {d.cognome} {d.nome} — {formatData(d.scadenza_visita_medica)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {alertContratto.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm font-medium text-red-800 mb-1">
                  🔴 Contratti in scadenza o scaduti ({alertContratto.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {alertContratto.map(d => (
                    <span key={d.id}
                      className={`text-xs px-2 py-1 rounded-full cursor-pointer ${scadenzaAlert(d.data_fine_contratto) === 'scaduta' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}
                      onClick={() => apriDipendente(d)}>
                      {d.cognome} {d.nome} — {formatData(d.data_fine_contratto)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          {/* Lista dipendenti */}
          <div className="w-72 flex-shrink-0">
            <div className="mb-3">
              <select className="input text-sm" value={filtroAzienda} onChange={e => setFiltroAzienda(e.target.value)}>
                <option value="">Tutte le aziende</option>
                {aziende.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              {Object.entries(perAzienda).map(([azienda, dipList]) => (
                <div key={azienda}>
                  <div className="px-3 py-1.5 bg-gray-900 rounded-lg mb-1">
                    <p className="text-xs font-medium text-white">{azienda}</p>
                    <p className="text-xs text-gray-400">{dipList.length} dipendenti</p>
                  </div>
                  {dipList.map(d => {
                    const hasAlert = scadenzaAlert(d.scadenza_visita_medica) !== 'ok' && scadenzaAlert(d.scadenza_visita_medica) !== 'nessuna'
                    const hasContrattoAlert = scadenzaAlert(d.data_fine_contratto) !== 'ok' && scadenzaAlert(d.data_fine_contratto) !== 'nessuna'
                    return (
                      <div key={d.id}
                        onClick={() => apriDipendente(d)}
                        className={`px-3 py-2 rounded-lg cursor-pointer mb-0.5 border transition-all ${selezionato?.id === d.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-medium ${!d.attivo ? 'text-gray-400' : ''}`}>
                            {d.cognome} {d.nome}
                          </p>
                          <div className="flex gap-1">
                            {hasAlert && <span title="Visita medica">⚕️</span>}
                            {hasContrattoAlert && <span title="Contratto">📋</span>}
                            {!d.attivo && <span className="text-xs text-gray-400">inattivo</span>}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">{d.mansione || '—'}</p>
                      </div>
                    )
                  })}
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Nessun dipendente.</p>
              )}
            </div>
          </div>

          {/* Dettaglio dipendente */}
          {selezionato ? (
            <div className="flex-1 space-y-4">
              {/* Header */}
              <div className="card bg-gray-900 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{selezionato.cognome} {selezionato.nome}</h2>
                    <p className="text-gray-300 text-sm">{selezionato.mansione || '—'} · {selezionato.azienda}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <BadgeScadenza data={selezionato.scadenza_visita_medica} label="Visita medica" />
                      <BadgeScadenza data={selezionato.data_fine_contratto} label="Contratto" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleAttivo(selezionato.id, selezionato.attivo)}
                      className={`btn btn-sm ${selezionato.attivo ? 'bg-gray-700 text-white border-gray-600' : 'bg-green-700 text-white border-green-600'}`}>
                      {selezionato.attivo ? 'Disattiva' : 'Riattiva'}
                    </button>
                    <button onClick={() => eliminaDipendente(selezionato.id)}
                      className="btn btn-sm bg-red-700 text-white border-red-600">
                      Elimina
                    </button>
                  </div>
                </div>
              </div>

              {/* Dati anagrafici */}
              <div className="card">
                <h3 className="font-medium text-sm mb-3">📋 Dati anagrafici e contrattuali</h3>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><p className="text-xs text-gray-400">Data di nascita</p><p className="font-medium">{formatData(selezionato.data_nascita)}</p></div>
                  <div><p className="text-xs text-gray-400">Luogo di nascita</p><p className="font-medium">{selezionato.luogo_nascita || '—'}</p></div>
                  <div><p className="text-xs text-gray-400">Codice fiscale</p><p className="font-medium font-mono">{selezionato.codice_fiscale || '—'}</p></div>
                  <div><p className="text-xs text-gray-400">Tipo contratto</p><p className="font-medium">{selezionato.tipo_contratto || '—'}</p></div>
                  <div><p className="text-xs text-gray-400">Inizio contratto</p><p className="font-medium">{formatData(selezionato.data_inizio_contratto)}</p></div>
                  <div>
                    <p className="text-xs text-gray-400">Fine contratto</p>
                    <p className={`font-medium ${scadenzaAlert(selezionato.data_fine_contratto) === 'scaduta' ? 'text-red-600' : scadenzaAlert(selezionato.data_fine_contratto) === 'anno_corrente' ? 'text-amber-600' : ''}`}>
                      {formatData(selezionato.data_fine_contratto)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Visita medica scade il</p>
                    <p className={`font-medium ${scadenzaAlert(selezionato.scadenza_visita_medica) === 'scaduta' ? 'text-red-600' : scadenzaAlert(selezionato.scadenza_visita_medica) === 'anno_corrente' ? 'text-amber-600' : ''}`}>
                      {formatData(selezionato.scadenza_visita_medica)}
                    </p>
                  </div>
                  {selezionato.note && (
                    <div className="col-span-3"><p className="text-xs text-gray-400">Note</p><p>{selezionato.note}</p></div>
                  )}
                </div>
              </div>

              {/* Corsi */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-sm">🎓 Corsi e certificazioni</h3>
                  <button className="btn btn-sm btn-primary" onClick={() => setModalCorso(true)}>+ Aggiungi corso</button>
                </div>
                {corsi.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Nessun corso registrato.</p>
                ) : (
                  <div className="space-y-2">
                    {corsi.map(c => {
                      const stato = scadenzaAlert(c.scadenza)
                      return (
                        <div key={c.id} className={`rounded-lg p-3 border flex items-start justify-between gap-2 ${stato === 'scaduta' ? 'bg-red-50 border-red-200' : stato === 'anno_corrente' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{c.nome_corso}</p>
                              {stato === 'scaduta' && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">🔴 Scaduto</span>}
                              {stato === 'anno_corrente' && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">🟡 Scade nel {new Date().getFullYear()}</span>}
                            </div>
                            {c.ente_erogatore && <p className="text-xs text-gray-500 mt-0.5">{c.ente_erogatore}</p>}
                            <div className="flex gap-3 mt-1 text-xs text-gray-500">
                              {c.data_conseguimento && <span>Conseguito: {formatData(c.data_conseguimento)}</span>}
                              {c.scadenza && <span className={stato === 'scaduta' ? 'text-red-600 font-medium' : stato === 'anno_corrente' ? 'text-amber-600 font-medium' : ''}>Scade: {formatData(c.scadenza)}</span>}
                            </div>
                            {c.note && <p className="text-xs text-gray-400 mt-1">{c.note}</p>}
                          </div>
                          <button onClick={() => eliminaCorso(c.id)}
                            className="text-gray-300 hover:text-red-500 text-sm flex-shrink-0">✕</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-4xl mb-3">👷</p>
                <p className="text-sm">Seleziona un dipendente dalla lista</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal nuovo dipendente */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuovo dipendente</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Nome *</label><input className="input" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} /></div>
              <div><label className="label">Cognome *</label><input className="input" value={form.cognome} onChange={e => setForm({...form, cognome: e.target.value})} /></div>
              <div><label className="label">Azienda *</label><input className="input" placeholder="es. BC General Service" value={form.azienda} onChange={e => setForm({...form, azienda: e.target.value})} /></div>
              <div><label className="label">Mansione</label><input className="input" placeholder="es. Operaio, Geometra" value={form.mansione} onChange={e => setForm({...form, mansione: e.target.value})} /></div>
              <div><label className="label">Data di nascita</label><input className="input" type="date" value={form.data_nascita} onChange={e => setForm({...form, data_nascita: e.target.value})} /></div>
              <div><label className="label">Luogo di nascita</label><input className="input" value={form.luogo_nascita} onChange={e => setForm({...form, luogo_nascita: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Codice fiscale</label><input className="input font-mono uppercase" value={form.codice_fiscale} onChange={e => setForm({...form, codice_fiscale: e.target.value.toUpperCase()})} /></div>
              <div className="col-span-2 mt-1 text-xs font-medium text-gray-500 border-t pt-2">Contratto</div>
              <div><label className="label">Tipo contratto</label>
                <select className="input" value={form.tipo_contratto} onChange={e => setForm({...form, tipo_contratto: e.target.value})}>
                  <option value="">— seleziona —</option>
                  <option>Indeterminato</option><option>Determinato</option><option>Apprendistato</option><option>Somministrazione</option><option>Collaborazione</option><option>Altro</option>
                </select>
              </div>
              <div></div>
              <div><label className="label">Inizio contratto</label><input className="input" type="date" value={form.data_inizio_contratto} onChange={e => setForm({...form, data_inizio_contratto: e.target.value})} /></div>
              <div><label className="label">Fine contratto</label><input className="input" type="date" value={form.data_fine_contratto} onChange={e => setForm({...form, data_fine_contratto: e.target.value})} /></div>
              <div className="col-span-2 mt-1 text-xs font-medium text-gray-500 border-t pt-2">Sicurezza</div>
              <div><label className="label">Scadenza visita medica</label><input className="input" type="date" value={form.scadenza_visita_medica} onChange={e => setForm({...form, scadenza_visita_medica: e.target.value})} /></div>
              <div></div>
              <div className="col-span-2"><label className="label">Note</label><textarea className="input h-16 resize-none" value={form.note} onChange={e => setForm({...form, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuovo corso */}
      {modalCorso && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Aggiungi corso — {selezionato?.cognome} {selezionato?.nome}</h2>
              <button onClick={() => setModalCorso(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div><label className="label">Nome corso *</label><input className="input" placeholder="es. Corso sicurezza cantieri D.Lgs 81/08" value={formCorso.nome_corso} onChange={e => setFormCorso({...formCorso, nome_corso: e.target.value})} /></div>
              <div><label className="label">Ente erogatore</label><input className="input" placeholder="es. INAIL, Confartigianato..." value={formCorso.ente_erogatore} onChange={e => setFormCorso({...formCorso, ente_erogatore: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Data conseguimento</label><input className="input" type="date" value={formCorso.data_conseguimento} onChange={e => setFormCorso({...formCorso, data_conseguimento: e.target.value})} /></div>
                <div><label className="label">Scadenza</label><input className="input" type="date" value={formCorso.scadenza} onChange={e => setFormCorso({...formCorso, scadenza: e.target.value})} /></div>
              </div>
              <div><label className="label">Note</label><input className="input" value={formCorso.note} onChange={e => setFormCorso({...formCorso, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalCorso(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaCorso}>Salva corso</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
