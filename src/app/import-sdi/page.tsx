'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import * as XLSX from 'xlsx'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Converte numero seriale Excel o stringa data → YYYY-MM-DD
function parseExcelDate(val: any): string {
  if (!val) return ''
  // Già una stringa tipo "2024-01-15" o "15/01/2024"
  if (typeof val === 'string') {
    const trimmed = val.trim()
    // formato DD/MM/YYYY
    const itMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (itMatch) return `${itMatch[3]}-${itMatch[2].padStart(2,'0')}-${itMatch[1].padStart(2,'0')}`
    // formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.substring(0, 10)
    // Prova parsing generico
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    return ''
  }
  // Numero seriale Excel (giorni dal 1/1/1900)
  if (typeof val === 'number') {
    // Excel ha un bug: considera 1900 come bisestile, quindi offset di 2
    const excelEpoch = new Date(1899, 11, 30)
    const d = new Date(excelEpoch.getTime() + val * 86400000)
    if (!isNaN(d.getTime()) && d.getFullYear() > 1980 && d.getFullYear() < 2100) {
      return d.toISOString().split('T')[0]
    }
    return ''
  }
  // Oggetto Date (quando XLSX usa cellDates:true)
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) return val.toISOString().split('T')[0]
    return ''
  }
  return ''
}

