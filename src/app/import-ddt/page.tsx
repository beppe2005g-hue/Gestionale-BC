'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MACRO_CATEGORIE = ['Cementi','Laterizi','Ferro e Acciaio','Legno','Isolanti','Impermeabilizzanti','Inerti e Calcestruzzo','Impianti','Attrezzatura','Noli','Trasporti','Altro']

interface VoceDDT {
  descrizione: string; macro_categoria: string; categoria: string
  unita_misura: string; quantita: number; prezzo_unitario: number
  importo_totale: number; approvata: boolean
}

interface BollaDDT {
  id: string; numero: string; data: string; fornitore_nome: string
  fornitore_piva: string; voci: VoceDDT[]; progetto_id: string; note: string
  stato: 'approvazione' | 'salvato'; nomefile: string
}

// Renderizza una pagina PDF come immagine JPEG base64
async function renderizzaPaginaPDF(pdfDoc: any, pageNum: number): Promise<string> {
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale: 1.5 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.75).split(',')[1]
}

// Chiama l'API per analizzare una singola immagine
async function analizzaImmagine(base64: string): Promise<any> {
  const response = await fetch('/api/analizza-ddt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mediaType: 'image/jpeg' })
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error || 'Errore API')
  }
  const data = await response.json()
  if (data.error) throw new Error(data.error)
  return data.parsed // array
}

