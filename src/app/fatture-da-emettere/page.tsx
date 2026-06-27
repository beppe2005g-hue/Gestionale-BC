'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { logActivity } from '@/lib/logActivity'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface RigaFde {
  descrizione: string
  quantita: string
  unita_misura: string
  prezzo_unitario: string
  importo: string
  importoModificatoManualmente: boolean
}

function nuovaRigaFde(): RigaFde {
  return { descrizione: '', quantita: '', unita_misura: '', prezzo_unitario: '', importo: '', importoModificatoManualmente: false }
}

// ── Specchietto contrattuale inline (non importato da progetti per evitare dipendenze circolari) ──
function SpecchettoContrattuale({ progetto }: { progetto: any }) {
  if (!progetto) return null
  const ha = progetto.modalita_pagamento_contratto || progetto.scadenza_pagamento_contratto || progetto.ritenuta_garanzia_perc || progetto.accettazione_prezzi_riferimento
  if (!ha) return null
  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3 col-span-2">
      <p className="text-xs font-semibold text-blue-800 mb-2">📋 Condizioni contrattuali del cantiere</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div>
          <p className="text-gray-500">Modalità pagamento</p>
          <p className="font-medium text-gray-800">{progetto.modalita_pagamento_contratto || '—'}</p>
        </div>
        <div>
          <p className="text-gray-500">Scadenza contrattuale</p>
          <p className="font-medium text-gray-800">{progetto.scadenza_pagamento_contratto || '—'}</p>
        </div>
        <div>
          <p className="text-gray-500">Ritenuta garanzia</p>
          <p className="font-medium text-gray-800">
            {progetto.ritenuta_garanzia_perc > 0
              ? <span className="text-amber-700 font-semibold">{progetto.ritenuta_garanzia_perc}%</span>
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Accettazione prezzi</p>
          <p className="font-medium text-gray-800 break-words">{progetto.accettazione_prezzi_riferimento || '—'}</p>
        </div>
      </div>
    </div>
  )
}

