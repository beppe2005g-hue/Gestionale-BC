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

const statoBadge = (s: string) => {
  if (s === 'Fatturato') return <span className="badge badge-green">Fatturato</span>
  if (s === 'Parziale') return <span className="badge badge-amber">Parziale</span>
  return <span className="badge badge-amber">Da Fatturare</span>
}

export default function CostiCantiere() {
  const [tab, setTab] = useState<'costi' | 'ddt'>('costi')

  // Dati comuni
  const [progetti, setProgetti] = useState<any[]>([])
  const [progettoSel, setProgettoSel] = useState('')
  const [utente, setUtente] = useState<any>(null)

  // Costi
  const [costi, setCosti] = useState<any[]>([])
  const [filtroMese, setFiltroMese] = useState('')
  const [modalCosto, setModalCosto] = useState(false)
  const [loadingCosto, setLoadingCosto] = useState(false)
  const [formCosto, setFormCosto] = useState({
    data: new Date().toISOString().split('T')[0],
    categoria: 'Materiali',
    descrizione: '',
    importo: '',
    note: ''
  })

  // DDT
  const [ddts, setDdts] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [modalDdt, setModalDdt] = useState(false)
  const [loadingDdt, setLoadingDdt] = useState(false)
  const [formDdt, setFormDdt] = useState({
    data: '', numero: '', fornitore_id: '',
    descrizione: '', importo: '', mese_fattura_previsto: '', note: ''
  })

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (progettoSel) { loadCosti(); loadDdt() } }, [progettoSel])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profilo } = await supabase.from('utenti').select('*').eq('id', user.id).single()
      setUtente({ ...user, profilo })
    }
    const [{ data: p }, { data: f }] = await Promise.all([
      supabase.from('progetti').select('id,codice,nome,geometra_id,geometra_nome,budget_costi,valore_contratto')
        .eq('stato', 'In Corso').order('codice'),
      supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale'),
    ])
    setProgetti(p || [])
    setFornitori(f || [])
    if (p && p.length > 0) setProgettoSel(p[0].id)
  }

  async function loadCosti() {
    if (!progettoSel) return
    const { data } = await supabase.from('costi_cantiere').select('*')
      .eq('progetto_id', progettoSel).order('data', { ascending: false })
    setCosti(data || [])
  }

  async function loadDdt() {
    if (!progettoSel) return
    const { data } = await supabase.from('ddt').select('*')
      .eq('progetto_id', progettoSel).order('data', { ascending: false })
    setDdts(data || [])
  }

  // ── SALVA COSTO ──
  async function salvaCosto() {
    if (!formCosto.importo || !progettoSel) { alert('Inserisci importo e seleziona un cantiere'); return }
    setLoadingCosto(true)
    const prj = progetti.find(p => p.id === progettoSel)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profilo } = await supabase.from('utenti').select('nome').eq('id', user?.id).single()
    await supabase.from('costi_cantiere').insert({
      progetto_id: progettoSel,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      data: formCosto.data,
      categoria: formCosto.categoria,
      descrizione: formCosto.descrizione,
      importo: parseFloat(formCosto.importo) || 0,
      inserito_da: user?.id,
      inserito_da_nome: profilo?.nome || user?.email,
      note: formCosto.note
    })
    setModalCosto(false)
    setFormCosto({ data: new Date().toISOString().split('T')[0], categoria: 'Materiali', descrizione: '', importo: '', note: '' })
    setLoadingCosto(false)
    loadCosti()
  }

  // ── SALVA DDT ──
  async function salvaDdt() {
    if (!formDdt.numero || !formDdt.importo || !formDdt.fornitore_id) {
      alert('Compilare N° DDT, fornitore e importo')
      return
    }
    setLoadingDdt(true)
    const for_ = fornitori.find(f => f.id === formDdt.fornitore_id)
    const prj = progetti.find(p => p.id === progettoSel)
    const { error } = await supabase.from('ddt').insert({
      data: formDdt.data || new Date().toISOString().split('T')[0],
      numero: formDdt.numero,
      fornitore_id: formDdt.fornitore_id,
      fornitore_nome: for_?.ragione_sociale || '',
      progetto_id: progettoSel,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: formDdt.descrizione,
      importo: parseFloat(formDdt.importo) || 0,
      mese_fattura_previsto: formDdt.mese_fattura_previsto,
      stato: 'Da Fatturare',
      note: formDdt.note,
    })
    if (error) alert('Errore: ' + error.message)
    else {
      setModalDdt(false)
      setFormDdt({ data: '', numero: '', fornitore_id: '', descrizione: '', importo: '', mese_fattura_previsto: '', note: '' })
      loadDdt()
    }
    setLoadingDdt(false)
  }

  async function eliminaCosto(id: string) {
    if (!confirm('Eliminare questo costo?')) return
    await supabase.from('costi_cantiere').delete().eq('id', id)
    loadCosti()
  }

  async function eliminaDdt(id: string) {
    if (!confirm('Eliminare questo DDT?')) return
    await supabase.from('ddt').delete().eq('id', id)
    loadDdt()
  }

  const progetto = progetti.find(p => p.id === progettoSel)

  const costiFiltrati = useMemo(() => {
    if (!filtroMese) return costi
    return costi.filter(c => c.data?.startsWith(filtroMese))
  }, [costi, filtroMese])

  const totalePerCategoria = useMemo(() => {
    const mappa: Record<string, number> = {}
    costiFiltrati.forEach(c => { mappa[c.categoria] = (mappa[c.categoria] || 0) + (c.importo || 0) })
    return mappa
  }, [costiFiltrati])

  const totale = costiFiltrati.reduce((s, c) => s + (c.importo || 0), 0)
  const totaleTutti = costi.reduce((s, c) => s + (c.importo || 0), 0)
  const budgetPerc = progetto?.budget_costi > 0 ? Math.round(totaleTutti / progetto.budget_costi * 100) : 0
  const mesiDisponibili = useMemo(() => {
    const mesi = new Set(costi.map(c => c.data?.substring(0, 7)).filter(Boolean))
    return Array.from(mesi).sort().reverse()
  }, [costi])

  const totaleDdt = ddts.reduce((s, d) => s + (d.importo || 0), 0)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Costi cantiere giornalieri</h1>
          <div className="flex gap-2">
            {tab === 'costi'
              ? <button className="btn btn-primary" onClick={() => setModalCosto(true)}>+ Inserisci costo</button>
              : <button className="btn btn-primary" onClick={() => setModalDdt(true)}>+ Inserisci DDT</button>
            }
          </div>
        </div>

        {/* Selezione cantiere */}
        <div className="card mb-4">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-52">
              <label className="label">Cantiere</label>
              <select className="input" value={progettoSel} onChange={e => setProgettoSel(e.target.value)}>
                {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} — {p.nome}</option>)}
              </select>
            </div>
            {tab === 'costi' && (
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
            )}
          </div>
        </div>

        {progetto && (
          <>
            {/* KPI */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="text-xs text-blue-600 mb-1">Totale costi inseriti</p>
                <p className="text-xl font-semibold text-blue-800">{euro(totaleTutti)}</p>
                {filtroMese && tab === 'costi' && <p className="text-xs text-blue-500 mt-1">Mese: {euro(totale)}</p>}
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
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                <p className="text-xs text-purple-600 mb-1">Totale DDT cantiere</p>
                <p className="text-xl font-semibold text-purple-800">{euro(totaleDdt)}</p>
                <p className="text-xs text-purple-500 mt-1">{ddts.length} DDT inseriti</p>
              </div>
            </div>

            {/* Tab switch */}
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              <button
                onClick={() => setTab('costi')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'costi' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                💰 Costi giornalieri ({costi.length})
              </button>
              <button
                onClick={() => setTab('ddt')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'ddt' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                📋 DDT / Bolle ({ddts.length})
              </button>
            </div>

            {/* ── TAB COSTI ── */}
            {tab === 'costi' && (
              <>
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
                              style={{ width: `${Math.max((imp / totale) * 100, 2)}%`, background: CAT_COLORS[cat] || '#6b7280' }}>
                              <span className="text-white text-xs font-medium whitespace-nowrap">{Math.round((imp / totale) * 100)}%</span>
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

                <div className="card overflow-x-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-600">Registro costi ({costiFiltrati.length})</h3>
                  </div>
                  <table className="table-base">
                    <thead>
                      <tr><th>Data</th><th>Categoria</th><th>Descrizione</th><th>Importo</th><th>Inserito da</th><th>Note</th><th></th></tr>
                    </thead>
                    <tbody>
                      {costiFiltrati.length === 0 ? (
                        <tr><td colSpan={7} className="text-center text-gray-400 py-8">Nessun costo registrato per questo cantiere.</td></tr>
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
                              onClick={() => eliminaCosto(c.id)}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ── TAB DDT ── */}
            {tab === 'ddt' && (
              <div className="card overflow-x-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-600">DDT inseriti per questo cantiere ({ddts.length})</h3>
                </div>
                <table className="table-base">
                  <thead>
                    <tr><th>Data</th><th>N° DDT</th><th>Fornitore</th><th>Descrizione</th><th>Importo</th><th>Stato</th><th>Mese prev.</th><th></th></tr>
                  </thead>
                  <tbody>
                    {ddts.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-gray-400 py-8">Nessun DDT inserito per questo cantiere.</td></tr>
                    ) : ddts.map(d => (
                      <tr key={d.id}>
                        <td className="text-xs">{d.data ? new Date(d.data).toLocaleDateString('it-IT') : '—'}</td>
                        <td className="font-medium text-sm">{d.numero}</td>
                        <td className="text-sm">{d.fornitore_nome}</td>
                        <td className="text-xs text-gray-600">{d.descrizione || '—'}</td>
                        <td className="font-semibold text-sm text-purple-800">{euro(d.importo)}</td>
                        <td>{statoBadge(d.stato)}</td>
                        <td className="text-xs text-gray-500">{d.mese_fattura_previsto || '—'}</td>
                        <td>
                          {d.stato === 'Da Fatturare' && (
                            <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => eliminaDdt(d.id)}>✕</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal costo */}
      {modalCosto && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Inserisci costo</h2>
                <p className="text-xs text-gray-500 mt-0.5">{progetto?.codice} — {progetto?.nome}</p>
              </div>
              <button onClick={() => setModalCosto(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Data *</label>
                  <input className="input" type="date" value={formCosto.data}
                    onChange={e => setFormCosto({...formCosto, data: e.target.value})} />
                </div>
                <div>
                  <label className="label">Importo (€) *</label>
                  <input className="input" type="number" step="0.01" placeholder="0.00"
                    value={formCosto.importo} onChange={e => setFormCosto({...formCosto, importo: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="label">Categoria *</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIE.map(cat => (
                    <button key={cat} type="button"
                      onClick={() => setFormCosto({...formCosto, categoria: cat})}
                      className={`text-xs px-3 py-2 rounded-lg border text-left transition-all ${formCosto.categoria === cat ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
                      style={formCosto.categoria === cat ? { background: CAT_COLORS[cat] } : {}}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Descrizione</label>
                <input className="input" placeholder="es. Calcestruzzo C25/30 - 30mc"
                  value={formCosto.descrizione} onChange={e => setFormCosto({...formCosto, descrizione: e.target.value})} />
              </div>
              <div>
                <label className="label">Note aggiuntive</label>
                <input className="input" placeholder="es. Fornitore, bolla n°..."
                  value={formCosto.note} onChange={e => setFormCosto({...formCosto, note: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalCosto(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaCosto} disabled={loadingCosto}>
                {loadingCosto ? 'Salvataggio...' : 'Salva costo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal DDT */}
      {modalDdt && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Inserisci DDT</h2>
                <p className="text-xs text-gray-500 mt-0.5">{progetto?.codice} — {progetto?.nome}</p>
              </div>
              <button onClick={() => setModalDdt(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Data</label>
                <input className="input" type="date" value={formDdt.data}
                  onChange={e => setFormDdt({...formDdt, data: e.target.value})} />
              </div>
              <div>
                <label className="label">N° DDT *</label>
                <input className="input" placeholder="es. DDT/2026/001" value={formDdt.numero}
                  onChange={e => setFormDdt({...formDdt, numero: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="label">Fornitore *</label>
                <select className="input" value={formDdt.fornitore_id}
                  onChange={e => setFormDdt({...formDdt, fornitore_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {fornitori.map(f => <option key={f.id} value={f.id}>{f.ragione_sociale}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Descrizione materiale/servizio</label>
                <input className="input" placeholder="es. Calcestruzzo C25/30 - 50mc" value={formDdt.descrizione}
                  onChange={e => setFormDdt({...formDdt, descrizione: e.target.value})} />
              </div>
              <div>
                <label className="label">Importo (€) *</label>
                <input className="input" type="number" step="0.01" placeholder="0.00" value={formDdt.importo}
                  onChange={e => setFormDdt({...formDdt, importo: e.target.value})} />
              </div>
              <div>
                <label className="label">Mese fattura previsto</label>
                <input className="input" type="month" value={formDdt.mese_fattura_previsto}
                  onChange={e => setFormDdt({...formDdt, mese_fattura_previsto: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="label">Note</label>
                <input className="input" value={formDdt.note}
                  onChange={e => setFormDdt({...formDdt, note: e.target.value})} />
              </div>
            </div>
            {/* Cantiere bloccato — già preselezionato */}
            <div className="mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              📌 Cantiere preselezionato: <strong>{progetto?.codice} — {progetto?.nome}</strong>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalDdt(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaDdt} disabled={loadingDdt}>
                {loadingDdt ? 'Salvataggio...' : 'Salva DDT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
