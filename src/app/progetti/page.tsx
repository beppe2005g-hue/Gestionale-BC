'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + Math.round(n || 0).toLocaleString('it-IT')

const FASI = [
  { key: 'avanzamento_scavi', label: 'Scavi' },
  { key: 'avanzamento_fondazioni', label: 'Fondazioni' },
  { key: 'avanzamento_struttura', label: 'Struttura' },
  { key: 'avanzamento_finiture', label: 'Finiture' },
  { key: 'avanzamento_impianti', label: 'Impianti' },
]

// ── Specchietto contrattuale — visibile nella lista cantieri e nel dettaglio ──
function SpecchettoContrattuale({ progetto, compact = false }: { progetto: any, compact?: boolean }) {
  if (!progetto) return null
  const haContratto = progetto.modalita_pagamento_contratto || progetto.scadenza_pagamento_contratto || progetto.ritenuta_garanzia_perc || progetto.accettazione_prezzi_riferimento
  if (!haContratto) return null
  return (
    <div className={`rounded-xl border-2 border-blue-200 bg-blue-50 ${compact ? 'p-3' : 'p-4'}`}>
      <p className={`font-semibold text-blue-800 mb-2 ${compact ? 'text-xs' : 'text-sm'}`}>📋 Condizioni contrattuali</p>
      <div className={`grid gap-2 ${compact ? 'grid-cols-2 text-xs' : 'grid-cols-2 md:grid-cols-4 text-sm'}`}>
        <div>
          <p className="text-gray-500 text-xs">Modalità pagamento</p>
          <p className="font-medium text-gray-800">{progetto.modalita_pagamento_contratto || '—'}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Scadenza contrattuale</p>
          <p className="font-medium text-gray-800">{progetto.scadenza_pagamento_contratto || '—'}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Ritenuta garanzia</p>
          <p className="font-medium text-gray-800">
            {progetto.ritenuta_garanzia_perc > 0 ? `${progetto.ritenuta_garanzia_perc}%` : '—'}
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Accettazione prezzi</p>
          <p className="font-medium text-gray-800">{progetto.accettazione_prezzi_riferimento || '—'}</p>
        </div>
      </div>
    </div>
  )
}

