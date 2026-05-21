'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const CATEGORIE = ['Materiali', 'Noli mezzi', 'Manodopera esterna', 'Subappalto', 'Trasporti', 'Attrezzatura', 'Smaltimento', 'Altro']

const CAT_COLORS: Record<string, string> = {
  'Materiali': '#1d4ed8',
  'Noli mezzi': '#7c3aed',
  'Manodopera esterna': '#0891b2',
  'Subappalto': '#b45309',
  'Trasporti': '#059669',
  'Attrezzatura': '#dc2626',
  'Smaltimento': '#9333ea',
  'Altro': '#6b7280',
}

export default function CostiCantiere() {
  const [progetti, setProgetti] = useState<any[]>([])
  const [costi, setCosti] = useState<any[]>([])
  const [progettoSel, setProgettoSel] = useState('')
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(false)
  const [utente, setUtente] = useState<any>(null)
  const [filtroMese, setFiltroMese] = useState('')
  const [form, setForm] = useState({
    data: new Date().toISOString().split('T')[0],
    categoria: 'Materiali',
    descrizione: '',
    importo: '',
    note: ''
  })

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (progettoSel) loadCosti() }, [progettoSel])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profilo } = await supabase.from('utenti').select('*').eq('id', user.id).single()
      setUtente({ ...user, profilo })
    }
    const { data: p } = await supabase.from('progetti').select('id,codice,nome,geometra_id,geometra_nome,budget_costi,valore_contratto')
      .eq('stato', 'In Corso').order('codice')
    setProgetti(p || [])
    if (p && p.length > 0) setProgettoSel(p[0].id)
  }

  async function loadCosti() {
    if (!progettoSel) return
    const { data } = await supabase.from('costi_cantiere').select('*')
      .eq('progetto_id', progettoSel).order('data', { ascending: false })
    setCosti(data || [])
  }

  async function salva() {
    if (!form.importo || !progettoSel) { alert('Inserisci importo e seleziona un cantiere'); return }
    setLoading(true)
    const prj = progetti.find(p => p.id === progettoSel)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profilo } = await supabase.from('utenti').select('nome').eq('id', user?.id).single()
    await supabase.from('costi_cantiere').insert({
      progetto_id: progettoSel,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      data: form.data,
      categoria: form.categoria,
      descrizione: form.descrizione,
      importo: parseFloat(form.importo) || 0,
      inserito_da: user?.id,
      inserito_da_nome: profilo?.nome || user?.email,
      note: form.note
    })
    setModal(false)
    setForm({ data: new Date().toISOString().split('T')[0], categoria: 'Materiali', descrizione: '', importo: '', note: '' })
    setLoading(false)
    loadCosti()
  }

  async function elimina(id: string) {
    if (!confirm('Eliminare questo costo?')) return
    await supabase.from('costi_cantiere').delete().eq('id', id)
    loadCosti()
  }

  const progetto = progetti.find(p => p.id === progettoSel)

  const costiFiltrati = useMemo(() => {
    if (!filtroMese) return costi
    return costi.filter(c => c.data?.startsWith(filtroMese))
  }, [costi, filtroMese])

  const totalePerCategoria = useMemo(() => {
    const mappa: Record<string, number> = {}
    costiFiltrati.forEach(c => {
      mappa[c.categoria] = (mappa[c.categoria] || 0) + (c.importo || 0)
    })
    return mappa
  }, [costiFiltrati])

  const totale = costiFiltrati.reduce((s, c) => s + (c.importo || 0), 0)
  const totaleTutti = costi.reduce((s, c) => s + (c.importo || 0), 0)
  const budgetPerc = progetto?.budget_costi > 0 ? Math.round(totaleTutti / progetto.budget_costi * 100) : 0

  // Mesi disponibili
  const mesiDisponibili = useMemo(() => {
    const mesi = new Set(costi.map(c => c.data?.substring(0, 7)).filter(Boolean))
    return Array.from(mesi).sort().reverse()
  }, [costi])

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Costi cantiere giornalieri</h1>
          <button className="btn btn-primary" onClick={() => setModal(true)}>+ Inserisci costo</button>
        </div>

        {/* Selezione cantiere */}
        <div className="card mb-4">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-52">
              <label className="label">Cantiere</label>
              <select className="input" value={progettoSel} onChange={e => setProgettoSel(e.target.value)}>
                {progetti.map(p => (
                  <option key={p.id} value={p.id}>{p.codice} — {p.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Filtra per mese</label>
              <select className="input w-auto" value={filtroMese} onChange={e => setFiltroMese(e.target.value)}>
                <option value="">Tutti i mesi</option>
                {mesiDisponibili.map(m => (
                  <option key={m} value={m}>
                    {new Date(m + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {progetto && (
          <>
            {/* KPI cantiere */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="text-xs text-blue-600 mb-1">Totale costi inseriti</p>
                <p className="text-xl font-semibold text-blue-800">{euro(totaleTutti)}</p>
                {filtroMese && <p className="text-xs text-blue-500 mt-1">Mese filtrato: {euro(totale)}</p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Budget costi</p>
                <p className="text-xl font-semibold text-gray-800">{euro(progetto.budget_costi)}</p>
              </div>
              <div className={`rounded-xl p-4 border ${budgetPerc >= 100 ? 'bg-red-50 border-red-200' : budgetPerc >= 80 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <p className={`text-xs mb-1 ${budgetPerc >= 100 ? 'text-red-600' : budgetPerc >= 80 ? 'text-amber-600' : 'text-green-600'}`}>Budget utilizzato</p>
                <p className={`text-xl font-semibold ${budgetPerc >= 100 ? 'text-red-700' : budgetPerc >= 80 ? 'text-amber-700' : 'text-green-700'}`}>{budgetPerc}%</p>
                <div className="h-1.5 bg-white/50 rounded-full mt-2 overflow-hidden">
                  <div className={`h-full rounded-full ${budgetPerc >= 100 ? 'bg-red-500' : budgetPerc >= 80 ? 'bg-amber-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(budgetPerc, 100)}%` }} />
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Geometra</p>
                <p className="text-sm font-medium text-gray-800">{progetto.geometra_nome || '—'}</p>
              </div>
            </div>

            {/* Grafico per categoria */}
            {Object.keys(totalePerCategoria).length > 0 && (
              <div className="card mb-4">
                <h3 className="text-sm font-medium text-gray-600 mb-3">
                  Ripartizione costi per categoria
                  {filtroMese && <span className="text-gray-400 font-normal ml-2">— {new Date(filtroMese + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</span>}
                </h3>
                <div className="space-y-2">
                  {Object.entries(totalePerCategoria).sort((a, b) => b[1] - a[1]).map(([cat, imp]) => (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="text-xs w-36 flex-shrink-0 text-gray-600">{cat}</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden">
                        <div className="h-full rounded-lg flex items-center px-2"
                          style={{
                            width: `${Math.max((imp / totale) * 100, 2)}%`,
                            background: CAT_COLORS[cat] || '#6b7280'
                          }}>
                          <span className="text-white text-xs font-medium whitespace-nowrap">
                            {Math.round((imp / totale) * 100)}%
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 w-24 text-right">{euro(imp)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                  <span className="text-xs font-medium text-gray-500">Totale periodo</span>
                  <span className="text-sm font-semibold text-gray-800">{euro(totale)}</span>
                </div>
              </div>
            )}

            {/* Lista costi */}
            <div className="card overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-600">Registro costi ({costiFiltrati.length})</h3>
              </div>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Data</th><th>Categoria</th><th>Descrizione</th>
                    <th>Importo</th><th>Inserito da</th><th>Note</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {costiFiltrati.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-gray-400 py-8">
                      Nessun costo registrato per questo cantiere.
                    </td></tr>
                  ) : costiFiltrati.map(c => (
                    <tr key={c.id}>
                      <td className="text-xs">{new Date(c.data).toLocaleDateString('it-IT')}</td>
                      <td>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                          style={{ background: CAT_COLORS[c.categoria] || '#6b7280' }}>
                          {c.categoria}
                        </span>
                      </td>
                      <td className="text-sm">{c.descrizione || '—'}</td>
                      <td className="font-semibold text-sm text-blue-800">{euro(c.importo)}</td>
                      <td className="text-xs text-gray-500">{c.inserito_da_nome || '—'}</td>
                      <td className="text-xs text-gray-400">{c.note || '—'}</td>
                      <td>
                        <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => elimina(c.id)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* Modal inserimento costo */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Inserisci costo</h2>
                <p className="text-xs text-gray-500 mt-0.5">{progetto?.codice} — {progetto?.nome}</p>
              </div>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Data *</label>
                  <input className="input" type="date" value={form.data}
                    onChange={e => setForm({...form, data: e.target.value})} />
                </div>
                <div>
                  <label className="label">Importo (€) *</label>
                  <input className="input" type="number" step="0.01" placeholder="0.00"
                    value={form.importo} onChange={e => setForm({...form, importo: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="label">Categoria *</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIE.map(cat => (
                    <button key={cat} type="button"
                      onClick={() => setForm({...form, categoria: cat})}
                      className={`text-xs px-3 py-2 rounded-lg border text-left transition-all ${form.categoria === cat ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
                      style={form.categoria === cat ? { background: CAT_COLORS[cat] } : {}}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Descrizione</label>
                <input className="input" placeholder="es. Calcestruzzo C25/30 - 30mc, Noleggio escavatore..."
                  value={form.descrizione} onChange={e => setForm({...form, descrizione: e.target.value})} />
              </div>
              <div>
                <label className="label">Note aggiuntive</label>
                <input className="input" placeholder="es. Fornitore, bolla n°..."
                  value={form.note} onChange={e => setForm({...form, note: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={loading}>
                {loading ? 'Salvataggio...' : 'Salva costo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
