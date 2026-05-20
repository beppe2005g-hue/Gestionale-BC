'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import * as XLSX from 'xlsx'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface RigaImport {
  data: string
  numero: string
  fornitore: string
  piva: string
  totale: number
  netto: number
  data_ricezione: string
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

  async function leggiFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setRisultato(null)

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]

    // Trova riga intestazioni
    let headerRow = -1
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      if (raw[i]?.some((v: any) => v === 'Numero' || v === 'Fornitore')) {
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

    // Carica lista nera e fatture esistenti
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
      const totale = parseFloat(String(row[col.totale] || '0').replace(',', '.')) || 0
      const netto = parseFloat(String(row[col.netto] || '0').replace(',', '.')) || 0
      const piva = String(row[col.piva] || '').trim()

      // ESCLUDI RC e integrazioni (silenziosamente)
      if (tipo.includes('reverse') || tipo.includes('integrazione') || (totale === 0 && netto === 0)) {
        continue
      }

      let dataStr = ''
      try {
        const d = row[col.data]
        if (d) { const dt = new Date(d); if (!isNaN(dt.getTime())) dataStr = dt.toISOString().split('T')[0] }
      } catch {}

      let dataRicezione = ''
      try {
        const d = row[col.ricezione]
        if (d) { const dt = new Date(d); if (!isNaN(dt.getTime())) dataRicezione = dt.toISOString().split('T')[0] }
      } catch {}

      let stato: RigaImport['stato'] = 'ok'
      let motivo = ''

      // Controlla lista nera
      const escluso = listaEsclusi?.find(e =>
        fornitore.toLowerCase().includes(e.nome_fornitore.toLowerCase()) ||
        (e.piva && piva && e.piva === piva)
      )
      if (escluso) {
        stato = 'escluso'
        motivo = `Fornitore in lista esclusioni`
      }

      // Controlla duplicati
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
    if (!confirm(`Importare ${daImportare.length} fatture nel sistema?`)) return

    setImportando(true)
    let importate = 0, errori = 0

    for (const r of daImportare) {
      try {
        // Cerca fornitore esistente o crealo
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
          imponibile, iva_percentuale: ivaPerc,
          rata1_importo: r.totale,
          rata1_stato: 'Da Pagare',
          note: `SDI - Ricezione: ${r.data_ricezione}`
        })
        if (error) errori++; else importate++
      } catch { errori++ }
    }

    setImportando(false)
    setRisultato({ importate, errori })
    // Marca le importate come duplicate
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

        {/* TAB IMPORT */}
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
                  <p className="text-xs text-gray-400 mt-1">
                    Le fatture RC e di integrazione vengono escluse automaticamente
                  </p>
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

            {loading && (
              <div className="card text-center py-8 text-gray-500">Analisi file in corso...</div>
            )}

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
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-700 font-medium">✅ Da importare: {nOk}</span>
                    <span className="text-amber-700">⚠️ Duplicati: {nDup}</span>
                    {nEsc > 0 && <span className="text-gray-500">🚫 Esclusi: {nEsc}</span>}
                  </div>
                  <div className="flex gap-2">
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
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr><th style={{width:36}}></th><th>Data</th><th>N° Fattura</th><th>Fornitore</th><th>Totale</th><th>Netto</th><th>Stato</th></tr>
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
                          <td className="text-xs">{r.data ? new Date(r.data).toLocaleDateString('it-IT') : '—'}</td>
                          <td className="font-medium text-xs">{r.numero}</td>
                          <td className="text-xs">{r.fornitore}</td>
                          <td className="text-sm font-medium">{euro(r.totale)}</td>
                          <td className="text-sm">{euro(r.netto)}</td>
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

        {/* TAB FORNITORI ESCLUSI */}
        {tab === 'esclusi' && (
          <>
            <div className="card mb-4">
              <h3 className="text-sm font-medium mb-3">Aggiungi fornitore da escludere</h3>
              <p className="text-xs text-gray-500 mb-3">
                Le fatture di questi fornitori verranno scartate automaticamente ad ogni import SDI.
                Utile per banche, utenze, assicurazioni, canoni — tutto ciò che non riguarda i cantieri.
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
              <h3 className="text-sm font-medium mb-3">Fornitori esclusi dall'import ({esclusi.length})</h3>
              {esclusi.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  Nessun fornitore in lista. Aggiungi i fornitori le cui fatture non vuoi importare.
                </p>
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
