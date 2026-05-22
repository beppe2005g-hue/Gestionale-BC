'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import * as XLSX from 'xlsx'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function parseExcelDate(val: any): string {
  if (!val) return ''
  if (typeof val === 'string') {
    const trimmed = val.trim()
    const itMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (itMatch) return `${itMatch[3]}-${itMatch[2].padStart(2,'0')}-${itMatch[1].padStart(2,'0')}`
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.substring(0, 10)
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    return ''
  }
  if (typeof val === 'number') {
    const excelEpoch = new Date(1899, 11, 30)
    const d = new Date(excelEpoch.getTime() + val * 86400000)
    if (!isNaN(d.getTime()) && d.getFullYear() > 1980 && d.getFullYear() < 2100) {
      return d.toISOString().split('T')[0]
    }
    return ''
  }
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) return val.toISOString().split('T')[0]
    return ''
  }
  return ''
}

interface RigaImportRicevute {
  data: string
  numero: string
  fornitore: string
  piva: string
  totale: number
  netto: number
  data_ricezione: string
  scadenza: string
  selezionata: boolean
  stato: 'ok' | 'duplicato' | 'escluso' | 'errore'
  motivo?: string
}

interface RigaImportEmesse {
  data: string
  numero: string
  cliente: string
  piva: string
  totale: number
  netto: number
  scadenza: string
  selezionata: boolean
  stato: 'ok' | 'duplicato' | 'errore'
  motivo?: string
}

