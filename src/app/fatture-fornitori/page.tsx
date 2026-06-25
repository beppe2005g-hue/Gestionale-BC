'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { logActivity } from '@/lib/logActivity'
import * as XLSX from 'xlsx'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Le date nell'Excel di QuifatturA sono numeri seriali Excel (es. 46194 = 12/06/2026)
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

  const [modalImport, setModalImport] = useState(false)
  const [importando, setImportando] = useState(false)
  const [esitoImport, setEsitoImport] = useState<{ inserite: number; scartate: number; errori: string[] } | null>(null)
  const inputImportRef = useRef<HTMLInputElement>(null)

  const [ricerca, setRicerca] = useState('')
  const [filtroStato, setFiltroStato] = useState('tutti')
  const [ordinamento, setOrdinamento] = useState('data_desc')
  const [dataDA, setDataDA] = useState('')
  const [dataA, setDataA] = useState('')
  const [importoDA, setImportoDA] = useState('')
  const [importoA, setImportoA] = useState('')

  const [form, setForm] = useState({
    data: '', numero: '', fornitore_id: '', progetto_id: '', descrizione: '',
    imponibile: '', iva_percentuale: '22',
    r1i: '', r1s: '', r2i: '', r2s: '', r3i: '', r3s: '',
    modalita_pagamento: 'Bonifico', note: ''
  })

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

      // Trova riga di intestazione (quella con "Data" in colonna A)
      let headerRow = -1
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        if (String(rows[i][0]).toLowerCase().trim() === 'data') { headerRow = i; break }
      }
      const dataStart = headerRow >= 0 ? headerRow + 1 : 5

      let inserite = 0
      let scartate = 0
      const errori: string[] = []

      // Carica lista fornitori aggiornata per abbinamento
      const { data: fornitoriDB } = await supabase.from('fornitori').select('id,ragione_sociale,cf_piva').eq('attivo', true)
      const fornitoriLista: any[] = fornitoriDB || []

      for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i]
        if (!row[0] && !row[1] && !row[3]) continue

        const data = excelDateToISO(row[0])
        const numero = String(row[1] || '').trim()
        const fornitoreNome = String(row[3] || '').trim()
        const piva = String(row[8] || '').trim()
        const nettoAPagare = parseFloat(String(row[11]).replace(',', '.')) || 0

        if (!numero || !fornitoreNome) continue

        // Controlla duplicato
        const { data: dup } = await supabase.from('fatture_fornitori')
          .select('id').eq('numero', numero).ilike('fornitore_nome', fornitoreNome)
        if (dup && dup.length > 0) { scartate++; continue }

        // Abbina fornitore: prima per P.IVA, poi per nome, poi crea nuovo
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
          const { data: nf } = await supabase.from('fornitori').insert({
            ragione_sociale: fornitoreNome, cf_piva: piva || null, categoria: 'Materiali', attivo: true
          }).select('id,ragione_sociale,cf_piva').single()
          if (nf) { fornitoreId = nf.id; fornitoreNomeDB = nf.ragione_sociale; fornitoriLista.push(nf) }
        }

        const { error } = await supabase.from('fatture_fornitori').insert({
          data: data || new Date().toISOString().split('T')[0],
          numero, fornitore_id: fornitoreId, fornitore_nome: fornitoreNomeDB,
          progetto_id: null, progetto_nome: '', descrizione: '',
          imponibile: nettoAPagare, iva_percentuale: 22,
          rata1_importo: nettoAPagare, rata1_scadenza: null, rata1_stato: 'Da Pagare',
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

  const haFiltri = ricerca || filtroStato !== 'tutti' || dataDA || dataA || importoDA || importoA

  function resetFiltri() {
    setRicerca(''); setFiltroStato('tutti')
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
    if (filtroStato !== 'tutti') result = result.filter(f => statoFattura(f) === filtroStato)
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
  }, [fatture, ricerca, filtroStato, ordinamento, dataDA, dataA, importoDA, importoA])

  const totaleFiltratoImponibile = fattureFiltrate.reduce((s, f) => s + (f.imponibile || 0), 0)

  async function pagaRata(id: string, rata: number) {
    const { data: fatt } = await supabase.from('fatture_fornitori').select('*').eq('id', id).single()
    if (!fatt) return
    if (!confirm(`Confermi pagamento rata ${rata}?\n${fatt.fornitore_nome} - ${fatt.numero}`)) return
    const oggi = new Date().toISOString().split('T')[0]
    await supabase.from('fatture_fornitori').update({
      [`rata${rata}_stato`]: 'Pagata', [`rata${rata}_data_pagamento`]: oggi
    }).eq('id', id)
    const imp = (fatt as any)[`rata${rata}_importo`] || 0
    await supabase.from('cash_flow').insert({
      data: oggi,
      descrizione: `Pagamento ${fatt.fornitore_nome} - Ft ${fatt.numero} rata ${rata}`,
      conto: 'Conto 1', tipologia: 'Pagamento Fornitore',
      entrata: 0, uscita: imp,
      progetto_id: (fatt as any).progetto_id || null, riferimento_fattura: fatt.numero
    })
    await logActivity('modifica', 'fatture_fornitori', id, `Pagamento rata ${rata} — ${fatt.numero} · ${fatt.fornitore_nome} · € ${imp}`)
    load()
  }

  async function annullaRata(id: string, rata: number) {
    if (!confirm(`Annullare il pagamento della rata ${rata}?\nNota: il movimento in cash flow NON viene rimosso automaticamente.`)) return
    const fatt = fatture.find(f => f.id === id)
    await supabase.from('fatture_fornitori').update({
      [`rata${rata}_stato`]: 'Da Pagare', [`rata${rata}_data_pagamento`]: null
    }).eq('id', id)
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

  async function salvaModifica() {
    if (!modalModifica) return
    setLoading(true)
    const prj = progetti.find(p => p.id === modalModifica.progetto_id)
    await supabase.from('fatture_fornitori').update({
      data: modalModifica.data, numero: modalModifica.numero,
      descrizione: modalModifica.descrizione,
      progetto_id: modalModifica.progetto_id || null,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : (modalModifica.progetto_nome || ''),
      imponibile: parseFloat(modalModifica.imponibile) || 0,
      iva_percentuale: parseFloat(modalModifica.iva_percentuale) || 22,
      rata1_importo: parseFloat(modalModifica.rata1_importo) || 0,
      rata1_scadenza: modalModifica.rata1_scadenza || null,
      rata2_importo: parseFloat(modalModifica.rata2_importo) || 0,
      rata2_scadenza: modalModifica.rata2_scadenza || null,
      rata3_importo: parseFloat(modalModifica.rata3_importo) || 0,
      rata3_scadenza: modalModifica.rata3_scadenza || null,
      modalita_pagamento: modalModifica.modalita_pagamento, note: modalModifica.note
    }).eq('id', modalModifica.id)
    await logActivity('modifica', 'fatture_fornitori', modalModifica.id, `Fattura ${modalModifica.numero} — ${modalModifica.fornitore_nome} · € ${modalModifica.imponibile}`)
    setModalModifica(null); setLoading(false); load()
  }

  async function salva() {
    if (!form.numero || !form.imponibile || !form.fornitore_id) {
      alert('Compilare N° fattura, fornitore e imponibile'); return
    }
    const { data: dup } = await supabase.from('fatture_fornitori')
      .select('id').eq('numero', form.numero).eq('fornitore_id', form.fornitore_id)
    if (dup && dup.length > 0) {
      alert(`⚠️ Fattura ${form.numero} di questo fornitore già presente. Non inserita.`); return
    }
    setLoading(true)
    const for_ = fornitori.find(f => f.id === form.fornitore_id)
    const prj = progetti.find(p => p.id === form.progetto_id)
    const imp = parseFloat(form.imponibile) || 0
    const { data: inserted } = await supabase.from('fatture_fornitori').insert({
      data: form.data || new Date().toISOString().split('T')[0],
      numero: form.numero, fornitore_id: form.fornitore_id,
      fornitore_nome: for_?.ragione_sociale || '',
      progetto_id: form.progetto_id || null,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: form.descrizione, imponibile: imp,
      iva_percentuale: parseFloat(form.iva_percentuale) || 22,
      rata1_importo: parseFloat(form.r1i) || imp * (1 + parseFloat(form.iva_percentuale) / 100),
      rata1_scadenza: form.r1s || null, rata1_stato: 'Da Pagare',
      rata2_importo: parseFloat(form.r2i) || 0,
      rata2_scadenza: form.r2s || null, rata2_stato: form.r2i ? 'Da Pagare' : null,
      rata3_importo: parseFloat(form.r3i) || 0,
      rata3_scadenza: form.r3s || null, rata3_stato: form.r3i ? 'Da Pagare' : null,
      modalita_pagamento: form.modalita_pagamento, note: form.note
    }).select('id').single()
    await logActivity('inserimento', 'fatture_fornitori', inserted?.id || '', `Fattura ${form.numero} — ${for_?.ragione_sociale} · € ${imp}`)
    setModal(false); setLoading(false); load()
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Fatture ricevute</h1>
          <div className="flex gap-2">
            <button className="btn text-sm" onClick={() => { setModalImport(true); setEsitoImport(null) }}>
              📥 Importa da Excel
            </button>
            <button className="btn btn-primary text-sm" onClick={() => setModal(true)}>+ Nuova fattura</button>
          </div>
        </div>

        <div className="card mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="label">🔍 Cerca</label>
              <input className="input" placeholder="N° fattura, fornitore, cantiere..."
                value={ricerca} onChange={e => setRicerca(e.target.value)} />
            </div>
            <div>
              <label className="label">Stato pagamento</label>
              <select className="input" value={filtroStato} onChange={e => setFiltroStato(e.target.value)}>
                <option value="tutti">Tutti ({fatture.length})</option>
                <option value="da_pagare">Da pagare ({fatture.filter(f => statoFattura(f) === 'da_pagare').length})</option>
                <option value="parziale">Parziale ({fatture.filter(f => statoFattura(f) === 'parziale').length})</option>
                <option value="pagata">Pagate ({fatture.filter(f => statoFattura(f) === 'pagata').length})</option>
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
              <span className="text-xs text-gray-500">{fattureFiltrate.length} fatture — Totale imponibile: <strong>{euro(totaleFiltratoImponibile)}</strong></span>
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
                return (
                  <tr key={f.id} className={stato === 'pagata' ? 'opacity-60' : ''}>
                    <td className="text-xs">{new Date(f.data).toLocaleDateString('it-IT')}</td>
                    <td className="font-medium text-sm">{f.numero}</td>
                    <td className="text-sm">{f.fornitore_nome}</td>
                    <td className="text-xs text-gray-500">{f.progetto_nome || '—'}</td>
                    <td className="text-sm">{euro(f.imponibile)}</td>
                    <td className="font-medium text-sm">
                      {euro(f.totale)}
                      {stato === 'pagata' && <span className="ml-1 text-xs text-green-600">✓</span>}
                      {stato === 'parziale' && <span className="ml-1 text-xs text-amber-600">½</span>}
                    </td>
                    {[1,2,3].map(n => (
                      <td key={n}>
                        {f[`rata${n}_importo`] > 0 ? (
                          <div className="text-xs">
                            <div className="font-medium">{euro(f[`rata${n}_importo`])}</div>
                            <div className="text-gray-400">{f[`rata${n}_scadenza`] ? new Date(f[`rata${n}_scadenza`]).toLocaleDateString('it-IT') : ''}</div>
                            {f[`rata${n}_stato`] === 'Pagata' ? (
                              <div className="flex gap-1 mt-1 items-center flex-wrap">
                                <span className="badge badge-green">Pagata</span>
                                {f[`rata${n}_data_pagamento`] && (
                                  <span className="text-gray-400 text-xs">{new Date(f[`rata${n}_data_pagamento`]).toLocaleDateString('it-IT')}</span>
                                )}
                                <button className="text-amber-600 hover:text-amber-800 text-sm font-bold px-1"
                                  onClick={() => annullaRata(f.id, n)} title="Annulla">↩</button>
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

      {/* ── MODAL IMPORT EXCEL ── */}
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
                  <p>Colonne lette: <strong>A</strong> Data · <strong>B</strong> Numero · <strong>D</strong> Fornitore · <strong>I</strong> P.IVA · <strong>L</strong> Netto a pagare</p>
                  <p>Fatture già presenti: saltate silenziosamente.</p>
                  <p>Cantiere e rate: da completare manualmente dopo l'import.</p>
                </div>
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
                  onClick={() => !importando && inputImportRef.current?.click()}>
                  {importando ? (
                    <>
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-sm text-blue-600">Importazione in corso...</p>
                      <p className="text-xs text-gray-400 mt-1">Potrebbe richiedere qualche secondo</p>
                    </>
                  ) : (
                    <>
                      <p className="text-3xl mb-3">📊</p>
                      <p className="text-sm font-medium text-gray-700">Clicca per selezionare il file Excel</p>
                      <p className="text-xs text-gray-400 mt-1">.xlsx esportato da QuifatturA</p>
                    </>
                  )}
                  <input ref={inputImportRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) importaExcel(f) }} />
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
                    <p className="text-xs font-medium text-red-700 mb-1">⚠️ {esitoImport.errori.length} errori di inserimento</p>
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

      {/* ── MODAL NUOVA FATTURA ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuova fattura fornitore</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Data fattura</label><input className="input" type="date" value={form.data} onChange={e => setForm({...form, data: e.target.value})} /></div>
              <div><label className="label">N° Fattura *</label><input className="input" placeholder="es. FF/2026/018" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} /></div>
              <div><label className="label">Fornitore *</label>
                <select className="input" value={form.fornitore_id} onChange={e => setForm({...form, fornitore_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {fornitori.map(f => <option key={f.id} value={f.id}>{f.ragione_sociale}</option>)}
                </select></div>
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
              <div className="col-span-2 mt-1 text-xs font-medium text-gray-500 border-t pt-2">Rate di pagamento</div>
              <div><label className="label">Rata 1 — Importo</label><input className="input" type="number" step="0.01" value={form.r1i} onChange={e => setForm({...form, r1i: e.target.value})} /></div>
              <div><label className="label">Rata 1 — Scadenza</label><input className="input" type="date" value={form.r1s} onChange={e => setForm({...form, r1s: e.target.value})} /></div>
              <div><label className="label">Rata 2 (opz.)</label><input className="input" type="number" step="0.01" value={form.r2i} onChange={e => setForm({...form, r2i: e.target.value})} /></div>
              <div><label className="label">Rata 2 — Scadenza</label><input className="input" type="date" value={form.r2s} onChange={e => setForm({...form, r2s: e.target.value})} /></div>
              <div><label className="label">Rata 3 (opz.)</label><input className="input" type="number" step="0.01" value={form.r3i} onChange={e => setForm({...form, r3i: e.target.value})} /></div>
              <div><label className="label">Rata 3 — Scadenza</label><input className="input" type="date" value={form.r3s} onChange={e => setForm({...form, r3s: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={form.note} onChange={e => setForm({...form, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL MODIFICA ── */}
      {modalModifica && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Modifica — {modalModifica.numero}</h2>
              <button onClick={() => setModalModifica(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Data</label><input className="input" type="date" value={modalModifica.data} onChange={e => setModalModifica({...modalModifica, data: e.target.value})} /></div>
              <div><label className="label">N° Fattura</label><input className="input" value={modalModifica.numero} onChange={e => setModalModifica({...modalModifica, numero: e.target.value})} /></div>
              <div><label className="label">Cantiere</label>
                <select className="input" value={modalModifica.progetto_id || ''} onChange={e => {
                  const prj = progetti.find(p => p.id === e.target.value)
                  setModalModifica({...modalModifica, progetto_id: e.target.value || null, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : ''})
                }}>
                  <option value="">-- nessuno --</option>
                  {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                </select></div>
              <div><label className="label">Imponibile (€)</label><input className="input" type="number" step="0.01" value={modalModifica.imponibile} onChange={e => setModalModifica({...modalModifica, imponibile: e.target.value})} /></div>
              <div><label className="label">IVA %</label>
                <select className="input" value={modalModifica.iva_percentuale} onChange={e => setModalModifica({...modalModifica, iva_percentuale: e.target.value})}>
                  <option value="22">22%</option><option value="10">10%</option><option value="0">0% (RC)</option>
                </select></div>
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
    </div>
  )
}
