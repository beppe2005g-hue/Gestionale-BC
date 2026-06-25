'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const euroShort = (n: number) => (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const oggi = new Date()
oggi.setHours(0, 0, 0, 0)

function giorniAllaScadenza(data: string | null): number | null {
  if (!data) return null
  const d = new Date(data)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - oggi.getTime()) / 86400000)
}

function meseLabel(data: string | null): string {
  if (!data) return 'Senza scadenza'
  const d = new Date(data)
  return d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}

function meseKey(data: string | null): string {
  if (!data) return '9999-99'
  return data.substring(0, 7)
}

interface RigaPagamento {
  id: string; numero: string; fornitore_nome: string; cantiere: string
  rata: number; importo: number; scadenza: string | null; gg: number | null; stato: string
  data_fattura: string | null
}

interface RigaIncasso {
  fattura_id: string; numero: string; data_fattura: string | null
  cliente_nome: string; progetto_nome: string
  rata: number; importo: number; scadenza: string | null; gg: number | null
  scaduta: boolean; mese_key: string; mese_label: string
}

type OrdinamentoPagare = 'scadenza' | 'fornitore'

export default function Scadenzario() {
  const [tab, setTab] = useState<'da_pagare' | 'da_incassare'>('da_pagare')

  // ── Da Pagare ──
  const [pagamenti, setPagamenti] = useState<RigaPagamento[]>([])
  const [ordinamentoPagare, setOrdinamentoPagare] = useState<OrdinamentoPagare>('scadenza')
  const [soloScadutePagare, setSoloScadutePagare] = useState(false)
  const [cercaFornitore, setCercaFornitore] = useState('')

  // ── Da Incassare ──
  const [fattureClienti, setFattureClienti] = useState<any[]>([])
  const [filtroCliente, setFiltroCliente] = useState('')
  const [soloScaduteIncassare, setSoloScaduteIncassare] = useState(false)
  const [loadingIncassare, setLoadingIncassare] = useState(true)

  const [loading, setLoading] = useState(true)
  const [pagamentiClienti, setPagamentiClienti] = useState<any[]>([])
  const [ncFornitori, setNcFornitori] = useState<any[]>([]) // note di credito fornitori per calcolo saldo netto
  const [ncClienti, setNcClienti] = useState<any[]>([])     // note di credito clienti per calcolo saldo netto

  useEffect(() => {
    load()
    window.addEventListener('gestionale:refresh', load)
    return () => window.removeEventListener('gestionale:refresh', load)
  }, [])

  async function load() {
    setLoading(true)
    setLoadingIncassare(true)
    const [{ data: ff }, { data: fc }, { data: pagCli }, { data: ncFF }, { data: ncFC }] = await Promise.all([
      supabase.from('fatture_fornitori').select('id,numero,data,fornitore_nome,progetto_nome,tipo,rata1_importo,rata1_scadenza,rata1_stato,rata2_importo,rata2_scadenza,rata2_stato,rata3_importo,rata3_scadenza,rata3_stato'),
      supabase.from('fatture_clienti').select('*').order('cliente_nome').order('data'),
      supabase.from('pagamenti_clienti').select('fattura_id,rata,importo'),
      supabase.from('fatture_fornitori').select('fornitore_nome,imponibile').eq('tipo', 'Nota di credito'),
      supabase.from('fatture_clienti').select('cliente_nome,imponibile').eq('tipo', 'Nota di credito'),
    ])
    setPagamentiClienti(pagCli || [])
    setNcFornitori(ncFF || [])
    setNcClienti(ncFC || [])

    // ── Costruisce le righe Da Pagare (solo fatture vere, non NC) ──
    const righePagare: RigaPagamento[] = []
    ;(ff || []).forEach((f: any) => {
      if (f.tipo === 'Nota di credito') return // le NC non sono scadenze da pagare
      ;[1, 2, 3].forEach(n => {
        const imp = f[`rata${n}_importo`]
        const scad = f[`rata${n}_scadenza`]
        const stato = f[`rata${n}_stato`]
        if (imp > 0 && stato !== 'Pagata') {
          righePagare.push({
            id: f.id, numero: f.numero, fornitore_nome: f.fornitore_nome,
            cantiere: f.progetto_nome, rata: n, importo: imp, scadenza: scad,
            gg: giorniAllaScadenza(scad), stato, data_fattura: f.data,
          })
        }
      })
    })
    setPagamenti(righePagare)
    setLoading(false)

    // ── Esclude le NC dalle fatture clienti (non sono rate da incassare) ──
    setFattureClienti((fc || []).filter((f: any) => f.tipo !== 'Nota di credito'))
    setLoadingIncassare(false)
  }

  // ════════════════ DA PAGARE ════════════════
  const pagamentiFiltrati = useMemo(() => {
    let r = pagamenti
    if (cercaFornitore) r = r.filter(x => x.fornitore_nome?.toLowerCase().includes(cercaFornitore.toLowerCase()))
    if (soloScadutePagare) r = r.filter(x => x.gg !== null && x.gg < 0)
    const sorted = [...r]
    if (ordinamentoPagare === 'scadenza') {
      // Scadenza crescente; a parità di scadenza, stesso fornitore vicino; poi data emissione come 2° criterio
      sorted.sort((a, b) => {
        const sa = a.scadenza || '9999-99-99'
        const sb = b.scadenza || '9999-99-99'
        if (sa !== sb) return sa.localeCompare(sb)
        const fa = a.fornitore_nome || ''
        const fb = b.fornitore_nome || ''
        if (fa !== fb) return fa.localeCompare(fb)
        return (a.data_fattura || '').localeCompare(b.data_fattura || '')
      })
    } else {
      // Per fornitore; dentro lo stesso fornitore, per scadenza
      sorted.sort((a, b) => {
        const fa = a.fornitore_nome || ''
        const fb = b.fornitore_nome || ''
        if (fa !== fb) return fa.localeCompare(fb)
        const sa = a.scadenza || '9999-99-99'
        const sb = b.scadenza || '9999-99-99'
        return sa.localeCompare(sb)
      })
    }
    return sorted
  }, [pagamenti, cercaFornitore, soloScadutePagare, ordinamentoPagare])

  const totalePagare = pagamentiFiltrati.reduce((s, r) => s + r.importo, 0)
  const scadutoPagare = pagamentiFiltrati.filter(r => r.gg !== null && r.gg < 0).reduce((s, r) => s + r.importo, 0)
  const scadutoOltre30Pagare = pagamentiFiltrati.filter(r => r.gg !== null && r.gg < -30).reduce((s, r) => s + r.importo, 0)
  // NC fornitori: scalate dal totale da pagare per mostrare il saldo netto reale
  const totaleNcFornitori = ncFornitori
    .filter(nc => !cercaFornitore || nc.fornitore_nome?.toLowerCase().includes(cercaFornitore.toLowerCase()))
    .reduce((s, nc) => s + (nc.imponibile || 0), 0)
  const totalePagareNetto = Math.max(0, totalePagare - totaleNcFornitori)

  function badgeGiorni(gg: number | null) {
    if (gg === null) return <span className="text-xs text-gray-400">—</span>
    if (gg < -30) return <span className="badge badge-red">Scaduto da {Math.abs(gg)} gg 🔴</span>
    if (gg < 0) return <span className="badge badge-red">Scaduto da {Math.abs(gg)} gg</span>
    if (gg === 0) return <span className="badge badge-amber">Scade oggi</span>
    if (gg <= 7) return <span className="badge badge-amber">Tra {gg} gg</span>
    return <span className="badge badge-blue">Tra {gg} gg</span>
  }

  // ════════════════ DA INCASSARE ════════════════
  const rateIncassareGrezze = useMemo(() => {
    const righe: RigaIncasso[] = []
    fattureClienti.forEach(f => {
      ;[1, 2, 3].forEach(n => {
        const impTotale = f[`rata${n}_importo`]
        const scad = f[`rata${n}_scadenza`]
        if (impTotale > 0) {
          // Quanto è già stato effettivamente incassato su questa rata, dai pagamenti registrati
          // (più affidabile del solo campo "stato", che può restare disallineato su pagamenti parziali)
          const pagato = pagamentiClienti
            .filter(p => p.fattura_id === f.id && p.rata === n)
            .reduce((s, p) => s + (p.importo || 0), 0)
          const residuo = Math.round((impTotale - pagato) * 100) / 100
          if (residuo > 0.01) {
            const gg = giorniAllaScadenza(scad)
            righe.push({
              fattura_id: f.id, numero: f.numero, data_fattura: f.data,
              cliente_nome: f.cliente_nome, progetto_nome: f.progetto_nome,
              rata: n, importo: residuo, scadenza: scad, gg,
              scaduta: gg !== null && gg < 0,
              mese_key: meseKey(scad), mese_label: meseLabel(scad),
            })
          }
        }
      })
    })
    return righe
  }, [fattureClienti, pagamentiClienti])

  const rateIncassareFiltrate = useMemo(() => {
    let r = rateIncassareGrezze
    if (filtroCliente) r = r.filter(x => x.cliente_nome?.toLowerCase().includes(filtroCliente.toLowerCase()))
    if (soloScaduteIncassare) r = r.filter(x => x.scaduta)
    return r
  }, [rateIncassareGrezze, filtroCliente, soloScaduteIncassare])

  const perCliente = useMemo(() => {
    const mappa: Record<string, { cliente: string, totale: number, scaduto: number, mesi: Record<string, { label: string, rate: RigaIncasso[], totale: number }> }> = {}
    rateIncassareFiltrate.forEach(r => {
      if (!mappa[r.cliente_nome]) mappa[r.cliente_nome] = { cliente: r.cliente_nome, totale: 0, scaduto: 0, mesi: {} }
      const c = mappa[r.cliente_nome]
      c.totale += r.importo
      if (r.scaduta) c.scaduto += r.importo
      if (!c.mesi[r.mese_key]) c.mesi[r.mese_key] = { label: r.mese_label, rate: [], totale: 0 }
      c.mesi[r.mese_key].rate.push(r)
      c.mesi[r.mese_key].totale += r.importo
    })
    return Object.values(mappa).sort((a, b) => a.cliente.localeCompare(b.cliente))
  }, [rateIncassareFiltrate])

  const totaleIncassare = rateIncassareFiltrate.reduce((s, r) => s + r.importo, 0)
  const scadutoIncassare = rateIncassareFiltrate.filter(r => r.scaduta).reduce((s, r) => s + r.importo, 0)
  const scadutoOltre30Incassare = rateIncassareFiltrate.filter(r => r.gg !== null && r.gg < -30).reduce((s, r) => s + r.importo, 0)
  // NC clienti: scalate dal totale da incassare per mostrare il saldo netto reale
  const totaleNcClienti = ncClienti
    .filter(nc => !filtroCliente || nc.cliente_nome?.toLowerCase().includes(filtroCliente.toLowerCase()))
    .reduce((s, nc) => s + (nc.imponibile || 0), 0)
  const totaleIncassareNetto = Math.max(0, totaleIncassare - totaleNcClienti)

  function stampaIncassare() { window.print() }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <h1 className="text-xl font-semibold">Scadenzario</h1>
          {tab === 'da_incassare' && (
            <button className="btn btn-primary" onClick={stampaIncassare}>🖨️ Stampa / PDF</button>
          )}
        </div>

        <div className="flex gap-2 mb-4 print:hidden">
          <button onClick={() => setTab('da_pagare')} className={`btn ${tab === 'da_pagare' ? 'btn-primary' : ''}`}>
            📄 Da Pagare (Fornitori)
          </button>
          <button onClick={() => setTab('da_incassare')} className={`btn ${tab === 'da_incassare' ? 'btn-primary' : ''}`}>
            🧾 Da Incassare (Clienti)
          </button>
        </div>

        {/* ════════════════ TAB DA PAGARE ════════════════ */}
        {tab === 'da_pagare' && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                <p className="text-xs text-red-600 mb-1">⚠️ Scaduto</p>
                <p className="text-lg font-bold text-red-800">{euro(scadutoPagare)}</p>
              </div>
              <div className="bg-red-100 rounded-xl p-3 border border-red-300">
                <p className="text-xs text-red-700 mb-1">🔴 Scaduto da oltre 30 gg</p>
                <p className="text-lg font-bold text-red-900">{euro(scadutoOltre30Pagare)}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                <p className="text-xs text-amber-600 mb-1">📄 Totale da pagare</p>
                <p className="text-lg font-bold text-amber-800">{euro(totalePagareNetto)}</p>
                {totaleNcFornitori > 0 && (
                  <p className="text-xs text-purple-600 mt-0.5">NC: - {euro(totaleNcFornitori)}</p>
                )}
              </div>
            </div>

            <div className="card mb-4">
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-48">
                  <label className="label">Cerca fornitore</label>
                  <input className="input" placeholder="Nome fornitore..." value={cercaFornitore} onChange={e => setCercaFornitore(e.target.value)} />
                </div>
                <div>
                  <label className="label">Ordina per</label>
                  <div className="flex gap-1">
                    <button className={`btn btn-sm ${ordinamentoPagare === 'scadenza' ? 'btn-primary' : ''}`} onClick={() => setOrdinamentoPagare('scadenza')}>Scadenza</button>
                    <button className={`btn btn-sm ${ordinamentoPagare === 'fornitore' ? 'btn-primary' : ''}`} onClick={() => setOrdinamentoPagare('fornitore')}>Fornitore</button>
                  </div>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer pb-2">
                  <input type="checkbox" checked={soloScadutePagare} onChange={e => setSoloScadutePagare(e.target.checked)} className="rounded" />
                  Solo scadute
                </label>
                {(cercaFornitore || soloScadutePagare) && (
                  <button className="btn btn-sm pb-2" onClick={() => { setCercaFornitore(''); setSoloScadutePagare(false) }}>× Reset</button>
                )}
              </div>
            </div>

            <div className="card overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">{pagamentiFiltrati.length} rate da pagare</span>
              </div>
              {loading ? (
                <div className="text-center text-gray-400 py-8">Caricamento...</div>
              ) : (
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Fornitore</th><th>Cantiere</th><th>N° Fattura</th><th>Data emissione</th>
                      <th>Rata</th><th>Importo</th><th>Scadenza</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagamentiFiltrati.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-gray-400 py-8">Nessuna fattura da pagare per questo filtro.</td></tr>
                    ) : pagamentiFiltrati.map((r, i) => (
                      <tr key={`${r.id}-${r.rata}`} className={r.gg !== null && r.gg < 0 ? 'bg-red-50' : ''}>
                        <td className="font-medium text-sm">{r.fornitore_nome}</td>
                        <td className="text-xs text-gray-500">{r.cantiere || '—'}</td>
                        <td className="text-xs">{r.numero}</td>
                        <td className="text-xs text-gray-500">{r.data_fattura ? new Date(r.data_fattura).toLocaleDateString('it-IT') : '—'}</td>
                        <td className="text-xs text-center">{r.rata}</td>
                        <td className="font-medium text-sm">{euro(r.importo)}</td>
                        <td className="text-xs">{r.scadenza ? new Date(r.scadenza).toLocaleDateString('it-IT') : '—'}</td>
                        <td>{badgeGiorni(r.gg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ════════════════ TAB DA INCASSARE ════════════════ */}
        {tab === 'da_incassare' && (
          <>
            <div className="card mb-4 print:hidden">
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-52">
                  <label className="label">Filtra per cliente</label>
                  <input className="input" placeholder="Nome cliente..." value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer pb-2">
                  <input type="checkbox" checked={soloScaduteIncassare} onChange={e => setSoloScaduteIncassare(e.target.checked)} className="rounded" />
                  Solo scadute
                </label>
                {(filtroCliente || soloScaduteIncassare) && (
                  <button className="btn btn-sm pb-2" onClick={() => { setFiltroCliente(''); setSoloScaduteIncassare(false) }}>× Reset</button>
                )}
              </div>
            </div>

            {loadingIncassare ? (
              <div className="card text-center py-12 text-gray-400">Caricamento...</div>
            ) : (
              <div id="report-incassare">
                {/* Intestazione formale: compare solo quando si stampa un cliente specifico (filtro attivo) */}
                {filtroCliente && (
                  <div className="report-header flex items-start justify-between mb-6 pb-4" style={{ borderBottom: '3px solid #1e3a8a' }}>
                    <div className="flex items-center gap-4">
                      <img src="/logo.png" alt="BC General Service" style={{ height: 55, objectFit: 'contain' }} />
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 800, color: '#1e3a8a', letterSpacing: 1 }}>BC GENERAL SERVICE</p>
                        <p style={{ fontSize: 10, color: '#6b7280' }}>Società Consortile a Responsabilità Limitata</p>
                        <p style={{ fontSize: 10, color: '#6b7280' }}>Via Duca d'Este 7 — 41036 Medolla (MO)</p>
                        <p style={{ fontSize: 10, color: '#6b7280' }}>P.IVA 03943310361</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>ESTRATTO CONTO</p>
                      <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Data: <strong>{new Date().toLocaleDateString('it-IT')}</strong></p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3 mb-4 print:grid-cols-3">
                  <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                    <p className="text-xs text-red-600 mb-1">⚠️ Scaduto</p>
                    <p className="text-lg font-bold text-red-800">{euro(scadutoIncassare)}</p>
                    <p className="text-xs text-red-500 mt-0.5">{rateIncassareFiltrate.filter(r => r.scaduta).length} rate scadute</p>
                  </div>
                  <div className="bg-red-100 rounded-xl p-3 border border-red-300">
                    <p className="text-xs text-red-700 mb-1">🔴 Scaduto da oltre 30 gg</p>
                    <p className="text-lg font-bold text-red-900">{euro(scadutoOltre30Incassare)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                    <p className="text-xs text-blue-600 mb-1">🧾 Totale da incassare</p>
                    <p className="text-lg font-bold text-blue-800">{euro(totaleIncassareNetto)}</p>
                    {totaleNcClienti > 0 && (
                      <p className="text-xs text-purple-600 mt-0.5">NC: - {euro(totaleNcClienti)}</p>
                    )}
                    <p className="text-xs text-blue-500 mt-0.5">{perCliente.length} clienti</p>
                  </div>
                </div>

                {perCliente.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400">Nessuna rata da incassare trovata.</div>
                ) : (
                  <div className="space-y-6">
                    {perCliente.map(c => (
                      <div key={c.cliente} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', pageBreakInside: 'avoid' }}>
                        <div style={{ background: '#1e3a8a', color: 'white', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ fontWeight: 700, fontSize: 14 }}>{c.cliente}</p>
                            <p style={{ fontSize: 11, color: '#93c5fd' }}>
                              {Object.keys(c.mesi).length} scadenze · {rateIncassareFiltrate.filter(r => r.cliente_nome === c.cliente).length} rate
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24' }}>€ {euroShort(c.totale)}</p>
                            {c.scaduto > 0 && (
                              <p style={{ fontSize: 11, color: '#fca5a5' }}>🔴 Scaduto: € {euroShort(c.scaduto)}</p>
                            )}
                          </div>
                        </div>

                        {(Object.entries(c.mesi) as [string, { label: string, rate: RigaIncasso[], totale: number }][])
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([meseK, mese]) => {
                            const isPassato = meseK < new Date().toISOString().substring(0, 7)
                            const isMeseCorrente = meseK === new Date().toISOString().substring(0, 7)
                            return (
                              <div key={meseK}>
                                <div style={{
                                  background: meseK === '9999-99' ? '#f3f4f6' : isPassato ? '#fef2f2' : isMeseCorrente ? '#fffbeb' : '#f0fdf4',
                                  padding: '6px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  borderTop: '1px solid #e2e8f0'
                                }}>
                                  <p style={{ fontWeight: 600, fontSize: 12, color: isPassato ? '#dc2626' : isMeseCorrente ? '#d97706' : '#065f46' }}>
                                    {isPassato ? '🔴 ' : isMeseCorrente ? '🟡 ' : '🟢 '}
                                    {mese.label.charAt(0).toUpperCase() + mese.label.slice(1)}
                                    {isPassato && ' — SCADUTO'}
                                    {isMeseCorrente && ' — Mese corrente'}
                                  </p>
                                  <p style={{ fontWeight: 700, fontSize: 13, color: isPassato ? '#dc2626' : '#374151' }}>€ {euroShort(mese.totale)}</p>
                                </div>
                                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                                  <thead>
                                    <tr style={{ background: '#f8faff' }}>
                                      <th style={{ padding: '5px 16px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>N° Fattura</th>
                                      <th style={{ padding: '5px 16px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>Data fattura</th>
                                      <th style={{ padding: '5px 16px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>Cantiere</th>
                                      <th style={{ padding: '5px 16px', textAlign: 'center', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>Rata</th>
                                      <th style={{ padding: '5px 16px', textAlign: 'right', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>Scadenza</th>
                                      <th style={{ padding: '5px 16px', textAlign: 'right', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>Gg</th>
                                      <th style={{ padding: '5px 16px', textAlign: 'right', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>Importo</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {mese.rate.map((r, idx) => (
                                      <tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                                        <td style={{ padding: '5px 16px', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: '#1e40af' }}>{r.numero}</td>
                                        <td style={{ padding: '5px 16px', borderBottom: '1px solid #f1f5f9', color: '#374151' }}>
                                          {r.data_fattura ? new Date(r.data_fattura).toLocaleDateString('it-IT') : '—'}
                                        </td>
                                        <td style={{ padding: '5px 16px', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}>{r.progetto_nome || '—'}</td>
                                        <td style={{ padding: '5px 16px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', color: '#374151' }}>{r.rata}</td>
                                        <td style={{ padding: '5px 16px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: r.scaduta ? '#dc2626' : '#374151', fontWeight: r.scaduta ? 600 : 400 }}>
                                          {r.scadenza ? new Date(r.scadenza).toLocaleDateString('it-IT') : '—'}
                                        </td>
                                        <td style={{ padding: '5px 16px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: r.scaduta ? '#dc2626' : '#6b7280', fontWeight: r.scaduta ? 600 : 400 }}>
                                          {r.gg !== null ? (r.gg < 0 ? `-${Math.abs(r.gg)}` : `+${r.gg}`) : '—'}
                                        </td>
                                        <td style={{ padding: '5px 16px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: r.scaduta ? '#dc2626' : '#1e3a8a' }}>
                                          € {euroShort(r.importo)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )
                          })}

                        <div style={{ background: '#f8faff', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #1e40af' }}>
                          <span style={{ fontWeight: 600, fontSize: 12, color: '#374151' }}>Totale {c.cliente}</span>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontWeight: 800, fontSize: 14, color: '#1e3a8a' }}>€ {euroShort(c.totale)}</span>
                            {c.scaduto > 0 && c.scaduto < c.totale && (
                              <span style={{ fontSize: 11, color: '#dc2626', marginLeft: 12 }}>di cui scaduto: € {euroShort(c.scaduto)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    <div style={{ border: '3px solid #1e3a8a', borderRadius: 8, padding: '16px 20px', background: '#eff6ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 15, color: '#1e3a8a' }}>TOTALE GENERALE</p>
                        <p style={{ fontSize: 12, color: '#6b7280' }}>{perCliente.length} clienti · {rateIncassareFiltrate.length} rate aperte</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 24, fontWeight: 900, color: '#1e3a8a' }}>€ {euroShort(totaleIncassare)}</p>
                        {scadutoIncassare > 0 && (
                          <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>🔴 Scaduto: € {euroShort(scadutoIncassare)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }

          body * { visibility: hidden; }
          #report-incassare, #report-incassare * { visibility: visible; }

          /* IMPORTANTE: nessun position:fixed/absolute qui. Il contenuto deve restare
             nel flusso normale del documento perché il browser possa impaginarlo
             correttamente su più pagine. position:fixed ancorava il blocco alla prima
             pagina e tagliava via tutto ciò che eccedeva quell'altezza. */
          #report-incassare {
            position: static !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            font-size: 11px;
          }

          /* Rimuove i vincoli di scroll/altezza di main e dei contenitori genitori,
             pensati per lo schermo, che altrimenti tagliano il contenuto in stampa */
          main {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            width: 100% !important;
            max-width: 100% !important;
            flex: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* La Sidebar resta nel DOM con visibility:hidden ma il layout flex le riserva
             comunque spazio fisico, lasciando un vuoto a destra del contenuto stampato.
             Annullando il flex sul contenitore esterno, il main torna a occupare
             tutta la larghezza del foglio invece di restare schiacciato a sinistra. */
          .flex.min-h-screen {
            display: block !important;
          }

          /* Ogni blocco cliente non si spezza a metà tra due pagine */
          div[style*="page-break-inside"] {
            break-inside: avoid !important;
          }

          /* L'intestazione formale (logo + dati aziendali) non si spezza tra due pagine */
          .report-header {
            break-inside: avoid !important;
            break-after: avoid !important;
          }

          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
