'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MACRO_CATEGORIE = ['Cementi','Laterizi','Ferro e Acciaio','Legno','Isolanti','Impermeabilizzanti','Inerti e Calcestruzzo','Impianti','Attrezzatura','Noli','Trasporti','Altro']

interface VoceDDT {
  descrizione: string
  macro_categoria: string
  categoria: string
  unita_misura: string
  quantita: number
  prezzo_unitario: number
  importo_totale: number
  approvata: boolean
}

interface FileDDT {
  id: string
  file: File
  nome: string
  stato: 'attesa' | 'analisi' | 'approvazione' | 'salvato' | 'errore' | 'raggruppato'
  errore?: string
  gruppoId?: string
  ddt?: {
    numero: string
    data: string
    fornitore_nome: string
    fornitore_piva: string
    voci: VoceDDT[]
    progetto_id: string
    note: string
  }
}

interface Gruppo {
  id: string
  fileIds: string[]
  nome: string
}

export default function ImportDDT() {
  const [files, setFiles] = useState<FileDDT[]>([])
  const [gruppi, setGruppi] = useState<Gruppo[]>([])
  const [fileInApprovazione, setFileInApprovazione] = useState<string | null>(null)
  const [progetti, setProgetti] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [elaborando, setElaborando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [selezionatiPerGruppo, setSelezionatiPerGruppo] = useState<string[]>([])
  const [modalGruppo, setModalGruppo] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('progetti').select('id,codice,nome').eq('stato', 'In Corso').then(({ data }) => setProgetti(data || []))
    supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).then(({ data }) => setFornitori(data || []))
  }, [])

  function aggiungiFiles(nuoviFiles: FileList | null) {
    if (!nuoviFiles) return
    const nuovi: FileDDT[] = Array.from(nuoviFiles).map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      nome: f.name,
      stato: 'attesa'
    }))
    setFiles(prev => [...prev, ...nuovi])
  }

  function rimuoviFile(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id))
    setGruppi(prev => prev.map(g => ({ ...g, fileIds: g.fileIds.filter(fid => fid !== id) })).filter(g => g.fileIds.length > 0))
  }

  function creaGruppo() {
    if (selezionatiPerGruppo.length < 2) { alert('Seleziona almeno 2 file per creare un gruppo multi-pagina'); return }
    const nomeFile = files.find(f => f.id === selezionatiPerGruppo[0])?.nome || 'Gruppo'
    const gruppoId = Math.random().toString(36).slice(2)
    setGruppi(prev => [...prev, { id: gruppoId, fileIds: selezionatiPerGruppo, nome: `Bolla da ${selezionatiPerGruppo.length} pagine (${nomeFile})` }])
    setFiles(prev => prev.map(f => selezionatiPerGruppo.includes(f.id) ? { ...f, stato: 'raggruppato', gruppoId } : f))
    setSelezionatiPerGruppo([])
    setModalGruppo(false)
  }

  function sciogliGruppo(gruppoId: string) {
    setFiles(prev => prev.map(f => f.gruppoId === gruppoId ? { ...f, stato: 'attesa', gruppoId: undefined } : f))
    setGruppi(prev => prev.filter(g => g.id !== gruppoId))
  }

  const filesRef = useRef<FileDDT[]>([])
  useEffect(() => { filesRef.current = files }, [files])

  async function analizzaFile(fileId: string, fileObj: File): Promise<void> {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, stato: 'analisi' } : f))

    try {
      const base64Raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(fileObj)
      })

      let base64 = base64Raw
      let mediaType = fileObj.type

      if (fileObj.type.startsWith('image/')) {
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
          img.src = 'data:' + fileObj.type + ';base64,' + base64Raw
        })
        base64 = compressed
        mediaType = 'image/jpeg'
      }

      const response = await fetch('/api/analizza-ddt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Errore API')
      }

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      // La route ora restituisce sempre un array di DDT
      const ddtArray: any[] = data.parsed || []

      if (ddtArray.length === 0) throw new Error('Nessun DDT trovato nel file')

      if (ddtArray.length === 1) {
        // PDF con una sola bolla
        const parsed = ddtArray[0]
        setFiles(prev => prev.map(f => f.id === fileId ? {
          ...f,
          stato: 'approvazione',
          ddt: {
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
            note: ''
          }
        } : f))
      } else {
        // PDF con più bolle — crea un file virtuale per ogni DDT
        const nuoviFile: FileDDT[] = ddtArray.slice(1).map((parsed: any, idx: number) => ({
          id: Math.random().toString(36).slice(2),
          file: fileObj,
          nome: `${fileObj.name} — Bolla ${idx + 2}`,
          stato: 'approvazione' as const,
          ddt: {
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
            note: ''
          }
        }))

        const parsed0 = ddtArray[0]
        setFiles(prev => [
          ...prev.map(f => f.id === fileId ? {
            ...f,
            stato: 'approvazione' as const,
            nome: `${f.nome} — Bolla 1`,
            ddt: {
              numero: parsed0.numero || '',
              data: parsed0.data || new Date().toISOString().split('T')[0],
              fornitore_nome: parsed0.fornitore_nome || '',
              fornitore_piva: parsed0.fornitore_piva || '',
              voci: (parsed0.voci || []).map((v: any) => ({
                ...v,
                quantita: parseFloat(v.quantita) || 0,
                prezzo_unitario: parseFloat(v.prezzo_unitario) || 0,
                importo_totale: parseFloat(v.importo_totale) || 0,
                approvata: true
              })),
              progetto_id: '',
              note: ''
            }
          } : f),
          ...nuoviFile
        ])
      }
    } catch (e: any) {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, stato: 'errore', errore: e.message } : f))
    }
  }

  async function analizzaGruppo(gruppoId: string): Promise<void> {
    const gruppo = gruppi.find(g => g.id === gruppoId)
    if (!gruppo) return

    setFiles(prev => prev.map(f => gruppo.fileIds.includes(f.id) ? { ...f, stato: 'analisi' } : f))

    try {
      const pagineDati = await Promise.all(
        gruppo.fileIds.map(async (fid) => {
          const fileDdt = filesRef.current.find(f => f.id === fid)
          if (!fileDdt) return null
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve((reader.result as string).split(',')[1])
            reader.onerror = reject
            reader.readAsDataURL(fileDdt.file)
          })
          return { base64, mediaType: fileDdt.file.type }
        })
      )

      // Usa solo la prima pagina per l'analisi AI (le altre sono pagine aggiuntive dello stesso DDT)
      // Invia tutte le pagine all'AI insieme
      const response = await fetch('/api/analizza-ddt-multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagine: pagineDati.filter(Boolean) })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Errore API')
      }

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      const parsed = data.parsed
      const primoFileId = gruppo.fileIds[0]

      // Marca primo file come da approvare, gli altri come raggruppati/elaborati
      setFiles(prev => prev.map(f => {
        if (f.id === primoFileId) return {
          ...f,
          stato: 'approvazione',
          ddt: {
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
            note: ''
          }
        }
        if (gruppo.fileIds.includes(f.id)) return { ...f, stato: 'raggruppato' }
        return f
      }))
    } catch (e: any) {
      setFiles(prev => prev.map(f => gruppo.fileIds.includes(f.id) ? { ...f, stato: 'errore', errore: e.message } : f))
    }
  }

  async function avviaElaborazione() {
    setElaborando(true)

    // Cattura i file da elaborare PRIMA del loop con tutti i dati necessari
    const fileDaElaborare = files
      .filter(f => f.stato === 'attesa' && !f.gruppoId)
      .map(f => ({ id: f.id, file: f.file }))

    const idGruppi = gruppi.map(g => g.id)

    // Prima elabora i gruppi
    for (const gruppoId of idGruppi) {
      await analizzaGruppo(gruppoId)
    }

    // Poi i file singoli — passa l'oggetto File direttamente
    for (const { id, file } of fileDaElaborare) {
      await analizzaFile(id, file)
    }

    setElaborando(false)

    // Apri il primo file da approvare
    setFiles(prev => {
      const primo = prev.find(f => f.stato === 'approvazione')
      if (primo) setFileInApprovazione(primo.id)
      return prev
    })
  }

  function aggiornaVoce(fileId: string, idx: number, campo: string, valore: any) {
    setFiles(prev => prev.map(f => {
      if (f.id !== fileId || !f.ddt) return f
      const nuoveVoci = [...f.ddt.voci]
      nuoveVoci[idx] = { ...nuoveVoci[idx], [campo]: valore }
      if (campo === 'quantita' || campo === 'prezzo_unitario') {
        const q = campo === 'quantita' ? parseFloat(valore) || 0 : nuoveVoci[idx].quantita
        const p = campo === 'prezzo_unitario' ? parseFloat(valore) || 0 : nuoveVoci[idx].prezzo_unitario
        nuoveVoci[idx].importo_totale = Math.round(q * p * 100) / 100
      }
      return { ...f, ddt: { ...f.ddt!, voci: nuoveVoci } }
    }))
  }

  function aggiungiVoce(fileId: string) {
    setFiles(prev => prev.map(f => {
      if (f.id !== fileId || !f.ddt) return f
      return { ...f, ddt: { ...f.ddt!, voci: [...f.ddt.voci, {
        descrizione: '', macro_categoria: 'Altro', categoria: '',
        unita_misura: '', quantita: 0, prezzo_unitario: 0, importo_totale: 0, approvata: true
      }]}}
    }))
  }

  function eliminaVoce(fileId: string, idx: number) {
    setFiles(prev => prev.map(f => {
      if (f.id !== fileId || !f.ddt) return f
      return { ...f, ddt: { ...f.ddt!, voci: f.ddt.voci.filter((_, i) => i !== idx) }}
    }))
  }

  async function salvaDDT(fileId: string) {
    const fileDdt = files.find(f => f.id === fileId)
    if (!fileDdt?.ddt) return
    const ddt = fileDdt.ddt

    if (!ddt.numero) { alert('Inserisci il numero del DDT'); return }
    if (!ddt.fornitore_nome) { alert('Inserisci il nome del fornitore'); return }
    if (!ddt.progetto_id) { alert('Seleziona il cantiere'); return }

    const vociApprovate = ddt.voci.filter(v => v.approvata && v.descrizione)
    if (vociApprovate.length === 0) { alert('Approva almeno una voce'); return }

    setSalvando(true)

    let { data: fornExist } = await supabase.from('fornitori')
      .select('id').ilike('ragione_sociale', `%${ddt.fornitore_nome}%`).limit(1)
    let fornitoreId = fornExist?.[0]?.id
    if (!fornitoreId) {
      const { data: newForn } = await supabase.from('fornitori').insert({
        ragione_sociale: ddt.fornitore_nome, cf_piva: ddt.fornitore_piva,
        categoria: 'Materiali', attivo: true
      }).select('id').single()
      fornitoreId = newForn?.id
    }

    const prj = progetti.find(p => p.id === ddt.progetto_id)
    const importoTotale = vociApprovate.reduce((s, v) => s + v.importo_totale, 0)

    const { data: ddtCreato } = await supabase.from('ddt').insert({
      data: ddt.data, numero: ddt.numero,
      fornitore_id: fornitoreId, fornitore_nome: ddt.fornitore_nome,
      progetto_id: ddt.progetto_id,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: `DDT con ${vociApprovate.length} voci`,
      importo: importoTotale, stato: 'Da Fatturare', note: ddt.note
    }).select('id').single()

    if (ddtCreato) {
      for (const voce of vociApprovate) {
        await supabase.from('ddt_voci').insert({
          ddt_id: ddtCreato.id, descrizione: voce.descrizione,
          categoria: voce.categoria, macro_categoria: voce.macro_categoria,
          unita_misura: voce.unita_misura, quantita: voce.quantita,
          prezzo_unitario: voce.prezzo_unitario, importo_totale: voce.importo_totale,
          fornitore_id: fornitoreId, fornitore_nome: ddt.fornitore_nome, data_ddt: ddt.data
        })

        if (voce.prezzo_unitario > 0 && voce.descrizione) {
          const { data: prezExist } = await supabase.from('prezzario')
            .select('id,prezzo_medio,n_acquisti')
            .ilike('descrizione', voce.descrizione)
            .eq('fornitore_nome', ddt.fornitore_nome).limit(1)

          if (prezExist && prezExist.length > 0) {
            const p = prezExist[0]
            const nuovaMedia = ((p.prezzo_medio * p.n_acquisti) + voce.prezzo_unitario) / (p.n_acquisti + 1)
            await supabase.from('prezzario').update({
              ultimo_prezzo: voce.prezzo_unitario,
              prezzo_medio: Math.round(nuovaMedia * 10000) / 10000,
              ultima_data: ddt.data, n_acquisti: p.n_acquisti + 1
            }).eq('id', p.id)
            await supabase.from('prezzario_storico').insert({
              prezzario_id: p.id, ddt_id: ddtCreato.id,
              fornitore_id: fornitoreId, fornitore_nome: ddt.fornitore_nome,
              prezzo_unitario: voce.prezzo_unitario, quantita: voce.quantita, data: ddt.data
            })
          } else {
            const { data: newPrez } = await supabase.from('prezzario').insert({
              descrizione: voce.descrizione, categoria: voce.categoria,
              macro_categoria: voce.macro_categoria, unita_misura: voce.unita_misura,
              fornitore_id: fornitoreId, fornitore_nome: ddt.fornitore_nome,
              ultimo_prezzo: voce.prezzo_unitario, prezzo_medio: voce.prezzo_unitario,
              ultima_data: ddt.data, n_acquisti: 1
            }).select('id').single()
            if (newPrez) {
              await supabase.from('prezzario_storico').insert({
                prezzario_id: newPrez.id, ddt_id: ddtCreato.id,
                fornitore_id: fornitoreId, fornitore_nome: ddt.fornitore_nome,
                prezzo_unitario: voce.prezzo_unitario, quantita: voce.quantita, data: ddt.data
              })
            }
          }
        }
      }
    }

    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, stato: 'salvato' } : f))
    setSalvando(false)

    // Passa automaticamente al prossimo da approvare
    const prossimo = files.find(f => f.stato === 'approvazione' && f.id !== fileId)
    setFileInApprovazione(prossimo?.id || null)
  }

  function saltaDDT(fileId: string) {
    const prossimo = files.find(f => f.stato === 'approvazione' && f.id !== fileId)
    setFileInApprovazione(prossimo?.id || null)
  }

  const fileAttesa = files.filter(f => f.stato === 'attesa' && !f.gruppoId)
  const fileInAnalisi = files.filter(f => f.stato === 'analisi')
  const fileApprovazione = files.filter(f => f.stato === 'approvazione')
  const fileSalvati = files.filter(f => f.stato === 'salvato')
  const fileErrore = files.filter(f => f.stato === 'errore')
  const fileAttivo = files.find(f => f.id === fileInApprovazione)

  const statoColore = (stato: string) => {
    if (stato === 'attesa') return 'text-gray-400'
    if (stato === 'analisi') return 'text-blue-600'
    if (stato === 'approvazione') return 'text-amber-600'
    if (stato === 'salvato') return 'text-green-600'
    if (stato === 'errore') return 'text-red-600'
    if (stato === 'raggruppato') return 'text-purple-500'
    return 'text-gray-400'
  }

  const statoLabel = (stato: string) => {
    if (stato === 'attesa') return '⏳ In attesa'
    if (stato === 'analisi') return '🔄 Analisi AI...'
    if (stato === 'approvazione') return '✋ Da approvare'
    if (stato === 'salvato') return '✅ Salvato'
    if (stato === 'errore') return '❌ Errore'
    if (stato === 'raggruppato') return '📎 Raggruppato'
    return stato
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold">Import DDT con AI</h1>
            <p className="text-sm text-gray-500 mt-0.5">Carica tutte le bolle insieme — l'AI le analizza una per una</p>
          </div>
          {files.length > 0 && (
            <button className="btn" onClick={() => setFiles([])}>🗑 Svuota tutto</button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Colonna sinistra: coda file */}
          <div className="space-y-3">
            {/* Upload area */}
            <div
              className="card border-2 border-dashed border-blue-200 hover:border-blue-400 cursor-pointer text-center py-6 transition-all"
              onClick={() => inputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); aggiungiFiles(e.dataTransfer.files) }}>
              <div className="text-3xl mb-2">📂</div>
              <p className="text-sm font-medium text-blue-700">Clicca o trascina i file</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, PDF — anche tanti insieme</p>
              <input ref={inputRef} type="file" accept="image/*,.pdf" multiple className="hidden"
                onChange={e => aggiungiFiles(e.target.files)} />
            </div>

            {/* Gruppi multi-pagina */}
            {gruppi.length > 0 && (
              <div className="card">
                <p className="text-xs font-medium text-gray-600 mb-2">📎 Bolle multi-pagina</p>
                {gruppi.map(g => (
                  <div key={g.id} className="flex items-center justify-between bg-purple-50 rounded-lg px-3 py-2 mb-1">
                    <p className="text-xs text-purple-700 font-medium flex-1 truncate">{g.nome}</p>
                    <button className="text-xs text-gray-400 hover:text-red-500 ml-2"
                      onClick={() => sciogliGruppo(g.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Lista file */}
            {files.length > 0 && (
              <div className="card p-0 overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">{files.length} file caricati</span>
                  {fileAttesa.length > 0 && (
                    <button className="text-xs text-blue-600 hover:text-blue-800"
                      onClick={() => { setSelezionatiPerGruppo([]); setModalGruppo(true) }}>
                      + Raggruppa pagine
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {files.map(f => (
                    <div key={f.id} className={`flex items-center gap-2 px-3 py-2 border-b border-gray-50 ${fileInApprovazione === f.id ? 'bg-amber-50' : ''}`}>
                      <span className="text-lg flex-shrink-0">
                        {f.file.type === 'application/pdf' ? '📄' : '🖼'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{f.nome}</p>
                        <p className={`text-xs ${statoColore(f.stato)}`}>{statoLabel(f.stato)}</p>
                        {f.errore && <p className="text-xs text-red-500 truncate">{f.errore}</p>}
                      </div>
                      {f.stato === 'approvazione' && (
                        <button className="btn btn-sm text-amber-600 border-amber-200 text-xs"
                          onClick={() => setFileInApprovazione(f.id)}>Apri</button>
                      )}
                      {(f.stato === 'attesa' || f.stato === 'errore') && (
                        <button className="text-gray-300 hover:text-red-500 text-sm"
                          onClick={() => rimuoviFile(f.id)}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Statistiche */}
            {files.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Da analizzare', val: fileAttesa.length + gruppi.length, col: 'text-gray-600' },
                  { label: 'In analisi', val: fileInAnalisi.length, col: 'text-blue-600' },
                  { label: 'Da approvare', val: fileApprovazione.length, col: 'text-amber-600' },
                  { label: 'Salvati', val: fileSalvati.length, col: 'text-green-600' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className={`text-lg font-semibold ${s.col}`}>{s.val}</p>
                    <p className="text-xs text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Pulsante avvia */}
            {(fileAttesa.length > 0 || gruppi.length > 0) && !elaborando && (
              <button className="btn btn-primary w-full py-3 text-base" onClick={avviaElaborazione}>
                🤖 Analizza {fileAttesa.length + gruppi.length} bolle con AI
              </button>
            )}
            {elaborando && (
              <div className="card text-center py-4">
                <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Analisi in corso...</p>
              </div>
            )}
            {fileApprovazione.length > 0 && !fileInApprovazione && (
              <button className="btn btn-primary w-full" onClick={() => setFileInApprovazione(fileApprovazione[0].id)}>
                ✋ Inizia approvazione ({fileApprovazione.length} bolle)
              </button>
            )}
          </div>

          {/* Colonna destra: approvazione */}
          <div className="col-span-2">
            {!fileAttivo ? (
              <div className="card h-full flex items-center justify-center text-gray-400 min-h-96">
                <div className="text-center">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-sm">
                    {files.length === 0 ? 'Carica le bolle da sinistra per iniziare' :
                     elaborando ? 'L\'AI sta analizzando le bolle...' :
                     fileSalvati.length === files.filter(f => f.stato !== 'raggruppato').length && files.length > 0 ? '✅ Tutte le bolle sono state salvate!' :
                     'Clicca "Apri" su una bolla da approvare'}
                  </p>
                </div>
              </div>
            ) : fileAttivo.ddt ? (
              <div className="space-y-3">
                {/* Progress */}
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>Bolla {fileSalvati.length + 1} di {fileApprovazione.length + fileSalvati.length}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${(fileSalvati.length / (fileApprovazione.length + fileSalvati.length)) * 100}%` }} />
                  </div>
                  <span className="text-green-600 font-medium">{fileSalvati.length} salvate</span>
                </div>

                {/* Dati testata */}
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-600">📋 Dati bolla — <span className="text-gray-400 text-xs">{fileAttivo.nome}</span></h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div>
                      <label className="label">N° DDT *</label>
                      <input className="input" value={fileAttivo.ddt.numero}
                        onChange={e => setFiles(prev => prev.map(f => f.id === fileAttivo.id ? {...f, ddt: {...f.ddt!, numero: e.target.value}} : f))} />
                    </div>
                    <div>
                      <label className="label">Data</label>
                      <input className="input" type="date" value={fileAttivo.ddt.data}
                        onChange={e => setFiles(prev => prev.map(f => f.id === fileAttivo.id ? {...f, ddt: {...f.ddt!, data: e.target.value}} : f))} />
                    </div>
                    <div>
                      <label className="label">Fornitore *</label>
                      <input className="input" list="forn-list" value={fileAttivo.ddt.fornitore_nome}
                        onChange={e => setFiles(prev => prev.map(f => f.id === fileAttivo.id ? {...f, ddt: {...f.ddt!, fornitore_nome: e.target.value}} : f))} />
                      <datalist id="forn-list">{fornitori.map(f => <option key={f.id} value={f.ragione_sociale} />)}</datalist>
                    </div>
                    <div>
                      <label className="label">Cantiere *</label>
                      <select className="input" value={fileAttivo.ddt.progetto_id}
                        onChange={e => setFiles(prev => prev.map(f => f.id === fileAttivo.id ? {...f, ddt: {...f.ddt!, progetto_id: e.target.value}} : f))}>
                        <option value="">-- seleziona --</option>
                        {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Voci */}
                <div className="card">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-600">📦 Voci ({fileAttivo.ddt.voci.length})</h3>
                    <button className="btn btn-sm btn-primary" onClick={() => aggiungiVoce(fileAttivo.id)}>+ Voce</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead><tr>
                        <th style={{width:36}}>✓</th>
                        <th>Descrizione</th>
                        <th>Categoria</th>
                        <th>U.M.</th>
                        <th>Qtà</th>
                        <th>€/unit</th>
                        <th>Totale</th>
                        <th></th>
                      </tr></thead>
                      <tbody>
                        {fileAttivo.ddt.voci.map((voce, idx) => (
                          <tr key={idx} className={!voce.approvata ? 'opacity-40' : ''}>
                            <td>
                              <input type="checkbox" checked={voce.approvata}
                                onChange={e => aggiornaVoce(fileAttivo.id, idx, 'approvata', e.target.checked)} />
                            </td>
                            <td><input className="input text-xs py-1" value={voce.descrizione}
                              onChange={e => aggiornaVoce(fileAttivo.id, idx, 'descrizione', e.target.value)} /></td>
                            <td>
                              <select className="input text-xs py-1" value={voce.macro_categoria}
                                onChange={e => aggiornaVoce(fileAttivo.id, idx, 'macro_categoria', e.target.value)}>
                                {MACRO_CATEGORIE.map(m => <option key={m}>{m}</option>)}
                              </select>
                            </td>
                            <td><input className="input text-xs py-1 w-14" value={voce.unita_misura}
                              onChange={e => aggiornaVoce(fileAttivo.id, idx, 'unita_misura', e.target.value)} /></td>
                            <td><input className="input text-xs py-1 w-20" type="number" step="0.001"
                              value={voce.quantita || ''}
                              onChange={e => aggiornaVoce(fileAttivo.id, idx, 'quantita', e.target.value)} /></td>
                            <td><input className="input text-xs py-1 w-24" type="number" step="0.0001"
                              value={voce.prezzo_unitario || ''}
                              onChange={e => aggiornaVoce(fileAttivo.id, idx, 'prezzo_unitario', e.target.value)} /></td>
                            <td className="font-medium text-sm">{euro(voce.importo_totale)}</td>
                            <td><button className="text-gray-300 hover:text-red-500 text-sm"
                              onClick={() => eliminaVoce(fileAttivo.id, idx)}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{fileAttivo.ddt.voci.filter(v => v.approvata).length} voci approvate</span>
                    <span className="font-semibold text-sm">
                      {euro(fileAttivo.ddt.voci.filter(v => v.approvata).reduce((s, v) => s + v.importo_totale, 0))}
                    </span>
                  </div>
                </div>

                {/* Azioni */}
                <div className="flex gap-3 justify-end">
                  <button className="btn" onClick={() => saltaDDT(fileAttivo.id)}>
                    Salta →
                  </button>
                  <button className="btn btn-primary text-base px-6" onClick={() => salvaDDT(fileAttivo.id)} disabled={salvando}>
                    {salvando ? 'Salvataggio...' : '✅ Conferma e salva'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      {/* Modal raggruppa pagine */}
      {modalGruppo && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Raggruppa pagine</h2>
                <p className="text-xs text-gray-500 mt-0.5">Seleziona i file che appartengono alla stessa bolla</p>
              </div>
              <button onClick={() => setModalGruppo(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {files.filter(f => f.stato === 'attesa').map(f => (
                <label key={f.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-all ${selezionatiPerGruppo.includes(f.id) ? 'bg-blue-50 border-blue-200' : 'border-gray-100 hover:bg-gray-50'}`}>
                  <input type="checkbox" checked={selezionatiPerGruppo.includes(f.id)}
                    onChange={e => {
                      if (e.target.checked) setSelezionatiPerGruppo(prev => [...prev, f.id])
                      else setSelezionatiPerGruppo(prev => prev.filter(id => id !== f.id))
                    }} />
                  <span className="text-lg">{f.file.type === 'application/pdf' ? '📄' : '🖼'}</span>
                  <span className="text-sm">{f.nome}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setModalGruppo(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={creaGruppo}
                disabled={selezionatiPerGruppo.length < 2}>
                Raggruppa {selezionatiPerGruppo.length} file
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
