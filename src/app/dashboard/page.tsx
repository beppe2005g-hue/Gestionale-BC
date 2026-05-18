'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const euro = (n: number) => '€ ' + Math.round(n).toLocaleString('it-IT')

export default function Dashboard() {
  const [kpi, setKpi] = useState({
    saldo: 0, ricavi: 0, costi: 0, margine: 0, ddt_aperti: 0, rate_scadute: 0
  })
  const [scadenze, setScadenze] = useState<any[]>([])
  const [cantieri, setCantieri] = useState<any[]>([])
  const [costiTorta, setCostiTorta] = useState<any[]>([])
  const [mensile, setMensile] = useState<any[]>([])

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    const oggi = new Date().toISOString().split('T')[0]

    // KPI
    const [{ data: fc }, { data: ff }, { data: ddt }, { data: cf }] = await Promise.all([
      supabase.from('fatture_clienti').select('imponibile,rata1_importo,rata1_stato,rata2_importo,rata2_stato,rata3_importo,rata3_stato,rata1_scadenza,rata2_scadenza,rata3_scadenza'),
      supabase.from('fatture_fornitori').select('imponibile,rata1_importo,rata1_stato,rata2_importo,rata2_stato,rata3_importo,rata3_stato,rata1_scadenza,rata2_scadenza,rata3_scadenza'),
      supabase.from('ddt').select('importo,stato'),
      supabase.from('cash_flow').select('entrata,uscita'),
    ])

    const ricavi = (fc || []).reduce((s: number, r: any) => s + (r.imponibile || 0), 0)
    const costi = (ff || []).reduce((s: number, r: any) => s + (r.imponibile || 0), 0)
    const ddtAperti = (ddt || []).filter((d: any) => d.stato === 'Da Fatturare').reduce((s: number, d: any) => s + (d.importo || 0), 0)
    const saldo = (cf || []).reduce((s: number, m: any) => s + (m.entrata || 0) - (m.uscita || 0), 0)

    let rateScadute = 0
    ;(ff || []).forEach((f: any) => {
      if (f.rata1_stato === 'Da Pagare' && f.rata1_scadenza < oggi) rateScadute += f.rata1_importo || 0
      if (f.rata2_stato === 'Da Pagare' && f.rata2_scadenza < oggi) rateScadute += f.rata2_importo || 0
      if (f.rata3_stato === 'Da Pagare' && f.rata3_scadenza < oggi) rateScadute += f.rata3_importo || 0
    })

    setKpi({ saldo, ricavi, costi, margine: ricavi - costi, ddt_aperti: ddtAperti, rate_scadute: rateScadute })

    // Cantieri con margine
    const { data: proj } = await supabase.from('progetti').select('id,nome,valore_contratto,stato').eq('stato', 'In Corso').limit(8)
    if (proj) {
      const { data: ffProj } = await supabase.from('fatture_fornitori').select('progetto_id,imponibile')
      const { data: fcProj } = await supabase.from('fatture_clienti').select('progetto_id,imponibile')
      const cantieriData = proj.map((p: any) => {
        const ricP = (fcProj || []).filter((f: any) => f.progetto_id === p.id).reduce((s: number, f: any) => s + (f.imponibile || 0), 0)
        const cosP = (ffProj || []).filter((f: any) => f.progetto_id === p.id).reduce((s: number, f: any) => s + (f.imponibile || 0), 0)
        const marg = ricP > 0 ? Math.round((ricP - cosP) / ricP * 100) : 0
        return { nome: p.nome.substring(0, 18), margine: marg, ricavi: ricP, costi: cosP }
      }).sort((a: any, b: any) => b.margine - a.margine)
      setCantieri(cantieriData)
    }

    // Torta costi (mock categorizzato - in prod viene dalle categorie fornitori)
    setCostiTorta([
      { name: 'Materiali', value: 42 },
      { name: 'Subappalti', value: 28 },
      { name: 'Manodopera', value: 18 },
      { name: 'Noli', value: 8 },
      { name: 'Altro', value: 4 },
    ])

    // Scadenze prossime
    const scad: any[] = []
    ;(ff || []).slice(0, 20).forEach((f: any) => {
      ;[
        { imp: f.rata1_importo, scad: f.rata1_scadenza, stato: f.rata1_stato },
        { imp: f.rata2_importo, scad: f.rata2_scadenza, stato: f.rata2_stato },
        { imp: f.rata3_importo, scad: f.rata3_scadenza, stato: f.rata3_stato },
      ].forEach(r => {
        if (r.imp > 0 && r.scad && r.stato !== 'Pagata') {
          const gg = Math.round((new Date(r.scad).getTime() - Date.now()) / 86400000)
          scad.push({ tipo: 'Pagamento', importo: r.imp, scadenza: r.scad, gg, stato: r.stato })
        }
      })
    })
    scad.sort((a, b) => a.gg - b.gg)
    setScadenze(scad.slice(0, 6))

    // Dati mensili ricavi/costi
    const mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
    const anno = new Date().getFullYear()
    const mensileData = mesi.map((m, i) => {
      const ric = (fc || []).filter((f: any) => f.rata1_scadenza?.startsWith(`${anno}-${String(i+1).padStart(2,'0')}`))
        .reduce((s: number, f: any) => s + (f.rata1_importo || 0), 0)
      const cos = (ff || []).filter((f: any) => f.rata1_scadenza?.startsWith(`${anno}-${String(i+1).padStart(2,'0')}`))
        .reduce((s: number, f: any) => s + (f.rata1_importo || 0), 0)
      return { mese: m, ricavi: ric, costi: cos, margine: ric - cos }
    })
    setMensile(mensileData)
  }

  const COLORS = ['#A32D2D','#854F0B','#185FA5','#5F5E5A','#B4B2A9']

  const badgeScadenza = (gg: number) => {
    if (gg < 0) return <span className="badge badge-red">Scaduto</span>
    if (gg <= 7) return <span className="badge badge-amber">{gg} gg</span>
    return <span className="badge badge-blue">{gg} gg</span>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <span className="text-xs text-gray-500">
            {new Date().toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </span>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Saldo banca', value: euro(kpi.saldo), color: 'text-blue-700' },
            { label: 'Ricavi YTD', value: euro(kpi.ricavi), color: 'text-green-700' },
            { label: 'Costi YTD', value: euro(kpi.costi), color: 'text-red-700' },
            { label: 'Margine', value: euro(kpi.margine), color: kpi.margine >= 0 ? 'text-green-700' : 'text-red-700' },
            { label: 'DDT aperti', value: euro(kpi.ddt_aperti), color: 'text-amber-700' },
            { label: 'Rate scadute', value: euro(kpi.rate_scadute), color: 'text-red-700' },
          ].map(k => (
            <div key={k.label} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">{k.label}</p>
              <p className={`text-lg font-semibold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Grafici riga 1 */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="card">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Ricavi / Costi / Margine mensile</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mensile} margin={{ top: 0, right: 0, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'k' : String(v)} />
                <Tooltip formatter={(v: number) => euro(v)} />
                <Bar dataKey="ricavi" name="Ricavi" fill="#3B6D11" radius={[2,2,0,0]} />
                <Bar dataKey="costi" name="Costi" fill="#A32D2D" radius={[2,2,0,0]} />
                <Bar dataKey="margine" name="Margine" fill="#185FA5" radius={[2,2,0,0]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Composizione costi</h3>
            <div className="flex gap-4 items-center">
              <PieChart width={160} height={160}>
                <Pie data={costiTorta} cx={75} cy={75} innerRadius={45} outerRadius={70}
                  dataKey="value" paddingAngle={2}>
                  {costiTorta.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => v + '%'} />
              </PieChart>
              <div className="flex flex-col gap-2">
                {costiTorta.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: COLORS[i] }}></div>
                    <span className="text-gray-600">{c.name}</span>
                    <span className="font-medium text-gray-900 ml-auto">{c.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Grafici riga 2 */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="card">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Margine % per cantiere</h3>
            {cantieri.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nessun cantiere attivo</p>
            ) : (
              <div className="space-y-2">
                {cantieri.map((c: any) => (
                  <div key={c.nome} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-28 flex-shrink-0 truncate">{c.nome}</span>
                    <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
                      <div className="h-full flex items-center px-2 text-xs font-medium text-white"
                        style={{
                          width: `${Math.max(c.margine, 3)}%`,
                          background: c.margine >= 20 ? '#3B6D11' : c.margine >= 10 ? '#BA7517' : '#A32D2D'
                        }}>
                        {c.margine}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Scadenze urgenti</h3>
            {scadenze.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nessuna scadenza imminente</p>
            ) : (
              <table className="table-base">
                <thead><tr><th>Tipo</th><th>Importo</th><th>Scadenza</th><th>Stato</th></tr></thead>
                <tbody>
                  {scadenze.map((s, i) => (
                    <tr key={i}>
                      <td className="text-xs">{s.tipo}</td>
                      <td className="font-medium text-xs">{euro(s.importo)}</td>
                      <td className="text-xs text-gray-500">{new Date(s.scadenza).toLocaleDateString('it-IT')}</td>
                      <td>{badgeScadenza(s.gg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
