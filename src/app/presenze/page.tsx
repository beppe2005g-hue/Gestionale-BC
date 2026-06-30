'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const GIORNI_SETTIMANA = ['D', 'L', 'M', 'M', 'G', 'V', 'S']
const GIORNI_SETTIMANA_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function giorniDelMese(anno: number, mese: number): Date[] {
  const giorni: Date[] = []
  const totale = new Date(anno, mese + 1, 0).getDate()
  for (let i = 1; i <= totale; i++) giorni.push(new Date(anno, mese, i))
  return giorni
}

function formatOre(ore: number | null | undefined): string {
  if (ore === null || ore === undefined) return ''
  if (ore === 1) return '1'
  if (ore === 0.5) return '0,5'
  if (ore === 0) return '0'
  return String(ore).replace('.', ',')
}

export default function PresenzeMonthly() {
  const oggi = new Date()
  const [anno, setAnno] = useState(oggi.getFullYear())
  const [mese, setMese] = useState(oggi.getMonth()) // 0-based
  const [dipendenti, setDipendenti] = useState<any[]>([])
  const [presenzeMap, setPresenzeMap] = useState<Record<string, Record<string, number>>>({}) // dipId -> { 'YYYY-MM-DD' -> ore }
  const [loading, setLoading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadDati() }, [anno, mese])

  async function loadDati() {
    setLoading(true)
    const inizio = `${anno}-${String(mese + 1).padStart(2, '0')}-01`
    const fineDate = new Date(anno, mese + 1, 0)
    const fine = `${anno}-${String(mese + 1).padStart(2, '0')}-${String(fineDate.getDate()).padStart(2, '0')}`

    const [{ data: dip }, { data: pres }] = await Promise.all([
      supabase.from('dipendenti').select('id,nome,cognome,azienda').eq('attivo', true)
        .order('cognome').order('nome'),
      supabase.from('presenze').select('dipendente_id,data,ore,approvato')
        .gte('data', inizio).lte('data', fine),
    ])

    // Ordina: BC prima, poi alfabetico per azienda, poi cognome/nome dentro ogni azienda
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

    // Costruisci mappa dipId -> { data -> ore }
    const mappa: Record<string, Record<string, number>> = {}
    for (const p of pres || []) {
      if (!mappa[p.dipendente_id]) mappa[p.dipendente_id] = {}
      mappa[p.dipendente_id][p.data] = p.ore
    }
    setPresenzeMap(mappa)
    setLoading(false)
  }

  const giorni = giorniDelMese(anno, mese)

  // Raggruppa dipendenti per azienda mantenendo l'ordine
  const aziendeOrdinate: string[] = []
  const perAzienda: Record<string, any[]> = {}
  for (const d of dipendenti) {
    if (!perAzienda[d.azienda]) { perAzienda[d.azienda] = []; aziendeOrdinate.push(d.azienda) }
    perAzienda[d.azienda].push(d)
  }

  function totaleRiga(dipId: string): number {
    const m = presenzeMap[dipId] || {}
    return Object.values(m).reduce((s, v) => s + v, 0)
  }

  function valoreCella(dipId: string, giorno: Date): number | null {
    const key = giorno.toISOString().split('T')[0]
    const m = presenzeMap[dipId]
    if (!m || !(key in m)) return null
    return m[key]
  }

  function coloreGiorno(g: Date) {
    const dow = g.getDay()
    if (dow === 0) return 'bg-gray-200' // domenica
    if (dow === 6) return 'bg-blue-50'  // sabato
    return ''
  }

  function mesePrecedente() {
    if (mese === 0) { setMese(11); setAnno(a => a - 1) }
    else setMese(m => m - 1)
  }
  function meseSucessivo() {
    if (mese === 11) { setMese(0); setAnno(a => a + 1) }
    else setMese(m => m + 1)
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {/* BARRA CONTROLLI — nascosta in stampa */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white print:hidden sticky top-0 z-20">
          <h1 className="text-lg font-semibold">📋 Presenze mensili</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button onClick={mesePrecedente} className="btn btn-sm">‹</button>
              <span className="text-sm font-semibold px-3 py-1 bg-gray-100 rounded-lg min-w-36 text-center">
                {MESI[mese]} {anno}
              </span>
              <button onClick={meseSucessivo} className="btn btn-sm">›</button>
            </div>
            <button onClick={() => window.print()} className="btn btn-sm btn-primary">🖨️ Stampa</button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <p>Caricamento presenze...</p>
          </div>
        ) : (
          <div ref={printRef} className="p-4 overflow-x-auto">
            {/* ══════════ INTESTAZIONE STAMPA ══════════ */}
            <div className="mb-4 print:mb-2">
              <h2 className="text-xl font-bold text-center print:text-lg">
                {MESI[mese].toUpperCase()} {anno}
              </h2>
            </div>

            <table
              className="border-collapse text-xs"
              style={{ fontSize: '10px', minWidth: '100%' }}
            >
              <thead>
                {/* Riga 1: lettere giorno */}
                <tr>
                  <th className="border border-gray-400 bg-gray-800 text-white px-2 py-1 text-left min-w-32 sticky left-0 z-10" style={{ minWidth: 140 }}>
                    {MESI[mese]} {anno}
                  </th>
                  {giorni.map((g, i) => {
                    const dow = g.getDay()
                    const isDom = dow === 0
                    const isSab = dow === 6
                    return (
                      <th key={i}
                        className={`border border-gray-400 text-center font-bold px-0 py-1 w-7
                          ${isDom ? 'bg-gray-500 text-white' : isSab ? 'bg-gray-300 text-gray-800' : 'bg-gray-800 text-white'}`}
                        style={{ minWidth: 24 }}>
                        {GIORNI_SETTIMANA[dow]}{g.getDate()}
                      </th>
                    )
                  })}
                  <th className="border border-gray-400 bg-gray-800 text-white px-2 py-1 text-center min-w-10">TOT</th>
                  <th className="border border-gray-400 bg-gray-800 text-white px-2 py-1 text-left min-w-32 print:table-cell hidden" style={{ minWidth: 140 }}>
                    {/* Cognome ripetuto a destra — solo in stampa */}
                  </th>
                </tr>
                {/* Riga 2: numeri giorno */}
                <tr>
                  <th className="border border-gray-300 bg-gray-100 sticky left-0 z-10"></th>
                  {giorni.map((g, i) => {
                    const dow = g.getDay()
                    const isDom = dow === 0
                    const isSab = dow === 6
                    return (
                      <th key={i}
                        className={`border border-gray-300 text-center font-medium py-0.5
                          ${isDom ? 'bg-gray-200' : isSab ? 'bg-blue-50' : 'bg-gray-50'}`}>
                        {g.getDate()}
                      </th>
                    )
                  })}
                  <th className="border border-gray-300 bg-gray-50"></th>
                  <th className="border border-gray-300 bg-gray-100 print:table-cell hidden"></th>
                </tr>
              </thead>

              <tbody>
                {aziendeOrdinate.map(az => (
                  <>
                    {/* Intestazione azienda */}
                    <tr key={`az-${az}`}>
                      <td
                        colSpan={giorni.length + 3}
                        className="border border-gray-400 bg-gray-800 text-white font-bold px-2 py-1 text-xs uppercase tracking-wide sticky left-0"
                      >
                        {az}
                      </td>
                    </tr>

                    {/* Righe dipendenti */}
                    {perAzienda[az].map((d, rowIdx) => {
                      const tot = totaleRiga(d.id)
                      const nomeCognome = `${d.cognome} ${d.nome}`
                      return (
                        <tr key={d.id} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          {/* Nome a sinistra */}
                          <td className={`border border-gray-300 px-1 py-0.5 font-medium whitespace-nowrap sticky left-0 z-10 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                            style={{ minWidth: 140 }}>
                            {nomeCognome}
                          </td>

                          {/* Celle giorni */}
                          {giorni.map((g, gi) => {
                            const dow = g.getDay()
                            const isDom = dow === 0
                            const val = valoreCella(d.id, g)

                            // Domenica: cella grigia vuota
                            if (isDom) {
                              return (
                                <td key={gi} className="border border-gray-300 bg-gray-200 text-center"></td>
                              )
                            }

                            // Cella con valore
                            let testo = ''
                            let cls = ''
                            if (val === null) {
                              // Non ancora approvato per questo giorno
                              testo = ''
                              cls = dow === 6 ? 'bg-blue-50' : ''
                            } else if (val === 1) {
                              testo = '1'
                              cls = 'text-green-800 font-medium'
                            } else if (val === 0.5) {
                              testo = '0,5'
                              cls = 'text-amber-700 font-medium'
                            } else if (val === 0) {
                              testo = '0'
                              cls = 'text-red-600 font-medium'
                            }

                            return (
                              <td key={gi}
                                className={`border border-gray-300 text-center py-0.5 px-0 ${dow === 6 ? 'bg-blue-50' : ''} ${cls}`}
                                style={{ minWidth: 24 }}>
                                {testo}
                              </td>
                            )
                          })}

                          {/* Totale */}
                          <td className="border border-gray-400 text-center font-bold px-1 bg-gray-100">
                            {tot > 0 ? formatOre(tot) : ''}
                          </td>

                          {/* Nome ripetuto a destra (solo stampa) */}
                          <td className="border border-gray-300 px-1 py-0.5 font-medium whitespace-nowrap print:table-cell hidden">
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
              <div className="text-center py-16 text-gray-400">
                <p className="text-3xl mb-3">📋</p>
                <p>Nessun dipendente attivo trovato.</p>
              </div>
            )}
          </div>
        )}
      </main>

      <style jsx global>{`
        @media print {
          @page {
            size: A3 landscape;
            margin: 8mm;
          }
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
