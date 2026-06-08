'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro4 = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const euro2 = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MACRO_CAT_COLORS: Record<string, string> = {
  'Cementi': '#b45309',
  'Laterizi': '#dc2626',
  'Ferro e Acciaio': '#475569',
  'Legno': '#92400e',
  'Isolanti': '#0891b2',
  'Impermeabilizzanti': '#1d4ed8',
  'Inerti e Calcestruzzo': '#6b7280',
  'Impianti': '#7c3aed',
  'Attrezzatura': '#059669',
  'Noli': '#9333ea',
  'Trasporti': '#0ea5e9',
  'Altro': '#94a3b8',
}

export default function Prezzario() {
  const [voci, setVoci] = useState<any[]>([])
  const [storico, setStorico] = useState<any[]>([])
  const [selezionato, setSelezionato] = useState<any>(null)
  const [fornStorico, setFornStorico] = useState<string>('tutti')
  const [ricerca, setRicerca] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [modalModifica, setModalModifica] = useState<any>(null)
  const [modalNuovo, setModalNuovo] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formNuovo, setFormNuovo] = useState({
    descrizione: '', macro_categoria: 'Altro', categoria: '',
    unita_misura: '', fornitore_nome: '', ultimo_prezzo: ''
  })
  const [fornitori, setFornitori] = useState<any[]>([])

  useEffect(() => {
    load()
    supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).then(({ data }) => setFornitori(data || []))
  }, [])

  async function load() {
    const { data } = await supabase.from('prezzario').select('*').order('macro_categoria').order('descrizione')
    setVoci(data || [])
  }

  async function apriDettaglio(voce: any) {
    setSelezionato(voce)
    setFornStorico('tutti')
    const { data } = await supabase.from('prezzario_storico').select('*')
      .eq('prezzario_id', voce.id).order('data', { ascending: false })
    setStorico(data || [])
  }

  async function eliminaVoce(id: string) {
    if (!confirm('Eliminare questa voce dal prezzario? Verrà eliminato anche lo storico.')) return
    await supabase.from('prezzario').delete().eq('id', id)
    setSelezionato(null)
    load()
  }

  async function salvaModifica() {
    if (!modalModifica) return
    setLoading(true)
    await supabase.from('prezzario').update({
      descrizione: modalModifica.descrizione,
      macro_categoria: modalModifica.macro_categoria,
      categoria: modalModifica.categoria,
      unita_misura: modalModifica.unita_misura,
      ultimo_prezzo: parseFloat(modalModifica.ultimo_prezzo) || 0,
    }).eq('id', modalModifica.id)
    setModalModifica(null)
    setLoading(false)
    load()
    if (selezionato?.id === modalModifica.id) {
      setSelezionato({ ...modalModifica, ultimo_prezzo: parseFloat(modalModifica.ultimo_prezzo) || 0 })
    }
  }

  async function salvaNuovo() {
    if (!formNuovo.descrizione || !formNuovo.fornitore_nome) {
      alert('Inserisci descrizione e fornitore'); return
    }
    setLoading(true)
    await supabase.from('prezzario').insert({
      descrizione: formNuovo.descrizione,
      macro_categoria: formNuovo.macro_categoria,
      categoria: formNuovo.categoria,
      unita_misura: formNuovo.unita_misura,
      fornitore_nome: formNuovo.fornitore_nome,
      ultimo_prezzo: parseFloat(formNuovo.ultimo_prezzo) || 0,
      prezzo_medio: parseFloat(formNuovo.ultimo_prezzo) || 0,
      n_acquisti: 0
    })
    setModalNuovo(false)
    setFormNuovo({ descrizione: '', macro_categoria: 'Altro', categoria: '', unita_misura: '', fornitore_nome: '', ultimo_prezzo: '' })
    setLoading(false)
    load()
  }

  // Raggruppa per macro categoria
  const perCategoria = useMemo(() => {
    let filtrate = voci
    if (ricerca.trim()) {
      const q = ricerca.toLowerCase()
      filtrate = filtrate.filter(v => v.descrizione?.toLowerCase().includes(q) || v.fornitore_nome?.toLowerCase().includes(q))
    }
    if (filtroCat) filtrate = filtrate.filter(v => v.macro_categoria === filtroCat)

    const gruppi: Record<string, any[]> = {}
    filtrate.forEach(v => {
      const cat = v.macro_categoria || 'Altro'
      if (!gruppi[cat]) gruppi[cat] = []
      gruppi[cat].push(v)
    })
    return gruppi
  }, [voci, ricerca, filtroCat])

  const macroCategorie = useMemo(() => Array.from(new Set(voci.map(v => v.macro_categoria || 'Altro'))).sort(), [voci])

  // Fornitori del materiale selezionato
  const fornitorDelMateriale = useMemo(() => {
    if (!selezionato) return []
    const forn = new Set(storico.map(s => s.fornitore_nome).filter(Boolean))
    return Array.from(forn)
  }, [storico, selezionato])

  const storicoFiltrato = useMemo(() => {
    if (fornStorico === 'tutti') return storico
    return storico.filter(s => s.fornitore_nome === fornStorico)
  }, [storico, fornStorico])

  // Statistiche per fornitore
  const statPerFornitore = useMemo(() => {
    const mappa: Record<string, { prezzi: number[], ultimo: number, ultimaData: string }> = {}
    storico.forEach(s => {
      const f = s.fornitore_nome || '—'
      if (!mappa[f]) mappa[f] = { prezzi: [], ultimo: 0, ultimaData: '' }
      mappa[f].prezzi.push(s.prezzo_unitario)
      if (!mappa[f].ultimaData || s.data > mappa[f].ultimaData) {
        mappa[f].ultimo = s.prezzo_unitario
        mappa[f].ultimaData = s.data
      }
    })
    return Object.entries(mappa).map(([forn, stat]) => ({
      fornitore: forn,
      prezzoMedio: stat.prezzi.reduce((a, b) => a + b, 0) / stat.prezzi.length,
      ultimoPrezzo: stat.ultimo,
      ultimaData: stat.ultimaData,
      nAcquisti: stat.prezzi.length
    })).sort((a, b) => a.prezzoMedio - b.prezzoMedio)
  }, [storico])

  const MACRO_CATEGORIE = Object.keys(MACRO_CAT_COLORS)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold">Prezzario materiali</h1>
            <p className="text-sm text-gray-500 mt-0.5">Aggiornato automaticamente dalle bolle scansionate</p>
          </div>
          <button className="btn btn-primary" onClick={() => setModalNuovo(true)}>+ Aggiungi voce</button>
        </div>

        {/* Ricerca e filtri */}
        <div className="card mb-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-48">
              <label className="label">🔍 Cerca materiale</label>
              <input className="input" placeholder="es. calcestruzzo, mattoni, ferro..."
                value={ricerca} onChange={e => setRicerca(e.target.value)} />
            </div>
            <div>
              <label className="label">Categoria</label>
              <select className="input w-auto" value={filtroCat} onChange={e => setFiltroCat(e.target.value)}>
                <option value="">Tutte ({voci.length})</option>
                {macroCategorie.map(m => (
                  <option key={m} value={m}>{m} ({voci.filter(v => (v.macro_categoria || 'Altro') === m).length})</option>
                ))}
              </select>
            </div>
            {(ricerca || filtroCat) && (
              <button className="btn btn-sm" onClick={() => { setRicerca(''); setFiltroCat('') }}>✕ Reset</button>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          {/* Lista materiali per categoria */}
          <div className="w-80 flex-shrink-0 space-y-2 max-h-screen overflow-y-auto pb-6">
            {Object.keys(perCategoria).length === 0 ? (
              <div className="card text-center py-8 text-gray-400">
                <p className="text-2xl mb-2">📦</p>
                <p className="text-sm">Nessun materiale nel prezzario.</p>
                <p className="text-xs mt-1">Scansiona una bolla per iniziare.</p>
              </div>
            ) : Object.entries(perCategoria).map(([cat, vociCat]) => (
              <div key={cat}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1"
                  style={{ background: MACRO_CAT_COLORS[cat] || '#6b7280' }}>
                  <span className="text-white text-xs font-semibold flex-1">{cat}</span>
                  <span className="text-white/70 text-xs">{vociCat.length} voci</span>
                </div>
                {vociCat.map(v => (
                  <div key={v.id}
                    onClick={() => apriDettaglio(v)}
                    className={`px-3 py-2 rounded-lg cursor-pointer mb-0.5 border transition-all text-sm ${selezionato?.id === v.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-medium text-xs leading-tight">{v.descrizione}</p>
                      <p className="text-blue-700 font-semibold text-xs flex-shrink-0">{euro4(v.ultimo_prezzo)}</p>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-400">{v.fornitore_nome}</p>
                      {v.unita_misura && <span className="text-xs text-gray-400">/{v.unita_misura}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Dettaglio materiale */}
          {selezionato ? (
            <div className="flex-1 space-y-4">
              {/* Header materiale */}
              <div className="card" style={{ borderLeft: `4px solid ${MACRO_CAT_COLORS[selezionato.macro_categoria] || '#6b7280'}` }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                        style={{ background: MACRO_CAT_COLORS[selezionato.macro_categoria] || '#6b7280' }}>
                        {selezionato.macro_categoria}
                      </span>
                      {selezionato.categoria && <span className="text-xs text-gray-500">{selezionato.categoria}</span>}
                    </div>
                    <h2 className="text-lg font-semibold">{selezionato.descrizione}</h2>
                    {selezionato.unita_misura && <p className="text-sm text-gray-500">Unità: {selezionato.unita_misura}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Ultimo prezzo</p>
                    <p className="text-2xl font-bold text-blue-700">{euro4(selezionato.ultimo_prezzo)}</p>
                    <p className="text-xs text-gray-400">Media: {euro4(selezionato.prezzo_medio)}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-sm text-blue-600 border-blue-200"
                    onClick={() => setModalModifica({...selezionato})}>✏️ Modifica</button>
                  <button className="btn btn-sm text-red-600 border-red-200"
                    onClick={() => eliminaVoce(selezionato.id)}>🗑 Elimina</button>
                </div>
              </div>

              {/* Confronto fornitori */}
              {statPerFornitore.length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-medium text-gray-600 mb-3">🏭 Confronto fornitori</h3>
                  <div className="space-y-2">
                    {statPerFornitore.map((f, idx) => (
                      <div key={f.fornitore}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${fornStorico === f.fornitore ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
                        onClick={() => setFornStorico(fornStorico === f.fornitore ? 'tutti' : f.fornitore)}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${idx === 0 ? 'bg-green-600' : idx === 1 ? 'bg-amber-500' : 'bg-gray-400'}`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{f.fornitore}</p>
                          <p className="text-xs text-gray-400">{f.nAcquisti} acquisti · ultimo {f.ultimaData ? new Date(f.ultimaData).toLocaleDateString('it-IT') : '—'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-blue-700">{euro4(f.ultimoPrezzo)}</p>
                          <p className="text-xs text-gray-400">media {euro4(f.prezzoMedio)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {fornStorico !== 'tutti' && (
                    <button className="btn btn-sm mt-2" onClick={() => setFornStorico('tutti')}>
                      Mostra tutti i fornitori
                    </button>
                  )}
                </div>
              )}

              {/* Storico prezzi */}
              <div className="card">
                <h3 className="text-sm font-medium text-gray-600 mb-3">
                  📈 Storico prezzi
                  {fornStorico !== 'tutti' && <span className="text-blue-600 ml-1">— {fornStorico}</span>}
                </h3>
                {storicoFiltrato.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Nessuno storico disponibile.</p>
                ) : (
                  <table className="table-base">
                    <thead>
                      <tr><th>Data</th><th>Fornitore</th><th>Quantità</th><th>Prezzo unit.</th><th>Variazione</th></tr>
                    </thead>
                    <tbody>
                      {storicoFiltrato.map((s, idx) => {
                        const prec = storicoFiltrato[idx + 1]?.prezzo_unitario
                        const var_ = prec ? ((s.prezzo_unitario - prec) / prec * 100) : null
                        return (
                          <tr key={s.id}>
                            <td className="text-xs">{s.data ? new Date(s.data).toLocaleDateString('it-IT') : '—'}</td>
                            <td className="text-sm">{s.fornitore_nome}</td>
                            <td className="text-sm">{s.quantita} {selezionato.unita_misura}</td>
                            <td className="font-semibold text-sm text-blue-700">{euro4(s.prezzo_unitario)}</td>
                            <td>
                              {var_ !== null ? (
                                <span className={`text-xs font-medium ${var_ > 0 ? 'text-red-600' : var_ < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                  {var_ > 0 ? '▲' : var_ < 0 ? '▼' : '='} {Math.abs(var_).toFixed(1)}%
                                </span>
                              ) : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-4xl mb-3">📦</p>
                <p className="text-sm">Clicca su un materiale per vedere dettagli e storico prezzi</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal modifica */}
      {modalModifica && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Modifica voce prezzario</h2>
              <button onClick={() => setModalModifica(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div><label className="label">Descrizione</label>
                <input className="input" value={modalModifica.descrizione}
                  onChange={e => setModalModifica({...modalModifica, descrizione: e.target.value})} /></div>
              <div><label className="label">Macro categoria</label>
                <select className="input" value={modalModifica.macro_categoria}
                  onChange={e => setModalModifica({...modalModifica, macro_categoria: e.target.value})}>
                  {MACRO_CATEGORIE.map(m => <option key={m}>{m}</option>)}
                </select></div>
              <div><label className="label">Categoria specifica</label>
                <input className="input" value={modalModifica.categoria || ''}
                  onChange={e => setModalModifica({...modalModifica, categoria: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Unità di misura</label>
                  <input className="input" value={modalModifica.unita_misura || ''}
                    onChange={e => setModalModifica({...modalModifica, unita_misura: e.target.value})} /></div>
                <div><label className="label">Prezzo unitario (€)</label>
                  <input className="input" type="number" step="0.0001" value={modalModifica.ultimo_prezzo}
                    onChange={e => setModalModifica({...modalModifica, ultimo_prezzo: e.target.value})} /></div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalModifica(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaModifica} disabled={loading}>
                {loading ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuova voce */}
      {modalNuovo && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuova voce prezzario</h2>
              <button onClick={() => setModalNuovo(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div><label className="label">Descrizione *</label>
                <input className="input" placeholder="es. Calcestruzzo C25/30"
                  value={formNuovo.descrizione}
                  onChange={e => setFormNuovo({...formNuovo, descrizione: e.target.value})} /></div>
              <div><label className="label">Macro categoria</label>
                <select className="input" value={formNuovo.macro_categoria}
                  onChange={e => setFormNuovo({...formNuovo, macro_categoria: e.target.value})}>
                  {MACRO_CATEGORIE.map(m => <option key={m}>{m}</option>)}
                </select></div>
              <div><label className="label">Fornitore *</label>
                <input className="input" list="forn-list2" placeholder="Nome fornitore"
                  value={formNuovo.fornitore_nome}
                  onChange={e => setFormNuovo({...formNuovo, fornitore_nome: e.target.value})} />
                <datalist id="forn-list2">
                  {fornitori.map(f => <option key={f.id} value={f.ragione_sociale} />)}
                </datalist></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Unità di misura</label>
                  <input className="input" placeholder="mc, kg, pz..."
                    value={formNuovo.unita_misura}
                    onChange={e => setFormNuovo({...formNuovo, unita_misura: e.target.value})} /></div>
                <div><label className="label">Prezzo unitario (€)</label>
                  <input className="input" type="number" step="0.0001"
                    value={formNuovo.ultimo_prezzo}
                    onChange={e => setFormNuovo({...formNuovo, ultimo_prezzo: e.target.value})} /></div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalNuovo(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaNuovo} disabled={loading}>
                {loading ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
