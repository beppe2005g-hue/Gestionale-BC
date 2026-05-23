'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface RigaScadenza {
  tipo: string; soggetto: string; cantiere: string; fattura: string
  rata: number; importo: number; scadenza: string; gg: number; stato: string
}

export default function Scadenzario() {
  const [righe, setRighe] = useState<RigaScadenza[]>([])
  const [filtro, setFiltro] = useState('tutti')

  // Filtri aggiuntivi
  const [cercaSoggetto, setCercaSoggetto] = useState('')
  const [dataDA, setDataDA] = useState('')
  const [dataA, setDataA] = useState('')
  const [importoDA, setImportoDA] = useState('')
  const [importoA, setImportoA] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: ff }, { data: fc }] = await Promise.all([
      supabase.from('fatture_fornitori').select('numero,fornitore_nome,progetto_nome,rata1_importo,rata1_scadenza,rata1_stato,rata2_importo,rata2_scadenza,rata2_stato,rata3_importo,rata3_scadenza,rata3_stato'),
      supabase.from('fatture_clienti').select('numero,cliente_nome,progetto_nome,rata1_importo,rata1_scadenza,rata1_stato,rata2_importo,rata2_scadenza,rata2_stato,rata3_importo,rata3_scadenza,rata3_stato'),
    ])
    const all: RigaScadenza[] = []
    ;(ff || []).forEach((f: Record<string, unknown>) => {
      ;[1,2,3].forEach(n => {
        const imp = f[`rata${n}_importo`] as number
        const scad = f[`rata${n}_scadenza`] as string
        const stato = f[`rata${n}_stato`] as string
        if (imp > 0 && scad) {
          const gg = Math.round((new Date(scad).getTime() - Date.now()) / 86400000)
          all.push({ tipo:'Pagamento', soggetto: f.fornitore_nome as string, cantiere: f.progetto_nome as string, fattura: f.numero as string, rata:n, importo:imp, scadenza:scad, gg, stato })
        }
      })
    })
    ;(fc || []).forEach((f: Record<string, unknown>) => {
      ;[1,2,3].forEach(n => {
        const imp = f[`rata${n}_importo`] as number
        const scad = f[`rata${n}_scadenza`] as string
        const stato = f[`rata${n}_stato`] as string
        if (imp > 0 && scad) {
          const gg = Math.round((new Date(scad).getTime() - Date.now()) / 86400000)
          all.push({ tipo:'Incasso', soggetto: f.cliente_nome as string, cantiere: f.progetto_nome as string, fattura: f.numero as string, rata:n, importo:imp, scadenza:scad, gg, stato })
        }
      })
    })
    all.sort((a,b) => a.gg - b.gg)
    setRighe(all)
  }

  const filtered = useMemo(() => {
    return righe.filter(r => {
      // Filtri rapidi
      if (filtro === 'scaduti' && !(r.gg < 0 && r.stato !== 'Pagata' && r.stato !== 'Incassata')) return false
      if (filtro === 'questa_settimana' && !(r.gg >= 0 && r.gg <= 7)) return false
      if (filtro === 'pagamenti' && r.tipo !== 'Pagamento') return false
      if (filtro === 'incassi' && r.tipo !== 'Incasso') return false
      if (filtro === 'chiusi' && r.stato !== 'Pagata' && r.stato !== 'Incassata') return false
      // Filtri avanzati
      if (cercaSoggetto && !r.soggetto?.toLowerCase().includes(cercaSoggetto.toLowerCase())) return false
      if (dataDA && r.scadenza < dataDA) return false
      if (dataA && r.scadenza > dataA) return false
      if (importoDA && r.importo < parseFloat(importoDA)) return false
      if (importoA && r.importo > parseFloat(importoA)) return false
      return true
    })
  }, [righe, filtro, cercaSoggetto, dataDA, dataA, importoDA, importoA])

  const haFiltriAvanzati = cercaSoggetto || dataDA || dataA || importoDA || importoA

  function resetFiltriAvanzati() {
    setCercaSoggetto(''); setDataDA(''); setDataA(''); setImportoDA(''); setImportoA('')
  }

  const totaleFiltered = filtered.filter(r => r.stato !== 'Pagata' && r.stato !== 'Incassata').reduce((s, r) => s + r.importo, 0)
  const totalePagamenti = filtered.filter(r => r.tipo === 'Pagamento' && r.stato !== 'Pagata').reduce((s, r) => s + r.importo, 0)
  const totaleIncassi = filtered.filter(r => r.tipo === 'Incasso' && r.stato !== 'Incassata').reduce((s, r) => s + r.importo, 0)
  const totaleScaduto = filtered.filter(r => r.gg < 0 && r.stato !== 'Pagata' && r.stato !== 'Incassata').reduce((s, r) => s + r.importo, 0)

  const badge = (r: RigaScadenza) => {
    if (r.stato === 'Pagata' || r.stato === 'Incassata') return <span className="badge badge-green">{r.stato}</span>
    if (r.gg < 0) return <span className="badge badge-red">Scaduto {Math.abs(r.gg)} gg fa</span>
    if (r.gg <= 7) return <span className="badge badge-amber">Entro {r.gg} gg</span>
    return <span className="badge badge-blue">{r.gg} gg</span>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Scadenzario</h1>
        </div>

        {/* Filtri rapidi */}
        <div className="flex gap-2 flex-wrap mb-4">
          {[
            {key:'tutti', label:'Tutti'},
            {key:'scaduti', label:'🔴 Scaduti'},
            {key:'questa_settimana', label:'⚡ Entro 7 gg'},
            {key:'pagamenti', label:'📄 Pagamenti'},
            {key:'incassi', label:'🧾 Incassi'},
            {key:'chiusi', label:'✓ Chiusi'},
          ].map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className={`btn btn-sm ${filtro === f.key ? 'btn-primary' : ''}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Filtri avanzati */}
        <div className="card mb-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="label">🔍 Cerca soggetto</label>
              <input className="input" placeholder="Fornitore o cliente..." value={cercaSoggetto}
                onChange={e => setCercaSoggetto(e.target.value)} />
            </div>
            <div>
              <label className="label">Scadenza dal</label>
              <input className="input" type="date" value={dataDA} onChange={e => setDataDA(e.target.value)} />
            </div>
            <div>
              <label className="label">Scadenza al</label>
              <input className="input" type="date" value={dataA} onChange={e => setDataA(e.target.value)} />
            </div>
            <div>
              <label className="label">Importo da (€)</label>
              <input className="input" type="number" placeholder="0" value={importoDA} onChange={e => setImportoDA(e.target.value)} />
            </div>
          </div>
          {haFiltriAvanzati && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">{filtered.length} righe su {righe.length}</span>
              <button onClick={resetFiltriAvanzati} className="text-xs text-blue-600 hover:underline">× Azzera filtri</button>
            </div>
          )}
        </div>

        {/* KPI sommario */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-red-50 rounded-xl p-3 border border-red-100">
            <p className="text-xs text-red-600 mb-1">⚠️ Scaduto da pagare</p>
            <p className="text-lg font-bold text-red-800">{euro(totaleScaduto)}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
            <p className="text-xs text-amber-600 mb-1">📄 Da pagare</p>
            <p className="text-lg font-bold text-amber-800">{euro(totalePagamenti)}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
            <p className="text-xs text-blue-600 mb-1">🧾 Da incassare</p>
            <p className="text-lg font-bold text-blue-800">{euro(totaleIncassi)}</p>
          </div>
        </div>

        {/* Tabella */}
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">{filtered.length} scadenze</span>
            {filtered.length > 0 && (
              <span className="text-xs text-gray-400">Totale aperto: <strong className="text-gray-700">{euro(totaleFiltered)}</strong></span>
            )}
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>Tipo</th><th>Soggetto</th><th>Cantiere</th><th>Fattura</th>
                <th>Rata</th><th>Importo</th><th>Scadenza</th><th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-8">
                  Nessuna scadenza per questo filtro.
                </td></tr>
              ) : filtered.map((r, i) => (
                <tr key={i} className={r.gg < 0 && r.stato !== 'Pagata' && r.stato !== 'Incassata' ? 'bg-red-50' : ''}>
                  <td><span className={`badge ${r.tipo === 'Pagamento' ? 'badge-amber' : 'badge-blue'}`}>{r.tipo}</span></td>
                  <td className="font-medium text-sm">{r.soggetto}</td>
                  <td className="text-xs text-gray-500">{r.cantiere || '—'}</td>
                  <td className="text-xs">{r.fattura}</td>
                  <td className="text-xs text-center">{r.rata}</td>
                  <td className="font-medium text-sm">{euro(r.importo)}</td>
                  <td className="text-xs">{new Date(r.scadenza).toLocaleDateString('it-IT')}</td>
                  <td>{badge(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
