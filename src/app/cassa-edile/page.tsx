'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const AZIENDE = ['BC General Service', 'Atena', 'Beta', 'Omega']
const STATI_AZ = ['attivo', 'sospeso', 'chiudere'] as const
const STATO_LABEL: Record<string, { label: string; cls: string }> = {
  attivo:   { label: 'Attivo',   cls: 'bg-green-100 text-green-800 border-green-300' },
  sospeso:  { label: 'Sospeso',  cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  chiudere: { label: 'Chiudere', cls: 'bg-red-100 text-red-800 border-red-300' },
}
function fmtOre(n: number) { return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1) }

export default function CassaEdilePage() {
  const oggi = new Date()
  const [mese, setMese] = useState(oggi.getMonth())
  const [anno, setAnno] = useState(oggi.getFullYear())
  const [tab, setTab] = useState<'smistamento' | 'resoconto' | 'cantieri_ce'>('smistamento')

  // Dati base
  const [dipendenti, setDipendenti] = useState<any[]>([])
  const [cantieriCE, setCantieriCE] = useState<any[]>([])
  const [aziendeCE, setAziendeCE] = useState<any[]>([])   // cantieri_ce_aziende
  const [assegnazioni, setAssegnazioni] = useState<any[]>([])
  const [presenzeApprovate, setPresenzeApprovate] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Modal assegna
  const [modalAssegna, setModalAssegna] = useState<{ dipendente: any; oreDisp: number } | null>(null)
  const [assegnazioniFrm, setAssegnazioniFrm] = useState<{ cantiere_ce_id: string; ore: string }[]>([])
  const [salvandoAssegna, setSalvandoAssegna] = useState(false)

  // Modal gestione cantiere CE (aziende + stati)
  const [modalGestCantiere, setModalGestCantiere] = useState<any | null>(null)
  const [statiAzFrm, setStatiAzFrm] = useState<Record<string, string>>({})
  const [salvandoStati, setSalvandoStati] = useState(false)

  // Modal nuovo cantiere CE
  const [modalNuovoCE, setModalNuovoCE] = useState(false)
  const [formCE, setFormCE] = useState({ numero: '', nome: '', indirizzo: '', note: '' })
  const [salvandoCE, setSalvandoCE] = useState(false)

  const meseData = `${anno}-${String(mese + 1).padStart(2, '0')}-01`

  useEffect(() => { load() }, [mese, anno])

  async function load() {
    setLoading(true)
    const dataInizio = meseData
    const dataFine = new Date(anno, mese + 1, 0).toISOString().split('T')[0]

    const [{ data: dip }, { data: ce }, { data: azCE }, { data: ass }, { data: pres }] = await Promise.all([
      supabase.from('dipendenti').select('id,nome,cognome,azienda,ordine,mansione').eq('attivo', true)
        .order('ordine', { nullsFirst: false }).order('cognome'),
      supabase.from('cantieri_ce').select('*').order('numero'),
      supabase.from('cantieri_ce_aziende').select('*'),
      supabase.from('ce_assegnazioni').select('*').eq('mese', meseData),
      supabase.from('presenze').select('dipendente_id,ore')
        .gte('data', dataInizio).lte('data', dataFine).eq('approvato', true).gt('ore', 0),
    ])
    setDipendenti(dip || [])
    setCantieriCE(ce || [])
    setAziendeCE(azCE || [])
    setAssegnazioni(ass || [])
    setPresenzeApprovate(pres || [])
    setLoading(false)
  }

  // ── Calcoli pool ─────────────────────────────────────────────────────────
  // Ore approvate per dipendente (da presenze × 8)
  const oreApprPerDip = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of presenzeApprovate) {
      m[p.dipendente_id] = (m[p.dipendente_id] || 0) + (p.ore || 0) * 8
    }
    return m
  }, [presenzeApprovate])

  // Ore già assegnate a CE per dipendente
  const oreAssPerDip = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of assegnazioni) {
      m[a.dipendente_id] = (m[a.dipendente_id] || 0) + (a.ore || 0)
    }
    return m
  }, [assegnazioni])

  // Pool: dipendenti con ore approvate, con residuo disponibile
  const pool = useMemo(() => {
    return dipendenti
      .filter(d => (oreApprPerDip[d.id] || 0) > 0)
      .map(d => ({
        ...d,
        oreTotali: oreApprPerDip[d.id] || 0,
        oreAssegnate: oreAssPerDip[d.id] || 0,
        oreDisp: Math.max(0, (oreApprPerDip[d.id] || 0) - (oreAssPerDip[d.id] || 0)),
      }))
  }, [dipendenti, oreApprPerDip, oreAssPerDip])

  // ── Assegna ore ─────────────────────────────────────────────────────────
  function apriAssegna(dip: any) {
    const oreDisp = Math.max(0, (oreApprPerDip[dip.id] || 0) - (oreAssPerDip[dip.id] || 0))
    // Pre-popola con assegnazioni esistenti
    const esistenti = assegnazioni.filter(a => a.dipendente_id === dip.id)
    const frm = cantieriCE.filter(c => c.attivo).map(c => {
      const es = esistenti.find(e => e.cantiere_ce_id === c.id)
      return { cantiere_ce_id: c.id, ore: es ? String(es.ore) : '' }
    })
    setAssegnazioniFrm(frm)
    setModalAssegna({ dipendente: dip, oreDisp })
  }

  async function salvaAssegna() {
    if (!modalAssegna) return
    const dip = modalAssegna.dipendente
    const oreTot = oreApprPerDip[dip.id] || 0
    const somma = assegnazioniFrm.reduce((s, f) => s + (parseFloat(f.ore) || 0), 0)
    if (somma > oreTot + 0.01) {
      alert(`Stai assegnando ${fmtOre(somma)}h ma ne hai solo ${fmtOre(oreTot)}h approvate.`); return
    }
    setSalvandoAssegna(true)
    // Elimina assegnazioni esistenti per questo dipendente in questo mese
    await supabase.from('ce_assegnazioni').delete()
      .eq('mese', meseData).eq('dipendente_id', dip.id)
    // Reinserisci quelle con ore > 0
    const daInserire = assegnazioniFrm
      .filter(f => (parseFloat(f.ore) || 0) > 0)
      .map(f => {
        const ce = cantieriCE.find(c => c.id === f.cantiere_ce_id)
        return {
          mese: meseData,
          cantiere_ce_id: f.cantiere_ce_id,
          cantiere_ce_nome: ce?.nome || '',
          dipendente_id: dip.id,
          dipendente_nome: `${dip.cognome} ${dip.nome}`,
          azienda: dip.azienda,
          ore: parseFloat(f.ore) || 0,
        }
      })
    if (daInserire.length > 0) {
      await supabase.from('ce_assegnazioni').insert(daInserire)
    }
    setSalvandoAssegna(false)
    setModalAssegna(null)
    load()
  }

  // ── Gestione stati aziende cantiere CE ──────────────────────────────────
  function apriGestCantiere(ce: any) {
    const init: Record<string, string> = {}
    for (const az of AZIENDE) {
      const found = aziendeCE.find(a => a.cantiere_ce_id === ce.id && a.azienda === az)
      init[az] = found?.stato || 'attivo'
    }
    setStatiAzFrm(init)
    setModalGestCantiere(ce)
  }

  async function salvaStatiAziende() {
    if (!modalGestCantiere) return
    setSalvandoStati(true)
    for (const az of AZIENDE) {
      await supabase.from('cantieri_ce_aziende').upsert({
        cantiere_ce_id: modalGestCantiere.id,
        azienda: az,
        stato: statiAzFrm[az] || 'attivo',
      }, { onConflict: 'cantiere_ce_id,azienda' })
    }
    setSalvandoStati(false)
    setModalGestCantiere(null)
    load()
  }

  // ── CRUD cantieri CE ────────────────────────────────────────────────────
  async function salvaNuovoCE() {
    if (!formCE.numero || !formCE.nome) { alert('Inserisci numero e nome'); return }
    setSalvandoCE(true)
    await supabase.from('cantieri_ce').insert({
      numero: formCE.numero, nome: formCE.nome,
      indirizzo: formCE.indirizzo || null, note: formCE.note || null
    })
    setSalvandoCE(false)
    setModalNuovoCE(false)
    setFormCE({ numero: '', nome: '', indirizzo: '', note: '' })
    load()
  }

  async function archiviaCantieresCE(id: string) {
    await supabase.from('cantieri_ce').update({ attivo: false }).eq('id', id)
    load()
  }

  async function riattivaCantieresCE(id: string) {
    await supabase.from('cantieri_ce').update({ attivo: true }).eq('id', id)
    load()
  }

  // ── Calcoli resoconto ───────────────────────────────────────────────────
  const riepilogoCE = useMemo(() => {
    return cantieriCE.filter(c => c.attivo).map(ce => {
      const ass = assegnazioni.filter(a => a.cantiere_ce_id === ce.id)
      const totOre = ass.reduce((s, a) => s + (a.ore || 0), 0)
      const perAzienda: Record<string, number> = {}
      for (const a of ass) { perAzienda[a.azienda] = (perAzienda[a.azienda] || 0) + (a.ore || 0) }
      const aziende = aziendeCE.filter(a => a.cantiere_ce_id === ce.id)
      return { ce, ass, totOre, perAzienda, aziende }
    })
  }, [cantieriCE, assegnazioni, aziendeCE])

  const meseStr = `${MESI[mese]} ${anno}`

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden" style={{ height: '100vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold">🏗️ Cassa Edile</h1>
            <p className="text-xs text-gray-500 mt-0.5">Smistamento ore approvate sui cantieri CE — {meseStr}</p>
          </div>
          <div className="flex gap-2 items-center">
            <select className="input w-36 text-sm" value={mese} onChange={e => setMese(Number(e.target.value))}>
              {MESI.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="input w-24 text-sm" value={anno} onChange={e => setAnno(Number(e.target.value))}>
              {[anno - 1, anno, anno + 1].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button className="btn btn-sm" onClick={() => window.print()}>🖨️ Stampa</button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 px-6 pt-3 border-b border-gray-200 flex-shrink-0">
          {([
            { key: 'smistamento', label: '↔️ Smistamento ore' },
            { key: 'resoconto', label: '📊 Resoconto CE' },
            { key: 'cantieri_ce', label: '⚙️ Cantieri CE' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors mr-1 ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading && <p className="text-gray-400 text-center py-12">Caricamento...</p>}

          {/* ── TAB SMISTAMENTO ── */}
          {!loading && tab === 'smistamento' && (
            <div className="flex gap-4 h-full">

              {/* Pool ore approvate */}
              <div className="w-72 flex-shrink-0">
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <p className="text-sm font-semibold text-gray-700">Pool ore approvate</p>
                    <p className="text-xs text-gray-500 mt-0.5">{meseStr} — clicca un dipendente per smistare</p>
                  </div>
                  {pool.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">
                      <p className="text-2xl mb-2">📋</p>
                      <p>Nessuna presenza approvata per {meseStr}</p>
                      <p className="text-xs mt-1">Approva le presenze dalla pagina Programmi</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-[calc(100vh-220px)] overflow-y-auto">
                      {pool.map(d => {
                        const tutteAssegnate = d.oreDisp < 0.1
                        return (
                          <button key={d.id} onClick={() => apriAssegna(d)}
                            className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 ${tutteAssegnate ? 'opacity-50' : ''}`}>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{d.cognome} {d.nome}</p>
                              <p className="text-xs text-gray-500 truncate">{d.azienda}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className={`text-sm font-bold ${tutteAssegnate ? 'text-green-600' : d.oreAssegnate > 0 ? 'text-amber-600' : 'text-gray-700'}`}>
                                {fmtOre(d.oreDisp)}h
                              </p>
                              {d.oreAssegnate > 0 && (
                                <p className="text-xs text-gray-400">{fmtOre(d.oreTotali)}h tot</p>
                              )}
                              {tutteAssegnate && <p className="text-xs text-green-600">✓ ok</p>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {pool.length > 0 && (
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex justify-between text-xs text-gray-500">
                      <span>Tot. approvate:</span>
                      <span className="font-semibold">{fmtOre(pool.reduce((s, d) => s + d.oreTotali, 0))}h</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Cantieri CE con assegnazioni */}
              <div className="flex-1 overflow-y-auto space-y-4">
                {cantieriCE.filter(c => c.attivo).length === 0 ? (
                  <div className="text-center text-gray-400 py-16 bg-white rounded-xl border border-dashed border-gray-300">
                    <p className="text-3xl mb-2">🏗️</p>
                    <p className="text-sm">Nessun cantiere CE attivo.</p>
                    <button className="mt-3 btn btn-sm btn-primary" onClick={() => setTab('cantieri_ce')}>⚙️ Crea cantiere CE</button>
                  </div>
                ) : cantieriCE.filter(c => c.attivo).map(ce => {
                  const assCE = assegnazioni.filter(a => a.cantiere_ce_id === ce.id)
                  const aziendeCantiere = aziendeCE.filter(a => a.cantiere_ce_id === ce.id)
                  const oreToTCE = assCE.reduce((s, a) => s + (a.ore || 0), 0)
                  return (
                    <div key={ce.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      {/* Header cantiere CE */}
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded">{ce.numero}</span>
                          <div>
                            <p className="font-semibold text-sm">{ce.nome}</p>
                            {ce.indirizzo && <p className="text-xs text-gray-400">{ce.indirizzo}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">{fmtOre(oreToTCE)}h assegnate</span>
                          <button onClick={() => apriGestCantiere(ce)}
                            className="text-xs border border-gray-600 px-2 py-0.5 rounded hover:bg-white/10 transition-colors">
                            ⚙️ Stato aziende
                          </button>
                        </div>
                      </div>

                      {/* Stato aziende */}
                      {aziendeCantiere.length > 0 && (
                        <div className="flex gap-2 px-4 py-2 bg-gray-800 border-t border-gray-700 flex-wrap">
                          {aziendeCantiere.map(az => (
                            <span key={az.id} className={`text-xs px-2 py-0.5 rounded border font-medium ${STATO_LABEL[az.stato]?.cls || 'bg-gray-100 text-gray-600'}`}>
                              {az.azienda}: {STATO_LABEL[az.stato]?.label || az.stato}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Lista dipendenti assegnati */}
                      {assCE.length === 0 ? (
                        <div className="px-4 py-4 text-center text-gray-400 text-xs">
                          Nessuno smistato su questo cantiere — clicca un dipendente nel pool
                        </div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Dipendente</th>
                              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Azienda</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Ore CE</th>
                              <th className="px-4 py-2 text-xs font-medium text-gray-500"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {assCE.map(a => (
                              <tr key={a.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 font-medium">{a.dipendente_nome}</td>
                                <td className="px-4 py-2 text-gray-500 text-xs">{a.azienda}</td>
                                <td className="px-4 py-2 text-right font-semibold text-blue-700">{fmtOre(a.ore)}h</td>
                                <td className="px-4 py-2 text-right">
                                  <button className="text-xs text-gray-400 hover:text-blue-600"
                                    onClick={() => { const dip = dipendenti.find(d => d.id === a.dipendente_id); if (dip) apriAssegna(dip) }}>
                                    ✏️
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-200 bg-gray-50">
                              <td colSpan={2} className="px-4 py-2 text-xs text-gray-500 font-medium">Totale cantiere</td>
                              <td className="px-4 py-2 text-right font-bold text-gray-900">{fmtOre(oreToTCE)}h</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── TAB RESOCONTO ── */}
          {!loading && tab === 'resoconto' && (
            <div id="report-ce">
              {/* Header stampa */}
              <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-800 print-only hidden print:flex">
                <div><p style={{ fontSize: 14, fontWeight: 800 }}>BC GENERAL SERVICE</p><p style={{ fontSize: 10, color: '#6b7280' }}>Cassa Edile — {meseStr}</p></div>
                <div style={{ textAlign: 'right' }}><p style={{ fontSize: 12, fontWeight: 700 }}>ORE CASSA EDILE PER PERSONA</p><p style={{ fontSize: 10, color: '#6b7280' }}>Data: {new Date().toLocaleDateString('it-IT')}</p></div>
              </div>

              {riepilogoCE.length === 0 ? (
                <div className="text-center text-gray-400 py-16"><p className="text-3xl mb-2">📊</p><p>Nessun dato CE per {meseStr}</p></div>
              ) : (
                <div className="space-y-6">
                  {/* Resoconto per cantiere CE */}
                  {riepilogoCE.map(({ ce, ass, totOre, perAzienda, aziende }) => (
                    <div key={ce.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm" style={{ pageBreakInside: 'avoid' }}>
                      {/* Header cantiere CE */}
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded">{ce.numero}</span>
                          <div>
                            <p className="font-semibold text-sm">{ce.nome}</p>
                            {ce.indirizzo && <p className="text-xs text-gray-400">{ce.indirizzo}</p>}
                          </div>
                        </div>
                        <span className="text-sm font-bold">{fmtOre(totOre)}h totali</span>
                      </div>

                      {/* Stato operativo per azienda */}
                      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Stato operativo</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {AZIENDE.map(az => {
                            const azInfo = aziende.find(a => a.azienda === az)
                            const stato = azInfo?.stato || 'attivo'
                            const oreAz = perAzienda[az] || 0
                            return (
                              <div key={az} className={`rounded-lg border px-3 py-2 ${STATO_LABEL[stato]?.cls || 'bg-gray-50 border-gray-200'}`}>
                                <p className="text-xs font-semibold truncate">{az}</p>
                                <p className="text-xs mt-0.5 capitalize font-medium">{STATO_LABEL[stato]?.label || stato}</p>
                                {oreAz > 0 && <p className="text-xs mt-0.5 font-bold">{fmtOre(oreAz)}h</p>}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Dettaglio per persona */}
                      {ass.length > 0 && (
                        <div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100 bg-gray-50">
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Nominativo</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Azienda</th>
                                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Ore CE</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {ass.sort((a, b) => a.dipendente_nome.localeCompare(b.dipendente_nome)).map(a => (
                                <tr key={a.id}>
                                  <td className="px-4 py-2 font-medium">{a.dipendente_nome}</td>
                                  <td className="px-4 py-2 text-gray-500 text-xs">{a.azienda}</td>
                                  <td className="px-4 py-2 text-right font-semibold text-blue-700">{fmtOre(a.ore)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-gray-200 bg-gray-50">
                                <td colSpan={2} className="px-4 py-2 font-bold text-gray-700">Totale</td>
                                <td className="px-4 py-2 text-right font-bold text-gray-900">{fmtOre(totOre)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                      {ce.note && <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">{ce.note}</div>}
                    </div>
                  ))}

                  {/* Tabella pivot Tot */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm" style={{ pageBreakInside: 'avoid' }}>
                    <div className="px-4 py-3 bg-gray-900 text-white">
                      <p className="font-semibold text-sm">Riepilogo Tot — {meseStr}</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="text-xs border-collapse w-full" style={{ minWidth: 500 }}>
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-3 py-2 text-left font-semibold sticky left-0 bg-gray-100 z-10 min-w-40">Nominativo</th>
                            <th className="border border-gray-300 px-2 py-2 text-left font-semibold min-w-24">Azienda</th>
                            {riepilogoCE.map(r => (
                              <th key={r.ce.id} className="border border-gray-300 px-2 py-2 text-center font-semibold min-w-16">
                                <span className="block text-xs text-gray-500">{r.ce.numero}</span>
                                <span className="block">{r.ce.nome.length > 12 ? r.ce.nome.slice(0,12)+'…' : r.ce.nome}</span>
                              </th>
                            ))}
                            <th className="border border-gray-300 px-2 py-2 text-center font-bold bg-blue-50 min-w-14">Tot.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dipendenti.filter(d => oreApprPerDip[d.id] > 0).map((d, i) => {
                            const tot = oreApprPerDip[d.id] || 0
                            return (
                              <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="border border-gray-200 px-3 py-1.5 font-medium sticky left-0 bg-inherit z-10">{d.cognome} {d.nome}</td>
                                <td className="border border-gray-200 px-2 py-1.5 text-gray-500">{d.azienda}</td>
                                {riepilogoCE.map(r => {
                                  const a = r.ass.find(x => x.dipendente_id === d.id)
                                  return (
                                    <td key={r.ce.id} className="border border-gray-200 text-center py-1">
                                      {a ? <span className="font-semibold text-blue-700">{fmtOre(a.ore)}</span> : <span className="text-gray-200">—</span>}
                                    </td>
                                  )
                                })}
                                <td className="border border-gray-200 text-center font-bold bg-blue-50 py-1">{fmtOre(tot)}</td>
                              </tr>
                            )
                          })}
                          <tr className="bg-gray-900 text-white font-bold">
                            <td colSpan={2} className="border border-gray-700 px-3 py-2">TOTALE</td>
                            {riepilogoCE.map(r => (
                              <td key={r.ce.id} className="border border-gray-700 text-center py-1">{fmtOre(r.totOre)}</td>
                            ))}
                            <td className="border border-gray-700 text-center py-1">{fmtOre(assegnazioni.reduce((s, a) => s + (a.ore||0), 0))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB CANTIERI CE ── */}
          {!loading && tab === 'cantieri_ce' && (
            <div className="max-w-3xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-sm">Gestione cantieri Cassa Edile</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Aggiungi, modifica e archivia i cantieri CE</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setModalNuovoCE(true)}>+ Nuovo cantiere CE</button>
              </div>

              {/* Attivi */}
              <div className="space-y-2 mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Attivi ({cantieriCE.filter(c => c.attivo).length})</p>
                {cantieriCE.filter(c => c.attivo).length === 0 && (
                  <div className="text-center text-gray-400 py-8 bg-white rounded-xl border border-dashed border-gray-300">Nessun cantiere CE. Aggiungine uno.</div>
                )}
                {cantieriCE.filter(c => c.attivo).map(ce => {
                  const azCantiere = aziendeCE.filter(a => a.cantiere_ce_id === ce.id)
                  return (
                    <div key={ce.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded flex-shrink-0">{ce.numero}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{ce.nome}</p>
                        {ce.indirizzo && <p className="text-xs text-gray-500">{ce.indirizzo}</p>}
                        {ce.note && <p className="text-xs text-gray-400 italic mt-0.5">{ce.note}</p>}
                        {azCantiere.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {azCantiere.map(az => (
                              <span key={az.id} className={`text-xs px-2 py-0.5 rounded border ${STATO_LABEL[az.stato]?.cls || 'bg-gray-100'}`}>
                                {az.azienda}: {STATO_LABEL[az.stato]?.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button onClick={() => apriGestCantiere(ce)} className="btn btn-sm text-xs py-1">⚙️ Stato</button>
                        <button onClick={() => archiviaCantieresCE(ce.id)} className="btn btn-sm text-xs py-1 text-amber-600 border-amber-200 hover:bg-amber-50">📦 Archivia</button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Archiviati */}
              {cantieriCE.filter(c => !c.attivo).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Archiviati ({cantieriCE.filter(c => !c.attivo).length})</p>
                  <div className="space-y-2">
                    {cantieriCE.filter(c => !c.attivo).map(ce => (
                      <div key={ce.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3 opacity-60">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded">{ce.numero}</span>
                          <p className="text-sm text-gray-600">{ce.nome}</p>
                        </div>
                        <button onClick={() => riattivaCantieresCE(ce.id)} className="btn btn-sm text-xs py-1 text-green-600 border-green-200 hover:bg-green-50">♻️ Riattiva</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* MODAL ASSEGNA ORE */}
      {modalAssegna && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">↔️ Smista ore — {modalAssegna.dipendente.cognome} {modalAssegna.dipendente.nome}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {modalAssegna.dipendente.azienda} · Ore approvate: <strong>{fmtOre(oreApprPerDip[modalAssegna.dipendente.id] || 0)}h</strong>
                </p>
              </div>
              <button onClick={() => setModalAssegna(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500">Inserisci le ore da assegnare ad ogni cantiere CE (lascia vuoto per nessuna).</p>
              {cantieriCE.filter(c => c.attivo).map((ce, i) => (
                <div key={ce.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ce.numero} — {ce.nome}</p>
                  </div>
                  <input className="input w-24 text-right font-semibold" type="number" step="0.5" min="0"
                    placeholder="0"
                    value={assegnazioniFrm[i]?.ore || ''}
                    onChange={e => {
                      const n = [...assegnazioniFrm]
                      n[i] = { ...n[i], ore: e.target.value }
                      setAssegnazioniFrm(n)
                    }} />
                  <span className="text-xs text-gray-400 w-4">h</span>
                </div>
              ))}
              {/* Riepilogo */}
              <div className="border-t border-gray-100 pt-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Totale assegnato:</span>
                  <span className={`font-semibold ${assegnazioniFrm.reduce((s, f) => s + (parseFloat(f.ore)||0), 0) > (oreApprPerDip[modalAssegna.dipendente.id]||0) + 0.01 ? 'text-red-600' : 'text-gray-700'}`}>
                    {fmtOre(assegnazioniFrm.reduce((s, f) => s + (parseFloat(f.ore)||0), 0))}h / {fmtOre(oreApprPerDip[modalAssegna.dipendente.id]||0)}h
                  </span>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button className="btn" onClick={() => setModalAssegna(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaAssegna} disabled={salvandoAssegna}>
                {salvandoAssegna ? 'Salvataggio...' : '✅ Salva smistamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL STATO AZIENDE CANTIERE CE */}
      {modalGestCantiere && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">⚙️ Stato operativo — {modalGestCantiere.numero} {modalGestCantiere.nome}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Imposta lo stato di ogni azienda su questo cantiere CE</p>
              </div>
              <button onClick={() => setModalGestCantiere(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              {AZIENDE.map(az => (
                <div key={az} className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium w-36">{az}</p>
                  <div className="flex gap-1 flex-1">
                    {STATI_AZ.map(s => (
                      <button key={s} onClick={() => setStatiAzFrm(f => ({ ...f, [az]: s }))}
                        className={`flex-1 text-xs py-1.5 rounded border transition-colors ${statiAzFrm[az] === s ? STATO_LABEL[s].cls + ' font-semibold' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'}`}>
                        {STATO_LABEL[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button className="btn" onClick={() => setModalGestCantiere(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaStatiAziende} disabled={salvandoStati}>
                {salvandoStati ? 'Salvataggio...' : 'Salva stato'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUOVO CANTIERE CE */}
      {modalNuovoCE && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold">+ Nuovo cantiere CE</h2>
              <button onClick={() => setModalNuovoCE(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Numero *</label>
                  <input className="input" placeholder="es. 1, CE-001..." value={formCE.numero} onChange={e => setFormCE(f => ({ ...f, numero: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Nome cantiere..." value={formCE.nome} onChange={e => setFormCE(f => ({ ...f, nome: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Indirizzo</label>
                <input className="input" placeholder="Via, comune..." value={formCE.indirizzo} onChange={e => setFormCE(f => ({ ...f, indirizzo: e.target.value }))} />
              </div>
              <div>
                <label className="label">Note</label>
                <input className="input" value={formCE.note} onChange={e => setFormCE(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button className="btn" onClick={() => setModalNuovoCE(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaNuovoCE} disabled={salvandoCE}>
                {salvandoCE ? 'Salvataggio...' : 'Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body * { visibility: hidden !important; }
          #report-ce, #report-ce * { visibility: visible !important; }
          #report-ce { position: static !important; width: 100% !important; padding: 0 !important; }
          aside, header { display: none !important; }
        }
      `}</style>
    </div>
  )
}