interface RigaImport {
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

export default function ImportSDI() {
  const [tab, setTab] = useState<'import'|'esclusi'>('import')
  const [righe, setRighe] = useState<RigaImport[]>([])
  const [loading, setLoading] = useState(false)
  const [importando, setImportando] = useState(false)
  const [risultato, setRisultato] = useState<{importate: number, errori: number} | null>(null)
  const [progetti, setProgetti] = useState<any[]>([])
  const [progettoDefault, setProgettoDefault] = useState('')
  const [scadenzaDefault, setScadenzaDefault] = useState('')
  const [esclusi, setEsclusi] = useState<any[]>([])
  const [nuovoEscluso, setNuovoEscluso] = useState({ nome: '', piva: '', motivo: '' })

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

  // Applica scadenza default a tutte le righe OK
  function applicaScadenzaDefault() {
    if (!scadenzaDefault) { alert('Imposta prima una data di scadenza default'); return }
    setRighe(prev => prev.map(r => r.stato === 'ok' ? { ...r, scadenza: scadenzaDefault } : r))
  }

  function aggiornaScadenza(i: number, val: string) {
    setRighe(prev => prev.map((r, j) => j === i ? { ...r, scadenza: val } : r))
  }

  async function leggiFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setRisultato(null)

    const buffer = await file.arrayBuffer()
    // raw:true per leggere i valori grezzi (numeri seriali) senza conversione automatica
    const wb = XLSX.read(buffer, { type: 'array', raw: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as any[][]

    // Trova riga intestazioni
    let headerRow = -1
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      if (raw[i]?.some((v: any) => String(v) === 'Numero' || String(v) === 'Fornitore')) {
        headerRow = i; break
      }
    }
    if (headerRow === -1) {
      alert('File non riconosciuto. Carica il file Excel scaricato da SDI.')
      setLoading(false); return
    }

    const headers: string[] = raw[headerRow].map((h: any) => String(h || '').trim())
    const col = {
      data: headers.indexOf('Data'),
      numero: headers.indexOf('Numero'),
      tipo: headers.indexOf('Tipo'),
      fornitore: headers.indexOf('Fornitore'),
      piva: headers.indexOf('Partita IVA'),
      totale: headers.indexOf('Tot. documento'),
      netto: headers.indexOf('Netto a pagare'),
      ricezione: headers.indexOf('Data ricezione'),
    }

    const [{ data: esistenti }, { data: listaEsclusi }] = await Promise.all([
      supabase.from('fatture_fornitori').select('numero,fornitore_nome'),
      supabase.from('fornitori_esclusi_import').select('nome_fornitore,piva'),
    ])

    const parsed: RigaImport[] = []

    for (let i = headerRow + 1; i < raw.length; i++) {
      const row = raw[i]
      if (!row || !row[col.numero]) continue

      const numero = String(row[col.numero] || '').trim()
      const fornitore = String(row[col.fornitore] || '').trim()
      const tipo = String(row[col.tipo] || '').trim().toLowerCase()
      const totaleRaw = String(row[col.totale] || '0').replace(',', '.')
      const nettoRaw = String(row[col.netto] || '0').replace(',', '.')
      const totale = parseFloat(totaleRaw) || 0
      const netto = parseFloat(nettoRaw) || 0
      const piva = String(row[col.piva] || '').trim()

      // Escludi RC e integrazioni
      if (tipo.includes('reverse') || tipo.includes('integrazione') || (totale === 0 && netto === 0)) {
        continue
      }

      // Fix date — usa parseExcelDate su valore grezzo
      const dataStr = parseExcelDate(row[col.data])
      const dataRicezione = parseExcelDate(row[col.ricezione])

      let stato: RigaImport['stato'] = 'ok'
      let motivo = ''

      const escluso = listaEsclusi?.find(e =>
        fornitore.toLowerCase().includes(e.nome_fornitore.toLowerCase()) ||
        (e.piva && piva && e.piva === piva)
      )
      if (escluso) { stato = 'escluso'; motivo = 'Fornitore in lista esclusioni' }

      if (stato === 'ok') {
        const dup = esistenti?.find(e =>
          e.numero === numero &&
          e.fornitore_nome.toLowerCase() === fornitore.toLowerCase()
        )
        if (dup) { stato = 'duplicato'; motivo = 'Già presente nel sistema' }
      }

      parsed.push({
        data: dataStr, numero, fornitore, piva, totale, netto,
        data_ricezione: dataRicezione,
        scadenza: scadenzaDefault || '',
        selezionata: stato === 'ok',
        stato, motivo
      })
    }

    setRighe(parsed)
    setLoading(false)
  }

  async function eseguiImport() {
    const daImportare = righe.filter(r => r.selezionata && r.stato === 'ok')
    if (daImportare.length === 0) { alert('Nessuna fattura selezionata.'); return }

    // Avvisa se qualcuna non ha scadenza
    const senzaScadenza = daImportare.filter(r => !r.scadenza).length
    if (senzaScadenza > 0) {
      if (!confirm(`${senzaScadenza} fatture non hanno una scadenza impostata. Importare comunque?`)) return
    } else {
      if (!confirm(`Importare ${daImportare.length} fatture nel sistema?`)) return
    }

    setImportando(true)
    let importate = 0, errori = 0

    for (const r of daImportare) {
      try {
        let { data: fornExist } = await supabase.from('fornitori')
          .select('id').ilike('ragione_sociale', `%${r.fornitore}%`).limit(1)
        let fornitoreId = fornExist?.[0]?.id
        if (!fornitoreId) {
          const { data: newForn } = await supabase.from('fornitori').insert({
            ragione_sociale: r.fornitore, cf_piva: r.piva,
            categoria: 'Altro', attivo: true
          }).select('id').single()
          fornitoreId = newForn?.id
        }

        const imponibile = r.netto > 0 ? r.netto : r.totale
        const ivaPerc = r.totale > 0 && r.netto > 0 && r.totale !== r.netto
          ? Math.round((r.totale / r.netto - 1) * 100) : 22
        const prj = progettoDefault ? progetti.find(p => p.id === progettoDefault) : null

        const { error } = await supabase.from('fatture_fornitori').insert({
          data: r.data || new Date().toISOString().split('T')[0],
          numero: r.numero,
          fornitore_id: fornitoreId || null,
          fornitore_nome: r.fornitore,
          progetto_id: progettoDefault || null,
          progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
          imponibile,
          iva_percentuale: ivaPerc,
          rata1_importo: r.totale,
          rata1_scadenza: r.scadenza || null,
          rata1_stato: 'Da Pagare',
          note: `SDI - Ricezione: ${r.data_ricezione}`
        })
        if (error) errori++; else importate++
      } catch { errori++ }
    }

    setImportando(false)
    setRisultato({ importate, errori })
    setRighe(prev => prev.map(r =>
      r.selezionata && r.stato === 'ok'
        ? { ...r, stato: 'duplicato', motivo: 'Appena importata', selezionata: false }
        : r
    ))
  }

  const nOk = righe.filter(r => r.stato === 'ok').length
  const nDup = righe.filter(r => r.stato === 'duplicato').length
  const nEsc = righe.filter(r => r.stato === 'escluso').length
  const nSel = righe.filter(r => r.selezionata && r.stato === 'ok').length
  const nSenzaScadenza = righe.filter(r => r.stato === 'ok' && r.selezionata && !r.scadenza).length

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Import fatture da SDI</h1>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('import')} className={`btn ${tab === 'import' ? 'btn-primary' : ''}`}>
            📂 Import file SDI
          </button>
          <button onClick={() => setTab('esclusi')} className={`btn ${tab === 'esclusi' ? 'btn-primary' : ''}`}>
            🚫 Fornitori esclusi ({esclusi.length})
          </button>
        </div>

