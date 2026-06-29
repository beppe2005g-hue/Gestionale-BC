'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const euro = (n: number) => '€ ' + Math.round(n).toLocaleString('it-IT')

// Stessa mappatura usata in Costi Cantiere: le macro_categoria merceologiche dei DDT
// confluiscono nelle categorie di costi_cantiere, per avere un'unica composizione coerente.
const MAPPA_CATEGORIA_DDT: Record<string, string> = {
  'Cementi': 'Materiali', 'Laterizi': 'Materiali', 'Ferro e Acciaio': 'Materiali',
  'Legno': 'Materiali', 'Isolanti': 'Materiali', 'Impermeabilizzanti': 'Materiali',
  'Inerti e Calcestruzzo': 'Materiali', 'Impianti': 'Attrezzatura',
  'Attrezzatura': 'Attrezzatura', 'Noli': 'Noli mezzi', 'Trasporti': 'Trasporti', 'Altro': 'Altro',
}
function mappaCategoriaDdt(macroCategoria: string): string {
  return MAPPA_CATEGORIA_DDT[macroCategoria] || 'Materiali'
}

const CAT_COLORS: Record<string, string> = {
  'Ore Operai': '#0f766e', 'Materiali': '#1d4ed8', 'Noli mezzi': '#7c3aed',
  'Manodopera esterna': '#0891b2', 'Subappalto': '#b45309', 'Trasporti': '#059669',
  'Attrezzatura': '#dc2626', 'Smaltimento': '#9333ea', 'Altro': '#6b7280', 'Personalizzato': '#d97706',
}

