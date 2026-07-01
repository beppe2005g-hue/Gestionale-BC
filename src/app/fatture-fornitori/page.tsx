'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { logActivity } from '@/lib/logActivity'
import * as XLSX from 'xlsx'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function excelDateToISO(v: any): string {
  if (!v) return ''
  if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}$/)) return v
  if (typeof v === 'string' && v.includes('/')) {
    const [d, m, y] = v.split('/')
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  if (typeof v === 'number') {
    const ms = (v - 25569) * 86400 * 1000
    return new Date(ms).toISOString().split('T')[0]
  }
  return String(v)
}

function statoFattura(f: any): 'pagata' | 'parziale' | 'da_pagare' {
  const rate = [
    f.rata1_stato,
    f.rata2_importo > 0 ? f.rata2_stato : null,
    f.rata3_importo > 0 ? f.rata3_stato : null,
  ].filter(Boolean)
  if (rate.every(r => r === 'Pagata')) return 'pagata'
  if (rate.some(r => r === 'Pagata')) return 'parziale'
  return 'da_pagare'
}

export default function FattureFornitori() {
  const [fatture, setFatture] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [progetti, setProgetti] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [modalModifica, setModalModifica] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const [modalImport, setModalImport] = useState(false)
  const [importando, setImportando] = useState(false)
  const [esitoImport, setEsitoImport] = useState<{ inserite: number; scartate: number; errori: string[] } | null>(null)
  const inputImportRef = useRef<HTMLInputElement>(null)

  const [ricerca, setRicerca] = useState('')
  const [filtroStato, setFiltroStato] = useState('tutti')
  const [ordinamento, setOrdinamento] = useState('data_desc')
  const [filtroTipo, setFiltroTipo] = useState('tutti')
  const [dataDA, setDataDA] = useState('')
  const [dataA, setDataA] = useState('')
  const [importoDA, setImportoDA] = useState('')
  const [importoA, setImportoA] = useState('')

  const [form, setForm] = useState({
    data: '', numero: '', fornitore_id: '', progetto_id: '', descrizione: '',
    imponibile: '', iva_percentuale: '22', tipo: 'Fattura', fattura_collegata_id: '',
    r1i: '', r1s: '', r2i: '', r2s: '', r3i: '', r3s: '',
    modalita_pagamento: 'Bonifico', note: ''
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
    const [{ data: f }, { data: fo }, { data: p }] = await Promise.all([
      supabase.from('fatture_fornitori').select('*').order('data', { ascending: false }),
      supabase.from('fornitori').select('id,ragione_sociale,cf_piva').eq('attivo', true),
      supabase.from('progetti').select('id,codice,nome'),
    ])
    setFatture(f || [])
    setFornitori(fo || [])
    setProgetti(p || [])
  }

  async function importaExcel(file: File) {
    setImportando(true)
    setEsitoImport(null)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      let headerRow = -1
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        if (String(rows[i][0]).toLowerCase().trim() === 'data') { headerRow = i; break }
      }
      const dataStart = headerRow >= 0 ? headerRow + 1 : 5

      let inserite = 0, scartate = 0
      const errori: string[] = []

      const { data: fornitoriDB } = await supabase.from('fornitori').select('id,ragione_sociale,cf_piva').eq('attivo', true)
      const fornitoriLista: any[] = fornitoriDB || []

      for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i]
        if (!row[0] && !row[1] && !row[3]) continue
        const data = excelDateToISO(row[0])
        const numero = String(row[1] || '').trim()
        const tipoExcel = String(row[2] || '').toLowerCase().trim()
        const fornitoreNome = String(row[3] || '').trim()
        const piva = String(row[8] || '').trim()
        const nettoAPagare = parseFloat(String(row[11]).replace(',', '.')) || 0
        const isNotaCredito = tipoExcel.includes('nota') || tipoExcel.includes('credito')
        if (!numero || !fornitoreNome) continue

        const { data: dup } = await supabase.from('fatture_fornitori').select('id').eq('numero', numero).ilike('fornitore_nome', fornitoreNome)
        if (dup && dup.length > 0) { scartate++; continue }

        let fornitoreId: string | null = null
        let fornitoreNomeDB = fornitoreNome
        if (piva) {
          const m = fornitoriLista.find(f => f.cf_piva && f.cf_piva.replace(/\s/g,'') === piva.replace(/\s/g,''))
          if (m) { fornitoreId = m.id; fornitoreNomeDB = m.ragione_sociale }
        }
        if (!fornitoreId) {
          const m = fornitoriLista.find(f => f.ragione_sociale.toLowerCase().trim() === fornitoreNome.toLowerCase().trim())
          if (m) { fornitoreId = m.id; fornitoreNomeDB = m.ragione_sociale }
        }
        if (!fornitoreId) {
          const { data: nf } = await supabase.from('fornitori').insert({ ragione_sociale: fornitoreNome, cf_piva: piva || null, categoria: 'Materiali', attivo: true }).select('id,ragione_sociale,cf_piva').single()
          if (nf) { fornitoreId = nf.id; fornitoreNomeDB = nf.ragione_sociale; fornitoriLista.push(nf) }
        }

        const { error } = await supabase.from('fatture_fornitori').insert({
          data: data || new Date().toISOString().split('T')[0],
          numero, fornitore_id: fornitoreId, fornitore_nome: fornitoreNomeDB,
          progetto_id: null, progetto_nome: '', descrizione: '',
          imponibile: nettoAPagare, iva_percentuale: 22,
          tipo: isNotaCredito ? 'Nota di credito' : 'Fattura',
          fattura_collegata_id: null,
          rata1_importo: isNotaCredito ? 0 : nettoAPagare,
          rata1_scadenza: null, rata1_stato: isNotaCredito ? null : 'Da Pagare',
          rata2_importo: 0, rata2_scadenza: null, rata2_stato: null,
          rata3_importo: 0, rata3_scadenza: null, rata3_stato: null,
          modalita_pagamento: 'Bonifico', note: ''
        })
        if (error) errori.push(`${numero} (${fornitoreNome}): ${error.message}`)
        else inserite++
      }
      setEsitoImport({ inserite, scartate, errori })
      if (inserite > 0) await load()
    } catch (e: any) {
      setEsitoImport({ inserite: 0, scartate: 0, errori: [`Errore lettura file: ${e.message}`] })
    }
    setImportando(false)
  }

  const isNC = (f: any) => f.tipo === 'Nota di credito'
  const haFiltri = ricerca || filtroStato !== 'tutti' || filtroTipo !== 'tutti' || dataDA || dataA || importoDA || importoA

  function resetFiltri() {
    setRicerca(''); setFiltroStato('tutti'); setFiltroTipo('tutti')
    setDataDA(''); setDataA(''); setImportoDA(''); setImportoA('')
  }

  const fattureFiltrate = useMemo(() => {
    let result = [...fatture]
    if (ricerca.trim()) {
      const q = ricerca.toLowerCase()
      result = result.filter(f =>
        f.numero?.toLowerCase().includes(q) ||
        f.fornitore_nome?.toLowerCase().includes(q) ||
        f.progetto_nome?.toLowerCase().includes(q)
      )
    }
    if (filtroTipo === 'fattura') result = result.filter(f => !isNC(f))
    if (filtroTipo === 'nota_credito') result = result.filter(f => isNC(f))
    if (filtroStato !== 'tutti') result = result.filter(f => !isNC(f) && statoFattura(f) === filtroStato)
    if (dataDA) result = result.filter(f => f.data >= dataDA)
    if (dataA) result = result.filter(f => f.data <= dataA)
    if (importoDA) result = result.filter(f => (f.imponibile || 0) >= parseFloat(importoDA))
    if (importoA) result = result.filter(f => (f.imponibile || 0) <= parseFloat(importoA))
    result.sort((a, b) => {
      if (ordinamento === 'data_desc') return new Date(b.data).getTime() - new Date(a.data).getTime()
      if (ordinamento === 'data_asc') return new Date(a.data).getTime() - new Date(b.data).getTime()
      if (ordinamento === 'fornitore') return (a.fornitore_nome || '').localeCompare(b.fornitore_nome || '')
      if (ordinamento === 'importo') return (b.imponibile || 0) - (a.imponibile || 0)
      return 0
    })
    return result
  }, [fatture, ricerca, filtroStato, filtroTipo, ordinamento, dataDA, dataA, importoDA, importoA])

  const totFatture = fattureFiltrate.filter(f => !isNC(f)).reduce((s, f) => s + (f.imponibile || 0), 0)
  const totNC = fattureFiltrate.filter(f => isNC(f)).reduce((s, f) => s + (f.imponibile || 0), 0)
  const totNetto = totFatture - totNC

  async function pagaRata(id: string, rata: number) {
    const { data: fatt } = await supabase.from('fatture_fornitori').select('*').eq('id', id).single()
    if (!fatt) return
    if (!confirm(`Confermi pagamento rata ${rata}?\n${fatt.fornitore_nome} - ${fatt.numero}`)) return
    const oggi = new Date().toISOString().split('T')[0]
    await supabase.from('fatture_fornitori').update({ [`rata${rata}_stato`]: 'Pagata', [`rata${rata}_data_pagamento`]: oggi }).eq('id', id)
    const imp = (fatt as any)[`rata${rata}_importo`] || 0
    await supabase.from('cash_flow').insert({ data: oggi, descrizione: `Pagamento ${fatt.fornitore_nome} - Ft ${fatt.numero} rata ${rata}`, conto: 'Conto 1', tipologia: 'Pagamento Fornitore', entrata: 0, uscita: imp, progetto_id: (fatt as any).progetto_id || null, riferimento_fattura: fatt.numero })
    await logActivity('modifica', 'fatture_fornitori', id, `Pagamento rata ${rata} — ${fatt.numero} · ${fatt.fornitore_nome} · € ${imp}`)
    load()
  }

  async function annullaRata(id: string, rata: number) {
    if (!confirm(`Annullare il pagamento della rata ${rata}?\nNota: il movimento in cash flow NON viene rimosso automaticamente.`)) return
    const fatt = fatture.find(f => f.id === id)
    await supabase.from('fatture_fornitori').update({ [`rata${rata}_stato`]: 'Da Pagare', [`rata${rata}_data_pagamento`]: null }).eq('id', id)
    await logActivity('modifica', 'fatture_fornitori', id, `Annullato pagamento rata ${rata} — ${fatt?.numero} · ${fatt?.fornitore_nome}`)
    load()
  }

  async function elimina(id: string, numero: string) {
    if (!confirm(`Eliminare la fattura ${numero}?\nAttenzione: i DDT abbinati torneranno a "Da Fatturare".`)) return
    const fatt = fatture.find(f => f.id === id)
    await supabase.from('ddt').update({ stato: 'Da Fatturare', fattura_abbinata: null }).eq('fattura_abbinata', numero)
    await supabase.from('fatture_fornitori').delete().eq('id', id)
    await logActivity('eliminazione', 'fatture_fornitori', id, `Fattura ${numero} — ${fatt?.fornitore_nome} · € ${fatt?.imponibile}`)
    load()
  }

  // ── FIX: salvaModifica con gestione errori + aggiornamento rata_stato ──
  async function salvaModifica() {
    if (!modalModifica) return
    setLoading(true)

    const prj = progetti.find(p => p.id === modalModifica.progetto_id)
    const imp = parseFloat(modalModifica.imponibile) || 0
    const r1i = parseFloat(modalModifica.rata1_importo) || 0
    const r2i = parseFloat(modalModifica.rata2_importo) || 0
    const r3i = parseFloat(modalModifica.rata3_importo) || 0

    // Se l'importo di una rata viene azzerato, azzera anche il suo stato
    // Se una rata viene aggiunta (aveva importo 0 prima), imposta "Da Pagare"
    const r1s_old = modalModifica.rata1_stato
    const r2s_old = modalModifica.rata2_stato
    const r3s_old = modalModifica.rata3_stato

    const rata1_stato = r1i > 0 ? (r1s_old || 'Da Pagare') : null
    const rata2_stato = r2i > 0 ? (r2s_old || 'Da Pagare') : null
    const rata3_stato = r3i > 0 ? (r3s_old || 'Da Pagare') : null

    const { error } = await supabase.from('fatture_fornitori').update({
      data: modalModifica.data,
      numero: modalModifica.numero,
      descrizione: modalModifica.descrizione || '',
      tipo: modalModifica.tipo || 'Fattura',
      fattura_collegata_id: modalModifica.fattura_collegata_id || null,
      progetto_id: modalModifica.progetto_id || null,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : (modalModifica.progetto_nome || ''),
      imponibile: imp,
      iva_percentuale: parseFloat(modalModifica.iva_percentuale) || 22,
      modalita_pagamento: modalModifica.modalita_pagamento || 'Bonifico',
      note: modalModifica.note || '',
      rata1_importo: r1i,
      rata1_scadenza: modalModifica.rata1_scadenza || null,
      rata1_stato,
      rata2_importo: r2i,
      rata2_scadenza: modalModifica.rata2_scadenza || null,
      rata2_stato,
      rata3_importo: r3i,
      rata3_scadenza: modalModifica.rata3_scadenza || null,
      rata3_stato,
    }).eq('id', modalModifica.id)

    if (error) {
      // BUG FIX: prima il codice non catturava l'errore → le modifiche sparivano silenziosamente
      showToast(`Errore salvataggio: ${error.message}`, 'err')
      setLoading(false)
      return
    }

    await logActivity('modifica', 'fatture_fornitori', modalModifica.id, `${modalModifica.tipo || 'Fattura'} ${modalModifica.numero} — ${modalModifica.fornitore_nome} · € ${imp}`)
    showToast('Modifiche salvate', 'ok')
    setModalModifica(null)
    setLoading(false)
    load()
  }

  async function salva() {
    if (!form.numero || !form.imponibile || !form.fornitore_id) {
      alert('Compilare N° fattura, fornitore e imponibile'); return
    }
    const { data: dup } = await supabase.from('fatture_fornitori').select('id').eq('numero', form.numero).eq('fornitore_id', form.fornitore_id)
    if (dup && dup.length > 0) { alert(`⚠️ Fattura ${form.numero} di questo fornitore già presente.`); return }
    setLoading(true)
    const for_ = fornitori.find(f => f.id === form.fornitore_id)
    const prj = progetti.find(p => p.id === form.progetto_id)
    const imp = parseFloat(form.imponibile) || 0
    const isNotaCredito = form.tipo === 'Nota di credito'
    const { data: inserted, error } = await supabase.from('fatture_fornitori').insert({
      data: form.data || new Date().toISOString().split('T')[0],
      numero: form.numero, fornitore_id: form.fornitore_id,
      fornitore_nome: for_?.ragione_sociale || '',
      progetto_id: form.progetto_id || null,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: form.descrizione, imponibile: imp,
      iva_percentuale: parseFloat(form.iva_percentuale) || 22,
      tipo: form.tipo, fattura_collegata_id: form.fattura_collegata_id || null,
      rata1_importo: isNotaCredito ? 0 : (parseFloat(form.r1i) || imp * (1 + parseFloat(form.iva_percentuale) / 100)),
      rata1_scadenza: isNotaCredito ? null : (form.r1s || null),
      rata1_stato: isNotaCredito ? null : 'Da Pagare',
      rata2_importo: isNotaCredito ? 0 : (parseFloat(form.r2i) || 0),
      rata2_scadenza: isNotaCredito ? null : (form.r2s || null),
      rata2_stato: isNotaCredito ? null : (form.r2i ? 'Da Pagare' : null),
      rata3_importo: isNotaCredito ? 0 : (parseFloat(form.r3i) || 0),
      rata3_scadenza: isNotaCredito ? null : (form.r3s || null),
      rata3_stato: isNotaCredito ? null : (form.r3i ? 'Da Pagare' : null),
      modalita_pagamento: form.modalita_pagamento, note: form.note
    }).select('id').single()

    if (error) {
      showToast(`Errore inserimento: ${error.message}`, 'err')
      setLoading(false)
      return
    }
    await logActivity('inserimento', 'fatture_fornitori', inserted?.id || '', `${form.tipo} ${form.numero} — ${for_?.ragione_sociale} · € ${imp}`)
    showToast('Fattura inserita', 'ok')
    setModal(false)
    setLoading(false)
    load()
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.type === 'ok' ? '✓ ' : '⚠️ '}{toast.msg}
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Fatture ricevute</h1>
          <div className="flex gap-2">
            <button className="btn text-sm" onClick={() => { setModalImport(true); setEsitoImport(null) }}>📥 Importa da Excel</button>
            <button className="btn btn-primary text-sm" onClick={() => setModal(true)}>+ Nuova fattura</button>
          </div>
        </div>

        <div className="card mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="label">🔍 Cerca</label>
              <input className="input" placeholder="N° fattura, fornitore, cantiere..." value={ricerca} onChange={e => setRicerca(e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo documento</label>
              <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                <option value="tutti">Tutti ({fatture.length})</option>
                <option value="fattura">Solo fatture ({fatture.filter(f => !isNC(f)).length})</option>
                <option value="nota_credito">Solo NC ({fatture.filter(f => isNC(f)).length})</option>
              </select>
            </div>
            <div>
              <label className="label">Stato pagamento</label>
              <select className="input" value={filtroStato} onChange={e => setFiltroStato(e.target.value)}>
                <option value="tutti">Tutti</option>
                <option value="da_pagare">Da pagare</option>
                <option value="parziale">Parziale</option>
                <option value="pagata">Pagate</option>
              </select>
            </div>
            <div>
              <label className="label">Ordina per</label>
              <select className="input" value={ordinamento} onChange={e => setOrdinamento(e.target.value)}>
                <option value="data_desc">Data ↓ più recenti</option>
                <option value="data_asc">Data ↑ più vecchie</option>
                <option value="fornitore">Fornitore A→Z</option>
                <option value="importo">Importo ↓</option>
              </select>
            </div>
            <div><label className="label">Data dal</label><input className="input" type="date" value={dataDA} onChange={e => setDataDA(e.target.value)} /></div>
            <div><label className="label">Data al</label><input className="input" type="date" value={dataA} onChange={e => setDataA(e.target.value)} /></div>
            <div><label className="label">Imponibile da (€)</label><input className="input" type="number" placeholder="0" value={importoDA} onChange={e => setImportoDA(e.target.value)} /></div>
            <div><label className="label">Imponibile a (€)</label><input className="input" type="number" placeholder="∞" value={importoA} onChange={e => setImportoA(e.target.value)} /></div>
          </div>
          {haFiltri && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-500 space-x-3">
                <span>{fattureFiltrate.length} documenti</span>
                <span>Fatture: <strong>{euro(totFatture)}</strong></span>
                {totNC > 0 && <span className="text-purple-600">NC: <strong>- {euro(totNC)}</strong></span>}
                <span className="font-semibold text-gray-800">Netto: <strong>{euro(totNetto)}</strong></span>
              </div>
              <button onClick={resetFiltri} className="text-xs text-blue-600 hover:underline">× Azzera filtri</button>
            </div>
          )}
        </div>

        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr>
              <th>Data</th><th>N° Fattura</th><th>Fornitore</th><th>Cantiere</th>
              <th>Imponibile</th><th>Totale</th><th>Rata 1</th><th>Rata 2</th><th>Rata 3</th><th></th>
            </tr></thead>
            <tbody>
              {fattureFiltrate.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-gray-400 py-8">
                  {haFiltri ? 'Nessuna fattura con questi filtri.' : 'Nessuna fattura.'}
                </td></tr>
              ) : fattureFiltrate.map(f => {
                const stato = statoFattura(f)
                const nc = isNC(f)
                const collegata = nc && f.fattura_collegata_id ? fatture.find((x: any) => x.id === f.fattura_collegata_id) : null
                return (
                  <tr key={f.id} className={nc ? 'bg-purple-50' : stato === 'pagata' ? 'opacity-60' : ''}>
                    <td className="text-xs">{new Date(f.data).toLocaleDateString('it-IT')}</td>
                    <td className="font-medium text-sm">
                      {f.numero}
                      {nc && <span className="ml-1 inline-block bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded font-medium">NC</span>}
                    </td>
                    <td className="text-sm">{f.fornitore_nome}</td>
                    <td className="text-xs text-gray-500">
                      {f.progetto_nome || '—'}
                      {collegata && <span className="block text-purple-500 text-xs">→ comp. {collegata.numero}</span>}
                    </td>
                    <td className={`text-sm font-medium ${nc ? 'text-purple-700' : ''}`}>
                      {nc ? '- ' : ''}{euro(f.imponibile)}
                      {!nc && (f.iva_percentuale || 0) > 0 && <span className="block text-xs text-gray-400 font-normal">IVA {f.iva_percentuale}%</span>}
                      {!nc && (f.iva_percentuale || 0) === 0 && <span className="block text-xs text-gray-400 font-normal">RC</span>}
                    </td>
                    <td className="font-semibold text-sm">
                      {nc ? <span className="text-purple-600 text-xs">—</span> : (
                        <>
                          {euro((f.imponibile || 0) * (1 + (f.iva_percentuale || 0) / 100))}
                          {stato === 'pagata' && <span className="ml-1 text-xs text-green-600">✓</span>}
                          {stato === 'parziale' && <span className="ml-1 text-xs text-amber-600">½</span>}
                        </>
                      )}
                    </td>
                    {nc ? (
                      <td colSpan={3} className="text-xs text-purple-400 text-center">Nota di credito — nessuna rata</td>
                    ) : [1,2,3].map(n => (
                      <td key={n}>
                        {f[`rata${n}_importo`] > 0 ? (
                          <div className="text-xs">
                            <div className="font-medium">{euro(f[`rata${n}_importo`])}</div>
                            <div className="text-gray-400">{f[`rata${n}_scadenza`] ? new Date(f[`rata${n}_scadenza`]).toLocaleDateString('it-IT') : ''}</div>
                            {f[`rata${n}_stato`] === 'Pagata' ? (
                              <div className="flex gap-1 mt-1 items-center flex-wrap">
                                <span className="badge badge-green">Pagata</span>
                                {f[`rata${n}_data_pagamento`] && <span className="text-gray-400 text-xs">{new Date(f[`rata${n}_data_pagamento`]).toLocaleDateString('it-IT')}</span>}
                                <button className="text-amber-600 hover:text-amber-800 text-sm font-bold px-1" onClick={() => annullaRata(f.id, n)} title="Annulla">↩</button>
                              </div>
                            ) : (
                              <button className="btn btn-sm btn-success mt-1" onClick={() => pagaRata(f.id, n)}>Paga</button>
                            )}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td>
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

      {/* MODAL IMPORT */}
      {modalImport && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Importa fatture da Excel</h2>
              <button onClick={() => setModalImport(false)} className="text-gray-400 text-xl">×</button>
            </div>
            {!esitoImport ? (
              <>
                <div className="bg-blue-50 rounded-lg p-3 mb-4 text-xs text-blue-700 space-y-1">
                  <p>File: export <strong>QuifatturA</strong> (.xlsx)</p>
                  <p>Colonne: <strong>A</strong> Data · <strong>B</strong> Numero · <strong>D</strong> Fornitore · <strong>I</strong> P.IVA · <strong>L</strong> Netto a pagare</p>
                  <p>Fatture già presenti: saltate. Cantiere e rate: da completare dopo.</p>
                </div>
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors" onClick={() => !importando && inputImportRef.current?.click()}>
                  {importando ? (
                    <><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div><p className="text-sm text-blue-600">Importazione in corso...</p></>
                  ) : (
                    <><p className="text-3xl mb-3">📊</p><p className="text-sm font-medium text-gray-700">Clicca per selezionare il file Excel</p><p className="text-xs text-gray-400 mt-1">.xlsx esportato da QuifatturA</p></>
                  )}
                  <input ref={inputImportRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importaExcel(f) }} />
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-800 mb-2">✅ Importazione completata</p>
                  <p className="text-lg font-bold text-green-700">{esitoImport.inserite} fatture inserite</p>
                  <p className="text-sm text-gray-500 mt-1">{esitoImport.scartate} già presenti (saltate)</p>
                </div>
                {esitoImport.errori.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-red-700 mb-1">⚠️ {esitoImport.errori.length} errori</p>
                    {esitoImport.errori.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button className="btn" onClick={() => setEsitoImport(null)}>Importa altro file</button>
                  <button className="btn btn-primary" onClick={() => setModalImport(false)}>Chiudi</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL NUOVA FATTURA */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuova fattura fornitore</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Tipo documento *</label>
                <select className="input" value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value, r1i: '', r1s: '', r2i: '', r2s: '', r3i: '', r3s: ''})}>
                  <option value="Fattura">Fattura</option>
                  <option value="Nota di credito">Nota di credito</option>
                </select></div>
              <div><label className="label">Data fattura</label><input className="input" type="date" value={form.data} onChange={e => setForm({...form, data: e.target.value})} /></div>
              <div><label className="label">N° Fattura *</label><input className="input" placeholder="es. FF/2026/018" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} /></div>
              <div><label className="label">Fornitore *</label>
                <select className="input" value={form.fornitore_id} onChange={e => setForm({...form, fornitore_id: e.target.value, fattura_collegata_id: ''})}>
                  <option value="">-- seleziona --</option>
                  {fornitori.map(f => <option key={f.id} value={f.id}>{f.ragione_sociale}</option>)}
                </select></div>
              {form.tipo === 'Nota di credito' && (
                <div className="col-span-2">
                  <label className="label">Fattura di riferimento (opzionale)</label>
                  <select className="input" value={form.fattura_collegata_id} onChange={e => setForm({...form, fattura_collegata_id: e.target.value})}>
                    <option value="">-- nessuna (NC flottante) --</option>
                    {fatture.filter(f => !isNC(f) && f.fornitore_id === form.fornitore_id).map(f => (
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
                  <option value="22">22%</option><option value="10">10%</option><option value="0">0% (RC)</option>
                </select></div>
              <div className="col-span-2"><label className="label">Descrizione</label><input className="input" placeholder="es. Fornitura materiali edili..." value={form.descrizione} onChange={e => setForm({...form, descrizione: e.target.value})} /></div>
              {form.imponibile && (
                <div className="col-span-2 bg-gray-50 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                  <span className="text-gray-500">Totale fattura (imponibile + IVA {form.iva_percentuale}%)</span>
                  <span className="font-bold text-gray-900">
                    {euro((parseFloat(form.imponibile) || 0) * (1 + (parseFloat(form.iva_percentuale) || 0) / 100))}
                  </span>
                </div>
              )}
              {form.tipo === 'Fattura' && (
                <>
                  <div className="col-span-2 mt-1 text-xs font-medium text-gray-500 border-t pt-2">Rate di pagamento</div>
                  <div><label className="label">Rata 1 — Importo</label><input className="input" type="number" step="0.01" value={form.r1i} onChange={e => setForm({...form, r1i: e.target.value})} /></div>
                  <div><label className="label">Rata 1 — Scadenza</label><input className="input" type="date" value={form.r1s} onChange={e => setForm({...form, r1s: e.target.value})} /></div>
                  <div><label className="label">Rata 2 (opz.)</label><input className="input" type="number" step="0.01" value={form.r2i} onChange={e => setForm({...form, r2i: e.target.value})} /></div>
                  <div><label className="label">Rata 2 — Scadenza</label><input className="input" type="date" value={form.r2s} onChange={e => setForm({...form, r2s: e.target.value})} /></div>
                  <div><label className="label">Rata 3 (opz.)</label><input className="input" type="number" step="0.01" value={form.r3i} onChange={e => setForm({...form, r3i: e.target.value})} /></div>
                  <div><label className="label">Rata 3 — Scadenza</label><input className="input" type="date" value={form.r3s} onChange={e => setForm({...form, r3s: e.target.value})} /></div>
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

      {/* MODAL MODIFICA — FIX: aggiunto campo descrizione, gestione errori, rata_stato */}
      {modalModifica && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Modifica — {modalModifica.numero}</h2>
              <button onClick={() => setModalModifica(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Tipo documento</label>
                <select className="input" value={modalModifica.tipo || 'Fattura'} onChange={e => setModalModifica({...modalModifica, tipo: e.target.value})}>
                  <option value="Fattura">Fattura</option>
                  <option value="Nota di credito">Nota di credito</option>
                </select></div>
              <div><label className="label">Data</label><input className="input" type="date" value={modalModifica.data || ''} onChange={e => setModalModifica({...modalModifica, data: e.target.value})} /></div>
              <div><label className="label">N° Fattura</label><input className="input" value={modalModifica.numero || ''} onChange={e => setModalModifica({...modalModifica, numero: e.target.value})} /></div>
              <div className="text-sm text-gray-500 flex items-center">
                <span>Fornitore: <strong>{modalModifica.fornitore_nome}</strong></span>
              </div>
              {(modalModifica.tipo || 'Fattura') === 'Nota di credito' && (
                <div className="col-span-2">
                  <label className="label">Fattura di riferimento (opzionale)</label>
                  <select className="input" value={modalModifica.fattura_collegata_id || ''} onChange={e => setModalModifica({...modalModifica, fattura_collegata_id: e.target.value || null})}>
                    <option value="">-- nessuna (NC flottante) --</option>
                    {fatture.filter(f => !isNC(f) && f.fornitore_id === modalModifica.fornitore_id).map(f => (
                      <option key={f.id} value={f.id}>{f.numero} — {euro(f.imponibile)} — {new Date(f.data).toLocaleDateString('it-IT')}</option>
                    ))}
                  </select>
                </div>
              )}
              <div><label className="label">Cantiere</label>
                <select className="input" value={modalModifica.progetto_id || ''} onChange={e => {
                  const prj = progetti.find(p => p.id === e.target.value)
                  setModalModifica({...modalModifica, progetto_id: e.target.value || null, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : ''})
                }}>
                  <option value="">-- nessuno --</option>
                  {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                </select></div>
              <div><label className="label">Imponibile (€)</label><input className="input" type="number" step="0.01" value={modalModifica.imponibile || ''} onChange={e => setModalModifica({...modalModifica, imponibile: e.target.value})} /></div>
              <div><label className="label">IVA %</label>
                <select className="input" value={modalModifica.iva_percentuale || '22'} onChange={e => setModalModifica({...modalModifica, iva_percentuale: e.target.value})}>
                  <option value="22">22%</option><option value="10">10%</option><option value="0">0% (RC)</option>
                </select></div>
              {/* FIX: campo descrizione aggiunto al form modifica */}
              <div className="col-span-2"><label className="label">Descrizione</label><input className="input" placeholder="es. Fornitura materiali edili..." value={modalModifica.descrizione || ''} onChange={e => setModalModifica({...modalModifica, descrizione: e.target.value})} /></div>
              {modalModifica.imponibile && (
                <div className="col-span-2 bg-blue-50 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                  <span className="text-blue-600">Totale fattura (imponibile + IVA {modalModifica.iva_percentuale || 22}%)</span>
                  <span className="font-bold text-blue-900">
                    {euro((parseFloat(modalModifica.imponibile) || 0) * (1 + (parseFloat(modalModifica.iva_percentuale) || 22) / 100))}
                  </span>
                </div>
              )}
              {(modalModifica.tipo || 'Fattura') === 'Fattura' && (
                <>
                  <div className="col-span-2 mt-1 border-t pt-2">
                    <p className="text-xs font-medium text-gray-500">Rate</p>
                    {modalModifica.rata1_stato === 'Pagata' && <p className="text-xs text-amber-600 mt-1">⚠️ Rata 1 già pagata — l'importo non verrà resettato al pagamento.</p>}
                  </div>
                  <div><label className="label">Rata 1 — Importo</label><input className="input" type="number" step="0.01" value={modalModifica.rata1_importo || ''} onChange={e => setModalModifica({...modalModifica, rata1_importo: e.target.value})} /></div>
                  <div><label className="label">Rata 1 — Scadenza</label><input className="input" type="date" value={modalModifica.rata1_scadenza || ''} onChange={e => setModalModifica({...modalModifica, rata1_scadenza: e.target.value})} /></div>
                  <div><label className="label">Rata 2 — Importo</label><input className="input" type="number" step="0.01" value={modalModifica.rata2_importo || ''} onChange={e => setModalModifica({...modalModifica, rata2_importo: e.target.value})} /></div>
                  <div><label className="label">Rata 2 — Scadenza</label><input className="input" type="date" value={modalModifica.rata2_scadenza || ''} onChange={e => setModalModifica({...modalModifica, rata2_scadenza: e.target.value})} /></div>
                  <div><label className="label">Rata 3 — Importo</label><input className="input" type="number" step="0.01" value={modalModifica.rata3_importo || ''} onChange={e => setModalModifica({...modalModifica, rata3_importo: e.target.value})} /></div>
                  <div><label className="label">Rata 3 — Scadenza</label><input className="input" type="date" value={modalModifica.rata3_scadenza || ''} onChange={e => setModalModifica({...modalModifica, rata3_scadenza: e.target.value})} /></div>
                </>
              )}
              <div><label className="label">Modalità pagamento</label>
                <select className="input" value={modalModifica.modalita_pagamento || 'Bonifico'} onChange={e => setModalModifica({...modalModifica, modalita_pagamento: e.target.value})}>
                  <option>Bonifico</option><option>RiBa</option><option>Contanti</option><option>Assegno</option><option>Altro</option>
                </select></div>
              <div></div>
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={modalModifica.note || ''} onChange={e => setModalModifica({...modalModifica, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalModifica(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaModifica} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva modifiche'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