        {tab === 'import' && (
          <>
            <div className="card mb-4">
              <h3 className="text-sm font-medium mb-3">Carica file Excel SDI</h3>
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <label className="btn btn-primary cursor-pointer">
                    📂 Scegli file .xlsx
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={leggiFile} />
                  </label>
                  <p className="text-xs text-gray-400 mt-1">Le fatture RC e di integrazione vengono escluse automaticamente</p>
                </div>
                <div className="flex-1 min-w-52">
                  <label className="label">Cantiere di default (opzionale)</label>
                  <select className="input" value={progettoDefault} onChange={e => setProgettoDefault(e.target.value)}>
                    <option value="">— nessun cantiere —</option>
                    {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {loading && <div className="card text-center py-8 text-gray-500">Analisi file in corso...</div>}

            {risultato && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <p className="font-medium text-green-800">
                  ✅ Import completato — {risultato.importate} fatture importate
                  {risultato.errori > 0 && ` · ❌ ${risultato.errori} errori`}
                </p>
              </div>
            )}

            {righe.length > 0 && (
              <div className="card">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                  <div className="flex gap-4 text-sm flex-wrap">
                    <span className="text-green-700 font-medium">✅ Da importare: {nOk}</span>
                    <span className="text-amber-700">⚠️ Duplicati: {nDup}</span>
                    {nEsc > 0 && <span className="text-gray-500">🚫 Esclusi: {nEsc}</span>}
                    {nSenzaScadenza > 0 && (
                      <span className="text-red-600">⚠️ Senza scadenza: {nSenzaScadenza}</span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn btn-sm"
                      onClick={() => setRighe(prev => prev.map(r => ({ ...r, selezionata: r.stato === 'ok' })))}>
                      Seleziona tutti
                    </button>
                    <button className="btn btn-sm"
                      onClick={() => setRighe(prev => prev.map(r => ({ ...r, selezionata: false })))}>
                      Deseleziona
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={eseguiImport}
                      disabled={importando || nSel === 0}>
                      {importando ? 'Importazione...' : `Importa ${nSel} fatture`}
                    </button>
                  </div>
                </div>

                {/* Scadenza default */}
                <div className="flex items-center gap-3 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-xs text-amber-800 font-medium flex-shrink-0">📅 Scadenza per tutte:</span>
                  <input type="date" className="input w-auto text-sm" value={scadenzaDefault}
                    onChange={e => setScadenzaDefault(e.target.value)} />
                  <button className="btn btn-sm" onClick={applicaScadenzaDefault}>
                    Applica a tutte le righe selezionate
                  </button>
                  <span className="text-xs text-amber-600">oppure impostala riga per riga →</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th style={{width:36}}></th>
                        <th>Data fatt.</th>
                        <th>N° Fattura</th>
                        <th>Fornitore</th>
                        <th>Totale</th>
                        <th>Netto</th>
                        <th>Scadenza pagamento</th>
                        <th>Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {righe.map((r, i) => (
                        <tr key={i} className={
                          r.stato === 'duplicato' ? 'opacity-50' :
                          r.stato === 'escluso' ? 'opacity-40 bg-gray-50' :
                          r.selezionata ? 'bg-green-50' : ''
                        }>
                          <td>
                            {r.stato === 'ok' && (
                              <input type="checkbox" checked={r.selezionata}
                                onChange={() => setRighe(prev => prev.map((x, j) =>
                                  j === i ? { ...x, selezionata: !x.selezionata } : x))} />
                            )}
                          </td>
                          <td className="text-xs">
                            {r.data ? new Date(r.data).toLocaleDateString('it-IT') : <span className="text-red-500">—</span>}
                          </td>
                          <td className="font-medium text-xs">{r.numero}</td>
                          <td className="text-xs">{r.fornitore}</td>
                          <td className="text-sm font-medium">{euro(r.totale)}</td>
                          <td className="text-sm">{euro(r.netto)}</td>
                          <td>
                            {r.stato === 'ok' ? (
                              <input type="date" className="input text-xs py-0.5 w-36"
                                value={r.scadenza}
                                onChange={e => aggiornaScadenza(i, e.target.value)} />
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
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

        {tab === 'esclusi' && (
          <>
            <div className="card mb-4">
              <h3 className="text-sm font-medium mb-3">Aggiungi fornitore da escludere</h3>
              <p className="text-xs text-gray-500 mb-3">
                Le fatture di questi fornitori verranno scartate automaticamente ad ogni import SDI.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Nome fornitore *</label>
                  <input className="input" placeholder="es. Enel Energia S.p.A."
                    value={nuovoEscluso.nome}
                    onChange={e => setNuovoEscluso({...nuovoEscluso, nome: e.target.value})} />
                </div>
                <div>
                  <label className="label">P.IVA (opzionale)</label>
                  <input className="input" placeholder="es. 15844561009"
                    value={nuovoEscluso.piva}
                    onChange={e => setNuovoEscluso({...nuovoEscluso, piva: e.target.value})} />
                </div>
                <div>
                  <label className="label">Motivo (opzionale)</label>
                  <input className="input" placeholder="es. Utenza elettrica"
                    value={nuovoEscluso.motivo}
                    onChange={e => setNuovoEscluso({...nuovoEscluso, motivo: e.target.value})} />
                </div>
              </div>
              <div className="flex justify-end mt-3">
                <button className="btn btn-primary" onClick={aggiungiEscluso}>+ Aggiungi alla lista</button>
              </div>
            </div>

            <div className="card">
              <h3 className="text-sm font-medium mb-3">Fornitori esclusi ({esclusi.length})</h3>
              {esclusi.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nessun fornitore in lista.</p>
              ) : (
                <table className="table-base">
                  <thead><tr><th>Nome fornitore</th><th>P.IVA</th><th>Motivo</th><th></th></tr></thead>
                  <tbody>
                    {esclusi.map(e => (
                      <tr key={e.id}>
                        <td className="font-medium text-sm">{e.nome_fornitore}</td>
                        <td className="text-xs text-gray-500">{e.piva || '—'}</td>
                        <td className="text-xs text-gray-500">{e.motivo || '—'}</td>
                        <td>
                          <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => rimuoviEscluso(e.id)}>✕</button>
                        </td>
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
