'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MACRO_CATEGORIE = ['Cementi','Laterizi','Ferro e Acciaio','Legno','Isolanti','Impermeabilizzanti','Inerti e Calcestruzzo','Impianti','Attrezzatura','Noli','Trasporti','Altro']

// Modello Gemini usato per leggere le bolle.
// Se in futuro 3.5 Flash dovesse di nuovo saturarsi (errori 503 prolungati),
// si può tornare temporaneamente a 'gemini-2.5-flash' cambiando solo questa riga.
const GEMINI_MODEL = 'gemini-3.5-flash'

interface VoceDDT {
  descrizione: string; macro_categoria: string; categoria: string
  unita_misura: string; quantita: number; prezzo_unitario: number
  importo_totale: number; approvata: boolean
}

interface BollaDDT {
  id: string; numero: string; data: string
  fornitore_nome_ai: string // nome estratto dall'AI, solo informativo
  fornitore_id: string // '' = non scelto, '__nuovo__' = crea nuovo
  fornitore_nome_nuovo: string // nome per il nuovo fornitore
  fornitore_piva: string; voci: VoceDDT[]; progetto_id: string; note: string
  stato: 'approvazione' | 'salvato'; nomefile: string
}

interface FileFallito { nomefile: string; motivo: string; dettaglioTecnico?: string }

