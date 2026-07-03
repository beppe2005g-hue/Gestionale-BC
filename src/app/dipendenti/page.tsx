'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { useRef } from 'react'

const formatData = (d: string) => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const PREAVVISO_VISITA = 60
const PREAVVISO_CONTRATTO = 25

function giorniAllaScadenza(data: string | null): number | null {
  if (!data) return null
  const oggi = new Date(); oggi.setHours(0,0,0,0)
  const d = new Date(data); d.setHours(0,0,0,0)
  return Math.ceil((d.getTime() - oggi.getTime()) / 86400000)
}

function statoScadenza(data: string | null): 'scaduta'|'anno_corrente'|'prossimo_anno'|'ok'|'nessuna' {
  if (!data) return 'nessuna'
  const anno = new Date().getFullYear()
  const d = new Date(data)
  if (d < new Date()) return 'scaduta'
  if (d.getFullYear() === anno) return 'anno_corrente'
  if (d.getFullYear() === anno + 1) return 'prossimo_anno'
  return 'ok'
}

function statoConPreavviso(data: string | null, giorniPreavviso: number): 'scaduta'|'in_preavviso'|'ok'|'nessuna' {
  if (!data) return 'nessuna'
  const giorni = giorniAllaScadenza(data)
  if (giorni === null) return 'nessuna'
  if (giorni < 0) return 'scaduta'
  if (giorni <= giorniPreavviso) return 'in_preavviso'
  return 'ok'
}

function labelGiorni(data: string | null, preavviso: number): string {
  const giorni = giorniAllaScadenza(data)
  if (giorni === null) return ''
  if (giorni < 0) return `Scaduta da ${Math.abs(giorni)}gg`
  if (giorni === 0) return 'Scade oggi!'
  return `${giorni}gg`
}

function AvatarDipendente({ dipendente, size = 'md', onClick }: { dipendente: any, size?: 'sm'|'md'|'lg', onClick?: () => void }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-24 h-24 text-2xl' }
  const initiali = `${dipendente.nome?.charAt(0) || ''}${dipendente.cognome?.charAt(0) || ''}`.toUpperCase()
  if (dipendente.foto_url) {
    return <img src={dipendente.foto_url} alt={`${dipendente.nome} ${dipendente.cognome}`} className={`${sizes[size]} rounded-full object-cover cursor-pointer flex-shrink-0 border-2 border-white shadow-sm`} onClick={onClick} />
  }
  return <div className={`${sizes[size]} rounded-full bg-gray-700 text-white flex items-center justify-center font-semibold flex-shrink-0 cursor-pointer`} onClick={onClick}>{initiali || '?'}</div>
}