export default function FattureDaEmetterePage() {
  const [progetti, setProgetti] = useState<any[]>([])
  const [clienti, setClienti] = useState<any[]>([])
  const [fatture, setFatture] = useState<any[]>([])
  const [aliquote, setAliquote] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<'da_emettere' | 'emesse'>('da_emettere')
  const [cercaCliente, setCercaCliente] = useState('')
  const [cercaCantiere, setCercaCantiere] = useState('')
  const [espansaFde, setEspansaFde] = useState<string | null>(null)

  const [modalFde, setModalFde] = useState(false)
  const [loadingFde, setLoadingFde] = useState(false)
  const [fdeInModifica, setFdeInModifica] = useState<any>(null)
  const [progettoSelezionato, setProgettoSelezionato] = useState<any>(null)
  const [filtroSocieta, setFiltroSocieta] = useState<'tutte'|'BC General Service'|'Filosofia'>('tutte')
  const [formFde, setFormFde] = useState<{ progetto_id: string, cliente_id: string, aliquota_id: string, scadenza_prevista: string, note: string, societa: string, righe: RigaFde[] }>({
    progetto_id: '', cliente_id: '', aliquota_id: '', scadenza_prevista: '', note: '', societa: 'BC General Service', righe: [nuovaRigaFde()]
  })

  const [modalEmissione, setModalEmissione] = useState<any>(null)
  const [formEmissione, setFormEmissione] = useState({ numero_fattura_emessa: '', importo_emesso: '', scadenza_emessa: '' })
  const [modalModificaEmessa, setModalModificaEmessa] = useState<any>(null)
  const [formModificaEmessa, setFormModificaEmessa] = useState({ numero_fattura_emessa: '', importo_emesso: '', scadenza_emessa: '' })

  const [modalAliquote, setModalAliquote] = useState(false)
  const [formNuovaAliquota, setFormNuovaAliquota] = useState({ percentuale: '', descrizione: '' })
  const [loadingAliquota, setLoadingAliquota] = useState(false)

  useEffect(() => {
    loadAll()
    window.addEventListener('gestionale:refresh', loadAll)
    return () => window.removeEventListener('gestionale:refresh', loadAll)
  }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: p }, { data: cl }, { data: f }, { data: al }] = await Promise.all([
      supabase.from('progetti').select('id,codice,nome,cliente_id,modalita_pagamento_contratto,scadenza_pagamento_contratto,ritenuta_garanzia_perc,accettazione_prezzi_riferimento').order('codice'),
      supabase.from('clienti').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale'),
      supabase.from('fatture_da_emettere').select('*, fatture_da_emettere_righe(*), progetti(codice,nome,ritenuta_garanzia_perc)').order('created_at', { ascending: false }),
      supabase.from('aliquote_iva').select('*').eq('attiva', true).order('percentuale', { ascending: false }),
    ])
    setProgetti(p || [])
    setClienti(cl || [])
    setFatture(f || [])
    setAliquote(al || [])
    setLoading(false)
  }

  function apriModalFde() {
    const aliquotaDefault = aliquote.find(a => a.percentuale === 22) || aliquote[0]
    setFdeInModifica(null)
    setProgettoSelezionato(null)
    setFormFde({ progetto_id: '', cliente_id: '', aliquota_id: aliquotaDefault?.id || '', scadenza_prevista: '', note: '', societa: 'BC General Service', righe: [nuovaRigaFde()] })
    setModalFde(true)
  }

  function apriModalModificaFde(f: any) {
    setFdeInModifica(f)
    const prj = progetti.find(p => p.id === f.progetto_id)
    setProgettoSelezionato(prj || null)
    const righeEsistenti = (f.fatture_da_emettere_righe || []).map((r: any) => ({
      descrizione: r.descrizione || '', quantita: r.quantita != null ? String(r.quantita) : '',
      unita_misura: r.unita_misura || '', prezzo_unitario: r.prezzo_unitario != null ? String(r.prezzo_unitario) : '',
      importo: String(r.importo ?? ''), importoModificatoManualmente: true,
    }))
    setFormFde({
      progetto_id: f.progetto_id || '', cliente_id: f.cliente_id || '', aliquota_id: f.aliquota_id || '',
      scadenza_prevista: f.scadenza_prevista || '', note: f.note || '',
      societa: f.societa || 'BC General Service',
      righe: righeEsistenti.length > 0 ? righeEsistenti : [nuovaRigaFde()],
    })
    setModalFde(true)
  }

  function onCambiaProgetto(progettoId: string) {
    const prj = progetti.find(p => p.id === progettoId)
    setProgettoSelezionato(prj || null)
    setFormFde(prev => ({ ...prev, progetto_id: progettoId, cliente_id: prj?.cliente_id || prev.cliente_id }))
  }

  function aggiungiRigaFde() {
    setFormFde(prev => ({ ...prev, righe: [...prev.righe, nuovaRigaFde()] }))
  }

  function aggiornaRigaFde(idx: number, campo: keyof RigaFde, valore: string) {
    setFormFde(prev => ({
      ...prev,
      righe: prev.righe.map((r, i) => {
        if (i !== idx) return r
        const n = { ...r, [campo]: valore }
        if (campo === 'importo') n.importoModificatoManualmente = true
        if ((campo === 'quantita' || campo === 'prezzo_unitario') && !n.importoModificatoManualmente) {
          const q = parseFloat(campo === 'quantita' ? valore : r.quantita) || 0
          const p = parseFloat(campo === 'prezzo_unitario' ? valore : r.prezzo_unitario) || 0
          if (q > 0 && p > 0) n.importo = (q * p).toFixed(2)
        }
        return n
      })
    }))
  }

  function rimuoviRigaFde(idx: number) {
    setFormFde(prev => ({ ...prev, righe: prev.righe.filter((_, i) => i !== idx) }))
  }

  const totaleImponibileFde = formFde.righe.reduce((s, r) => s + (parseFloat(r.importo) || 0), 0)
  const aliquotaSelFde = aliquote.find(a => a.id === formFde.aliquota_id)
  // Calcolo ritenuta sul totale imponibile del form corrente
  const ritenutaPerc = progettoSelezionato?.ritenuta_garanzia_perc || 0
  const ritenutaImporto = totaleImponibileFde * ritenutaPerc / 100
  const nettoDaFatturare = totaleImponibileFde - ritenutaImporto

  async function salvaFde() {
    const righeValide = formFde.righe.filter(r => r.descrizione && parseFloat(r.importo) > 0)
    if (righeValide.length === 0) { alert('Inserisci almeno una riga con descrizione e importo'); return }
    if (!formFde.progetto_id) { alert('Seleziona il cantiere'); return }
    if (!formFde.cliente_id) { alert('Seleziona il cliente'); return }
    if (!formFde.aliquota_id) { alert('Seleziona l\'aliquota IVA'); return }
    setLoadingFde(true)
    const prj = progetti.find(p => p.id === formFde.progetto_id)
    const cli = clienti.find(c => c.id === formFde.cliente_id)
    const aliq = aliquote.find(a => a.id === formFde.aliquota_id)

    if (fdeInModifica) {
      const { error } = await supabase.from('fatture_da_emettere').update({
        progetto_id: formFde.progetto_id, cliente_id: formFde.cliente_id,
        cliente_nome: cli?.ragione_sociale || '', aliquota_iva: aliq?.percentuale ?? 22,
        aliquota_id: formFde.aliquota_id, scadenza_prevista: formFde.scadenza_prevista || null,
        note: formFde.note || null, societa: formFde.societa,
      }).eq('id', fdeInModifica.id)
      if (error) { alert('Errore: ' + error.message); setLoadingFde(false); return }
      await supabase.from('fatture_da_emettere_righe').delete().eq('fattura_da_emettere_id', fdeInModifica.id)
      await supabase.from('fatture_da_emettere_righe').insert(
        righeValide.map(r => ({
          fattura_da_emettere_id: fdeInModifica.id, descrizione: r.descrizione,
          importo: parseFloat(r.importo) || 0, quantita: r.quantita ? parseFloat(r.quantita) : null,
          unita_misura: r.unita_misura || null, prezzo_unitario: r.prezzo_unitario ? parseFloat(r.prezzo_unitario) : null,
        }))
      )
      await logActivity('modifica', 'fatture_da_emettere', fdeInModifica.id, `Richiesta fattura modificata — ${prj?.codice} ${prj?.nome} · ${cli?.ragione_sociale} · € ${totaleImponibileFde.toFixed(2)}`)
      setModalFde(false); setFdeInModifica(null); setProgettoSelezionato(null); loadAll(); setLoadingFde(false)
      return
    }

    const { data: inserted, error } = await supabase.from('fatture_da_emettere').insert({
      progetto_id: formFde.progetto_id, cliente_id: formFde.cliente_id,
      cliente_nome: cli?.ragione_sociale || '', aliquota_iva: aliq?.percentuale ?? 22,
      aliquota_id: formFde.aliquota_id, scadenza_prevista: formFde.scadenza_prevista || null,
      stato: 'Da Emettere', note: formFde.note || null, societa: formFde.societa,
    }).select('id').single()
    if (error) { alert('Errore: ' + error.message); setLoadingFde(false); return }
    if (inserted?.id) {
      await supabase.from('fatture_da_emettere_righe').insert(
        righeValide.map(r => ({
          fattura_da_emettere_id: inserted.id, descrizione: r.descrizione,
          importo: parseFloat(r.importo) || 0, quantita: r.quantita ? parseFloat(r.quantita) : null,
          unita_misura: r.unita_misura || null, prezzo_unitario: r.prezzo_unitario ? parseFloat(r.prezzo_unitario) : null,
        }))
      )
      await logActivity('inserimento', 'fatture_da_emettere', inserted.id, `Richiesta fattura — ${prj?.codice} ${prj?.nome} · ${cli?.ragione_sociale} · € ${totaleImponibileFde.toFixed(2)}`)
    }
    setModalFde(false); setProgettoSelezionato(null); loadAll(); setLoadingFde(false)
  }

  function apriModalEmissione(f: any) {
    const imponibile = (f.fatture_da_emettere_righe || []).reduce((s: number, r: any) => s + (r.importo || 0), 0)
    setFormEmissione({ numero_fattura_emessa: '', importo_emesso: String(imponibile), scadenza_emessa: f.scadenza_prevista || '' })
    setModalEmissione(f)
  }

  async function confermaEmissione() {
    if (!modalEmissione) return
    if (!formEmissione.numero_fattura_emessa || !formEmissione.importo_emesso) { alert('Inserisci numero fattura e importo'); return }
    const { error } = await supabase.from('fatture_da_emettere').update({
      stato: 'Emessa', numero_fattura_emessa: formEmissione.numero_fattura_emessa,
      importo_emesso: parseFloat(formEmissione.importo_emesso) || 0,
      scadenza_emessa: formEmissione.scadenza_emessa || null,
    }).eq('id', modalEmissione.id)
    if (error) { alert('Errore: ' + error.message); return }
    await logActivity('modifica', 'fatture_da_emettere', modalEmissione.id, `Fattura emessa ${formEmissione.numero_fattura_emessa} · € ${formEmissione.importo_emesso}`)
    setModalEmissione(null); loadAll()
  }

  async function riapriFde(id: string) {
    if (!confirm('Riportare questa fattura a "Da Emettere"?')) return
    await supabase.from('fatture_da_emettere').update({
      stato: 'Da Emettere', numero_fattura_emessa: null, importo_emesso: null, scadenza_emessa: null
    }).eq('id', id)
    loadAll()
  }

  async function eliminaFde(id: string) {
    if (!confirm('Eliminare questa fattura? L\'operazione non è reversibile.')) return
    await supabase.from('fatture_da_emettere').delete().eq('id', id)
    await logActivity('eliminazione', 'fatture_da_emettere', id, 'Fattura eliminata')
    loadAll()
  }

  function apriModalModificaEmessa(f: any) {
    setFormModificaEmessa({
      numero_fattura_emessa: f.numero_fattura_emessa || '',
      importo_emesso: String(f.importo_emesso ?? ''),
      scadenza_emessa: f.scadenza_emessa || '',
    })
    setModalModificaEmessa(f)
  }

  async function salvaModificaEmessa() {
    if (!modalModificaEmessa) return
    if (!formModificaEmessa.numero_fattura_emessa || !formModificaEmessa.importo_emesso) { alert('Inserisci numero fattura e importo'); return }
    const { error } = await supabase.from('fatture_da_emettere').update({
      numero_fattura_emessa: formModificaEmessa.numero_fattura_emessa,
      importo_emesso: parseFloat(formModificaEmessa.importo_emesso) || 0,
      scadenza_emessa: formModificaEmessa.scadenza_emessa || null,
    }).eq('id', modalModificaEmessa.id)
    if (error) { alert('Errore: ' + error.message); return }
    await logActivity('modifica', 'fatture_da_emettere', modalModificaEmessa.id, `Fattura emessa modificata: ${formModificaEmessa.numero_fattura_emessa} · € ${formModificaEmessa.importo_emesso}`)
    setModalModificaEmessa(null); loadAll()
  }

  async function salvaNuovaAliquota() {
    if (!formNuovaAliquota.percentuale || !formNuovaAliquota.descrizione) { alert('Inserisci percentuale e descrizione'); return }
    setLoadingAliquota(true)
    const { error } = await supabase.from('aliquote_iva').insert({
      percentuale: parseFloat(formNuovaAliquota.percentuale) || 0,
      descrizione: formNuovaAliquota.descrizione, attiva: true,
    })
    if (error) alert('Errore: ' + error.message)
    else { setFormNuovaAliquota({ percentuale: '', descrizione: '' }); loadAll() }
    setLoadingAliquota(false)
  }

  async function disattivaAliquota(id: string) {
    if (!confirm('Disattivare questa aliquota?')) return
    await supabase.from('aliquote_iva').update({ attiva: false }).eq('id', id)
    loadAll()
  }

  const fattureFiltrate = useMemo(() => {
    const filtrate = fatture.filter(f => {
      if (tab === 'da_emettere' && f.stato !== 'Da Emettere') return false
      if (tab === 'emesse' && f.stato !== 'Emessa') return false
      if (filtroSocieta !== 'tutte' && f.societa !== filtroSocieta) return false
      if (cercaCliente && !f.cliente_nome?.toLowerCase().includes(cercaCliente.toLowerCase())) return false
      if (cercaCantiere) {
        const testo = `${f.progetti?.codice || ''} ${f.progetti?.nome || ''}`.toLowerCase()
        if (!testo.includes(cercaCantiere.toLowerCase())) return false
      }
      return true
    })
    return [...filtrate].sort((a, b) => {
      const da = a.created_at || '', db = b.created_at || ''
      return tab === 'da_emettere' ? da.localeCompare(db) : db.localeCompare(da)
    })
  }, [fatture, tab, cercaCliente, cercaCantiere])

  const numDaEmettere = fatture.filter(f => f.stato === 'Da Emettere').length
  const numEmesse = fatture.filter(f => f.stato === 'Emessa').length
  const totaleDaEmettere = fatture.filter(f => f.stato === 'Da Emettere').reduce((s, f) => s + (f.fatture_da_emettere_righe || []).reduce((ss: number, r: any) => ss + (r.importo || 0), 0), 0)
  const totaleEmesso = fatture.filter(f => f.stato === 'Emessa').reduce((s, f) => s + (f.importo_emesso || 0), 0)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Fatture da emettere</h1>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setModalAliquote(true)}>⚙️ Aliquote IVA</button>
            <button className="btn btn-primary text-sm" onClick={apriModalFde}>+ Richiedi fattura</button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <p className="text-xs text-amber-600 mb-1">Da emettere</p>
            <p className="text-xl font-semibold text-amber-800">{numDaEmettere}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <p className="text-xs text-amber-600 mb-1">Imponibile da emettere</p>
            <p className="text-xl font-semibold text-amber-800">{euro(totaleDaEmettere)}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <p className="text-xs text-emerald-600 mb-1">Emesse</p>
            <p className="text-xl font-semibold text-emerald-800">{numEmesse}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <p className="text-xs text-emerald-600 mb-1">Imponibile emesso</p>
            <p className="text-xl font-semibold text-emerald-800">{euro(totaleEmesso)}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('da_emettere')} className={`btn ${tab === 'da_emettere' ? 'btn-primary' : ''}`}>
            🔔 Da emettere ({numDaEmettere})
          </button>
          <button onClick={() => setTab('emesse')} className={`btn ${tab === 'emesse' ? 'btn-primary' : ''}`}>
            ✓ Emesse ({numEmesse})
          </button>
          <div className="flex-1" />
          {/* Filtro società */}
          <div className="flex gap-1 items-center">
            <span className="text-xs text-gray-400 mr-1">Società:</span>
            {(['tutte', 'BC General Service', 'Filosofia'] as const).map(s => (
              <button key={s} onClick={() => setFiltroSocieta(s)}
                className={`btn btn-sm ${filtroSocieta === s ? 'btn-primary' : ''}`}>
                {s === 'tutte' ? 'Tutte' : s}
              </button>
            ))}
          </div>
        </div>

        <div className="card mb-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="label">Cerca cliente</label>
              <input className="input" placeholder="Nome cliente..." value={cercaCliente} onChange={e => setCercaCliente(e.target.value)} />
            </div>
            <div className="flex-1 min-w-48">
              <label className="label">Cerca cantiere</label>
              <input className="input" placeholder="Nome o codice cantiere..." value={cercaCantiere} onChange={e => setCercaCantiere(e.target.value)} />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card text-center py-12 text-gray-400">Caricamento...</div>
        ) : fattureFiltrate.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            {tab === 'da_emettere' ? 'Nessuna fattura da emettere.' : 'Nessuna fattura emessa ancora.'}
          </div>
        ) : (
          <div className="space-y-2">
            {fattureFiltrate.map(f => {
              const imponibile = (f.fatture_da_emettere_righe || []).reduce((s: number, r: any) => s + (r.importo || 0), 0)
              const iva = imponibile * (f.aliquota_iva || 22) / 100
              const ritPerc = f.progetti?.ritenuta_garanzia_perc || 0
              const ritImporto = imponibile * ritPerc / 100
              return (
                <div key={f.id} className="card p-0 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => setEspansaFde(espansaFde === f.id ? null : f.id)}>
                    <div className="flex-1">
                      <span className="font-medium text-sm">{f.cliente_nome}</span>
                      <span className="text-xs text-gray-400 ml-2">{f.progetti?.codice} — {f.progetti?.nome}</span>
                      {f.stato === 'Emessa' && <span className="text-gray-400 text-xs ml-2">{f.numero_fattura_emessa}</span>}
                      {ritPerc > 0 && <span className="text-xs text-amber-600 ml-2">Rit. {ritPerc}%</span>}
                      {f.societa && f.societa !== 'BC General Service' && (
                        <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">{f.societa}</span>
                      )}
                    </div>
                    <span className="text-sm font-semibold">{euro(imponibile)}</span>
                    <span className="text-xs text-gray-400">+IVA {f.aliquota_iva}%: {euro(iva)}</span>
                    {f.stato === 'Emessa'
                      ? <span className="badge badge-green">Emessa</span>
                      : <span className="badge badge-amber">Da Emettere</span>}
                    <span className="text-gray-400 text-sm">{espansaFde === f.id ? '▲' : '▼'}</span>
                  </div>
                  {espansaFde === f.id && (
                    <div className="border-t border-gray-100 bg-gray-50 p-4">
                      <table className="table-base mb-3">
                        <thead><tr><th>Descrizione</th><th>Quantità</th><th>U.M.</th><th>Prezzo unit.</th><th>Importo</th></tr></thead>
                        <tbody>
                          {(f.fatture_da_emettere_righe || []).map((r: any) => (
                            <tr key={r.id}>
                              <td className="text-sm">{r.descrizione}</td>
                              <td className="text-xs text-gray-500">{r.quantita ?? '—'}</td>
                              <td className="text-xs text-gray-500">{r.unita_misura || '—'}</td>
                              <td className="text-xs text-gray-500">{r.prezzo_unitario != null ? euro(r.prezzo_unitario) : '—'}</td>
                              <td className="font-medium text-sm">{euro(r.importo)}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-100">
                            <td colSpan={4} className="text-xs font-medium text-right text-gray-600">Imponibile</td>
                            <td className="font-bold text-sm">{euro(imponibile)}</td>
                          </tr>
                          {ritPerc > 0 && (
                            <tr className="bg-amber-50">
                              <td colSpan={4} className="text-xs font-medium text-right text-amber-700">Ritenuta garanzia {ritPerc}%</td>
                              <td className="font-bold text-sm text-amber-700">- {euro(ritImporto)}</td>
                            </tr>
                          )}
                          {ritPerc > 0 && (
                            <tr className="bg-amber-100">
                              <td colSpan={4} className="text-xs font-bold text-right text-amber-800">Netto da fatturare</td>
                              <td className="font-bold text-sm text-amber-800">{euro(imponibile - ritImporto)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                        <span>Scadenza prevista: {f.scadenza_prevista ? new Date(f.scadenza_prevista).toLocaleDateString('it-IT') : '—'}</span>
                        {f.note && <span>Note: {f.note}</span>}
                      </div>
                      {f.stato === 'Emessa' ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                          <div className="text-sm text-emerald-800">
                            <strong>Fattura {f.numero_fattura_emessa}</strong> · {euro(f.importo_emesso)} · Scadenza: {f.scadenza_emessa ? new Date(f.scadenza_emessa).toLocaleDateString('it-IT') : '—'}
                          </div>
                          <div className="flex gap-2">
                            <button className="btn btn-sm" onClick={() => apriModalModificaEmessa(f)}>✏️ Modifica</button>
                            <button className="btn btn-sm" onClick={() => riapriFde(f.id)}>↺ Riapri</button>
                            <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaFde(f.id)}>✕ Elimina</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaFde(f.id)}>✕ Elimina</button>
                          <button className="btn btn-sm" onClick={() => apriModalModificaFde(f)}>✏️ Modifica</button>
                          <button className="btn btn-success btn-sm" onClick={() => apriModalEmissione(f)}>✓ Segna come emessa</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ── MODAL RICHIEDI FATTURA ── */}
      {modalFde && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">{fdeInModifica ? '✏️ Modifica richiesta fattura' : 'Richiedi emissione fattura'}</h2>
              <button onClick={() => { setModalFde(false); setFdeInModifica(null); setProgettoSelezionato(null) }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="col-span-2">
                <label className="label">Cantiere *</label>
                <select className="input" value={formFde.progetto_id} onChange={e => onCambiaProgetto(e.target.value)}>
                  <option value="">-- seleziona --</option>
                  {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} — {p.nome}</option>)}
                </select>
              </div>

              {/* ── Specchietto contrattuale ── */}
              {progettoSelezionato && <SpecchettoContrattuale progetto={progettoSelezionato} />}

              <div className="col-span-2">
                <label className="label">Società emittente *</label>
                <div className="flex gap-2">
                  {(['BC General Service', 'Filosofia'] as const).map(s => (
                    <button key={s} type="button"
                      onClick={() => setFormFde({...formFde, societa: s})}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${formFde.societa === s ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <label className="label">Cliente *</label>
                <select className="input" value={formFde.cliente_id} onChange={e => setFormFde({...formFde, cliente_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {clienti.map(c => <option key={c.id} value={c.id}>{c.ragione_sociale}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="label">Aliquota IVA *</label>
                  <button type="button" className="text-xs text-blue-600 hover:underline mb-1" onClick={() => setModalAliquote(true)}>+ Gestisci aliquote</button>
                </div>
                <select className="input" value={formFde.aliquota_id} onChange={e => setFormFde({...formFde, aliquota_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {aliquote.map(a => <option key={a.id} value={a.id}>{a.percentuale}% — {a.descrizione}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Scadenza prevista</label>
                <input className="input" type="date" value={formFde.scadenza_prevista} onChange={e => setFormFde({...formFde, scadenza_prevista: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="label">Note</label>
                <input className="input" placeholder="Note opzionali" value={formFde.note} onChange={e => setFormFde({...formFde, note: e.target.value})} />
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Righe — quantità × unità di misura × prezzo unitario (l'importo si calcola da solo, ma puoi sempre correggerlo a mano):</p>
              <div className="overflow-x-auto">
                <table className="table-base" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th>Descrizione</th><th style={{ width: 80 }}>Qtà</th><th style={{ width: 90 }}>U.M.</th>
                      <th style={{ width: 100 }}>€/unit</th><th style={{ width: 100 }}>Importo *</th><th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formFde.righe.map((r, idx) => (
                      <tr key={idx}>
                        <td><input className="input text-sm py-1" placeholder="es. Lavori di fondazione" value={r.descrizione}
                          onChange={e => aggiornaRigaFde(idx, 'descrizione', e.target.value)} /></td>
                        <td><input className="input text-sm py-1" type="number" step="0.01" value={r.quantita}
                          onChange={e => aggiornaRigaFde(idx, 'quantita', e.target.value)} /></td>
                        <td><input className="input text-sm py-1" placeholder="es. mq" value={r.unita_misura}
                          onChange={e => aggiornaRigaFde(idx, 'unita_misura', e.target.value)} /></td>
                        <td><input className="input text-sm py-1" type="number" step="0.01" value={r.prezzo_unitario}
                          onChange={e => aggiornaRigaFde(idx, 'prezzo_unitario', e.target.value)} /></td>
                        <td><input className="input text-sm py-1 font-semibold text-blue-800" type="number" step="0.01" placeholder="0.00" value={r.importo}
                          onChange={e => aggiornaRigaFde(idx, 'importo', e.target.value)} /></td>
                        <td><button onClick={() => rimuoviRigaFde(idx)} disabled={formFde.righe.length === 1}
                          className="text-gray-300 hover:text-red-500 text-sm disabled:opacity-30">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-sm mt-2" onClick={aggiungiRigaFde}>+ Aggiungi riga</button>
            </div>

            {/* ── Riepilogo importi con ritenuta ── */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Imponibile totale
                  {aliquotaSelFde && <span className="text-xs text-gray-400 ml-1">(+IVA {aliquotaSelFde.percentuale}% {aliquotaSelFde.descrizione})</span>}
                </span>
                <span className="text-lg font-bold text-gray-800">{euro(totaleImponibileFde)}</span>
              </div>
              {ritenutaPerc > 0 && (
                <>
                  <div className="flex items-center justify-between text-sm text-amber-700">
                    <span>Ritenuta di garanzia {ritenutaPerc}%</span>
                    <span className="font-semibold">- {euro(ritenutaImporto)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-amber-200">
                    <span className="text-sm font-bold text-amber-800">Netto da fatturare</span>
                    <span className="text-lg font-bold text-amber-800">{euro(nettoDaFatturare)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => { setModalFde(false); setFdeInModifica(null); setProgettoSelezionato(null) }}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaFde} disabled={loadingFde}>
                {loadingFde ? 'Salvataggio...' : (fdeInModifica ? 'Salva modifiche' : 'Salva richiesta')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONFERMA EMISSIONE ── */}
      {modalEmissione && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Segna come emessa</h2>
                <p className="text-xs text-gray-500 mt-0.5">{modalEmissione.cliente_nome}</p>
              </div>
              <button onClick={() => setModalEmissione(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div><label className="label">N° Fattura emessa *</label>
                <input className="input" placeholder="es. FE/2026/012" value={formEmissione.numero_fattura_emessa}
                  onChange={e => setFormEmissione({...formEmissione, numero_fattura_emessa: e.target.value})} /></div>
              <div><label className="label">Importo imponibile (€) *</label>
                <input className="input" type="number" step="0.01" value={formEmissione.importo_emesso}
                  onChange={e => setFormEmissione({...formEmissione, importo_emesso: e.target.value})} /></div>
              <div><label className="label">Scadenza pagamento</label>
                <input className="input" type="date" value={formEmissione.scadenza_emessa}
                  onChange={e => setFormEmissione({...formEmissione, scadenza_emessa: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalEmissione(null)}>Annulla</button>
              <button className="btn btn-success" onClick={confermaEmissione}>Conferma emissione</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL MODIFICA FATTURA EMESSA ── */}
      {modalModificaEmessa && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">✏️ Modifica fattura emessa</h2>
                <p className="text-xs text-gray-500 mt-0.5">{modalModificaEmessa.cliente_nome}</p>
              </div>
              <button onClick={() => setModalModificaEmessa(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div><label className="label">N° Fattura emessa *</label>
                <input className="input" value={formModificaEmessa.numero_fattura_emessa}
                  onChange={e => setFormModificaEmessa({...formModificaEmessa, numero_fattura_emessa: e.target.value})} /></div>
              <div><label className="label">Importo imponibile (€) *</label>
                <input className="input" type="number" step="0.01" value={formModificaEmessa.importo_emesso}
                  onChange={e => setFormModificaEmessa({...formModificaEmessa, importo_emesso: e.target.value})} /></div>
              <div><label className="label">Scadenza pagamento</label>
                <input className="input" type="date" value={formModificaEmessa.scadenza_emessa}
                  onChange={e => setFormModificaEmessa({...formModificaEmessa, scadenza_emessa: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalModificaEmessa(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaModificaEmessa}>Salva modifiche</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL GESTIONE ALIQUOTE IVA ── */}
      {modalAliquote && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Aliquote IVA</h2>
              <button onClick={() => setModalAliquote(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-2 mb-4">
              {aliquote.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nessuna aliquota configurata.</p>
              ) : aliquote.map(a => (
                <div key={a.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                  <div>
                    <span className="font-semibold text-sm">{a.percentuale}%</span>
                    <span className="text-sm text-gray-500 ml-2">{a.descrizione}</span>
                  </div>
                  <button className="text-gray-300 hover:text-red-500 text-sm" onClick={() => disattivaAliquota(a.id)}>✕</button>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Aggiungi nuova aliquota</p>
              <div className="flex gap-2">
                <input className="input w-24" type="number" step="0.01" placeholder="%" value={formNuovaAliquota.percentuale}
                  onChange={e => setFormNuovaAliquota({...formNuovaAliquota, percentuale: e.target.value})} />
                <input className="input flex-1" placeholder="Descrizione (es. Ristrutturazioni)" value={formNuovaAliquota.descrizione}
                  onChange={e => setFormNuovaAliquota({...formNuovaAliquota, descrizione: e.target.value})} />
                <button className="btn btn-primary" onClick={salvaNuovaAliquota} disabled={loadingAliquota}>
                  {loadingAliquota ? '...' : '+ Aggiungi'}
                </button>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button className="btn" onClick={() => setModalAliquote(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
