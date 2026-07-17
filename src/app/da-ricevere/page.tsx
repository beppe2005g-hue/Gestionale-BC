'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { logActivity } from '@/lib/logActivity'
import jsPDF from 'jspdf'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
interface CostoExtra { descrizione: string; importo: number }

function generaAutorizzazionePDF(opts: {
  fornitore: string, numeroFattura: string, impFattura: number,
  ddtList: any[], note: string, costiExtra: CostoExtra[]
}) {
  const { fornitore, numeroFattura, impFattura, ddtList, note, costiExtra } = opts
  const totDdt = ddtList.reduce((s, d) => s + d.importo, 0)
  const totExtra = costiExtra.reduce((s, c) => s + c.importo, 0)
  const totale = totDdt + totExtra
  const scostamento = impFattura - totale
  const corrispondente = Math.abs(scostamento) < 0.02
  const doc = new jsPDF()
  const PAGE_H = 297, MARGIN_BOTTOM = 60
  let y = 20
  const checkPage = (needed: number) => { if (y + needed > PAGE_H - MARGIN_BOTTOM) { doc.addPage(); y = 20 } }
  try { doc.addImage('/logo.png', 'PNG', 14, 10, 18, 18) } catch (e) {}
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('BC GENERAL SERVICE', 105, 16, { align: 'center' })
  doc.setFontSize(13); doc.text('AUTORIZZAZIONE A PAGARE', 105, 24, { align: 'center' })
  y = 36; doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  doc.text(`Data: ${new Date().toLocaleDateString('it-IT')}`, 14, y); y += 7
  doc.text(`Fornitore: ${fornitore}`, 14, y); y += 7
  doc.text(`Fattura n°: ${numeroFattura}`, 14, y); y += 10
  checkPage(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('DDT abbinati', 14, y); y += 6; doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('Data', 14, y); doc.text('N° DDT', 45, y); doc.text('Cantiere', 85, y)
  doc.text('Importo', 196, y, { align: 'right' }); y += 2; doc.line(14, y, 196, y); y += 5
  ddtList.forEach(d => { checkPage(8); doc.text(d.data ? new Date(d.data).toLocaleDateString('it-IT') : '—', 14, y); doc.text(String(d.numero || ''), 45, y); doc.text((d.progetto_nome || '—').substring(0, 40), 85, y); doc.text(euro(d.importo), 196, y, { align: 'right' }); y += 6 })
  checkPage(14); y += 2; doc.line(14, y, 196, y); y += 6; doc.setFont('helvetica', 'bold')
  doc.text('Totale DDT:', 140, y); doc.text(euro(totDdt), 196, y, { align: 'right' }); y += 8
  if (costiExtra.length > 0) {
    checkPage(20); doc.setFontSize(10); doc.text('Costi extra', 14, y); y += 6; doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text('Descrizione', 14, y); doc.text('Importo', 196, y, { align: 'right' }); y += 2; doc.line(14, y, 196, y); y += 5
    costiExtra.forEach(c => { checkPage(8); doc.text(c.descrizione, 14, y); doc.text(euro(c.importo), 196, y, { align: 'right' }); y += 6 })
    checkPage(14); y += 2; doc.line(14, y, 196, y); y += 6; doc.setFont('helvetica', 'bold')
    doc.text('Totale costi extra:', 140, y); doc.text(euro(totExtra), 196, y, { align: 'right' }); y += 8
  }
  checkPage(40); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text('Totale DDT + extra:', 140, y); doc.text(euro(totale), 196, y, { align: 'right' }); y += 7
  doc.text('Imponibile fattura:', 140, y); doc.text(euro(impFattura), 196, y, { align: 'right' }); y += 10
  if (corrispondente) { doc.setFillColor(220, 252, 231); doc.setTextColor(22, 101, 52); doc.rect(14, y - 5, 182, 10, 'F'); doc.text('IMPORTI CORRISPONDENTI', 105, y + 1, { align: 'center' }) }
  else { doc.setFillColor(254, 226, 226); doc.setTextColor(153, 27, 27); doc.rect(14, y - 5, 182, 10, 'F'); doc.text(`SCOSTAMENTO: ${euro(scostamento)}`, 105, y + 1, { align: 'center' }) }
  doc.setTextColor(0, 0, 0); y += 16
  checkPage(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Note:', 14, y); y += 6; doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  if (note) { const lines = doc.splitTextToSize(note, 182); checkPage(lines.length * 5 + 10); doc.text(lines, 14, y); y += lines.length * 5 + 4 } else { checkPage(28); doc.rect(14, y, 182, 18); y += 24 }
  if (y > PAGE_H - MARGIN_BOTTOM) { doc.addPage(); y = 20 }; y += 12
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('Firma Tecnico', 45, y, { align: 'center' }); doc.text('Firma Titolare', 155, y, { align: 'center' }); y += 4
  doc.line(14, y, 88, y); doc.line(118, y, 192, y)
  doc.save(`Autorizzazione_${numeroFattura.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`)
}

export default function DaRiceverePage() {
  const [tab, setTab] = useState<'aperte'|'fatturate'>('aperte')
  const [gruppi, setGruppi] = useState<any[]>([])
  const [fattureChiuse, setFattureChiuse] = useState<any[]>([])
  const [espanso, setEspanso] = useState<string | null>(null)
  const [espansoFatt, setEspansoFatt] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [fornSel, setFornSel] = useState('')
  const [nFattura, setNFattura] = useState('')
  const [impFattura, setImpFattura] = useState('')
  const [scadenza, setScadenza] = useState('')
  const [noteAbbinamento, setNoteAbbinamento] = useState('')
  const [ddtFornitore, setDdtFornitore] = useState<any[]>([])
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set())
  const [filtroCantiere, setFiltroCantiere] = useState('')
  const [loading, setLoading] = useState(false)
  const [costiExtra, setCostiExtra] = useState<CostoExtra[]>([])
  const [cercaFornitoreAperte, setCercaFornitoreAperte] = useState('')
  const [cercaFornitoreStorico, setCercaFornitoreStorico] = useState('')
  const [filtroStatoStorico, setFiltroStatoStorico] = useState('tutti')
  const [dataDAStorico, setDataDAStorico] = useState('')
  const [dataAStorico, setDataAStorico] = useState('')
  const [noteStorico, setNoteStorico] = useState<Record<string, string>>({})
  const [fattureFornitoreAperte, setFattureFornitoreAperte] = useState<any[]>([])
  const [cercaDdtModal, setCercaDdtModal] = useState('')   // suggerite (stesso fornitore)
  const [tutteFattureAperte, setTutteFattureAperte] = useState<any[]>([])            // elenco completo da cercare
  const [fatturaEsistenteSel, setFatturaEsistenteSel] = useState<any | null>(null)
  const [cercaFatturaLibera, setCercaFatturaLibera] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: aperti } = await supabase.from('ddt').select('*').eq('stato', 'Da Fatturare').order('data', { ascending: true })
    if (aperti) {
      const mappa: Record<string, any> = {}
      aperti.forEach(d => { if (!mappa[d.fornitore_nome]) mappa[d.fornitore_nome] = { fornitore: d.fornitore_nome, n: 0, totale: 0, ddt: [] }; mappa[d.fornitore_nome].n++; mappa[d.fornitore_nome].totale += d.importo; mappa[d.fornitore_nome].ddt.push(d) })
      setGruppi(Object.values(mappa).sort((a, b) => b.totale - a.totale))
    }
    const { data: ff } = await supabase.from('fatture_fornitori').select('*').order('data', { ascending: false })
    if (ff) {
      const arricchite = await Promise.all(ff.map(async (f: any) => {
        const { data: ddtAbbinati } = await supabase.from('ddt').select('*').eq('fattura_abbinata', f.numero).order('data', { ascending: true })
        const { data: extra } = await supabase.from('fattura_costi_extra').select('*').eq('fattura_id', f.id).order('created_at', { ascending: true })
        return { ...f, ddt_abbinati: ddtAbbinati || [], costi_extra: extra || [] }
      }))
      setFattureChiuse(arricchite.filter(f => f.ddt_abbinati.length > 0 || f.costi_extra.length > 0))
    }
  }

  async function apriAbbinamento(fornitore: string) {
    setFornSel(fornitore)
    const g = gruppi.find(g => g.fornitore === fornitore)
    setDdtFornitore(g ? g.ddt : [])
    setSelezionati(new Set()); setFiltroCantiere('')
    setNFattura(''); setImpFattura(''); setScadenza(''); setNoteAbbinamento('')
    setCostiExtra([]); setFatturaEsistenteSel(null); setCercaDdtModal('')
    const { data: suggerite } = await supabase.from('fatture_fornitori')
      .select('id,numero,data,imponibile,fornitore_nome,rata1_stato,rata2_stato,rata3_stato')
      .eq('fornitore_nome', fornitore)
      .or('rata1_stato.eq.Da Pagare,rata2_stato.eq.Da Pagare,rata3_stato.eq.Da Pagare')
      .order('data', { ascending: false })
    setFattureFornitoreAperte(suggerite || [])
    const { data: tutte } = await supabase.from('fatture_fornitori')
      .select('id,numero,data,imponibile,fornitore_nome,rata1_stato,rata2_stato,rata3_stato')
      .or('rata1_stato.eq.Da Pagare,rata2_stato.eq.Da Pagare,rata3_stato.eq.Da Pagare')
      .order('data', { ascending: false })
      .limit(300)
    setTutteFattureAperte(tutte || [])
    setCercaFatturaLibera('')
    setModal(true)
  }

  function toggleSel(id: string) { setSelezionati(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  function aggiungiCostoExtra() { setCostiExtra(prev => [...prev, { descrizione: '', importo: 0 }]) }
  function aggiornaCostoExtra(idx: number, field: keyof CostoExtra, value: string) { setCostiExtra(prev => prev.map((c, i) => i === idx ? { ...c, [field]: field === 'importo' ? parseFloat(value) || 0 : value } : c)) }
  function rimuoviCostoExtra(idx: number) { setCostiExtra(prev => prev.filter((_, i) => i !== idx)) }

  const cantieriFornitore = [...new Set(ddtFornitore.map(d => d.progetto_nome || '—'))].sort()
  const ddtFiltrati = ddtFornitore.filter(d => {
    if (filtroCantiere && (d.progetto_nome || '—') !== filtroCantiere) return false
    if (cercaDdtModal) {
      const q = cercaDdtModal.toLowerCase()
      if (!d.numero?.toLowerCase().includes(q) && !d.descrizione?.toLowerCase().includes(q) && !(d.progetto_nome||'').toLowerCase().includes(q)) return false
    }
    return true
  })
  const ddtPerCantiere: Record<string, any[]> = {}
  ddtFiltrati.forEach(d => { const key = d.progetto_nome || '— Senza cantiere'; if (!ddtPerCantiere[key]) ddtPerCantiere[key] = []; ddtPerCantiere[key].push(d) })
  const totSel = ddtFornitore.filter(d => selezionati.has(d.id)).reduce((s, d) => s + d.importo, 0)
  const totExtra = costiExtra.reduce((s, c) => s + (c.importo || 0), 0)
  const totaleAbbinamento = totSel + totExtra
  const scostamento = parseFloat(impFattura || '0') - totaleAbbinamento
  const scostOk = Math.abs(scostamento) < 0.02 && (selezionati.size > 0 || costiExtra.length > 0)

  const gruppiFiltrati = useMemo(() => !cercaFornitoreAperte ? gruppi : gruppi.filter(g => g.fornitore.toLowerCase().includes(cercaFornitoreAperte.toLowerCase())), [gruppi, cercaFornitoreAperte])
  const totaleAperte = gruppiFiltrati.reduce((s, g) => s + g.totale, 0)

  const fattureStoricFiltrate = useMemo(() => fattureChiuse.filter(f => {
    if (cercaFornitoreStorico && !f.fornitore_nome?.toLowerCase().includes(cercaFornitoreStorico.toLowerCase())) return false
    if (dataDAStorico && f.data < dataDAStorico) return false
    if (dataAStorico && f.data > dataAStorico) return false
    if (filtroStatoStorico !== 'tutti') {
      const pagata = f.rata1_stato === 'Pagata' && (!f.rata2_stato || f.rata2_stato === 'Pagata') && (!f.rata3_stato || f.rata3_stato === 'Pagata')
      if (filtroStatoStorico === 'pagata' && !pagata) return false
      if (filtroStatoStorico === 'da_pagare' && pagata) return false
    }
    return true
  }), [fattureChiuse, cercaFornitoreStorico, dataDAStorico, dataAStorico, filtroStatoStorico])
  const haFiltriStorico = cercaFornitoreStorico || filtroStatoStorico !== 'tutti' || dataDAStorico || dataAStorico

  async function eseguiAbbinamento() {
    if (!nFattura || !impFattura) { alert('Inserisci N° fattura e importo'); return }
    if (selezionati.size === 0 && costiExtra.length === 0) { alert('Seleziona almeno un DDT o aggiungi un costo extra'); return }
    setLoading(true)
    const ddtSelezionati = ddtFornitore.filter(d => selezionati.has(d.id))
    if (selezionati.size > 0)
      await supabase.from('ddt').update({ stato: 'Fatturato', fattura_abbinata: nFattura }).in('id', Array.from(selezionati))
    let fatturaId: string | null = null
    if (fatturaEsistenteSel) {
      fatturaId = fatturaEsistenteSel.id
      const aggiornamenti: any = {}
      if (scadenza) aggiornamenti.rata1_scadenza = scadenza
      if (noteAbbinamento) aggiornamenti.note = noteAbbinamento
      if (Object.keys(aggiornamenti).length > 0)
        await supabase.from('fatture_fornitori').update(aggiornamenti).eq('id', fatturaId)
    } else {
      const { data: inserted } = await supabase.from('fatture_fornitori').insert({
        data: new Date().toISOString().split('T')[0], numero: nFattura,
        fornitore_id: ddtFornitore[0]?.fornitore_id, fornitore_nome: fornSel,
        imponibile: parseFloat(impFattura), iva_percentuale: 22,
        rata1_importo: parseFloat(impFattura) * 1.22,
        rata1_scadenza: scadenza || null, rata1_stato: 'Da Pagare',
        note: noteAbbinamento || null,
      }).select('id').single()
      fatturaId = inserted?.id || null
    }
    if (fatturaId && costiExtra.length > 0) {
      const extraValidi = costiExtra.filter(c => c.descrizione && c.importo > 0)
      if (extraValidi.length > 0)
        await supabase.from('fattura_costi_extra').insert(extraValidi.map(c => ({ fattura_id: fatturaId, descrizione: c.descrizione, importo: c.importo })))
    }
    await logActivity('inserimento', 'fatture_fornitori', fatturaId || '', `Abbinamento ${selezionati.size} DDT -> Ft ${nFattura} - ${fornSel}${fatturaEsistenteSel ? ' (esistente)' : ' (nuova)'}`)
    generaAutorizzazionePDF({ fornitore: fornSel, numeroFattura: nFattura, impFattura: parseFloat(impFattura), ddtList: ddtSelezionati, note: noteAbbinamento, costiExtra: costiExtra.filter(c => c.descrizione && c.importo > 0) })
    setModal(false); load(); setLoading(false)
  }

  function generaPdfStorico(f: any) {
    generaAutorizzazionePDF({ fornitore: f.fornitore_nome, numeroFattura: f.numero, impFattura: f.imponibile, ddtList: f.ddt_abbinati, note: noteStorico[f.id] ?? (f.note || ''), costiExtra: f.costi_extra || [] })
  }

  const statoRataBadge = (f: any) => {
    if (f.rata1_stato === 'Pagata' && (!f.rata2_stato || f.rata2_stato === 'Pagata') && (!f.rata3_stato || f.rata3_stato === 'Pagata'))
      return <span className="badge badge-green">Pagata</span>
    if (f.rata1_stato === 'Da Pagare' || f.rata2_stato === 'Da Pagare' || f.rata3_stato === 'Da Pagare')
      return <span className="badge badge-amber">Da Pagare</span>
    return <span className="badge badge-gray">—</span>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Fatture da ricevere</h1>
        </div>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('aperte')} className={`btn ${tab === 'aperte' ? 'btn-primary' : ''}`}>Da fatturare ({gruppi.length} fornitori)</button>
          <button onClick={() => setTab('fatturate')} className={`btn ${tab === 'fatturate' ? 'btn-primary' : ''}`}>Storico fatturate ({fattureChiuse.length})</button>
        </div>

        {tab === 'aperte' && (
          <>
            <div className="card mb-4">
              <div className="flex gap-3 items-end">
                <div className="flex-1"><label className="label">Cerca fornitore</label>
                  <input className="input" placeholder="Nome fornitore..." value={cercaFornitoreAperte} onChange={e => setCercaFornitoreAperte(e.target.value)} /></div>
                {cercaFornitoreAperte && <button className="btn btn-sm" onClick={() => setCercaFornitoreAperte('')}>Reset</button>}
              </div>
              {cercaFornitoreAperte && <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">{gruppiFiltrati.length} fornitori — Totale: <strong>{euro(totaleAperte)}</strong></div>}
            </div>
            {gruppiFiltrati.length === 0
              ? <div className="card text-center py-12 text-gray-400">{cercaFornitoreAperte ? 'Nessun fornitore trovato.' : 'Tutti i DDT sono stati fatturati.'}</div>
              : <div className="space-y-2">
                  {gruppiFiltrati.map(g => (
                    <div key={g.fornitore} className="card p-0 overflow-hidden">
                      <div className="flex items-center gap-4 px-4 py-3 bg-gray-900 cursor-pointer" onClick={() => setEspanso(espanso === g.fornitore ? null : g.fornitore)}>
                        <span className="text-white font-medium text-sm flex-1">{g.fornitore}</span>
                        <span className="text-gray-300 text-xs">{g.n} DDT aperti</span>
                        <span className="text-white font-semibold text-sm">{euro(g.totale)}</span>
                        <span className="text-gray-400 text-xs">(+IVA: {euro(g.totale * 1.22)})</span>
                        <button className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg ml-2"
                          onClick={e => { e.stopPropagation(); apriAbbinamento(g.fornitore) }}>Abbina fattura</button>
                        <span className="text-gray-400 text-sm">{espanso === g.fornitore ? '▲' : '▼'}</span>
                      </div>
                      {espanso === g.fornitore && (
                        <div className="border-t border-gray-100">
                          <table className="table-base">
                            <thead><tr><th>Data</th><th>N° DDT</th><th>Cantiere</th><th>Descrizione</th><th>Importo</th></tr></thead>
                            <tbody>
                              {g.ddt.map((d: any) => (
                                <tr key={d.id}>
                                  <td className="text-xs">{new Date(d.data).toLocaleDateString('it-IT')}</td>
                                  <td className="font-medium text-xs">{d.numero}</td>
                                  <td className="text-xs text-gray-600">{d.progetto_nome || '—'}</td>
                                  <td className="text-xs text-gray-500">{d.descrizione || '—'}</td>
                                  <td className="font-medium text-sm">{euro(d.importo)}</td>
                                </tr>
                              ))}
                              <tr className="bg-gray-50"><td colSpan={4} className="text-xs font-medium text-right text-gray-600">Totale</td><td className="font-bold text-sm">{euro(g.totale)}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>}
          </>
        )}

        {tab === 'fatturate' && (
          <>
            <div className="card mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                <div className="md:col-span-2"><label className="label">Cerca fornitore</label><input className="input" placeholder="Nome fornitore..." value={cercaFornitoreStorico} onChange={e => setCercaFornitoreStorico(e.target.value)} /></div>
                <div><label className="label">Stato pagamento</label>
                  <select className="input" value={filtroStatoStorico} onChange={e => setFiltroStatoStorico(e.target.value)}>
                    <option value="tutti">Tutti</option><option value="da_pagare">Da pagare</option><option value="pagata">Pagate</option>
                  </select></div>
                <div></div>
                <div><label className="label">Data dal</label><input className="input" type="date" value={dataDAStorico} onChange={e => setDataDAStorico(e.target.value)} /></div>
                <div><label className="label">Data al</label><input className="input" type="date" value={dataAStorico} onChange={e => setDataAStorico(e.target.value)} /></div>
              </div>
              {haFiltriStorico && <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">{fattureStoricFiltrate.length} fatture su {fattureChiuse.length}</span>
                <button onClick={() => { setCercaFornitoreStorico(''); setFiltroStatoStorico('tutti'); setDataDAStorico(''); setDataAStorico('') }} className="text-xs text-blue-600 hover:underline">Azzera filtri</button>
              </div>}
            </div>
            {fattureStoricFiltrate.length === 0
              ? <div className="card text-center py-12 text-gray-400">{haFiltriStorico ? 'Nessuna fattura con questi filtri.' : 'Nessuna fattura ancora registrata.'}</div>
              : <div className="space-y-2">
                  {fattureStoricFiltrate.map(f => {
                    const totDdtF = f.ddt_abbinati.reduce((s: number, d: any) => s + d.importo, 0)
                    const totExtraF = (f.costi_extra || []).reduce((s: number, c: any) => s + c.importo, 0)
                    const totaleF = totDdtF + totExtraF; const scostF = f.imponibile - totaleF; const corrispF = Math.abs(scostF) < 0.02
                    return (
                      <div key={f.id} className="card p-0 overflow-hidden">
                        <div className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => setEspansoFatt(espansoFatt === f.id ? null : f.id)}>
                          <div className="flex-1"><span className="font-medium text-sm">{f.fornitore_nome}</span><span className="text-gray-400 text-xs ml-2">{f.numero}</span></div>
                          <span className="text-xs text-gray-500">{f.data ? new Date(f.data).toLocaleDateString('it-IT') : '—'}</span>
                          <span className="font-semibold text-sm">{euro(f.imponibile)}</span>
                          {statoRataBadge(f)}
                          <span className="text-gray-400 text-sm ml-2">{espansoFatt === f.id ? '▲' : '▼'}</span>
                        </div>
                        {espansoFatt === f.id && (
                          <div className="border-t border-gray-100 bg-blue-50">
                            <div className="px-4 py-2 text-xs font-medium text-blue-700">DDT abbinati ({f.ddt_abbinati.length})</div>
                            <table className="table-base">
                              <thead><tr><th>Data</th><th>N° DDT</th><th>Cantiere</th><th>Descrizione</th><th>Importo</th></tr></thead>
                              <tbody>
                                {f.ddt_abbinati.map((d: any) => (<tr key={d.id}><td className="text-xs">{new Date(d.data).toLocaleDateString('it-IT')}</td><td className="font-medium text-xs">{d.numero}</td><td className="text-xs text-gray-600">{d.progetto_nome || '—'}</td><td className="text-xs text-gray-500">{d.descrizione || '—'}</td><td className="font-medium text-sm">{euro(d.importo)}</td></tr>))}
                                <tr className="bg-blue-100"><td colSpan={4} className="text-xs font-medium text-right text-blue-700">Totale DDT</td><td className="font-bold text-sm text-blue-700">{euro(totDdtF)}</td></tr>
                              </tbody>
                            </table>
                            {(f.costi_extra || []).length > 0 && (<>
                              <div className="px-4 py-2 text-xs font-medium text-orange-700 bg-orange-50 border-t border-orange-100">Costi extra</div>
                              <table className="table-base"><thead><tr><th>Descrizione</th><th>Importo</th></tr></thead>
                                <tbody>{f.costi_extra.map((c: any) => (<tr key={c.id}><td className="text-xs">{c.descrizione}</td><td className="font-medium text-sm text-orange-700">{euro(c.importo)}</td></tr>))}<tr className="bg-orange-50"><td className="text-xs font-medium text-right text-orange-700">Totale extra</td><td className="font-bold text-sm text-orange-700">{euro(totExtraF)}</td></tr></tbody>
                              </table>
                            </>)}
                            <table className="table-base"><tbody>
                              <tr className="bg-blue-100"><td colSpan={4} className="text-xs font-medium text-right text-blue-700">Totale DDT + extra</td><td className="font-bold text-sm text-blue-700">{euro(totaleF)}</td></tr>
                              <tr className="bg-blue-100"><td colSpan={4} className="text-xs font-medium text-right text-blue-700">Imponibile fattura</td><td className="font-bold text-sm text-blue-700">{euro(f.imponibile)}</td></tr>
                              <tr className={corrispF ? 'bg-green-50' : 'bg-red-50'}><td colSpan={4} className="text-xs font-medium text-right">Scostamento</td><td className={`font-bold text-sm ${corrispF ? 'text-green-700' : 'text-red-700'}`}>{euro(scostF)}</td></tr>
                            </tbody></table>
                            <div className="px-4 py-3 flex items-end gap-3">
                              <div className="flex-1"><label className="label">Note per autorizzazione</label>
                                <input className="input" placeholder="Note (opzionale)" value={noteStorico[f.id] ?? (f.note || '')} onChange={e => setNoteStorico(prev => ({ ...prev, [f.id]: e.target.value }))} /></div>
                              <button className="btn btn-primary text-sm" onClick={() => generaPdfStorico(f)}>Genera PDF</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>}
          </>
        )}
      </main>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="text-base font-semibold">Abbina fattura a DDT</h2>
                <p className="text-xs text-gray-500 mt-0.5">Fornitore: <strong>{fornSel}</strong></p></div>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">x</button>
            </div>

            {/* SELEZIONE FATTURA */}
            <div className="mb-5 space-y-4">

              {/* ── FATTURA SELEZIONATA — riepilogo fisso ── */}
              {fatturaEsistenteSel && (
                <div className="flex items-center justify-between bg-green-50 border-2 border-green-400 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-green-800">N° {nFattura}</span>
                    <span className="text-sm text-green-700">{euro(parseFloat(impFattura || '0'))}</span>
                    <span className="text-xs text-green-600">{fatturaEsistenteSel.fornitore_nome}</span>
                    <span className="badge badge-green text-xs">✓ Collegata — nessun duplicato</span>
                  </div>
                  <button className="text-xs text-gray-400 hover:text-red-600 ml-4"
                    onClick={() => { setFatturaEsistenteSel(null); setNFattura(''); setImpFattura(''); setCercaFatturaLibera('') }}>
                    × Deseleziona
                  </button>
                </div>
              )}

              {!fatturaEsistenteSel && (<>

                {/* ── IN ALTO: SUGGERITE (stesso fornitore) ── */}
                {fattureFornitoreAperte.length > 0 && (
                  <div className="border border-blue-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-blue-600 text-white flex items-center gap-2">
                      <span className="text-xs font-bold">⭐ Suggerite — fatture aperte di {fornSel}</span>
                      <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">{fattureFornitoreAperte.length}</span>
                    </div>
                    {fattureFornitoreAperte.map(f => (
                      <button key={f.id} onClick={() => { setFatturaEsistenteSel(f); setNFattura(f.numero || ''); setImpFattura(String(f.imponibile || '')) }}
                        className="w-full text-left px-4 py-3 border-b border-gray-100 flex items-center justify-between hover:bg-blue-50 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-blue-700">N° {f.numero}</p>
                          <p className="text-xs text-gray-400">{f.data ? new Date(f.data).toLocaleDateString('it-IT') : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-800">{euro(f.imponibile)}</p>
                          <p className="text-xs text-blue-500">Seleziona →</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* ── IN BASSO: ELENCO COMPLETO CON RICERCA ── */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <p className="text-xs font-semibold text-gray-600 mb-1.5">🔍 Tutte le fatture aperte — cerca per numero o fornitore</p>
                    <input className="input text-sm" placeholder="es. FF/2026/018 oppure nome fornitore..."
                      value={cercaFatturaLibera} onChange={e => setCercaFatturaLibera(e.target.value)} autoFocus={fattureFornitoreAperte.length === 0} />
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {(() => {
                      const q = cercaFatturaLibera.toLowerCase()
                      const filtrate = tutteFattureAperte.filter(f =>
                        !q || (f.numero || '').toLowerCase().includes(q) || (f.fornitore_nome || '').toLowerCase().includes(q)
                      )
                      if (filtrate.length === 0) return (
                        <p className="text-xs text-gray-400 text-center py-6">Nessuna fattura aperta trovata{q ? ` per "${cercaFatturaLibera}"` : ''}</p>
                      )
                      return filtrate.slice(0, 50).map(f => (
                        <button key={f.id} onClick={() => { setFatturaEsistenteSel(f); setNFattura(f.numero || ''); setImpFattura(String(f.imponibile || '')) }}
                          className="w-full text-left px-4 py-2.5 border-b border-gray-50 flex items-center justify-between hover:bg-gray-50 transition-colors">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800">N° {f.numero}</p>
                            <p className="text-xs text-gray-400 truncate">{f.fornitore_nome} · {f.data ? new Date(f.data).toLocaleDateString('it-IT') : ''}</p>
                          </div>
                          <span className="text-sm font-semibold text-gray-600 ml-3 flex-shrink-0">{euro(f.imponibile)}</span>
                        </button>
                      ))
                    })()}
                  </div>
                </div>

                {/* ── OPPURE NUOVA FATTURA ── */}
                <div className="border border-dashed border-gray-300 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-2 font-medium">Oppure inserisci una fattura non ancora registrata:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">N° Fattura *</label>
                      <input className="input" placeholder="es. FF/2026/018" value={nFattura} onChange={e => setNFattura(e.target.value)} />
                    </div>
                    <div>
                      <label className="label text-xs">Imponibile (€) *</label>
                      <input className="input" type="number" step="0.01" placeholder="0.00" value={impFattura} onChange={e => setImpFattura(e.target.value)} />
                    </div>
                  </div>
                </div>

              </>)}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><label className="label">Scadenza pagamento</label>
                <input className="input" type="date" value={scadenza} onChange={e => setScadenza(e.target.value)} /></div>
              {cantieriFornitore.length > 1 && (
                <div><label className="label">Filtra per cantiere</label>
                  <select className="input" value={filtroCantiere} onChange={e => setFiltroCantiere(e.target.value)}>
                    <option value="">Tutti ({ddtFornitore.length} DDT)</option>
                    {cantieriFornitore.map(c => (<option key={c} value={c}>{c} ({ddtFornitore.filter(d => (d.progetto_nome || '—') === c).length})</option>))}
                  </select></div>
              )}
              <div className="col-span-2"><label className="label">Note (per autorizzazione a pagare)</label>
                <input className="input" placeholder="Note opzionali" value={noteAbbinamento} onChange={e => setNoteAbbinamento(e.target.value)} /></div>
            </div>

            <div className="mb-4 space-y-3">
              <div className="flex gap-2 items-center mb-2">
                <p className="text-xs font-medium text-gray-600 flex-shrink-0">Spunta i DDT coperti da questa fattura:</p>
                <input className="input text-xs py-1 flex-1" placeholder="🔍 Cerca per N° DDT, descrizione, cantiere..." value={cercaDdtModal} onChange={e => setCercaDdtModal(e.target.value)} />
                {cercaDdtModal && <button className="text-xs text-gray-400 hover:text-gray-700" onClick={() => setCercaDdtModal('')}>×</button>}
              </div>
              {cercaDdtModal && <p className="text-xs text-gray-400 mb-2">{ddtFiltrati.length} DDT trovati</p>}
              {Object.entries(ddtPerCantiere).map(([cantiere, ddt]) => (
                <div key={cantiere} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-xs font-semibold text-gray-700">📍 {cantiere}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{ddt.length} DDT · {euro(ddt.reduce((s, d) => s + d.importo, 0))}</span>
                      <button className="text-xs text-blue-600 hover:underline" onClick={() => {
                        const ids = ddt.map((d: any) => d.id)
                        const tuttiSel = ids.every((id: string) => selezionati.has(id))
                        setSelezionati(prev => { const n = new Set(prev); if (tuttiSel) ids.forEach((id: string) => n.delete(id)); else ids.forEach((id: string) => n.add(id)); return n })
                      }}>{ddt.every((d: any) => selezionati.has(d.id)) ? 'Deseleziona tutti' : 'Seleziona tutti'}</button>
                    </div>
                  </div>
                  <table className="table-base">
                    <thead><tr><th style={{width:36}}></th><th>Data</th><th>N° DDT</th><th>Descrizione</th><th>Importo</th></tr></thead>
                    <tbody>
                      {ddt.map((d: any) => (
                        <tr key={d.id} className={`cursor-pointer ${selezionati.has(d.id) ? 'bg-green-50' : ''}`} onClick={() => toggleSel(d.id)}>
                          <td><input type="checkbox" checked={selezionati.has(d.id)} onChange={() => toggleSel(d.id)} className="rounded" /></td>
                          <td className="text-xs">{new Date(d.data).toLocaleDateString('it-IT')}</td>
                          <td className="font-medium text-xs">{d.numero}</td>
                          <td className="text-xs text-gray-500">{d.descrizione || '—'}</td>
                          <td className="font-medium text-sm">{euro(d.importo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600">Costi extra (spese non in bolla)</p>
                <button onClick={aggiungiCostoExtra} className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-lg">Aggiungi costo extra</button>
              </div>
              {costiExtra.length > 0 && (
                <div className="border border-orange-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-orange-50 border-b border-orange-100"><span className="text-xs font-semibold text-orange-700">Costi aggiuntivi</span></div>
                  <div className="divide-y divide-gray-100">
                    {costiExtra.map((c, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-2">
                        <input className="input flex-1 text-xs" placeholder="es. Spese di incasso" value={c.descrizione} onChange={e => aggiornaCostoExtra(idx, 'descrizione', e.target.value)} />
                        <input className="input w-28 text-xs text-right" type="number" step="0.01" placeholder="0.00" value={c.importo || ''} onChange={e => aggiornaCostoExtra(idx, 'importo', e.target.value)} />
                        <button onClick={() => rimuoviCostoExtra(idx)} className="text-red-400 hover:text-red-600 text-lg px-1">x</button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 bg-orange-50">
                      <span className="text-xs font-medium text-orange-700">Totale extra</span>
                      <span className="text-sm font-bold text-orange-700">{euro(totExtra)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className={`rounded-lg p-3 mb-4 text-sm font-medium ${
              (selezionati.size === 0 && costiExtra.length === 0) ? 'bg-gray-50 text-gray-500' :
              scostOk ? 'bg-green-50 text-green-800 border border-green-200' :
              scostamento > 0 ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              {(selezionati.size === 0 && costiExtra.length === 0) ? 'Seleziona i DDT o aggiungi costi extra' :
               !impFattura ? "Inserisci l'importo della fattura" :
               scostOk ? `CORRISPONDENTE — DDT: ${euro(totSel)}${totExtra > 0 ? ` + Extra: ${euro(totExtra)}` : ''} = ${euro(totaleAbbinamento)} | Fattura: ${euro(parseFloat(impFattura))}` :
               scostamento > 0 ? `Fattura supera il totale di ${euro(scostamento)}` : `Totale supera la fattura di ${euro(Math.abs(scostamento))}`}
            </div>
            <div className="flex gap-2 justify-between items-center">
              <p className="text-xs text-gray-400">{selezionati.size} DDT · {euro(totSel)}{totExtra > 0 ? ` + ${euro(totExtra)} extra` : ''} = {euro(totaleAbbinamento)}</p>
              <div className="flex gap-2">
                <button className="btn" onClick={() => setModal(false)}>Annulla</button>
                <button className="btn btn-success" onClick={eseguiAbbinamento} disabled={loading}>{loading ? 'Elaborazione...' : 'Abbina e genera PDF'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
