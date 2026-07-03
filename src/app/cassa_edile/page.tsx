'use client'
import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

// ─── Mesi italiani ────────────────────────────────────────────────────────────
const MESI_IT: Record<string, number> = {
  GENNAIO:1, FEBBRAIO:2, MARZO:3, APRILE:4, MAGGIO:5, GIUGNO:6,
  LUGLIO:7, AGOSTO:8, SETTEMBRE:9, OTTOBRE:10, NOVEMBRE:11, DICEMBRE:12
}
const MESI_LABEL = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function parseItMese(str: string): string | null {
  if (!str) return null
  const parts = str.trim().toUpperCase().replace(/\s+/g, ' ').split(' ')
  const mese = MESI_IT[parts[0]]
  const anno = parseInt(parts[parts.length - 1])
  if (!mese || !anno || anno < 2020 || anno > 2050) return null
  return `${anno}-${String(mese).padStart(2,'0')}-01`
}

function labelMese(d: string) {
  const [y, m] = d.split('-')
  return `${MESI_LABEL[parseInt(m)]} ${y}`
}

// ─── Parsing Excel (foglio Tot) ───────────────────────────────────────────────
type RigaImport = { azienda: string; nome: string; cantiere: string; ore: number }

function parseExcel(file: File): Promise<{ mese: string; righe: RigaImport[]; cantieri: string[]; errore?: string }> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })

        // Cerca il foglio Tot (primo foglio o foglio chiamato Tot/Totale)
        const nomeSheet = wb.SheetNames.find(n => n.toLowerCase().startsWith('tot')) || wb.SheetNames[0]
        const ws = wb.Sheets[nomeSheet]
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][]

        if (!rows.length) { resolve({ mese: '', righe: [], cantieri: [], errore: 'Foglio vuoto' }); return }

        // Riga 0 = header: [mese, cantiere1, cantiere2, ..., '', 'Tot ore persona']
        const headerRow = rows[0]
        const meseStr = String(headerRow[0] || '').trim()
        const mese = parseItMese(meseStr)
        if (!mese) { resolve({ mese: '', righe: [], cantieri: [], errore: `Non riesco a leggere il mese: "${meseStr}"` }); return }

        // Trova i cantieri (colonne 1..N prima della colonna vuota o "Tot")
        const cantieri: string[] = []
        const cantiereStartCol = 1
        let cantiereEndCol = cantiereStartCol
        for (let c = cantiereStartCol; c < headerRow.length; c++) {
          const v = String(headerRow[c] || '').trim()
          if (!v || v.toLowerCase().includes('tot')) break
          cantieri.push(v)
          cantiereEndCol = c
        }

        if (!cantieri.length) { resolve({ mese, righe: [], cantieri: [], errore: 'Nessun cantiere trovato nel foglio Tot' }); return }

        // Scansione righe: aziende e dipendenti
        let currentAzienda = ''
        const righe: RigaImport[] = []

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]
          if (!row || !row[0]) continue
          const col0 = String(row[0]).trim()
          if (!col0) continue

          // È un'intestazione azienda? (non inizia con numero)
          if (!/^\d/.test(col0)) {
            currentAzienda = col0
            continue
          }

          // È una riga dipendente
          const nome = col0.replace(/^\d+[\.,]\s*/, '').trim()
          if (!nome || !currentAzienda) continue

          // Ore per ogni cantiere
          for (let ci = 0; ci < cantieri.length; ci++) {
            const val = row[cantiereStartCol + ci]
            const ore = typeof val === 'number' ? val : parseFloat(String(val || '0')) || 0
            if (ore > 0) {
              righe.push({ azienda: currentAzienda, nome, cantiere: cantieri[ci], ore })
            }
          }
        }

        resolve({ mese, righe, cantieri })
      } catch (err: any) {
        resolve({ mese: '', righe: [], cantieri: [], errore: `Errore parsing: ${err.message}` })
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ─── Componente principale ────────────────────────────────────────────────────
export default function CassaEdilePage() {
  const [tab, setTab] = useState<'visualizza' | 'importa'>('visualizza')
  const [mesiDisponibili, setMesiDisponibili] = useState<string[]>([])
  const [meseSelezionato, setMeseSelezionato] = useState<string>('')
  const [filtroAzienda, setFiltroAzienda] = useState<string>('tutti')
  const [dati, setDati] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Import
  const [preview, setPreview] = useState<{ mese: string; righe: RigaImport[]; cantieri: string[] } | null>(null)
  const [erroreImport, setErroreImport] = useState<string>('')
  const [salvando, setSalvando] = useState(false)
  const [salvato, setSalvato] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadMesi() }, [])
  useEffect(() => { if (meseSelezionato) loadDati(meseSelezionato) }, [meseSelezionato])

  async function loadMesi() {
    const { data } = await supabase.from('cassa_edile_mensile').select('mese').order('mese', { ascending: false })
    const unici = Array.from(new Set((data || []).map((r: any) => r.mese))).sort().reverse()
    setMesiDisponibili(unici as string[])
    if (unici.length > 0) setMeseSelezionato(unici[0] as string)
  }

  async function loadDati(mese: string) {
    setLoading(true)
    const { data } = await supabase.from('cassa_edile_mensile')
      .select('*')
      .eq('mese', mese)
      .order('azienda').order('dipendente_nome').order('cantiere_nome')
    setDati(data || [])
    setLoading(false)
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErroreImport('')
    setSalvato('')
    setPreview(null)
    const res = await parseExcel(file)
    if (res.errore) { setErroreImport(res.errore); return }
    if (!res.righe.length) { setErroreImport('Nessuna riga con ore > 0 trovata nel foglio Tot'); return }
    setPreview(res)
  }

  async function salvaImport() {
    if (!preview) return
    setSalvando(true)
    const payload = preview.righe.map(r => ({
      mese: preview.mese,
      azienda: r.azienda,
      dipendente_nome: r.nome,
      cantiere_nome: r.cantiere,
      ore: r.ore,
    }))

    const { error } = await supabase.from('cassa_edile_mensile')
      .upsert(payload, { onConflict: 'mese,azienda,dipendente_nome,cantiere_nome' })

    setSalvando(false)
    if (error) { setErroreImport('Errore salvataggio: ' + error.message); return }

    setSalvato(`✅ Importate ${payload.length} righe per ${labelMese(preview.mese)}`)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
    await loadMesi()
    setMeseSelezionato(preview.mese)
    setTab('visualizza')
  }

  async function eliminaMese() {
    if (!meseSelezionato) return
    if (!confirm(`Eliminare tutti i dati di ${labelMese(meseSelezionato)}?`)) return
    await supabase.from('cassa_edile_mensile').delete().eq('mese', meseSelezionato)
    setDati([])
    loadMesi()
  }

  // ── Costruzione pivot per visualizzazione ──────────────────────────────────
  const cantieri = Array.from(new Set(dati.map((r: any) => r.cantiere_nome))).sort()
  const aziende = Array.from(new Set(dati.map((r: any) => r.azienda)))
  const aziendeFiltrate = filtroAzienda === 'tutti' ? aziende : [filtroAzienda]

  // pivot: [azienda][dipendente][cantiere] = ore
  const pivot: Record<string, Record<string, Record<string, number>>> = {}
  for (const r of dati) {
    if (!pivot[r.azienda]) pivot[r.azienda] = {}
    if (!pivot[r.azienda][r.dipendente_nome]) pivot[r.azienda][r.dipendente_nome] = {}
    pivot[r.azienda][r.dipendente_nome][r.cantiere_nome] = r.ore
  }

  // Totali colonna per cantiere
  const totaliCantiere: Record<string, number> = {}
  for (const r of dati) {
    totaliCantiere[r.cantiere_nome] = (totaliCantiere[r.cantiere_nome] || 0) + r.ore
  }
  const totaleTotale = Object.values(totaliCantiere).reduce((a, b) => a + b, 0)

  // Preview: pivot azienda → dipendenti
  const previewCantieri = preview?.cantieri || []
  const previewPivot: Record<string, Record<string, number[]>> = {}
  if (preview) {
    for (const r of preview.righe) {
      if (!previewPivot[r.azienda]) previewPivot[r.azienda] = {}
      if (!previewPivot[r.azienda][r.nome]) previewPivot[r.azienda][r.nome] = new Array(previewCantieri.length).fill(0)
      const ci = previewCantieri.indexOf(r.cantiere)
      if (ci >= 0) previewPivot[r.azienda][r.nome][ci] = r.ore
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden" style={{ height: '100vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold">🏗️ Cassa Edile</h1>
            <p className="text-xs text-gray-500 mt-0.5">Ore per persona per cantiere — separato dai cantieri aperti</p>
          </div>
          <div className="flex gap-2">
            {(['visualizza', 'importa'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`}>
                {t === 'visualizza' ? '📊 Visualizza' : '📥 Importa Excel'}
              </button>
            ))}
          </div>
        </div>

        {/* ─── TAB VISUALIZZA ─── */}
        {tab === 'visualizza' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Barra filtri */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 font-medium">Mese:</label>
                <select className="input text-sm py-1"
                  value={meseSelezionato}
                  onChange={e => setMeseSelezionato(e.target.value)}>
                  {mesiDisponibili.length === 0 && <option value="">— nessun dato importato —</option>}
                  {mesiDisponibili.map(m => <option key={m} value={m}>{labelMese(m)}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 font-medium">Azienda:</label>
                <select className="input text-sm py-1" value={filtroAzienda} onChange={e => setFiltroAzienda(e.target.value)}>
                  <option value="tutti">Tutte</option>
                  {aziende.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {meseSelezionato && (
                <button onClick={eliminaMese} className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50 ml-auto">
                  🗑️ Elimina mese
                </button>
              )}
            </div>

            {/* Tabella pivot */}
            <div className="flex-1 overflow-auto p-4">
              {loading && <p className="text-gray-400 text-sm text-center py-12">Caricamento...</p>}
              {!loading && mesiDisponibili.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <p className="text-4xl mb-2">📥</p>
                  <p className="text-sm">Nessun dato. Usa "Importa Excel" per caricare il tuo file.</p>
                  <button className="mt-3 btn btn-sm btn-primary" onClick={() => setTab('importa')}>Importa adesso</button>
                </div>
              )}
              {!loading && mesiDisponibili.length > 0 && dati.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      <tr className="bg-gray-800 text-white">
                        <th className="sticky left-0 z-10 bg-gray-800 border border-gray-700 px-3 py-2 text-left whitespace-nowrap" style={{ minWidth: 180 }}>
                          Dipendente
                        </th>
                        {cantieri.map(c => (
                          <th key={c} className="border border-gray-700 px-2 py-2 text-center whitespace-nowrap font-medium" style={{ minWidth: 80 }}>
                            {c}
                          </th>
                        ))}
                        <th className="border border-gray-700 px-2 py-2 text-center font-bold bg-gray-700">TOTALE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aziendeFiltrate.map((az, ai) => {
                        const dipList = Object.keys(pivot[az] || {}).sort()
                        const totAz = dipList.reduce((s, d) => s + Object.values(pivot[az][d]).reduce((a, b) => a + b, 0), 0)
                        return [
                          // Header azienda
                          <tr key={`az-${az}`} className="bg-blue-900 text-white">
                            <td className="sticky left-0 z-10 bg-blue-900 border border-blue-800 px-3 py-1.5 font-bold text-xs uppercase tracking-wide" colSpan={cantieri.length + 2}>
                              🏢 {az}
                            </td>
                          </tr>,
                          // Righe dipendenti
                          ...dipList.map((dip, di) => {
                            const oreRow = pivot[az][dip]
                            const totDip = Object.values(oreRow).reduce((a, b) => a + b, 0)
                            return (
                              <tr key={`${az}-${dip}`} className={di % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className={`sticky left-0 z-10 border border-gray-200 px-3 py-1.5 font-medium ${di % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                  {dip}
                                </td>
                                {cantieri.map(c => {
                                  const ore = oreRow[c] || 0
                                  return (
                                    <td key={c} className={`border border-gray-200 text-center py-1.5 px-1 ${ore > 0 ? 'text-blue-800 font-semibold bg-blue-50' : 'text-gray-300'}`}>
                                      {ore > 0 ? ore : '—'}
                                    </td>
                                  )
                                })}
                                <td className="border border-gray-300 text-center py-1.5 px-2 font-bold bg-gray-100 text-gray-800">
                                  {totDip}
                                </td>
                              </tr>
                            )
                          }),
                          // Subtotale azienda
                          <tr key={`tot-${az}`} className="bg-blue-50 border-t-2 border-blue-200">
                            <td className="sticky left-0 z-10 bg-blue-50 border border-blue-200 px-3 py-1.5 font-bold text-blue-800 text-xs">
                              Totale {az}
                            </td>
                            {cantieri.map(c => {
                              const tot = dipList.reduce((s, d) => s + (pivot[az][d][c] || 0), 0)
                              return (
                                <td key={c} className={`border border-blue-200 text-center py-1.5 px-1 font-bold ${tot > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
                                  {tot > 0 ? tot : '—'}
                                </td>
                              )
                            })}
                            <td className="border border-blue-300 text-center py-1.5 px-2 font-black text-blue-900 bg-blue-100">{totAz}</td>
                          </tr>
                        ]
                      })}

                      {/* Totale generale */}
                      {filtroAzienda === 'tutti' && (
                        <tr className="bg-gray-800 text-white border-t-2 border-gray-600">
                          <td className="sticky left-0 z-10 bg-gray-800 border border-gray-700 px-3 py-2 font-black uppercase text-xs">
                            TOTALE GENERALE
                          </td>
                          {cantieri.map(c => (
                            <td key={c} className={`border border-gray-700 text-center py-2 px-1 font-bold ${totaliCantiere[c] > 0 ? 'text-yellow-300' : 'text-gray-600'}`}>
                              {totaliCantiere[c] > 0 ? totaliCantiere[c] : '—'}
                            </td>
                          ))}
                          <td className="border border-gray-700 text-center py-2 px-2 font-black text-yellow-300 text-sm">{totaleTotale}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB IMPORTA ─── */}
        {tab === 'importa' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto space-y-6">

              {/* Upload */}
              <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-8 text-center">
                <p className="text-4xl mb-3">📥</p>
                <p className="font-semibold text-gray-700 mb-1">Carica il file Excel Cassa Edile</p>
                <p className="text-xs text-gray-500 mb-4">Formato: il tuo Excel con il foglio "Tot" e i fogli per cantiere. Legge automaticamente mese, cantieri e ore per persona.</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" id="file-ce" onChange={onFileChange} />
                <label htmlFor="file-ce" className="btn btn-primary cursor-pointer inline-block">Scegli file .xlsx</label>
              </div>

              {erroreImport && (
                <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-red-700 text-sm">
                  ❌ {erroreImport}
                </div>
              )}

              {salvato && (
                <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-green-700 text-sm font-medium">
                  {salvato}
                </div>
              )}

              {/* Preview */}
              {preview && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-base">📋 Anteprima importazione</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <strong>{labelMese(preview.mese)}</strong> — {preview.righe.length} righe con ore &gt; 0 su {previewCantieri.length} cantieri
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}>Annulla</button>
                      <button className="btn btn-primary" onClick={salvaImport} disabled={salvando}>
                        {salvando ? 'Salvataggio...' : `✅ Importa ${preview.righe.length} righe`}
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-96">
                    <table className="text-xs border-collapse w-full">
                      <thead>
                        <tr className="bg-gray-100 sticky top-0 z-10">
                          <th className="border border-gray-300 px-3 py-2 text-left whitespace-nowrap">Azienda</th>
                          <th className="border border-gray-300 px-3 py-2 text-left whitespace-nowrap" style={{ minWidth: 160 }}>Dipendente</th>
                          {previewCantieri.map(c => (
                            <th key={c} className="border border-gray-300 px-2 py-2 text-center whitespace-nowrap font-medium" style={{ minWidth: 70 }}>
                              {c.length > 15 ? c.slice(0, 15) + '…' : c}
                            </th>
                          ))}
                          <th className="border border-gray-300 px-2 py-2 text-center font-bold">TOT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(previewPivot).map(([az, dips]) => [
                          <tr key={`paz-${az}`} className="bg-blue-900 text-white">
                            <td className="border border-blue-800 px-3 py-1 font-bold text-xs uppercase" colSpan={previewCantieri.length + 3}>
                              🏢 {az}
                            </td>
                          </tr>,
                          ...Object.entries(dips).sort(([a],[b]) => a.localeCompare(b)).map(([dip, oreArr], di) => {
                            const tot = oreArr.reduce((a, b) => a + b, 0)
                            return (
                              <tr key={`p${az}-${dip}`} className={di % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="border border-gray-200 px-3 py-1 text-gray-500">{az.slice(0,12)}</td>
                                <td className="border border-gray-200 px-3 py-1 font-medium">{dip}</td>
                                {oreArr.map((ore, ci) => (
                                  <td key={ci} className={`border border-gray-200 text-center py-1 ${ore > 0 ? 'text-blue-800 font-semibold bg-blue-50' : 'text-gray-300'}`}>
                                    {ore > 0 ? ore : '—'}
                                  </td>
                                ))}
                                <td className="border border-gray-300 text-center py-1 font-bold bg-gray-100">{tot}</td>
                              </tr>
                            )
                          })
                        ])}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
