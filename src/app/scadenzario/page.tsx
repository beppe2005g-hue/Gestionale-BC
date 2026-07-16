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
  const d = new Date(data); d.setHours(0,0,0,0)
  return Math.round((d.getTime() - oggi.getTime()) / 86400000)
}
function meseLabel(data: string | null): string {
  if (!data) return 'Senza scadenza'
  return new Date(data).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
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
  const [tab, setTab] = useState<'da_pagare' | 'da_incassare' | 'ritenute'>('da_pagare')
  const [pagamenti, setPagamenti] = useState<RigaPagamento[]>([])
  const [ordinamentoPagare, setOrdinamentoPagare] = useState<OrdinamentoPagare>('scadenza')
  const [soloScadutePagare, setSoloScadutePagare] = useState(false)
  const [cercaFornitore, setCercaFornitore] = useState('')
  const [scadenzaDA, setScadenzaDA] = useState('')
  const [scadenzaA, setScadenzaA] = useState('')
  const [modalStampa, setModalStampa] = useState(false)
  const [fornitoriSelezionati, setFornitoriSelezionati] = useState<Set<string>>(new Set())
  const [soloScadutoStampa, setSoloScadutoStampa] = useState(false)
  const [stampaScadenzaDA, setStampaScadenzaDA] = useState('')
  const [stampaScadenzaA, setStampaScadenzaA] = useState('')
  const [fattureClienti, setFattureClienti] = useState<any[]>([])
  const [filtroCliente, setFiltroCliente] = useState('')
  const [soloScaduteIncassare, setSoloScaduteIncassare] = useState(false)
  const [loadingIncassare, setLoadingIncassare] = useState(true)
  const [loading, setLoading] = useState(true)
  const [pagamentiClienti, setPagamentiClienti] = useState<any[]>([])
  const [ncFornitori, setNcFornitori] = useState<any[]>([])
  const [ncClienti, setNcClienti] = useState<any[]>([])
  const [subTab, setSubTab] = useState<'garanzia' | 'acconto'>('garanzia')
  const [ritenutaGaranzia, setRitenutaGaranzia] = useState<any[]>([])
  const [ritenutaAcconto, setRitenutaAcconto] = useState<any[]>([])
  const [progetti, setProgetti] = useState<any[]>([])
  const [clienti, setClienti] = useState<any[]>([])
  const [loadingRitenute, setLoadingRitenute] = useState(false)
  const [modalGaranzia, setModalGaranzia] = useState(false)
  const [modalAcconto, setModalAcconto] = useState(false)
  const [modalSvincolo, setModalSvincolo] = useState<any>(null)
  const [formGaranzia, setFormGaranzia] = useState({ progetto_id: '', progetto_nome: '', fattura_riferimento: '', importo_fattura: '', percentuale: '5', data_fattura: '', note: '' })
  const [formAcconto, setFormAcconto] = useState({ cliente_nome: '', fattura_numero: '', importo_fattura: '', percentuale: '4', data_fattura: '', note: '' })
  const [formSvincolo, setFormSvincolo] = useState({ data_svincolo: '', importo_svincolato: '' })
  // ── RITENUTA D'ACCONTO DA SCADENZARIO ─────────────────────────────────────
  const [modalRitenutaScad, setModalRitenutaScad] = useState<{
    fattura_id: string; fattura_numero: string; cliente_nome: string
    importo_fattura: number; data_fattura: string | null
    rata: number; importoResiduo: number
  } | null>(null)
  const [formRitenutaScad, setFormRitenutaScad] = useState({ percentuale: '4', importo: '', data: new Date().toISOString().split('T')[0] })
  const [salvandoRitenutaScad, setSalvandoRitenutaScad] = useState(false)

  useEffect(() => {
    load()
    window.addEventListener('gestionale:refresh', load)
    return () => window.removeEventListener('gestionale:refresh', load)
  }, [])

  useEffect(() => { if (tab === 'ritenute') loadRitenute() }, [tab])

  async function load() {
    setLoading(true); setLoadingIncassare(true)
    const [{ data: ff }, { data: fc }, { data: pagCli }, { data: ncFF }, { data: ncFC }, { data: pr }, { data: cl }] = await Promise.all([
      supabase.from('fatture_fornitori').select('id,numero,data,fornitore_nome,progetto_nome,tipo,rata1_importo,rata1_scadenza,rata1_stato,rata2_importo,rata2_scadenza,rata2_stato,rata3_importo,rata3_scadenza,rata3_stato'),
      supabase.from('fatture_clienti').select('*').order('cliente_nome').order('data'),
      supabase.from('pagamenti_clienti').select('fattura_id,rata,importo'),
      supabase.from('fatture_fornitori').select('fornitore_nome,imponibile').eq('tipo', 'Nota di credito'),
      supabase.from('fatture_clienti').select('cliente_nome,imponibile').eq('tipo', 'Nota di credito'),
      supabase.from('progetti').select('id,codice,nome').order('codice'),
      supabase.from('clienti').select('id,ragione_sociale').order('ragione_sociale'),
    ])
    setPagamentiClienti(pagCli || [])
    setNcFornitori(ncFF || [])
    setNcClienti(ncFC || [])
    setProgetti(pr || [])
    setClienti(cl || [])
    const righePagare: RigaPagamento[] = []
    ;(ff || []).forEach((f: any) => {
      if (f.tipo === 'Nota di credito') return
      ;[1,2,3].forEach(n => {
        const imp = f[`rata${n}_importo`], scad = f[`rata${n}_scadenza`], stato = f[`rata${n}_stato`]
        if (imp > 0 && stato !== 'Pagata') {
          righePagare.push({ id: f.id, numero: f.numero, fornitore_nome: f.fornitore_nome, cantiere: f.progetto_nome, rata: n, importo: imp, scadenza: scad, gg: giorniAllaScadenza(scad), stato, data_fattura: f.data })
        }
      })
    })
    setPagamenti(righePagare)
    setLoading(false)
    setFattureClienti((fc || []).filter((f: any) => f.tipo !== 'Nota di credito'))
    setLoadingIncassare(false)
  }

  // ── RITENUTA D'ACCONTO DA SCADENZARIO ──────────────────────────────────────
  async function salvaRitenutaScad() {
    if (!modalRitenutaScad) return
    const imponibile = parseFloat(formRitenutaScad.importo) || 0
    const importo = Math.round(imponibile * (parseFloat(formRitenutaScad.percentuale) || 4) / 100 * 100) / 100
    if (imponibile <= 0) { alert("Inserisci l'imponibile"); return }
    setSalvandoRitenutaScad(true)
    await supabase.from('pagamenti_clienti').insert({
      fattura_id: modalRitenutaScad.fattura_id, rata: modalRitenutaScad.rata, importo,
      data_pagamento: formRitenutaScad.data,
      note: `Ritenuta d'acconto condominio ${formRitenutaScad.percentuale}% su imponibile ${euro(imponibile)}`,
    })
    const { data: ft } = await supabase.from('fatture_clienti').select('*').eq('id', modalRitenutaScad.fattura_id).single()
    if (ft) {
      const n = modalRitenutaScad.rata
      const { data: pags } = await supabase.from('pagamenti_clienti').select('importo').eq('fattura_id', modalRitenutaScad.fattura_id).eq('rata', n)
      const pagato = (pags || []).reduce((s: number, p: any) => s + (p.importo || 0), 0)
      const impRata = ft[`rata${n}_importo`] || 0
      await supabase.from('fatture_clienti').update({
        [`rata${n}_stato`]: pagato >= impRata - 0.01 ? 'Incassata' : 'Parziale'
      }).eq('id', modalRitenutaScad.fattura_id)
    }
    await supabase.from('ritenute_acconto').insert({
      cliente_nome: modalRitenutaScad.cliente_nome,
      fattura_numero: modalRitenutaScad.fattura_numero,
      importo_fattura: imponibile,
      percentuale: parseFloat(formRitenutaScad.percentuale) || 4,
      importo_ritenuta: importo,
      data_fattura: modalRitenutaScad.data_fattura || null,
      anno_fiscale: new Date(formRitenutaScad.data).getFullYear(),
      note: `Ritenuta su Ft ${modalRitenutaScad.fattura_numero} — ${modalRitenutaScad.cliente_nome}`,
    })
    setSalvandoRitenutaScad(false)
    setModalRitenutaScad(null)
    setFormRitenutaScad({ percentuale: '4', importo: '', data: new Date().toISOString().split('T')[0] })
    load()
  }

  async function loadRitenute() {
    setLoadingRitenute(true)
    const [{ data: rg }, { data: ra }] = await Promise.all([
      supabase.from('ritenute_garanzia').select('*').order('data_fattura', { ascending: false }),
      supabase.from('ritenute_acconto').select('*').order('data_fattura', { ascending: false }),
    ])
    setRitenutaGaranzia(rg || [])
    setRitenutaAcconto(ra || [])
    setLoadingRitenute(false)
  }

  async function salvaGaranzia() {
    const imp = parseFloat(formGaranzia.importo_fattura) || 0
    const perc = parseFloat(formGaranzia.percentuale) || 5
    const ritenuta = Math.round(imp * perc / 100 * 100) / 100
    const prj = progetti.find(p => p.id === formGaranzia.progetto_id)
    await supabase.from('ritenute_garanzia').insert({ progetto_id: formGaranzia.progetto_id || null, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : formGaranzia.progetto_nome, fattura_riferimento: formGaranzia.fattura_riferimento, importo_fattura: imp, percentuale: perc, importo_ritenuta: ritenuta, data_fattura: formGaranzia.data_fattura || null, stato: 'In sospeso', note: formGaranzia.note })
    setModalGaranzia(false)
    setFormGaranzia({ progetto_id: '', progetto_nome: '', fattura_riferimento: '', importo_fattura: '', percentuale: '5', data_fattura: '', note: '' })
    loadRitenute()
  }

  async function salvaAcconto() {
    const imp = parseFloat(formAcconto.importo_fattura) || 0
    const perc = parseFloat(formAcconto.percentuale) || 4
    const ritenuta = Math.round(imp * perc / 100 * 100) / 100
    const anno = formAcconto.data_fattura ? new Date(formAcconto.data_fattura).getFullYear() : new Date().getFullYear()
    await supabase.from('ritenute_acconto').insert({ cliente_nome: formAcconto.cliente_nome, fattura_numero: formAcconto.fattura_numero, importo_fattura: imp, percentuale: perc, importo_ritenuta: ritenuta, data_fattura: formAcconto.data_fattura || null, anno_fiscale: anno, note: formAcconto.note })
    setModalAcconto(false)
    setFormAcconto({ cliente_nome: '', fattura_numero: '', importo_fattura: '', percentuale: '4', data_fattura: '', note: '' })
    loadRitenute()
  }

  async function registraSvincolo() {
    if (!modalSvincolo) return
    const imp = parseFloat(formSvincolo.importo_svincolato) || modalSvincolo.importo_ritenuta
    await supabase.from('ritenute_garanzia').update({ stato: 'Svincolata', data_svincolo: formSvincolo.data_svincolo || null, importo_svincolato: imp }).eq('id', modalSvincolo.id)
    setModalSvincolo(null)
    setFormSvincolo({ data_svincolo: '', importo_svincolato: '' })
    loadRitenute()
  }

  async function eliminaRitenuta(tabella: string, id: string) {
    if (!confirm('Eliminare questa ritenuta?')) return
    await supabase.from(tabella).delete().eq('id', id)
    loadRitenute()
  }

  const totGaranziaInSospeso = ritenutaGaranzia.filter(r => r.stato === 'In sospeso').reduce((s, r) => s + (r.importo_ritenuta || 0), 0)
  const annoCorrente = new Date().getFullYear()
  const totAccontoAnno = ritenutaAcconto.filter(r => r.anno_fiscale === annoCorrente).reduce((s, r) => s + (r.importo_ritenuta || 0), 0)
  const totAccontoTotale = ritenutaAcconto.reduce((s, r) => s + (r.importo_ritenuta || 0), 0)

  const fornitoriUnici = useMemo(() => Array.from(new Set(pagamenti.map(p => p.fornitore_nome))).sort((a, b) => a.localeCompare(b)), [pagamenti])

  function apriModalStampa() { setFornitoriSelezionati(new Set(fornitoriUnici)); setSoloScadutoStampa(false); setStampaScadenzaDA(''); setStampaScadenzaA(''); setModalStampa(true) }
  function toggleFornitoreStampa(nome: string) { setFornitoriSelezionati(prev => { const next = new Set(prev); if (next.has(nome)) next.delete(nome); else next.add(nome); return next }) }

  const reportStampaPerFornitore = useMemo(() => {
    let righe = pagamenti.filter(p => fornitoriSelezionati.has(p.fornitore_nome))
    if (soloScadutoStampa) righe = righe.filter(r => r.gg !== null && r.gg < 0)
    if (stampaScadenzaDA) righe = righe.filter(r => r.scadenza && r.scadenza >= stampaScadenzaDA)
    if (stampaScadenzaA) righe = righe.filter(r => r.scadenza && r.scadenza <= stampaScadenzaA)
    const gruppi: Record<string, RigaPagamento[]> = {}
    righe.forEach(r => { if (!gruppi[r.fornitore_nome]) gruppi[r.fornitore_nome] = []; gruppi[r.fornitore_nome].push(r) })
    return Object.entries(gruppi).sort(([a], [b]) => a.localeCompare(b)).map(([fornitore, rate]) => ({ fornitore, rate: [...rate].sort((a, b) => (a.gg ?? 999999) - (b.gg ?? 999999)), totale: rate.reduce((s, r) => s + r.importo, 0), scaduto: rate.filter(r => r.gg !== null && r.gg < 0).reduce((s, r) => s + r.importo, 0) }))
  }, [pagamenti, fornitoriSelezionati, soloScadutoStampa, stampaScadenzaDA, stampaScadenzaA])

  const totaleReportStampa = reportStampaPerFornitore.reduce((s, g) => s + g.totale, 0)
  const scadutoReportStampa = reportStampaPerFornitore.reduce((s, g) => s + g.scaduto, 0)
  function confermaStampa() { setModalStampa(false); setTimeout(() => window.print(), 100) }

  const pagamentiFiltrati = useMemo(() => {
    let r = pagamenti
    if (cercaFornitore) r = r.filter(x => x.fornitore_nome?.toLowerCase().includes(cercaFornitore.toLowerCase()))
    if (soloScadutePagare) r = r.filter(x => x.gg !== null && x.gg < 0)
    if (scadenzaDA) r = r.filter(x => x.scadenza && x.scadenza >= scadenzaDA)
    if (scadenzaA) r = r.filter(x => x.scadenza && x.scadenza <= scadenzaA)
    const sorted = [...r]
    if (ordinamentoPagare === 'scadenza') sorted.sort((a, b) => { const sa = a.scadenza || '9999-99-99', sb = b.scadenza || '9999-99-99'; if (sa !== sb) return sa.localeCompare(sb); return (a.fornitore_nome || '').localeCompare(b.fornitore_nome || '') })
    else sorted.sort((a, b) => { const fa = a.fornitore_nome || '', fb = b.fornitore_nome || ''; if (fa !== fb) return fa.localeCompare(fb); return (a.scadenza || '9999-99-99').localeCompare(b.scadenza || '9999-99-99') })
    return sorted
  }, [pagamenti, cercaFornitore, soloScadutePagare, ordinamentoPagare, scadenzaDA, scadenzaA])

  const totalePagare = pagamentiFiltrati.reduce((s, r) => s + r.importo, 0)
  const scadutoPagare = pagamentiFiltrati.filter(r => r.gg !== null && r.gg < 0).reduce((s, r) => s + r.importo, 0)
  const scadutoOltre30Pagare = pagamentiFiltrati.filter(r => r.gg !== null && r.gg < -30).reduce((s, r) => s + r.importo, 0)
  const totaleNcFornitori = ncFornitori.filter(nc => !cercaFornitore || nc.fornitore_nome?.toLowerCase().includes(cercaFornitore.toLowerCase())).reduce((s, nc) => s + (nc.imponibile || 0), 0)
  const totalePagareNetto = Math.max(0, totalePagare - totaleNcFornitori)

  function badgeGiorni(gg: number | null) {
    if (gg === null) return <span className="text-xs text-gray-400">—</span>
    if (gg < -30) return <span className="badge badge-red">Scaduto da {Math.abs(gg)} gg 🔴</span>
    if (gg < 0) return <span className="badge badge-red">Scaduto da {Math.abs(gg)} gg</span>
    if (gg === 0) return <span className="badge badge-amber">Scade oggi</span>
    if (gg <= 7) return <span className="badge badge-amber">Tra {gg} gg</span>
    return <span className="badge badge-blue">Tra {gg} gg</span>
  }

  const rateIncassareGrezze = useMemo(() => {
    const righe: RigaIncasso[] = []
    fattureClienti.forEach(f => {
      ;[1,2,3].forEach(n => {
        const impTotale = f[`rata${n}_importo`], scad = f[`rata${n}_scadenza`]
        if (impTotale > 0) {
          const pagato = pagamentiClienti.filter(p => p.fattura_id === f.id && p.rata === n).reduce((s, p) => s + (p.importo || 0), 0)
          const residuo = Math.round((impTotale - pagato) * 100) / 100
          if (residuo > 0.01) {
            const gg = giorniAllaScadenza(scad)
            righe.push({ fattura_id: f.id, numero: f.numero, data_fattura: f.data, cliente_nome: f.cliente_nome, progetto_nome: f.progetto_nome, rata: n, importo: residuo, scadenza: scad, gg, scaduta: gg !== null && gg <= 0, mese_key: meseKey(scad), mese_label: meseLabel(scad) })
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
  const totaleNcClienti = ncClienti.filter(nc => !filtroCliente || nc.cliente_nome?.toLowerCase().includes(filtroCliente.toLowerCase())).reduce((s, nc) => s + (nc.imponibile || 0), 0)
  const totaleIncassareNetto = Math.max(0, totaleIncassare - totaleNcClienti)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <h1 className="text-xl font-semibold">Scadenzario</h1>
          {tab === 'da_incassare' && <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Stampa / PDF</button>}
          {tab === 'da_pagare' && <button className="btn btn-primary" onClick={apriModalStampa}>🖨️ Stampa scadenze</button>}
        </div>
        <div className="flex gap-2 mb-4 print:hidden">
          <button onClick={() => setTab('da_pagare')} className={`btn ${tab === 'da_pagare' ? 'btn-primary' : ''}`}>📄 Da Pagare</button>
          <button onClick={() => setTab('da_incassare')} className={`btn ${tab === 'da_incassare' ? 'btn-primary' : ''}`}>🧾 Da Incassare</button>
          <button onClick={() => setTab('ritenute')} className={`btn ${tab === 'ritenute' ? 'btn-primary' : ''}`}>🔒 Ritenute</button>
        </div>

        {tab === 'da_pagare' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 print:hidden">
              <div className="rounded-lg p-3 border border-gray-200 bg-white"><p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Scaduto</p><p className="text-lg font-bold text-red-700">{euro(scadutoPagare)}</p></div>
              <div className="rounded-lg p-3 border border-gray-200 bg-white"><p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Oltre 30 giorni</p><p className="text-lg font-bold text-red-900">{euro(scadutoOltre30Pagare)}</p></div>
              <div className="rounded-lg p-3 border border-gray-200 bg-white"><p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Da pagare</p><p className="text-lg font-bold text-gray-900">{euro(totalePagareNetto)}</p>{totaleNcFornitori > 0 && <p className="text-xs text-purple-600 mt-0.5">NC: - {euro(totaleNcFornitori)}</p>}</div>
            </div>
            <div className="card mb-4 print:hidden">
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-48"><label className="label">Cerca fornitore</label><input className="input" placeholder="Nome fornitore..." value={cercaFornitore} onChange={e => setCercaFornitore(e.target.value)} /></div>
                <div><label className="label">Scade dal</label><input className="input" type="date" value={scadenzaDA} onChange={e => setScadenzaDA(e.target.value)} /></div>
                <div><label className="label">Scade al</label><input className="input" type="date" value={scadenzaA} onChange={e => setScadenzaA(e.target.value)} /></div>
                <div><label className="label">Ordina per</label><div className="flex gap-1"><button className={`btn btn-sm ${ordinamentoPagare === 'scadenza' ? 'btn-primary' : ''}`} onClick={() => setOrdinamentoPagare('scadenza')}>Scadenza</button><button className={`btn btn-sm ${ordinamentoPagare === 'fornitore' ? 'btn-primary' : ''}`} onClick={() => setOrdinamentoPagare('fornitore')}>Fornitore</button></div></div>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer pb-2"><input type="checkbox" checked={soloScadutePagare} onChange={e => setSoloScadutePagare(e.target.checked)} className="rounded" />Solo scadute</label>
                {(cercaFornitore || soloScadutePagare || scadenzaDA || scadenzaA) && <button className="btn btn-sm pb-2" onClick={() => { setCercaFornitore(''); setSoloScadutePagare(false); setScadenzaDA(''); setScadenzaA('') }}>× Reset</button>}
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
                <span className="text-xs text-gray-400">Scorciatoie:</span>
                <button className="text-xs text-blue-600 hover:underline" onClick={() => { const o = new Date(); const f = new Date(o.getFullYear(), o.getMonth()+1, 0); setScadenzaDA(o.toISOString().split('T')[0]); setScadenzaA(f.toISOString().split('T')[0]) }}>Entro fine mese</button>
                <button className="text-xs text-blue-600 hover:underline" onClick={() => { const o = new Date(); const t = new Date(o.getFullYear(), o.getMonth()+1, 3); setScadenzaDA(o.toISOString().split('T')[0]); setScadenzaA(t.toISOString().split('T')[0]) }}>Entro il 3 del mese prossimo</button>
                <button className="text-xs text-blue-600 hover:underline" onClick={() => { const o = new Date(); const t = new Date(o.getTime()+7*86400000); setScadenzaDA(o.toISOString().split('T')[0]); setScadenzaA(t.toISOString().split('T')[0]) }}>Prossimi 7 giorni</button>
                <button className="text-xs text-blue-600 hover:underline" onClick={() => { const o = new Date(); const t = new Date(o.getTime()+15*86400000); setScadenzaDA(o.toISOString().split('T')[0]); setScadenzaA(t.toISOString().split('T')[0]) }}>Prossimi 15 giorni</button>
              </div>
            </div>
            <div className="card overflow-x-auto print:hidden">
              <div className="flex items-center justify-between mb-3"><span className="text-sm text-gray-500">{pagamentiFiltrati.length} rate da pagare</span></div>
              {loading ? <div className="text-center text-gray-400 py-8">Caricamento...</div> : pagamentiFiltrati.length === 0 ? <div className="text-center text-gray-400 py-8">Nessuna fattura da pagare.</div> : (
                <table className="table-base hidden md:table">
                  <thead><tr><th>Fornitore</th><th>Cantiere</th><th>N° Fattura</th><th>Data emissione</th><th>Rata</th><th>Importo</th><th>Scadenza</th><th></th></tr></thead>
                  <tbody>{pagamentiFiltrati.map(r => (
                    <tr key={`${r.id}-${r.rata}`} className={r.gg !== null && r.gg < 0 ? 'bg-red-50' : ''}>
                      <td className="font-medium text-sm">{r.fornitore_nome}</td><td className="text-xs text-gray-500">{r.cantiere || '—'}</td><td className="text-xs">{r.numero}</td>
                      <td className="text-xs text-gray-500">{r.data_fattura ? new Date(r.data_fattura).toLocaleDateString('it-IT') : '—'}</td>
                      <td className="text-xs text-center">{r.rata}</td><td className="font-medium text-sm">{euro(r.importo)}</td>
                      <td className="text-xs">{r.scadenza ? new Date(r.scadenza).toLocaleDateString('it-IT') : '—'}</td>
                      <td>{badgeGiorni(r.gg)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
            {/* Report stampa da pagare */}
            <div id="report-pagare" className="hidden print:block">
              <div className="report-header flex items-start justify-between mb-6 pb-4" style={{ borderBottom: '3px solid #1e3a8a' }}>
                <div className="flex items-center gap-4"><img src="/logo.png" alt="BC General Service" style={{ height: 55, objectFit: 'contain' }} /><div><p style={{ fontSize: 15, fontWeight: 800, color: '#1e3a8a', letterSpacing: 1 }}>BC GENERAL SERVICE</p><p style={{ fontSize: 10, color: '#6b7280' }}>Società Consortile a Responsabilità Limitata</p><p style={{ fontSize: 10, color: '#6b7280' }}>Via Duca d'Este 7 — 41036 Medolla (MO)</p><p style={{ fontSize: 10, color: '#6b7280' }}>P.IVA 03943310361</p></div></div>
                <div style={{ textAlign: 'right' }}><p style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>SCADENZE FORNITORI</p><p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Data: <strong>{new Date().toLocaleDateString('it-IT')}</strong></p>{soloScadutoStampa && <p style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Solo rate scadute</p>}</div>
              </div>
              {reportStampaPerFornitore.length === 0 ? <p style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Nessuna scadenza.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {reportStampaPerFornitore.map(g => (
                    <div key={g.fornitore} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', pageBreakInside: 'avoid' }}>
                      <div style={{ background: '#1f2937', color: 'white', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ fontWeight: 600, fontSize: 13, letterSpacing: 0.3 }}>{g.fornitore}</p>
                        <div style={{ textAlign: 'right' }}><p style={{ fontSize: 15, fontWeight: 700 }}>€ {euroShort(g.totale)}</p>{g.scaduto > 0 && <p style={{ fontSize: 10, color: '#fca5a5', marginTop: 1 }}>Scaduto: € {euroShort(g.scaduto)}</p>}</div>
                      </div>
                      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                        <thead><tr style={{ background: '#f8faff' }}>{['N° Fattura','Data fattura','Cantiere','Rata','Scadenza','Gg','Importo'].map(h => (<th key={h} style={{ padding: '5px 16px', textAlign: h === 'Rata' || h === 'Gg' ? 'center' : h === 'Scadenza' || h === 'Importo' ? 'right' : 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>{h}</th>))}</tr></thead>
                        <tbody>{g.rate.map((r, idx) => { const scaduta = r.gg !== null && r.gg < 0; return (<tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#fafafa' }}><td style={{ padding: '5px 16px', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: '#1e40af' }}>{r.numero}</td><td style={{ padding: '5px 16px', borderBottom: '1px solid #f1f5f9' }}>{r.data_fattura ? new Date(r.data_fattura).toLocaleDateString('it-IT') : '—'}</td><td style={{ padding: '5px 16px', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}>{r.cantiere || '—'}</td><td style={{ padding: '5px 16px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{r.rata}</td><td style={{ padding: '5px 16px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: scaduta ? '#dc2626' : '#374151', fontWeight: scaduta ? 600 : 400 }}>{r.scadenza ? new Date(r.scadenza).toLocaleDateString('it-IT') : '—'}</td><td style={{ padding: '5px 16px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: scaduta ? '#dc2626' : '#6b7280' }}>{r.gg !== null ? (r.gg < 0 ? `-${Math.abs(r.gg)}` : `+${r.gg}`) : '—'}</td><td style={{ padding: '5px 16px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: scaduta ? '#dc2626' : '#1e3a8a' }}>€ {euroShort(r.importo)}</td></tr>) })}</tbody>
                      </table>
                      <div style={{ background: '#f9fafb', padding: '6px 14px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb' }}><span style={{ fontWeight: 500, fontSize: 11, color: '#6b7280' }}>Totale {g.fornitore}</span><span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>€ {euroShort(g.totale)}</span></div>
                    </div>
                  ))}
                  <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '14px 18px', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><p style={{ fontWeight: 600, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>Totale generale</p><p style={{ fontSize: 11, color: '#9ca3af' }}>{reportStampaPerFornitore.length} fornitori</p></div>
                    <div style={{ textAlign: 'right' }}><p style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>€ {euroShort(totaleReportStampa)}</p>{scadutoReportStampa > 0 && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>Scaduto: € {euroShort(scadutoReportStampa)}</p>}</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'da_incassare' && (
          <>
            <div className="card mb-4 print:hidden">
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-52"><label className="label">Filtra per cliente</label><input className="input" placeholder="Nome cliente..." value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} /></div>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer pb-2"><input type="checkbox" checked={soloScaduteIncassare} onChange={e => setSoloScaduteIncassare(e.target.checked)} className="rounded" />Solo scadute</label>
                {(filtroCliente || soloScaduteIncassare) && <button className="btn btn-sm pb-2" onClick={() => { setFiltroCliente(''); setSoloScaduteIncassare(false) }}>× Reset</button>}
              </div>
            </div>
            {loadingIncassare ? <div className="card text-center py-12 text-gray-400">Caricamento...</div> : (
              <div id="report-incassare">
                {filtroCliente && (
                  <div className="report-header flex items-start justify-between mb-6 pb-4" style={{ borderBottom: '3px solid #1e3a8a' }}>
                    <div className="flex items-center gap-4"><img src="/logo.png" alt="BC General Service" style={{ height: 55, objectFit: 'contain' }} /><div><p style={{ fontSize: 15, fontWeight: 800, color: '#1e3a8a', letterSpacing: 1 }}>BC GENERAL SERVICE</p><p style={{ fontSize: 10, color: '#6b7280' }}>Società Consortile a Responsabilità Limitata</p><p style={{ fontSize: 10, color: '#6b7280' }}>Via Duca d'Este 7 — 41036 Medolla (MO)</p><p style={{ fontSize: 10, color: '#6b7280' }}>P.IVA 03943310361</p></div></div>
                    <div style={{ textAlign: 'right' }}><p style={{ fontSize: 14, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: 0.5 }}>Estratto conto</p><p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Data: <strong>{new Date().toLocaleDateString('it-IT')}</strong></p></div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 print:grid-cols-3">
                  <div className="rounded-lg p-3 border border-gray-200 bg-white"><p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Scaduto</p><p className="text-lg font-bold text-red-700">{euro(scadutoIncassare)}</p><p className="text-xs text-red-500 mt-0.5">{rateIncassareFiltrate.filter(r => r.scaduta).length} rate scadute</p></div>
                  <div className="rounded-lg p-3 border border-gray-200 bg-white"><p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Oltre 30 giorni</p><p className="text-lg font-bold text-red-900">{euro(scadutoOltre30Incassare)}</p></div>
                  <div className="rounded-lg p-3 border border-gray-200 bg-white"><p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Da incassare</p><p className="text-lg font-bold text-gray-900">{euro(totaleIncassareNetto)}</p>{totaleNcClienti > 0 && <p className="text-xs text-purple-600 mt-0.5">NC: - {euro(totaleNcClienti)}</p>}<p className="text-xs text-blue-500 mt-0.5">{perCliente.length} clienti</p></div>
                </div>
                {perCliente.length === 0 ? <div className="card text-center py-12 text-gray-400">Nessuna rata da incassare.</div> : (
                  <div className="space-y-6">
                    {perCliente.map(c => (
                      <div key={c.cliente} style={{ border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden', pageBreakInside: 'avoid' }}>
                        {/* ── RIGA CLIENTE — sfondo GIALLO ── */}
                        <div style={{ background: '#fef08a', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #ca8a04' }}>
                          <div>
                            <p style={{ fontWeight: 700, fontSize: 13, color: '#713f12', letterSpacing: 0.3 }}>{c.cliente}</p>
                            <p style={{ fontSize: 10, color: '#92400e', marginTop: 1 }}>{Object.keys(c.mesi).length} scadenze · {rateIncassareFiltrate.filter(r => r.cliente_nome === c.cliente).length} rate</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: 15, fontWeight: 800, color: '#713f12' }}>€ {euroShort(c.totale)}</p>
                            {c.scaduto > 0 && <p style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginTop: 1 }}>⚠️ Scaduto: € {euroShort(c.scaduto)}</p>}
                          </div>
                        </div>
                        {(Object.entries(c.mesi) as [string, { label: string, rate: RigaIncasso[], totale: number }][]).sort(([a], [b]) => a.localeCompare(b)).map(([meseK, mese]) => {
                          const meseOggi = new Date().toISOString().substring(0, 7)
                          const isPassato = meseK < meseOggi
                          const isMeseCorrente = meseK === meseOggi
                          const haSacduteNelMese = mese.rate.some(r => r.scaduta)
                          // Rosso: mese passato OPPURE mese corrente con almeno una rata scaduta
                          const isRed = isPassato || (isMeseCorrente && haSacduteNelMese)
                          const isAmber = isMeseCorrente && !isRed
                          return (
                            <div key={meseK}>
                              {/* ── INTESTAZIONE MESE ── */}
                              <div style={{
                                background: isRed ? '#fee2e2' : isAmber ? '#fffbeb' : '#f0fdf4',
                                padding: '5px 16px', display: 'flex', justifyContent: 'space-between',
                                borderTop: '1px solid #e2e8f0'
                              }}>
                                <p style={{ fontWeight: 700, fontSize: 12, color: isRed ? '#b91c1c' : isAmber ? '#b45309' : '#065f46' }}>
                                  {mese.label.charAt(0).toUpperCase() + mese.label.slice(1)}
                                  {isPassato && ' — SCADUTO'}
                                  {isMeseCorrente && isRed && ' — SCADUTO'}
                                  {isAmber && ' — Mese corrente'}
                                </p>
                                <p style={{ fontWeight: 700, fontSize: 13, color: isRed ? '#b91c1c' : '#374151' }}>€ {euroShort(mese.totale)}</p>
                              </div>
                              <div className="overflow-x-auto hidden md:block">
                                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, minWidth: 600 }}>
                                  <thead><tr style={{ background: '#f8faff' }}>{['N° Fattura','Data fattura','Cantiere','Rata','Scadenza','Gg','Importo',''].map(h => (<th key={h} style={{ padding: '5px 16px', textAlign: h === 'Rata' || h === 'Gg' ? 'center' : h === 'Scadenza' || h === 'Importo' ? 'right' : 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>{h}</th>))}</tr></thead>
                                  <tbody>{mese.rate.map((r, idx) => (
                                    <tr key={idx} style={{ background: r.scaduta ? '#fff7f7' : idx % 2 === 0 ? 'white' : '#fafafa' }}>
                                      <td style={{ padding: '5px 16px', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: '#1e40af' }}>{r.numero}</td>
                                      <td style={{ padding: '5px 16px', borderBottom: '1px solid #f1f5f9' }}>{r.data_fattura ? new Date(r.data_fattura).toLocaleDateString('it-IT') : '—'}</td>
                                      <td style={{ padding: '5px 16px', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}>{r.progetto_nome || '—'}</td>
                                      <td style={{ padding: '5px 16px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{r.rata}</td>
                                      <td style={{ padding: '5px 16px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: r.scaduta ? '#dc2626' : '#374151', fontWeight: r.scaduta ? 700 : 400 }}>{r.scadenza ? new Date(r.scadenza).toLocaleDateString('it-IT') : '—'}</td>
                                      <td style={{ padding: '5px 16px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: r.scaduta ? '#dc2626' : '#6b7280', fontWeight: r.scaduta ? 600 : 400 }}>{r.gg !== null ? (r.gg < 0 ? `${r.gg}` : r.gg === 0 ? 'Oggi' : `+${r.gg}`) : '—'}</td>
                                      <td style={{ padding: '5px 16px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid #f1f5f9', color: r.scaduta ? '#dc2626' : '#1e3a8a' }}>€ {euroShort(r.importo)}</td>
                                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }} className="no-print">
                                        <button
                                          className="text-xs px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 whitespace-nowrap"
                                          title="Il condominio ha pagato il netto trattenendo la ritenuta"
                                          onClick={() => {
                                            const perc = 4
                                            setFormRitenutaScad({ percentuale: String(perc), importo: (r.importo * perc / 100).toFixed(2), data: new Date().toISOString().split('T')[0] })
                                            setModalRitenutaScad({ fattura_id: r.fattura_id, fattura_numero: r.numero, cliente_nome: r.cliente_nome, importo_fattura: 0, data_fattura: r.data_fattura, rata: r.rata, importoResiduo: r.importo })
                                          }}>
                                          💼 Ritenuta
                                        </button>
                                      </td>
                                    </tr>
                                  ))}</tbody>
                                </table>
                              </div>
                              <div className="md:hidden divide-y divide-gray-100">
                                {mese.rate.map((r, idx) => (
                                  <div key={idx} className="px-3 py-2 flex items-center justify-between gap-2" style={{ background: r.scaduta ? '#fef2f2' : 'white' }}>
                                    <div><span className="text-xs font-semibold text-blue-800">{r.numero}</span><span className="text-xs text-gray-500 ml-2">{r.progetto_nome || '—'} · Rata {r.rata}</span></div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-bold ${r.scaduta ? 'text-red-600' : 'text-blue-900'}`}>€ {euroShort(r.importo)}</span>
                                      <button className="text-xs px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700" onClick={() => { setFormRitenutaScad({ percentuale: '4', importo: (r.importo * 0.04).toFixed(2), data: new Date().toISOString().split('T')[0] }); setModalRitenutaScad({ fattura_id: r.fattura_id, fattura_numero: r.numero, cliente_nome: r.cliente_nome, importo_fattura: 0, data_fattura: r.data_fattura, rata: r.rata, importoResiduo: r.importo }) }}>💼</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                        <div style={{ background: c.scaduto > 0 ? '#fef2f2' : '#f9fafb', padding: '7px 14px', display: 'flex', justifyContent: 'space-between', borderTop: '2px solid ' + (c.scaduto > 0 ? '#fca5a5' : '#e5e7eb') }}>
                          <span style={{ fontWeight: 600, fontSize: 11, color: c.scaduto > 0 ? '#991b1b' : '#6b7280' }}>Totale {c.cliente}</span>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>€ {euroShort(c.totale)}</span>
                            {c.scaduto > 0 && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginLeft: 12 }}>di cui scaduto: € {euroShort(c.scaduto)}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Totale generale */}
                    <div style={{ border: '2px solid #1e3a8a', borderRadius: 6, padding: '14px 18px', background: '#eff6ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 13, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: 0.5 }}>Totale da incassare</p>
                        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{perCliente.length} clienti · {rateIncassareFiltrate.length} rate aperte</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 24, fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(totaleIncassare)}</p>
                        {scadutoIncassare > 0 && <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 700, marginTop: 2 }}>⚠️ Scaduto: € {euroShort(scadutoIncassare)}</p>}
                        {totaleNcClienti > 0 && <p style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>Note di credito: − € {euroShort(totaleNcClienti)}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'ritenute' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100"><p className="text-xs text-amber-600 mb-1">🔒 Garanzia in sospeso</p><p className="text-lg font-bold text-amber-800">{euro(totGaranziaInSospeso)}</p><p className="text-xs text-amber-500 mt-0.5">{ritenutaGaranzia.filter(r => r.stato === 'In sospeso').length} ritenute</p></div>
              <div className="bg-green-50 rounded-xl p-3 border border-green-100"><p className="text-xs text-green-600 mb-1">✓ Garanzia svincolata</p><p className="text-lg font-bold text-green-800">{euro(ritenutaGaranzia.filter(r => r.stato === 'Svincolata').reduce((s, r) => s + (r.importo_svincolato || 0), 0))}</p><p className="text-xs text-green-500 mt-0.5">{ritenutaGaranzia.filter(r => r.stato === 'Svincolata').length} svincolate</p></div>
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100"><p className="text-xs text-blue-600 mb-1">📋 Acconto {annoCorrente}</p><p className="text-lg font-bold text-blue-800">{euro(totAccontoAnno)}</p><p className="text-xs text-blue-500 mt-0.5">Credito fiscale anno corrente</p></div>
              <div className="bg-purple-50 rounded-xl p-3 border border-purple-100"><p className="text-xs text-purple-600 mb-1">📋 Acconto totale</p><p className="text-lg font-bold text-purple-800">{euro(totAccontoTotale)}</p><p className="text-xs text-purple-500 mt-0.5">{ritenutaAcconto.length} registrazioni</p></div>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setSubTab('garanzia')} className={`btn ${subTab === 'garanzia' ? 'btn-primary' : ''}`}>🔒 Ritenute a Garanzia</button>
              <button onClick={() => setSubTab('acconto')} className={`btn ${subTab === 'acconto' ? 'btn-primary' : ''}`}>📋 Ritenute d'Acconto (Condomini)</button>
            </div>
            {subTab === 'garanzia' && (
              <>
                <div className="flex items-center justify-between mb-3"><p className="text-sm text-gray-600">Ritenute trattenute dai clienti sui SAL/fatture — svincolate a fine lavori</p><button className="btn btn-primary btn-sm" onClick={() => setModalGaranzia(true)}>+ Registra ritenuta</button></div>
                {loadingRitenute ? <div className="card text-center py-8 text-gray-400">Caricamento...</div> : (
                  <div className="card overflow-x-auto">
                    <table className="table-base">
                      <thead><tr><th>Cantiere</th><th>Rif. Fattura</th><th>Data</th><th>Importo fattura</th><th>%</th><th>Ritenuta</th><th>Stato</th><th>Svincolo</th><th></th></tr></thead>
                      <tbody>
                        {ritenutaGaranzia.length === 0 ? <tr><td colSpan={9} className="text-center text-gray-400 py-8">Nessuna ritenuta a garanzia registrata.</td></tr> : ritenutaGaranzia.map(r => (
                          <tr key={r.id} className={r.stato === 'Svincolata' ? 'opacity-60' : ''}>
                            <td className="text-sm font-medium">{r.progetto_nome || '—'}</td><td className="text-xs text-gray-600">{r.fattura_riferimento || '—'}</td>
                            <td className="text-xs">{r.data_fattura ? new Date(r.data_fattura).toLocaleDateString('it-IT') : '—'}</td>
                            <td className="text-sm">{euro(r.importo_fattura)}</td><td className="text-xs text-center">{r.percentuale}%</td>
                            <td className="font-semibold text-sm text-amber-700">{euro(r.importo_ritenuta)}</td>
                            <td>{r.stato === 'Svincolata' ? <span className="badge badge-green">✓ Svincolata</span> : <span className="badge badge-amber">In sospeso</span>}</td>
                            <td className="text-xs text-gray-500">{r.stato === 'Svincolata' && r.data_svincolo ? new Date(r.data_svincolo).toLocaleDateString('it-IT') : r.stato === 'In sospeso' ? <button className="btn btn-sm text-green-600 border-green-200 hover:bg-green-50" onClick={() => { setModalSvincolo(r); setFormSvincolo({ data_svincolo: '', importo_svincolato: String(r.importo_ritenuta) }) }}>✓ Svincola</button> : '—'}</td>
                            <td><button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaRitenuta('ritenute_garanzia', r.id)}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            {subTab === 'acconto' && (
              <>
                <div className="flex items-center justify-between mb-3"><p className="text-sm text-gray-600">Ritenute d'acconto trattenute da condomini/PA — credito fiscale da recuperare</p><button className="btn btn-primary btn-sm" onClick={() => setModalAcconto(true)}>+ Registra ritenuta</button></div>
                {loadingRitenute ? <div className="card text-center py-8 text-gray-400">Caricamento...</div> : (
                  <div className="card overflow-x-auto">
                    <table className="table-base">
                      <thead><tr><th>Cliente</th><th>N° Fattura</th><th>Data</th><th>Anno fiscale</th><th>Importo fattura</th><th>%</th><th>Ritenuta (credito)</th><th>Note</th><th></th></tr></thead>
                      <tbody>
                        {ritenutaAcconto.length === 0 ? <tr><td colSpan={9} className="text-center text-gray-400 py-8">Nessuna ritenuta d'acconto registrata.</td></tr> : ritenutaAcconto.map(r => (
                          <tr key={r.id}>
                            <td className="text-sm font-medium">{r.cliente_nome}</td><td className="text-xs">{r.fattura_numero || '—'}</td>
                            <td className="text-xs">{r.data_fattura ? new Date(r.data_fattura).toLocaleDateString('it-IT') : '—'}</td>
                            <td className="text-xs text-center font-medium">{r.anno_fiscale}</td><td className="text-sm">{euro(r.importo_fattura)}</td>
                            <td className="text-xs text-center">{r.percentuale}%</td><td className="font-semibold text-sm text-blue-700">{euro(r.importo_ritenuta)}</td>
                            <td className="text-xs text-gray-500 max-w-xs truncate">{r.note || '—'}</td>
                            <td><button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaRitenuta('ritenute_acconto', r.id)}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {ritenutaAcconto.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500 mb-2 font-medium">Totale credito fiscale per anno:</p>
                        <div className="flex gap-3 flex-wrap">
                          {Object.entries(ritenutaAcconto.reduce((acc, r) => { const a = r.anno_fiscale || 'N/A'; acc[a] = (acc[a] || 0) + (r.importo_ritenuta || 0); return acc }, {} as Record<string, number>)).sort(([a], [b]) => String(b).localeCompare(String(a))).map(([anno, tot]) => (
                            <div key={anno} className={`rounded-lg px-3 py-2 border ${Number(anno) === annoCorrente ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                              <p className="text-xs text-gray-500">{anno}</p>
                              <p className={`font-bold text-sm ${Number(anno) === annoCorrente ? 'text-blue-700' : 'text-gray-700'}`}>{euro(tot as number)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* MODAL RITENUTA D'ACCONTO DA SCADENZARIO */}
      {modalRitenutaScad && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div><h2 className="font-semibold">💼 Ritenuta d'acconto — {modalRitenutaScad.cliente_nome}</h2><p className="text-xs text-gray-500">Ft {modalRitenutaScad.fattura_numero} · Rata {modalRitenutaScad.rata} · Residuo: {euro(modalRitenutaScad.importoResiduo)}</p></div>
              <button onClick={() => setModalRitenutaScad(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500">Il condominio ha trattenuto la ritenuta e pagato solo il netto. L'importo uscirà dallo scadenzario e andrà nelle ritenute d'acconto come credito fiscale.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Imponibile su cui calcola (€)</label>
                  <input className="input" type="number" step="0.01" placeholder="es. 1000,00"
                    value={formRitenutaScad.importo}
                    onChange={e => setFormRitenutaScad(f => ({
                      ...f,
                      importo: e.target.value,
                    }))} />
                  <p className="text-xs text-gray-400 mt-0.5">Inserisci l'imponibile che il condominio usa per calcolare la ritenuta</p>
                </div>
                <div>
                  <label className="label">% Ritenuta</label>
                  <select className="input" value={formRitenutaScad.percentuale}
                    onChange={e => setFormRitenutaScad(f => ({ ...f, percentuale: e.target.value }))}>
                    <option value="4">4%</option>
                    <option value="11.50">11.5%</option>
                    <option value="20">20%</option>
                  </select>
                </div>
              </div>
              {formRitenutaScad.importo && (
                <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50">
                  <div className="flex justify-between"><span className="text-gray-500">Imponibile</span><span>{euro(parseFloat(formRitenutaScad.importo)||0)}</span></div>
                  <div className="flex justify-between font-semibold mt-1"><span className="text-gray-700">Ritenuta {formRitenutaScad.percentuale}%</span><span className="text-amber-700">{euro((parseFloat(formRitenutaScad.importo)||0) * (parseFloat(formRitenutaScad.percentuale)||4) / 100)}</span></div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1 border-t pt-1"><span>Residuo dopo registrazione</span><span>{euro(Math.max(0, modalRitenutaScad.importoResiduo - (parseFloat(formRitenutaScad.importo)||0) * (parseFloat(formRitenutaScad.percentuale)||4) / 100))}</span></div>
                </div>
              )}
              <div><label className="label">Data</label><input type="date" className="input" value={formRitenutaScad.data} onChange={e => setFormRitenutaScad(f => ({ ...f, data: e.target.value }))} /></div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button className="btn" onClick={() => setModalRitenutaScad(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaRitenutaScad} disabled={salvandoRitenutaScad}>{salvandoRitenutaScad ? 'Salvataggio...' : '💼 Registra ritenuta'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL STAMPA PAGARE */}
      {modalStampa && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold">🖨️ Stampa scadenze fornitori</h2><button onClick={() => setModalStampa(false)} className="text-gray-400 text-xl">×</button></div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-3 bg-gray-50 rounded-lg p-3"><input type="checkbox" checked={soloScadutoStampa} onChange={e => setSoloScadutoStampa(e.target.checked)} className="rounded" />Stampa solo le rate scadute</label>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div><label className="label">Scade dal</label><input className="input" type="date" value={stampaScadenzaDA} onChange={e => setStampaScadenzaDA(e.target.value)} /></div>
              <div><label className="label">Scade al</label><input className="input" type="date" value={stampaScadenzaA} onChange={e => setStampaScadenzaA(e.target.value)} /></div>
            </div>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-gray-400">Scorciatoie:</span>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => { const o = new Date(); const f = new Date(o.getFullYear(), o.getMonth()+1, 0); setStampaScadenzaDA(o.toISOString().split('T')[0]); setStampaScadenzaA(f.toISOString().split('T')[0]) }}>Entro fine mese</button>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => { const o = new Date(); const t = new Date(o.getFullYear(), o.getMonth()+1, 3); setStampaScadenzaDA(o.toISOString().split('T')[0]); setStampaScadenzaA(t.toISOString().split('T')[0]) }}>Entro il 3 del prossimo mese</button>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => { setStampaScadenzaDA(''); setStampaScadenzaA('') }}>× Azzera date</button>
            </div>
            <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-700">Fornitori ({fornitoriSelezionati.size}/{fornitoriUnici.length})</p><div className="flex gap-2"><button className="text-xs text-blue-600 hover:underline" onClick={() => setFornitoriSelezionati(new Set(fornitoriUnici))}>Tutti</button><button className="text-xs text-blue-600 hover:underline" onClick={() => setFornitoriSelezionati(new Set())}>Nessuno</button></div></div>
            <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
              {fornitoriUnici.map(nome => (<label key={nome} className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50 text-sm"><input type="checkbox" checked={fornitoriSelezionati.has(nome)} onChange={() => toggleFornitoreStampa(nome)} className="rounded" />{nome}</label>))}
            </div>
            <div className="bg-blue-50 rounded-lg p-3 mt-4 border border-blue-200"><p className="text-xs text-blue-600">Anteprima totale</p><p className="text-lg font-bold text-blue-800">{euro(totaleReportStampa)}</p><p className="text-xs text-blue-500 mt-0.5">{reportStampaPerFornitore.length} fornitori nel report</p></div>
            <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={() => setModalStampa(false)}>Annulla</button><button className="btn btn-primary" onClick={confermaStampa} disabled={fornitoriSelezionati.size === 0}>🖨️ Stampa</button></div>
          </div>
        </div>
      )}

      {/* MODAL GARANZIA */}
      {modalGaranzia && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold">🔒 Registra ritenuta a garanzia</h2><button onClick={() => setModalGaranzia(false)} className="text-gray-400 text-xl">×</button></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Cantiere</label><select className="input" value={formGaranzia.progetto_id} onChange={e => setFormGaranzia({...formGaranzia, progetto_id: e.target.value})}><option value="">-- seleziona --</option>{progetti.map(p => <option key={p.id} value={p.id}>{p.codice} — {p.nome}</option>)}</select></div>
              <div><label className="label">N° / Rif. Fattura</label><input className="input" placeholder="es. FT/2026/042" value={formGaranzia.fattura_riferimento} onChange={e => setFormGaranzia({...formGaranzia, fattura_riferimento: e.target.value})} /></div>
              <div><label className="label">Data fattura</label><input className="input" type="date" value={formGaranzia.data_fattura} onChange={e => setFormGaranzia({...formGaranzia, data_fattura: e.target.value})} /></div>
              <div><label className="label">Importo fattura (€)</label><input className="input" type="number" step="0.01" value={formGaranzia.importo_fattura} onChange={e => setFormGaranzia({...formGaranzia, importo_fattura: e.target.value})} /></div>
              <div><label className="label">% Ritenuta</label><input className="input" type="number" step="0.01" value={formGaranzia.percentuale} onChange={e => setFormGaranzia({...formGaranzia, percentuale: e.target.value})} /></div>
              {formGaranzia.importo_fattura && formGaranzia.percentuale && (<div className="col-span-2 bg-amber-50 rounded-lg p-3 border border-amber-200"><p className="text-xs text-amber-600">Ritenuta calcolata</p><p className="text-lg font-bold text-amber-800">{euro(parseFloat(formGaranzia.importo_fattura) * parseFloat(formGaranzia.percentuale) / 100)}</p><p className="text-xs text-amber-600 mt-0.5">Il cliente pagherà: {euro(parseFloat(formGaranzia.importo_fattura) * (1 - parseFloat(formGaranzia.percentuale) / 100))}</p></div>)}
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={formGaranzia.note} onChange={e => setFormGaranzia({...formGaranzia, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={() => setModalGaranzia(false)}>Annulla</button><button className="btn btn-primary" onClick={salvaGaranzia}>Salva ritenuta</button></div>
          </div>
        </div>
      )}

      {/* MODAL ACCONTO */}
      {modalAcconto && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold">📋 Registra ritenuta d'acconto</h2><button onClick={() => setModalAcconto(false)} className="text-gray-400 text-xl">×</button></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Cliente (condominio/PA)</label><input className="input" list="clienti-list" placeholder="Nome cliente..." value={formAcconto.cliente_nome} onChange={e => setFormAcconto({...formAcconto, cliente_nome: e.target.value})} /><datalist id="clienti-list">{clienti.map(c => <option key={c.id} value={c.ragione_sociale} />)}</datalist></div>
              <div><label className="label">N° Fattura</label><input className="input" placeholder="es. FT/2026/042" value={formAcconto.fattura_numero} onChange={e => setFormAcconto({...formAcconto, fattura_numero: e.target.value})} /></div>
              <div><label className="label">Data fattura</label><input className="input" type="date" value={formAcconto.data_fattura} onChange={e => setFormAcconto({...formAcconto, data_fattura: e.target.value})} /></div>
              <div><label className="label">Importo fattura (€)</label><input className="input" type="number" step="0.01" value={formAcconto.importo_fattura} onChange={e => setFormAcconto({...formAcconto, importo_fattura: e.target.value})} /></div>
              <div><label className="label">% Ritenuta</label><input className="input" type="number" step="0.01" value={formAcconto.percentuale} onChange={e => setFormAcconto({...formAcconto, percentuale: e.target.value})} /></div>
              {formAcconto.importo_fattura && formAcconto.percentuale && (<div className="col-span-2 bg-blue-50 rounded-lg p-3 border border-blue-200"><p className="text-xs text-blue-600">Ritenuta trattenuta (credito fiscale)</p><p className="text-lg font-bold text-blue-800">{euro(parseFloat(formAcconto.importo_fattura) * parseFloat(formAcconto.percentuale) / 100)}</p><p className="text-xs text-blue-600 mt-0.5">Il condominio pagherà: {euro(parseFloat(formAcconto.importo_fattura) * (1 - parseFloat(formAcconto.percentuale) / 100))}</p></div>)}
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={formAcconto.note} onChange={e => setFormAcconto({...formAcconto, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={() => setModalAcconto(false)}>Annulla</button><button className="btn btn-primary" onClick={salvaAcconto}>Salva ritenuta</button></div>
          </div>
        </div>
      )}

      {/* MODAL SVINCOLO */}
      {modalSvincolo && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold">✓ Registra svincolo ritenuta</h2><button onClick={() => setModalSvincolo(null)} className="text-gray-400 text-xl">×</button></div>
            <div className="bg-amber-50 rounded-lg p-3 mb-4 border border-amber-200"><p className="text-xs text-amber-600">Ritenuta da svincolare</p><p className="font-bold text-amber-800">{modalSvincolo.progetto_nome} — {euro(modalSvincolo.importo_ritenuta)}</p><p className="text-xs text-amber-600 mt-0.5">Rif: {modalSvincolo.fattura_riferimento || '—'}</p></div>
            <div className="space-y-3">
              <div><label className="label">Data svincolo</label><input className="input" type="date" value={formSvincolo.data_svincolo} onChange={e => setFormSvincolo({...formSvincolo, data_svincolo: e.target.value})} /></div>
              <div><label className="label">Importo svincolato (€)</label><input className="input" type="number" step="0.01" value={formSvincolo.importo_svincolato} onChange={e => setFormSvincolo({...formSvincolo, importo_svincolato: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={() => setModalSvincolo(null)}>Annulla</button><button className="btn btn-success" onClick={registraSvincolo}>Conferma svincolo</button></div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body * { visibility: hidden; }
          #report-incassare, #report-incassare *, #report-pagare, #report-pagare * { visibility: visible; }
          #report-incassare, #report-pagare { position: static !important; width: 100% !important; height: auto !important; max-height: none !important; overflow: visible !important; padding: 0 !important; font-size: 11px; }
          main { overflow: visible !important; height: auto !important; max-height: none !important; width: 100% !important; flex: none !important; padding: 0 !important; margin: 0 !important; }
          .flex.min-h-screen { display: block !important; }
          .print\:hidden { display: none !important; }
          .hidden.print\:block { display: block !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}
