'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + Math.round(n || 0).toLocaleString('it-IT')
const perc = (n: number) => Math.round(n || 0) + '%'

export default function Budget() {
  const [righe, setRighe] = useState<any[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const { data: p } = await supabase.from('progetti').select('*').order('codice')
    const [{ data: fc }, { data: ff }, { data: ddt }] = await Promise.all([
      supabase.from('fatture_clienti').select('progetto_id,imponibile'),
      supabase.from('fatture_fornitori').select('progetto_id,imponibile'),
      supabase.from('ddt').select('progetto_id,importo,stato'),
    ])
    const r = (p || []).map(proj => {
      const ric = (fc || []).filter(f => f.progetto_id === proj.id).reduce((s, f) => s + (f.imponibile || 0), 0)
      const cosFF = (ff || []).filter(f => f.progetto_id === proj.id).reduce((s, f) => s + (f.imponibile || 0), 0)
      const cosDDT = (ddt || []).filter(d => d.progetto_id === proj.id && d.stato === 'Da Fatturare').reduce((s, d) => s + (d.importo || 0), 0)
      const cos = cosFF + cosDDT
      const margBudget = proj.valore_contratto > 0 ? (proj.valore_contratto - proj.budget_costi) / proj.valore_contratto * 100 : 0
      const margAtt = ric > 0 ? (ric - cos) / ric * 100 : 0
      const scost = cos - proj.budget_costi
      return { ...proj, ricavi: ric, costi: cos, marg_budget: margBudget, marg_att: margAtt, scost }
    })
    setRighe(r)
  }

  const semaforoBadge = (marg: number, margBudget: number) => {
    if (marg >= margBudget * 0.9) return <span className="badge badge-green">OK</span>
    if (marg >= margBudget * 0.7) return <span className="badge badge-amber">Attenzione</span>
    return <span className="badge badge-red">Critico</span>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Budget vs Consuntivo</h1>
        </div>
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr>
              <th>Cantiere</th><th>Contratto</th><th>Budget costi</th><th>Marg. Budget</th>
              <th>Ricavi att.</th><th>Costi att.</th><th>Marg. Att.</th>
              <th>Scostamento</th><th>Stato</th>
            </tr></thead>
            <tbody>
              {righe.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-gray-400 py-8">Nessun progetto</td></tr>
              ) : righe.map(r => (
                <tr key={r.id}>
                  <td className="font-medium text-sm">{r.codice} — {r.nome}</td>
                  <td className="text-sm">{euro(r.valore_contratto)}</td>
                  <td className="text-sm">{euro(r.budget_costi)}</td>
                  <td className="text-sm text-green-700">{perc(r.marg_budget)}</td>
                  <td className="text-sm text-green-700">{euro(r.ricavi)}</td>
                  <td className="text-sm text-red-700">{euro(r.costi)}</td>
                  <td className={`font-medium text-sm ${r.marg_att >= 15 ? 'text-green-700' : r.marg_att >= 8 ? 'text-amber-700' : 'text-red-700'}`}>
                    {perc(r.marg_att)}
                  </td>
                  <td className={`text-sm font-medium ${r.scost > 5000 ? 'text-red-700' : r.scost > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                    {r.scost > 0 ? '+' : ''}{euro(r.scost)}
                  </td>
                  <td>{semaforoBadge(r.marg_att, r.marg_budget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