export default function ImportDDT() {
  const [bolle, setBolle] = useState<BollaDDT[]>([])
  const [bollaAttiva, setBollaAttiva] = useState<string | null>(null)
  const [progetti, setProgetti] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [elaborando, setElaborando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [progressoTesto, setProgressoTesto] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('progetti').select('id,codice,nome').eq('stato', 'In Corso').then(({ data }) => setProgetti(data || []))
    supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).then(({ data }) => setFornitori(data || []))
  }, [])

  async function caricaFile(files: FileList | null) {
    if (!files || elaborando) return
    setElaborando(true)
    const nuoveBolle: BollaDDT[] = []

    for (const file of Array.from(files)) {
      if (file.type === 'application/pdf') {
        // PDF: usa pdfjs per renderizzare pagina per pagina
        setProgressoTesto(`Apertura PDF: ${file.name}`)
        const arrayBuffer = await file.arrayBuffer()
        const pdfJS = await import('pdfjs-dist')
        pdfJS.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfJS.version}/pdf.worker.min.mjs`
        const pdfDoc = await pdfJS.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
        const numPages = pdfDoc.numPages

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          setProgressoTesto(`Analisi pagina ${pageNum}/${numPages} di ${file.name}...`)
          try {
            const imgBase64 = await renderizzaPaginaPDF(pdfDoc, pageNum)
            const ddtArray = await analizzaImmagine(imgBase64)
            for (const parsed of ddtArray) {
              if (parsed && !parsed.skip && parsed.numero !== undefined) {
                nuoveBolle.push({
                  id: Math.random().toString(36).slice(2),
                  numero: parsed.numero || '',
                  data: parsed.data || new Date().toISOString().split('T')[0],
                  fornitore_nome: parsed.fornitore_nome || '',
                  fornitore_piva: parsed.fornitore_piva || '',
                  voci: (parsed.voci || []).map((v: any) => ({
                    ...v,
                    quantita: parseFloat(v.quantita) || 0,
                    prezzo_unitario: parseFloat(v.prezzo_unitario) || 0,
                    importo_totale: parseFloat(v.importo_totale) || 0,
                    approvata: true
                  })),
                  progetto_id: '',
                  note: '',
                  stato: 'approvazione',
                  nomefile: `${file.name} — pag. ${pageNum}`
                })
              }
            }
          } catch (e: any) {
            console.warn(`Pagina ${pageNum} saltata:`, e.message)
          }
        }
      } else if (file.type.startsWith('image/')) {
        // Immagine singola
        setProgressoTesto(`Analisi immagine: ${file.name}`)
        try {
          const base64Raw = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve((reader.result as string).split(',')[1])
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
          // Comprimi
          const compressed = await new Promise<string>((resolve) => {
            const img = new Image()
            img.onload = () => {
              const canvas = document.createElement('canvas')
              const maxSize = 1200
              let w = img.width, h = img.height
              if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize }
                else { w = Math.round(w * maxSize / h); h = maxSize }
              }
              canvas.width = w; canvas.height = h
              canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
              resolve(canvas.toDataURL('image/jpeg', 0.75).split(',')[1])
            }
            img.src = 'data:' + file.type + ';base64,' + base64Raw
          })
          const ddtArray = await analizzaImmagine(compressed)
          for (const parsed of ddtArray) {
            if (parsed && !parsed.skip) {
              nuoveBolle.push({
                id: Math.random().toString(36).slice(2),
                numero: parsed.numero || '',
                data: parsed.data || new Date().toISOString().split('T')[0],
                fornitore_nome: parsed.fornitore_nome || '',
                fornitore_piva: parsed.fornitore_piva || '',
                voci: (parsed.voci || []).map((v: any) => ({
                  ...v,
                  quantita: parseFloat(v.quantita) || 0,
                  prezzo_unitario: parseFloat(v.prezzo_unitario) || 0,
                  importo_totale: parseFloat(v.importo_totale) || 0,
                  approvata: true
                })),
                progetto_id: '',
                note: '',
                stato: 'approvazione',
                nomefile: file.name
              })
            }
          }
        } catch (e: any) {
          console.warn(`Immagine saltata:`, e.message)
        }
      }
    }

    setBolle(prev => [...prev, ...nuoveBolle])
    if (nuoveBolle.length > 0) setBollaAttiva(nuoveBolle[0].id)
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
    if (!bolla.fornitore_nome) { alert('Inserisci il nome del fornitore'); return }
    if (!bolla.progetto_id) { alert('Seleziona il cantiere'); return }
    const vociOk = bolla.voci.filter(v => v.approvata && v.descrizione)
    if (vociOk.length === 0) { alert('Approva almeno una voce'); return }

    setSalvando(true)
    let { data: fornExist } = await supabase.from('fornitori').select('id').ilike('ragione_sociale', `%${bolla.fornitore_nome}%`).limit(1)
    let fornitoreId = fornExist?.[0]?.id
    if (!fornitoreId) {
      const { data: nf } = await supabase.from('fornitori').insert({ ragione_sociale: bolla.fornitore_nome, cf_piva: bolla.fornitore_piva, categoria: 'Materiali', attivo: true }).select('id').single()
      fornitoreId = nf?.id
    }
    const prj = progetti.find(p => p.id === bolla.progetto_id)
    const importoTotale = vociOk.reduce((s, v) => s + v.importo_totale, 0)
    const { data: ddtCreato } = await supabase.from('ddt').insert({
      data: bolla.data, numero: bolla.numero, fornitore_id: fornitoreId, fornitore_nome: bolla.fornitore_nome,
      progetto_id: bolla.progetto_id, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: `DDT con ${vociOk.length} voci`, importo: importoTotale, stato: 'Da Fatturare', note: bolla.note
    }).select('id').single()

    if (ddtCreato) {
      for (const voce of vociOk) {
        await supabase.from('ddt_voci').insert({
          ddt_id: ddtCreato.id, descrizione: voce.descrizione, categoria: voce.categoria,
          macro_categoria: voce.macro_categoria, unita_misura: voce.unita_misura,
          quantita: voce.quantita, prezzo_unitario: voce.prezzo_unitario, importo_totale: voce.importo_totale,
          fornitore_id: fornitoreId, fornitore_nome: bolla.fornitore_nome, data_ddt: bolla.data
        })
        if (voce.prezzo_unitario > 0 && voce.descrizione) {
          const { data: pe } = await supabase.from('prezzario').select('id,prezzo_medio,n_acquisti').ilike('descrizione', voce.descrizione).eq('fornitore_nome', bolla.fornitore_nome).limit(1)
          if (pe && pe.length > 0) {
            const p = pe[0]
            const media = ((p.prezzo_medio * p.n_acquisti) + voce.prezzo_unitario) / (p.n_acquisti + 1)
            await supabase.from('prezzario').update({ ultimo_prezzo: voce.prezzo_unitario, prezzo_medio: Math.round(media * 10000) / 10000, ultima_data: bolla.data, n_acquisti: p.n_acquisti + 1 }).eq('id', p.id)
            await supabase.from('prezzario_storico').insert({ prezzario_id: p.id, ddt_id: ddtCreato.id, fornitore_id: fornitoreId, fornitore_nome: bolla.fornitore_nome, prezzo_unitario: voce.prezzo_unitario, quantita: voce.quantita, data: bolla.data })
          } else {
            const { data: np } = await supabase.from('prezzario').insert({ descrizione: voce.descrizione, categoria: voce.categoria, macro_categoria: voce.macro_categoria, unita_misura: voce.unita_misura, fornitore_id: fornitoreId, fornitore_nome: bolla.fornitore_nome, ultimo_prezzo: voce.prezzo_unitario, prezzo_medio: voce.prezzo_unitario, ultima_data: bolla.data, n_acquisti: 1 }).select('id').single()
            if (np) await supabase.from('prezzario_storico').insert({ prezzario_id: np.id, ddt_id: ddtCreato.id, fornitore_id: fornitoreId, fornitore_nome: bolla.fornitore_nome, prezzo_unitario: voce.prezzo_unitario, quantita: voce.quantita, data: bolla.data })
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
            <p className="text-sm text-gray-500 mt-0.5">Carica foto o PDF — l'AI analizza ogni pagina separatamente</p>
          </div>
          {bolle.length > 0 && !elaborando && (
            <button className="btn" onClick={() => { setBolle([]); setBollaAttiva(null) }}>🗑 Svuota tutto</button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Colonna sinistra */}
          <div className="space-y-3">
            <div className="card border-2 border-dashed border-blue-200 hover:border-blue-400 cursor-pointer text-center py-8 transition-all"
              onClick={() => !elaborando && inputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); caricaFile(e.dataTransfer.files) }}>
              <div className="text-4xl mb-3">📂</div>
              <p className="text-sm font-medium text-blue-700">Clicca o trascina i file</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, PDF multipagina</p>
              <input ref={inputRef} type="file" accept="image/*,.pdf" multiple className="hidden"
                onChange={e => caricaFile(e.target.files)} />
            </div>

            {elaborando && (
              <div className="card text-center py-6">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm font-medium text-blue-700">Analisi in corso...</p>
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
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-600">{bolle.length} bolle trovate</span>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {bolle.map(b => (
                      <div key={b.id}
                        onClick={() => b.stato === 'approvazione' && setBollaAttiva(b.id)}
                        className={`flex items-center gap-2 px-3 py-2 border-b border-gray-50 cursor-pointer transition-all ${bollaAttiva === b.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                        <span className="text-base">{b.stato === 'salvato' ? '✅' : '✋'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{b.numero || '(senza numero)'} — {b.fornitore_nome || '?'}</p>
                          <p className="text-xs text-gray-400 truncate">{b.nomefile}</p>
                        </div>
                        {b.stato === 'approvazione' && bollaAttiva !== b.id && (
                          <span className="text-xs text-amber-600 font-medium">Apri</span>
                        )}
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

          {/* Colonna destra: approvazione */}
          <div className="col-span-2">
            {!bollaCorrente || bollaCorrente.stato === 'salvato' ? (
              <div className="card h-full flex items-center justify-center text-gray-400 min-h-96">
                <div className="text-center">
                  <p className="text-4xl mb-3">{elaborando ? '🔄' : bolleSalvate.length === bolle.length && bolle.length > 0 ? '🎉' : '📋'}</p>
                  <p className="text-sm">
                    {elaborando ? progressoTesto :
                     bolleSalvate.length === bolle.length && bolle.length > 0 ? `Tutte le ${bolle.length} bolle salvate!` :
                     bolle.length === 0 ? 'Carica un PDF o delle foto per iniziare' :
                     'Seleziona una bolla dalla lista'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>Bolla {bolleSalvate.length + 1} di {bolle.length}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${bolle.length > 0 ? (bolleSalvate.length / bolle.length) * 100 : 0}%` }} />
                  </div>
                  <span className="text-green-600 font-medium">{bolleSalvate.length} salvate</span>
                </div>

                <div className="card">
                  <h3 className="text-sm font-medium text-gray-600 mb-3">
                    📋 Dati bolla — <span className="text-gray-400 text-xs">{bollaCorrente.nomefile}</span>
                  </h3>
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
                    <div>
                      <label className="label">Fornitore *</label>
                      <input className="input" list="forn-list" value={bollaCorrente.fornitore_nome}
                        onChange={e => setBolle(prev => prev.map(b => b.id === bollaCorrente.id ? {...b, fornitore_nome: e.target.value} : b))} />
                      <datalist id="forn-list">{fornitori.map(f => <option key={f.id} value={f.ragione_sociale} />)}</datalist>
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
                  <button className="btn btn-primary text-base px-6" onClick={() => salvaBolla(bollaCorrente.id)} disabled={salvando}>
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