export default function Dipendenti() {
  const [tab, setTab] = useState<'lista'|'matrice'>('lista')
  const [dipendenti, setDipendenti] = useState<any[]>([])
  const [tuttiCorsi, setTuttiCorsi] = useState<string[]>([])
  const [selezionato, setSelezionato] = useState<any>(null)
  const [corsiDip, setCorsiDip] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [modalModifica, setModalModifica] = useState<any>(null)
  const [modalCorso, setModalCorso] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filtroAzienda, setFiltroAzienda] = useState('')
  const [mostraExDipendenti, setMostraExDipendenti] = useState(false)
  const [aziende, setAziende] = useState<string[]>([])
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [searchDip, setSearchDip] = useState('') // ← BARRA RICERCA
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const [corsiMatrice, setCorsiMatrice] = useState<Record<string, any[]>>({})

  const [form, setForm] = useState({
    nome:'',cognome:'',azienda:'',mansione:'',nome_programma:'',data_nascita:'',luogo_nascita:'',
    codice_fiscale:'',data_inizio_contratto:'',data_fine_contratto:'',
    tipo_contratto:'',scadenza_visita_medica:'',note:'', tecnico: false
  })
  const [formCorso, setFormCorso] = useState({ nome_corso:'',ente_erogatore:'',data_conseguimento:'',scadenza:'',note:'' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: dip } = await supabase.from('dipendenti').select('*').order('cognome').order('nome')
    const dipOrdinati = (dip || []).sort((a: any, b: any) => {
      const aBC = a.azienda.toUpperCase().startsWith('BC')
      const bBC = b.azienda.toUpperCase().startsWith('BC')
      if (aBC && !bBC) return -1; if (!aBC && bBC) return 1
      const cmpAz = a.azienda.localeCompare(b.azienda); if (cmpAz !== 0) return cmpAz
      // Ordine manuale: usa colonna ordine se valorizzata
      const ordA = a.ordine ?? 999999
      const ordB = b.ordine ?? 999999
      if (ordA !== ordB) return ordA - ordB
      const cmpCog = a.cognome.localeCompare(b.cognome); if (cmpCog !== 0) return cmpCog
      return a.nome.localeCompare(b.nome)
    })
    setDipendenti(dipOrdinati)
    const az = Array.from(new Set((dip || []).map((d: any) => d.azienda)))
      .sort((a: any, b: any) => { if (a.toUpperCase().startsWith('BC')) return -1; if (b.toUpperCase().startsWith('BC')) return 1; return a.localeCompare(b) }) as string[]
    setAziende(az)
    const { data: corsi } = await supabase.from('corsi_dipendente').select('nome_corso')
    setTuttiCorsi(Array.from(new Set((corsi || []).map((c: any) => c.nome_corso))).sort() as string[])
  }

  async function apriDipendente(dip: any) {
    setSelezionato(dip)
    const { data } = await supabase.from('corsi_dipendente').select('*').eq('dipendente_id', dip.id).order('scadenza')
    setCorsiDip(data || [])
  }

  // Sposta dipendente su o giù nell'ordine, dentro la stessa azienda
  async function sposta(dipId: string, direzione: 'su' | 'giu') {
    const dip = dipendenti.find(d => d.id === dipId)
    if (!dip) return
    // Lista ordinata della stessa azienda (stessa logica del sort in load)
    const stessaAz = dipendenti.filter(d => d.azienda === dip.azienda)
    const idx = stessaAz.findIndex(d => d.id === dipId)
    const swapIdx = direzione === 'su' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= stessaAz.length) return
    const other = stessaAz[swapIdx]
    // Se ordine non è ancora valorizzato, assegna valori di default
    const ordA = dip.ordine != null ? dip.ordine : idx * 10
    const ordB = other.ordine != null ? other.ordine : swapIdx * 10
    const [r1, r2] = await Promise.all([
      supabase.from('dipendenti').update({ ordine: ordB }).eq('id', dipId),
      supabase.from('dipendenti').update({ ordine: ordA }).eq('id', other.id),
    ])
    if (r1.error || r2.error) {
      alert('Errore spostamento: ' + (r1.error?.message || r2.error?.message || 'sconosciuto') + '\n\nHai eseguito il SQL 12_sql_dipendenti_tecnico_ordine.sql in Supabase?')
      return
    }
    load()
  }

  async function uploadFoto(file: File, dipId: string) {
    setUploadingFoto(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${dipId}.${ext}`
      await supabase.storage.from('dipendenti-foto').remove([path])
      const { error: upErr } = await supabase.storage.from('dipendenti-foto').upload(path, file, { upsert: true })
      if (upErr) { alert('Errore upload: ' + upErr.message); return }
      const { data: urlData } = supabase.storage.from('dipendenti-foto').getPublicUrl(path)
      const foto_url = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('dipendenti').update({ foto_url }).eq('id', dipId)
      const aggiornato = { ...selezionato, foto_url }
      setSelezionato(aggiornato)
      setDipendenti(prev => prev.map(d => d.id === dipId ? aggiornato : d))
    } finally { setUploadingFoto(false) }
  }

  async function rimuoviFoto(dipId: string) {
    if (!confirm('Rimuovere la foto?')) return
    const dip = dipendenti.find(d => d.id === dipId)
    if (dip?.foto_url) { const path = dip.foto_url.split('/').pop()?.split('?')[0]; if (path) await supabase.storage.from('dipendenti-foto').remove([path]) }
    await supabase.from('dipendenti').update({ foto_url: null }).eq('id', dipId)
    const aggiornato = { ...selezionato, foto_url: null }
    setSelezionato(aggiornato); setDipendenti(prev => prev.map(d => d.id === dipId ? aggiornato : d))
  }

  async function salva() {
    if (!form.nome || !form.cognome || !form.azienda) { alert('Nome, cognome e azienda obbligatori'); return }
    setLoading(true)
    await supabase.from('dipendenti').insert({ nome:form.nome, cognome:form.cognome, azienda:form.azienda, mansione:form.mansione, nome_programma:form.nome_programma||null, data_nascita:form.data_nascita||null, luogo_nascita:form.luogo_nascita, codice_fiscale:form.codice_fiscale, data_inizio_contratto:form.data_inizio_contratto||null, data_fine_contratto:form.data_fine_contratto||null, tipo_contratto:form.tipo_contratto, scadenza_visita_medica:form.scadenza_visita_medica||null, note:form.note, attivo:true, tecnico: form.tecnico })
    setModal(false)
    setForm({nome:'',cognome:'',azienda:'',mansione:'',nome_programma:'',data_nascita:'',luogo_nascita:'',codice_fiscale:'',data_inizio_contratto:'',data_fine_contratto:'',tipo_contratto:'',scadenza_visita_medica:'',note:'',tecnico:false})
    setLoading(false); load()
  }

  async function salvaModifica() {
    if (!modalModifica) return; setLoading(true)
    await supabase.from('dipendenti').update({ nome:modalModifica.nome, cognome:modalModifica.cognome, azienda:modalModifica.azienda, mansione:modalModifica.mansione, nome_programma:modalModifica.nome_programma||null, data_nascita:modalModifica.data_nascita||null, luogo_nascita:modalModifica.luogo_nascita, codice_fiscale:modalModifica.codice_fiscale, data_inizio_contratto:modalModifica.data_inizio_contratto||null, data_fine_contratto:modalModifica.data_fine_contratto||null, tipo_contratto:modalModifica.tipo_contratto, scadenza_visita_medica:modalModifica.scadenza_visita_medica||null, note:modalModifica.note, tecnico: !!modalModifica.tecnico }).eq('id', modalModifica.id)
    setModalModifica(null); setLoading(false); load()
    if (selezionato?.id === modalModifica.id) apriDipendente(modalModifica)
  }

  async function salvaCorso() {
    if (!formCorso.nome_corso || !selezionato) { alert('Inserisci il nome del corso'); return }
    await supabase.from('corsi_dipendente').insert({ dipendente_id:selezionato.id, nome_corso:formCorso.nome_corso, ente_erogatore:formCorso.ente_erogatore, data_conseguimento:formCorso.data_conseguimento||null, scadenza:formCorso.scadenza||null, note:formCorso.note })
    setModalCorso(false); setFormCorso({nome_corso:'',ente_erogatore:'',data_conseguimento:'',scadenza:'',note:''})
    apriDipendente(selezionato); load()
  }

  async function eliminaCorso(id: string) {
    if (!confirm('Eliminare questo corso?')) return
    await supabase.from('corsi_dipendente').delete().eq('id', id)
    apriDipendente(selezionato)
  }

  async function eliminaDipendente(id: string) {
    if (!confirm('Eliminare definitivamente? Verranno eliminati anche tutti i corsi.')) return
    await supabase.from('dipendenti').delete().eq('id', id)
    setSelezionato(null); load()
  }

  async function toggleAttivo(id: string, attivo: boolean) {
    await supabase.from('dipendenti').update({ attivo: !attivo }).eq('id', id)
    load(); if (selezionato?.id === id) setSelezionato({ ...selezionato, attivo: !attivo })
  }

  const alertVisita = dipendenti.filter(d => { if (!d.attivo) return false; const s = statoConPreavviso(d.scadenza_visita_medica, PREAVVISO_VISITA); return s === 'scaduta' || s === 'in_preavviso' })
  const alertContratto = dipendenti.filter(d => { if (!d.attivo) return false; const s = statoConPreavviso(d.data_fine_contratto, PREAVVISO_CONTRATTO); return s === 'scaduta' || s === 'in_preavviso' })

  // ── Filtro con ricerca testuale ──
  const dipFiltrati = dipendenti.filter(d => {
    if (!mostraExDipendenti && !d.attivo) return false
    if (mostraExDipendenti && d.attivo) return false
    if (filtroAzienda && d.azienda !== filtroAzienda) return false
    if (searchDip.trim()) {
      const q = searchDip.toLowerCase()
      return (
        d.nome?.toLowerCase().includes(q) ||
        d.cognome?.toLowerCase().includes(q) ||
        d.mansione?.toLowerCase().includes(q) ||
        d.nome_programma?.toLowerCase().includes(q) ||
        d.codice_fiscale?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const perAzienda: Record<string, any[]> = {}
  dipFiltrati.forEach(d => { if (!perAzienda[d.azienda]) perAzienda[d.azienda] = []; perAzienda[d.azienda].push(d) })

  useEffect(() => {
    if (tab !== 'matrice') return
    async function loadMatrice() {
      const { data } = await supabase.from('corsi_dipendente').select('*')
      const mappa: Record<string, any[]> = {}
      ;(data || []).forEach((c: any) => { if (!mappa[c.dipendente_id]) mappa[c.dipendente_id] = []; mappa[c.dipendente_id].push(c) })
      setCorsiMatrice(mappa)
    }
    loadMatrice()
  }, [tab])

  const dipAttivi = dipendenti.filter(d => d.attivo && (!filtroAzienda || d.azienda === filtroAzienda))
  const perAziendaMatrice: Record<string, any[]> = {}
  dipAttivi.forEach(d => { if (!perAziendaMatrice[d.azienda]) perAziendaMatrice[d.azienda] = []; perAziendaMatrice[d.azienda].push(d) })
  const aziendeMatriceOrdinate = Object.keys(perAziendaMatrice).sort((a, b) => { if (a.toUpperCase().startsWith('BC')) return -1; if (b.toUpperCase().startsWith('BC')) return 1; return a.localeCompare(b) })

  function hasVisitaAlert(d: any) { const s = statoConPreavviso(d.scadenza_visita_medica, PREAVVISO_VISITA); return s === 'scaduta' || s === 'in_preavviso' }
  function hasContrattoAlert(d: any) { const s = statoConPreavviso(d.data_fine_contratto, PREAVVISO_CONTRATTO); return s === 'scaduta' || s === 'in_preavviso' }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Dipendenti</h1>
          <button className="btn btn-primary text-sm" onClick={() => setModal(true)}>+ Nuovo dipendente</button>
        </div>

        {(alertVisita.length > 0 || alertContratto.length > 0) && (
          <div className="space-y-2 mb-4">
            {alertVisita.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-sm font-medium text-amber-800 mb-1">⚕️ Visite mediche in scadenza ({alertVisita.length}) — avviso {PREAVVISO_VISITA} giorni prima</p>
                <div className="flex flex-wrap gap-2">
                  {alertVisita.map(d => { const stato = statoConPreavviso(d.scadenza_visita_medica, PREAVVISO_VISITA); return (
                    <span key={d.id} className={`text-xs px-2 py-1 rounded-full cursor-pointer flex items-center gap-1 ${stato === 'scaduta' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`} onClick={() => { apriDipendente(d); setTab('lista') }}>
                      <strong>{d.cognome} {d.nome}</strong> — {formatData(d.scadenza_visita_medica)} <span className="opacity-70">({labelGiorni(d.scadenza_visita_medica, PREAVVISO_VISITA)})</span>
                    </span>
                  )})}
                </div>
              </div>
            )}
            {alertContratto.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm font-medium text-red-800 mb-1">📋 Contratti in scadenza ({alertContratto.length}) — avviso {PREAVVISO_CONTRATTO} giorni prima</p>
                <div className="flex flex-wrap gap-2">
                  {alertContratto.map(d => { const stato = statoConPreavviso(d.data_fine_contratto, PREAVVISO_CONTRATTO); return (
                    <span key={d.id} className={`text-xs px-2 py-1 rounded-full cursor-pointer flex items-center gap-1 ${stato === 'scaduta' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`} onClick={() => { apriDipendente(d); setTab('lista') }}>
                      <strong>{d.cognome} {d.nome}</strong> — {formatData(d.data_fine_contratto)} <span className="opacity-70">({labelGiorni(d.data_fine_contratto, PREAVVISO_CONTRATTO)})</span>
                    </span>
                  )})}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button onClick={() => setTab('lista')} className={`btn ${tab === 'lista' ? 'btn-primary' : ''}`}>👷 Lista dipendenti</button>
          <button onClick={() => setTab('matrice')} className={`btn ${tab === 'matrice' ? 'btn-primary' : ''}`}>📊 Matrice corsi</button>
          <select className="input w-auto text-sm" value={filtroAzienda} onChange={e => setFiltroAzienda(e.target.value)}>
            <option value="">Tutte le aziende</option>
            {aziende.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {tab === 'lista' && (
            <button onClick={() => setMostraExDipendenti(!mostraExDipendenti)} className={`btn btn-sm ${mostraExDipendenti ? 'btn-danger' : ''}`}>
              {mostraExDipendenti ? '← Torna agli attivi' : '📁 Ex dipendenti'}
            </button>
          )}
        </div>

        {tab === 'lista' && (
          <div className="flex gap-3">
            {/* ── PANNELLO LISTA CON BARRA DI RICERCA ── */}
            <div className="w-64 flex-shrink-0 border border-gray-200 rounded-xl overflow-hidden flex flex-col bg-white" style={{ maxHeight: 'calc(100vh - 220px)' }}>
              {/* Barra ricerca */}
              <div className="p-2 border-b border-gray-200 flex-shrink-0 bg-gray-50">
                <input
                  className="input text-xs py-1.5"
                  placeholder="🔍 Cerca per nome, mansione, CF..."
                  value={searchDip}
                  onChange={e => setSearchDip(e.target.value)}
                />
                {searchDip && (
                  <div className="flex items-center justify-between mt-1 px-1">
                    <span className="text-xs text-gray-400">{dipFiltrati.length} risultati</span>
                    <button onClick={() => setSearchDip('')} className="text-xs text-blue-600 hover:underline">× Reset</button>
                  </div>
                )}
              </div>

              {/* Lista dipendenti */}
              <div className="flex-1 overflow-y-auto">
                {Object.keys(perAzienda).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">{searchDip ? 'Nessun risultato.' : mostraExDipendenti ? 'Nessun ex dipendente.' : 'Nessun dipendente.'}</p>
                ) : Object.entries(perAzienda).map(([azienda, dipList]) => (
                  <div key={azienda}>
                    <div className="px-3 py-1.5 bg-gray-900 sticky top-0 z-10">
                      <p className="text-xs font-medium text-white">{azienda}</p>
                      <p className="text-xs text-gray-400">{dipList.length} {mostraExDipendenti ? 'ex ' : ''}dipendenti</p>
                    </div>
                    {dipList.map((d, didx) => (
                      <div key={d.id}
                        className={`px-2 py-1.5 cursor-pointer border-b border-gray-100 transition-all flex items-center gap-1.5 ${selezionato?.id === d.id ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}`}>
                        {/* Bottoni ordine */}
                        <div className="flex flex-col gap-0 flex-shrink-0">
                          <button
                            className="text-gray-300 hover:text-blue-500 text-xs leading-none py-0.5 px-0.5 rounded"
                            onClick={e => { e.stopPropagation(); sposta(d.id, 'su') }}
                            title="Sposta su"
                            disabled={didx === 0}>▲</button>
                          <button
                            className="text-gray-300 hover:text-blue-500 text-xs leading-none py-0.5 px-0.5 rounded"
                            onClick={e => { e.stopPropagation(); sposta(d.id, 'giu') }}
                            title="Sposta giù"
                            disabled={didx === dipList.length - 1}>▼</button>
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => apriDipendente(d)}>
                          <AvatarDipendente dipendente={d} size="sm" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium truncate">{d.cognome} {d.nome}</p>
                              <div className="flex gap-1 flex-shrink-0 items-center">
                                {d.tecnico && <span className="text-xs bg-purple-100 text-purple-700 font-bold px-1 rounded" title="Tecnico">T</span>}
                                {hasVisitaAlert(d) && <span title={`Visita: ${formatData(d.scadenza_visita_medica)}`}>⚕️</span>}
                                {hasContrattoAlert(d) && <span title={`Contratto: ${formatData(d.data_fine_contratto)}`}>📋</span>}
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 truncate">{d.mansione || '—'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {selezionato ? (
              <div className="flex-1 space-y-4">
                <div className="card bg-gray-900 text-white">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 relative group">
                      {selezionato.foto_url ? (
                        <img src={selezionato.foto_url} alt="" className="w-24 h-24 rounded-xl object-cover border-2 border-gray-700" />
                      ) : (
                        <div className="w-24 h-24 rounded-xl bg-gray-700 flex items-center justify-center text-2xl font-bold text-white border-2 border-gray-600">
                          {`${selezionato.nome?.charAt(0)||''}${selezionato.cognome?.charAt(0)||''}`.toUpperCase() || '?'}
                        </div>
                      )}
                      <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 cursor-pointer" onClick={() => fotoInputRef.current?.click()}>
                        <span className="text-white text-xs font-medium">{uploadingFoto ? '⏳' : selezionato.foto_url ? '✏️ Cambia' : '📷 Aggiungi'}</span>
                      </div>
                      <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) uploadFoto(file, selezionato.id); e.target.value = '' }} />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold">{selezionato.cognome} {selezionato.nome}</h2>
                      <p className="text-gray-300 text-sm">{selezionato.mansione || '—'} · {selezionato.azienda}</p>
                      {!selezionato.attivo && <span className="text-xs bg-red-700 px-2 py-0.5 rounded-full mt-1 inline-block">Ex dipendente</span>}
                      {selezionato.foto_url && <button onClick={() => rimuoviFoto(selezionato.id)} className="text-xs text-red-400 hover:text-red-300 mt-1 block">🗑 Rimuovi foto</button>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setModalModifica({...selezionato})} className="btn btn-sm bg-blue-700 text-white border-blue-600">✏️ Modifica</button>
                      <button onClick={() => toggleAttivo(selezionato.id, selezionato.attivo)} className={`btn btn-sm ${selezionato.attivo ? 'bg-gray-700 text-white border-gray-600' : 'bg-green-700 text-white border-green-600'}`}>
                        {selezionato.attivo ? 'Sposta in ex' : 'Riattiva'}
                      </button>
                      <button onClick={() => eliminaDipendente(selezionato.id)} className="btn btn-sm bg-red-700 text-white border-red-600">🗑 Elimina</button>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <h3 className="font-medium text-sm mb-3">📋 Dati anagrafici</h3>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-xs text-gray-400">Data di nascita</p><p className="font-medium">{formatData(selezionato.data_nascita)}</p></div>
                    <div><p className="text-xs text-gray-400">Luogo di nascita</p><p className="font-medium">{selezionato.luogo_nascita || '—'}</p></div>
                    <div><p className="text-xs text-gray-400">Codice fiscale</p><p className="font-medium font-mono text-xs">{selezionato.codice_fiscale || '—'}</p></div>
                    <div><p className="text-xs text-gray-400">Tipo contratto</p><p className="font-medium">{selezionato.tipo_contratto || '—'}</p></div>
                    <div><p className="text-xs text-gray-400">Nome da programma</p><p className="font-medium text-purple-700">{selezionato.nome_programma || '—'}</p></div>
                    <div><p className="text-xs text-gray-400">Inizio contratto</p><p className="font-medium">{formatData(selezionato.data_inizio_contratto)}</p></div>
                    <div>
                      <p className="text-xs text-gray-400">Fine contratto</p>
                      <div className="flex items-center gap-2">
                        <p className={`font-medium ${statoConPreavviso(selezionato.data_fine_contratto, PREAVVISO_CONTRATTO) === 'scaduta' ? 'text-red-600' : statoConPreavviso(selezionato.data_fine_contratto, PREAVVISO_CONTRATTO) === 'in_preavviso' ? 'text-orange-600' : ''}`}>{formatData(selezionato.data_fine_contratto)}</p>
                        {statoConPreavviso(selezionato.data_fine_contratto, PREAVVISO_CONTRATTO) !== 'ok' && statoConPreavviso(selezionato.data_fine_contratto, PREAVVISO_CONTRATTO) !== 'nessuna' && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">{labelGiorni(selezionato.data_fine_contratto, PREAVVISO_CONTRATTO)}</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Visita medica</p>
                      <div className="flex items-center gap-2">
                        <p className={`font-medium ${statoConPreavviso(selezionato.scadenza_visita_medica, PREAVVISO_VISITA) === 'scaduta' ? 'text-red-600' : statoConPreavviso(selezionato.scadenza_visita_medica, PREAVVISO_VISITA) === 'in_preavviso' ? 'text-amber-600' : ''}`}>{formatData(selezionato.scadenza_visita_medica)}</p>
                        {statoConPreavviso(selezionato.scadenza_visita_medica, PREAVVISO_VISITA) !== 'ok' && statoConPreavviso(selezionato.scadenza_visita_medica, PREAVVISO_VISITA) !== 'nessuna' && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{labelGiorni(selezionato.scadenza_visita_medica, PREAVVISO_VISITA)}</span>}
                      </div>
                    </div>
                    {selezionato.note && <div className="col-span-3"><p className="text-xs text-gray-400">Note</p><p>{selezionato.note}</p></div>}
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-sm">🎓 Corsi e certificazioni</h3>
                    <button className="btn btn-sm btn-primary" onClick={() => setModalCorso(true)}>+ Aggiungi corso</button>
                  </div>
                  {corsiDip.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Nessun corso registrato.</p> : (
                    <div className="space-y-2">
                      {corsiDip.map(c => { const stato = statoScadenza(c.scadenza); return (
                        <div key={c.id} className={`rounded-lg p-3 border flex items-start justify-between gap-2 ${stato === 'scaduta' ? 'bg-red-50 border-red-200' : stato === 'anno_corrente' ? 'bg-amber-50 border-amber-200' : stato === 'prossimo_anno' ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-100'}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{c.nome_corso}</p>
                              {stato === 'scaduta' && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">🔴 Scaduto</span>}
                              {stato === 'anno_corrente' && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">🟡 Scade nel {new Date().getFullYear()}</span>}
                              {stato === 'prossimo_anno' && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">🟠 Scade nel {new Date().getFullYear()+1}</span>}
                            </div>
                            {c.ente_erogatore && <p className="text-xs text-gray-500 mt-0.5">{c.ente_erogatore}</p>}
                            <div className="flex gap-3 mt-1 text-xs text-gray-500">
                              {c.data_conseguimento && <span>Conseguito: {formatData(c.data_conseguimento)}</span>}
                              {c.scadenza && <span className={stato === 'scaduta' ? 'text-red-600 font-medium' : stato === 'anno_corrente' ? 'text-amber-600 font-medium' : ''}>Scade: {formatData(c.scadenza)}</span>}
                            </div>
                          </div>
                          <button onClick={() => eliminaCorso(c.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
                        </div>
                      )})}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center"><p className="text-4xl mb-3">👷</p><p className="text-sm">Seleziona un dipendente dalla lista</p></div>
              </div>
            )}
          </div>
        )}

        {tab === 'matrice' && (
          <div className="overflow-x-auto">
            <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-3 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-3 h-3 rounded-sm bg-green-100 border border-green-400 inline-block"></span> OK</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-400 inline-block"></span> Scade quest'anno</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-3 h-3 rounded-sm bg-orange-100 border border-orange-400 inline-block"></span> Scade l'anno prossimo</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-400 inline-block"></span> Scaduto</span>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => { const nome = prompt('Nome del nuovo tipo di corso:'); if (nome?.trim()) setTuttiCorsi(prev => [...prev, nome.trim()].sort()) }}>+ Nuovo tipo corso</button>
            </div>
            <div style={{borderRadius:12,overflow:'hidden',border:'1px solid #dbeafe'}}>
              <table className="border-collapse w-full" style={{fontSize:12}}>
                <thead>
                  <tr>
                    <th style={{background:'linear-gradient(135deg,#1e40af,#1d4ed8)',color:'white',textAlign:'left',padding:'12px 14px',position:'sticky',left:0,zIndex:10,minWidth:160,fontWeight:600,fontSize:13}}>Dipendente</th>
                    {tuttiCorsi.map((corso, idx) => (
                      <th key={corso} style={{background:idx%2===0?'linear-gradient(180deg,#1e40af,#1d4ed8)':'linear-gradient(180deg,#1e3a8a,#1e40af)',color:'white',padding:'8px 6px',minWidth:110,maxWidth:130,verticalAlign:'bottom'}}>
                        <div style={{writingMode:'vertical-rl',transform:'rotate(180deg)',height:140,display:'flex',alignItems:'center',fontSize:11,fontWeight:500,lineHeight:1.3,padding:'4px 0'}}>{corso}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aziendeMatriceOrdinate.map((azienda) => { const dipList = perAziendaMatrice[azienda]; return (
                    <>
                      <tr key={azienda}>
                        <td colSpan={tuttiCorsi.length+1} style={{background:'linear-gradient(90deg,#1e3a8a,#1e40af)',color:'white',padding:'8px 14px',fontSize:12,fontWeight:600,position:'sticky',left:0}}>▸ {azienda} — {dipList.length} dipendenti</td>
                      </tr>
                      {dipList.map((d, rowIdx) => { const corsiDipendente = corsiMatrice[d.id] || []; const rowBg = rowIdx%2===0?'#ffffff':'#f0f7ff'; return (
                        <tr key={d.id} style={{background:rowBg}} onMouseEnter={e=>(e.currentTarget.style.background='#dbeafe')} onMouseLeave={e=>(e.currentTarget.style.background=rowBg)}>
                          <td style={{padding:'6px 14px',fontWeight:500,borderBottom:'1px solid #e0effe',position:'sticky',left:0,background:'inherit',cursor:'pointer',color:'#1e40af',fontSize:12}} onClick={()=>{apriDipendente(d);setTab('lista')}}>
                            <div className="flex items-center gap-2"><AvatarDipendente dipendente={d} size="sm" /><span>{d.cognome} {d.nome}</span></div>
                          </td>
                          {tuttiCorsi.map((corso, colIdx) => { const c = corsiDipendente.find((x:any)=>x.nome_corso===corso); const scad = c?.scadenza||null; const stato = statoScadenza(scad); return (
                            <td key={corso} style={{padding:'6px 4px',textAlign:'center',borderBottom:'1px solid #e0effe',borderLeft:`1px solid ${colIdx%2===0?'#dbeafe':'#e0effe'}`,cursor:'pointer'}} onClick={()=>{apriDipendente(d);setTab('lista')}}>
                              {!scad?<span style={{color:'#cbd5e1',fontSize:11}}>—</span>:(
                                <span style={{display:'inline-block',padding:'2px 5px',borderRadius:6,fontSize:10,fontWeight:600,background:stato==='scaduta'?'#fee2e2':stato==='anno_corrente'?'#fef3c7':stato==='prossimo_anno'?'#ffedd5':'#dcfce7',color:stato==='scaduta'?'#b91c1c':stato==='anno_corrente'?'#92400e':stato==='prossimo_anno'?'#9a3412':'#166534',border:`1px solid ${stato==='scaduta'?'#fca5a5':stato==='anno_corrente'?'#fde68a':stato==='prossimo_anno'?'#fdba74':'#86efac'}`}}>
                                  {new Date(scad).toLocaleDateString('it-IT',{month:'2-digit',year:'2-digit'})}
                                </span>
                              )}
                            </td>
                          )})}
                        </tr>
                      )})}
                    </>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal nuovo dipendente */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold">Nuovo dipendente</h2><button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Nome *</label><input className="input" value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} /></div>
              <div><label className="label">Cognome *</label><input className="input" value={form.cognome} onChange={e=>setForm({...form,cognome:e.target.value})} /></div>
              <div><label className="label">Azienda *</label><input className="input" list="aziende-list" value={form.azienda} onChange={e=>setForm({...form,azienda:e.target.value})} /><datalist id="aziende-list">{aziende.map(a=><option key={a} value={a}/>)}</datalist></div>
              <div><label className="label">Mansione</label><input className="input" value={form.mansione} onChange={e=>setForm({...form,mansione:e.target.value})} /></div>
              <div><label className="label">Nome da programma</label><input className="input" placeholder="es. Mimmo, Gigio..." value={form.nome_programma} onChange={e=>setForm({...form,nome_programma:e.target.value})} /></div>
              <div><label className="label">Data di nascita</label><input className="input" type="date" value={form.data_nascita} onChange={e=>setForm({...form,data_nascita:e.target.value})} /></div>
              <div><label className="label">Luogo di nascita</label><input className="input" value={form.luogo_nascita} onChange={e=>setForm({...form,luogo_nascita:e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Codice fiscale</label><input className="input font-mono uppercase" value={form.codice_fiscale} onChange={e=>setForm({...form,codice_fiscale:e.target.value.toUpperCase()})} /></div>
              <div><label className="label">Tipo contratto</label><select className="input" value={form.tipo_contratto} onChange={e=>setForm({...form,tipo_contratto:e.target.value})}><option value="">— seleziona —</option><option>Indeterminato</option><option>Determinato</option><option>Apprendistato</option><option>Somministrazione</option><option>Collaborazione</option><option>Altro</option></select></div>
              <div></div>
              <div><label className="label">Inizio contratto</label><input className="input" type="date" value={form.data_inizio_contratto} onChange={e=>setForm({...form,data_inizio_contratto:e.target.value})} /></div>
              <div><label className="label">Fine contratto</label><input className="input" type="date" value={form.data_fine_contratto} onChange={e=>setForm({...form,data_fine_contratto:e.target.value})} /></div>
              <div><label className="label">Scadenza visita medica</label><input className="input" type="date" value={form.scadenza_visita_medica} onChange={e=>setForm({...form,scadenza_visita_medica:e.target.value})} /></div>
              <div></div>
              <div className="col-span-2"><label className="label">Note</label><textarea className="input h-16 resize-none" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4 rounded" checked={!!form.tecnico} onChange={e=>setForm({...form,tecnico:e.target.checked})} />
                  <span className="text-sm font-medium text-purple-700">Tecnico</span>
                  <span className="text-xs text-gray-500">(non va in cantiere — la sua presenza viene chiesta separatamente all'approvazione)</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={()=>setModal(false)}>Annulla</button><button className="btn btn-primary" onClick={salva} disabled={loading}>{loading?'Salvataggio...':'Salva'}</button></div>
          </div>
        </div>
      )}

      {/* Modal modifica */}
      {modalModifica && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold">Modifica — {modalModifica.cognome} {modalModifica.nome}</h2><button onClick={()=>setModalModifica(null)} className="text-gray-400 text-xl">×</button></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Nome</label><input className="input" value={modalModifica.nome||''} onChange={e=>setModalModifica({...modalModifica,nome:e.target.value})} /></div>
              <div><label className="label">Cognome</label><input className="input" value={modalModifica.cognome||''} onChange={e=>setModalModifica({...modalModifica,cognome:e.target.value})} /></div>
              <div><label className="label">Azienda</label><input className="input" list="aziende-list2" value={modalModifica.azienda||''} onChange={e=>setModalModifica({...modalModifica,azienda:e.target.value})} /><datalist id="aziende-list2">{aziende.map(a=><option key={a} value={a}/>)}</datalist></div>
              <div><label className="label">Mansione</label><input className="input" value={modalModifica.mansione||''} onChange={e=>setModalModifica({...modalModifica,mansione:e.target.value})} /></div>
              <div><label className="label">Nome da programma</label><input className="input" value={modalModifica.nome_programma||''} onChange={e=>setModalModifica({...modalModifica,nome_programma:e.target.value})} /></div>
              <div><label className="label">Data nascita</label><input className="input" type="date" value={modalModifica.data_nascita||''} onChange={e=>setModalModifica({...modalModifica,data_nascita:e.target.value})} /></div>
              <div><label className="label">Luogo nascita</label><input className="input" value={modalModifica.luogo_nascita||''} onChange={e=>setModalModifica({...modalModifica,luogo_nascita:e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Codice fiscale</label><input className="input font-mono uppercase" value={modalModifica.codice_fiscale||''} onChange={e=>setModalModifica({...modalModifica,codice_fiscale:e.target.value.toUpperCase()})} /></div>
              <div><label className="label">Tipo contratto</label><select className="input" value={modalModifica.tipo_contratto||''} onChange={e=>setModalModifica({...modalModifica,tipo_contratto:e.target.value})}><option value="">— seleziona —</option><option>Indeterminato</option><option>Determinato</option><option>Apprendistato</option><option>Somministrazione</option><option>Collaborazione</option><option>Altro</option></select></div>
              <div></div>
              <div><label className="label">Inizio contratto</label><input className="input" type="date" value={modalModifica.data_inizio_contratto||''} onChange={e=>setModalModifica({...modalModifica,data_inizio_contratto:e.target.value})} /></div>
              <div><label className="label">Fine contratto</label><input className="input" type="date" value={modalModifica.data_fine_contratto||''} onChange={e=>setModalModifica({...modalModifica,data_fine_contratto:e.target.value})} /></div>
              <div><label className="label">Scadenza visita medica</label><input className="input" type="date" value={modalModifica.scadenza_visita_medica||''} onChange={e=>setModalModifica({...modalModifica,scadenza_visita_medica:e.target.value})} /></div>
              <div></div>
              <div className="col-span-2"><label className="label">Note</label><textarea className="input h-16 resize-none" value={modalModifica.note||''} onChange={e=>setModalModifica({...modalModifica,note:e.target.value})} /></div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4 rounded" checked={!!modalModifica.tecnico} onChange={e=>setModalModifica({...modalModifica,tecnico:e.target.checked})} />
                  <span className="text-sm font-medium text-purple-700">Tecnico</span>
                  <span className="text-xs text-gray-500">(non va in cantiere)</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={()=>setModalModifica(null)}>Annulla</button><button className="btn btn-primary" onClick={salvaModifica} disabled={loading}>{loading?'Salvataggio...':'Salva modifiche'}</button></div>
          </div>
        </div>
      )}

      {/* Modal corso */}
      {modalCorso && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold">Aggiungi corso — {selezionato?.cognome} {selezionato?.nome}</h2><button onClick={()=>setModalCorso(false)} className="text-gray-400 text-xl">×</button></div>
            <div className="space-y-3">
              <div><label className="label">Nome corso *</label><input className="input" list="corsi-list" placeholder="es. Primo Soccorso" value={formCorso.nome_corso} onChange={e=>setFormCorso({...formCorso,nome_corso:e.target.value})} /><datalist id="corsi-list">{tuttiCorsi.map(c=><option key={c} value={c}/>)}</datalist></div>
              <div><label className="label">Ente erogatore</label><input className="input" value={formCorso.ente_erogatore} onChange={e=>setFormCorso({...formCorso,ente_erogatore:e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Data conseguimento</label><input className="input" type="date" value={formCorso.data_conseguimento} onChange={e=>setFormCorso({...formCorso,data_conseguimento:e.target.value})} /></div>
                <div><label className="label">Scadenza</label><input className="input" type="date" value={formCorso.scadenza} onChange={e=>setFormCorso({...formCorso,scadenza:e.target.value})} /></div>
              </div>
              <div><label className="label">Note</label><input className="input" value={formCorso.note} onChange={e=>setFormCorso({...formCorso,note:e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={()=>setModalCorso(false)}>Annulla</button><button className="btn btn-primary" onClick={salvaCorso}>Salva corso</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
