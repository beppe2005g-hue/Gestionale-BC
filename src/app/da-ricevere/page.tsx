'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
  const [ddtFornitore, setDdtFornitore] = useState<any[]>([])
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    // DDT aperti
    const { data: aperti } = await supabase.from('ddt').select('*')
      .eq('stato', 'Da Fatturare').order('data', { ascending: true })
    if (aperti) {
      const mappa: Record<string, any> = {}
      aperti.forEach(d => {
        if (!mappa[d.fornitore_nome]) mappa[d.fornitore_nome] = { fornitore: d.fornitore_nome, n: 0, totale: 0, ddt: [] }
        mappa[d.fornitore_nome].n++
        mappa[d.fornitore_nome].totale += d.importo
        mappa[d.fornitore_nome].ddt.push(d)
      })
      setGruppi(Object.values(mappa).sort((a, b) => b.totale - a.totale))
    }

    // Fatture chiuse con DDT abbinati — mostra SOLO quelle che hanno almeno un DDT
    const { data: ff } = await supabase.from('fatture_fornitori').select('*').order('data', { ascending: false })
    if (ff) {
      const arricchite = await Promise.all(ff.map(async (f: any) => {
        const { data: ddtAbbinati } = await supabase.from('ddt')
          .select('*').eq('fattura_abbinata', f.numero).order('data', { ascending: true })
        return { ...f, ddt_abbinati: ddtAbbinati || [] }
      }))
      // Filtra: mostra solo fatture con almeno un DDT abbinato
      setFattureChiuse(arricchite.filter(f => f.ddt_abbinati.length > 0))
    }
  }

  function apriAbbinamento(fornitore: string) {
    setFornSel(fornitore)
    const g = gruppi.find(g => g.fornitore === fornitore)
    setDdtFornitore(g ? g.ddt : [])
    setSelezionati(new Set())
    setNFattura(''); setImpFattura(''); setScadenza('')
    setModal(true)
  }

  function toggleSel(id: string) {
    setSelezionati(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
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
    await supabase.from('ddt').update({ stato: 'Fatturato', fattura_abbinata: nFattura }).in('id', Array.from(selezionati))
    await supabase.from('fatture_fornitori').insert({
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
    setModal(false)
    load()
    alert(`✅ ${selezionati.size} bolle abbinate a ${nFattura}.`)
    setLoading(false)
  }

  const statoRataBadge = (f: any) => {
    const r1 = f.rata1_stato; const r2 = f.rata2_stato; const r3 = f.rata3_stato
    if (r1 === 'Pagata' && (!r2 || r2 === 'Pagata') && (!r3 || r3 === 'Pagata'))
      return <span className="badge badge-green">Pagata</span>
    if (r1 === 'Da Pagare' || r2 === 'Da Pagare' || r3 === 'Da Pagare')
      return <span className="badge badge-amber">Da Pagare</span>
    return <span className="badge badge-gray">—</span>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Fatture da ricevere</h1>
          {tab === 'aperte' && (
            <span className="text-xs text-gray-500">DDT aperti raggruppati per fornitore</span>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('aperte')}
            className={`btn ${tab === 'aperte' ? 'btn-primary' : ''}`}>
            Da fatturare ({gruppi.length} fornitori)
          </button>
          <button onClick={() => setTab('fatturate')}
            className={`btn ${tab === 'fatturate' ? 'btn-primary' : ''}`}>
            Storico fatturate ({fattureChiuse.length})
          </button>
        </div>

        {/* TAB APERTE */}
        {tab === 'aperte' && (
          gruppi.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              Tutti i DDT sono stati fatturati.
            </div>
          ) : (
            <div className="space-y-2">
              {gruppi.map(g => (
                <div key={g.fornitore} className="card p-0 overflow-hidden">
                  <div className="flex items-center gap-4 px-4 py-3 bg-gray-900 cursor-pointer"
                    onClick={() => setEspanso(espanso === g.fornitore ? null : g.fornitore)}>
                    <span className="text-white font-medium text-sm flex-1">{g.fornitore}</span>
                    <span className="text-gray-300 text-xs">{g.n} DDT aperti</span>
                    <span className="text-white font-semibold text-sm">{euro(g.totale)}</span>
                    <span className="text-gray-400 text-xs">(+IVA: {euro(g.totale * 1.22)})</span>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg ml-2"
                      onClick={e => { e.stopPropagation(); apriAbbinamento(g.fornitore) }}>
                      Abbina fattura
                    </button>
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
          )
        )}

        {/* TAB FATTURATE - STORICO */}
        {tab === 'fatturate' && (
          fattureChiuse.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              Nessuna fattura ancora registrata.
            </div>
          ) : (
            <div className="space-y-2">
              {fattureChiuse.map(f => (
                <div key={f.id} className="card p-0 overflow-hidden">
                  {/* Riga riepilogo fattura */}
                  <div className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => setEspansoFatt(espansoFatt === f.id ? null : f.id)}>
                    <div className="flex-1">
                      <span className="font-medium text-sm">{f.fornitore_nome}</span>
                      <span className="text-gray-400 text-xs ml-2">{f.numero}</span>
                    </div>
                    <span className="text-xs text-gray-500">{f.data ? new Date(f.data).toLocaleDateString('it-IT') : '—'}</span>
                    <span className="font-semibold text-sm">{euro(f.imponibile)}</span>
                    <span className="text-xs text-gray-400">(+IVA: {euro(f.totale)})</span>
                    {statoRataBadge(f)}
                    <span className="text-gray-400 text-sm ml-2">{espansoFatt === f.id ? '▲' : '▼'}</span>
                  </div>

                  {/* DDT abbinati espandibili */}
                  {espansoFatt === f.id && (
                    <div className="border-t border-gray-100 bg-blue-50">
                      <div className="px-4 py-2 text-xs font-medium text-blue-700">
                        DDT abbinati a questa fattura ({f.ddt_abbinati.length})
                      </div>
                      {f.ddt_abbinati.length === 0 ? (
                        <div className="px-4 pb-3 text-xs text-gray-400">Nessun DDT abbinato trovato.</div>
                      ) : (
                        <table className="table-base">
                          <thead><tr><th>Data</th><th>N° DDT</th><th>Cantiere</th><th>Descrizione</th><th>Importo</th></tr></thead>
                          <tbody>
                            {f.ddt_abbinati.map((d: any) => (
                              <tr key={d.id}>
                                <td className="text-xs">{new Date(d.data).toLocaleDateString('it-IT')}</td>
                                <td className="font-medium text-xs">{d.numero}</td>
                                <td className="text-xs text-gray-600">{d.progetto_nome || '—'}</td>
                                <td className="text-xs text-gray-500">{d.descrizione || '—'}</td>
                                <td className="font-medium text-sm">{euro(d.importo)}</td>
                              </tr>
                            ))}
                            <tr className="bg-blue-100">
                              <td colSpan={4} className="text-xs font-medium text-right text-blue-700">Totale DDT</td>
                              <td className="font-bold text-sm text-blue-700">
                                {euro(f.ddt_abbinati.reduce((s: number, d: any) => s + d.importo, 0))}
                              </td>
                            </tr>
                            <tr className="bg-blue-100">
                              <td colSpan={4} className="text-xs font-medium text-right text-blue-700">Imponibile fattura</td>
                              <td className="font-bold text-sm text-blue-700">{euro(f.imponibile)}</td>
                            </tr>
                            <tr className={`${Math.abs(f.imponibile - f.ddt_abbinati.reduce((s: number, d: any) => s + d.importo, 0)) < 0.02 ? 'bg-green-50' : 'bg-red-50'}`}>
                              <td colSpan={4} className="text-xs font-medium text-right">Scostamento</td>
                              <td className={`font-bold text-sm ${Math.abs(f.imponibile - f.ddt_abbinati.reduce((s: number, d: any) => s + d.importo, 0)) < 0.02 ? 'text-green-700' : 'text-red-700'}`}>
                                {euro(f.imponibile - f.ddt_abbinati.reduce((s: number, d: any) => s + d.importo, 0))}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </main>

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
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><label className="label">N° Fattura ricevuta *</label>
                <input className="input" placeholder="es. FF/2026/018" value={nFattura} onChange={e => setNFattura(e.target.value)} /></div>
              <div><label className="label">Imponibile fattura (€) *</label>
                <input className="input" type="number" step="0.01" placeholder="0.00" value={impFattura} onChange={e => setImpFattura(e.target.value)} /></div>
              <div><label className="label">Scadenza pagamento</label>
                <input className="input" type="date" value={scadenza} onChange={e => setScadenza(e.target.value)} /></div>
            </div>
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Spunta i DDT coperti da questa fattura:</p>
              <div className="bg-blue-50 rounded-lg overflow-hidden">
                <table className="table-base">
                  <thead><tr><th style={{width:36}}></th><th>Data</th><th>N° DDT</th><th>Cantiere</th><th>Importo</th></tr></thead>
                  <tbody>
                    {ddtFornitore.map(d => (
                      <tr key={d.id} className={`cursor-pointer ${selezionati.has(d.id) ? 'bg-green-50' : ''}`}
                        onClick={() => toggleSel(d.id)}>
                        <td><input type="checkbox" checked={selezionati.has(d.id)} onChange={() => toggleSel(d.id)} className="rounded" /></td>
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
            <div className={`rounded-lg p-3 mb-4 text-sm font-medium ${
              selezionati.size === 0 ? 'bg-gray-50 text-gray-500' :
              scostOk ? 'bg-green-50 text-green-800 border border-green-200' :
              scostamento > 0 ? 'bg-red-50 text-red-800 border border-red-200' :
              'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              {selezionati.size === 0 ? 'Seleziona i DDT coperti' :
               !impFattura ? 'Inserisci l\'importo della fattura' :
               scostOk ? `✅ Corrispondente — DDT: ${euro(totSel)} | Fattura: ${euro(parseFloat(impFattura))}` :
               scostamento > 0 ? `🔴 Fattura supera DDT di ${euro(scostamento)}` :
               `🟡 Fattura inferiore ai DDT di ${euro(Math.abs(scostamento))}`}
            </div>
            <div className="flex gap-2 justify-between items-center">
              <p className="text-xs text-gray-400">{selezionati.size} DDT · Totale: {euro(totSel)}</p>
              <div className="flex gap-2">
                <button className="btn" onClick={() => setModal(false)}>Annulla</button>
                <button className="btn btn-success" onClick={eseguiAbbinamento} disabled={loading}>
                  {loading ? 'Elaborazione...' : `Abbina ${selezionati.size} DDT`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
