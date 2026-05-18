'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function DaRiceverePage() {
  const [gruppi, setGruppi] = useState<any[]>([])
  const [espanso, setEspanso] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [fornSel, setFornSel] = useState('')
  const [nFattura, setNFattura] = useState('')
  const [impFattura, setImpFattura] = useState('')
  const [scadenza, setScadenza] = useState('')
  const [ddtFornitore, setDdtFornitore] = useState<any[]>([])
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('ddt').select('*')
      .eq('stato', 'Da Fatturare').order('data', { ascending: true })
    if (!data) return
    const mappa: Record<string, any> = {}
    data.forEach(d => {
      if (!mappa[d.fornitore_nome]) {
        mappa[d.fornitore_nome] = { fornitore: d.fornitore_nome, n: 0, totale: 0, ddt: [] }
      }
      mappa[d.fornitore_nome].n++
      mappa[d.fornitore_nome].totale += d.importo
      mappa[d.fornitore_nome].ddt.push(d)
    })
    setGruppi(Object.values(mappa).sort((a, b) => b.totale - a.totale))
  }

  function apriAbbinamento(fornitore: string) {
    setFornSel(fornitore)
    const g = gruppi.find(g => g.fornitore === fornitore)
    setDdtFornitore(g ? g.ddt : [])
    setSelezionati(new Set())
    setNFattura('')
    setImpFattura('')
    setScadenza('')
    setModal(true)
  }

  function toggleSel(id: string) {
    setSelezionati(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const totSel = ddtFornitore.filter(d => selezionati.has(d.id)).reduce((s, d) => s + d.importo, 0)
  const scostamento = parseFloat(impFattura || '0') - totSel
  const scostOk = Math.abs(scostamento) < 0.02 && selezionati.size > 0

  async function eseguiAbbinamento() {
    if (!nFattura || !impFattura) { alert('Inserisci N° fattura e importo'); return }
    if (selezionati.size === 0) { alert('Seleziona almeno un DDT'); return }
    setLoading(true)

    // 1. Aggiorna i DDT selezionati → Fatturato + numero fattura
    const { error: e1 } = await supabase.from('ddt')
      .update({ stato: 'Fatturato', fattura_abbinata: nFattura })
      .in('id', Array.from(selezionati))

    if (e1) { alert('Errore aggiornamento DDT: ' + e1.message); setLoading(false); return }

    // 2. Crea automaticamente la fattura fornitore
    const { error: e2 } = await supabase.from('fatture_fornitori').insert({
      data: new Date().toISOString().split('T')[0],
      numero: nFattura,
      fornitore_id: ddtFornitore[0]?.fornitore_id,
      fornitore_nome: fornSel,
      imponibile: parseFloat(impFattura),
      iva_percentuale: 22,
      rata1_importo: parseFloat(impFattura) * 1.22,
      rata1_scadenza: scadenza || null,
      rata1_stato: 'Da Pagare',
    })

    if (e2) { alert('Errore creazione fattura: ' + e2.message); setLoading(false); return }

    setModal(false)
    load()
    alert(`✅ ${selezionati.size} bolle abbinate a ${nFattura}.\nLa fattura fornitore è stata creata automaticamente in Fatture Fornitori.`)
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Fatture da ricevere</h1>
          <span className="text-xs text-gray-500">DDT aperti raggruppati per fornitore — aggiornamento automatico</span>
        </div>

        {gruppi.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            Tutti i DDT sono stati fatturati. Ottimo lavoro!
          </div>
        ) : (
          <div className="space-y-2">
            {gruppi.map(g => (
              <div key={g.fornitore} className="card p-0 overflow-hidden">
                {/* Riga riepilogo fornitore */}
                <div className="flex items-center gap-4 px-4 py-3 bg-gray-900 cursor-pointer"
                  onClick={() => setEspanso(espanso === g.fornitore ? null : g.fornitore)}>
                  <span className="text-white font-medium text-sm flex-1">{g.fornitore}</span>
                  <span className="text-gray-300 text-xs">{g.n} DDT aperti</span>
                  <span className="text-white font-semibold text-sm">{euro(g.totale)}</span>
                  <span className="text-gray-400 text-xs">(+IVA: {euro(g.totale * 1.22)})</span>
                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg ml-2"
                    onClick={e => { e.stopPropagation(); apriAbbinamento(g.fornitore) }}>
                    Abbina fattura
                  </button>
                  <span className="text-gray-400 text-sm">{espanso === g.fornitore ? '▲' : '▼'}</span>
                </div>

                {/* Dettaglio DDT espandibile */}
                {espanso === g.fornitore && (
                  <div className="border-t border-gray-100">
                    <table className="table-base">
                      <thead><tr>
                        <th>Data</th><th>N° DDT</th><th>Cantiere</th><th>Descrizione</th><th>Importo</th>
                      </tr></thead>
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
                        <tr className="bg-gray-50">
                          <td colSpan={4} className="text-xs font-medium text-right text-gray-600">Totale</td>
                          <td className="font-bold text-sm">{euro(g.totale)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal abbinamento */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Abbina fattura a DDT</h2>
                <p className="text-xs text-gray-500 mt-0.5">Fornitore: <strong>{fornSel}</strong></p>
              </div>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {/* Dati fattura */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><label className="label">N° Fattura ricevuta *</label>
                <input className="input" placeholder="es. FF/2026/018" value={nFattura}
                  onChange={e => setNFattura(e.target.value)} /></div>
              <div><label className="label">Imponibile fattura (€) *</label>
                <input className="input" type="number" step="0.01" placeholder="0.00" value={impFattura}
                  onChange={e => setImpFattura(e.target.value)} /></div>
              <div><label className="label">Scadenza pagamento</label>
                <input className="input" type="date" value={scadenza}
                  onChange={e => setScadenza(e.target.value)} /></div>
            </div>

            {/* Lista DDT con checkbox */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">
                Spunta i DDT coperti da questa fattura (ordinati per data):
              </p>
              <div className="bg-blue-50 rounded-lg overflow-hidden">
                <table className="table-base">
                  <thead><tr><th style={{width:36}}></th><th>Data</th><th>N° DDT</th><th>Cantiere</th><th>Importo</th></tr></thead>
                  <tbody>
                    {ddtFornitore.map(d => (
                      <tr key={d.id}
                        className={`cursor-pointer ${selezionati.has(d.id) ? 'bg-green-50' : ''}`}
                        onClick={() => toggleSel(d.id)}>
                        <td>
                          <input type="checkbox" checked={selezionati.has(d.id)}
                            onChange={() => toggleSel(d.id)} className="rounded" />
                        </td>
                        <td className="text-xs">{new Date(d.data).toLocaleDateString('it-IT')}</td>
                        <td className="font-medium text-xs">{d.numero}</td>
                        <td className="text-xs text-gray-600">{d.progetto_nome || '—'}</td>
                        <td className="font-medium text-sm">{euro(d.importo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Riepilogo scostamento */}
            <div className={`rounded-lg p-3 mb-4 text-sm font-medium ${
              selezionati.size === 0 ? 'bg-gray-50 text-gray-500' :
              scostOk ? 'bg-green-50 text-green-800 border border-green-200' :
              scostamento > 0 ? 'bg-red-50 text-red-800 border border-red-200' :
              'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              {selezionati.size === 0 ? 'Seleziona i DDT coperti da questa fattura' :
               !impFattura ? 'Inserisci l\'importo della fattura per vedere lo scostamento' :
               scostOk ? `✅ Corrispondente — DDT selezionati: ${euro(totSel)} | Fattura: ${euro(parseFloat(impFattura))}` :
               scostamento > 0 ? `🔴 Fattura supera i DDT di ${euro(scostamento)} — DDT: ${euro(totSel)} | Fattura: ${euro(parseFloat(impFattura))}` :
               `🟡 Fattura inferiore ai DDT di ${euro(Math.abs(scostamento))} — DDT: ${euro(totSel)} | Fattura: ${euro(parseFloat(impFattura))}`}
            </div>

            <div className="flex gap-2 justify-between items-center">
              <p className="text-xs text-gray-400">
                {selezionati.size} DDT selezionati · Totale: {euro(totSel)}
              </p>
              <div className="flex gap-2">
                <button className="btn" onClick={() => setModal(false)}>Annulla</button>
                <button className="btn btn-success" onClick={eseguiAbbinamento} disabled={loading}>
                  {loading ? 'Elaborazione...' : `Abbina ${selezionati.size} DDT e crea fattura`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