export default function Dashboard() {
  const [kpi, setKpi] = useState({
    ricavi: 0, costi: 0, margine: 0, ddt_aperti: 0, da_pagare_15: 0, da_incassare_15: 0
  })
  const [scadenze, setScadenze] = useState<any[]>([])
  const [cantieri, setCantieri] = useState<any[]>([])
  const [costiTorta, setCostiTorta] = useState<any[]>([])
  const [mensile, setMensile] = useState<any[]>([])

  useEffect(() => {
    loadDashboard()
    window.addEventListener('gestionale:refresh', loadDashboard)
    return () => window.removeEventListener('gestionale:refresh', loadDashboard)
  }, [])

  async function loadDashboard() {
    const oggi = new Date().toISOString().split('T')[0]
    const annoCorrente = new Date().getFullYear()

    // ── Dati grezzi da tutte le fonti coinvolte nei calcoli di costo/ricavo ──
    const fra15gg = new Date()
    fra15gg.setDate(fra15gg.getDate() + 15)
    const fra15str = fra15gg.toISOString().split('T')[0]

    const [
      { data: ff }, { data: ddt }, { data: sal },
      { data: costiManuali }, { data: ddtVoci }, { data: fc },
    ] = await Promise.all([
      supabase.from('fatture_fornitori').select('rata1_importo,rata1_stato,rata1_scadenza,rata2_importo,rata2_stato,rata2_scadenza,rata3_importo,rata3_stato,rata3_scadenza,tipo'),
      supabase.from('ddt').select('progetto_id,importo,stato,data'),
      supabase.from('sal_cantiere').select('progetto_id,importo_lavori,data'),
      supabase.from('costi_cantiere').select('progetto_id,importo,categoria,data'),
      supabase.from('ddt_voci').select('macro_categoria,importo_totale,data_ddt'),
      supabase.from('fatture_clienti').select('rata1_importo,rata1_stato,rata1_scadenza,rata2_importo,rata2_stato,rata2_scadenza,tipo'),
    ])

    // Ricavi YTD = SAL maturati nell'anno corrente
    const ricavi = (sal || [])
      .filter((s: any) => s.data?.startsWith(String(annoCorrente)))
      .reduce((s: number, r: any) => s + (r.importo_lavori || 0), 0)

    // Costi YTD = DDT + costi manuali (fatture fornitori ESCLUSE: doppio conteggio con DDT)
    const costiDDT = (ddt || [])
      .filter((d: any) => d.data?.startsWith(String(annoCorrente)))
      .reduce((s: number, d: any) => s + (d.importo || 0), 0)
    const costiManualiYTD = (costiManuali || [])
      .filter((c: any) => c.data?.startsWith(String(annoCorrente)))
      .reduce((s: number, c: any) => s + (c.importo || 0), 0)
    const costi = costiDDT + costiManualiYTD

    const ddtAperti = (ddt || []).filter((d: any) => d.stato === 'Da Fatturare').reduce((s: number, d: any) => s + (d.importo || 0), 0)

    // ── Fatture da PAGARE entro 15gg (scadute incluse) ──
    // Esclude NC (tipo = 'Nota di credito')
    let daPagare15 = 0
    ;(ff || []).filter((f: any) => f.tipo !== 'Nota di credito').forEach((f: any) => {
      if (f.rata1_stato === 'Da Pagare' && f.rata1_scadenza && f.rata1_scadenza <= fra15str) daPagare15 += f.rata1_importo || 0
      if (f.rata2_stato === 'Da Pagare' && f.rata2_scadenza && f.rata2_scadenza <= fra15str) daPagare15 += f.rata2_importo || 0
      if (f.rata3_stato === 'Da Pagare' && f.rata3_scadenza && f.rata3_scadenza <= fra15str) daPagare15 += f.rata3_importo || 0
    })

    // ── Fatture da INCASSARE entro 15gg (scadute incluse) ──
    // Esclude NC (tipo = 'Nota di credito')
    let daIncassare15 = 0
    ;(fc || []).filter((f: any) => f.tipo !== 'Nota di credito').forEach((f: any) => {
      if (f.rata1_stato !== 'Incassata' && f.rata1_scadenza && f.rata1_scadenza <= fra15str) daIncassare15 += f.rata1_importo || 0
      if (f.rata2_stato !== 'Incassata' && f.rata2_scadenza && f.rata2_scadenza <= fra15str) daIncassare15 += f.rata2_importo || 0
    })

    setKpi({ ricavi, costi, margine: ricavi - costi, ddt_aperti: ddtAperti, da_pagare_15: daPagare15, da_incassare_15: daIncassare15 })

    // ── Cantieri con margine: DDT + costi manuali (no fatture fornitori) ──
    const { data: proj } = await supabase.from('progetti').select('id,nome,valore_contratto,stato').eq('stato', 'In Corso').limit(8)
    if (proj) {
      const cantieriData = proj.map((p: any) => {
        const ricP = (sal || []).filter((s: any) => s.progetto_id === p.id).reduce((s: number, x: any) => s + (x.importo_lavori || 0), 0)
        const cosDDTp = (ddt || []).filter((d: any) => d.progetto_id === p.id).reduce((s: number, d: any) => s + (d.importo || 0), 0)
        const cosManualip = (costiManuali || []).filter((c: any) => c.progetto_id === p.id).reduce((s: number, c: any) => s + (c.importo || 0), 0)
        const cosP = cosDDTp + cosManualip
        const marg = ricP > 0 ? Math.round((ricP - cosP) / ricP * 100) : 0
        return { nome: p.nome.substring(0, 18), margine: marg, ricavi: ricP, costi: cosP }
      }).sort((a: any, b: any) => b.margine - a.margine)
      setCantieri(cantieriData)
    }

    // ── Composizione costi reale: costi manuali per categoria + voci DDT mappate sulle stesse categorie ──
    const totaliCategoria: Record<string, number> = {}
    ;(costiManuali || []).forEach((c: any) => {
      const cat = c.categoria || 'Altro'
      totaliCategoria[cat] = (totaliCategoria[cat] || 0) + (c.importo || 0)
    })
    ;(ddtVoci || []).forEach((v: any) => {
      const cat = mappaCategoriaDdt(v.macro_categoria)
      totaliCategoria[cat] = (totaliCategoria[cat] || 0) + (v.importo_totale || 0)
    })
    const totaleComposizione = Object.values(totaliCategoria).reduce((s, v) => s + v, 0)
    const torta = Object.entries(totaliCategoria)
      .filter(([, v]) => v > 0)
      .map(([name, v]) => ({ name, value: totaleComposizione > 0 ? Math.round(v / totaleComposizione * 100) : 0, importo: v }))
      .sort((a, b) => b.importo - a.importo)
    setCostiTorta(torta)

    // ── Scadenze prossime (invariato: riguarda solo i pagamenti fornitori) ──
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

    // ── Dati mensili ricavi/costi: ricavi da SAL, costi da fatture_fornitori (come prima per i pagamenti) ──
    const mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
    const mensileData = mesi.map((m, i) => {
      const meseStr = `${annoCorrente}-${String(i+1).padStart(2,'0')}`
      const ric = (sal || []).filter((s: any) => s.data?.startsWith(meseStr))
        .reduce((s: number, x: any) => s + (x.importo_lavori || 0), 0)
      const cosDDTmese = (ddt || []).filter((d: any) => d.data?.startsWith(meseStr))
        .reduce((s: number, d: any) => s + (d.importo || 0), 0)
      const cosManualiMese = (costiManuali || []).filter((c: any) => c.data?.startsWith(meseStr))
        .reduce((s: number, c: any) => s + (c.importo || 0), 0)
      const cos = cosDDTmese + cosManualiMese
      return { mese: m, ricavi: ric, costi: cos, margine: ric - cos }
    })
    setMensile(mensileData)
  }

  const COLORS = ['#1d4ed8', '#b45309', '#0f766e', '#7c3aed', '#059669', '#dc2626', '#9333ea', '#0891b2', '#6b7280', '#d97706']

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
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Da incassare (15gg)', value: euro(kpi.da_incassare_15), color: kpi.da_incassare_15 > 0 ? 'text-blue-700' : 'text-gray-400', sub: 'Scadute + prossime 15 giorni' },
            { label: 'Da pagare (15gg)', value: euro(kpi.da_pagare_15), color: kpi.da_pagare_15 > 0 ? 'text-red-700' : 'text-gray-400', sub: 'Scadute + prossime 15 giorni' },
            { label: 'Ricavi YTD (SAL)', value: euro(kpi.ricavi), color: 'text-green-700', sub: 'SAL maturati anno corrente' },
            { label: 'Costi YTD', value: euro(kpi.costi), color: 'text-red-700', sub: 'DDT + costi manuali' },
            { label: 'Margine totale', value: euro(kpi.margine), color: kpi.margine >= 0 ? 'text-green-700' : 'text-red-700', sub: kpi.ricavi > 0 ? `${Math.round((kpi.margine / kpi.ricavi) * 100)}% sui ricavi` : '—' },
            { label: 'DDT aperti', value: euro(kpi.ddt_aperti), color: 'text-amber-700', sub: 'Da fatturare ai fornitori' },
          ].map(k => (
            <div key={k.label} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">{k.label}</p>
              <p className={`text-lg font-semibold ${k.color}`}>{k.value}</p>
              {k.sub && <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>}
            </div>
          ))}
        </div>

        {/* Grafici riga 1 */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="card">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Ricavi (SAL) / Costi / Margine mensile</h3>
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
            <h3 className="text-sm font-medium text-gray-600 mb-3">Composizione costi (categorie reali)</h3>
            {costiTorta.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">Nessun costo registrato ancora.</p>
            ) : (
              <div className="flex gap-4 items-center">
                <PieChart width={160} height={160}>
                  <Pie data={costiTorta} cx={75} cy={75} innerRadius={45} outerRadius={70}
                    dataKey="value" paddingAngle={2}>
                    {costiTorta.map((c, i) => <Cell key={c.name} fill={CAT_COLORS[c.name] || COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string, props: any) => [`${v}% (${euro(props.payload.importo)})`, props.payload.name]} />
                </PieChart>
                <div className="flex flex-col gap-2">
                  {costiTorta.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: CAT_COLORS[c.name] || COLORS[i % COLORS.length] }}></div>
                      <span className="text-gray-600">{c.name}</span>
                      <span className="font-medium text-gray-900 ml-auto">{c.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