// ── FormProgetto fuori dal componente principale per evitare re-render ad ogni tasto ──
function FormProgetto({ data, setData, clienti, utenti, isNuovo }: { data: any, setData: any, clienti: any[], utenti: any[], isNuovo?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Codice</label><input className="input bg-gray-50" value={data.codice} readOnly /></div>
        <div><label className="label">Nome cantiere *</label><input className="input" value={data.nome} onChange={e => setData({...data, nome: e.target.value})} /></div>
        <div><label className="label">Cliente / Committente</label>
          <select className="input" value={data.cliente_id} onChange={e => setData({...data, cliente_id: e.target.value})}>
            <option value="">-- seleziona --</option>
            {clienti.map(c => <option key={c.id} value={c.id}>{c.ragione_sociale}</option>)}
          </select>
        </div>
        <div><label className="label">Località cantiere</label><input className="input" placeholder="es. Via Roma 10, Bologna" value={data.localita || ''} onChange={e => setData({...data, localita: e.target.value})} /></div>
        <div><label className="label">Tipo</label>
          <select className="input" value={data.tipo} onChange={e => setData({...data, tipo: e.target.value})}>
            <option>Privato</option><option>Corporate</option><option>Pubblica</option><option>Movimenti Terra</option><option>Gestione Completa</option>
          </select>
        </div>
        <div><label className="label">Stato</label>
          <select className="input" value={data.stato} onChange={e => setData({...data, stato: e.target.value})}>
            <option>Offerta</option><option>In Corso</option><option>Completato</option><option>Sospeso</option><option>Annullato</option>
          </select>
        </div>
        <div><label className="label">Geometra assegnato</label>
          <select className="input" value={data.geometra_id || ''} onChange={e => setData({...data, geometra_id: e.target.value})}>
            <option value="">-- nessuno --</option>
            {utenti.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div><label className="label">Responsabile cantiere</label><input className="input" value={data.responsabile || ''} onChange={e => setData({...data, responsabile: e.target.value})} /></div>
        <div><label className="label">Valore contratto (€)</label><input className="input" type="number" step="0.01" value={data.valore_contratto || ''} onChange={e => setData({...data, valore_contratto: e.target.value})} /></div>
        <div><label className="label">Budget costi (€)</label><input className="input" type="number" step="0.01" value={data.budget_costi || ''} onChange={e => setData({...data, budget_costi: e.target.value})} /></div>
        <div><label className="label">Data inizio</label><input className="input" type="date" value={data.data_inizio || ''} onChange={e => setData({...data, data_inizio: e.target.value})} /></div>
        <div><label className="label">Data fine prevista</label><input className="input" type="date" value={data.data_fine || ''} onChange={e => setData({...data, data_fine: e.target.value})} /></div>
        <div className="col-span-2"><label className="label">Note</label><textarea className="input h-20 resize-none" value={data.note || ''} onChange={e => setData({...data, note: e.target.value})} /></div>
      </div>

      {/* ── Sezione dati contrattuali OBBLIGATORI ── */}
      <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50">
        <p className="text-sm font-semibold text-blue-800 mb-3">
          📋 Dati contrattuali {isNuovo && <span className="text-red-600 ml-1">— obbligatori per creare il cantiere</span>}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Modalità di pagamento *</label>
            <input className="input" placeholder="es. Bonifico 30gg, SAL mensile, Rimessa diretta..."
              value={data.modalita_pagamento_contratto || ''}
              onChange={e => setData({...data, modalita_pagamento_contratto: e.target.value})} />
          </div>
          <div>
            <label className="label">Scadenza pagamento contrattuale *</label>
            <input className="input" placeholder="es. 30 giorni dalla fattura, fine mese..."
              value={data.scadenza_pagamento_contratto || ''}
              onChange={e => setData({...data, scadenza_pagamento_contratto: e.target.value})} />
          </div>
          <div>
            <label className="label">Ritenuta di garanzia % *</label>
            <input className="input" type="number" step="0.01" min="0" max="100"
              placeholder="es. 5 (per 5%)"
              value={data.ritenuta_garanzia_perc ?? ''}
              onChange={e => setData({...data, ritenuta_garanzia_perc: e.target.value})} />
          </div>
          <div>
            <label className="label">Accettazione prezzi — riferimento *</label>
            <input className="input" placeholder="es. Preventivo firmato 12/05/2026 — \\Server\Cantieri\..."
              value={data.accettazione_prezzi_riferimento || ''}
              onChange={e => setData({...data, accettazione_prezzi_riferimento: e.target.value})} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Progetti() {
  const [progetti, setProgetti] = useState<any[]>([])
  const [clienti, setClienti] = useState<any[]>([])
  const [utenti, setUtenti] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [modalDettaglio, setModalDettaglio] = useState<any>(null)
  const [modalModifica, setModalModifica] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<any[]>([])
  const [nuovaNota, setNuovaNota] = useState('')
  const [erroreCaricamento, setErroreCaricamento] = useState('')
  const [utenteCorrente, setUtenteCorrente] = useState<any>(null) // per controllo permesso archivia

  const [cercaNome, setCercaNome] = useState('')
  const [cercaCliente, setCercaCliente] = useState('')
  const [cercaLocalita, setCercaLocalita] = useState('')
  const [filtroStato, setFiltroStato] = useState('attivi')
  const [filtroArchivio, setFiltroArchivio] = useState(false) // mostra archiviati invece degli attivi
  const [importoDA, setImportoDA] = useState('')
  const [importoA, setImportoA] = useState('')
  const [raggruppaPer, setRaggruppaPer] = useState<'committente' | 'nessuno'>('nessuno')

  const [form, setForm] = useState({
    codice: '', nome: '', cliente_id: '', tipo: 'Privato', responsabile: '',
    valore_contratto: '', budget_costi: '', data_inizio: '', data_fine: '',
    stato: 'In Corso', note: '', geometra_id: '', localita: '',
    modalita_pagamento_contratto: '', scadenza_pagamento_contratto: '',
    ritenuta_garanzia_perc: '', accettazione_prezzi_riferimento: ''
  })

  useEffect(() => {
    loadAll()
    window.addEventListener('gestionale:refresh', loadAll)
    return () => window.removeEventListener('gestionale:refresh', loadAll)
  }, [filtroArchivio])

  async function loadAll() {
    setErroreCaricamento('')
    // Carica utente corrente per controllo permesso archivia
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profilo } = await supabase.from('utenti').select('ruolo,perm_archivia_progetti').eq('id', user.id).single()
      setUtenteCorrente(profilo)
    }
    const query = supabase.from('progetti').select('*').order('codice', { ascending: false })
    // Mostra archiviati o attivi in base al filtro
    const { data: p, error: errP } = filtroArchivio
      ? await query.eq('archiviato', true)
      : await query.or('archiviato.is.null,archiviato.eq.false')
    if (errP) {
      setErroreCaricamento(errP.message || 'Errore nel caricamento dei progetti')
      setProgetti([]); return
    }
    const [{ data: c }, { data: u }] = await Promise.all([
      supabase.from('clienti').select('id,ragione_sociale').eq('attivo', true),
      supabase.from('utenti').select('id,nome,ruolo,capo_geometra'),
    ])
    const [{ data: sal }, { data: ddt }, { data: fde }, { data: costiManuali }] = await Promise.all([
      supabase.from('sal_cantiere').select('progetto_id,importo_lavori'),
      supabase.from('ddt').select('progetto_id,importo,stato'),
      supabase.from('fatture_da_emettere').select('progetto_id,stato,importo_emesso'),
      supabase.from('costi_cantiere').select('progetto_id,importo'),
    ])
    const enhanced = (p || []).map(proj => {
      const ric = (sal || []).filter(s => s.progetto_id === proj.id).reduce((s, x) => s + (x.importo_lavori || 0), 0)
      const fatturato = (fde || []).filter(f => f.progetto_id === proj.id && f.stato === 'Emessa').reduce((s, f) => s + (f.importo_emesso || 0), 0)
      // Costi = DDT/Bolle + costi manuali geometra.
      // Fatture fornitori ESCLUSE: servono solo per scadenzario/pagamenti.
      // Includerle causerebbe doppio conteggio con i DDT (la bolla precede sempre la fattura).
      const cosDDT = (ddt || []).filter(d => d.progetto_id === proj.id).reduce((s, d) => s + (d.importo || 0), 0)
      const cosManuali = (costiManuali || []).filter(c => c.progetto_id === proj.id).reduce((s, c) => s + (c.importo || 0), 0)
      const cos = cosDDT + cosManuali
      const margPerc = ric > 0 ? Math.round((ric - cos) / ric * 100) : 0
      const budgetPerc = proj.budget_costi > 0 ? Math.round(cos / proj.budget_costi * 100) : 0
      const avanzamentoMedio = Math.round(FASI.reduce((s, f) => s + (proj[f.key] || 0), 0) / FASI.length)
      const scostamentoFatturazione = ric - fatturato
      const percFatturatoSuSal = ric > 0 ? Math.round(fatturato / ric * 100) : 0
      return { ...proj, ricavi: ric, fatturato, costi: cos, marg_perc: margPerc, budget_perc: budgetPerc, avanzamento_medio: avanzamentoMedio, scostamento_fatturazione: scostamentoFatturazione, perc_fatturato_su_sal: percFatturatoSuSal }
    })
    setProgetti(enhanced)
    setClienti(c || [])
    setUtenti(u || [])
  }

  async function apriDettaglio(proj: any) {
    setModalDettaglio(proj)
    const { data: n } = await supabase.from('note_cantiere')
      .select('*').eq('progetto_id', proj.id).order('created_at', { ascending: false })
    setNote(n || [])
  }

  async function salvaAvanzamento(projId: string, campo: string, valore: number) {
    await supabase.from('progetti').update({ [campo]: valore }).eq('id', projId)
    setProgetti(prev => prev.map(p => p.id === projId ? { ...p, [campo]: valore } : p))
    if (modalDettaglio?.id === projId) setModalDettaglio((prev: any) => ({ ...prev, [campo]: valore }))
  }

  async function salvaNota() {
    if (!nuovaNota.trim() || !modalDettaglio) return
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profilo } = await supabase.from('utenti').select('nome').eq('id', user?.id).single()
    await supabase.from('note_cantiere').insert({
      progetto_id: modalDettaglio.id, autore_id: user?.id,
      autore_nome: profilo?.nome || user?.email, testo: nuovaNota.trim(),
      data: new Date().toISOString().split('T')[0]
    })
    setNuovaNota('')
    const { data: n } = await supabase.from('note_cantiere')
      .select('*').eq('progetto_id', modalDettaglio.id).order('created_at', { ascending: false })
    setNote(n || [])
  }

  async function eliminaNota(id: string) {
    if (!confirm('Eliminare questa nota?')) return
    await supabase.from('note_cantiere').delete().eq('id', id)
    setNote(prev => prev.filter(n => n.id !== id))
  }

  // ── Archiviazione cantiere ──
  // Può archiviare: admin (ruolo) oppure utente con perm_archivia_progetti abilitato
  const puoArchiviare = utenteCorrente?.ruolo === 'admin' || !!utenteCorrente?.perm_archivia_progetti

  async function archiviaProjetto(proj: any) {
    const azione = proj.archiviato ? 'ripristinare' : 'archiviare'
    if (!confirm(`${azione.charAt(0).toUpperCase() + azione.slice(1)} il cantiere "${proj.nome}"?\n\nI dati (costi, DDT, SAL, fatture) restano nel database.`)) return
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profilo } = await supabase.from('utenti').select('nome').eq('id', user?.id || '').single()
    await supabase.from('progetti').update({
      archiviato: !proj.archiviato,
      archiviato_il: proj.archiviato ? null : new Date().toISOString(),
      archiviato_da: proj.archiviato ? null : (profilo?.nome || user?.email || 'Sconosciuto'),
    }).eq('id', proj.id)
    setModalDettaglio(null)
    loadAll()
  }

  async function generaCodice() {
    const annoCorrente = new Date().getFullYear() % 100
    const prefisso = `${String(annoCorrente).padStart(2, '0')}PJ`
    const { data } = await supabase.from('progetti').select('codice')
      .ilike('codice', `${prefisso}%`).order('codice', { ascending: false }).limit(1)
    const last = data?.[0]?.codice
    let prossimoNumero = 1
    if (last) {
      const numeroPart = last.replace(prefisso, '').replace(/\D/g, '')
      const parsed = parseInt(numeroPart)
      if (!isNaN(parsed)) prossimoNumero = parsed + 1
    }
    return prefisso + String(prossimoNumero).padStart(3, '0')
  }

  async function apriModal() {
    const codice = await generaCodice()
    setForm({
      codice, nome: '', cliente_id: '', tipo: 'Privato', responsabile: '',
      valore_contratto: '', budget_costi: '', data_inizio: '', data_fine: '',
      stato: 'In Corso', note: '', geometra_id: '', localita: '',
      modalita_pagamento_contratto: '', scadenza_pagamento_contratto: '',
      ritenuta_garanzia_perc: '', accettazione_prezzi_riferimento: ''
    })
    setModal(true)
  }

  async function salva() {
    if (!form.nome || !form.codice) { alert('Inserisci almeno codice e nome cantiere'); return }
    // ── Validazione campi contrattuali obbligatori ──
    if (!form.modalita_pagamento_contratto?.trim()) { alert('⚠️ Inserisci la modalità di pagamento contrattuale'); return }
    if (!form.scadenza_pagamento_contratto?.trim()) { alert('⚠️ Inserisci la scadenza di pagamento contrattuale'); return }
    if (form.ritenuta_garanzia_perc === '' || form.ritenuta_garanzia_perc === null) { alert('⚠️ Inserisci la percentuale di ritenuta di garanzia (metti 0 se non prevista)'); return }
    if (!form.accettazione_prezzi_riferimento?.trim()) { alert('⚠️ Inserisci il riferimento per l\'accettazione prezzi'); return }
    setLoading(true)
    const cli = clienti.find(c => c.id === form.cliente_id)
    const geo = utenti.find(u => u.id === form.geometra_id)
    await supabase.from('progetti').insert({
      codice: form.codice, nome: form.nome,
      cliente_id: form.cliente_id || null, cliente_nome: cli?.ragione_sociale || '',
      tipo: form.tipo, responsabile: form.responsabile,
      valore_contratto: parseFloat(form.valore_contratto) || 0,
      budget_costi: parseFloat(form.budget_costi) || 0,
      data_inizio: form.data_inizio || null, data_fine: form.data_fine || null,
      stato: form.stato, note: form.note,
      geometra_id: form.geometra_id || null, geometra_nome: geo?.nome || '',
      localita: form.localita || '',
      modalita_pagamento_contratto: form.modalita_pagamento_contratto,
      scadenza_pagamento_contratto: form.scadenza_pagamento_contratto,
      ritenuta_garanzia_perc: parseFloat(String(form.ritenuta_garanzia_perc)) || 0,
      accettazione_prezzi_riferimento: form.accettazione_prezzi_riferimento,
    })
    setModal(false); setLoading(false); loadAll()
  }

  async function salvaModifica() {
    if (!modalModifica) return
    setLoading(true)
    const cli = clienti.find(c => c.id === modalModifica.cliente_id)
    const geo = utenti.find(u => u.id === modalModifica.geometra_id)
    await supabase.from('progetti').update({
      nome: modalModifica.nome, cliente_id: modalModifica.cliente_id || null,
      cliente_nome: cli?.ragione_sociale || modalModifica.cliente_nome,
      tipo: modalModifica.tipo, responsabile: modalModifica.responsabile,
      valore_contratto: parseFloat(modalModifica.valore_contratto) || 0,
      budget_costi: parseFloat(modalModifica.budget_costi) || 0,
      data_inizio: modalModifica.data_inizio || null, data_fine: modalModifica.data_fine || null,
      stato: modalModifica.stato, note: modalModifica.note,
      geometra_id: modalModifica.geometra_id || null,
      geometra_nome: geo?.nome || modalModifica.geometra_nome,
      localita: modalModifica.localita || '',
      modalita_pagamento_contratto: modalModifica.modalita_pagamento_contratto || null,
      scadenza_pagamento_contratto: modalModifica.scadenza_pagamento_contratto || null,
      ritenuta_garanzia_perc: parseFloat(modalModifica.ritenuta_garanzia_perc) || 0,
      accettazione_prezzi_riferimento: modalModifica.accettazione_prezzi_riferimento || null,
    }).eq('id', modalModifica.id)
    setModalModifica(null); setLoading(false); loadAll()
  }

  const progettiFiltered = useMemo(() => {
    return progetti.filter(p => {
      if (filtroStato === 'attivi' && !['In Corso', 'Offerta'].includes(p.stato)) return false
      if (filtroStato === 'inattivi' && ['In Corso', 'Offerta'].includes(p.stato)) return false
      if (filtroStato !== 'attivi' && filtroStato !== 'inattivi' && filtroStato !== 'tutti' && p.stato !== filtroStato) return false
      if (cercaNome && !p.nome?.toLowerCase().includes(cercaNome.toLowerCase()) && !p.codice?.toLowerCase().includes(cercaNome.toLowerCase())) return false
      if (cercaCliente && !p.cliente_nome?.toLowerCase().includes(cercaCliente.toLowerCase())) return false
      if (cercaLocalita && !p.localita?.toLowerCase().includes(cercaLocalita.toLowerCase())) return false
      if (importoDA && (p.valore_contratto || 0) < parseFloat(importoDA)) return false
      if (importoA && (p.valore_contratto || 0) > parseFloat(importoA)) return false
      return true
    })
  }, [progetti, filtroStato, cercaNome, cercaCliente, cercaLocalita, importoDA, importoA])

  const progettiGruppi = useMemo(() => {
    if (raggruppaPer === 'nessuno') return { '': progettiFiltered }
    const gruppi: Record<string, any[]> = {}
    progettiFiltered.forEach(p => {
      const key = p.cliente_nome || 'Senza committente'
      if (!gruppi[key]) gruppi[key] = []
      gruppi[key].push(p)
    })
    return gruppi
  }, [progettiFiltered, raggruppaPer])

  const haFiltri = cercaNome || cercaCliente || cercaLocalita || importoDA || importoA || filtroStato !== 'attivi'

  function resetFiltri() {
    setCercaNome(''); setCercaCliente(''); setCercaLocalita('')
    setImportoDA(''); setImportoA(''); setFiltroStato('attivi')
  }

  const statoBadge = (s: string) => {
    if (s === 'Completato') return <span className="badge badge-green">Completato</span>
    if (s === 'Sospeso') return <span className="badge badge-red">Sospeso</span>
    if (s === 'Offerta') return <span className="badge badge-gray">Offerta</span>
    if (s === 'Annullato') return <span className="badge badge-red">Annullato</span>
    return <span className="badge badge-blue">In Corso</span>
  }

  const budgetColore = (perc: number) => perc >= 100 ? 'bg-red-500' : perc >= 80 ? 'bg-amber-500' : 'bg-blue-600'

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Progetti / Cantieri</h1>
          <div className="flex gap-2">
            {puoArchiviare && (
              <button className={`btn btn-sm ${filtroArchivio ? 'btn-primary' : ''}`}
                onClick={() => setFiltroArchivio(!filtroArchivio)}>
                {filtroArchivio ? '📦 Archiviati' : '📦 Vedi archiviati'}
              </button>
            )}
            <button className="btn btn-primary text-sm" onClick={apriModal}>+ Nuovo progetto</button>
          </div>
        </div>

        {erroreCaricamento && (
          <div className="card mb-4 bg-red-50 border-red-200">
            <p className="text-sm text-red-700 font-medium">⚠️ Errore nel caricamento dei progetti</p>
            <p className="text-xs text-red-600 mt-1">{erroreCaricamento}</p>
            <button className="btn btn-sm mt-2" onClick={loadAll}>Riprova</button>
          </div>
        )}

        <div className="card mb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div><label className="label">Cerca cantiere</label><input className="input" placeholder="Nome o codice..." value={cercaNome} onChange={e => setCercaNome(e.target.value)} /></div>
            <div><label className="label">Committente</label><input className="input" placeholder="Nome cliente..." value={cercaCliente} onChange={e => setCercaCliente(e.target.value)} /></div>
            <div><label className="label">Località</label><input className="input" placeholder="Città o indirizzo..." value={cercaLocalita} onChange={e => setCercaLocalita(e.target.value)} /></div>
            <div><label className="label">Stato</label>
              <select className="input" value={filtroStato} onChange={e => setFiltroStato(e.target.value)}>
                <option value="attivi">Attivi (In Corso + Offerta)</option>
                <option value="inattivi">Inattivi (Completati + Sospesi)</option>
                <option value="tutti">Tutti</option>
                <option value="In Corso">In Corso</option>
                <option value="Offerta">Offerta</option>
                <option value="Completato">Completati</option>
                <option value="Sospeso">Sospesi</option>
                <option value="Annullato">Annullati</option>
              </select>
            </div>
            <div><label className="label">Importo da (€)</label><input className="input" type="number" placeholder="0" value={importoDA} onChange={e => setImportoDA(e.target.value)} /></div>
            <div><label className="label">Importo a (€)</label><input className="input" type="number" placeholder="∞" value={importoA} onChange={e => setImportoA(e.target.value)} /></div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">{progettiFiltered.length} cantieri</span>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={raggruppaPer === 'committente'}
                  onChange={e => setRaggruppaPer(e.target.checked ? 'committente' : 'nessuno')} className="rounded" />
                Raggruppa per committente
              </label>
            </div>
            {haFiltri && <button onClick={resetFiltri} className="text-xs text-blue-600 hover:underline">× Azzera filtri</button>}
          </div>
        </div>

        {progettiFiltered.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            {haFiltri ? 'Nessun cantiere corrisponde ai filtri.' : 'Nessun progetto. Crea il primo cantiere.'}
          </div>
        ) : (
          Object.entries(progettiGruppi).map(([gruppo, items]) => (
            <div key={gruppo}>
              {raggruppaPer === 'committente' && (
                <div className="flex items-center gap-3 mb-3 mt-4 first:mt-0">
                  <h2 className="text-sm font-semibold text-gray-700">👤 {gruppo}</h2>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">{(items as any[]).length} cantieri</span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 mb-2">
                {(items as any[]).map(p => (
                  <div key={p.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={() => apriDettaglio(p)}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{p.codice}</span>
                          {statoBadge(p.stato)}
                          <span className="badge badge-gray">{p.tipo}</span>
                          {p.localita && <span className="text-xs text-gray-400">📍 {p.localita}</span>}
                          {/* Badge se mancano dati contrattuali */}
                          {!p.modalita_pagamento_contratto && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">⚠️ Dati contrattuali mancanti</span>}
                        </div>
                        <h3 className="font-semibold text-base">{p.nome}</h3>
                        <p className="text-sm text-gray-500">{p.cliente_nome || '—'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">Contratto</p>
                        <p className="font-semibold text-sm">{euro(p.valore_contratto)}</p>
                        {p.ritenuta_garanzia_perc > 0 && <p className="text-xs text-amber-600 mt-0.5">Rit. {p.ritenuta_garanzia_perc}%</p>}
                        {p.geometra_nome && <p className="text-xs text-gray-400 mt-1">👷 {p.geometra_nome}</p>}
                      </div>
                    </div>

                    {/* Specchietto contrattuale in lista (compatto) */}
                    {p.modalita_pagamento_contratto && (
                      <div className="mb-3">
                        <SpecchettoContrattuale progetto={p} compact={true} />
                      </div>
                    )}

                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">Avanzamento lavori</span>
                        <span className="font-medium">{p.avanzamento_medio}%</span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${p.avanzamento_medio}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-3 mb-3">
                      <div className="bg-teal-50 rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-400">Ricavi (SAL)</p>
                        <p className="text-sm font-medium text-teal-700">{euro(p.ricavi)}</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-400">Fatturato</p>
                        <p className="text-sm font-medium text-emerald-700">{euro(p.fatturato)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-400">Costi</p>
                        <p className="text-sm font-medium text-red-700">{euro(p.costi)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-400">Margine (su SAL)</p>
                        <p className={`text-sm font-medium ${p.marg_perc >= 15 ? 'text-green-700' : p.marg_perc >= 8 ? 'text-amber-700' : 'text-red-700'}`}>{p.marg_perc}%</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-400">% Fatturato su SAL</p>
                        <p className={`text-sm font-medium ${p.perc_fatturato_su_sal >= 90 ? 'text-green-700' : p.perc_fatturato_su_sal >= 60 ? 'text-amber-700' : 'text-red-700'}`}>
                          {p.ricavi > 0 ? `${p.perc_fatturato_su_sal}%` : '—'}
                        </p>
                      </div>
                    </div>
                    {Math.abs(p.scostamento_fatturazione) > 0.02 && p.ricavi > 0 && (
                      <div className={`rounded-lg px-3 py-1.5 mb-3 text-xs font-medium ${p.scostamento_fatturazione > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
                        {p.scostamento_fatturazione > 0
                          ? `🟡 A rilento con la fatturazione: ${euro(p.scostamento_fatturazione)} ancora da fatturare rispetto al lavoro maturato`
                          : `${euro(Math.abs(p.scostamento_fatturazione))} fatturati oltre il SAL maturato`}
                      </div>
                    )}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Utilizzo budget</span>
                        <span className={p.budget_perc >= 100 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                          {euro(p.costi)} / {euro(p.budget_costi)} ({p.budget_perc}%)
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${budgetColore(p.budget_perc)}`} style={{ width: `${Math.min(p.budget_perc, 100)}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      {puoArchiviare && !p.archiviato && (
                        <button className="btn btn-sm text-amber-600 border-amber-200 hover:bg-amber-50"
                          onClick={e => { e.stopPropagation(); archiviaProjetto(p) }}>📦 Archivia</button>
                      )}
                      {puoArchiviare && p.archiviato && (
                        <button className="btn btn-sm text-green-600 border-green-200 hover:bg-green-50"
                          onClick={e => { e.stopPropagation(); archiviaProjetto(p) }}>↺ Ripristina</button>
                      )}
                      <button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={e => { e.stopPropagation(); setModalModifica({...p}) }}>✏️ Modifica</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      {/* Modal nuovo progetto */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuovo progetto</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <FormProgetto data={form} setData={setForm} clienti={clienti} utenti={utenti} isNuovo={true} />
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={loading}>{loading ? 'Salvataggio...' : 'Crea progetto'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal modifica */}
      {modalModifica && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Modifica progetto</h2>
                <p className="text-xs text-gray-500 mt-0.5">{modalModifica.codice} — {modalModifica.nome}</p>
              </div>
              <button onClick={() => setModalModifica(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <FormProgetto data={modalModifica} setData={setModalModifica} clienti={clienti} utenti={utenti} />
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalModifica(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaModifica} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva modifiche'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal dettaglio */}
      {modalDettaglio && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gray-900 rounded-t-xl p-5 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded">{modalDettaglio.codice}</span>
                    <span className="text-xs text-gray-300">{modalDettaglio.tipo}</span>
                    {modalDettaglio.localita && <span className="text-xs text-gray-300">📍 {modalDettaglio.localita}</span>}
                  </div>
                  <h2 className="text-xl font-semibold">{modalDettaglio.nome}</h2>
                  <p className="text-gray-300 text-sm mt-0.5">{modalDettaglio.cliente_nome || '—'}</p>
                </div>
                <button onClick={() => setModalDettaglio(null)} className="text-gray-400 hover:text-white text-2xl">×</button>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="bg-white/10 rounded-lg p-3"><p className="text-xs text-gray-400">Contratto</p><p className="font-semibold">{euro(modalDettaglio.valore_contratto)}</p></div>
                <div className="bg-white/10 rounded-lg p-3"><p className="text-xs text-gray-400">Budget costi</p><p className="font-semibold">{euro(modalDettaglio.budget_costi)}</p></div>
                <div className="bg-white/10 rounded-lg p-3"><p className="text-xs text-gray-400">Geometra</p><p className="font-semibold">{modalDettaglio.geometra_nome || '—'}</p></div>
              </div>
            </div>
            <div className="p-5 space-y-5">

              {/* ── Specchietto contrattuale ben visibile in cima al dettaglio ── */}
              <SpecchettoContrattuale progetto={modalDettaglio} />

              <div className="card">
                <h3 className="font-medium text-sm mb-4">📊 Avanzamento per fase</h3>
                <div className="space-y-4">
                  {FASI.map(f => (
                    <div key={f.key}>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm text-gray-600 w-24 flex-shrink-0">{f.label}</span>
                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${modalDettaglio[f.key] || 0}%`, background: (modalDettaglio[f.key] || 0) >= 80 ? '#3B6D11' : '#185FA5' }} />
                        </div>
                        <span className="text-sm font-medium w-10 text-right">{modalDettaglio[f.key] || 0}%</span>
                        <input type="range" min="0" max="100" step="5"
                          value={modalDettaglio[f.key] || 0}
                          onChange={e => salvaAvanzamento(modalDettaglio.id, f.key, parseInt(e.target.value))}
                          className="w-24 accent-blue-600" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Avanzamento medio complessivo</span>
                    <span className="font-semibold text-gray-700">{Math.round(FASI.reduce((s, f) => s + (modalDettaglio[f.key] || 0), 0) / FASI.length)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.round(FASI.reduce((s, f) => s + (modalDettaglio[f.key] || 0), 0) / FASI.length)}%` }} />
                  </div>
                </div>
              </div>
              <div className="card">
                <h3 className="font-medium text-sm mb-3">💰 Situazione finanziaria</h3>
                <div className="grid grid-cols-5 gap-3">
                  <div className="bg-teal-50 rounded-lg p-3"><p className="text-xs text-gray-500">Ricavi (SAL maturati)</p><p className="font-semibold text-teal-700">{euro(modalDettaglio.ricavi)}</p></div>
                  <div className="bg-emerald-50 rounded-lg p-3"><p className="text-xs text-gray-500">Fatturato</p><p className="font-semibold text-emerald-700">{euro(modalDettaglio.fatturato)}</p></div>
                  <div className="bg-red-50 rounded-lg p-3"><p className="text-xs text-gray-500">Costi sostenuti</p><p className="font-semibold text-red-700">{euro(modalDettaglio.costi)}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">Margine (su SAL)</p>
                    <p className={`font-semibold ${modalDettaglio.marg_perc >= 15 ? 'text-green-700' : modalDettaglio.marg_perc >= 8 ? 'text-amber-700' : 'text-red-700'}`}>{modalDettaglio.marg_perc}%</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">% Fatturato su SAL</p>
                    <p className={`font-semibold ${modalDettaglio.perc_fatturato_su_sal >= 90 ? 'text-green-700' : modalDettaglio.perc_fatturato_su_sal >= 60 ? 'text-amber-700' : 'text-red-700'}`}>
                      {modalDettaglio.ricavi > 0 ? `${modalDettaglio.perc_fatturato_su_sal}%` : '—'}
                    </p>
                  </div>
                </div>
                {Math.abs(modalDettaglio.scostamento_fatturazione) > 0.02 && modalDettaglio.ricavi > 0 && (
                  <div className={`rounded-lg px-3 py-2 mt-3 text-xs font-medium ${modalDettaglio.scostamento_fatturazione > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
                    {modalDettaglio.scostamento_fatturazione > 0
                      ? `🟡 A rilento con la fatturazione: ${euro(modalDettaglio.scostamento_fatturazione)} ancora da fatturare rispetto al SAL maturato`
                      : `${euro(Math.abs(modalDettaglio.scostamento_fatturazione))} fatturati oltre il SAL maturato`}
                  </div>
                )}
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Utilizzo budget ({modalDettaglio.budget_perc}%)</span>
                    <span className={modalDettaglio.budget_perc >= 100 ? 'text-red-600 font-medium' : 'text-gray-500'}>{euro(modalDettaglio.costi)} / {euro(modalDettaglio.budget_costi)}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${modalDettaglio.budget_perc >= 100 ? 'bg-red-500' : modalDettaglio.budget_perc >= 80 ? 'bg-amber-500' : 'bg-blue-600'}`}
                      style={{ width: `${Math.min(modalDettaglio.budget_perc, 100)}%` }} />
                  </div>
                  {modalDettaglio.budget_perc >= 80 && (
                    <p className={`text-xs mt-1 font-medium ${modalDettaglio.budget_perc >= 100 ? 'text-red-600' : 'text-amber-600'}`}>
                      {modalDettaglio.budget_perc >= 100 ? '🔴 Budget superato!' : '🟡 Attenzione: budget quasi esaurito'}
                    </p>
                  )}
                </div>
              </div>
              <div className="card">
                <h3 className="font-medium text-sm mb-3">📝 Diario di cantiere</h3>
                <div className="flex gap-2 mb-4">
                  <textarea className="input flex-1 resize-none h-16 text-sm" placeholder="Inserisci una nota di cantiere..."
                    value={nuovaNota} onChange={e => setNuovaNota(e.target.value)} />
                  <button className="btn btn-primary self-end" onClick={salvaNota}>Aggiungi</button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {note.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Nessuna nota ancora.</p>
                  ) : note.map(n => (
                    <div key={n.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-700 flex-1">{n.testo}</p>
                        <button onClick={() => eliminaNota(n.id)} className="text-gray-300 hover:text-red-500 text-sm flex-shrink-0">✕</button>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs text-gray-400">{new Date(n.data).toLocaleDateString('it-IT')}</span>
                        <span className="text-xs text-blue-600">· {n.autore_nome}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {modalDettaglio.note && (
                <div className="card bg-amber-50 border-amber-200">
                  <h3 className="font-medium text-sm mb-2">📌 Note progetto</h3>
                  <p className="text-sm text-gray-700">{modalDettaglio.note}</p>
                </div>
              )}

              {/* Archiviazione dal dettaglio */}
              {puoArchiviare && (
                <div className="flex justify-end pt-2 border-t border-gray-100">
                  {modalDettaglio.archiviato ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        Archiviato il {modalDettaglio.archiviato_il ? new Date(modalDettaglio.archiviato_il).toLocaleDateString('it-IT') : '—'}
                        {modalDettaglio.archiviato_da && ` da ${modalDettaglio.archiviato_da}`}
                      </span>
                      <button className="btn btn-sm text-green-600 border-green-200 hover:bg-green-50"
                        onClick={() => archiviaProjetto(modalDettaglio)}>↺ Ripristina cantiere</button>
                    </div>
                  ) : (
                    <button className="btn btn-sm text-amber-600 border-amber-200 hover:bg-amber-50"
                      onClick={() => archiviaProjetto(modalDettaglio)}>📦 Archivia cantiere</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
