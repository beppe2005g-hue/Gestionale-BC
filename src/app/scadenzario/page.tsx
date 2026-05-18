'use client'
import { useEffect, useState } from 'react'
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

  const filtered = righe.filter(r => {
    if (filtro === 'scaduti') return r.gg < 0 && r.stato !== 'Pagata' && r.stato !== 'Incassata'
    if (filtro === 'questa_settimana') return r.gg >= 0 && r.gg <= 7
    if (filtro === 'pagamenti') return r.tipo === 'Pagamento'
    if (filtro === 'incassi') return r.tipo === 'Incasso'
    if (filtro === 'chiusi') return r.stato === 'Pagata' || r.stato === 'Incassata'
    return true
  })

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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Scadenzario</h1>
          <div className="flex gap-2 flex-wrap">
            {[{key:'tutti',label:'Tutti'},{key:'scaduti',label:'Scaduti'},{key:'questa_settimana',label:'7 gg'},{key:'pagamenti',label:'Pagamenti'},{key:'incassi',label:'Incassi'},{key:'chiusi',label:'Chiusi'}].map(f => (
              <button key={f.key} onClick={() => setFiltro(f.key)} className={`btn btn-sm ${filtro === f.key ? 'btn-primary' : ''}`}>{f.label}</button>
            ))}
          </div>
        </div>
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Tipo</th><th>Soggetto</th><th>Cantiere</th><th>Fattura</th><th>Rata</th><th>Importo</th><th>Scadenza</th><th>Stato</th></tr></thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={8} className="text-center text-gray-400 py-8">Nessuna scadenza per questo filtro.</td></tr>
                : filtered.map((r, i) => (
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
                ))
              }
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
