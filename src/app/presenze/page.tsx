'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const GIORNI_SETTIMANA = ['D','L','M','M','G','V','S']
const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function giorniDelMese(anno: number, mese: number): Date[] {
  const giorni: Date[] = []
  const totale = new Date(anno, mese + 1, 0).getDate()
  for (let i = 1; i <= totale; i++) giorni.push(new Date(anno, mese, i))
  return giorni
}

// ── FIX TIMEZONE ──────────────────────────────────────────────────────────────
// toISOString() converte in UTC: in Italia (UTC+2) la mezzanotte del 1 luglio
// diventa "2026-06-30T22:00:00Z" → split('T')[0] = "2026-06-30" invece di
// "2026-07-01". Uso sempre l'ora locale per costruire la chiave data.
function dateToYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
// ─────────────────────────────────────────────────────────────────────────────

type StatoPresenza = 'presente' | 'parziale' | 'assente'

interface CellaEdit {
  dipId: string
  dipNome: string
  data: string
  stato: StatoPresenza | null
  ore: number | null
}

export default function PresenzeMonthly() {
  const oggi = new Date()
  const [anno, setAnno] = useState(oggi.getFullYear())
  const [mese, setMese] = useState(oggi.getMonth())
  const [dipendenti, setDipendenti] = useState<any[]>([])
  const [presenzeMap, setPresenzeMap] = useState<Record<string, Record<string, { ore: number, approvato: boolean }>>>({})
  const [loading, setLoading] = useState(false)
  const [cellaEdit, setCellaEdit] = useState<CellaEdit | null>(null)
  const [salvandoCella, setSalvandoCella] = useState(false)
  const [hoveredCell, setHoveredCell] = useState<{ dipId: string; dayIdx: number } | null>(null)
  const [giorniNonApprovati, setGiorniNonApprovati] = useState<Set<string>>(new Set())
  const [dipInizioMap, setDipInizioMap] = useState<Record<string, string | null>>({})
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadDati() }, [anno, mese])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setCellaEdit(null)
    }
    if (cellaEdit) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [cellaEdit])

  async function loadDati() {
    setLoading(true)
    const inizio = `${anno}-${String(mese + 1).padStart(2, '0')}-01`
    const fineDate = new Date(anno, mese + 1, 0)
    const fine = `${anno}-${String(mese + 1).padStart(2, '0')}-${String(fineDate.getDate()).padStart(2, '0')}`

    const [{ data: dip }, { data: pres }, { data: nonApprovati }] = await Promise.all([
      supabase.from('dipendenti').select('id,nome,cognome,azienda,ordine,data_inizio_contratto').eq('attivo', true).order('ordine', { ascending: true, nullsFirst: false }).order('cognome').order('nome'),
      supabase.from('presenze').select('dipendente_id,data,ore,approvato').gte('data', inizio).lte('data', fine),
      // Giorni con programma salvato ma presenze non approvate (solo passati)
      supabase.from('programma_giornaliero')
        .select('data')
        .eq('presenze_approvate', false)
        .gte('data', inizio)
        .lte('data', fine)
        .lt('data', new Date().toISOString().split('T')[0]),
    ])

    const dipOrdinati = (dip || []).sort((a: any, b: any) => {
      const aBC = a.azienda.toUpperCase().startsWith('BC')
      const bBC = b.azienda.toUpperCase().startsWith('BC')
      if (aBC && !bBC) return -1
      if (!aBC && bBC) return 1
      const cmpAz = a.azienda.localeCompare(b.azienda)
      if (cmpAz !== 0) return cmpAz
      const cmpCog = a.cognome.localeCompare(b.cognome)
      if (cmpCog !== 0) return cmpCog
      return a.nome.localeCompare(b.nome)
    })
    setDipendenti(dipOrdinati)

    // Mappa dipendente → data inizio contratto
    const inizioMap: Record<string, string | null> = {}
    for (const d of dipOrdinati) inizioMap[d.id] = d.data_inizio_contratto || null
    setDipInizioMap(inizioMap)

    const mappa: Record<string, Record<string, { ore: number, approvato: boolean }>> = {}
    for (const p of pres || []) {
      if (!mappa[p.dipendente_id]) mappa[p.dipendente_id] = {}
      // p.data dal DB è già "YYYY-MM-DD" in ora locale — nessuna conversione necessaria
      mappa[p.dipendente_id][p.data] = { ore: p.ore, approvato: p.approvato }
    }
    setPresenzeMap(mappa)
    setGiorniNonApprovati(new Set((nonApprovati || []).map(r => r.data)))
    setLoading(false)
  }

  const giorni = giorniDelMese(anno, mese)

  const aziendeOrdinate: string[] = []
  const perAzienda: Record<string, any[]> = {}
  for (const d of dipendenti) {
    if (!perAzienda[d.azienda]) { perAzienda[d.azienda] = []; aziendeOrdinate.push(d.azienda) }
    perAzienda[d.azienda].push(d)
  }

  function totaleRiga(dipId: string): number {
    return Object.values(presenzeMap[dipId] || {}).reduce((s, v) => s + v.ore, 0)
  }

  function valoreCella(dipId: string, giorno: Date): { ore: number, approvato: boolean } | null {
    // FIX: usa dateToYMD (ora locale) invece di toISOString() (UTC)
    const key = dateToYMD(giorno)
    return presenzeMap[dipId]?.[key] ?? null
  }

  function oreToStato(ore: number): StatoPresenza {
    if (ore >= 1) return 'presente'
    if (ore > 0) return 'parziale'
    return 'assente'
  }

  function apriCella(dip: any, giorno: Date) {
    const dow = giorno.getDay()
    if (dow === 0) return // domenica non editabile
    const oggiMidnight = new Date(); oggiMidnight.setHours(0,0,0,0)
    if (giorno > oggiMidnight) return // giorni futuri non editabili
    // FIX: usa dateToYMD (ora locale) invece di toISOString() (UTC)
    const key = dateToYMD(giorno)
    const val = presenzeMap[dip.id]?.[key]
    setCellaEdit({
      dipId: dip.id,
      dipNome: `${dip.cognome} ${dip.nome}`,
      data: key,
      stato: val ? oreToStato(val.ore) : null,
      ore: val?.ore ?? null,
    })
  }

  async function salvaCella(stato: StatoPresenza) {
    if (!cellaEdit) return
    setSalvandoCella(true)
    const ore = stato === 'presente' ? 1 : stato === 'parziale' ? 0.5 : 0
    const societa = dipendenti.find(d => d.id === cellaEdit.dipId)?.azienda || 'Manuale'
    const { error } = await supabase.from('presenze').upsert({
      data: cellaEdit.data,
      dipendente_id: cellaEdit.dipId,
      societa,
      stato, ore,
      origine: 'correzione_ufficio',
      approvato: true,
      approvato_da: 'manuale',
      approvato_il: new Date().toISOString(),
    }, { onConflict: 'data,dipendente_id' })

    if (error) {
      alert('Errore salvataggio: ' + error.message)
      setSalvandoCella(false)
      return
    }

    // Aggiorna mappa locale immediatamente senza ricaricare
    setPresenzeMap(prev => ({
      ...prev,
      [cellaEdit.dipId]: { ...(prev[cellaEdit.dipId] || {}), [cellaEdit.data]: { ore, approvato: true } }
    }))
    setSalvandoCella(false)
    setCellaEdit(null)
  }

  async function eliminaCella() {
    if (!cellaEdit) return
    setSalvandoCella(true)
    await supabase.from('presenze').delete().eq('data', cellaEdit.data).eq('dipendente_id', cellaEdit.dipId)
    setPresenzeMap(prev => {
      const nuova = { ...prev }
      if (nuova[cellaEdit.dipId]) {
        nuova[cellaEdit.dipId] = { ...nuova[cellaEdit.dipId] }
        delete nuova[cellaEdit.dipId][cellaEdit.data]
      }
      return nuova
    })
    setSalvandoCella(false)
    setCellaEdit(null)
  }

  function mesePrecedente() { if (mese === 0) { setMese(11); setAnno(a => a - 1) } else setMese(m => m - 1) }
  function meseSuccessivo() { if (mese === 11) { setMese(0); setAnno(a => a + 1) } else setMese(m => m + 1) }

  const oggiStr = dateToYMD(new Date())

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto relative">
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white print:hidden sticky top-0 z-20">
          <h1 className="text-lg font-semibold">📅 Presenze mensili</h1>
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-400 hidden md:block">Clicca su una cella per modificarla</p>
            <div className="flex items-center gap-1">
              <button onClick={mesePrecedente} className="btn btn-sm">‹</button>
              <span className="text-sm font-semibold px-3 py-1 bg-gray-100 rounded-lg min-w-36 text-center">{MESI[mese]} {anno}</span>
              <button onClick={meseSuccessivo} className="btn btn-sm">›</button>
            </div>
            <button onClick={() => window.print()} className="btn btn-sm btn-primary">🖨️ Stampa</button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400"><p>Caricamento presenze...</p></div>
        ) : (
          <div className="p-4 overflow-x-auto">
            <div className="mb-3 print:mb-2">
              <h2 className="text-xl font-bold text-center print:text-lg">{MESI[mese].toUpperCase()} {anno}</h2>
            </div>

            <div className="flex gap-4 mb-3 text-xs print:hidden flex-wrap">
              <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-green-100 border border-green-400 inline-flex items-center justify-center text-green-800 font-bold">1</span> Presente</span>
              <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-amber-100 border border-amber-400 inline-flex items-center justify-center text-amber-800 font-bold text-xs">½</span> Mezza giornata</span>
              <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-red-50 border border-red-300 inline-flex items-center justify-center text-red-600 font-bold">0</span> Assente</span>
              <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-yellow-300 inline-block"></span> Sabato</span>
              <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-red-200 inline-block"></span> Domenica</span>
              <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-red-700 inline-block"></span> Non assunto</span>
            </div>

            <table className="border-collapse text-xs" style={{ fontSize: '10px', minWidth: '100%' }}>
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-800 text-white px-2 py-1 text-left sticky left-0 z-10" style={{ minWidth: 140 }}>
                    {MESI[mese]} {anno}
                  </th>
                  {giorni.map((g, i) => {
                    const dow = g.getDay()
                    const isOggi = dateToYMD(g) === oggiStr
                    const isHovered = hoveredCell?.dayIdx === i
                    const keyData = dateToYMD(g)
                    const isNonApprovato = giorniNonApprovati.has(keyData) && dow !== 0
                    return (
                      <th key={i} className={`border border-gray-400 text-center font-bold px-0 py-1 ${
                        dow === 0 ? 'bg-red-700 text-white' :
                        dow === 6 ? 'bg-yellow-400 text-gray-900' :
                        isOggi ? 'bg-blue-500 text-white' :
                        'bg-gray-800 text-white'
                      }`} style={{ minWidth: 24 }}>
                        <span style={{ fontSize: 7 }}
                          className={`block ${dow === 6 ? 'text-gray-800' : 'text-gray-300'}`}>
                          {GIORNI_SETTIMANA[dow]}
                        </span>
                        <span className={`inline-block leading-none transition-all ${
                          isHovered
                            ? 'bg-yellow-300 text-gray-900 rounded font-black px-0.5'
                            : ''
                        }`} style={{ fontSize: 9 }}>
                          {g.getDate()}
                        </span>
                        {isNonApprovato && (
                          <span className="block" style={{ fontSize: 8, lineHeight: 1 }} title="Presenze non approvate">🚩</span>
                        )}
                      </th>
                    )
                  })}
                  <th className="border border-gray-400 bg-gray-800 text-white px-2 py-1 text-center" style={{ minWidth: 36 }}>TOT</th>
                  <th className="border border-gray-400 bg-gray-800 text-white px-2 py-1 text-left print:table-cell hidden" style={{ minWidth: 140 }}></th>
                </tr>
              </thead>

              <tbody>
                {aziendeOrdinate.map(az => (
                  <>
                    <tr key={`az-${az}`}>
                      <td colSpan={giorni.length + 3} className="border border-gray-400 bg-gray-800 text-white font-bold px-2 py-1 text-xs uppercase tracking-wide sticky left-0">
                        {az}
                      </td>
                    </tr>
                    {perAzienda[az].map((d, rowIdx) => {
                      const tot = totaleRiga(d.id)
                      const nomeCognome = `${d.cognome} ${d.nome}`
                      return (
                        <tr key={d.id}
                          className={`transition-colors ${
                            hoveredCell?.dipId === d.id
                              ? 'bg-blue-50'
                              : rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                          }`}>
                          <td className={`border border-gray-300 px-1 py-0.5 font-medium whitespace-nowrap sticky left-0 z-10 text-xs transition-colors ${
                            hoveredCell?.dipId === d.id
                              ? 'bg-blue-100 text-blue-900 font-semibold'
                              : rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                          }`} style={{ minWidth: 140 }}>
                            {nomeCognome}
                          </td>
                          {giorni.map((g, gi) => {
                            const dow = g.getDay()
                            const dataYMD = dateToYMD(g)

                            // Pre-assunzione: rosso pieno, non cliccabile
                            const dataInizio = dipInizioMap[d.id]
                            if (dataInizio && dataYMD < dataInizio) {
                              return (
                                <td key={gi}
                                  className="border border-red-900 bg-red-700"
                                  style={{ minWidth: 24 }}
                                  title={`${nomeCognome} — non ancora assunto`}
                                  onMouseEnter={() => setHoveredCell(null)} />
                              )
                            }

                            // Domenica: cella rossa vuota
                            if (dow === 0) return (
                              <td key={gi} className="border border-red-300 bg-red-200"
                                style={{ minWidth: 24 }}
                                onMouseEnter={() => setHoveredCell(null)}></td>
                            )

                            const val = valoreCella(d.id, g)
                            const oggiMidnight = new Date(); oggiMidnight.setHours(0,0,0,0)
                            const isFuturo = g > oggiMidnight
                            const isOggi = dateToYMD(g) === oggiStr
                            const isThisHovered = hoveredCell?.dipId === d.id && hoveredCell?.dayIdx === gi
                            const isRowHovered = hoveredCell?.dipId === d.id

                            let testo = ''
                            // Sabato = sfondo giallo pallido, domenica gestita sopra
                            let bgBase = dow === 6 ? 'bg-yellow-50' : ''
                            if (isOggi) bgBase += ' ring-1 ring-inset ring-blue-400'

                            let colorCls = ''
                            if (val !== null) {
                              if (val.ore >= 1) { testo = '1'; colorCls = 'text-green-800 font-bold bg-green-50' }
                              else if (val.ore > 0) { testo = '½'; colorCls = 'text-amber-700 font-bold bg-amber-50' }
                              else { testo = '0'; colorCls = 'text-red-600 font-medium bg-red-50' }
                            } else if (!isFuturo) {
                              colorCls = 'bg-gray-50'
                            }

                            // Evidenziazione cella specifica sotto il cursore
                            const hoverCellCls = isThisHovered
                              ? 'ring-2 ring-inset ring-blue-500 bg-blue-100 scale-100 z-10 relative'
                              : isRowHovered
                              ? '' // riga evidenziata già dal tr
                              : ''

                            const cursorCls = isFuturo ? '' : 'cursor-pointer'

                            return (
                              <td key={gi}
                                className={`border border-gray-300 text-center py-0.5 px-0 select-none transition-all ${colorCls} ${bgBase} ${hoverCellCls} ${cursorCls}`}
                                style={{ minWidth: 24, fontSize: 9 }}
                                onMouseEnter={() => !isFuturo && setHoveredCell({ dipId: d.id, dayIdx: gi })}
                                onMouseLeave={() => setHoveredCell(null)}
                                onClick={() => apriCella(d, g)}
                                title={isFuturo ? '' : `${nomeCognome} — ${g.toLocaleDateString('it-IT')}`}>
                                {testo}
                              </td>
                            )
                          })}
                          <td className={`border border-gray-400 text-center font-bold px-1 text-xs transition-colors ${
                            hoveredCell?.dipId === d.id ? 'bg-blue-200 text-blue-900' : 'bg-gray-100'
                          }`}>
                            {tot > 0 ? String(tot).replace('.', ',') : ''}
                          </td>
                          <td className="border border-gray-300 px-1 py-0.5 font-medium whitespace-nowrap print:table-cell hidden text-xs">
                            {nomeCognome}
                          </td>
                        </tr>
                      )
                    })}
                  </>
                ))}
              </tbody>
            </table>

            {dipendenti.length === 0 && !loading && (
              <div className="text-center py-16 text-gray-400"><p className="text-3xl mb-3">📋</p><p>Nessun dipendente attivo trovato.</p></div>
            )}
          </div>
        )}

        {/* Popover modifica cella */}
        {cellaEdit && (
          <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center p-4" onClick={() => setCellaEdit(null)}>
            <div ref={popoverRef} className="bg-white rounded-xl shadow-xl p-4 w-72" onClick={e => e.stopPropagation()}>
              <div className="mb-3">
                <p className="font-semibold text-sm">{cellaEdit.dipNome}</p>
                {/* FIX: aggiungi T12:00:00 per evitare che il parsing della stringa YYYY-MM-DD
                    venga interpretato come UTC e mostri il giorno precedente in Italia */}
                <p className="text-xs text-gray-500">{new Date(cellaEdit.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                {cellaEdit.ore !== null && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Stato attuale: {cellaEdit.ore >= 1 ? '✓ Presente' : cellaEdit.ore > 0 ? '½ Mezza giornata' : '✕ Assente'}
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Modifica presenza:</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {(['presente', 'parziale', 'assente'] as const).map(opt => (
                  <button key={opt} onClick={() => salvaCella(opt)} disabled={salvandoCella}
                    className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-colors font-medium text-xs
                      ${cellaEdit.stato === opt ? (
                        opt === 'presente' ? 'border-green-600 bg-green-600 text-white' :
                        opt === 'parziale' ? 'border-amber-500 bg-amber-500 text-white' :
                        'border-red-500 bg-red-500 text-white'
                      ) : (
                        opt === 'presente' ? 'border-green-400 bg-green-50 text-green-800 hover:bg-green-100' :
                        opt === 'parziale' ? 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100' :
                        'border-red-400 bg-red-50 text-red-800 hover:bg-red-100'
                      )}`}>
                    <span className="text-lg">{opt === 'presente' ? '✓' : opt === 'parziale' ? '½' : '✕'}</span>
                    {opt === 'presente' ? 'Presente' : opt === 'parziale' ? 'Mezza' : 'Assente'}
                  </button>
                ))}
              </div>
              {cellaEdit.stato !== null && (
                <button onClick={eliminaCella} disabled={salvandoCella}
                  className="w-full text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg py-1.5 hover:bg-red-50 mb-2">
                  🗑 Elimina registrazione
                </button>
              )}
              {salvandoCella && <p className="text-xs text-gray-400 text-center">Salvataggio...</p>}
              <button onClick={() => setCellaEdit(null)} className="w-full mt-1 text-xs text-gray-400 hover:text-gray-600">Annulla</button>
            </div>
          </div>
        )}
      </main>

      <style jsx global>{`
        @media print {
          @page { size: A3 landscape; margin: 8mm; }
          body { font-size: 8px !important; }
          aside, .print\\:hidden { display: none !important; }
          .print\\:table-cell { display: table-cell !important; }
          table { font-size: 8px !important; }
          th, td { padding: 1px 2px !important; }
          .sticky { position: static !important; }
        }
      `}</style>
    </div>
  )
}
