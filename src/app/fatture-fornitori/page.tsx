'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function confrontaNumeriFattura(a: string, b: string): number {
  const splitA = (a || '').match(/\d+|\D+/g) || []
  const splitB = (b || '').match(/\d+|\D+/g) || []
  const len = Math.max(splitA.length, splitB.length)
  for (let i = 0; i < len; i++) {
    const partA = splitA[i] || '', partB = splitB[i] || ''
    const numA = parseInt(partA), numB = parseInt(partB)
    if (!isNaN(numA) && !isNaN(numB)) { if (numA !== numB) return numA - numB }
    else { const cmp = partA.localeCompare(partB); if (cmp !== 0) return cmp }
  }
  return 0
}

export default function FattureClienti() {
  const [fatture, setFatture] = useState<any[]>([])
  const [clienti, setClienti] = useState<any[]>([])
  const [progetti, setProgetti] = useState<any[]>([])
  const [pagamenti, setPagamenti] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [modalModifica, setModalModifica] = useState<any>(null)
  const [modalDettaglio, setModalDettaglio] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [filtroTipo, setFiltroTipo] = useState('tutti')
  const [ordinamento, setOrdinamento] = useState<'numero' | 'data'>('numero')
  const [cercaTesto, setCercaTesto] = useState('')
  const [formPagamento, setFormPagamento] = useState({ rata: 1, importo: '', data_pagamento: '', note: '' })
  const [loadingPagamento, setLoadingPagamento] = useState(false)

  const [form, setForm] = useState({
    data: '', numero: '', cliente_id: '', progetto_id: '', descrizione: '',
    imponibile: '', iva_percentuale: '0', tipo: 'Fattura', fattura_collegata_id: '',
    r1i: '', r1s: '', r2i: '', r2s: '', r3i: '', r3s: '', note: ''
  })

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    load()
    window.addEventListener('gestionale:refresh', load)
    return () => window.removeEventListener('gestionale:refresh', load)
  }, [])

  async function load() {
    const [{ data: f }, { data: c }, { data: p }, { data: pag }] = await Promise.all([
      supabase.from('fatture_clienti').select('*'),
      supabase.from('clienti').select('id,ragione_sociale').eq('attivo', true),
      supabase.from('progetti').select('id,codice,nome'),
      supabase.from('pagamenti_clienti').select('*').order('data_pagamento', { ascending: false }),
    ])
    setFatture(f || [])
    setClienti(c || [])
    setProgetti(p || [])
    setPagamenti(pag || [])
  }

  // Calcola il totale fattura (imponibile + IVA)
  function totalefattura(f: any): number {
    return (f.imponibile || 0) * (1 + (f.iva_percentuale || 0) / 100)
  }

  function pagatoSuRata(fatturaId: string, rata: number): number {
    return pagamenti.filter(p => p.fattura_id === fatturaId && p.rata === rata).reduce((s, p) => s + (p.importo || 0), 0)
  }

  function statoRata(fatturaId: string, rata: number, importoRata: number): 'vuota' | 'da_incassare' | 'parziale' | 'incassata' {
    if (!importoRata || importoRata <= 0) return 'vuota'
    const pagato = pagatoSuRata(fatturaId, rata)
    if (pagato <= 0) return 'da_incassare'
    if (pagato >= importoRata - 0.01) return 'incassata'
    return 'parziale'
  }

  function fatturaSaldata(f: any): boolean {
    for (const n of [1, 2, 3]) {
      const imp = f[`rata${n}_importo`] || 0
      if (imp > 0 && statoRata(f.id, n, imp) !== 'incassata') return false
    }
    return true
  }

  function totaleIncassatoFattura(f: any): number {
    return [1, 2, 3].reduce((s, n) => s + pagatoSuRata(f.id, n), 0)
  }

  async function apriDettaglio(f: any) {
    setModalDettaglio(f)
    setFormPagamento({ rata: 1, importo: '', data_pagamento: new Date().toISOString().split('T')[0], note: '' })
  }

  async function registraPagamento(rataTarget: number) {
    if (!modalDettaglio) return
    const importo = parseFloat(formPagamento.importo) || 0
    if (importo <= 0) { alert('Inserisci un importo valido'); return }
    if (!formPagamento.data_pagamento) { alert('Inserisci la data del pagamento'); return }
    setLoadingPagamento(true)
    const { error } = await supabase.from('pagamenti_clienti').insert({
      fattura_id: modalDettaglio.id, rata: rataTarget, importo,
      data_pagamento: formPagamento.data_pagamento, note: formPagamento.note || null,
    })
    if (error) { alert('Errore: ' + error.message); setLoadingPagamento(false); return }
    await supabase.from('cash_flow').insert({
      data: formPagamento.data_pagamento,
      descrizione: `Incasso ${modalDettaglio.cliente_nome} - Ft ${modalDettaglio.numero} rata ${rataTarget}`,
      conto: 'Conto 1', tipologia: 'Incasso Cliente', entrata: importo, uscita: 0,
      progetto_id: modalDettaglio.progetto_id || null, riferimento_fattura: modalDettaglio.numero
    })
    const nuovoPagato = pagatoSuRata(modalDettaglio.id, rataTarget) + importo
    const importoRata = modalDettaglio[`rata${rataTarget}_importo`] || 0
    await supabase.from('fatture_clienti').update({
      [`rata${rataTarget}_stato`]: nuovoPagato >= importoRata - 0.01 ? 'Incassata' : 'Parziale'
    }).eq('id', modalDettaglio.id)
    setFormPagamento({ rata: 1, importo: '', data_pagamento: new Date().toISOString().split('T')[0], note: '' })
    setLoadingPagamento(false)
    await load()
    const { data: aggiornata } = await supabase.from('fatture_clienti').select('*').eq('id', modalDettaglio.id).single()
    if (aggiornata) setModalDettaglio(aggiornata)
  }

  async function eliminaPagamento(pagamentoId: string, fatturaId: string, rata: number, importoRata: number) {
    if (!confirm('Eliminare questo pagamento? Il movimento in cash flow non viene rimosso automaticamente.')) return
    await supabase.from('pagamenti_clienti').delete().eq('id', pagamentoId)
    await load()
    const pagatoAgg = pagamenti.filter(p => p.id !== pagamentoId && p.fattura_id === fatturaId && p.rata === rata).reduce((s, p) => s + (p.importo || 0), 0)
    let nuovoStato = 'Da Incassare'
    if (pagatoAgg >= importoRata - 0.01 && importoRata > 0) nuovoStato = 'Incassata'
    else if (pagatoAgg > 0) nuovoStato = 'Parziale'
    await supabase.from('fatture_clienti').update({ [`rata${rata}_stato`]: nuovoStato }).eq('id', fatturaId)
    await load()
    if (modalDettaglio?.id === fatturaId) {
      const { data: agg } = await supabase.from('fatture_clienti').select('*').eq('id', fatturaId).single()
      if (agg) setModalDettaglio(agg)
    }
  }

  async function elimina(id: string, numero: string) {
    if (!confirm(`Eliminare la fattura ${numero}? Verrà eliminato anche lo storico dei pagamenti.`)) return
    await supabase.from('pagamenti_clienti').delete().eq('fattura_id', id)
    await supabase.from('fatture_clienti').delete().eq('id', id)
    setModalDettaglio(null); load()
  }

  // ── FIX: stessa correzione applicata a fatture_fornitori ──
  // Prima: errore swallowed silenziosamente → le modifiche sparivano senza avviso
  // Ora: cattura l'errore e mostra un toast con il messaggio esatto
  async function salvaModifica() {
    if (!modalModifica) return
    setLoading(true)

    const r1i = parseFloat(modalModifica.rata1_importo) || 0
    const r2i = parseFloat(modalModifica.rata2_importo) || 0
    const r3i = parseFloat(modalModifica.rata3_importo) || 0

    // Aggiorna stata rate: se importo → 0, stato = null; se aggiunta nuova rata, stato = 'Da Incassare'
    const rata1_stato = r1i > 0 ? (modalModifica.rata1_stato || 'Da Incassare') : null
    const rata2_stato = r2i > 0 ? (modalModifica.rata2_stato || 'Da Incassare') : null
    const rata3_stato = r3i > 0 ? (modalModifica.rata3_stato || 'Da Incassare') : null

    const { error } = await supabase.from('fatture_clienti').update({
      data: modalModifica.data,
      numero: modalModifica.numero,
      descrizione: modalModifica.descrizione || '',
      imponibile: parseFloat(modalModifica.imponibile) || 0,
      iva_percentuale: parseFloat(modalModifica.iva_percentuale) || 0,
      nota: modalModifica.note || '',
      rata1_importo: r1i,
      rata1_scadenza: modalModifica.rata1_scadenza || null,
      rata1_stato,
      rata2_importo: r2i,
      rata2_scadenza: modalModifica.rata2_scadenza || null,
      rata2_stato,
      rata3_importo: r3i,
      rata3_scadenza: modalModifica.rata3_scadenza || null,
      rata3_stato,
      note: modalModifica.note || '',
    }).eq('id', modalModifica.id)

    if (error) {
      showToast(`Errore salvataggio: ${error.message}`, 'err')
      setLoading(false)
      return
    }
    showToast('Modifiche salvate', 'ok')
    setModalModifica(null); setLoading(false); load()
  }

  async function salva() {
    if (!form.numero || !form.imponibile || !form.cliente_id) {
      alert('Compilare N° fattura, cliente e imponibile'); return
    }
    const { data: dup } = await supabase.from('fatture_clienti').select('id').eq('numero', form.numero).eq('cliente_id', form.cliente_id)
    if (dup && dup.length > 0) { alert(`⚠️ Fattura ${form.numero} di questo cliente già presente.`); return }
    setLoading(true)
    const cli = clienti.find(c => c.id === form.cliente_id)
    const prj = progetti.find(p => p.id === form.progetto_id)
    const imp = parseFloat(form.imponibile) || 0
    const isNC = form.tipo === 'Nota di credito'
    const { error } = await supabase.from('fatture_clienti').insert({
      data: form.data || new Date().toISOString().split('T')[0],
      numero: form.numero, cliente_id: form.cliente_id, cliente_nome: cli?.ragione_sociale || '',
      progetto_id: form.progetto_id || null, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: form.descrizione, imponibile: imp,
      iva_percentuale: parseFloat(form.iva_percentuale) || 0,
      tipo: form.tipo, fattura_collegata_id: form.fattura_collegata_id || null,
      rata1_importo: isNC ? 0 : (parseFloat(form.r1i) || imp),
      rata1_scadenza: isNC ? null : (form.r1s || null),
      rata1_stato: isNC ? null : 'Da Incassare',
      rata2_importo: isNC ? 0 : (parseFloat(form.r2i) || 0),
      rata2_scadenza: isNC ? null : (form.r2s || null),
      rata2_stato: isNC ? null : (form.r2i ? 'Da Incassare' : null),
      rata3_importo: 0, rata3_scadenza: null, rata3_stato: null, note: form.note
    })
    if (error) { showToast(`Errore inserimento: ${error.message}`, 'err'); setLoading(false); return }
    showToast('Fattura inserita', 'ok')
    setModal(false); setLoading(false); load()
  }

  function badgeStatoRata(stato: string) {
    if (stato === 'incassata') return <span className="badge badge-green">Incassata</span>
    if (stato === 'parziale') return <span className="badge badge-amber">Parziale</span>
    return <span className="badge badge-gray">Da Incassare</span>
  }

  const isNC = (f: any) => f.tipo === 'Nota di credito'

  const fattureFiltrate = useMemo(() => {
    let r = fatture
    if (filtroTipo === 'fattura') r = r.filter(f => !isNC(f))
    if (filtroTipo === 'nota_credito') r = r.filter(f => isNC(f))
    if (cercaTesto.trim()) {
      const q = cercaTesto.toLowerCase()
      r = r.filter(f => f.numero?.toLowerCase().includes(q) || f.cliente_nome?.toLowerCase().includes(q) || f.progetto_nome?.toLowerCase().includes(q))
    }
    const sorted = [...r]
    if (ordinamento === 'numero') sorted.sort((a, b) => confrontaNumeriFattura(b.numero, a.numero))
    else sorted.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    return sorted
  }, [fatture, filtroTipo, ordinamento, cercaTesto])

  const totFatture = fatture.filter(f => !isNC(f)).reduce((s, f) => s + (f.imponibile || 0), 0)
  const totNC = fatture.filter(f => isNC(f)).reduce((s, f) => s + (f.imponibile || 0), 0)
  const totNetto = totFatture - totNC
  const totIVA = fatture.filter(f => !isNC(f)).reduce((s, f) => s + (totalefattura(f) - (f.imponibile || 0)), 0)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">

        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.type === 'ok' ? '✓ ' : '⚠️ '}{toast.msg}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Fatture clienti</h1>
          <button className="btn btn-primary text-sm" onClick={() => setModal(true)}>+ Nuova fattura</button>
        </div>

        <div className="card mb-4">
          <div className="mb-3">
            <input className="input" placeholder="🔍 Cerca per N° fattura, cliente, cantiere..."
              value={cercaTesto} onChange={e => setCercaTesto(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1">
              {[
                { key: 'tutti', label: `Tutti (${fatture.length})` },
                { key: 'fattura', label: `Solo fatture (${fatture.filter(f => !isNC(f)).length})` },
                { key: 'nota_credito', label: `Solo NC (${fatture.filter(f => isNC(f)).length})` },
              ].map(opt => (
                <button key={opt.key} onClick={() => setFiltroTipo(opt.key)}
                  className={`btn btn-sm ${filtroTipo === opt.key ? 'btn-primary' : ''}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400 mr-1">Ordina:</span>
              <button className={`btn btn-sm ${ordinamento === 'numero' ? 'btn-primary' : ''}`} onClick={() => setOrdinamento('numero')}>N° fattura</button>
              <button className={`btn btn-sm ${ordinamento === 'data' ? 'btn-primary' : ''}`} onClick={() => setOrdinamento('data')}>Data</button>
            </div>
            <div className="flex-1 text-right text-xs text-gray-500 space-x-3">
              {cercaTesto && <span>{fattureFiltrate.length} risultati</span>}
              <span>Imponibile: <strong>{euro(totFatture)}</strong></span>
              {totIVA > 0 && <span className="text-gray-400">IVA: {euro(totIVA)}</span>}
              {totNC > 0 && <span className="text-purple-600">NC: <strong>- {euro(totNC)}</strong></span>}
              <span className="font-semibold text-gray-800">Netto: <strong>{euro(totNetto)}</strong></span>
              {cercaTesto && <button className="text-blue-600 hover:underline" onClick={() => setCercaTesto('')}>× Reset</button>}
            </div>
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Data</th>
                <th>N° Fattura</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>Cantiere</th>
                <th>Imponibile</th>
                <th>Totale (IVA incl.)</th>
                <th>Incassato</th>
                <th>Stato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fattureFiltrate.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-gray-400 py-8">Nessuna fattura cliente.</td></tr>
              ) : fattureFiltrate.map(f => {
                const nc = isNC(f)
                const incassato = nc ? 0 : totaleIncassatoFattura(f)
                const saldata = nc ? false : fatturaSaldata(f)
                const collegata = nc && f.fattura_collegata_id ? fatture.find(x => x.id === f.fattura_collegata_id) : null
                const totale = totalefattura(f)
                return (
                  <tr key={f.id} className={`cursor-pointer ${nc ? 'bg-purple-50 hover:bg-purple-100' : 'hover:bg-gray-50'}`}
                    onClick={() => !nc && apriDettaglio(f)}>
                    <td className="text-xs">{new Date(f.data).toLocaleDateString('it-IT')}</td>
                    <td className="font-medium text-sm">{f.numero}</td>
                    <td>
                      {nc
                        ? <span className="inline-block bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded font-bold">📝 NC</span>
                        : <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-medium">🧾 FT</span>}
                    </td>
                    <td className="text-sm">{f.cliente_nome}</td>
                    <td className="text-xs text-gray-500">
                      {f.progetto_nome || '—'}
                      {collegata && <span className="block text-purple-500 text-xs">→ comp. {collegata.numero}</span>}
                    </td>
                    {/* Imponibile */}
                    <td className={`font-medium text-sm ${nc ? 'text-purple-700' : ''}`}>
                      {nc ? '- ' : ''}{euro(f.imponibile)}
                      {(f.iva_percentuale || 0) > 0 && !nc && (
                        <span className="block text-xs text-gray-400 font-normal">IVA {f.iva_percentuale}%</span>
                      )}
                      {(f.iva_percentuale || 0) === 0 && !nc && (
                        <span className="block text-xs text-gray-400 font-normal">RC</span>
                      )}
                    </td>
                    {/* Totale con IVA inclusa */}
                    <td className={`font-semibold text-sm ${nc ? 'text-purple-600' : 'text-gray-900'}`}>
                      {nc ? <span className="text-xs text-gray-400">—</span> : euro(totale)}
                    </td>
                    <td className="text-sm">
                      {nc ? <span className="text-gray-300">—</span> : incassato > 0 ? euro(incassato) : <span className="text-gray-300">—</span>}
                    </td>
                    <td>
                      {nc
                        ? <span className="badge" style={{background:'#f3e8ff',color:'#7e22ce'}}>Nota di credito</span>
                        : saldata ? <span className="badge badge-green">✓ Saldata</span>
                        : incassato > 0 ? <span className="badge badge-amber">Parziale</span>
                        : <span className="badge badge-gray">Da incassare</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setModalModifica({...f})}>✏️</button>
                        <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => elimina(f.id, f.numero)}>✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* MODAL NUOVA FATTURA */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuova fattura cliente</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="bg-blue-50 rounded-lg p-2 mb-3 text-xs text-blue-700">IVA = 0% (Reverse Charge) impostata di default</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Tipo documento *</label>
                <select className="input" value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value, r1i: '', r1s: '', r2i: '', r2s: '', fattura_collegata_id: ''})}>
                  <option value="Fattura">Fattura</option><option value="Nota di credito">Nota di credito</option>
                </select></div>
              <div><label className="label">Data</label><input className="input" type="date" value={form.data} onChange={e => setForm({...form, data: e.target.value})} /></div>
              <div><label className="label">N° Fattura *</label><input className="input" placeholder="es. FT/2026/001" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} /></div>
              <div><label className="label">Cliente *</label>
                <select className="input" value={form.cliente_id} onChange={e => setForm({...form, cliente_id: e.target.value, fattura_collegata_id: ''})}>
                  <option value="">-- seleziona --</option>
                  {clienti.map(c => <option key={c.id} value={c.id}>{c.ragione_sociale}</option>)}
                </select></div>
              {form.tipo === 'Nota di credito' && (
                <div className="col-span-2">
                  <label className="label">Fattura di riferimento (opzionale)</label>
                  <select className="input" value={form.fattura_collegata_id} onChange={e => setForm({...form, fattura_collegata_id: e.target.value})}>
                    <option value="">-- nessuna --</option>
                    {fatture.filter(f => !isNC(f) && f.cliente_id === form.cliente_id).map(f => (
                      <option key={f.id} value={f.id}>{f.numero} — {euro(f.imponibile)} — {new Date(f.data).toLocaleDateString('it-IT')}</option>
                    ))}
                  </select>
                </div>
              )}
              <div><label className="label">Cantiere</label>
                <select className="input" value={form.progetto_id} onChange={e => setForm({...form, progetto_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                </select></div>
              <div><label className="label">Imponibile (€) *</label><input className="input" type="number" step="0.01" value={form.imponibile} onChange={e => setForm({...form, imponibile: e.target.value})} /></div>
              <div><label className="label">IVA %</label>
                <select className="input" value={form.iva_percentuale} onChange={e => setForm({...form, iva_percentuale: e.target.value})}>
                  <option value="0">0% (RC)</option><option value="22">22%</option><option value="10">10%</option>
                </select></div>
              {/* Anteprima totale in tempo reale */}
              {form.imponibile && (
                <div className="col-span-2 bg-gray-50 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                  <span className="text-gray-500">Totale fattura (imponibile + IVA)</span>
                  <span className="font-bold text-gray-900">
                    {euro((parseFloat(form.imponibile) || 0) * (1 + (parseFloat(form.iva_percentuale) || 0) / 100))}
                  </span>
                </div>
              )}
              {form.tipo === 'Fattura' && (
                <>
                  <div className="col-span-2 mt-1 text-xs font-medium text-gray-500 border-t pt-2">Rate di incasso</div>
                  <div><label className="label">Rata 1 — Importo</label><input className="input" type="number" step="0.01" value={form.r1i} onChange={e => setForm({...form, r1i: e.target.value})} /></div>
                  <div><label className="label">Rata 1 — Scadenza</label><input className="input" type="date" value={form.r1s} onChange={e => setForm({...form, r1s: e.target.value})} /></div>
                  <div><label className="label">Rata 2 (opz.)</label><input className="input" type="number" step="0.01" value={form.r2i} onChange={e => setForm({...form, r2i: e.target.value})} /></div>
                  <div><label className="label">Rata 2 — Scadenza</label><input className="input" type="date" value={form.r2s} onChange={e => setForm({...form, r2s: e.target.value})} /></div>
                </>
              )}
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={form.note} onChange={e => setForm({...form, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MODIFICA */}
      {modalModifica && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Modifica fattura — {modalModifica.numero}</h2>
              <button onClick={() => setModalModifica(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Data</label><input className="input" type="date" value={modalModifica.data || ''} onChange={e => setModalModifica({...modalModifica, data: e.target.value})} /></div>
              <div><label className="label">N° Fattura</label><input className="input" value={modalModifica.numero || ''} onChange={e => setModalModifica({...modalModifica, numero: e.target.value})} /></div>
              <div><label className="label">Imponibile (€)</label><input className="input" type="number" step="0.01" value={modalModifica.imponibile || ''} onChange={e => setModalModifica({...modalModifica, imponibile: e.target.value})} /></div>
              <div><label className="label">IVA %</label>
                <select className="input" value={modalModifica.iva_percentuale || '0'} onChange={e => setModalModifica({...modalModifica, iva_percentuale: e.target.value})}>
                  <option value="0">0% (RC)</option><option value="22">22%</option><option value="10">10%</option>
                </select></div>
              {/* Anteprima totale in modifica */}
              {modalModifica.imponibile && (
                <div className="col-span-2 bg-blue-50 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                  <span className="text-blue-600">Totale fattura (imponibile + IVA)</span>
                  <span className="font-bold text-blue-900">
                    {euro((parseFloat(modalModifica.imponibile) || 0) * (1 + (parseFloat(modalModifica.iva_percentuale) || 0) / 100))}
                  </span>
                </div>
              )}
              <div className="col-span-2 mt-1 text-xs font-medium text-gray-500 border-t pt-2">Rate</div>
              <div><label className="label">Rata 1 — Importo</label><input className="input" type="number" step="0.01" value={modalModifica.rata1_importo || ''} onChange={e => setModalModifica({...modalModifica, rata1_importo: e.target.value})} /></div>
              <div><label className="label">Rata 1 — Scadenza</label><input className="input" type="date" value={modalModifica.rata1_scadenza || ''} onChange={e => setModalModifica({...modalModifica, rata1_scadenza: e.target.value})} /></div>
              <div><label className="label">Rata 2 — Importo</label><input className="input" type="number" step="0.01" value={modalModifica.rata2_importo || ''} onChange={e => setModalModifica({...modalModifica, rata2_importo: e.target.value})} /></div>
              <div><label className="label">Rata 2 — Scadenza</label><input className="input" type="date" value={modalModifica.rata2_scadenza || ''} onChange={e => setModalModifica({...modalModifica, rata2_scadenza: e.target.value})} /></div>
              <div><label className="label">Rata 3 — Importo</label><input className="input" type="number" step="0.01" value={modalModifica.rata3_importo || ''} onChange={e => setModalModifica({...modalModifica, rata3_importo: e.target.value})} /></div>
              <div><label className="label">Rata 3 — Scadenza</label><input className="input" type="date" value={modalModifica.rata3_scadenza || ''} onChange={e => setModalModifica({...modalModifica, rata3_scadenza: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={modalModifica.note || ''} onChange={e => setModalModifica({...modalModifica, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalModifica(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaModifica} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva modifiche'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETTAGLIO con pagamenti */}
      {modalDettaglio && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Fattura {modalDettaglio.numero}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{modalDettaglio.cliente_nome} · {modalDettaglio.progetto_nome || 'nessun cantiere'}</p>
              </div>
              <button onClick={() => setModalDettaglio(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4 text-sm">
              <div><span className="text-gray-400 text-xs block">Data emissione</span>{new Date(modalDettaglio.data).toLocaleDateString('it-IT')}</div>
              <div>
                <span className="text-gray-400 text-xs block">Imponibile</span>
                {euro(modalDettaglio.imponibile)}
                <span className="text-xs text-gray-400 block">IVA {modalDettaglio.iva_percentuale}%</span>
              </div>
              <div>
                <span className="text-gray-400 text-xs block">Totale fattura</span>
                <span className="font-bold">{euro(totalefattura(modalDettaglio))}</span>
              </div>
              <div><span className="text-gray-400 text-xs block">Incassato</span>{euro(totaleIncassatoFattura(modalDettaglio))}</div>
              <div><span className="text-gray-400 text-xs block">Stato</span>
                {fatturaSaldata(modalDettaglio) ? <span className="badge badge-green">✓ Saldata</span> : <span className="badge badge-amber">Aperta</span>}
              </div>
              {modalDettaglio.note && <div className="col-span-4"><span className="text-gray-400 text-xs block">Note</span>{modalDettaglio.note}</div>}
            </div>

            <div className="space-y-4">
              {[1, 2, 3].map(n => {
                const importoRata = modalDettaglio[`rata${n}_importo`] || 0
                if (importoRata <= 0) return null
                const stato = statoRata(modalDettaglio.id, n, importoRata)
                const pagatoRata = pagatoSuRata(modalDettaglio.id, n)
                const pagamentiRata = pagamenti.filter(p => p.fattura_id === modalDettaglio.id && p.rata === n)
                return (
                  <div key={n} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Rata {n}</span>
                        {badgeStatoRata(stato)}
                      </div>
                      <div className="text-right text-sm">
                        <span className="font-semibold">{euro(pagatoRata)}</span>
                        <span className="text-gray-400"> / {euro(importoRata)}</span>
                        {stato === 'parziale' && <span className="text-amber-600 text-xs block">Mancano {euro(importoRata - pagatoRata)}</span>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">Scadenza: {modalDettaglio[`rata${n}_scadenza`] ? new Date(modalDettaglio[`rata${n}_scadenza`]).toLocaleDateString('it-IT') : '—'}</p>
                    {pagamentiRata.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-2 mb-2 space-y-1">
                        {pagamentiRata.map(p => (
                          <div key={p.id} className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">💰 {euro(p.importo)} — {new Date(p.data_pagamento).toLocaleDateString('it-IT')}{p.note && ` · ${p.note}`}</span>
                            <button className="text-gray-300 hover:text-red-500" onClick={() => eliminaPagamento(p.id, modalDettaglio.id, n, importoRata)}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {stato !== 'incassata' && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                        <input className="input text-xs py-1 w-28" type="number" step="0.01" placeholder="Importo €"
                          value={formPagamento.rata === n ? formPagamento.importo : ''}
                          onChange={e => setFormPagamento({ rata: n, importo: e.target.value, data_pagamento: formPagamento.data_pagamento || new Date().toISOString().split('T')[0], note: formPagamento.note })} />
                        <input className="input text-xs py-1 w-36" type="date"
                          value={formPagamento.rata === n ? formPagamento.data_pagamento : new Date().toISOString().split('T')[0]}
                          onChange={e => setFormPagamento({ rata: n, importo: formPagamento.importo, data_pagamento: e.target.value, note: formPagamento.note })} />
                        <input className="input text-xs py-1 flex-1" placeholder="Note (opzionale)"
                          value={formPagamento.rata === n ? formPagamento.note : ''}
                          onChange={e => setFormPagamento({ rata: n, importo: formPagamento.importo, data_pagamento: formPagamento.data_pagamento, note: e.target.value })} />
                        <button className="btn btn-sm btn-success" disabled={loadingPagamento} onClick={() => registraPagamento(n)}>
                          {loadingPagamento ? '...' : '+ Registra incasso'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button className="btn text-red-600 border-red-200 hover:bg-red-50" onClick={() => elimina(modalDettaglio.id, modalDettaglio.numero)}>✕ Elimina fattura</button>
              <button className="btn btn-primary" onClick={() => { setModalModifica({...modalDettaglio}); setModalDettaglio(null) }}>✏️ Modifica fattura</button>
              <button className="btn" onClick={() => setModalDettaglio(null)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
