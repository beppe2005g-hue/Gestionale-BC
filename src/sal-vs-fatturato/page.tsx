'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + Math.round(n || 0).toLocaleString('it-IT')

export default function SalVsFatturatoPage() {
  const [progetti, setProgetti] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cercaNome, setCercaNome] = useState('')
  const [filtroStato, setFiltroStato] = useState('attivi')
  const [ordinamento, setOrdinamento] = useState<'scostamento' | 'sal' | 'nome'>('scostamento')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: p } = await supabase.from('progetti').select('id,codice,nome,cliente_nome,stato,geometra_nome')
    const [{ data: sal }, { data: fde }] = await Promise.all([
      supabase.from('sal_cantiere').select('progetto_id,importo_lavori,data'),
      supabase.from('fatture_da_emettere').select('progetto_id,stato,importo_emesso'),
    ])

    const enhanced = (p || []).map(proj => {
      const salProgetto = (sal || []).filter(s => s.progetto_id === proj.id)
      const totaleSal = salProgetto.reduce((s, x) => s + (x.importo_lavori || 0), 0)
      const ultimoSal = salProgetto.length > 0 ? salProgetto.reduce((latest, s) => !latest || s.data > latest.data ? s : latest, null as any) : null
      const fattureProgetto = (fde || []).filter(f => f.progetto_id === proj.id)
      const totaleFatturato = fattureProgetto.filter(f => f.stato === 'Emessa').reduce((s, f) => s + (f.importo_emesso || 0), 0)
      const scostamento = totaleSal - totaleFatturato
      const percFatturato = totaleSal > 0 ? Math.round(totaleFatturato / totaleSal * 100) : 0
      return { ...proj, totaleSal, totaleFatturato, scostamento, percFatturato, ultimoSalData: ultimoSal?.data || null }
    })
    setProgetti(enhanced)
    setLoading(false)
  }

  const progettiFiltrati = useMemo(() => {
    let list = progetti.filter(p => {
      if (filtroStato === 'attivi' && !['In Corso', 'Offerta'].includes(p.stato)) return false
      if (filtroStato === 'tutti') { /* nessun filtro */ }
      if (cercaNome && !p.nome?.toLowerCase().includes(cercaNome.toLowerCase()) && !p.codice?.toLowerCase().includes(cercaNome.toLowerCase())) return false
      return true
    })
    list = list.filter(p => p.totaleSal > 0 || p.totaleFatturato > 0)
    if (ordinamento === 'scostamento') list.sort((a, b) => b.scostamento - a.scostamento)
    if (ordinamento === 'sal') list.sort((a, b) => b.totaleSal - a.totaleSal)
    if (ordinamento === 'nome') list.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
    return list
  }, [progetti, cercaNome, filtroStato, ordinamento])

  const totaleSalGenerale = progettiFiltrati.reduce((s, p) => s + p.totaleSal, 0)
  const totaleFatturatoGenerale = progettiFiltrati.reduce((s, p) => s + p.totaleFatturato, 0)
  const scostamentoGenerale = totaleSalGenerale - totaleFatturatoGenerale
  const cantieriARilento = progettiFiltrati.filter(p => p.scostamento > 0.02).length

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">SAL vs Fatturato</h1>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-teal-50 rounded-xl p-4 border border-teal-100">
            <p className="text-xs text-teal-600 mb-1">Totale SAL maturati</p>
            <p className="text-xl font-semibold text-teal-800">{euro(totaleSalGenerale)}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <p className="text-xs text-emerald-600 mb-1">Totale fatturato</p>
            <p className="text-xl font-semibold text-emerald-800">{euro(totaleFatturatoGenerale)}</p>
          </div>
          <div className={`rounded-xl p-4 border ${scostamentoGenerale > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-xs mb-1 ${scostamentoGenerale > 0 ? 'text-amber-600' : 'text-gray-600'}`}>Da fatturare</p>
            <p className={`text-xl font-semibold ${scostamentoGenerale > 0 ? 'text-amber-700' : 'text-gray-700'}`}>{euro(Math.max(scostamentoGenerale, 0))}</p>
          </div>
          <div className={`rounded-xl p-4 border ${cantieriARilento > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <p className={`text-xs mb-1 ${cantieriARilento > 0 ? 'text-red-600' : 'text-green-600'}`}>Cantieri a rilento</p>
            <p className={`text-xl font-semibold ${cantieriARilento > 0 ? 'text-red-700' : 'text-green-700'}`}>{cantieriARilento}</p>
          </div>
        </div>

        <div className="card mb-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-52">
              <label className="label">Cerca cantiere</label>
              <input className="input" placeholder="Nome o codice..." value={cercaNome} onChange={e => setCercaNome(e.target.value)} />
            </div>
            <div>
              <label className="label">Stato</label>
              <select className="input w-auto" value={filtroStato} onChange={e => setFiltroStato(e.target.value)}>
                <option value="attivi">Attivi</option>
                <option value="tutti">Tutti</option>
              </select>
            </div>
            <div>
              <label className="label">Ordina per</label>
              <select className="input w-auto" value={ordinamento} onChange={e => setOrdinamento(e.target.value as any)}>
                <option value="scostamento">Scostamento (più a rilento prima)</option>
                <option value="sal">SAL maturato</option>
                <option value="nome">Nome cantiere</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card text-center py-12 text-gray-400">Caricamento...</div>
        ) : progettiFiltrati.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">Nessun cantiere con SAL o fatture registrate.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Cantiere</th><th>Committente</th><th>SAL maturato</th><th>Fatturato</th>
                  <th>% Fatturato su SAL</th><th>Scostamento</th><th>Ultimo SAL</th>
                </tr>
              </thead>
              <tbody>
                {progettiFiltrati.map(p => (
                  <tr key={p.id}>
                    <td>
                      <span className="text-xs font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded mr-1">{p.codice}</span>
                      <span className="text-sm font-medium">{p.nome}</span>
                    </td>
                    <td className="text-sm text-gray-600">{p.cliente_nome || '—'}</td>
                    <td className="font-semibold text-sm text-teal-700">{euro(p.totaleSal)}</td>
                    <td className="font-semibold text-sm text-emerald-700">{euro(p.totaleFatturato)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(p.percFatturato, 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{p.percFatturato}%</span>
                      </div>
                    </td>
                    <td>
                      {Math.abs(p.scostamento) < 0.02 ? (
                        <span className="badge badge-green">In pari</span>
                      ) : p.scostamento > 0 ? (
                        <span className="text-sm font-medium text-amber-700">🟡 {euro(p.scostamento)} da fatturare</span>
                      ) : (
                        <span className="text-sm font-medium text-gray-500">{euro(Math.abs(p.scostamento))} oltre SAL</span>
                      )}
                    </td>
                    <td className="text-xs text-gray-400">{p.ultimoSalData ? new Date(p.ultimoSalData).toLocaleDateString('it-IT') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
