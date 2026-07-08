'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

function fmt2(n: number) { return n.toFixed(2).replace('.', ',') }
function fmtOre(n: number) { return n % 1 === 0 ? String(Math.round(n)) : fmt2(n) }

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

export default function CassaEdilePage() {
  const oggi = new Date()
  const [mese, setMese] = useState(oggi.getMonth())
  const [anno, setAnno] = useState(oggi.getFullYear())
  const [tab, setTab] = useState<'resoconto' | 'cantiere' | 'spostamenti'>('resoconto')
  const [cantiereSel, setCantiereSel] = useState('')

  // Dati
  const [presenze, setPresenze] = useState<any[]>([])
  const [dipendenti, setDipendenti] = useState<any[]>([])
  const [progetti, setProgetti] = useState<any[]>([])
  const [spostamenti, setSpostamenti] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Modal spostamento
  const [modalSposta, setModalSposta] = useState(false)
  const [formSposta, setFormSposta] = useState({ dipendente_id: '', dipendente_nome: '', cantiere_origine_nome: '', cantiere_destinazione_id: '', ore: '' })
  const [salvandoSposta, setSalvandoSposta] = useState(false)

  useEffect(() => { load() }, [mese, anno])

  async function load() {
    setLoading(true)
    const meseStr = `${anno}-${String(mese + 1).padStart(2, '0')}`
    const dataInizio = `${meseStr}-01`
    const dataFine = new Date(anno, mese + 1, 0).toISOString().split('T')[0]

    const [{ data: pres }, { data: dip }, { data: proj }, { data: sposta }] = await Promise.all([
      supabase.from('presenze').select('*').gte('data', dataInizio).lte('data', dataFine).eq('approvato', true).gt('ore', 0),
      supabase.from('dipendenti').select('id,nome,cognome,azienda,mansione,ordine').eq('attivo', true).order('ordine', { nullsFirst: false }).order('cognome'),
      supabase.from('progetti').select('id,codice,nome,a_congruita,societa').order('nome'),
      supabase.from('ce_spostamenti').select('*').eq('mese', dataInizio),
    ])

    setPresenze(pres || [])
    setDipendenti(dip || [])
    setProgetti(proj || [])
    setSpostamenti(sposta || [])
    setLoading(false)
  }

  // ── Calcolo ore per dipendente × cantiere ──────────────────────────────────
  // Include gli spostamenti: rimuove da cantiere origine, aggiunge a destinazione
  const datiCE = useMemo(() => {
    // Raggruppo presenze per dipendente e cantiere
    const mappa: Record<string, Record<string, number>> = {} // dipId -> cantiereNome -> ore
    for (const p of presenze) {
      if (!p.dipendente_id) continue
      const cantNome = p.is_vario ? null : (p.cantiere_nome || null)
      if (!cantNome) continue // ignoro vario e senza cantiere
      if (!mappa[p.dipendente_id]) mappa[p.dipendente_id] = {}
      const ore = (p.ore || 0) * 8 // converti giorni → ore
      mappa[p.dipendente_id][cantNome] = (mappa[p.dipendente_id][cantNome] || 0) + ore
    }
    // Applico spostamenti
    for (const s of spostamenti) {
      const did = s.dipendente_id
      if (!did) continue
      if (!mappa[did]) mappa[did] = {}
      const orig = s.cantiere_origine_nome
      const dest = s.cantiere_destinazione_nome
      const ore = Number(s.ore) || 0
      if (orig && mappa[did][orig]) mappa[did][orig] = Math.max(0, mappa[did][orig] - ore)
      if (dest) mappa[did][dest] = (mappa[did][dest] || 0) + ore
    }
    return mappa
  }, [presenze, spostamenti])

  // Lista cantieri presenti nel mese (con dati CE)
  const cantieriMese = useMemo(() => {
    const nomi = new Set<string>()
    for (const dipMap of Object.values(datiCE)) {
      for (const nome of Object.keys(dipMap)) { if (dipMap[nome] > 0) nomi.add(nome) }
    }
    return Array.from(nomi).sort()
  }, [datiCE])

  // Dipendenti con almeno un'ora nel mese
  const dipConOre = useMemo(() => {
    return dipendenti.filter(d => {
      const dm = datiCE[d.id]
      return dm && Object.values(dm).some(v => v > 0)
    })
  }, [dipendenti, datiCE])

  // Totale ore per dipendente (somma cantieri)
  function oreTotDip(dipId: string) {
    const dm = datiCE[dipId] || {}
    return Object.values(dm).reduce((s, v) => s + v, 0)
  }
  // Totale ore per cantiere (somma dipendenti)
  function oreTotCantiere(cantNome: string) {
    return dipConOre.reduce((s, d) => s + ((datiCE[d.id] || {})[cantNome] || 0), 0)
  }

  async function salvaSposta() {
    if (!formSposta.dipendente_id || !formSposta.cantiere_origine_nome || !formSposta.cantiere_destinazione_id || !formSposta.ore) {
      alert('Compila tutti i campi'); return
    }
    setSalvandoSposta(true)
    const meseData = `${anno}-${String(mese + 1).padStart(2, '0')}-01`
    const destProj = progetti.find(p => p.id === formSposta.cantiere_destinazione_id)
    const dip = dipendenti.find(d => d.id === formSposta.dipendente_id)
    await supabase.from('ce_spostamenti').insert({
      mese: meseData,
      dipendente_id: formSposta.dipendente_id,
      dipendente_nome: dip ? `${dip.cognome} ${dip.nome}` : '',
      cantiere_origine_nome: formSposta.cantiere_origine_nome,
      cantiere_destinazione_id: formSposta.cantiere_destinazione_id,
      cantiere_destinazione_nome: destProj ? `${destProj.codice} - ${destProj.nome}` : '',
      ore: parseFloat(formSposta.ore.replace(',', '.')) || 0,
    })
    setSalvandoSposta(false)
    setModalSposta(false)
    setFormSposta({ dipendente_id: '', dipendente_nome: '', cantiere_origine_nome: '', cantiere_destinazione_id: '', ore: '' })
    load()
  }

  async function eliminaSposta(id: string) {
    if (!confirm('Eliminare questo spostamento?')) return
    await supabase.from('ce_spostamenti').delete().eq('id', id)
    load()
  }

  // Cantieri NON a congruità nel mese
  const cantieriNonCongruita = useMemo(() => {
    return cantieriMese.filter(nome => {
      const proj = progetti.find(p => `${p.codice} - ${p.nome}` === nome || p.nome === nome)
      return proj && proj.a_congruita === false
    })
  }, [cantieriMese, progetti])

  const meseStr = `${MESI[mese]} ${anno}`

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden" style={{ height: '100vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold">🏗️ Cassa Edile</h1>
            <p className="text-xs text-gray-500 mt-0.5">Generata automaticamente dalle presenze approvate</p>
          </div>
          <div className="flex gap-2 items-center">
            {/* Selettore mese/anno */}
            <select className="input w-36 text-sm" value={mese} onChange={e => setMese(Number(e.target.value))}>
              {MESI.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="input w-24 text-sm" value={anno} onChange={e => setAnno(Number(e.target.value))}>
              {[anno - 1, anno, anno + 1].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button className="btn btn-sm" onClick={() => window.print()}>🖨️ Stampa</button>
          </div>
        </div>

        {/* Avviso cantieri non a congruità */}
        {cantieriNonCongruita.length > 0 && (
          <div className="mx-6 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
            ⚠️ <strong>Cantieri non a congruità:</strong> {cantieriNonCongruita.join(', ')} — 
            <button onClick={() => { setTab('spostamenti'); setModalSposta(true) }} className="underline font-semibold ml-1">Gestisci spostamenti ore →</button>
          </div>
        )}

        {/* Tab */}
        <div className="flex gap-2 px-6 pt-4 border-b border-gray-200 flex-shrink-0">
          <button onClick={() => setTab('resoconto')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'resoconto' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}`}>📊 Resoconto Tot.</button>
          {cantieriMese.map(c => (
            <button key={c} onClick={() => { setTab('cantiere'); setCantiereSel(c) }} className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === 'cantiere' && cantiereSel === c ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {c.length > 18 ? c.slice(0, 18) + '…' : c}
            </button>
          ))}
          <button onClick={() => setTab('spostamenti')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ml-auto ${tab === 'spostamenti' ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-500'}`}>↔️ Spostamenti ({spostamenti.length})</button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading && <p className="text-gray-400 text-sm text-center py-12">Caricamento...</p>}

          {/* ── RESOCONTO TOT ── */}
          {!loading && tab === 'resoconto' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">Resoconto Cassa Edile — {meseStr}</h2>
                <span className="text-xs text-gray-500">{dipConOre.length} dipendenti · {cantieriMese.length} cantieri</span>
              </div>
              {dipConOre.length === 0 ? (
                <div className="text-center text-gray-400 py-16"><p className="text-3xl mb-2">📋</p><p>Nessuna presenza approvata per {meseStr}</p></div>
              ) : (
                <div className="overflow-auto">
                  <table className="text-xs border-collapse" style={{ minWidth: 600 }}>
                    <thead>
                      <tr>
                        <th className="border border-gray-300 bg-gray-800 text-white px-3 py-2 text-left sticky left-0 z-10 min-w-40">Dipendente</th>
                        {cantieriMese.map(c => {
                          const proj = progetti.find(p => `${p.codice} - ${p.nome}` === c || p.nome === c)
                          const nonCongruita = proj && proj.a_congruita === false
                          return (
                            <th key={c} className={`border border-gray-300 px-2 py-1 text-center font-semibold ${nonCongruita ? 'bg-amber-700 text-white' : 'bg-gray-700 text-white'}`} style={{ minWidth: 70 }}>
                              <span title={nonCongruita ? 'Non a congruità' : ''}>{nonCongruita ? '⚠️ ' : ''}</span>
                              {c.length > 12 ? c.slice(0, 12) + '…' : c}
                            </th>
                          )
                        })}
                        <th className="border border-gray-300 bg-blue-800 text-white px-2 py-2 text-center">Totale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dipConOre.map((d, i) => {
                        const dm = datiCE[d.id] || {}
                        const tot = oreTotDip(d.id)
                        return (
                          <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="border border-gray-300 px-3 py-1.5 font-medium sticky left-0 bg-inherit z-10">{d.cognome} {d.nome}</td>
                            {cantieriMese.map(c => {
                              const ore = dm[c] || 0
                              return (
                                <td key={c} className={`border border-gray-300 text-center py-1 px-1 ${ore > 0 ? 'font-semibold text-blue-800' : 'text-gray-300'}`}>
                                  {ore > 0 ? fmtOre(ore) : '—'}
                                </td>
                              )
                            })}
                            <td className="border border-gray-300 text-center font-bold text-blue-900 bg-blue-50 py-1">{fmtOre(tot)}</td>
                          </tr>
                        )
                      })}
                      {/* Riga totali */}
                      <tr className="bg-gray-800 text-white font-bold">
                        <td className="border border-gray-600 px-3 py-2 sticky left-0 bg-gray-800 z-10">TOTALE</td>
                        {cantieriMese.map(c => (
                          <td key={c} className="border border-gray-600 text-center py-1">{fmtOre(oreTotCantiere(c))}</td>
                        ))}
                        <td className="border border-gray-600 text-center py-1">{fmtOre(dipConOre.reduce((s, d) => s + oreTotDip(d.id), 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── SINGOLO CANTIERE ── */}
          {!loading && tab === 'cantiere' && cantiereSel && (
            <div>
              <h2 className="font-semibold text-sm mb-3">📋 {cantiereSel} — {meseStr}</h2>
              <div className="overflow-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-gray-300 bg-gray-800 text-white px-3 py-2 text-left min-w-40">Dipendente</th>
                      <th className="border border-gray-300 bg-gray-800 text-white px-3 py-2 text-left">Azienda</th>
                      <th className="border border-gray-300 bg-gray-800 text-white px-3 py-2 text-left">Mansione</th>
                      <th className="border border-gray-300 bg-blue-700 text-white px-3 py-2 text-center min-w-20">Ore CE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dipConOre.filter(d => ((datiCE[d.id] || {})[cantiereSel] || 0) > 0).map((d, i) => (
                      <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 px-3 py-1.5 font-medium">{d.cognome} {d.nome}</td>
                        <td className="border border-gray-300 px-3 py-1.5 text-gray-600">{d.azienda}</td>
                        <td className="border border-gray-300 px-3 py-1.5 text-gray-600">{d.mansione || '—'}</td>
                        <td className="border border-gray-300 text-center font-bold text-blue-800 py-1">{fmtOre((datiCE[d.id] || {})[cantiereSel] || 0)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-800 text-white font-bold">
                      <td colSpan={3} className="border border-gray-600 px-3 py-2 text-right">TOTALE</td>
                      <td className="border border-gray-600 text-center py-1">{fmtOre(oreTotCantiere(cantiereSel))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SPOSTAMENTI ── */}
          {!loading && tab === 'spostamenti' && (
            <div className="max-w-3xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-sm">↔️ Spostamenti ore CE — {meseStr}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Sposta ore da cantieri non a congruità verso cantieri aperti. Non modifica le presenze reali.</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => { setFormSposta({ dipendente_id: '', dipendente_nome: '', cantiere_origine_nome: '', cantiere_destinazione_id: '', ore: '' }); setModalSposta(true) }}>+ Nuovo spostamento</button>
              </div>

              {spostamenti.length === 0 ? (
                <div className="text-center text-gray-400 py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                  <p className="text-2xl mb-2">↔️</p>
                  <p className="text-sm">Nessuno spostamento per {meseStr}</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="table-base text-sm">
                    <thead><tr><th>Dipendente</th><th>Da cantiere</th><th>A cantiere</th><th>Ore</th><th>Note</th><th></th></tr></thead>
                    <tbody>
                      {spostamenti.map(s => (
                        <tr key={s.id}>
                          <td>{s.dipendente_nome}</td>
                          <td className="text-amber-700 font-medium">{s.cantiere_origine_nome}</td>
                          <td className="text-green-700 font-medium">{s.cantiere_destinazione_nome}</td>
                          <td className="font-semibold">{fmtOre(s.ore)}</td>
                          <td className="text-xs text-gray-400">{s.note || '—'}</td>
                          <td><button className="btn btn-sm text-red-500" onClick={() => eliminaSposta(s.id)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modal spostamento */}
      {modalSposta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div><h2 className="font-semibold">↔️ Nuovo spostamento ore</h2><p className="text-xs text-gray-500 mt-0.5">{meseStr}</p></div>
              <button onClick={() => setModalSposta(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label">Dipendente *</label>
                <select className="input" value={formSposta.dipendente_id} onChange={e => { const d = dipendenti.find(x => x.id === e.target.value); setFormSposta(f => ({ ...f, dipendente_id: e.target.value, dipendente_nome: d ? `${d.cognome} ${d.nome}` : '', cantiere_origine_nome: '' })) }}>
                  <option value="">— Seleziona —</option>
                  {dipConOre.map(d => <option key={d.id} value={d.id}>{d.cognome} {d.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Cantiere origine (sposta ORE DA qui) *</label>
                <select className="input" value={formSposta.cantiere_origine_nome} onChange={e => setFormSposta(f => ({ ...f, cantiere_origine_nome: e.target.value }))}>
                  <option value="">— Seleziona —</option>
                  {formSposta.dipendente_id && Object.entries(datiCE[formSposta.dipendente_id] || {}).filter(([, ore]) => ore > 0).map(([nome, ore]) => (
                    <option key={nome} value={nome}>{nome} ({fmtOre(ore)} ore)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Cantiere destinazione (sposta ORE A qui) *</label>
                <select className="input" value={formSposta.cantiere_destinazione_id} onChange={e => setFormSposta(f => ({ ...f, cantiere_destinazione_id: e.target.value }))}>
                  <option value="">— Seleziona —</option>
                  {progetti.filter(p => p.a_congruita !== false).map(p => <option key={p.id} value={p.id}>{p.codice} – {p.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Ore da spostare *</label>
                <input className="input" type="number" step="0.5" min="0.5" placeholder="es. 8" value={formSposta.ore} onChange={e => setFormSposta(f => ({ ...f, ore: e.target.value }))} />
                {formSposta.cantiere_origine_nome && formSposta.dipendente_id && (
                  <p className="text-xs text-gray-400 mt-1">Disponibili: {fmtOre((datiCE[formSposta.dipendente_id] || {})[formSposta.cantiere_origine_nome] || 0)} ore</p>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button className="btn" onClick={() => setModalSposta(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaSposta} disabled={salvandoSposta}>{salvandoSposta ? 'Salvataggio...' : '↔️ Salva spostamento'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A3 landscape; margin: 8mm; }
          body * { visibility: hidden !important; }
          main, main * { visibility: visible !important; }
          aside { display: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}
