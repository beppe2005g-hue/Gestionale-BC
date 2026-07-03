'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

function formatEuro(n: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)
}

const formVuotoCantiere = {
  nome: '', cliente: '', indirizzo: '', stato: 'aperto', data_apertura: '', data_chiusura: '', note: ''
}
const formVuotoTariffa = { mansione: '', tariffa_oraria: '', note: '' }

export default function CantieriPage() {
  const [tab, setTab] = useState<'cantieri' | 'tariffe'>('cantieri')

  // ── Cantieri ──────────────────────────────────────────────────────────────
  const [cantieri, setCantieri] = useState<any[]>([])
  const [loadingC, setLoadingC] = useState(true)
  const [filtroStato, setFiltroStato] = useState<'tutti' | 'aperto' | 'chiuso'>('aperto')
  const [modalC, setModalC] = useState<'nuovo' | 'modifica' | null>(null)
  const [formC, setFormC] = useState(formVuotoCantiere)
  const [editingC, setEditingC] = useState<any | null>(null)
  const [salvandoC, setSalvandoC] = useState(false)

  // ── Tariffe ───────────────────────────────────────────────────────────────
  const [tariffe, setTariffe] = useState<any[]>([])
  const [loadingT, setLoadingT] = useState(true)
  const [modalT, setModalT] = useState<'nuovo' | 'modifica' | null>(null)
  const [formT, setFormT] = useState(formVuotoTariffa)
  const [editingT, setEditingT] = useState<any | null>(null)
  const [salvandoT, setSalvandoT] = useState(false)

  // ── Costi per cantiere (da presenze) ─────────────────────────────────────
  const [costiMap, setCostiMap] = useState<Record<string, { ore: number; costo: number }>>({})

  useEffect(() => { loadCantieri(); loadTariffe() }, [])

  async function loadCantieri() {
    setLoadingC(true)
    const { data } = await supabase.from('cantieri').select('*').order('stato').order('nome')
    setCantieri(data || [])
    setLoadingC(false)
    // Dopo aver caricato i cantieri, calcola i costi
    if (data && data.length > 0) calcolaCosti(data)
  }

  async function loadTariffe() {
    setLoadingT(true)
    const { data } = await supabase.from('tariffe_mansioni').select('*').order('mansione')
    setTariffe(data || [])
    setLoadingT(false)
  }

  async function calcolaCosti(cantieriList: any[]) {
    // Carica presenze con cantiere_nome e dipendente (per mansione)
    const { data: pres } = await supabase
      .from('presenze')
      .select('cantiere_nome, ore, dipendente_id')
      .eq('approvato', true)
      .gt('ore', 0)

    const { data: dip } = await supabase
      .from('dipendenti')
      .select('id, mansione')

    const { data: tar } = await supabase
      .from('tariffe_mansioni')
      .select('mansione, tariffa_oraria')

    if (!pres || !dip || !tar) return

    const dipMap: Record<string, string> = {}
    for (const d of dip) dipMap[d.id] = d.mansione || ''

    const tarMap: Record<string, number> = {}
    for (const t of tar) tarMap[t.mansione] = Number(t.tariffa_oraria)

    const mappa: Record<string, { ore: number; costo: number }> = {}
    for (const p of pres) {
      if (!p.cantiere_nome) continue
      const nome = p.cantiere_nome.trim()
      if (!mappa[nome]) mappa[nome] = { ore: 0, costo: 0 }
      const ore = Number(p.ore) || 0
      const mansione = dipMap[p.dipendente_id] || ''
      const tariffa = tarMap[mansione] || 0
      mappa[nome].ore += ore
      mappa[nome].costo += ore * tariffa * 8 // ore è 0-1 (1=giorno=8h), moltiplico per 8
    }
    setCostiMap(mappa)
  }

  // ── CRUD Cantieri ─────────────────────────────────────────────────────────
  function apriNuovoCantiere() {
    setFormC({ ...formVuotoCantiere, data_apertura: new Date().toISOString().split('T')[0] })
    setEditingC(null)
    setModalC('nuovo')
  }

  function apriModificaCantiere(c: any) {
    setFormC({
      nome: c.nome, cliente: c.cliente || '', indirizzo: c.indirizzo || '',
      stato: c.stato, data_apertura: c.data_apertura || '', data_chiusura: c.data_chiusura || '',
      note: c.note || ''
    })
    setEditingC(c)
    setModalC('modifica')
  }

  async function salvaCantiere() {
    if (!formC.nome.trim()) { alert('Inserisci il nome del cantiere'); return }
    setSalvandoC(true)
    const payload = {
      nome: formC.nome.trim(),
      cliente: formC.cliente.trim() || null,
      indirizzo: formC.indirizzo.trim() || null,
      stato: formC.stato,
      data_apertura: formC.data_apertura || null,
      data_chiusura: formC.data_chiusura || null,
      note: formC.note.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (editingC) {
      const { error } = await supabase.from('cantieri').update(payload).eq('id', editingC.id)
      if (error) { alert('Errore: ' + error.message); setSalvandoC(false); return }
    } else {
      const { error } = await supabase.from('cantieri').insert(payload)
      if (error) { alert('Errore: ' + error.message); setSalvandoC(false); return }
    }
    setSalvandoC(false)
    setModalC(null)
    loadCantieri()
  }

  async function chiudiCantiere(c: any) {
    if (!confirm(`Chiudere il cantiere "${c.nome}"?`)) return
    await supabase.from('cantieri').update({
      stato: 'chiuso',
      data_chiusura: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString()
    }).eq('id', c.id)
    loadCantieri()
  }

  async function riapriCantiere(c: any) {
    await supabase.from('cantieri').update({ stato: 'aperto', data_chiusura: null, updated_at: new Date().toISOString() }).eq('id', c.id)
    loadCantieri()
  }

  async function eliminaCantiere(c: any) {
    if (!confirm(`Eliminare "${c.nome}"? L'operazione è irreversibile.`)) return
    await supabase.from('cantieri').delete().eq('id', c.id)
    loadCantieri()
  }

  // ── CRUD Tariffe ──────────────────────────────────────────────────────────
  function apriNuovaTariffa() {
    setFormT(formVuotoTariffa)
    setEditingT(null)
    setModalT('nuovo')
  }

  function apriModificaTariffa(t: any) {
    setFormT({ mansione: t.mansione, tariffa_oraria: String(t.tariffa_oraria), note: t.note || '' })
    setEditingT(t)
    setModalT('modifica')
  }

  async function salvaTariffa() {
    if (!formT.mansione.trim()) { alert('Inserisci la mansione'); return }
    if (!formT.tariffa_oraria) { alert('Inserisci la tariffa oraria'); return }
    setSalvandoT(true)
    const payload = {
      mansione: formT.mansione.trim(),
      tariffa_oraria: parseFloat(formT.tariffa_oraria.replace(',', '.')),
      note: formT.note.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (editingT) {
      const { error } = await supabase.from('tariffe_mansioni').update(payload).eq('id', editingT.id)
      if (error) { alert('Errore: ' + error.message); setSalvandoT(false); return }
    } else {
      const { error } = await supabase.from('tariffe_mansioni').insert(payload)
      if (error) { alert('Errore: ' + error.message); setSalvandoT(false); return }
    }
    setSalvandoT(false)
    setModalT(null)
    loadTariffe()
  }

  async function eliminaTariffa(t: any) {
    if (!confirm(`Eliminare tariffa "${t.mansione}"?`)) return
    await supabase.from('tariffe_mansioni').delete().eq('id', t.id)
    loadTariffe()
  }

  // ── Filtri ────────────────────────────────────────────────────────────────
  const cantieriFiltrati = cantieri.filter(c => filtroStato === 'tutti' || c.stato === filtroStato)
  const nAperti = cantieri.filter(c => c.stato === 'aperto').length
  const nChiusi = cantieri.filter(c => c.stato === 'chiuso').length

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden" style={{ height: '100vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold">🏗️ Cantieri</h1>
            <p className="text-xs text-gray-500 mt-0.5">Gestione cantieri aperti e tariffe per mansione</p>
          </div>
          <div className="flex gap-2">
            {(['cantieri', 'tariffe'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`}>
                {t === 'cantieri' ? '🏗️ Cantieri' : '💶 Tariffe mansioni'}
              </button>
            ))}
          </div>
        </div>

        {/* ─── TAB CANTIERI ─── */}
        {tab === 'cantieri' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Barra strumenti */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0 flex-wrap">
              {/* Contatori */}
              <button onClick={() => setFiltroStato('aperto')}
                className={`text-sm px-3 py-1.5 rounded-lg border-2 font-semibold transition-all ${filtroStato === 'aperto' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-300 hover:border-green-500'}`}>
                ✅ Aperti: {nAperti}
              </button>
              <button onClick={() => setFiltroStato('chiuso')}
                className={`text-sm px-3 py-1.5 rounded-lg border-2 font-semibold transition-all ${filtroStato === 'chiuso' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                🔒 Chiusi: {nChiusi}
              </button>
              <button onClick={() => setFiltroStato('tutti')}
                className={`text-sm px-3 py-1.5 rounded-lg border-2 font-semibold transition-all ${filtroStato === 'tutti' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-300 hover:border-blue-400'}`}>
                📋 Tutti: {cantieri.length}
              </button>
              <button className="btn btn-primary ml-auto" onClick={apriNuovoCantiere}>+ Nuovo cantiere</button>
            </div>

            {/* Lista cantieri */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingC && <p className="text-gray-400 text-sm text-center py-12">Caricamento...</p>}
              {!loadingC && cantieriFiltrati.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <p className="text-4xl mb-2">🏗️</p>
                  <p className="text-sm">Nessun cantiere {filtroStato !== 'tutti' ? filtroStato : ''}.</p>
                  <button className="mt-3 btn btn-sm btn-primary" onClick={apriNuovoCantiere}>+ Aggiungi</button>
                </div>
              )}
              {cantieriFiltrati.map(c => {
                const costiC = costiMap[c.nome] || { ore: 0, costo: 0 }
                return (
                  <div key={c.id} className={`bg-white rounded-xl border-2 p-4 shadow-sm flex gap-4 items-start transition-all ${c.stato === 'aperto' ? 'border-green-200' : 'border-gray-200 opacity-70'}`}>
                    {/* Stato badge */}
                    <div className="flex-shrink-0 pt-0.5">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${c.stato === 'aperto' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {c.stato === 'aperto' ? '✅ Aperto' : '🔒 Chiuso'}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">{c.nome}</h3>
                      <div className="flex gap-4 mt-1 flex-wrap text-xs text-gray-500">
                        {c.cliente && <span>👤 {c.cliente}</span>}
                        {c.indirizzo && <span>📍 {c.indirizzo}</span>}
                        {c.data_apertura && <span>📅 Aperto: {new Date(c.data_apertura + 'T12:00:00').toLocaleDateString('it-IT')}</span>}
                        {c.data_chiusura && <span>🔒 Chiuso: {new Date(c.data_chiusura + 'T12:00:00').toLocaleDateString('it-IT')}</span>}
                      </div>
                      {c.note && <p className="text-xs text-gray-400 mt-1">{c.note}</p>}

                      {/* Costi da presenze */}
                      {costiC.ore > 0 && (
                        <div className="mt-2 flex gap-4">
                          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                            ⏱️ {costiC.ore.toFixed(1)} giorni lavorati
                          </span>
                          {costiC.costo > 0 && (
                            <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                              💶 {formatEuro(costiC.costo)} stimati
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Azioni */}
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={() => apriModificaCantiere(c)} className="btn btn-sm text-xs py-1">✏️ Modifica</button>
                      {c.stato === 'aperto'
                        ? <button onClick={() => chiudiCantiere(c)} className="btn btn-sm text-xs py-1 text-orange-600 border-orange-200 hover:bg-orange-50">🔒 Chiudi</button>
                        : <button onClick={() => riapriCantiere(c)} className="btn btn-sm text-xs py-1 text-green-600 border-green-200 hover:bg-green-50">✅ Riapri</button>
                      }
                      <button onClick={() => eliminaCantiere(c)} className="btn btn-sm text-xs py-1 text-red-500 border-red-200 hover:bg-red-50">🗑️</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── TAB TARIFFE ─── */}
        {tab === 'tariffe' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-base">💶 Tariffe per mansione</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Costo orario fisso per ogni mansione — usato per calcolare i costi cantiere dalle presenze approvate</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={apriNuovaTariffa}>+ Nuova mansione</button>
              </div>

              {loadingT && <p className="text-gray-400 text-sm text-center py-8">Caricamento...</p>}
              {!loadingT && tariffe.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                  <p className="text-3xl mb-2">💶</p>
                  <p className="text-sm">Nessuna tariffa configurata.</p>
                  <p className="text-xs mt-1 text-gray-400">Aggiungi le mansioni con il relativo costo orario.</p>
                  <button className="mt-3 btn btn-sm btn-primary" onClick={apriNuovaTariffa}>+ Aggiungi</button>
                </div>
              )}

              {tariffe.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Mansione</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-700">€/ora</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-700">€/giorno (8h)</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tariffe.map((t, i) => (
                        <tr key={t.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          <td className="px-4 py-3 font-medium text-gray-900">{t.mansione}</td>
                          <td className="px-4 py-3 text-right font-semibold text-green-700">{formatEuro(t.tariffa_oraria)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatEuro(t.tariffa_oraria * 8)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => apriModificaTariffa(t)} className="btn btn-sm text-xs py-1">✏️</button>
                              <button onClick={() => eliminaTariffa(t)} className="btn btn-sm text-xs py-1 text-red-500 border-red-200 hover:bg-red-50">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {t => t.note && <p className="text-xs text-gray-400 px-4 py-2">{t.note}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modal cantiere */}
      {modalC && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-base">{modalC === 'nuovo' ? '🏗️ Nuovo cantiere' : '✏️ Modifica cantiere'}</h2>
              <button onClick={() => setModalC(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label">Nome cantiere *</label>
                <input className="input" placeholder="es. Palazzo Rossi, Via Roma 14" value={formC.nome} onChange={e => setFormC({ ...formC, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Cliente / Committente</label>
                  <input className="input" placeholder="Nome cliente..." value={formC.cliente} onChange={e => setFormC({ ...formC, cliente: e.target.value })} />
                </div>
                <div>
                  <label className="label">Stato</label>
                  <select className="input" value={formC.stato} onChange={e => setFormC({ ...formC, stato: e.target.value })}>
                    <option value="aperto">✅ Aperto</option>
                    <option value="chiuso">🔒 Chiuso</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Indirizzo</label>
                <input className="input" placeholder="Via, città..." value={formC.indirizzo} onChange={e => setFormC({ ...formC, indirizzo: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Data apertura</label>
                  <input type="date" className="input" value={formC.data_apertura} onChange={e => setFormC({ ...formC, data_apertura: e.target.value })} />
                </div>
                <div>
                  <label className="label">Data chiusura</label>
                  <input type="date" className="input" value={formC.data_chiusura} onChange={e => setFormC({ ...formC, data_chiusura: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Note</label>
                <textarea className="input h-16 resize-none" value={formC.note} onChange={e => setFormC({ ...formC, note: e.target.value })} />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button className="btn" onClick={() => setModalC(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaCantiere} disabled={salvandoC}>
                {salvandoC ? 'Salvataggio...' : modalC === 'nuovo' ? 'Aggiungi' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal tariffa */}
      {modalT && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-base">{modalT === 'nuovo' ? '+ Nuova tariffa' : '✏️ Modifica tariffa'}</h2>
              <button onClick={() => setModalT(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label">Mansione *</label>
                <input className="input" placeholder="es. Caposquadra, Operaio, Apprendista..." value={formT.mansione} onChange={e => setFormT({ ...formT, mansione: e.target.value })} />
              </div>
              <div>
                <label className="label">Tariffa oraria (€/h) *</label>
                <input className="input" placeholder="es. 22,50" value={formT.tariffa_oraria} onChange={e => setFormT({ ...formT, tariffa_oraria: e.target.value })} />
                {formT.tariffa_oraria && !isNaN(parseFloat(formT.tariffa_oraria.replace(',', '.'))) && (
                  <p className="text-xs text-gray-500 mt-1">
                    → {formatEuro(parseFloat(formT.tariffa_oraria.replace(',', '.')) * 8)} al giorno (8h)
                  </p>
                )}
              </div>
              <div>
                <label className="label">Note</label>
                <input className="input" placeholder="Eventuali note..." value={formT.note} onChange={e => setFormT({ ...formT, note: e.target.value })} />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button className="btn" onClick={() => setModalT(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaTariffa} disabled={salvandoT}>
                {salvandoT ? 'Salvataggio...' : modalT === 'nuovo' ? 'Aggiungi' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
