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
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadDati() }, [anno, mese])

  // Chiudi popover cliccando fuori
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

    const [{ data: dip }, { data: pres }] = await Promise.all([
      supabase.from('dipendenti').select('id,nome,cognome,azienda').eq('attivo', true).order('cognome').order('nome'),
      supabase.from('presenze').select('dipendente_id,data,ore,approvato').gte('data', inizio).lte('data', fine),
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

    const mappa: Record<string, Record<string, { ore: number, approvato: boolean }>> = {}
    for (const p of pres || []) {
      if (!mappa[p.dipendente_id]) mappa[p.dipendente_id] = {}
      mappa[p.dipendente_id][p.data] = { ore: p.ore, approvato: p.approvato }
    }
    setPresenzeMap(mappa)
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
    const key = giorno.toISOString().split('T')[0]
    return presenzeMap[dipId]?.[key] ?? null
  }

  function oreToStato(ore: number): StatoPresenza {
    if (ore >= 1) return 'presente'
    if (ore > 0) return 'parziale'
    return 'assente'
  }

  function apriCella(dip: any, giorno: Date) {
    const dow = giorno.getDay()
    if (dow === 0) return // domenica, non editabile
    const key = giorno.toISOString().split('T')[0]
    // Non permettere edit di giorni futuri
    const oggi = new Date(); oggi.setHours(0,0,0,0)
    if (giorno > oggi) return
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
    await supabase.from('presenze').upsert({
      data: cellaEdit.data,
      dipendente_id: cellaEdit.dipId,
      societa: dipendenti.find(d => d.id === cellaEdit.dipId)?.azienda || 'Manuale',
      stato, ore,
      origine: 'correzione_ufficio',
      approvato: true,
      approvato_da: 'manuale',
      approvato_il: new Date().toISOString(),
    }, { onConflict: 'data,dipendente_id' })

    // Aggiorna mappa locale immediatamente
    setPresenzeMap(prev => ({
      ...prev,
      [cellaEdit.dipId]: { ...(prev[cellaEdit.dipId] || {}), [cellaEdit.data]: { ore, approvato: true } }
    }))
    setSalvandoCella(false)
    setCellaEdit(null)
  }

  function mesePrecedente() { if (mese === 0) { setMese(11); setAnno(a => a - 1) } else setMese(m => m - 1) }
  function meseSuccessivo() { if (mese === 11) { setMese(0); setAnno(a => a + 1) } else setMese(m => m + 1) }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto relative">
        {/* Barra controlli */}
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

            {/* Legenda */}
            <div className="flex gap-4 mb-3 text-xs print:hidden flex-wrap">
              <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-green-100 border border-green-400 inline-flex items-center justify-center text-green-800 font-bold">1</span> Presente</span>
              <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-amber-100 border border-amber-400 inline-flex items-center justify-center text-amber-800 font-bold text-xs">½</span> Mezza giornata</span>
              <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-red-50 border border-red-300 inline-flex items-center justify-center text-red-600 font-bold">0</span> Assente</span>
              <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-white border border-dashed border-gray-300 inline-block"></span> Non ancora approvato</span>
              <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-gray-200 inline-block"></span> Domenica</span>
            </div>

            <table className="border-collapse text-xs" style={{ fontSize: '10px', minWidth: '100%' }}>
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-800 text-white px-2 py-1 text-left sticky left-0 z-10" style={{ minWidth: 140 }}>
                    {MESI[mese]} {anno}
                  </th>
                  {giorni.map((g, i) => {
                    const dow = g.getDay()
                    return (
                      <th key={i} className={`border border-gray-400 text-center font-bold px-0 py-1 ${dow === 0 ? 'bg-gray-500 text-white' : dow === 6 ? 'bg-gray-300 text-gray-800' : 'bg-gray-800 text-white'}`} style={{ minWidth: 24 }}>
                        {GIORNI_SETTIMANA[dow]}{g.getDate()}
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
                        <tr key={d.id} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className={`border border-gray-300 px-1 py-0.5 font-medium whitespace-nowrap sticky left-0 z-10 text-xs ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`} style={{ minWidth: 140 }}>
                            {nomeCognome}
                          </td>
                          {giorni.map((g, gi) => {
                            const dow = g.getDay()
                            if (dow === 0) return <td key={gi} className="border border-gray-300 bg-gray-200"></td>

                            const val = valoreCella(d.id, g)
                            const oggi2 = new Date(); oggi2.setHours(0,0,0,0)
                            const isFuturo = g > oggi2

                            let testo = ''
                            let cls = dow === 6 ? 'bg-blue-50' : ''
                            let hoverCls = isFuturo ? '' : 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-inset'

                            if (val !== null) {
                              if (val.ore >= 1) { testo = '1'; cls += ' text-green-800 font-bold bg-green-50' }
                              else if (val.ore > 0) { testo = '0,5'; cls += ' text-amber-700 font-bold bg-amber-50' }
                              else { testo = '0'; cls += ' text-red-600 font-medium bg-red-50' }
                            } else if (!isFuturo) {
                              cls += ' bg-gray-50'
                            }

                            return (
                              <td key={gi}
                                className={`border border-gray-300 text-center py-0.5 px-0 select-none transition-all ${cls} ${hoverCls}`}
                                style={{ minWidth: 24, fontSize: 9 }}
                                onClick={() => apriCella(d, g)}
                                title={isFuturo ? '' : val ? `${nomeCognome} — ${g.toLocaleDateString('it-IT')}: clicca per modificare` : `${nomeCognome} — ${g.toLocaleDateString('it-IT')}: non ancora registrato, clicca per aggiungere`}>
                                {testo}
                              </td>
                            )
                          })}
                          <td className="border border-gray-400 text-center font-bold px-1 bg-gray-100 text-xs">
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
                <p className="text-xs text-gray-500">{new Date(cellaEdit.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                {cellaEdit.ore !== null && (
                  <p className="text-xs text-gray-400 mt-0.5">Stato attuale: {cellaEdit.ore >= 1 ? '✓ Presente' : cellaEdit.ore > 0 ? '½ Mezza giornata' : '✕ Assente'}</p>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Modifica presenza:</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => salvaCella('presente')} disabled={salvandoCella}
                  className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 border-green-400 bg-green-50 text-green-800 hover:bg-green-100 transition-colors font-medium text-xs">
                  <span className="text-lg">✓</span>Presente
                </button>
                <button onClick={() => salvaCella('parziale')} disabled={salvandoCella}
                  className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors font-medium text-xs">
                  <span className="text-lg">½</span>Mezza
                </button>
                <button onClick={() => salvaCella('assente')} disabled={salvandoCella}
                  className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 border-red-400 bg-red-50 text-red-800 hover:bg-red-100 transition-colors font-medium text-xs">
                  <span className="text-lg">✕</span>Assente
                </button>
              </div>
              {salvandoCella && <p className="text-xs text-gray-400 text-center mt-2">Salvataggio...</p>}
              <button onClick={() => setCellaEdit(null)} className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600">Annulla</button>
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