export default function ImportSDI() {
  const [tab, setTab] = useState<'ricevute' | 'emesse' | 'esclusi'>('ricevute')
  const [progetti, setProgetti] = useState<any[]>([])
  const [esclusi, setEsclusi] = useState<any[]>([])
  const [nuovoEscluso, setNuovoEscluso] = useState({ nome: '', piva: '', motivo: '' })

  // --- STATO FATTURE RICEVUTE ---
  const [righeRic, setRigheRic] = useState<RigaImportRicevute[]>([])
  const [loadingRic, setLoadingRic] = useState(false)
  const [importandoRic, setImportandoRic] = useState(false)
  const [risultatoRic, setRisultatoRic] = useState<{importate: number, errori: number} | null>(null)
  const [progettoDefaultRic, setProgettoDefaultRic] = useState('')
  const [scadenzaDefaultRic, setScadenzaDefaultRic] = useState('')

  // --- STATO FATTURE EMESSE ---
  const [righeEm, setRigheEm] = useState<RigaImportEmesse[]>([])
  const [loadingEm, setLoadingEm] = useState(false)
  const [importandoEm, setImportandoEm] = useState(false)
  const [risultatoEm, setRisultatoEm] = useState<{importate: number, errori: number} | null>(null)
  const [progettoDefaultEm, setProgettoDefaultEm] = useState('')
  const [scadenzaDefaultEm, setScadenzaDefaultEm] = useState('')

  useEffect(() => {
    supabase.from('progetti').select('id,codice,nome').then(({ data }) => setProgetti(data || []))
    caricaEsclusi()
  }, [])

  async function caricaEsclusi() {
    const { data } = await supabase.from('fornitori_esclusi_import').select('*').order('nome_fornitore')
    setEsclusi(data || [])
  }

  async function aggiungiEscluso() {
    if (!nuovoEscluso.nome.trim()) { alert('Inserisci il nome del fornitore'); return }
    await supabase.from('fornitori_esclusi_import').insert({
      nome_fornitore: nuovoEscluso.nome.trim(),
      piva: nuovoEscluso.piva.trim(),
      motivo: nuovoEscluso.motivo.trim()
    })
    setNuovoEscluso({ nome: '', piva: '', motivo: '' })
    caricaEsclusi()
  }

  async function rimuoviEscluso(id: string) {
    if (!confirm('Rimuovere questo fornitore dalla lista di esclusione?')) return
    await supabase.from('fornitori_esclusi_import').delete().eq('id', id)
    caricaEsclusi()
  }

  // ── LEGGI FILE RICEVUTE ──
  async function leggiFileRicevute(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingRic(true)
    setRisultatoRic(null)

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', raw: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as any[][]

    let headerRow = -1
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      if (raw[i]?.some((v: any) => String(v) === 'Numero' || String(v) === 'Fornitore')) {
        headerRow = i; break
      }
    }
    if (headerRow === -1) { alert('File non riconosciuto.'); setLoadingRic(false); return }

    const headers: string[] = raw[headerRow].map((h: any) => String(h || '').trim())
    const col = {
      data: headers.indexOf('Data'), numero: headers.indexOf('Numero'),
      tipo: headers.indexOf('Tipo'), fornitore: headers.indexOf('Fornitore'),
      piva: headers.indexOf('Partita IVA'), totale: headers.indexOf('Tot. documento'),
      netto: headers.indexOf('Netto a pagare'), ricezione: headers.indexOf('Data ricezione'),
    }

    const [{ data: esistenti }, { data: listaEsclusi }] = await Promise.all([
      supabase.from('fatture_fornitori').select('numero,fornitore_nome'),
      supabase.from('fornitori_esclusi_import').select('nome_fornitore,piva'),
    ])

    const parsed: RigaImportRicevute[] = []
    for (let i = headerRow + 1; i < raw.length; i++) {
      const row = raw[i]
      if (!row || !row[col.numero]) continue
      const numero = String(row[col.numero] || '').trim()
      const fornitore = String(row[col.fornitore] || '').trim()
      const tipo = String(row[col.tipo] || '').trim().toLowerCase()
      const totale = parseFloat(String(row[col.totale] || '0').replace(',', '.')) || 0
      const netto = parseFloat(String(row[col.netto] || '0').replace(',', '.')) || 0
      const piva = String(row[col.piva] || '').trim()
      if (tipo.includes('reverse') || tipo.includes('integrazione') || (totale === 0 && netto === 0)) continue
      const dataStr = parseExcelDate(row[col.data])
      const dataRicezione = parseExcelDate(row[col.ricezione])
      let stato: RigaImportRicevute['stato'] = 'ok'
      let motivo = ''
      const escluso = listaEsclusi?.find(e =>
        fornitore.toLowerCase().includes(e.nome_fornitore.toLowerCase()) ||
        (e.piva && piva && e.piva === piva)
      )
      if (escluso) { stato = 'escluso'; motivo = 'Fornitore in lista esclusioni' }
      if (stato === 'ok') {
        const dup = esistenti?.find(e => e.numero === numero && e.fornitore_nome.toLowerCase() === fornitore.toLowerCase())
        if (dup) { stato = 'duplicato'; motivo = 'Già presente nel sistema' }
      }
      parsed.push({ data: dataStr, numero, fornitore, piva, totale, netto, data_ricezione: dataRicezione, scadenza: scadenzaDefaultRic || '', selezionata: stato === 'ok', stato, motivo })
    }
    setRigheRic(parsed)
    setLoadingRic(false)
  }

  // ── LEGGI FILE EMESSE ──
  async function leggiFileEmesse(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingEm(true)
    setRisultatoEm(null)

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', raw: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as any[][]

    let headerRow = -1
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      if (raw[i]?.some((v: any) => String(v) === 'Numero' || String(v) === 'Cliente')) {
        headerRow = i; break
      }
    }
    // Fallback: prova con "Cessionario/committente" come nome colonna cliente SDI emesse
    if (headerRow === -1) {
      for (let i = 0; i < Math.min(10, raw.length); i++) {
        if (raw[i]?.some((v: any) => String(v).includes('Cessionario') || String(v) === 'Numero')) {
          headerRow = i; break
        }
      }
    }
    if (headerRow === -1) { alert('File non riconosciuto. Carica il file Excel SDI delle fatture emesse.'); setLoadingEm(false); return }

    const headers: string[] = raw[headerRow].map((h: any) => String(h || '').trim())

    // Cerca colonna cliente con vari nomi possibili SDI
    const clienteIdx = ['Cliente', 'Cessionario/committente', 'Cessionario', 'Committente', 'Destinatario']
      .map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1

    const col = {
      data: headers.indexOf('Data'),
      numero: headers.indexOf('Numero'),
      tipo: headers.indexOf('Tipo'),
      cliente: clienteIdx,
      piva: headers.indexOf('Partita IVA'),
      totale: headers.indexOf('Tot. documento'),
      netto: headers.indexOf('Netto a pagare'),
    }

    const { data: esistenti } = await supabase.from('fatture_clienti').select('numero,cliente_nome')

    const parsed: RigaImportEmesse[] = []
    for (let i = headerRow + 1; i < raw.length; i++) {
      const row = raw[i]
      if (!row || !row[col.numero]) continue
      const numero = String(row[col.numero] || '').trim()
      const cliente = col.cliente >= 0 ? String(row[col.cliente] || '').trim() : ''
      const tipo = String(row[col.tipo] || '').trim().toLowerCase()
      const totale = parseFloat(String(row[col.totale] || '0').replace(',', '.')) || 0
      const netto = parseFloat(String(row[col.netto] || '0').replace(',', '.')) || 0
      const piva = String(row[col.piva] || '').trim()
      // Escludi RC e note credito (totale negativo)
      if (tipo.includes('reverse') || tipo.includes('integrazione') || totale < 0) continue
      const dataStr = parseExcelDate(row[col.data])
      let stato: RigaImportEmesse['stato'] = 'ok'
      let motivo = ''
      const dup = esistenti?.find(e => e.numero === numero && e.cliente_nome?.toLowerCase() === cliente.toLowerCase())
      if (dup) { stato = 'duplicato'; motivo = 'Già presente nel sistema' }
      parsed.push({ data: dataStr, numero, cliente, piva, totale, netto, scadenza: scadenzaDefaultEm || '', selezionata: stato === 'ok', stato, motivo })
    }
    setRigheEm(parsed)
    setLoadingEm(false)
  }

  // ── IMPORTA RICEVUTE ──
  async function eseguiImportRicevute() {
    const daImportare = righeRic.filter(r => r.selezionata && r.stato === 'ok')
    if (daImportare.length === 0) { alert('Nessuna fattura selezionata.'); return }
    const senzaScadenza = daImportare.filter(r => !r.scadenza).length
    if (senzaScadenza > 0 && !confirm(`${senzaScadenza} fatture senza scadenza. Importare comunque?`)) return
    if (senzaScadenza === 0 && !confirm(`Importare ${daImportare.length} fatture?`)) return
    setImportandoRic(true)
    let importate = 0, errori = 0
    for (const r of daImportare) {
      try {
        let { data: fornExist } = await supabase.from('fornitori').select('id').ilike('ragione_sociale', `%${r.fornitore}%`).limit(1)
        let fornitoreId = fornExist?.[0]?.id
        if (!fornitoreId) {
          const { data: newForn } = await supabase.from('fornitori').insert({ ragione_sociale: r.fornitore, cf_piva: r.piva, categoria: 'Altro', attivo: true }).select('id').single()
          fornitoreId = newForn?.id
        }
        const imponibile = r.netto > 0 ? r.netto : r.totale
        const ivaPerc = r.totale > 0 && r.netto > 0 && r.totale !== r.netto ? Math.round((r.totale / r.netto - 1) * 100) : 22
        const prj = progettoDefaultRic ? progetti.find(p => p.id === progettoDefaultRic) : null
        const { error } = await supabase.from('fatture_fornitori').insert({
          data: r.data || new Date().toISOString().split('T')[0],
          numero: r.numero, fornitore_id: fornitoreId || null, fornitore_nome: r.fornitore,
          progetto_id: progettoDefaultRic || null, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
          imponibile, iva_percentuale: ivaPerc, rata1_importo: r.totale,
          rata1_scadenza: r.scadenza || null, rata1_stato: 'Da Pagare',
          note: `SDI - Ricezione: ${r.data_ricezione}`
        })
        if (error) errori++; else importate++
      } catch { errori++ }
    }
    setImportandoRic(false)
    setRisultatoRic({ importate, errori })
    setRigheRic(prev => prev.map(r => r.selezionata && r.stato === 'ok' ? { ...r, stato: 'duplicato', motivo: 'Appena importata', selezionata: false } : r))
  }

  // ── IMPORTA EMESSE ──
  async function eseguiImportEmesse() {
    const daImportare = righeEm.filter(r => r.selezionata && r.stato === 'ok')
    if (daImportare.length === 0) { alert('Nessuna fattura selezionata.'); return }
    const senzaScadenza = daImportare.filter(r => !r.scadenza).length
    if (senzaScadenza > 0 && !confirm(`${senzaScadenza} fatture senza scadenza di incasso. Importare comunque?`)) return
    if (senzaScadenza === 0 && !confirm(`Importare ${daImportare.length} fatture clienti?`)) return
    setImportandoEm(true)
    let importate = 0, errori = 0
    for (const r of daImportare) {
      try {
        // Cerca o crea cliente
        let { data: cliExist } = await supabase.from('clienti').select('id').ilike('ragione_sociale', `%${r.cliente}%`).limit(1)
        let clienteId = cliExist?.[0]?.id
        if (!clienteId && r.cliente) {
          const { data: newCli } = await supabase.from('clienti').insert({ ragione_sociale: r.cliente, cf_piva: r.piva, attivo: true }).select('id').single()
          clienteId = newCli?.id
        }
        const imponibile = r.netto > 0 ? r.netto : r.totale
        const ivaPerc = r.totale > 0 && r.netto > 0 && r.totale !== r.netto ? Math.round((r.totale / r.netto - 1) * 100) : 0
        const prj = progettoDefaultEm ? progetti.find(p => p.id === progettoDefaultEm) : null
        const { error } = await supabase.from('fatture_clienti').insert({
          data: r.data || new Date().toISOString().split('T')[0],
          numero: r.numero, cliente_id: clienteId || null, cliente_nome: r.cliente,
          progetto_id: progettoDefaultEm || null, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
          imponibile, iva_percentuale: ivaPerc,
          rata1_importo: r.totale, rata1_scadenza: r.scadenza || null, rata1_stato: 'Da Incassare',
          note: 'SDI - Import fatture emesse'
        })
        if (error) errori++; else importate++
      } catch { errori++ }
    }
    setImportandoEm(false)
    setRisultatoEm({ importate, errori })
    setRigheEm(prev => prev.map(r => r.selezionata && r.stato === 'ok' ? { ...r, stato: 'duplicato', motivo: 'Appena importata', selezionata: false } : r))
  }

  const nOkRic = righeRic.filter(r => r.stato === 'ok').length
  const nDupRic = righeRic.filter(r => r.stato === 'duplicato').length
  const nEscRic = righeRic.filter(r => r.stato === 'escluso').length
  const nSelRic = righeRic.filter(r => r.selezionata && r.stato === 'ok').length
  const nSenzaScadenzaRic = righeRic.filter(r => r.stato === 'ok' && r.selezionata && !r.scadenza).length

  const nOkEm = righeEm.filter(r => r.stato === 'ok').length
  const nDupEm = righeEm.filter(r => r.stato === 'duplicato').length
  const nSelEm = righeEm.filter(r => r.selezionata && r.stato === 'ok').length
  const nSenzaScadenzaEm = righeEm.filter(r => r.stato === 'ok' && r.selezionata && !r.scadenza).length

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Import fatture da SDI</h1>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('ricevute')} className={`btn ${tab === 'ricevute' ? 'btn-primary' : ''}`}>📥 Fatture ricevute</button>
          <button onClick={() => setTab('emesse')} className={`btn ${tab === 'emesse' ? 'btn-primary' : ''}`}>📤 Fatture emesse</button>
          <button onClick={() => setTab('esclusi')} className={`btn ${tab === 'esclusi' ? 'btn-primary' : ''}`}>🚫 Fornitori esclusi ({esclusi.length})</button>
        </div>

        {/* ── TAB RICEVUTE ── */}
        {tab === 'ricevute' && (
          <>
            <div className="card mb-4">
              <h3 className="text-sm font-medium mb-3">Carica file Excel SDI — Fatture ricevute dai fornitori</h3>
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <label className="btn btn-primary cursor-pointer">
                    📂 Scegli file .xlsx
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={leggiFileRicevute} />
                  </label>
                  <p className="text-xs text-gray-400 mt-1">RC e integrazioni escluse automaticamente</p>
                </div>
                <div className="flex-1 min-w-52">
                  <label className="label">Cantiere di default (opzionale)</label>
                  <select className="input" value={progettoDefaultRic} onChange={e => setProgettoDefaultRic(e.target.value)}>
                    <option value="">— nessun cantiere —</option>
                    {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {loadingRic && <div className="card text-center py-8 text-gray-500">Analisi file in corso...</div>}
            {risultatoRic && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <p className="font-medium text-green-800">✅ Import completato — {risultatoRic.importate} fatture importate{risultatoRic.errori > 0 && ` · ❌ ${risultatoRic.errori} errori`}</p>
              </div>
            )}
            {righeRic.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                  <div className="flex gap-4 text-sm flex-wrap">
                    <span className="text-green-700 font-medium">✅ Da importare: {nOkRic}</span>
                    <span className="text-amber-700">⚠️ Duplicati: {nDupRic}</span>
                    {nEscRic > 0 && <span className="text-gray-500">🚫 Esclusi: {nEscRic}</span>}
                    {nSenzaScadenzaRic > 0 && <span className="text-red-600">⚠️ Senza scadenza: {nSenzaScadenzaRic}</span>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn btn-sm" onClick={() => setRigheRic(prev => prev.map(r => ({ ...r, selezionata: r.stato === 'ok' })))}>Seleziona tutti</button>
                    <button className="btn btn-sm" onClick={() => setRigheRic(prev => prev.map(r => ({ ...r, selezionata: false })))}>Deseleziona</button>
                    <button className="btn btn-primary btn-sm" onClick={eseguiImportRicevute} disabled={importandoRic || nSelRic === 0}>
                      {importandoRic ? 'Importazione...' : `Importa ${nSelRic} fatture`}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-xs text-amber-800 font-medium flex-shrink-0">📅 Scadenza per tutte:</span>
                  <input type="date" className="input w-auto text-sm" value={scadenzaDefaultRic} onChange={e => setScadenzaDefaultRic(e.target.value)} />
                  <button className="btn btn-sm" onClick={() => {
                    if (!scadenzaDefaultRic) { alert('Imposta prima una data'); return }
                    setRigheRic(prev => prev.map(r => r.stato === 'ok' ? { ...r, scadenza: scadenzaDefaultRic } : r))
                  }}>Applica a tutte</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead><tr><th style={{width:36}}></th><th>Data</th><th>N° Fattura</th><th>Fornitore</th><th>Totale</th><th>Netto</th><th>Scadenza pagamento</th><th>Stato</th></tr></thead>
                    <tbody>
                      {righeRic.map((r, i) => (
                        <tr key={i} className={r.stato === 'duplicato' ? 'opacity-50' : r.stato === 'escluso' ? 'opacity-40 bg-gray-50' : r.selezionata ? 'bg-green-50' : ''}>
                          <td>{r.stato === 'ok' && <input type="checkbox" checked={r.selezionata} onChange={() => setRigheRic(prev => prev.map((x, j) => j === i ? { ...x, selezionata: !x.selezionata } : x))} />}</td>
                          <td className="text-xs">{r.data ? new Date(r.data).toLocaleDateString('it-IT') : <span className="text-red-500">—</span>}</td>
                          <td className="font-medium text-xs">{r.numero}</td>
                          <td className="text-xs">{r.fornitore}</td>
                          <td className="text-sm font-medium">{euro(r.totale)}</td>
                          <td className="text-sm">{euro(r.netto)}</td>
                          <td>{r.stato === 'ok' ? <input type="date" className="input text-xs py-0.5 w-36" value={r.scadenza} onChange={e => setRigheRic(prev => prev.map((x, j) => j === i ? { ...x, scadenza: e.target.value } : x))} /> : <span className="text-xs text-gray-400">—</span>}</td>
                          <td>
                            {r.stato === 'ok' && <span className="badge badge-green">Da importare</span>}
                            {r.stato === 'duplicato' && <span className="badge badge-amber" title={r.motivo}>Già presente</span>}
                            {r.stato === 'escluso' && <span className="badge badge-gray" title={r.motivo}>🚫 Escluso</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TAB EMESSE ── */}
        {tab === 'emesse' && (
          <>
            <div className="card mb-4">
              <h3 className="text-sm font-medium mb-3">Carica file Excel SDI — Fatture emesse verso clienti</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-xs text-blue-700">
                📌 Le fatture emesse vengono importate in <strong>Fatture Clienti</strong> con IVA 0% (RC) di default. Le note di credito (importo negativo) vengono escluse automaticamente.
              </div>
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <label className="btn btn-primary cursor-pointer">
                    📂 Scegli file .xlsx
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={leggiFileEmesse} />
                  </label>
                  <p className="text-xs text-gray-400 mt-1">Note di credito escluse automaticamente</p>
                </div>
                <div className="flex-1 min-w-52">
                  <label className="label">Cantiere di default (opzionale)</label>
                  <select className="input" value={progettoDefaultEm} onChange={e => setProgettoDefaultEm(e.target.value)}>
                    <option value="">— nessun cantiere —</option>
                    {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {loadingEm && <div className="card text-center py-8 text-gray-500">Analisi file in corso...</div>}
            {risultatoEm && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <p className="font-medium text-green-800">✅ Import completato — {risultatoEm.importate} fatture clienti importate{risultatoEm.errori > 0 && ` · ❌ ${risultatoEm.errori} errori`}</p>
              </div>
            )}
            {righeEm.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                  <div className="flex gap-4 text-sm flex-wrap">
                    <span className="text-green-700 font-medium">✅ Da importare: {nOkEm}</span>
                    <span className="text-amber-700">⚠️ Duplicati: {nDupEm}</span>
                    {nSenzaScadenzaEm > 0 && <span className="text-red-600">⚠️ Senza scadenza: {nSenzaScadenzaEm}</span>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn btn-sm" onClick={() => setRigheEm(prev => prev.map(r => ({ ...r, selezionata: r.stato === 'ok' })))}>Seleziona tutti</button>
                    <button className="btn btn-sm" onClick={() => setRigheEm(prev => prev.map(r => ({ ...r, selezionata: false })))}>Deseleziona</button>
                    <button className="btn btn-primary btn-sm" onClick={eseguiImportEmesse} disabled={importandoEm || nSelEm === 0}>
                      {importandoEm ? 'Importazione...' : `Importa ${nSelEm} fatture`}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-xs text-amber-800 font-medium flex-shrink-0">📅 Scadenza incasso per tutte:</span>
                  <input type="date" className="input w-auto text-sm" value={scadenzaDefaultEm} onChange={e => setScadenzaDefaultEm(e.target.value)} />
                  <button className="btn btn-sm" onClick={() => {
                    if (!scadenzaDefaultEm) { alert('Imposta prima una data'); return }
                    setRigheEm(prev => prev.map(r => r.stato === 'ok' ? { ...r, scadenza: scadenzaDefaultEm } : r))
                  }}>Applica a tutte</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead><tr><th style={{width:36}}></th><th>Data</th><th>N° Fattura</th><th>Cliente</th><th>Totale</th><th>Netto</th><th>Scadenza incasso</th><th>Stato</th></tr></thead>
                    <tbody>
                      {righeEm.map((r, i) => (
                        <tr key={i} className={r.stato === 'duplicato' ? 'opacity-50' : r.selezionata ? 'bg-blue-50' : ''}>
                          <td>{r.stato === 'ok' && <input type="checkbox" checked={r.selezionata} onChange={() => setRigheEm(prev => prev.map((x, j) => j === i ? { ...x, selezionata: !x.selezionata } : x))} />}</td>
                          <td className="text-xs">{r.data ? new Date(r.data).toLocaleDateString('it-IT') : <span className="text-red-500">—</span>}</td>
                          <td className="font-medium text-xs">{r.numero}</td>
                          <td className="text-xs">{r.cliente || <span className="text-gray-400">—</span>}</td>
                          <td className="text-sm font-medium">{euro(r.totale)}</td>
                          <td className="text-sm">{euro(r.netto)}</td>
                          <td>{r.stato === 'ok' ? <input type="date" className="input text-xs py-0.5 w-36" value={r.scadenza} onChange={e => setRigheEm(prev => prev.map((x, j) => j === i ? { ...x, scadenza: e.target.value } : x))} /> : <span className="text-xs text-gray-400">—</span>}</td>
                          <td>
                            {r.stato === 'ok' && <span className="badge badge-green">Da importare</span>}
                            {r.stato === 'duplicato' && <span className="badge badge-amber" title={r.motivo}>Già presente</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TAB ESCLUSI ── */}
        {tab === 'esclusi' && (
          <>
            <div className="card mb-4">
              <h3 className="text-sm font-medium mb-3">Aggiungi fornitore da escludere</h3>
              <p className="text-xs text-gray-500 mb-3">Le fatture di questi fornitori verranno scartate automaticamente ad ogni import SDI.</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Nome fornitore *</label><input className="input" placeholder="es. Enel Energia S.p.A." value={nuovoEscluso.nome} onChange={e => setNuovoEscluso({...nuovoEscluso, nome: e.target.value})} /></div>
                <div><label className="label">P.IVA (opzionale)</label><input className="input" placeholder="es. 15844561009" value={nuovoEscluso.piva} onChange={e => setNuovoEscluso({...nuovoEscluso, piva: e.target.value})} /></div>
                <div><label className="label">Motivo (opzionale)</label><input className="input" placeholder="es. Utenza elettrica" value={nuovoEscluso.motivo} onChange={e => setNuovoEscluso({...nuovoEscluso, motivo: e.target.value})} /></div>
              </div>
              <div className="flex justify-end mt-3">
                <button className="btn btn-primary" onClick={aggiungiEscluso}>+ Aggiungi alla lista</button>
              </div>
            </div>
            <div className="card">
              <h3 className="text-sm font-medium mb-3">Fornitori esclusi ({esclusi.length})</h3>
              {esclusi.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">Nessun fornitore in lista.</p> : (
                <table className="table-base">
                  <thead><tr><th>Nome fornitore</th><th>P.IVA</th><th>Motivo</th><th></th></tr></thead>
                  <tbody>
                    {esclusi.map(e => (
                      <tr key={e.id}>
                        <td className="font-medium text-sm">{e.nome_fornitore}</td>
                        <td className="text-xs text-gray-500">{e.piva || '—'}</td>
                        <td className="text-xs text-gray-500">{e.motivo || '—'}</td>
                        <td><button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => rimuoviEscluso(e.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