export default function ImportDDTV2() {
  const [bolle, setBolle] = useState<BollaDDT[]>([])
  const [bollaAttiva, setBollaAttiva] = useState<string | null>(null)
  const [progetti, setProgetti] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [elaborando, setElaborando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [progressoTesto, setProgressoTesto] = useState('')
  const [fileFalliti, setFileFalliti] = useState<FileFallito[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('progetti').select('id,codice,nome').eq('stato', 'In Corso').then(({ data }) => setProgetti(data || []))
    supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale').then(({ data }) => setFornitori(data || []))
  }, [])

  function trovaFornitoreEsatto(nomeAI: string): string {
    if (!nomeAI) return ''
    const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
    const nomeNorm = norm(nomeAI)
    const match = fornitori.find(f => norm(f.ragione_sociale) === nomeNorm)
    return match?.id || ''
  }

  async function caricaFile(files: FileList | null) {
    if (!files || elaborando) return
    setElaborando(true)
    setFileFalliti([])
    for (const file of Array.from(files)) {
      setProgressoTesto(`Analisi di ${file.name}...`)
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ''

        let geminiResponse
        for (let attempt = 0; attempt < 3; attempt++) {
          geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { inline_data: { mime_type: file.type, data: base64 } },
                    { text: `DDT italiano. JSON array only. Se prezzo non è sulla stessa riga della quantità metti 0. Non cercare prezzi in altre parti del documento:\n[{"numero":"","data":"YYYY-MM-DD","fornitore_nome":"","fornitore_piva":"","voci":[{"descrizione":"","macro_categoria":"Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro","categoria":"","unita_misura":"","quantita":0,"prezzo_unitario":0,"importo_totale":0}]}]` }
                  ]
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
              })
            }
          )
          if (geminiResponse.status !== 503) break
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
        }

        if (!geminiResponse || !geminiResponse.ok) {
          const err = await geminiResponse?.json().catch(() => null)
          throw new Error(`Errore Gemini ${geminiResponse?.status}: ${err?.error?.message || 'errore sconosciuto'}`)
        }

        const geminiData = await geminiResponse.json()
        const testo = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''

        // Gemini ha risposto ma senza testo utile: spesso succede per blocco di sicurezza,
        // risposta troncata per instabilità del servizio, o output vuoto.
        // Prima si falliva qui in silenzio (nessuna bolla aggiunta, nessun avviso visibile).
        if (!testo) {
          const finishReason = geminiData.candidates?.[0]?.finishReason || 'sconosciuto'
          const blockReason = geminiData.promptFeedback?.blockReason || null
          throw new Error(blockReason
            ? `Risposta bloccata da Gemini (motivo: ${blockReason})`
            : `Gemini ha risposto senza contenuto utile (finishReason: ${finishReason}). Possibile instabilità temporanea del servizio.`)
        }

        let parsed: any[]
        // Gemini a volte avvolge il JSON in un blocco markdown ```json ... ```: lo rimuoviamo prima di tentare il parsing.
        const testoPulito = testo.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
        try {
          parsed = JSON.parse(testoPulito)
        } catch {
          const arrStart = testoPulito.indexOf('[')
          const arrEnd = testoPulito.lastIndexOf(']')
          if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
            try { parsed = JSON.parse(testoPulito.slice(arrStart, arrEnd + 1).replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}')) }
            catch (e2: any) {
              // Se il testo finisce a metà di una parola/valore, è quasi certamente una risposta troncata
              // per limite di token di output, non un problema di formato.
              const sembraTroncato = !testoPulito.trim().endsWith(']') && !testoPulito.trim().endsWith('}')
              throw new Error(sembraTroncato
                ? `Risposta di Gemini troncata (probabilmente troppe voci per il limite di lunghezza). Testo ricevuto: "${testoPulito.slice(0, 200)}..."`
                : `JSON malformato nella risposta di Gemini: ${e2.message}. Testo ricevuto: "${testoPulito.slice(0, 200)}..."`)
            }
          } else {
            throw new Error(`Gemini ha risposto con un testo che non contiene JSON riconoscibile: "${testoPulito.slice(0, 200)}..."`)
          }
        }

        const ddtArray = Array.isArray(parsed) ? parsed : [parsed]
        const ddtValidi = ddtArray.filter(p => p && !p.skip && p.numero !== undefined)

        // Prima, se ddtValidi era vuoto, semplicemente non succedeva nulla: nessuna bolla
        // aggiunta, nessun avviso. Ora segnaliamo esplicitamente il caso.
        if (ddtValidi.length === 0) {
          throw new Error(`Gemini ha risposto ma non ha riconosciuto nessun DDT valido in questo file (${ddtArray.length} elementi ricevuti, tutti scartati o senza numero).`)
        }

        for (const p of ddtValidi) {
          const nomeAI = p.fornitore_nome || ''
          const fornitoreIdMatch = trovaFornitoreEsatto(nomeAI)
          const nuovaBolla: BollaDDT = {
            id: Math.random().toString(36).slice(2),
            numero: p.numero || '',
            data: p.data || new Date().toISOString().split('T')[0],
            fornitore_nome_ai: nomeAI,
            fornitore_id: fornitoreIdMatch,
            fornitore_nome_nuovo: fornitoreIdMatch ? '' : nomeAI,
            fornitore_piva: p.fornitore_piva || '',
            voci: (p.voci || []).map((v: any) => ({
              ...v,
              quantita: parseFloat(v.quantita) || 0,
              prezzo_unitario: parseFloat(v.prezzo_unitario) || 0,
              importo_totale: parseFloat(v.importo_totale) || 0,
              approvata: true
            })),
            progetto_id: '', note: '', stato: 'approvazione', nomefile: file.name
          }
          setBolle(prev => {
            if (prev.length === 0) setBollaAttiva(nuovaBolla.id)
            return [...prev, nuovaBolla]
          })
        }
      } catch (e: any) {
        setFileFalliti(prev => [...prev, { nomefile: file.name, motivo: e.message }])
      }
    }
    setElaborando(false)
    setProgressoTesto('')
  }

  function aggiornaVoce(bollaId: string, idx: number, campo: string, valore: any) {
    setBolle(prev => prev.map(b => {
      if (b.id !== bollaId) return b
      const voci = [...b.voci]
      voci[idx] = { ...voci[idx], [campo]: valore }
      if (campo === 'quantita' || campo === 'prezzo_unitario') {
        const q = campo === 'quantita' ? parseFloat(valore) || 0 : voci[idx].quantita
        const p = campo === 'prezzo_unitario' ? parseFloat(valore) || 0 : voci[idx].prezzo_unitario
        voci[idx].importo_totale = Math.round(q * p * 100) / 100
      }
      return { ...b, voci }
    }))
  }

  function aggiungiVoce(bollaId: string) {
    setBolle(prev => prev.map(b => b.id !== bollaId ? b : {
      ...b, voci: [...b.voci, { descrizione: '', macro_categoria: 'Altro', categoria: '', unita_misura: '', quantita: 0, prezzo_unitario: 0, importo_totale: 0, approvata: true }]
    }))
  }

  function eliminaVoce(bollaId: string, idx: number) {
    setBolle(prev => prev.map(b => b.id !== bollaId ? b : { ...b, voci: b.voci.filter((_, i) => i !== idx) }))
  }

  async function salvaBolla(bollaId: string) {
    const bolla = bolle.find(b => b.id === bollaId)
    if (!bolla) return
    if (!bolla.numero) { alert('Inserisci il numero del DDT'); return }
    if (!bolla.fornitore_id) {
      alert('Seleziona un fornitore esistente oppure scegli "+ Nuovo fornitore" e inserisci il nome')
      return
    }
    if (bolla.fornitore_id === '__nuovo__' && !bolla.fornitore_nome_nuovo.trim()) {
      alert('Inserisci il nome del nuovo fornitore')
      return
    }
    if (!bolla.progetto_id) { alert('Seleziona il cantiere'); return }
    const vociOk = bolla.voci.filter(v => v.approvata && v.descrizione)
    if (vociOk.length === 0) { alert('Approva almeno una voce'); return }
    setSalvando(true)

    let fornitoreId = bolla.fornitore_id
    let fornitoreNome = ''

    if (fornitoreId === '__nuovo__') {
      const nomeNuovo = bolla.fornitore_nome_nuovo.trim()
      const { data: nf, error } = await supabase.from('fornitori').insert({
        ragione_sociale: nomeNuovo, cf_piva: bolla.fornitore_piva, categoria: 'Materiali', attivo: true
      }).select('id,ragione_sociale').single()
      if (error || !nf) { alert('Errore creazione fornitore: ' + error?.message); setSalvando(false); return }
      fornitoreId = nf.id
      fornitoreNome = nf.ragione_sociale
      setFornitori(prev => [...prev, nf].sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale)))
    } else {
      fornitoreNome = fornitori.find(f => f.id === fornitoreId)?.ragione_sociale || ''
    }

    const prj = progetti.find(p => p.id === bolla.progetto_id)
    const importoTotale = vociOk.reduce((s, v) => s + v.importo_totale, 0)
    const { data: ddtCreato } = await supabase.from('ddt').insert({
      data: bolla.data, numero: bolla.numero, fornitore_id: fornitoreId, fornitore_nome: fornitoreNome,
      progetto_id: bolla.progetto_id, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: `DDT con ${vociOk.length} voci`, importo: importoTotale, stato: 'Da Fatturare', note: bolla.note
    }).select('id').single()
    if (ddtCreato) {
      for (const voce of vociOk) {
        await supabase.from('ddt_voci').insert({
          ddt_id: ddtCreato.id, descrizione: voce.descrizione, categoria: voce.categoria,
          macro_categoria: voce.macro_categoria, unita_misura: voce.unita_misura,
          quantita: voce.quantita, prezzo_unitario: voce.prezzo_unitario, importo_totale: voce.importo_totale,
          fornitore_id: fornitoreId, fornitore_nome: fornitoreNome, data_ddt: bolla.data
        })
        if (voce.prezzo_unitario > 0 && voce.descrizione) {
          const { data: pe } = await supabase.from('prezzario').select('id,prezzo_medio,n_acquisti').ilike('descrizione', voce.descrizione).eq('fornitore_nome', fornitoreNome).limit(1)
          if (pe && pe.length > 0) {
            const p = pe[0]
            const media = ((p.prezzo_medio * p.n_acquisti) + voce.prezzo_unitario) / (p.n_acquisti + 1)
            await supabase.from('prezzario').update({ ultimo_prezzo: voce.prezzo_unitario, prezzo_medio: Math.round(media * 10000) / 10000, ultima_data: bolla.data, n_acquisti: p.n_acquisti + 1 }).eq('id', p.id)
            await supabase.from('prezzario_storico').insert({ prezzario_id: p.id, ddt_id: ddtCreato.id, fornitore_id: fornitoreId, fornitore_nome: fornitoreNome, prezzo_unitario: voce.prezzo_unitario, quantita: voce.quantita, data: bolla.data })
          } else {
            const { data: np } = await supabase.from('prezzario').insert({
              descrizione: voce.descrizione, categoria: voce.categoria, macro_categoria: voce.macro_categoria,
              unita_misura: voce.unita_misura, fornitore_id: fornitoreId, fornitore_nome: fornitoreNome,
              ultimo_prezzo: voce.prezzo_unitario, prezzo_medio: voce.prezzo_unitario, ultima_data: bolla.data, n_acquisti: 1
            }).select('id').single()
            if (np) await supabase.from('prezzario_storico').insert({ prezzario_id: np.id, ddt_id: ddtCreato.id, fornitore_id: fornitoreId, fornitore_nome: fornitoreNome, prezzo_unitario: voce.prezzo_unitario, quantita: voce.quantita, data: bolla.data })
          }
        }
      }
    }
    setBolle(prev => prev.map(b => b.id === bollaId ? { ...b, stato: 'salvato' } : b))
    setSalvando(false)
    const prossima = bolle.find(b => b.stato === 'approvazione' && b.id !== bollaId)
    setBollaAttiva(prossima?.id || null)
  }

  const bolleApprovazione = bolle.filter(b => b.stato === 'approvazione')
  const bolleSalvate = bolle.filter(b => b.stato === 'salvato')
  const bollaCorrente = bolle.find(b => b.id === bollaAttiva)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold">Import DDT con AI</h1>
            <p className="text-sm text-gray-500 mt-0.5">Carica foto o PDF — Gemini AI analizza tutto</p>
          </div>
          {bolle.length > 0 && !elaborando && (
            <button className="btn" onClick={() => { setBolle([]); setBollaAttiva(null); setFileFalliti([]) }}>🗑 Svuota</button>
          )}
        </div>

        {fileFalliti.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-red-800">⚠️ {fileFalliti.length} file non analizzati correttamente</p>
              <button className="text-xs text-red-600 hover:underline" onClick={() => setFileFalliti([])}>Nascondi</button>
            </div>
            <div className="space-y-1.5">
              {fileFalliti.map((f, i) => (
                <div key={i} className="text-xs text-red-700 bg-white rounded-lg px-3 py-2 border border-red-100">
                  <strong>{f.nomefile}</strong>: {f.motivo}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-3">
            <div className="card border-2 border-dashed border-blue-200 hover:border-blue-400 cursor-pointer text-center py-8"
              onClick={() => !elaborando && inputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); caricaFile(e.dataTransfer.files) }}>
              <div className="text-4xl mb-3">📂</div>
              <p className="text-sm font-medium text-blue-700">Clicca o trascina i file</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, PDF anche multipagina</p>
              <input ref={inputRef} type="file" accept="image/*,.pdf" multiple className="hidden"
                onChange={e => caricaFile(e.target.files)} />
            </div>
            {elaborando && (
              <div className="card text-center py-6">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm text-blue-700">Analisi in corso...</p>
                <p className="text-xs text-gray-400 mt-1">{progressoTesto}</p>
              </div>
            )}
            {bolle.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-semibold text-amber-600">{bolleApprovazione.length}</p>
                    <p className="text-xs text-gray-400">Da approvare</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-semibold text-green-600">{bolleSalvate.length}</p>
                    <p className="text-xs text-gray-400">Salvate</p>
                  </div>
                </div>
                <div className="card p-0 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b">
                    <span className="text-xs font-medium text-gray-600">{bolle.length} bolle trovate</span>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {bolle.map(b => (
                      <div key={b.id} onClick={() => b.stato === 'approvazione' && setBollaAttiva(b.id)}
                        className={`flex items-center gap-2 px-3 py-2 border-b border-gray-50 cursor-pointer ${bollaAttiva === b.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                        <span>{b.stato === 'salvato' ? '✅' : b.fornitore_id ? '✋' : '⚠️'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{b.numero || '?'} — {b.fornitore_nome_ai || '?'}</p>
                          <p className="text-xs text-gray-400 truncate">{b.nomefile}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {bolleApprovazione.length > 0 && !bollaAttiva && (
                  <button className="btn btn-primary w-full" onClick={() => setBollaAttiva(bolleApprovazione[0].id)}>
                    ✋ Inizia approvazione ({bolleApprovazione.length})
                  </button>
                )}
              </>
            )}
          </div>
          <div className="col-span-2">
            {!bollaCorrente || bollaCorrente.stato === 'salvato' ? (
              <div className="card h-full flex items-center justify-center text-gray-400 min-h-96">
                <div className="text-center">
                  <p className="text-4xl mb-3">{elaborando ? '🤖' : bolle.length === 0 ? '📋' : '🎉'}</p>
                  <p className="text-sm">
                    {elaborando ? progressoTesto :
                     bolle.length === 0 ? 'Carica un PDF o delle foto per iniziare' :
                     bolleSalvate.length === bolle.length ? `Tutte le ${bolle.length} bolle salvate!` :
                     'Seleziona una bolla dalla lista'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>Bolla {bolleSalvate.length + 1} di {bolle.length}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${bolle.length > 0 ? (bolleSalvate.length / bolle.length) * 100 : 0}%` }} />
                  </div>
                  <span className="text-green-600 font-medium">{bolleSalvate.length} salvate</span>
                </div>
                <div className="card">
                  <h3 className="text-sm font-medium text-gray-600 mb-3">📋 {bollaCorrente.nomefile}</h3>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div>
                      <label className="label">N° DDT *</label>
                      <input className="input" value={bollaCorrente.numero}
                        onChange={e => setBolle(prev => prev.map(b => b.id === bollaCorrente.id ? {...b, numero: e.target.value} : b))} />
                    </div>
                    <div>
                      <label className="label">Data</label>
                      <input className="input" type="date" value={bollaCorrente.data}
                        onChange={e => setBolle(prev => prev.map(b => b.id === bollaCorrente.id ? {...b, data: e.target.value} : b))} />
                    </div>
                    <div className="col-span-2">
                      <label className="label">
                        Fornitore * {bollaCorrente.fornitore_nome_ai && (
                          <span className="text-gray-400 normal-case font-normal">— rilevato: "{bollaCorrente.fornitore_nome_ai}"</span>
                        )}
                      </label>
                      <select className="input" value={bollaCorrente.fornitore_id}
                        onChange={e => setBolle(prev => prev.map(b => b.id === bollaCorrente.id ? {...b, fornitore_id: e.target.value, fornitore_nome_nuovo: e.target.value === '__nuovo__' ? (b.fornitore_nome_nuovo || b.fornitore_nome_ai) : b.fornitore_nome_nuovo} : b))}>
                        <option value="">-- seleziona fornitore --</option>
                        {fornitori.map(f => <option key={f.id} value={f.id}>{f.ragione_sociale}</option>)}
                        <option value="__nuovo__">➕ Nuovo fornitore...</option>
                      </select>
                      {bollaCorrente.fornitore_id === '__nuovo__' && (
                        <input className="input mt-2" placeholder="Ragione sociale nuovo fornitore"
                          value={bollaCorrente.fornitore_nome_nuovo}
                          onChange={e => setBolle(prev => prev.map(b => b.id === bollaCorrente.id ? {...b, fornitore_nome_nuovo: e.target.value} : b))} />
                      )}
                      {!bollaCorrente.fornitore_id && (
                        <p className="text-xs text-amber-600 mt-1">⚠️ Seleziona un fornitore esistente o creane uno nuovo</p>
                      )}
                    </div>
                    <div>
                      <label className="label">Cantiere *</label>
                      <select className="input" value={bollaCorrente.progetto_id}
                        onChange={e => setBolle(prev => prev.map(b => b.id === bollaCorrente.id ? {...b, progetto_id: e.target.value} : b))}>
                        <option value="">-- seleziona --</option>
                        {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-600">📦 Voci ({bollaCorrente.voci.length})</h3>
                    <button className="btn btn-sm btn-primary" onClick={() => aggiungiVoce(bollaCorrente.id)}>+ Voce</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead><tr>
                        <th style={{width:36}}>✓</th><th>Descrizione</th><th>Categoria</th>
                        <th>U.M.</th><th>Qtà</th><th>€/unit</th><th>Totale</th><th></th>
                      </tr></thead>
                      <tbody>
                        {bollaCorrente.voci.map((voce, idx) => (
                          <tr key={idx} className={!voce.approvata ? 'opacity-40' : ''}>
                            <td><input type="checkbox" checked={voce.approvata} onChange={e => aggiornaVoce(bollaCorrente.id, idx, 'approvata', e.target.checked)} /></td>
                            <td><input className="input text-xs py-1" value={voce.descrizione} onChange={e => aggiornaVoce(bollaCorrente.id, idx, 'descrizione', e.target.value)} /></td>
                            <td><select className="input text-xs py-1" value={voce.macro_categoria} onChange={e => aggiornaVoce(bollaCorrente.id, idx, 'macro_categoria', e.target.value)}>
                              {MACRO_CATEGORIE.map(m => <option key={m}>{m}</option>)}
                            </select></td>
                            <td><input className="input text-xs py-1 w-14" value={voce.unita_misura} onChange={e => aggiornaVoce(bollaCorrente.id, idx, 'unita_misura', e.target.value)} /></td>
                            <td><input className="input text-xs py-1 w-20" type="number" step="0.001" value={voce.quantita || ''} onChange={e => aggiornaVoce(bollaCorrente.id, idx, 'quantita', e.target.value)} /></td>
                            <td><input className="input text-xs py-1 w-24" type="number" step="0.0001" value={voce.prezzo_unitario || ''} onChange={e => aggiornaVoce(bollaCorrente.id, idx, 'prezzo_unitario', e.target.value)} /></td>
                            <td className="font-medium text-sm">{euro(voce.importo_totale)}</td>
                            <td><button className="text-gray-300 hover:text-red-500 text-sm" onClick={() => eliminaVoce(bollaCorrente.id, idx)}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{bollaCorrente.voci.filter(v => v.approvata).length} voci approvate</span>
                    <span className="font-semibold text-sm">{euro(bollaCorrente.voci.filter(v => v.approvata).reduce((s, v) => s + v.importo_totale, 0))}</span>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <button className="btn" onClick={() => {
                    const prossima = bolle.find(b => b.stato === 'approvazione' && b.id !== bollaCorrente.id)
                    setBollaAttiva(prossima?.id || null)
                  }}>Salta →</button>
                  <button className="btn btn-primary px-6" onClick={() => salvaBolla(bollaCorrente.id)} disabled={salvando}>
                    {salvando ? 'Salvataggio...' : '✅ Conferma e salva'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
