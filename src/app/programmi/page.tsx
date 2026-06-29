'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

// ── Testo fisso del messaggio ──
const HEADER = `LEGGERE ATTENTAMENTE\nLE DISPOSIZIONI ORGANIZZATIVE ;\n*VERIFICARE SCHEDA ATTREZZI FURGONE PRIMA DI PARTIRE SIETE RESPONSABILI DELL'ATTREZZATURA ASSEGNATA\n⚠️"Ricordo ai Capi Squadra  contrassegnati( " ) che sono responsabili della produzione in cantiere e delle comunicazioni con la Direzione ufficio.⚠️\n——`
const FOOTER = `⚠️ VERIFICARE SCHEDA ATTREZZI CON FURGONE PRIMA DI PARTIRE.⚠️\n*La Collaborazione con i vostri colleghi è necessaria per fare funzionare la squadra.*\nGrazie 🏗️🔝`

interface Persona {
  id: string
  nome: string
  capocantiere: boolean
}

interface Mezzo {
  id: string
  nome: string
  targa: string | null
}

interface Lavorazione {
  id: string
  nome: string
  persone: Persona[]
}

interface CantiereProgramma {
  id: string
  nome: string
  note: string
  lavorazioni: Lavorazione[]
  mezzi: Mezzo[]
}

function genId() { return Math.random().toString(36).slice(2, 9) }

