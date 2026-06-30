'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const HEADER = `LEGGERE ATTENTAMENTE\nLE DISPOSIZIONI ORGANIZZATIVE ;\n*VERIFICARE SCHEDA ATTREZZI FURGONE PRIMA DI PARTIRE SIETE RESPONSABILI DELL'ATTREZZATURA ASSEGNATA\n⚠️"Ricordo ai Capi Squadra  contrassegnati( " ) che sono responsabili della produzione in cantiere e delle comunicazioni con la Direzione ufficio.⚠️\n——`
const FOOTER = `⚠️ VERIFICARE SCHEDA ATTREZZI CON FURGONE PRIMA DI PARTIRE.⚠️\n*La Collaborazione con i vostri colleghi è necessaria per fare funzionare la squadra.*\nGrazie 🏗️🔝`

function genId() { return Math.random().toString(36).slice(2, 9) }

interface Persona { id: string; nomeBreve: string; nomeFull: string; capocantiere: boolean }
interface Mezzo { id: string; nome: string }
interface Lavorazione { id: string; nome: string; persone: Persona[] }
interface Cantiere { id: string; nome: string; note: string; lavorazioni: Lavorazione[]; mezzi: Mezzo[] }

type Societa = 'BC General Service' | 'Filosofia'

export default function ProgrammiPage() {
  const [societaAttiva, setSocietaAttiva] = useState<Societa>('BC General Service')
  const [dipendenti, setDipendenti] = useState<any[]>([])
  const [mezziDB, setMezziDB] = useState<any[]>([])
  const [programmi, setProgrammi] = useState<Record<Societa, Cantiere[]>>({
    'BC General Service': [],
    'Filosofia': [],
  })
  const [loading, setLoading] = useState(true)
  const [copiato, setCopiato] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [dataProgr, setDataProgr] = useState(new Date().toISOString().split('T')[0])
  const [vistaPool, setVistaPool] = useState<'liberi' | 'tutti'>('liberi')
  const [tabMobile, setTabMobile] = useState<'pool' | 'cantieri' | 'anteprima'>('cantieri')

  const cantieri = programmi[societaAttiva]
  const mezziSocieta = mezziDB.filter(m => (m.societa || 'BC General Service') === societaAttiva)

  const dipUsati = new Set(cantieri.flatMap(c => c.lavorazioni.flatMap(l => l.persone.map(p => p.id))))
  const mezziUsati = new Set(cantieri.flatMap(c => c.mezzi.map(m => m.id)))

  const dipPerAzienda = dipendenti.reduce((acc, d) => {
    const libero = !dipUsati.has(d.id)
    if (vistaPool === 'liberi' && !libero) return acc
    if (!acc[d.azienda]) acc[d.azienda] = []
    acc[d.azienda].push({ ...d, libero })
    return acc
  }, {} as Record<string, any[]>)

  const aziendeOrdinate = Object.keys(dipPerAzienda).sort((a, b) => {
    if (a.toUpperCase().startsWith('BC')) return -1
    if (b.toUpperCase().startsWith('BC')) return 1
    return a.localeCompare(b)
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: dip }, { data: mez }, { data: progBC }, { data: progFil }] = await Promise.all([
      supabase.from('dipendenti').select('id,nome,cognome,azienda,nome_programma,foto_url').eq('attivo', true).order('cognome'),
      supabase.from('mezzi').select('id,nome,targa,posti,societa').eq('attivo', true).order('nome'),
      supabase.from('programma_giornaliero').select('*').eq('societa', 'BC General Service').order('created_at', { ascending: false }).limit(1),
      supabase.from('programma_giornaliero').select('*').eq('societa', 'Filosofia').order('created_at', { ascending: false }).limit(1),
    ])
    setDipendenti(dip || [])
    setMezziDB(mez || [])
    const nuoviProgrammi: Record<Societa, Cantiere[]> = { 'BC General Service': [], 'Filosofia': [] }
    if (progBC && progBC.length > 0) {
      nuoviProgrammi['BC General Service'] = progBC[0].cantieri || []
      setDataProgr(progBC[0].data || new Date().toISOString().split('T')[0])
    }
    if (progFil && progFil.length > 0) {
      nuoviProgrammi['Filosofia'] = progFil[0].cantieri || []
    }
    setProgrammi(nuoviProgrammi)
    setLoading(false)
  }

  function nomeBreve(d: any) { return d.nome_programma || d.nome || '' }
  function labelMezzoUI(m: any) { return m.posti ? `${m.nome} (${m.posti}p)` : m.nome }

  function generaMessaggio(list: Cantiere[]) {
    const righe: string[] = [HEADER, '']
    for (const c of list) {
      if (!c.nome) continue
      righe.push(`-${c.nome}${c.note ? ' +\n' + c.note : ''} =`)
      for (const lav of c.lavorazioni) {
        if (lav.nome) righe.push(`++${lav.nome}`)
        if (lav.persone.length > 0) {
          const parti = lav.persone.map((p, i) => i === 0 ? `"${p.nomeBreve}` : p.nomeBreve)
          righe.push(parti.join(' + '))
        }
      }
      if (c.mezzi.length > 0) righe.push(c.mezzi.map(m => `*${m.nome}`).join('+'))
      righe.push('')
    }
    righe.push(FOOTER)
    return righe.join('\n')
  }

  const messaggio = generaMessaggio(cantieri)

  function update(nuoviCantieri: Cantiere[]) {
    setProgrammi(prev => ({ ...prev, [societaAttiva]: nuoviCantieri }))
  }

  function aggiungiPersona(cid: string, lid: string, dip: any) {
    if (dipUsati.has(dip.id)) return
    const altraSoc = dovePiazzatoAltraSocieta(dip.id)
    if (altraSoc) {
      const ok = confirm(`⚠️ ${nomeBreve(dip)} è già assegnato oggi a "${altraSoc.cantiere}" (${altraSoc.societa}).\n\nVuoi comunque metterlo anche qui?`)
      if (!ok) return
    }
    const persona: Persona = { id: dip.id, nomeBreve: nomeBreve(dip), nomeFull: `${dip.cognome} ${dip.nome}`.trim(), capocantiere: false }
    update(cantieri.map(c => c.id === cid
      ? { ...c, lavorazioni: c.lavorazioni.map(l => {
          if (l.id !== lid) return l
          const isFirst = l.persone.length === 0
          return { ...l, persone: [...l.persone, { ...persona, capocantiere: isFirst }] }
        })}
      : c))
  }

  function rimuoviPersona(cid: string, lid: string, dipId: string) {
    update(cantieri.map(c => c.id === cid
      ? { ...c, lavorazioni: c.lavorazioni.map(l => l.id === lid ? { ...l, persone: l.persone.filter(p => p.id !== dipId) } : l) }
      : c))
  }

  function toggleCapo(cid: string, lid: string, dipId: string) {
    update(cantieri.map(c => c.id === cid
      ? { ...c, lavorazioni: c.lavorazioni.map(l => l.id === lid
          ? { ...l, persone: l.persone.map(p => p.id === dipId ? { ...p, capocantiere: !p.capocantiere } : p) }
          : l) }
      : c))
  }

  function aggiungiMezzo(cid: string, m: any) {
    if (mezziUsati.has(m.id)) return
    update(cantieri.map(c => c.id === cid ? { ...c, mezzi: [...c.mezzi, { id: m.id, nome: m.nome }] } : c))
  }

  function rimuoviMezzo(cid: string, mezzoId: string) {
    update(cantieri.map(c => c.id === cid ? { ...c, mezzi: c.mezzi.filter(m => m.id !== mezzoId) } : c))
  }

  function aggiungiCantiere() {
    update([...cantieri, { id: genId(), nome: '', note: '', lavorazioni: [{ id: genId(), nome: '', persone: [] }], mezzi: [] }])
  }

  function rimuoviCantiere(cid: string) { update(cantieri.filter(c => c.id !== cid)) }
  function aggiornaCantiere(cid: string, campo: string, val: string) { update(cantieri.map(c => c.id === cid ? { ...c, [campo]: val } : c)) }
  function aggiungiLavorazione(cid: string) {
    update(cantieri.map(c => c.id === cid ? { ...c, lavorazioni: [...c.lavorazioni, { id: genId(), nome: '', persone: [] }] } : c))
  }
  function rimuoviLavorazione(cid: string, lid: string) {
    update(cantieri.map(c => c.id === cid ? { ...c, lavorazioni: c.lavorazioni.filter(l => l.id !== lid) } : c))
  }
  function aggiornaLavorazione(cid: string, lid: string, nome: string) {
    update(cantieri.map(c => c.id === cid ? { ...c, lavorazioni: c.lavorazioni.map(l => l.id === lid ? { ...l, nome } : l) } : c))
  }

  async function salva() {
    setSalvando(true)
    for (const soc of ['BC General Service', 'Filosofia'] as Societa[]) {
      await supabase.from('programma_giornaliero').delete().eq('societa', soc)
      await supabase.from('programma_giornaliero').insert({
        data: dataProgr, societa: soc, cantieri: programmi[soc], updated_at: new Date().toISOString()
      })
    }
    setSalvando(false)
  }

  function nuovoProgramma() {
    if (!confirm(`Creare un nuovo programma ${societaAttiva}? Quello attuale per questa società verrà sostituito.`)) return
    setProgrammi(prev => ({ ...prev, [societaAttiva]: [] }))
  }

  async function copiaMessaggio() {
    await navigator.clipboard.writeText(messaggio)
    setCopiato(true); setTimeout(() => setCopiato(false), 2000)
  }

  function dovePiazzato(dipId: string): string {
    for (const c of cantieri) {
      for (const l of c.lavorazioni) {
        if (l.persone.find(p => p.id === dipId)) return c.nome || 'Cantiere senza nome'
      }
    }
    return ''
  }

  // Controlla se la persona è già piazzata nell'ALTRA società (oggi), per avvisare
  // l'utente prima che la metta due volte senza accorgersene
  function dovePiazzatoAltraSocieta(dipId: string): { societa: Societa, cantiere: string } | null {
    const altraSocieta: Societa = societaAttiva === 'BC General Service' ? 'Filosofia' : 'BC General Service'
    const altroProgramma = programmi[altraSocieta]
    for (const c of altroProgramma) {
      for (const l of c.lavorazioni) {
        if (l.persone.find(p => p.id === dipId)) {
          return { societa: altraSocieta, cantiere: c.nome || 'Cantiere senza nome' }
        }
      }
    }
    return null
  }

  function dovePiazzatoMezzo(mezzoId: string): string {
    for (const c of cantieri) {
      if (c.mezzi.find(m => m.id === mezzoId)) return c.nome || 'Cantiere senza nome'
    }
    return ''
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden" style={{ height: '100vh' }}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <div><h1 className="text-lg font-semibold">📋 Programma giornaliero</h1></div>
          <div className="flex gap-2 items-center flex-wrap">
            <input type="date" className="input text-sm py-1 flex-1 md:flex-none" value={dataProgr} onChange={e => setDataProgr(e.target.value)} />
            <button className="btn btn-sm" onClick={nuovoProgramma}>🆕 Nuovo</button>
            <button className="btn btn-sm btn-primary" onClick={salva} disabled={salvando}>{salvando ? '...' : '💾 Salva'}</button>
            <button className="btn btn-sm hidden md:inline-flex" onClick={() => window.print()}>🖨️</button>
          </div>
        </div>

        <div className="flex gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <button onClick={() => setSocietaAttiva('BC General Service')}
            className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold transition-all ${societaAttiva === 'BC General Service' ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-blue-50 text-blue-700 border-blue-300'}`}>
            🏗 BC General Service
          </button>
          <button onClick={() => setSocietaAttiva('Filosofia')}
            className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold transition-all ${societaAttiva === 'Filosofia' ? 'bg-orange-500 text-white border-orange-500 shadow' : 'bg-orange-50 text-orange-700 border-orange-300'}`}>
            🏢 Filosofia
          </button>
        </div>

        {/* Tab bar SOLO mobile — su desktop le 3 colonne sono sempre visibili affiancate */}
        <div className="flex md:hidden border-b border-gray-200 flex-shrink-0 bg-white">
          <button onClick={() => setTabMobile('pool')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tabMobile === 'pool' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500'}`}>
            👥 Persone/Mezzi
          </button>
          <button onClick={() => setTabMobile('cantieri')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tabMobile === 'cantieri' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500'}`}>
            🏗 Cantieri
          </button>
          <button onClick={() => setTabMobile('anteprima')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tabMobile === 'anteprima' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500'}`}>
            📱 Messaggio
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className={`w-full md:w-52 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex-col overflow-hidden ${tabMobile === 'pool' ? 'flex' : 'hidden md:flex'}`}>
            <div className="flex border-b border-gray-200 flex-shrink-0">
              <button onClick={() => setVistaPool('liberi')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${vistaPool === 'liberi' ? 'bg-white text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                Liberi
              </button>
              <button onClick={() => setVistaPool('tutti')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${vistaPool === 'tutti' ? 'bg-white text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                Tutti
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="text-xs text-gray-400 text-center py-4">Caricamento...</p>
              ) : (
                <>
                  {aziendeOrdinate.map(az => (
                    <div key={az}>
                      <div className="px-3 py-1.5 bg-gray-800 sticky top-0 z-10">
                        <p className="text-xs font-medium text-white truncate">{az}</p>
                      </div>
                      {dipPerAzienda[az].map((d: any) => {
                        const usato = dipUsati.has(d.id)
                        const dove = vistaPool === 'tutti' && usato ? dovePiazzato(d.id) : ''
                        const altraSoc = dovePiazzatoAltraSocieta(d.id)
                        return (
                          <div key={d.id}
                            className={`px-3 py-2 border-b border-gray-100 transition-colors ${usato ? 'opacity-40' : 'cursor-grab hover:bg-blue-50'} ${altraSoc ? 'bg-yellow-50' : ''}`}
                            title={usato ? `Piazzato: ${dove}` : altraSoc ? `⚠️ Già in ${altraSoc.societa}: ${altraSoc.cantiere}` : ''}>
                            <div className="flex items-center gap-2">
                              {d.foto_url ? (
                                <img src={d.foto_url} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-gray-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-medium">
                                  {(d.nome?.charAt(0)||'') + (d.cognome?.charAt(0)||'')}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate">{d.nome_programma || d.nome}</p>
                                {d.nome_programma && <p className="text-xs text-gray-400 truncate">{d.cognome} {d.nome}</p>}
                                {dove && <p className="text-xs text-blue-600 truncate">📍 {dove}</p>}
                                {!usato && altraSoc && (
                                  <p className="text-xs text-amber-700 font-medium truncate">⚠️ Già in {altraSoc.societa === 'Filosofia' ? 'Filosofia' : 'BC'}: {altraSoc.cantiere}</p>
                                )}
                              </div>
                              {!usato && !altraSoc && <span className="ml-auto text-gray-300 text-xs flex-shrink-0">⠿</span>}
                              {!usato && altraSoc && <span className="ml-auto text-amber-500 text-xs flex-shrink-0">⚠️</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}

                  <div className={`px-3 py-1.5 sticky top-0 z-10 mt-1 ${societaAttiva === 'Filosofia' ? 'bg-orange-700' : 'bg-blue-800'}`}>
                    <p className="text-xs font-bold text-white">🚐 MEZZI {societaAttiva === 'Filosofia' ? 'FILOSOFIA' : 'BC GENERAL'}</p>
                  </div>
                  {mezziSocieta.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-3 px-2">Nessun mezzo assegnato a {societaAttiva}.</p>
                  )}
                  {mezziSocieta.map(m => {
                    const usato = mezziUsati.has(m.id)
                    const dove = vistaPool === 'tutti' && usato ? dovePiazzatoMezzo(m.id) : ''
                    if (vistaPool === 'liberi' && usato) return null
                    return (
                      <div key={m.id}
                        className={`px-3 py-2 border-b border-gray-100 transition-colors ${usato ? 'opacity-40' : 'cursor-pointer hover:bg-blue-50'}`}
                        title={usato ? `Assegnato: ${dove}` : ''}>
                        <div className="flex items-center justify-between">
                          <p className={`text-xs font-semibold truncate ${societaAttiva === 'Filosofia' ? 'text-orange-800' : 'text-blue-800'}`}>🚐 {m.nome}</p>
                          {m.posti && <span className="text-xs text-gray-400 flex-shrink-0">👥{m.posti}p</span>}
                        </div>
                        {dove && <p className="text-xs text-blue-500 truncate">📍 {dove}</p>}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          <div className={`flex-1 overflow-y-auto p-3 space-y-3 bg-white ${tabMobile === 'cantieri' ? 'block' : 'hidden md:block'}`}>
            <div className={`text-xs font-semibold px-3 py-1.5 rounded-lg inline-block mb-1 ${societaAttiva === 'Filosofia' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
              Stai modificando: {societaAttiva}
            </div>
            {cantieri.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <p className="text-4xl mb-3">🏗</p>
                <p className="text-sm">Nessun cantiere per {societaAttiva}. Aggiungi il primo.</p>
              </div>
            ) : cantieri.map(c => (
              <div key={c.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className={`px-3 py-2 flex items-center gap-2 ${societaAttiva === 'Filosofia' ? 'bg-orange-800' : 'bg-gray-800'}`}>
                  <input className="flex-1 bg-transparent text-white text-sm font-semibold placeholder-gray-300 outline-none"
                    placeholder="Nome cantiere..."
                    value={c.nome} onChange={e => aggiornaCantiere(c.id, 'nome', e.target.value)} />
                  <button onClick={() => rimuoviCantiere(c.id)} className="text-gray-300 hover:text-red-300 text-lg">×</button>
                </div>
                <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                  <input className="w-full text-xs bg-transparent outline-none text-gray-600 placeholder-gray-400"
                    placeholder="Note cantiere (orari speciali, istruzioni...)"
                    value={c.note} onChange={e => aggiornaCantiere(c.id, 'note', e.target.value)} />
                </div>

                <div className="p-3 space-y-2">
                  {c.lavorazioni.map(lav => (
                    <div key={lav.id} className="bg-gray-50 rounded-lg p-2">
                      <div className="flex items-center gap-2 mb-2">
                        <input className="flex-1 input text-xs py-1" placeholder="Lavorazione (es. Intonaco, Copertura...)"
                          value={lav.nome} onChange={e => aggiornaLavorazione(c.id, lav.id, e.target.value)} />
                        {c.lavorazioni.length > 1 && (
                          <button onClick={() => rimuoviLavorazione(c.id, lav.id)} className="text-gray-300 hover:text-red-500 text-sm">×</button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1 mb-2 min-h-6">
                        {lav.persone.map(p => (
                          <div key={p.id} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${p.capocantiere ? 'bg-amber-50 border-amber-400 text-amber-800' : 'bg-white border-gray-300 text-gray-700'}`}>
                            {p.capocantiere && <span className="font-bold text-amber-600">"</span>}
                            <span className="font-medium">{p.nomeBreve}</span>
                            <button onClick={() => toggleCapo(c.id, lav.id, p.id)} className="text-gray-300 hover:text-amber-500 ml-0.5" title="Capocantiere">
                              {p.capocantiere ? '★' : '☆'}
                            </button>
                            <button onClick={() => rimuoviPersona(c.id, lav.id, p.id)} className="text-gray-300 hover:text-red-500 ml-0.5">×</button>
                          </div>
                        ))}
                        {lav.persone.length === 0 && <p className="text-xs text-gray-300 italic">Seleziona persone dalla lista a sinistra</p>}
                      </div>

                      <select className="input text-xs py-1 w-full" value=""
                        onChange={e => {
                          if (!e.target.value) return
                          const dip = dipendenti.find(d => d.id === e.target.value)
                          if (dip) aggiungiPersona(c.id, lav.id, dip)
                          e.target.value = ''
                        }}>
                        <option value="">+ Aggiungi persona...</option>
                        {aziendeOrdinate.map(az => (
                          <optgroup key={az} label={az}>
                            {dipendenti.filter(d => d.azienda === az && !dipUsati.has(d.id)).map(d => {
                              const altraSoc = dovePiazzatoAltraSocieta(d.id)
                              return (
                                <option key={d.id} value={d.id}>
                                  {nomeBreve(d)}{d.nome_programma ? ` (${d.cognome} ${d.nome})` : ''}{altraSoc ? ` ⚠️ già in ${altraSoc.societa}` : ''}
                                </option>
                              )
                            })}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  ))}

                  <button onClick={() => aggiungiLavorazione(c.id)} className="btn btn-sm text-xs w-full">+ Lavorazione</button>

                  <div className="border-t border-gray-100 pt-2">
                    <div className="flex flex-wrap gap-1 mb-2">
                      {c.mezzi.map(m => {
                        const mezzoCompleto = mezziSocieta.find(x => x.id === m.id)
                        return (
                          <div key={m.id} className="flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 text-blue-800 px-2 py-0.5 rounded-full">
                            <span>🚐 {mezzoCompleto ? labelMezzoUI(mezzoCompleto) : m.nome}</span>
                            <button onClick={() => rimuoviMezzo(c.id, m.id)} className="text-blue-300 hover:text-red-500 ml-0.5">×</button>
                          </div>
                        )
                      })}
                    </div>
                    <select className="input text-xs py-1 w-full" value=""
                      onChange={e => {
                        if (!e.target.value) return
                        const m = mezziSocieta.find(x => x.id === e.target.value)
                        if (m) aggiungiMezzo(c.id, m)
                        e.target.value = ''
                      }}>
                      <option value="">🚐 Aggiungi mezzo {societaAttiva}...</option>
                      {mezziSocieta.filter(m => !mezziUsati.has(m.id)).map(m => (
                        <option key={m.id} value={m.id}>{labelMezzoUI(m)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}

            <button onClick={aggiungiCantiere} className="btn btn-primary w-full">+ Cantiere {societaAttiva}</button>

            {/* Scorciatoia mobile: salta all'anteprima per copiare il messaggio */}
            {cantieri.length > 0 && (
              <button onClick={() => setTabMobile('anteprima')} className="btn w-full md:hidden text-green-700 border-green-300 bg-green-50">
                📱 Vedi anteprima messaggio
              </button>
            )}
          </div>

          <div className={`w-full md:w-72 flex-shrink-0 border-l border-gray-200 flex-col overflow-hidden ${tabMobile === 'anteprima' ? 'flex' : 'hidden md:flex'}`}>
            <div className={`flex items-center justify-between px-3 py-2 flex-shrink-0 ${societaAttiva === 'Filosofia' ? 'bg-orange-600' : 'bg-[#128C7E]'}`}>
              <span className="text-white text-xs font-semibold">📱 {societaAttiva}</span>
              <button onClick={copiaMessaggio}
                className={`text-xs px-2 py-1 rounded font-medium transition-colors ${copiato ? 'bg-green-400 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}>
                {copiato ? '✓ Copiato!' : '📋 Copia'}
              </button>
            </div>
            <div className="flex-1 bg-[#ECE5DD] overflow-y-auto p-2">
              <div className="bg-white rounded-lg p-2 shadow-sm">
                <pre className="text-xs whitespace-pre-wrap font-sans text-gray-800 leading-relaxed">
                  {cantieri.length === 0 ? `Aggiungi cantieri per ${societaAttiva}...` : messaggio}
                </pre>
                <p className="text-right text-gray-400 text-xs mt-1">{new Date(dataProgr).toLocaleDateString('it-IT')} ✓✓</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style jsx global>{`
        @media print {
          aside, .w-52, .w-72 { display: none !important; }
          .flex-1.flex.flex-col { display: block !important; }
          .flex.flex-1.overflow-hidden > .flex-1 { display: none !important; }
          .flex.flex-1.overflow-hidden > .w-72 { width: 100% !important; border: none !important; display: block !important; }
          .bg-\\[\\#128C7E\\], .bg-orange-600 { background: white !important; }
          .bg-\\[\\#ECE5DD\\] { background: white !important; padding: 0 !important; }
          button { display: none !important; }
          pre { font-size: 11pt !important; line-height: 1.5 !important; }
        }
      `}</style>
    </div>
  )
}
