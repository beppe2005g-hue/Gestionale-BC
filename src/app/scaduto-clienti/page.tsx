'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const euroShort = (n: number) => (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const oggi = new Date()
oggi.setHours(0, 0, 0, 0)

function isScaduta(data: string | null): boolean {
  if (!data) return false
  return new Date(data) < oggi
}

function meseDa(data: string | null): string {
  if (!data) return 'Senza scadenza'
  const d = new Date(data)
  return d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}

function meseKey(data: string | null): string {
  if (!data) return '9999-99'
  return data.substring(0, 7)
}

export default function ScadutoClienti() {
  const [fatture, setFatture] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [mostraScadute, setMostraScadute] = useState<'tutte' | 'scadute' | 'future'>('tutte')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('fatture_clienti').select('*').order('cliente_nome').order('data')
    setFatture(data || [])
    setLoading(false)
  }

  // Costruisce le righe rate non incassate
  const rateAperte = useMemo(() => {
    const righe: any[] = []
    fatture.forEach(f => {
      ;[1, 2, 3].forEach(n => {
        const imp = f[`rata${n}_importo`]
        const stato = f[`rata${n}_stato`]
        const scad = f[`rata${n}_scadenza`]
        if (imp > 0 && stato !== 'Incassata') {
          righe.push({
            fattura_id: f.id,
            numero: f.numero,
            data_fattura: f.data,
            cliente_nome: f.cliente_nome,
            progetto_nome: f.progetto_nome,
            rata: n,
            importo: imp,
            scadenza: scad,
            scaduta: isScaduta(scad),
            mese_key: meseKey(scad),
            mese_label: meseDa(scad),
          })
        }
      })
    })
    return righe
  }, [fatture])

  // Filtra
  const rateFiltrate = useMemo(() => {
    let r = rateAperte
    if (filtroCliente) r = r.filter(x => x.cliente_nome?.toLowerCase().includes(filtroCliente.toLowerCase()))
    if (mostraScadute === 'scadute') r = r.filter(x => x.scaduta)
    if (mostraScadute === 'future') r = r.filter(x => !x.scaduta)
    return r
  }, [rateAperte, filtroCliente, mostraScadute])

  // Raggruppa per cliente → mese
  const perCliente = useMemo(() => {
    const mappa: Record<string, { cliente: string, totale: number, scaduto: number, mesi: Record<string, { label: string, rate: any[], totale: number }> }> = {}
    rateFiltrate.forEach(r => {
      if (!mappa[r.cliente_nome]) {
        mappa[r.cliente_nome] = { cliente: r.cliente_nome, totale: 0, scaduto: 0, mesi: {} }
      }
      const c = mappa[r.cliente_nome]
      c.totale += r.importo
      if (r.scaduta) c.scaduto += r.importo
      if (!c.mesi[r.mese_key]) c.mesi[r.mese_key] = { label: r.mese_label, rate: [], totale: 0 }
      c.mesi[r.mese_key].rate.push(r)
      c.mesi[r.mese_key].totale += r.importo
    })
    return Object.values(mappa).sort((a, b) => a.cliente.localeCompare(b.cliente))
  }, [rateFiltrate])

  const totaleGenerale = rateFiltrate.reduce((s, r) => s + r.importo, 0)
  const totaleScaduto = rateFiltrate.filter(r => r.scaduta).reduce((s, r) => s + r.importo, 0)
  const clientiUnici = [...new Set(rateAperte.map(r => r.cliente_nome))].sort()

  function stampa() { window.print() }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4 print:hidden">
          <h1 className="text-xl font-semibold">Scaduto clienti</h1>
          <button className="btn btn-primary" onClick={stampa}>🖨️ Stampa / PDF</button>
        </div>

        {/* Filtri */}
        <div className="card mb-4 print:hidden">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-52">
              <label className="label">Filtra per cliente</label>
              <input className="input" placeholder="Nome cliente..." value={filtroCliente}
                onChange={e => setFiltroCliente(e.target.value)} />
            </div>
            <div>
              <label className="label">Mostra</label>
              <select className="input w-auto" value={mostraScadute} onChange={e => setMostraScadute(e.target.value as any)}>
                <option value="tutte">Tutte le rate aperte</option>
                <option value="scadute">Solo scadute</option>
                <option value="future">Solo future</option>
              </select>
            </div>
            {(filtroCliente || mostraScadute !== 'tutte') && (
              <button className="btn btn-sm" onClick={() => { setFiltroCliente(''); setMostraScadute('tutte') }}>× Reset</button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="card text-center py-12 text-gray-400">Caricamento...</div>
        ) : (
          <div id="report-scaduto">

            {/* Intestazione stampa */}
            <div className="mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">BC General Service</h1>
                  <h2 className="text-lg font-semibold text-gray-600 mt-1">Estratto conto — Scaduto clienti</h2>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <p>Data stampa: <strong>{new Date().toLocaleDateString('it-IT')}</strong></p>
                  <p>Totale aperto: <strong className="text-blue-800">€ {euroShort(totaleGenerale)}</strong></p>
                  <p>Di cui scaduto: <strong className="text-red-700">€ {euroShort(totaleScaduto)}</strong></p>
                </div>
              </div>

              {/* KPI */}
              <div className="grid grid-cols-3 gap-4 mt-4 print:grid-cols-3">
                <div style={{ border: '2px solid #1e40af', borderRadius: 8, padding: 16 }}>
                  <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Totale da incassare</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(totaleGenerale)}</p>
                  <p style={{ fontSize: 11, color: '#6b7280' }}>{rateFiltrate.length} rate aperte · {perCliente.length} clienti</p>
                </div>
                <div style={{ border: '2px solid #dc2626', borderRadius: 8, padding: 16 }}>
                  <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Scaduto</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>€ {euroShort(totaleScaduto)}</p>
                  <p style={{ fontSize: 11, color: '#6b7280' }}>{rateFiltrate.filter(r => r.scaduta).length} rate scadute</p>
                </div>
                <div style={{ border: '2px solid #059669', borderRadius: 8, padding: 16 }}>
                  <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>In scadenza futura</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: '#065f46' }}>€ {euroShort(totaleGenerale - totaleScaduto)}</p>
                  <p style={{ fontSize: 11, color: '#6b7280' }}>{rateFiltrate.filter(r => !r.scaduta).length} rate future</p>
                </div>
              </div>
            </div>

            {perCliente.length === 0 ? (
              <div className="card text-center py-12 text-gray-400 print:hidden">
                Nessuna rata aperta trovata.
              </div>
            ) : (
              <div className="space-y-6">
                {perCliente.map(c => (
                  <div key={c.cliente} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', pageBreakInside: 'avoid' }}>

                    {/* Header cliente */}
                    <div style={{ background: '#1e3a8a', color: 'white', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14 }}>{c.cliente}</p>
                        <p style={{ fontSize: 11, color: '#93c5fd' }}>
                          {Object.keys(c.mesi).length} scadenze · {rateFiltrate.filter(r => r.cliente_nome === c.cliente).length} rate
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24' }}>€ {euroShort(c.totale)}</p>
                        {c.scaduto > 0 && (
                          <p style={{ fontSize: 11, color: '#fca5a5' }}>🔴 Scaduto: € {euroShort(c.scaduto)}</p>
                        )}
                      </div>
                    </div>

                    {/* Mesi del cliente */}
                    {Object.entries(c.mesi)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([meseK, mese]) => {
                        const isPassato = meseK < new Date().toISOString().substring(0, 7)
                        const isMeseCorrente = meseK === new Date().toISOString().substring(0, 7)
                        return (
                          <div key={meseK}>
                            {/* Intestazione mese */}
                            <div style={{
                              background: meseK === '9999-99' ? '#f3f4f6' : isPassato ? '#fef2f2' : isMeseCorrente ? '#fffbeb' : '#f0fdf4',
                              padding: '6px 16px',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              borderTop: '1px solid #e2e8f0'
                            }}>
                              <p style={{
                                fontWeight: 600, fontSize: 12,
                                color: isPassato ? '#dc2626' : isMeseCorrente ? '#d97706' : '#065f46'
                              }}>
                                {isPassato ? '🔴 ' : isMeseCorrente ? '🟡 ' : '🟢 '}
                                {mese.label.charAt(0).toUpperCase() + mese.label.slice(1)}
                                {isPassato && ' — SCADUTO'}
                                {isMeseCorrente && ' — Mese corrente'}
                              </p>
                              <p style={{ fontWeight: 700, fontSize: 13, color: isPassato ? '#dc2626' : '#374151' }}>
                                € {euroShort(mese.totale)}
                              </p>
                            </div>

                            {/* Rate del mese */}
                            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                              <thead>
                                <tr style={{ background: '#f8faff' }}>
                                  <th style={{ padding: '5px 16px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>N° Fattura</th>
                                  <th style={{ padding: '5px 16px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>Data fattura</th>
                                  <th style={{ padding: '5px 16px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>Cantiere</th>
                                  <th style={{ padding: '5px 16px', textAlign: 'center', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>Rata</th>
                                  <th style={{ padding: '5px 16px', textAlign: 'right', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>Scadenza</th>
                                  <th style={{ padding: '5px 16px', textAlign: 'right', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>Importo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {mese.rate.map((r, idx) => (
                                  <tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ padding: '5px 16px', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: '#1e40af' }}>{r.numero}</td>
                                    <td style={{ padding: '5px 16px', borderBottom: '1px solid #f1f5f9', color: '#374151' }}>
                                      {r.data_fattura ? new Date(r.data_fattura).toLocaleDateString('it-IT') : '—'}
                                    </td>
                                    <td style={{ padding: '5px 16px', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}>{r.progetto_nome || '—'}</td>
                                    <td style={{ padding: '5px 16px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', color: '#374151' }}>{r.rata}</td>
                                    <td style={{ padding: '5px 16px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: r.scaduta ? '#dc2626' : '#374151', fontWeight: r.scaduta ? 600 : 400 }}>
                                      {r.scadenza ? new Date(r.scadenza).toLocaleDateString('it-IT') : '—'}
                                    </td>
                                    <td style={{ padding: '5px 16px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: r.scaduta ? '#dc2626' : '#1e3a8a' }}>
                                      € {euroShort(r.importo)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      })}

                    {/* Totale cliente */}
                    <div style={{ background: '#f8faff', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #1e40af' }}>
                      <span style={{ fontWeight: 600, fontSize: 12, color: '#374151' }}>Totale {c.cliente}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: '#1e3a8a' }}>€ {euroShort(c.totale)}</span>
                        {c.scaduto > 0 && c.scaduto < c.totale && (
                          <span style={{ fontSize: 11, color: '#dc2626', marginLeft: 12 }}>di cui scaduto: € {euroShort(c.scaduto)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Totale generale */}
                <div style={{ border: '3px solid #1e3a8a', borderRadius: 8, padding: '16px 20px', background: '#eff6ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 15, color: '#1e3a8a' }}>TOTALE GENERALE</p>
                    <p style={{ fontSize: 12, color: '#6b7280' }}>{perCliente.length} clienti · {rateFiltrate.length} rate aperte</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 24, fontWeight: 900, color: '#1e3a8a' }}>€ {euroShort(totaleGenerale)}</p>
                    {totaleScaduto > 0 && (
                      <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>🔴 Scaduto: € {euroShort(totaleScaduto)}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-scaduto, #report-scaduto * { visibility: visible; }
          #report-scaduto { position: fixed; top: 0; left: 0; width: 100%; padding: 20px; font-size: 11px; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