export default function ProgrammiPage() {
  const [dipendenti, setDipendenti] = useState<any[]>([])
  const [mezziDB, setMezziDB] = useState<Mezzo[]>([])
  const [cantieri, setCantieri] = useState<CantiereProgramma[]>([])
  const [loading, setLoading] = useState(true)
  const [messaggio, setMessaggio] = useState('')
  const [copiato, setCopiato] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [dataProgr, setDataProgr] = useState(new Date().toISOString().split('T')[0])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Traccia quali dipendenti e mezzi sono già usati
  const dipendentiUsati = new Set(
    cantieri.flatMap(c => c.lavorazioni.flatMap(l => l.persone.map(p => p.id)))
  )
  const mezziUsati = new Set(cantieri.flatMap(c => c.mezzi.map(m => m.id)))

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: dip }, { data: mez }, { data: prog }] = await Promise.all([
      supabase.from('dipendenti').select('id,nome,cognome,attivo').eq('attivo', true).order('nome'),
      supabase.from('mezzi').select('id,nome,targa').eq('attivo', true).order('nome'),
      supabase.from('programma_giornaliero').select('*').order('created_at', { ascending: false }).limit(1),
    ])
    setDipendenti(dip || [])
    setMezziDB(mez || [])
    if (prog && prog.length > 0) {
      setCantieri(prog[0].cantieri || [])
      setDataProgr(prog[0].data || new Date().toISOString().split('T')[0])
      generaMessaggio(prog[0].cantieri || [])
    }
    setLoading(false)
  }

  function nomeDip(d: any) { return `${d.nome}${d.cognome ? ' ' + d.cognome : ''}`.trim() }
  function nomeMezzo(m: Mezzo) { return m.targa ? `${m.nome} ${m.targa}` : m.nome }

  // ── Genera il testo WhatsApp ──
  function generaMessaggio(list: CantiereProgramma[]) {
    const righe: string[] = [HEADER, '']
    for (const c of list) {
      // Nome cantiere
      righe.push(`-${c.nome}${c.note ? ' +\n' + c.note : ''} =`)
      // Lavorazioni
      for (const lav of c.lavorazioni) {
        if (lav.nome) righe.push(`++${lav.nome}`)
        const parti = lav.persone.map((p, i) =>
          i === 0 ? `"${p.nome}` : p.nome
        )
        if (parti.length > 0) righe.push(parti.join(' + '))
      }
      // Mezzi
      if (c.mezzi.length > 0) {
        righe.push(c.mezzi.map(m => `*${nomeMezzo(m)}`).join('+'))
      }
      righe.push('')
    }
    righe.push(FOOTER)
    const msg = righe.join('\n')
    setMessaggio(msg)
    return msg
  }

  function aggiornaEGenera(nuoviCantieri: CantiereProgramma[]) {
    setCantieri(nuoviCantieri)
    generaMessaggio(nuoviCantieri)
  }

  function aggiungiCantiere() {
    const nuovo: CantiereProgramma = {
      id: genId(), nome: '', note: '',
      lavorazioni: [{ id: genId(), nome: '', persone: [] }],
      mezzi: []
    }
    aggiornaEGenera([...cantieri, nuovo])
  }

  function rimuoviCantiere(cid: string) {
    aggiornaEGenera(cantieri.filter(c => c.id !== cid))
  }

  function aggiornaCantiere(cid: string, campo: string, val: string) {
    aggiornaEGenera(cantieri.map(c => c.id === cid ? { ...c, [campo]: val } : c))
  }

  function aggiungiLavorazione(cid: string) {
    aggiornaEGenera(cantieri.map(c => c.id === cid
      ? { ...c, lavorazioni: [...c.lavorazioni, { id: genId(), nome: '', persone: [] }] }
      : c))
  }

  function rimuoviLavorazione(cid: string, lid: string) {
    aggiornaEGenera(cantieri.map(c => c.id === cid
      ? { ...c, lavorazioni: c.lavorazioni.filter(l => l.id !== lid) }
      : c))
  }

  function aggiornaLavorazione(cid: string, lid: string, nome: string) {
    aggiornaEGenera(cantieri.map(c => c.id === cid
      ? { ...c, lavorazioni: c.lavorazioni.map(l => l.id === lid ? { ...l, nome } : l) }
      : c))
  }

  function aggiungiPersona(cid: string, lid: string, dipId: string, capocantiere: boolean) {
    const dip = dipendenti.find(d => d.id === dipId)
    if (!dip) return
    const persona: Persona = { id: dipId, nome: nomeDip(dip), capocantiere }
    aggiornaEGenera(cantieri.map(c => c.id === cid
      ? { ...c, lavorazioni: c.lavorazioni.map(l => l.id === lid
          ? { ...l, persone: [...l.persone, persona] }
          : l) }
      : c))
  }

  function rimuoviPersona(cid: string, lid: string, dipId: string) {
    aggiornaEGenera(cantieri.map(c => c.id === cid
      ? { ...c, lavorazioni: c.lavorazioni.map(l => l.id === lid
          ? { ...l, persone: l.persone.filter(p => p.id !== dipId) }
          : l) }
      : c))
  }

  function toggleCapocantiere(cid: string, lid: string, dipId: string) {
    aggiornaEGenera(cantieri.map(c => c.id === cid
      ? { ...c, lavorazioni: c.lavorazioni.map(l => l.id === lid
          ? { ...l, persone: l.persone.map(p => p.id === dipId ? { ...p, capocantiere: !p.capocantiere } : p) }
          : l) }
      : c))
  }

  function aggiungiMezzo(cid: string, mezzoId: string) {
    const m = mezziDB.find(x => x.id === mezzoId)
    if (!m) return
    aggiornaEGenera(cantieri.map(c => c.id === cid
      ? { ...c, mezzi: [...c.mezzi, m] }
      : c))
  }

  function rimuoviMezzo(cid: string, mezzoId: string) {
    aggiornaEGenera(cantieri.map(c => c.id === cid
      ? { ...c, mezzi: c.mezzi.filter(m => m.id !== mezzoId) }
      : c))
  }

  async function salva() {
    setSalvando(true)
    // Cancella il vecchio e inserisce il nuovo (un solo record alla volta)
    await supabase.from('programma_giornaliero').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('programma_giornaliero').insert({
      data: dataProgr, cantieri, updated_at: new Date().toISOString()
    })
    setSalvando(false)
  }

  function nuovoProgramma() {
    if (!confirm('Creare un nuovo programma? Quello attuale verrà sostituito.')) return
    setCantieri([])
    setMessaggio('')
    setDataProgr(new Date().toISOString().split('T')[0])
  }

  async function copiaMessaggio() {
    await navigator.clipboard.writeText(messaggio)
    setCopiato(true)
    setTimeout(() => setCopiato(false), 2000)
  }

  function stampa() { window.print() }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">📋 Programma giornaliero</h1>
            <p className="text-xs text-gray-500 mt-0.5">Il programma rimane finché non ne crei uno nuovo</p>
          </div>
          <div className="flex gap-2 items-center">
            <input type="date" className="input text-sm" value={dataProgr}
              onChange={e => setDataProgr(e.target.value)} />
            <button className="btn btn-sm" onClick={nuovoProgramma}>🆕 Nuovo</button>
            <button className="btn btn-sm btn-primary" onClick={salva} disabled={salvando}>
              {salvando ? 'Salvo...' : '💾 Salva'}
            </button>
            <button className="btn btn-sm" onClick={stampa}>🖨️ Stampa</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── COLONNA SINISTRA: BUILDER ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Cantieri</h2>
              <button className="btn btn-sm btn-primary" onClick={aggiungiCantiere}>+ Cantiere</button>
            </div>

            {loading ? (
              <div className="card text-center py-8 text-gray-400">Caricamento...</div>
            ) : cantieri.length === 0 ? (
              <div className="card text-center py-8 text-gray-400">
                Nessun cantiere. Clicca "+ Cantiere" per iniziare.
              </div>
            ) : cantieri.map((c, ci) => (
              <div key={c.id} className="card border-l-4 border-l-blue-500">
                <div className="flex items-start gap-2 mb-3">
                  <div className="flex-1">
                    <input className="input font-semibold text-sm" placeholder="Nome cantiere *"
                      value={c.nome} onChange={e => aggiornaCantiere(c.id, 'nome', e.target.value)} />
                    <textarea className="input mt-2 text-xs resize-none h-16"
                      placeholder="Note (orari speciali, istruzioni, ecc.)"
                      value={c.note} onChange={e => aggiornaCantiere(c.id, 'note', e.target.value)} />
                  </div>
                  <button className="text-red-400 hover:text-red-600 text-lg mt-1"
                    onClick={() => rimuoviCantiere(c.id)}>×</button>
                </div>

                {/* Lavorazioni */}
                <div className="space-y-3 mb-3">
                  {c.lavorazioni.map((lav, li) => (
                    <div key={lav.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <input className="input text-xs py-1 flex-1" placeholder="Lavorazione (es. Intonaco, Copertura...)"
                          value={lav.nome} onChange={e => aggiornaLavorazione(c.id, lav.id, e.target.value)} />
                        {c.lavorazioni.length > 1 && (
                          <button className="text-red-400 hover:text-red-600 text-sm"
                            onClick={() => rimuoviLavorazione(c.id, lav.id)}>×</button>
                        )}
                      </div>

                      {/* Persone assegnate */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {lav.persone.map((p, pi) => (
                          <div key={p.id} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${p.capocantiere ? 'bg-amber-50 border-amber-400 text-amber-800' : 'bg-white border-gray-300 text-gray-700'}`}>
                            {p.capocantiere && <span className="font-bold">"</span>}
                            <span>{p.nome}</span>
                            <button className="text-gray-400 hover:text-amber-600 ml-0.5"
                              title={p.capocantiere ? 'Rimuovi capocantiere' : 'Rendi capocantiere'}
                              onClick={() => toggleCapocantiere(c.id, lav.id, p.id)}>
                              {p.capocantiere ? '★' : '☆'}
                            </button>
                            <button className="text-gray-300 hover:text-red-500 ml-0.5"
                              onClick={() => rimuoviPersona(c.id, lav.id, p.id)}>×</button>
                          </div>
                        ))}
                      </div>

                      {/* Aggiungi persona */}
                      <select className="input text-xs py-1" value=""
                        onChange={e => {
                          if (!e.target.value) return
                          const isCapo = lav.persone.length === 0 // primo = capocantiere
                          aggiungiPersona(c.id, lav.id, e.target.value, isCapo)
                          e.target.value = ''
                        }}>
                        <option value="">+ Aggiungi persona...</option>
                        {dipendenti
                          .filter(d => !dipendentiUsati.has(d.id))
                          .map(d => (
                            <option key={d.id} value={d.id}>{nomeDip(d)}</option>
                          ))}
                      </select>
                    </div>
                  ))}
                </div>

                <button className="btn btn-sm text-xs mb-3" onClick={() => aggiungiLavorazione(c.id)}>
                  + Lavorazione
                </button>

                {/* Mezzi */}
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex flex-wrap gap-1 mb-2">
                    {c.mezzi.map(m => (
                      <div key={m.id} className="flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 text-blue-800 px-2 py-1 rounded-full">
                        <span>🚐 {nomeMezzo(m)}</span>
                        <button className="text-blue-300 hover:text-red-500 ml-0.5"
                          onClick={() => rimuoviMezzo(c.id, m.id)}>×</button>
                      </div>
                    ))}
                  </div>
                  <select className="input text-xs py-1" value=""
                    onChange={e => {
                      if (!e.target.value) return
                      aggiungiMezzo(c.id, e.target.value)
                      e.target.value = ''
                    }}>
                    <option value="">🚐 Aggiungi mezzo...</option>
                    {mezziDB
                      .filter(m => !mezziUsati.has(m.id))
                      .map(m => (
                        <option key={m.id} value={m.id}>{nomeMezzo(m)}</option>
                      ))}
                  </select>
                </div>
              </div>
            ))}

            {cantieri.length > 0 && (
              <button className="btn btn-primary w-full" onClick={aggiungiCantiere}>+ Aggiungi cantiere</button>
            )}
          </div>

          {/* ── COLONNA DESTRA: ANTEPRIMA MESSAGGIO ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">📱 Anteprima messaggio WhatsApp</h2>
              <button
                className={`btn btn-sm ${copiato ? 'btn-success' : 'btn-primary'}`}
                onClick={copiaMessaggio}>
                {copiato ? '✓ Copiato!' : '📋 Copia'}
              </button>
            </div>
            <div className="bg-[#128C7E] rounded-xl p-1">
              <div className="bg-[#ECE5DD] rounded-lg p-3 min-h-96">
                <div className="bg-white rounded-lg p-3 shadow-sm max-w-xs ml-auto">
                  <pre className="text-xs whitespace-pre-wrap font-sans text-gray-800 leading-relaxed">
                    {messaggio || 'Il messaggio apparirà qui quando aggiungi cantieri...'}
                  </pre>
                  <p className="text-right text-gray-400 text-xs mt-1">
                    {new Date(dataProgr).toLocaleDateString('it-IT')} ✓✓
                  </p>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">
              Copia il testo e incollalo nel gruppo WhatsApp
            </p>
          </div>
        </div>
      </main>

      {/* ── STILI STAMPA ── */}
      <style jsx global>{`
        @media print {
          .flex.min-h-screen > aside { display: none !important; }
          .flex.min-h-screen > main { padding: 0 !important; }
          .grid.grid-cols-1 { display: block !important; }
          .grid.grid-cols-1 > div:first-child { display: none !important; }
          .grid.grid-cols-1 > div:last-child { display: block !important; }
          .bg-\\[\\#128C7E\\] { background: white !important; border: 1px solid #ddd; }
          .bg-\\[\\#ECE5DD\\] { background: white !important; }
          .bg-white.rounded-lg { box-shadow: none !important; max-width: 100% !important; }
          button, .btn { display: none !important; }
          input, textarea, select { display: none !important; }
          pre { font-size: 12pt !important; }
          h1, h2, p.text-xs { display: none !important; }
        }
      `}</style>
    </div>
  )
}
