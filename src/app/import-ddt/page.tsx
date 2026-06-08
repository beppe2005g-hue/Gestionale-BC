'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface VoceDDT {
  descrizione: string
  categoria: string
  macro_categoria: string
  unita_misura: string
  quantita: number
  prezzo_unitario: number
  importo_totale: number
  approvata: boolean
  modificata: boolean
}

interface DDTScansionato {
  numero: string
  data: string
  fornitore_nome: string
  fornitore_piva: string
  voci: VoceDDT[]
  progetto_id: string
  note: string
}

export default function ImportDDT() {
  const [step, setStep] = useState<'upload'|'revisione'|'completato'>('upload')
  const [caricando, setCaricando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [ddt, setDdt] = useState<DDTScansionato | null>(null)
  const [progetti, setProgetti] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [erroreAI, setErroreAI] = useState('')
  const [risultato, setRisultato] = useState<any>(null)

  useEffect(() => {
    supabase.from('progetti').select('id,codice,nome').eq('stato', 'In Corso').then(({ data }) => setProgetti(data || []))
    supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).then(({ data }) => setFornitori(data || []))
  }, [])

  async function analizzaConAI(file: File) {
    setCaricando(true)
    setErroreAI('')

    try {
      // Converti il file in base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const isImage = file.type.startsWith('image/')
      const isPDF = file.type === 'application/pdf'

      if (!isImage && !isPDF) {
        setErroreAI('Formato non supportato. Carica un\'immagine (JPG, PNG) o un PDF.')
        setCaricando(false)
        return
      }

      // Chiama la route API Next.js che fa da proxy verso Claude
      const response = await fetch('/api/analizza-ddt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType: file.type })
      })

      if (!response.ok) {
        throw new Error('Errore API: ' + response.status)
      }

      const data = await response.json()
      const testo = data.content?.[0]?.text || ''

      // Estrai JSON dalla risposta in modo robusto
      let parsed
      try {
        // Prima prova diretta
        parsed = JSON.parse(testo)
      } catch {
        // Prova a estrarre il JSON con regex
        const jsonMatch = testo.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('Risposta AI non contiene JSON valido')
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch {
          // Prova a pulire il JSON da caratteri problematici
          const cleaned = jsonMatch[0]
            .replace(/[\x00-\x1F\x7F]/g, ' ')
            .replace(/,\s*]/g, ']')
            .replace(/,\s*}/g, '}')
          parsed = JSON.parse(cleaned)
        }
      }

      setDdt({
        numero: parsed.numero || '',
        data: parsed.data || new Date().toISOString().split('T')[0],
        fornitore_nome: parsed.fornitore_nome || '',
        fornitore_piva: parsed.fornitore_piva || '',
        voci: (parsed.voci || []).map((v: any) => ({
          ...v,
          quantita: parseFloat(v.quantita) || 0,
          prezzo_unitario: parseFloat(v.prezzo_unitario) || 0,
          importo_totale: parseFloat(v.importo_totale) || 0,
          approvata: true,
          modificata: false
        })),
        progetto_id: '',
        note: ''
      })
      setStep('revisione')
    } catch (e: any) {
      setErroreAI('Errore analisi: ' + (e.message || 'riprova'))
    }
    setCaricando(false)
  }

  function aggiornaVoce(idx: number, campo: string, valore: any) {
    if (!ddt) return
    const nuoveVoci = [...ddt.voci]
    nuoveVoci[idx] = { ...nuoveVoci[idx], [campo]: valore, modificata: true }
    // Ricalcola importo se cambiano quantità o prezzo
    if (campo === 'quantita' || campo === 'prezzo_unitario') {
      const q = campo === 'quantita' ? parseFloat(valore) || 0 : nuoveVoci[idx].quantita
      const p = campo === 'prezzo_unitario' ? parseFloat(valore) || 0 : nuoveVoci[idx].prezzo_unitario
      nuoveVoci[idx].importo_totale = Math.round(q * p * 100) / 100
    }
    setDdt({ ...ddt, voci: nuoveVoci })
  }

  function aggiungiVoce() {
    if (!ddt) return
    setDdt({
      ...ddt,
      voci: [...ddt.voci, {
        descrizione: '', macro_categoria: 'Altro', categoria: '',
        unita_misura: '', quantita: 0, prezzo_unitario: 0, importo_totale: 0,
        approvata: true, modificata: true
      }]
    })
  }

  function eliminaVoce(idx: number) {
    if (!ddt) return
    setDdt({ ...ddt, voci: ddt.voci.filter((_, i) => i !== idx) })
  }

  async function salvaEConfirma() {
    if (!ddt) return
    if (!ddt.numero) { alert('Inserisci il numero del DDT'); return }
    if (!ddt.fornitore_nome) { alert('Inserisci il nome del fornitore'); return }
    if (!ddt.progetto_id) { alert('Seleziona il cantiere'); return }

    const vociApprovate = ddt.voci.filter(v => v.approvata && v.descrizione)
    if (vociApprovate.length === 0) { alert('Approva almeno una voce'); return }

    setSalvando(true)

    // Trova o crea fornitore
    let { data: fornExist } = await supabase.from('fornitori')
      .select('id').ilike('ragione_sociale', `%${ddt.fornitore_nome}%`).limit(1)
    let fornitoreId = fornExist?.[0]?.id
    if (!fornitoreId) {
      const { data: newForn } = await supabase.from('fornitori').insert({
        ragione_sociale: ddt.fornitore_nome,
        cf_piva: ddt.fornitore_piva,
        categoria: 'Materiali', attivo: true
      }).select('id').single()
      fornitoreId = newForn?.id
    }

    const prj = progetti.find(p => p.id === ddt.progetto_id)
    const importoTotale = vociApprovate.reduce((s, v) => s + v.importo_totale, 0)

    // Crea il DDT principale
    const { data: ddtCreato } = await supabase.from('ddt').insert({
      data: ddt.data,
      numero: ddt.numero,
      fornitore_id: fornitoreId,
      fornitore_nome: ddt.fornitore_nome,
      progetto_id: ddt.progetto_id,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: `DDT con ${vociApprovate.length} voci`,
      importo: importoTotale,
      stato: 'Da Fatturare',
      note: ddt.note
    }).select('id').single()

    if (!ddtCreato) { alert('Errore creazione DDT'); setSalvando(false); return }

    // Salva le voci
    for (const voce of vociApprovate) {
      await supabase.from('ddt_voci').insert({
        ddt_id: ddtCreato.id,
        descrizione: voce.descrizione,
        categoria: voce.categoria,
        macro_categoria: voce.macro_categoria,
        unita_misura: voce.unita_misura,
        quantita: voce.quantita,
        prezzo_unitario: voce.prezzo_unitario,
        importo_totale: voce.importo_totale,
        fornitore_id: fornitoreId,
        fornitore_nome: ddt.fornitore_nome,
        data_ddt: ddt.data
      })

      // Aggiorna prezzario
      if (voce.prezzo_unitario > 0 && voce.descrizione) {
        const { data: prezExist } = await supabase.from('prezzario')
          .select('id,prezzo_medio,n_acquisti')
          .ilike('descrizione', voce.descrizione)
          .eq('fornitore_nome', ddt.fornitore_nome)
          .limit(1)

        if (prezExist && prezExist.length > 0) {
          const p = prezExist[0]
          const nuovaMedia = ((p.prezzo_medio * p.n_acquisti) + voce.prezzo_unitario) / (p.n_acquisti + 1)
          await supabase.from('prezzario').update({
            ultimo_prezzo: voce.prezzo_unitario,
            prezzo_medio: Math.round(nuovaMedia * 10000) / 10000,
            ultima_data: ddt.data,
            n_acquisti: p.n_acquisti + 1,
            unita_misura: voce.unita_misura || null
          }).eq('id', p.id)

          await supabase.from('prezzario_storico').insert({
            prezzario_id: p.id,
            ddt_id: ddtCreato.id,
            fornitore_id: fornitoreId,
            fornitore_nome: ddt.fornitore_nome,
            prezzo_unitario: voce.prezzo_unitario,
            quantita: voce.quantita,
            data: ddt.data
          })
        } else {
          const { data: newPrez } = await supabase.from('prezzario').insert({
            descrizione: voce.descrizione,
            categoria: voce.categoria,
            macro_categoria: voce.macro_categoria,
            unita_misura: voce.unita_misura,
            fornitore_id: fornitoreId,
            fornitore_nome: ddt.fornitore_nome,
            ultimo_prezzo: voce.prezzo_unitario,
            prezzo_medio: voce.prezzo_unitario,
            ultima_data: ddt.data,
            n_acquisti: 1
          }).select('id').single()

          if (newPrez) {
            await supabase.from('prezzario_storico').insert({
              prezzario_id: newPrez.id,
              ddt_id: ddtCreato.id,
              fornitore_id: fornitoreId,
              fornitore_nome: ddt.fornitore_nome,
              prezzo_unitario: voce.prezzo_unitario,
              quantita: voce.quantita,
              data: ddt.data
            })
          }
        }
      }
    }

    setSalvando(false)
    setRisultato({ voci: vociApprovate.length, importo: importoTotale, numero: ddt.numero })
    setStep('completato')
  }

  const MACRO_CATEGORIE = ['Cementi', 'Laterizi', 'Ferro e Acciaio', 'Legno', 'Isolanti', 'Impermeabilizzanti', 'Inerti e Calcestruzzo', 'Impianti', 'Attrezzatura', 'Noli', 'Trasporti', 'Altro']

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Import DDT con AI</h1>
            <p className="text-sm text-gray-500 mt-0.5">Scansiona una bolla — l'AI legge e inserisce tutto</p>
          </div>
          {step !== 'upload' && (
            <button className="btn" onClick={() => { setStep('upload'); setDdt(null); setErroreAI('') }}>
              ← Nuova scansione
            </button>
          )}
        </div>

        {/* STEP 1: UPLOAD */}
        {step === 'upload' && (
          <div className="max-w-xl mx-auto">
            <div className="card text-center py-12">
              <div className="text-5xl mb-4">📄</div>
              <h2 className="text-lg font-medium mb-2">Carica il DDT</h2>
              <p className="text-sm text-gray-500 mb-6">Foto della bolla (JPG, PNG) o PDF — l'AI legge fornitore, data, numero e tutte le voci</p>
              <label className="btn btn-primary cursor-pointer text-base px-6 py-3">
                📂 Scegli file
                <input type="file" accept="image/*,.pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) analizzaConAI(f) }} />
              </label>
              {caricando && (
                <div className="mt-6">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-sm text-gray-500">L'AI sta analizzando il DDT...</p>
                  <p className="text-xs text-gray-400 mt-1">Potrebbe richiedere 10-20 secondi</p>
                </div>
              )}
              {erroreAI && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {erroreAI}
                </div>
              )}
            </div>
            <div className="mt-4 bg-blue-50 rounded-xl p-4">
              <p className="text-xs text-blue-800 font-medium mb-1">Come funziona:</p>
              <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                <li>Carichi la foto o PDF della bolla</li>
                <li>L'AI legge automaticamente tutti i dati e le voci</li>
                <li>Controlli voce per voce, modifichi quello che non va</li>
                <li>Assegni il cantiere e confermi</li>
                <li>Il DDT viene salvato e il prezzario aggiornato automaticamente</li>
              </ol>
            </div>
          </div>
        )}

        {/* STEP 2: REVISIONE */}
        {step === 'revisione' && ddt && (
          <div>
            {/* Dati testata DDT */}
            <div className="card mb-4">
              <h3 className="text-sm font-medium text-gray-600 mb-3">📋 Dati testata DDT — verifica e modifica</h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div>
                  <label className="label">N° DDT *</label>
                  <input className="input" value={ddt.numero}
                    onChange={e => setDdt({...ddt, numero: e.target.value})} />
                </div>
                <div>
                  <label className="label">Data</label>
                  <input className="input" type="date" value={ddt.data}
                    onChange={e => setDdt({...ddt, data: e.target.value})} />
                </div>
                <div>
                  <label className="label">Fornitore *</label>
                  <input className="input" list="forn-list" value={ddt.fornitore_nome}
                    onChange={e => setDdt({...ddt, fornitore_nome: e.target.value})} />
                  <datalist id="forn-list">
                    {fornitori.map(f => <option key={f.id} value={f.ragione_sociale} />)}
                  </datalist>
                </div>
                <div>
                  <label className="label">Cantiere *</label>
                  <select className="input" value={ddt.progetto_id}
                    onChange={e => setDdt({...ddt, progetto_id: e.target.value})}>
                    <option value="">-- seleziona --</option>
                    {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                  </select>
                </div>
                <div className="col-span-2 md:col-span-4">
                  <label className="label">Note</label>
                  <input className="input" value={ddt.note}
                    onChange={e => setDdt({...ddt, note: e.target.value})} />
                </div>
              </div>
            </div>

            {/* Voci DDT */}
            <div className="card mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-gray-600">📦 Voci rilevate dall'AI ({ddt.voci.length})</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Spunta ✓ per approvare, modifica quello che non va, aggiungi voci mancanti</p>
                </div>
                <button className="btn btn-sm btn-primary" onClick={aggiungiVoce}>+ Aggiungi voce</button>
              </div>

              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th style={{width: 40}}>✓</th>
                      <th>Descrizione</th>
                      <th>Macro categoria</th>
                      <th>U.M.</th>
                      <th>Quantità</th>
                      <th>Prezzo unit.</th>
                      <th>Importo</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ddt.voci.map((voce, idx) => (
                      <tr key={idx} className={!voce.approvata ? 'opacity-40 bg-gray-50' : voce.modificata ? 'bg-blue-50' : ''}>
                        <td>
                          <input type="checkbox" checked={voce.approvata}
                            onChange={e => aggiornaVoce(idx, 'approvata', e.target.checked)}
                            className="rounded" />
                        </td>
                        <td>
                          <input className="input text-xs py-1" value={voce.descrizione}
                            onChange={e => aggiornaVoce(idx, 'descrizione', e.target.value)}
                            placeholder="Descrizione materiale" />
                        </td>
                        <td>
                          <select className="input text-xs py-1" value={voce.macro_categoria}
                            onChange={e => aggiornaVoce(idx, 'macro_categoria', e.target.value)}>
                            {MACRO_CATEGORIE.map(m => <option key={m}>{m}</option>)}
                          </select>
                        </td>
                        <td>
                          <input className="input text-xs py-1 w-16" value={voce.unita_misura}
                            onChange={e => aggiornaVoce(idx, 'unita_misura', e.target.value)}
                            placeholder="mc" />
                        </td>
                        <td>
                          <input className="input text-xs py-1 w-20" type="number" step="0.001"
                            value={voce.quantita || ''}
                            onChange={e => aggiornaVoce(idx, 'quantita', e.target.value)} />
                        </td>
                        <td>
                          <input className="input text-xs py-1 w-24" type="number" step="0.0001"
                            value={voce.prezzo_unitario || ''}
                            onChange={e => aggiornaVoce(idx, 'prezzo_unitario', e.target.value)} />
                        </td>
                        <td className="font-medium text-sm">{euro(voce.importo_totale)}</td>
                        <td>
                          <button className="text-gray-300 hover:text-red-500 text-sm"
                            onClick={() => eliminaVoce(idx)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totale */}
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  {ddt.voci.filter(v => v.approvata).length} voci approvate su {ddt.voci.length}
                </span>
                <span className="text-base font-semibold text-gray-800">
                  Totale: {euro(ddt.voci.filter(v => v.approvata).reduce((s, v) => s + v.importo_totale, 0))}
                </span>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button className="btn" onClick={() => { setStep('upload'); setDdt(null) }}>Annulla</button>
              <button className="btn btn-primary text-base px-6" onClick={salvaEConfirma} disabled={salvando}>
                {salvando ? 'Salvataggio...' : '✅ Conferma e salva DDT'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: COMPLETATO */}
        {step === 'completato' && risultato && (
          <div className="max-w-md mx-auto text-center">
            <div className="card py-12">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-lg font-semibold text-green-700 mb-2">DDT salvato!</h2>
              <p className="text-sm text-gray-600 mb-1">Bolla <strong>{risultato.numero}</strong></p>
              <p className="text-sm text-gray-600 mb-1">{risultato.voci} voci — {euro(risultato.importo)}</p>
              <p className="text-xs text-gray-400 mt-2">Il prezzario è stato aggiornato automaticamente</p>
              <div className="flex gap-3 justify-center mt-6">
                <button className="btn" onClick={() => { setStep('upload'); setDdt(null); setRisultato(null) }}>
                  + Nuova scansione
                </button>
                <a href="/prezzario" className="btn btn-primary">Vai al prezzario →</a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
