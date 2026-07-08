'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

// ── COSTANTI GLOBALI ORDINE DIPENDENTI ─────────────────────────────────────
// REGOLA: BC → Atena → Beta → Omega, poi ordine campo, poi cognome
const AZIENDE_ORD = ['BC General Service', 'Atena', 'Beta', 'Omega']
function sortDip(a: any, b: any) {
  const ai = AZIENDE_ORD.indexOf(a.azienda), bi = AZIENDE_ORD.indexOf(b.azienda)
  if (ai !== bi) return ai - bi
  const oa = a.ordine ?? 9999, ob = b.ordine ?? 9999
  if (oa !== ob) return oa - ob
  return (a.cognome || '').localeCompare(b.cognome || '')
}

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const STATI: Record<string, { label: string; cls: string; bg: string }> = {
  attivo:   { label: 'Attivo',   cls: 'text-green-800 bg-green-100 border-green-300',  bg: '#dcfce7' },
  sospeso:  { label: 'Sospeso',  cls: 'text-amber-800 bg-amber-100 border-amber-300',  bg: '#fef3c7' },
  chiudere: { label: 'Chiudere', cls: 'text-red-800 bg-red-100 border-red-300',        bg: '#fee2e2' },
}
function fmt(n: number) { return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1) }

export default function CassaEdilePage() {
  const ora = new Date()
  const [mese, setMese] = useState(ora.getMonth())
  const [anno, setAnno] = useState(ora.getFullYear())
  const [tab, setTab] = useState<'associazione'|'resoconto'|'cantieri_ce'>('associazione')
  const [tabReso, setTabReso] = useState<string>('tot')
  const [soc, setSoc] = useState<'BC General Service'|'Filosofia'>('BC General Service')

  const [dipendenti, setDipendenti]     = useState<any[]>([])
  const [cantieriCE, setCantieriCE]     = useState<any[]>([])
  const [aziendeCE, setAziendeCE]       = useState<any[]>([])
  const [assegnazioni, setAssegnazioni] = useState<any[]>([])
  const [presenze, setPresenze]         = useState<any[]>([])
  const [loading, setLoading]           = useState(true)

  // Modal assegna
  const [modalAss, setModalAss] = useState<{dip:any;cantiereReale:string;oreTot:number}|null>(null)
  const [frmAss, setFrmAss]     = useState<{cantiere_ce_id:string;ore:string}[]>([])
  const [salvAss, setSalvAss]   = useState(false)

  // Modal stato aziende
  const [modalStatoCE, setModalStatoCE] = useState<any|null>(null)
  const [frmStati, setFrmStati]         = useState<Record<string,string>>({})
  const [salvStati, setSalvStati]       = useState(false)

  // Modal CRUD cantiere CE
  const [modalCE, setModalCE] = useState<'nuovo'|'modifica'|null>(null)
  const [frmCE, setFrmCE]     = useState({id:'',numero:'',nome:'',indirizzo:'',note:''})
  const [salvCE, setSalvCE]   = useState(false)

  const meseKey = `${anno}-${String(mese+1).padStart(2,'0')}-01`

  useEffect(() => { load() }, [mese, anno, soc])

  async function load() {
    setLoading(true)
    const inizio = meseKey
    const fine = new Date(anno, mese+1, 0).toISOString().split('T')[0]
    const [{ data: dip },{ data: ce },{ data: az },{ data: ass },{ data: pres }] = await Promise.all([
      supabase.from('dipendenti').select('id,nome,cognome,azienda,ordine').eq('attivo',true),
      supabase.from('cantieri_ce').select('*'),
      supabase.from('cantieri_ce_aziende').select('*'),
      supabase.from('ce_assegnazioni').select('*').eq('mese', meseKey),
      supabase.from('presenze').select('dipendente_id,ore,cantiere_nome')
        .gte('data',inizio).lte('data',fine).eq('approvato',true).gt('ore',0).eq('societa',soc),
    ])
    setDipendenti(((dip||[]) as any[]).sort(sortDip))
    setCantieriCE(((ce||[]) as any[]).sort((a:any,b:any)=>(parseInt(a.numero)||0)-(parseInt(b.numero)||0)))
    setAziendeCE(az||[])
    setAssegnazioni(ass||[])
    setPresenze(pres||[])
    setLoading(false)
  }

  // ── Calcoli ─────────────────────────────────────────────────────────────
  const oreAppr = useMemo(() => {
    const m: Record<string,number> = {}
    for (const p of presenze) m[p.dipendente_id] = (m[p.dipendente_id]||0) + (p.ore||0)*8
    return m
  }, [presenze])

  const cantiereReale = useMemo(() => {
    const m: Record<string, Record<string,number>> = {}
    for (const p of presenze) {
      if (!p.cantiere_nome) continue
      if (!m[p.dipendente_id]) m[p.dipendente_id] = {}
      m[p.dipendente_id][p.cantiere_nome] = (m[p.dipendente_id][p.cantiere_nome]||0) + (p.ore||0)*8
    }
    const r: Record<string,string> = {}
    for (const [id, mp] of Object.entries(m))
      r[id] = Object.entries(mp).sort((a,b)=>b[1]-a[1])[0]?.[0]||''
    return r
  }, [presenze])

  const oreAss = useMemo(() => {
    const m: Record<string,number> = {}
    for (const a of assegnazioni) m[a.dipendente_id] = (m[a.dipendente_id]||0) + (a.ore||0)
    return m
  }, [assegnazioni])

  const pool = useMemo(() =>
    dipendenti.filter(d => (oreAppr[d.id]||0) > 0).map(d => ({
      ...d, oreTot: oreAppr[d.id]||0, oreAss: oreAss[d.id]||0,
      oreDisp: Math.max(0,(oreAppr[d.id]||0)-(oreAss[d.id]||0)),
      cantReale: cantiereReale[d.id]||'—',
    })), [dipendenti, oreAppr, oreAss, cantiereReale])

  const assPerCE = useMemo(() => {
    const m: Record<string,any[]> = {}
    for (const a of assegnazioni) { if (!m[a.cantiere_ce_id]) m[a.cantiere_ce_id]=[]; m[a.cantiere_ce_id].push(a) }
    return m
  }, [assegnazioni])

  // ── Azioni ──────────────────────────────────────────────────────────────
  function apriAss(d: any) {
    const es = assegnazioni.filter(a => a.dipendente_id === d.id)
    setFrmAss(cantieriCE.filter(c=>c.attivo).map(c => {
      const e = es.find(x=>x.cantiere_ce_id===c.id)
      return { cantiere_ce_id:c.id, ore: e?String(e.ore):'' }
    }))
    setModalAss({ dip:d, cantiereReale:d.cantReale, oreTot:d.oreTot })
  }

  async function salvaAss() {
    if (!modalAss) return
    const somma = frmAss.reduce((s,f) => s+(parseFloat(f.ore)||0),0)
    if (somma > modalAss.oreTot+0.01) { alert(`Stai assegnando ${fmt(somma)}h ma ne hai solo ${fmt(modalAss.oreTot)}h`); return }
    setSalvAss(true)
    await supabase.from('ce_assegnazioni').delete().eq('mese',meseKey).eq('dipendente_id',modalAss.dip.id)
    const da = frmAss.filter(f=>(parseFloat(f.ore)||0)>0).map(f => {
      const ce = cantieriCE.find(c=>c.id===f.cantiere_ce_id)
      return { mese:meseKey, cantiere_ce_id:f.cantiere_ce_id, cantiere_ce_nome:ce?.nome||'', dipendente_id:modalAss.dip.id, dipendente_nome:`${modalAss.dip.cognome} ${modalAss.dip.nome}`, azienda:modalAss.dip.azienda, ore:parseFloat(f.ore)||0 }
    })
    if (da.length>0) await supabase.from('ce_assegnazioni').insert(da)
    setSalvAss(false); setModalAss(null); load()
  }

  function apriStatoCE(ce:any) {
    const init:Record<string,string>={}
    for (const az of AZIENDE_ORD) { const f=aziendeCE.find(a=>a.cantiere_ce_id===ce.id&&a.azienda===az); init[az]=f?.stato||'attivo' }
    setFrmStati(init); setModalStatoCE(ce)
  }

  async function salvaStatoCE() {
    if (!modalStatoCE) return; setSalvStati(true)
    for (const az of AZIENDE_ORD)
      await supabase.from('cantieri_ce_aziende').upsert({ cantiere_ce_id:modalStatoCE.id, azienda:az, stato:frmStati[az]||'attivo' },{ onConflict:'cantiere_ce_id,azienda' })
    setSalvStati(false); setModalStatoCE(null); load()
  }

  async function salvaCE() {
    if (!frmCE.numero||!frmCE.nome) { alert('Inserisci numero e nome'); return }
    setSalvCE(true)
    const p = { numero:frmCE.numero, nome:frmCE.nome, indirizzo:frmCE.indirizzo||null, note:frmCE.note||null }
    if (modalCE==='modifica') await supabase.from('cantieri_ce').update(p).eq('id',frmCE.id)
    else await supabase.from('cantieri_ce').insert({...p, attivo:true})
    setSalvCE(false); setModalCE(null); load()
  }

  async function archiviaOElimina(ce:any, azione:'archivia'|'riattiva'|'elimina') {
    if (azione==='elimina') { if (!confirm(`Eliminare "${ce.nome}"?`)) return; await supabase.from('cantieri_ce').delete().eq('id',ce.id) }
    else await supabase.from('cantieri_ce').update({ attivo: azione==='riattiva' }).eq('id',ce.id)
    load()
  }

  const meseStr = `${MESI[mese]} ${anno}`
  const ceAttivi = cantieriCE.filter(c=>c.attivo)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden" style={{ height:'100vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold">🏗️ Cassa Edile</h1>
            <p className="text-xs text-gray-500 mt-0.5">{meseStr} — {soc}</p>
          </div>
          <div className="flex gap-2 items-center">
            <select className="input w-36 text-sm" value={mese} onChange={e=>setMese(Number(e.target.value))}>
              {MESI.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <select className="input w-24 text-sm" value={anno} onChange={e=>setAnno(Number(e.target.value))}>
              {[anno-1,anno,anno+1].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
            <button className="btn btn-sm" onClick={()=>window.print()}>🖨️</button>
          </div>
        </div>

        {/* Tab BC / Filosofia */}
        <div className="flex gap-2 px-5 py-2 bg-white border-b border-gray-100 flex-shrink-0">
          {(['BC General Service','Filosofia'] as const).map(s=>(
            <button key={s} onClick={()=>setSoc(s)}
              className={`flex-1 py-1.5 rounded-lg border-2 text-sm font-bold transition-all ${
                s==='BC General Service'
                  ? soc===s ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-50 text-blue-700 border-blue-200'
                  : soc===s ? 'bg-orange-500 text-white border-orange-500' : 'bg-orange-50 text-orange-700 border-orange-200'
              }`}>{s==='BC General Service'?'🏗 BC General Service':'🏢 Filosofia'}</button>
          ))}
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 px-5 border-b border-gray-200 flex-shrink-0 bg-white">
          {([
            {k:'associazione',l:'↔️ Associazione ore CE'},
            {k:'resoconto',   l:'📊 Resoconto'},
            {k:'cantieri_ce', l:'⚙️ Cantieri CE'},
          ] as const).map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px mr-1 ${tab===t.k?'border-blue-600 text-blue-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.l}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {loading && <p className="text-gray-400 text-center py-12">Caricamento...</p>}

          {/* ══════════════════════════════════════════════════════
              TAB 1 — ASSOCIAZIONE ORE CE
          ══════════════════════════════════════════════════════ */}
          {!loading && tab==='associazione' && (
            <div className="flex gap-0 h-full">

              {/* Pool presenze approvate — ordinate per azienda→ordine→cognome */}
              <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-700">Presenze approvate</p>
                  <p className="text-xs text-gray-400">{pool.length} dipendenti · premi <strong>↔️ Associa</strong> per smistare le ore</p>
                </div>

                {pool.length===0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 text-center">
                    <p className="text-2xl mb-2">📋</p>
                    <p className="text-sm">Nessuna presenza approvata per {meseStr}</p>
                    <p className="text-xs mt-1">Approva le presenze dalla pagina Programmi</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto">
                    {AZIENDE_ORD.filter(az=>pool.some(d=>d.azienda===az)).map(az=>(
                      <div key={az}>
                        {/* Intestazione azienda */}
                        <div className="sticky top-0 px-3 py-1 bg-gray-800 text-white text-xs font-bold uppercase tracking-wide z-10">
                          {az}
                        </div>
                        {pool.filter(d=>d.azienda===az).map(d=>{
                          const tutteAss = d.oreDisp < 0.1
                          const parzAss = d.oreAss > 0 && !tutteAss
                          return (
                            <div key={d.id} className="border-b border-gray-100 px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-blue-50 transition-colors">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{d.cognome} {d.nome}</p>
                                <p className="text-xs text-gray-400 truncate">📍 {d.cantReale}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="text-right">
                                  <p className={`text-xs font-bold ${tutteAss?'text-green-600':parzAss?'text-amber-600':'text-gray-600'}`}>
                                    {tutteAss ? '✓ ok' : `${fmt(d.oreDisp)}h libere`}
                                  </p>
                                  {parzAss && <p className="text-xs text-gray-400">{fmt(d.oreAss)}/{fmt(d.oreTot)}h</p>}
                                </div>
                                <button onClick={()=>apriAss(d)}
                                  className="btn btn-sm text-xs py-1 px-2 bg-blue-600 text-white border-blue-600 hover:bg-blue-700 flex-shrink-0">
                                  ↔️ Associa
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer totali */}
                {pool.length>0 && (
                  <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex-shrink-0 text-xs text-gray-500 flex justify-between">
                    <span>Assegnate</span>
                    <span className="font-semibold">{fmt(pool.reduce((s,d)=>s+d.oreAss,0))}h / {fmt(pool.reduce((s,d)=>s+d.oreTot,0))}h</span>
                  </div>
                )}
              </div>

              {/* Cantieri CE con assegnazioni */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {ceAttivi.length===0 ? (
                  <div className="text-center text-gray-400 py-16 bg-white rounded-xl border-2 border-dashed border-gray-300">
                    <p className="text-3xl mb-2">🏗️</p><p>Nessun cantiere CE attivo.</p>
                    <button className="mt-3 btn btn-sm btn-primary" onClick={()=>setTab('cantieri_ce')}>⚙️ Gestisci cantieri CE</button>
                  </div>
                ) : ceAttivi.map(ce=>{
                  const assCE = (assPerCE[ce.id]||[]).sort((a:any,b:any)=>sortDip(
                    dipendenti.find((d:any)=>d.id===a.dipendente_id)||{azienda:'',ordine:9999,cognome:''},
                    dipendenti.find((d:any)=>d.id===b.dipendente_id)||{azienda:'',ordine:9999,cognome:''}
                  ))
                  const totCE = assCE.reduce((s:number,a:any)=>s+(a.ore||0),0)
                  const azStatoCE = aziendeCE.filter(a=>a.cantiere_ce_id===ce.id)
                  return (
                    <div key={ce.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 text-white">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-white/20 px-2 py-0.5 rounded">{ce.numero}</span>
                          <p className="font-semibold text-sm">{ce.nome}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {totCE>0 && <span className="text-xs text-gray-300">{fmt(totCE)}h</span>}
                          {azStatoCE.length>0 && azStatoCE.map(az=>(
                            <span key={az.id} className={`text-xs px-1.5 py-0.5 rounded border font-medium ${STATI[az.stato]?.cls||''}`}>
                              {az.azienda.split(' ')[0]}: {STATI[az.stato]?.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      {assCE.length===0 ? (
                        <p className="text-xs text-gray-400 text-center py-3 italic">Nessuno associato — usa il bottone <strong>↔️ Associa</strong> nel pannello a sinistra</p>
                      ) : (
                        <div>
                          {AZIENDE_ORD.filter(az=>assCE.some((a:any)=>a.azienda===az)).map(az=>(
                            <div key={az}>
                              <div className="px-3 py-1 bg-gray-100 text-xs font-semibold text-gray-600 border-b border-gray-200">{az}</div>
                              <div className="divide-y divide-gray-50">
                                {assCE.filter((a:any)=>a.azienda===az).map((a:any)=>(
                                  <div key={a.id} className="flex items-center justify-between px-4 py-1.5">
                                    <span className="text-sm text-gray-800">{a.dipendente_nome}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-blue-700">{fmt(a.ore)}h</span>
                                      <button className="text-xs text-gray-400 hover:text-blue-600"
                                        onClick={()=>{ const d=pool.find(x=>x.id===a.dipendente_id); if(d) apriAss(d) }}>✏️</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-200 flex justify-between text-xs font-semibold text-gray-600">
                            <span>Totale</span><span>{fmt(totCE)}h</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB 2 — RESOCONTO (Tot + singolo cantiere come Excel)
          ══════════════════════════════════════════════════════ */}
          {!loading && tab==='resoconto' && (
            <div id="report-ce" className="p-4">

              {/* Sub-tabs: Tot + un tab per cantiere CE */}
              <div className="flex gap-0 mb-4 border-b border-gray-200 overflow-x-auto">
                <button onClick={()=>setTabReso('tot')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex-shrink-0 ${tabReso==='tot'?'border-blue-600 text-blue-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  📊 Tot
                </button>
                {ceAttivi.map(ce=>(
                  <button key={ce.id} onClick={()=>setTabReso(ce.id)}
                    className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px flex-shrink-0 ${tabReso===ce.id?'border-blue-600 text-blue-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {ce.numero}. {ce.nome.length>14?ce.nome.slice(0,14)+'…':ce.nome}
                    {(assPerCE[ce.id]||[]).length>0 && <span className="ml-1 text-blue-500">·{(assPerCE[ce.id]||[]).length}</span>}
                  </button>
                ))}
              </div>

              {/* ─── Tot: pivot dipendenti × cantieri CE ─── */}
              {tabReso==='tot' && (
                <div className="overflow-x-auto">
                  {pool.length===0 ? (
                    <p className="text-gray-400 text-center py-12">Nessun dato per {meseStr}</p>
                  ) : (
                    <table className="text-xs border-collapse" style={{minWidth:500}}>
                      <thead>
                        <tr className="bg-gray-900 text-white">
                          <th className="border border-gray-600 px-3 py-2 text-left sticky left-0 bg-gray-900 z-10 min-w-40">Nominativo</th>
                          <th className="border border-gray-600 px-2 py-2 text-left min-w-24">Azienda</th>
                          {ceAttivi.map(ce=>(
                            <th key={ce.id} className="border border-gray-600 px-2 py-2 text-center min-w-16">
                              <span className="block text-gray-400 text-xs">{ce.numero}</span>
                              <span className="block text-xs">{ce.nome.length>10?ce.nome.slice(0,10)+'…':ce.nome}</span>
                            </th>
                          ))}
                          <th className="border border-gray-600 px-2 py-2 text-center font-bold bg-blue-900 min-w-14">Tot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {AZIENDE_ORD.filter(az=>pool.some(d=>d.azienda===az)).map(az=>(
                          <>
                            <tr key={`hd-${az}`}>
                              <td colSpan={ceAttivi.length+3}
                                className="border border-gray-300 px-3 py-1 bg-gray-800 text-white font-bold text-xs uppercase tracking-wide sticky left-0">
                                {az}
                              </td>
                            </tr>
                            {pool.filter(d=>d.azienda===az).map((d,i)=>(
                              <tr key={d.id} className={i%2===0?'bg-white':'bg-gray-50'}>
                                <td className="border border-gray-200 px-3 py-1.5 font-medium sticky left-0 bg-inherit z-10">{d.cognome} {d.nome}</td>
                                <td className="border border-gray-200 px-2 py-1.5 text-gray-400">{d.azienda}</td>
                                {ceAttivi.map(ce=>{
                                  const a = (assPerCE[ce.id]||[]).find((x:any)=>x.dipendente_id===d.id)
                                  return (
                                    <td key={ce.id} className="border border-gray-200 text-center py-1">
                                      {a ? <span className="font-semibold text-blue-700">{fmt(a.ore)}</span> : <span className="text-gray-200">—</span>}
                                    </td>
                                  )
                                })}
                                <td className="border border-gray-200 text-center font-bold bg-blue-50 py-1">{fmt(d.oreTot)}</td>
                              </tr>
                            ))}
                          </>
                        ))}
                        {/* Riga totali */}
                        <tr className="bg-gray-900 text-white font-bold">
                          <td colSpan={2} className="border border-gray-700 px-3 py-2 sticky left-0 bg-gray-900">TOTALE</td>
                          {ceAttivi.map(ce=>(
                            <td key={ce.id} className="border border-gray-700 text-center py-1">
                              {fmt((assPerCE[ce.id]||[]).reduce((s:number,a:any)=>s+(a.ore||0),0))}
                            </td>
                          ))}
                          <td className="border border-gray-700 text-center py-1 bg-blue-900">
                            {fmt(assegnazioni.reduce((s,a)=>s+(a.ore||0),0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ─── Singolo cantiere CE (come foglio Excel) ─── */}
              {tabReso!=='tot' && (() => {
                const ce = cantieriCE.find(c=>c.id===tabReso)
                if (!ce) return null
                const assCE = [...(assPerCE[ce.id]||[])].sort((a:any,b:any)=>sortDip(
                  dipendenti.find((d:any)=>d.id===a.dipendente_id)||{azienda:'',ordine:9999,cognome:''},
                  dipendenti.find((d:any)=>d.id===b.dipendente_id)||{azienda:'',ordine:9999,cognome:''}
                ))
                const azStatoCE = aziendeCE.filter(a=>a.cantiere_ce_id===ce.id)
                const totCE = assCE.reduce((s:number,a:any)=>s+(a.ore||0),0)
                return (
                  <div style={{pageBreakInside:'avoid'}}>
                    {/* Header cantiere */}
                    <div className="flex items-center justify-between px-5 py-3 bg-gray-900 text-white rounded-t-xl">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm bg-white/20 px-2 py-0.5 rounded">{ce.numero}</span>
                        <div>
                          <p className="font-bold text-base">{ce.nome}</p>
                          {ce.indirizzo && <p className="text-xs text-gray-400">{ce.indirizzo}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{fmt(totCE)}h totali</p>
                        <p className="text-xs text-gray-400">{meseStr}</p>
                      </div>
                    </div>

                    {/* Stato operativo aziende */}
                    <div className="grid grid-cols-4 gap-3 p-4 bg-gray-800">
                      {AZIENDE_ORD.map(az=>{
                        const azInfo = azStatoCE.find(a=>a.azienda===az)
                        const stato = azInfo?.stato || 'attivo'
                        const oreAz = assCE.filter((a:any)=>a.azienda===az).reduce((s:number,a:any)=>s+(a.ore||0),0)
                        return (
                          <div key={az} className={`rounded-lg border px-3 py-2 ${STATI[stato]?.cls||'bg-gray-100 border-gray-200'}`}>
                            <p className="text-xs font-semibold">{az.split(' ')[0]}</p>
                            <p className="text-xs capitalize mt-0.5 font-medium">{STATI[stato]?.label}</p>
                            {oreAz>0 && <p className="text-xs font-bold mt-0.5">{fmt(oreAz)}h</p>}
                          </div>
                        )
                      })}
                    </div>

                    {/* Dettaglio per azienda → dipendente */}
                    {assCE.length===0 ? (
                      <div className="text-center text-gray-400 py-8 bg-white border border-t-0 border-gray-200 rounded-b-xl">
                        Nessun dipendente associato a questo cantiere CE
                      </div>
                    ) : (
                      <div className="border border-t-0 border-gray-200 rounded-b-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-100 border-b border-gray-200">
                              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Nominativo</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Azienda</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Mansione</th>
                              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Ore CE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {AZIENDE_ORD.filter(az=>assCE.some((a:any)=>a.azienda===az)).map(az=>(
                              <>
                                <tr key={`az-${az}`} className="bg-gray-50">
                                  <td colSpan={4} className="px-4 py-1 text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-200">{az}</td>
                                </tr>
                                {assCE.filter((a:any)=>a.azienda===az).map((a:any,i:number)=>{
                                  const dip = dipendenti.find((d:any)=>d.id===a.dipendente_id)
                                  return (
                                    <tr key={a.id} className={`border-b border-gray-100 ${i%2===0?'bg-white':'bg-gray-50'}`}>
                                      <td className="px-4 py-2 font-medium">{a.dipendente_nome}</td>
                                      <td className="px-4 py-2 text-gray-500 text-xs">{a.azienda}</td>
                                      <td className="px-4 py-2 text-gray-400 text-xs">{dip?.mansione||'—'}</td>
                                      <td className="px-4 py-2 text-right font-bold text-blue-700">{fmt(a.ore)}</td>
                                    </tr>
                                  )
                                })}
                              </>
                            ))}
                            <tr className="bg-gray-900 text-white">
                              <td colSpan={3} className="px-4 py-2 font-bold">Totale {ce.nome}</td>
                              <td className="px-4 py-2 text-right font-bold">{fmt(totCE)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB 3 — CANTIERI CE: riga stati + tabelle dettaglio
          ══════════════════════════════════════════════════════ */}
          {!loading && tab==='cantieri_ce' && (
            <div className="p-4 space-y-6">

              {/* Bottone nuovo */}
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">Gestione cantieri Cassa Edile</h2>
                <button className="btn btn-primary btn-sm"
                  onClick={()=>{ setFrmCE({id:'',numero:'',nome:'',indirizzo:'',note:''}); setModalCE('nuovo') }}>
                  + Nuovo cantiere CE
                </button>
              </div>

              {/* ── RIGA STATI (come PDF) ── */}
              {cantieriCE.length>0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold uppercase tracking-wide">
                    Stato operativo per azienda — {meseStr}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-200">
                          <th className="text-left px-3 py-2 font-semibold text-gray-600 min-w-28">Azienda</th>
                          {cantieriCE.map(ce=>(
                            <th key={ce.id} className="text-center px-2 py-2 font-semibold text-gray-600 min-w-20">
                              <span className="block font-mono text-gray-400">{ce.numero}</span>
                              <span className="block truncate max-w-20">{ce.nome.length>10?ce.nome.slice(0,10)+'…':ce.nome}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {AZIENDE_ORD.map((az,i)=>(
                          <tr key={az} className={i%2===0?'bg-white':'bg-gray-50'}>
                            <td className="px-3 py-2 font-semibold text-gray-800">{az}</td>
                            {cantieriCE.map(ce=>{
                              const info = aziendeCE.find(a=>a.cantiere_ce_id===ce.id && a.azienda===az)
                              const stato = info?.stato||'attivo'
                              return (
                                <td key={ce.id} className="text-center px-1 py-1.5">
                                  <span className={`text-xs px-2 py-0.5 rounded border font-medium inline-block ${STATI[stato]?.cls||''}`}>
                                    {STATI[stato]?.label}
                                  </span>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── DETTAGLIO PER CANTIERE CE (in ordine di numero) ── */}
              <div className="space-y-4">
                {cantieriCE.map(ce=>{
                  const assCE = [...(assPerCE[ce.id]||[])].sort((a:any,b:any)=>sortDip(
                    dipendenti.find((d:any)=>d.id===a.dipendente_id)||{azienda:'',ordine:9999,cognome:''},
                    dipendenti.find((d:any)=>d.id===b.dipendente_id)||{azienda:'',ordine:9999,cognome:''}
                  ))
                  const totCE = assCE.reduce((s:number,a:any)=>s+(a.ore||0),0)
                  const azStatoCE = aziendeCE.filter(a=>a.cantiere_ce_id===ce.id)
                  return (
                    <div key={ce.id} className={`bg-white border rounded-xl overflow-hidden shadow-sm ${!ce.attivo?'opacity-50':''}`}>
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 text-white">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-white/20 px-2 py-0.5 rounded">{ce.numero}</span>
                          <div>
                            <p className="font-semibold text-sm">{ce.nome}</p>
                            {ce.indirizzo && <p className="text-xs text-gray-400">{ce.indirizzo}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {totCE>0 && <span className="text-xs text-gray-300 mr-2">{fmt(totCE)}h</span>}
                          <button onClick={()=>apriStatoCE(ce)} className="text-xs border border-gray-600 px-2 py-0.5 rounded hover:bg-white/10">⚙️ Stato</button>
                          <button onClick={()=>{ setFrmCE({id:ce.id,numero:ce.numero,nome:ce.nome,indirizzo:ce.indirizzo||'',note:ce.note||''}); setModalCE('modifica') }}
                            className="text-xs border border-gray-600 px-2 py-0.5 rounded hover:bg-white/10">✏️</button>
                          {ce.attivo
                            ? <button onClick={()=>archiviaOElimina(ce,'archivia')} className="text-xs border border-gray-600 px-2 py-0.5 rounded hover:bg-white/10">📦</button>
                            : <button onClick={()=>archiviaOElimina(ce,'riattiva')} className="text-xs border border-green-500 px-2 py-0.5 rounded text-green-400 hover:bg-white/10">♻️</button>
                          }
                          <button onClick={()=>archiviaOElimina(ce,'elimina')} className="text-xs border border-red-400 px-2 py-0.5 rounded text-red-400 hover:bg-white/10">✕</button>
                        </div>
                      </div>

                      {/* Stati aziende inline */}
                      {azStatoCE.length>0 && (
                        <div className="flex gap-2 px-4 py-2 bg-gray-800 flex-wrap">
                          {AZIENDE_ORD.map(az=>{
                            const info = azStatoCE.find(a=>a.azienda===az)
                            const stato = info?.stato||'attivo'
                            return <span key={az} className={`text-xs px-2 py-0.5 rounded border font-medium ${STATI[stato]?.cls||''}`}>{az.split(' ')[0]}: {STATI[stato]?.label}</span>
                          })}
                        </div>
                      )}

                      {/* Dettaglio dipendenti del mese */}
                      {assCE.length===0 ? (
                        <p className="text-xs text-gray-400 text-center py-3 italic">Nessuna ora associata per {meseStr}</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead><tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-1.5 text-xs font-semibold text-gray-500">Nominativo</th>
                            <th className="text-left px-4 py-1.5 text-xs font-semibold text-gray-500">Azienda</th>
                            <th className="text-right px-4 py-1.5 text-xs font-semibold text-gray-500">Ore CE</th>
                          </tr></thead>
                          <tbody className="divide-y divide-gray-50">
                            {assCE.map((a:any)=>(
                              <tr key={a.id} className="hover:bg-gray-50">
                                <td className="px-4 py-1.5 font-medium">{a.dipendente_nome}</td>
                                <td className="px-4 py-1.5 text-gray-500 text-xs">{a.azienda}</td>
                                <td className="px-4 py-1.5 text-right font-semibold text-blue-700">{fmt(a.ore)}</td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50 border-t border-gray-200">
                              <td colSpan={2} className="px-4 py-1.5 text-xs font-semibold text-gray-500">Totale</td>
                              <td className="px-4 py-1.5 text-right font-bold text-gray-900">{fmt(totCE)}</td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                      {ce.note && <p className="px-4 py-1.5 text-xs text-gray-400 border-t border-gray-100 italic">{ce.note}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── MODAL ASSEGNA ORE ── */}
      {modalAss && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="font-semibold">↔️ {modalAss.dip.cognome} {modalAss.dip.nome}</h2>
              <div className="flex gap-3 mt-1 text-xs text-gray-500">
                <span>{modalAss.dip.azienda}</span>
                <span>📍 {modalAss.cantiereReale}</span>
                <span className="font-semibold text-gray-700">{fmt(modalAss.oreTot)}h approvate</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              <p className="text-xs text-gray-400 mb-3">Inserisci le ore per ogni cantiere CE (lascia vuoto = nessuna)</p>
              {ceAttivi.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <p className="text-2xl mb-2">🏗️</p>
                  <p className="text-sm">Nessun cantiere CE attivo.</p>
                  <button className="mt-3 btn btn-sm btn-primary" onClick={()=>{ setModalAss(null); setTab('cantieri_ce') }}>
                    ⚙️ Vai a Cantieri CE per aggiungerne
                  </button>
                </div>
              ) : ceAttivi.map((ce,i)=>(
                <div key={ce.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ce.numero}. {ce.nome}</p>
                  </div>
                  <input className="input w-20 text-right font-semibold text-sm" type="number" step="0.5" min="0"
                    placeholder="0" value={frmAss[i]?.ore||''}
                    onChange={e=>{ const n=[...frmAss]; n[i]={...n[i],ore:e.target.value}; setFrmAss(n) }} />
                  <span className="text-xs text-gray-400 w-3">h</span>
                </div>
              ))}
              {/* Riepilogo */}
              <div className="border-t border-gray-100 pt-3 mt-3">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Totale assegnato:</span>
                  <span className={`font-semibold ${frmAss.reduce((s,f)=>s+(parseFloat(f.ore)||0),0) > modalAss.oreTot+0.01 ? 'text-red-600' : 'text-gray-700'}`}>
                    {fmt(frmAss.reduce((s,f)=>s+(parseFloat(f.ore)||0),0))}h / {fmt(modalAss.oreTot)}h
                  </span>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
              <button className="btn" onClick={()=>setModalAss(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaAss} disabled={salvAss}>{salvAss?'Salvataggio…':'✅ Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL STATO AZIENDE ── */}
      {modalStatoCE && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold">⚙️ Stato — {modalStatoCE.numero}. {modalStatoCE.nome}</h2>
              <button onClick={()=>setModalStatoCE(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              {AZIENDE_ORD.map(az=>(
                <div key={az} className="flex items-center gap-3">
                  <p className="text-sm font-medium w-40">{az}</p>
                  <div className="flex gap-1 flex-1">
                    {(['attivo','sospeso','chiudere'] as const).map(s=>(
                      <button key={s} onClick={()=>setFrmStati(f=>({...f,[az]:s}))}
                        className={`flex-1 text-xs py-1.5 rounded border transition-colors ${frmStati[az]===s?STATI[s].cls+' font-semibold':'bg-white border-gray-200 text-gray-400 hover:border-gray-400'}`}>
                        {STATI[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button className="btn" onClick={()=>setModalStatoCE(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaStatoCE} disabled={salvStati}>{salvStati?'Salvataggio…':'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NUOVO / MODIFICA CANTIERE CE ── */}
      {modalCE && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold">{modalCE==='nuovo'?'+ Nuovo cantiere CE':'✏️ Modifica cantiere CE'}</h2>
              <button onClick={()=>setModalCE(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Numero *</label><input className="input" placeholder="es. 15" value={frmCE.numero} onChange={e=>setFrmCE(f=>({...f,numero:e.target.value}))} /></div>
                <div><label className="label">Nome *</label><input className="input" placeholder="Nome cantiere…" value={frmCE.nome} onChange={e=>setFrmCE(f=>({...f,nome:e.target.value}))} /></div>
              </div>
              <div><label className="label">Indirizzo</label><input className="input" value={frmCE.indirizzo} onChange={e=>setFrmCE(f=>({...f,indirizzo:e.target.value}))} /></div>
              <div><label className="label">Note</label><input className="input" value={frmCE.note} onChange={e=>setFrmCE(f=>({...f,note:e.target.value}))} /></div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button className="btn" onClick={()=>setModalCE(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaCE} disabled={salvCE}>{salvCE?'Salvataggio…':modalCE==='nuovo'?'Aggiungi':'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size:A4; margin:10mm }
          body * { visibility:hidden !important }
          #report-ce, #report-ce * { visibility:visible !important }
          #report-ce { position:static !important; width:100% !important; padding:0 !important }
          aside { display:none !important }
        }
      `}</style>
    </div>
  )
}
