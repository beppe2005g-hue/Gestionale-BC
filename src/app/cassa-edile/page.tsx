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
  const [programmi, setProgrammi] = useState<Record<Societa, Cantiere[]>>({ 'BC General Service': [], 'Filosofia': [] })
  const [presenzeApprovate, setPresenzeApprovate] = useState<Record<Societa, boolean>>({ 'BC General Service': false, 'Filosofia': false })
  const [loading, setLoading] = useState(true)
  const [copiato, setCopiato] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [dataProgr, setDataProgr] = useState(new Date().toISOString().split('T')[0])
  const [vistaPool, setVistaPool] = useState<'liberi' | 'tutti'>('liberi')
  const [tabMobile, setTabMobile] = useState<'pool' | 'cantieri' | 'anteprima'>('cantieri')
  const [aggiornamentoDisponibile, setAggiornamentoDisponibile] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [modalApprova, setModalApprova] = useState(false)
  const [statiPresenza, setStatiPresenza] = useState<Record<string, { stato: 'presente'|'assente'|'parziale', ore: number, cantiere: string }>>({})
  const [conducenti, setConducenti] = useState<Record<string, string>>({})
  const [salvandoApprovazione, setSalvandoApprovazione] = useState(false)
  const [mezzoInSelezione, setMezzoInSelezione] = useState<{ id: string; nome: string } | null>(null)
  const [giorniNonApprovati, setGiorniNonApprovati] = useState<Record<Societa, string[]>>({ 'BC General Service': [], 'Filosofia': [] })
  const [statiPresenzaTecnici, setStatiPresenzaTecnici] = useState<Record<string, { stato: 'presente'|'assente'|'parziale', ore: number }>>({})
  const [cantieriAperti, setCantieriAperti] = useState<string[]>([])
  const [cantieriProgetti, setCantieriProgetti] = useState<any[]>([])
  // Modal importa da messaggio WhatsApp
  const [modalMessaggio, setModalMessaggio] = useState(false)
  const [testoMessaggio, setTestoMessaggio] = useState('')
  const [analizzando, setAnalizzando] = useState(false)
  const [erroreAI, setErroreAI] = useState('')
  const [anteprimaAI, setAnteprimaAI] = useState<any[] | null>(null)
  // Stato per cantieri dipendenti nel modal approvazione: dipId -> {cantiere_id, cantiere_nome, is_vario, vario_nota}
  const [cantieriApprov, setCantieriApprov] = useState<Record<string, { cantiere_id: string; cantiere_nome: string; is_vario: boolean; vario_nota: string }>>({})
  // Mezzi nel modal approvazione: { mezzoId -> cantiere_nome } (editabili)
  const [mezziApprov, setMezziApprov] = useState<Record<string, string>>({})

  const cantieri = programmi[societaAttiva]
  const mezziSocieta = mezziDB.filter(m => (m.societa || 'BC General Service') === societaAttiva)
  const dipUsati = new Set(cantieri.flatMap(c => c.lavorazioni.flatMap(l => l.persone.map(p => p.id))))
  const mezziUsati = new Set(cantieri.flatMap(c => c.mezzi.map(m => m.id)))

  const dipPerAzienda = dipendenti.reduce((acc, d) => {
    if (d.tecnico) return acc // i tecnici non vanno nel pool cantieri
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserEmail(data.user?.email ?? null))
  }, [])

  useEffect(() => {
    // Carica cantieri aperti per autocomplete
    supabase.from('cantieri').select('nome').eq('stato', 'aperto').order('nome')
      .then(({ data }) => setCantieriAperti((data || []).map((c: any) => c.nome)))
    // Carica progetti aperti per dropdown approvazione
    supabase.from('progetti').select('id,codice,nome').eq('stato', 'In Corso').order('nome')
      .then(({ data }) => setCantieriProgetti(data || []))
    // Carica mezzi
    supabase.from('mezzi').select('id,nome,targa').eq('attivo', true).order('nome')
      .then(({ data }) => setMezziDB(data || []))
  }, [])

  useEffect(() => { load() }, [dataProgr])

  // Real-time: ascolta modifiche al programma per la data corrente
  useEffect(() => {
    const channel = supabase
      .channel(`programmi-rt-${dataProgr}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'programma_giornaliero' }, (payload: any) => {
        if (payload.new?.data === dataProgr || payload.old?.data === dataProgr) {
          setAggiornamentoDisponibile(true)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [dataProgr])

  async function load() {
    setLoading(true)
    setAggiornamentoDisponibile(false)
    const [{ data: dip }, { data: mez }, { data: progBC }, { data: progFil }] = await Promise.all([
      supabase.from('dipendenti').select('id,nome,cognome,azienda,nome_programma,foto_url,ordine,tecnico').eq('attivo', true).order('ordine', { ascending: true, nullsFirst: false }).order('cognome'),
      supabase.from('mezzi').select('id,nome,targa,posti,societa').eq('attivo', true).order('nome'),
      supabase.from('programma_giornaliero').select('*').eq('societa', 'BC General Service').eq('data', dataProgr).limit(1),
      supabase.from('programma_giornaliero').select('*').eq('societa', 'Filosofia').eq('data', dataProgr).limit(1),
    ])
    setDipendenti(dip || [])
    setMezziDB(mez || [])

    const nuoviProgrammi: Record<Societa, Cantiere[]> = { 'BC General Service': [], 'Filosofia': [] }
    const nuoveApprovazioni: Record<Societa, boolean> = { 'BC General Service': false, 'Filosofia': false }

    if (progBC && progBC.length > 0) { nuoviProgrammi['BC General Service'] = progBC[0].cantieri || []; nuoveApprovazioni['BC General Service'] = !!progBC[0].presenze_approvate }
    if (progFil && progFil.length > 0) { nuoviProgrammi['Filosofia'] = progFil[0].cantieri || []; nuoveApprovazioni['Filosofia'] = !!progFil[0].presenze_approvate }

    for (const soc of ['BC General Service', 'Filosofia'] as Societa[]) {
      const giaEsiste = soc === 'BC General Service' ? (progBC && progBC.length > 0) : (progFil && progFil.length > 0)
      if (!giaEsiste) {
        const { data: ul } = await supabase.from('programma_giornaliero').select('cantieri').eq('societa', soc).eq('presenze_approvate', true).order('data', { ascending: false }).limit(1)
        if (ul && ul.length > 0) nuoviProgrammi[soc] = ul[0].cantieri || []
      }
    }

    setProgrammi(nuoviProgrammi)
    setPresenzeApprovate(nuoveApprovazioni)

    // Controlla giorni passati non approvati (per badge notifica)
    const oggi = new Date().toISOString().split('T')[0]
    const { data: nonApprovati } = await supabase.from('programma_giornaliero')
      .select('data,societa')
      .eq('presenze_approvate', false)
      .lt('data', oggi)
      .order('data', { ascending: false })
    const naBC = (nonApprovati || []).filter(r => r.societa === 'BC General Service').map(r => r.data)
    const naFil = (nonApprovati || []).filter(r => r.societa === 'Filosofia').map(r => r.data)
    setGiorniNonApprovati({ 'BC General Service': naBC, 'Filosofia': naFil })

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
        if (lav.persone.length > 0) righe.push(lav.persone.map((p, i) => i === 0 ? `"${p.nomeBreve}` : p.nomeBreve).join(' + '))
      }
      if (c.mezzi.length > 0) righe.push(c.mezzi.map(m => `*${m.nome}`).join('+'))
      righe.push('')
    }
    righe.push(FOOTER)
    return righe.join('\n')
  }

  const messaggio = generaMessaggio(cantieri)
  function update(nuoviCantieri: Cantiere[]) { setProgrammi(prev => ({ ...prev, [societaAttiva]: nuoviCantieri })) }

  function dovePiazzatoAltraSocieta(dipId: string): { societa: Societa, cantiere: string } | null {
    const altra: Societa = societaAttiva === 'BC General Service' ? 'Filosofia' : 'BC General Service'
    for (const c of programmi[altra]) for (const l of c.lavorazioni)
      if (l.persone.find(p => p.id === dipId)) return { societa: altra, cantiere: c.nome || 'Cantiere senza nome' }
    return null
  }

  function aggiungiPersona(cid: string, lid: string, dip: any) {
    if (dipUsati.has(dip.id)) return
    const altraSoc = dovePiazzatoAltraSocieta(dip.id)
    if (altraSoc) { if (!confirm(`⚠️ ${nomeBreve(dip)} è già in "${altraSoc.cantiere}" (${altraSoc.societa}). Confermi?`)) return }
    const persona: Persona = { id: dip.id, nomeBreve: nomeBreve(dip), nomeFull: `${dip.cognome} ${dip.nome}`.trim(), capocantiere: false }
    update(cantieri.map(c => c.id === cid ? { ...c, lavorazioni: c.lavorazioni.map(l => {
      if (l.id !== lid) return l
      return { ...l, persone: [...l.persone, { ...persona, capocantiere: l.persone.length === 0 }] }
    }) } : c))
  }

  function rimuoviPersona(cid: string, lid: string, dipId: string) {
    update(cantieri.map(c => c.id === cid ? { ...c, lavorazioni: c.lavorazioni.map(l => l.id === lid ? { ...l, persone: l.persone.filter(p => p.id !== dipId) } : l) } : c))
  }
  function toggleCapo(cid: string, lid: string, dipId: string) {
    update(cantieri.map(c => c.id === cid ? { ...c, lavorazioni: c.lavorazioni.map(l => l.id === lid ? { ...l, persone: l.persone.map(p => p.id === dipId ? { ...p, capocantiere: !p.capocantiere } : p) } : l) } : c))
  }
  function aggiungiMezzo(cid: string, m: any) {
    if (mezziUsati.has(m.id)) return
    update(cantieri.map(c => c.id === cid ? { ...c, mezzi: [...c.mezzi, { id: m.id, nome: m.nome }] } : c))
  }
  function rimuoviMezzo(cid: string, mezzoId: string) { update(cantieri.map(c => c.id === cid ? { ...c, mezzi: c.mezzi.filter(m => m.id !== mezzoId) } : c)) }
  function aggiungiCantiere() { update([...cantieri, { id: genId(), nome: '', note: '', lavorazioni: [{ id: genId(), nome: '', persone: [] }], mezzi: [] }]) }
  function rimuoviCantiere(cid: string) { update(cantieri.filter(c => c.id !== cid)) }
  function aggiornaCantiere(cid: string, campo: string, val: string) { update(cantieri.map(c => c.id === cid ? { ...c, [campo]: val } : c)) }
  function spostaCantiere(cid: string, direzione: 'su' | 'giu') {
    const idx = cantieri.findIndex(c => c.id === cid)
    if (direzione === 'su' && idx === 0) return
    if (direzione === 'giu' && idx === cantieri.length - 1) return
    const nuovi = [...cantieri]
    const target = direzione === 'su' ? idx - 1 : idx + 1
    ;[nuovi[idx], nuovi[target]] = [nuovi[target], nuovi[idx]]
    update(nuovi)
  }
  function aggiungiLavorazione(cid: string) { update(cantieri.map(c => c.id === cid ? { ...c, lavorazioni: [...c.lavorazioni, { id: genId(), nome: '', persone: [] }] } : c)) }
  function rimuoviLavorazione(cid: string, lid: string) { update(cantieri.map(c => c.id === cid ? { ...c, lavorazioni: c.lavorazioni.filter(l => l.id !== lid) } : c)) }
  function aggiornaLavorazione(cid: string, lid: string, nome: string) { update(cantieri.map(c => c.id === cid ? { ...c, lavorazioni: c.lavorazioni.map(l => l.id === lid ? { ...l, nome } : l) } : c)) }

  async function salva() {
    setSalvando(true)
    for (const soc of ['BC General Service', 'Filosofia'] as Societa[]) {
      const { data: es } = await supabase.from('programma_giornaliero').select('id').eq('societa', soc).eq('data', dataProgr).limit(1)
      if (es && es.length > 0) {
        await supabase.from('programma_giornaliero').update({ cantieri: programmi[soc], updated_at: new Date().toISOString() }).eq('id', es[0].id)
      } else {
        await supabase.from('programma_giornaliero').insert({ data: dataProgr, societa: soc, cantieri: programmi[soc], presenze_approvate: false, updated_at: new Date().toISOString() })
      }
    }
    setSalvando(false)
  }

  function nuovoProgramma() {
    if (!confirm(`Creare un nuovo programma ${societaAttiva}?`)) return
    setProgrammi(prev => ({ ...prev, [societaAttiva]: [] }))
    load()
  }

  async function copiaMessaggio() {
    await navigator.clipboard.writeText(messaggio)
    setCopiato(true); setTimeout(() => setCopiato(false), 2000)
  }

  function dovePiazzato(dipId: string): string {
    for (const c of cantieri) for (const l of c.lavorazioni) if (l.persone.find(p => p.id === dipId)) return c.nome || 'Cantiere senza nome'
    return ''
  }
  function dovePiazzatoMezzo(mezzoId: string): string {
    for (const c of cantieri) if (c.mezzi.find(m => m.id === mezzoId)) return c.nome || 'Cantiere senza nome'
    return ''
  }

  function apriModalApprova() {
    const stati: typeof statiPresenza = {}
    for (const c of programmi[societaAttiva]) for (const l of c.lavorazioni) for (const p of l.persone)
      stati[p.id] = { stato: 'presente', ore: 1, cantiere: c.nome || 'Cantiere senza nome' }
    setStatiPresenza(stati)
    // Tecnici: sezione separata, tutti partono da "presente"
    const statiTec: typeof statiPresenzaTecnici = {}
    for (const d of dipendenti.filter(d => d.tecnico))
      statiTec[d.id] = { stato: 'presente', ore: 1 }
    setStatiPresenzaTecnici(statiTec)
    setConducenti({})
    setModalApprova(true)
  }

  function cambiaStato(dipId: string, stato: 'presente'|'assente'|'parziale') {
    const ore = stato === 'presente' ? 1 : stato === 'parziale' ? 0.5 : 0
    setStatiPresenza(prev => ({ ...prev, [dipId]: { ...prev[dipId], stato, ore } }))
  }

  function mezziDaAbbinare() {
    return programmi[societaAttiva].flatMap(c => c.mezzi.map(m => ({
      mezzoId: m.id, nomeMezzo: m.nome, cantiere: c.nome || 'Cantiere senza nome',
      personeDisponibili: c.lavorazioni.flatMap(l => l.persone.map(p => ({ id: p.id, nome: p.nomeBreve })))
    })))
  }

  async function confermaApprovazione() {
    const soc = societaAttiva
    const mezzi = mezziDaAbbinare()
    const mancanti = mezzi.filter(m => !conducenti[m.mezzoId])
    if (mancanti.length > 0) { alert(`Manca il conducente per: ${mancanti.map(m => m.nomeMezzo).join(', ')}`); return }
    setSalvandoApprovazione(true)

    const ora = new Date().toISOString()
    const approvatore = currentUserEmail || 'sconosciuto'

    // 1) Presenze dipendenti in cantiere
    const righePresenze = Object.entries(statiPresenza).map(([dipId, s]) => ({
      data: dataProgr, dipendente_id: dipId, societa: soc,
      stato: s.stato, ore: s.ore, origine: 'da_programma', cantiere_nome: s.cantiere || null,
      approvato: true, approvato_da: approvatore, approvato_il: ora,
    }))

    // 2) Presenze tecnici (sezione separata)
    const righeTecnici = Object.entries(statiPresenzaTecnici).map(([dipId, s]) => ({
      data: dataProgr, dipendente_id: dipId, societa: soc,
      stato: s.stato, ore: s.ore, origine: 'tecnico', cantiere_nome: null,
      approvato: true, approvato_da: approvatore, approvato_il: ora,
    }))

    // 3) Auto-assenti: dipendenti non tecnici non assegnati a nessun cantiere
    const idGiaTracciati = new Set([...Object.keys(statiPresenza), ...Object.keys(statiPresenzaTecnici)])
    const righeAssenti = dipendenti
      .filter(d => !d.tecnico && !idGiaTracciati.has(d.id))
      .map(d => ({
        data: dataProgr, dipendente_id: d.id, societa: soc,
        stato: 'assente' as const, ore: 0, origine: 'automatico', cantiere_nome: null,
        approvato: true, approvato_da: approvatore, approvato_il: ora,
      }))

    const tutteRighe = [...righePresenze, ...righeTecnici, ...righeAssenti]
    if (tutteRighe.length > 0) {
      const { error: errPresenze } = await supabase.from('presenze').upsert(tutteRighe, { onConflict: 'data,dipendente_id' })
      if (errPresenze) {
        alert(`❌ Errore salvataggio presenze: ${errPresenze.message}\n\nCodice: ${errPresenze.code}`)
        setSalvandoApprovazione(false)
        return
      }
    }

    // 4) Utilizzo mezzi
    if (mezzi.length > 0) {
      const righeMezzi = mezzi.map(m => {
        const dip = dipendenti.find(d => d.id === conducenti[m.mezzoId])
        return { mezzo_id: m.mezzoId, data: dataProgr, conducente_id: conducenti[m.mezzoId], conducente_nome: dip ? `${dip.cognome} ${dip.nome}` : 'Sconosciuto', cantiere_nome: m.cantiere, societa: soc }
      })
      const { error } = await supabase.from('mezzi_utilizzo_giornaliero').upsert(righeMezzi, { onConflict: 'mezzo_id,data' })
      if (error) console.error('Errore utilizzo mezzi:', error)
    }

    // 5) Marca questa società come approvata
    await supabase.from('programma_giornaliero').update({ presenze_approvate: true, approvato_da: approvatore, approvato_il: ora }).eq('societa', soc).eq('data', dataProgr)

    setSalvandoApprovazione(false)
    setModalApprova(false)
    load()
  }

  // ── IMPORTA DA MESSAGGIO WHATSAPP ─────────────────────────────────────────
  async function analizzaMessaggio() {
    if (!testoMessaggio.trim()) { setErroreAI('Incolla prima il messaggio'); return }
    setAnalizzando(true); setErroreAI(''); setAnteprimaAI(null)
    try {
      const dipList = dipendenti.map(d => ({ id: d.id, nome: d.nome, cognome: d.cognome }))
      const cantList = cantieriProgetti.map(c => ({ codice: c.codice, nome: c.nome }))
      const prompt = `Sei un assistente per una ditta edile italiana. Analizza questo messaggio (da WhatsApp) e costruisci il programma giornaliero.

DIPENDENTI (abbina i nomi del messaggio a questi usando cognome o nome parziale):
${JSON.stringify(dipList)}

CANTIERI APERTI (abbina il nome cantiere nel messaggio a questi):
${JSON.stringify(cantList)}

MESSAGGIO:
"""
${testoMessaggio}
"""

Rispondi SOLO con JSON valido, senza markdown:
{"cantieri":[{"nome":"nome cantiere dalla lista","note":"note dal messaggio o stringa vuota","persone":[{"id":"uuid","nome":"Nome","cognome":"Cognome"}]}],"non_abbinati":["nomi non trovati"]}`

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
      })
      const data = await res.json()
      const testo = data.content?.[0]?.text || ''
      const parsed = JSON.parse(testo.replace(/```json|```/g, '').trim())
      setAnteprimaAI(parsed.cantieri || [])
      if (parsed.non_abbinati?.length) setErroreAI(`⚠️ Non abbinati: ${parsed.non_abbinati.join(', ')}`)
    } catch (e: any) {
      setErroreAI('Errore analisi: ' + (e.message || 'riprova'))
    }
    setAnalizzando(false)
  }

  function applicaAI() {
    if (!anteprimaAI) return
    const genId = () => Math.random().toString(36).slice(2)
    const nuoviCantieri = anteprimaAI.map(c => ({
      id: genId(), nome: c.nome, note: c.note || '',
      lavorazioni: [{ id: genId(), nome: '', persone: (c.persone || []).map((p: any) => ({ ...p })) }],
      mezzi: []
    }))
    setProgrammi(prev => ({ ...prev, [societaAttiva]: nuoviCantieri }))
    setModalMessaggio(false); setTestoMessaggio(''); setAnteprimaAI(null); setErroreAI('')
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden" style={{ height: '100vh' }}>

        {aggiornamentoDisponibile && (
          <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center justify-between gap-3 flex-shrink-0 z-10">
            <p className="text-xs text-amber-800 font-medium">⚠️ Il programma è stato modificato da un altro utente.</p>
            <button onClick={load} className="text-xs bg-amber-600 text-white px-3 py-1 rounded-lg font-medium">Ricarica</button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <div><h1 className="text-lg font-semibold">📋 Programma giornaliero</h1></div>
          <div className="flex gap-2 items-center flex-wrap">
            <input type="date" className="input text-sm py-1 flex-1 md:flex-none" value={dataProgr} onChange={e => setDataProgr(e.target.value)} />
            <button className="btn btn-sm" onClick={nuovoProgramma}>🆕 Nuovo</button>
            <button className="btn btn-sm bg-violet-600 text-white border-violet-600 hover:bg-violet-700" onClick={() => setModalMessaggio(true)}>✨ Dal messaggio</button>
            <button className="btn btn-sm btn-primary" onClick={salva} disabled={salvando}>{salvando ? '...' : '💾 Salva'}</button>
            <button className={`btn btn-sm font-semibold ${presenzeApprovate[societaAttiva] ? 'bg-green-600 text-white border-green-600' : 'bg-amber-500 text-white border-amber-500'}`} onClick={apriModalApprova}>
              {presenzeApprovate[societaAttiva] ? '✓ Presenze ok' : '✅ Approva presenze'}
            </button>
            <button className="btn btn-sm hidden md:inline-flex" onClick={() => window.print()}>🖨️</button>
          </div>
        </div>

        <div className="flex gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          {(['BC General Service', 'Filosofia'] as Societa[]).map(soc => {
            const na = giorniNonApprovati[soc].length
            return (
              <button key={soc} onClick={() => setSocietaAttiva(soc)}
                className={`relative flex-1 py-2 rounded-lg border-2 text-sm font-bold transition-all ${soc === 'BC General Service' ? (societaAttiva === soc ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-blue-50 text-blue-700 border-blue-300') : (societaAttiva === soc ? 'bg-orange-500 text-white border-orange-500 shadow' : 'bg-orange-50 text-orange-700 border-orange-300')}`}>
                {soc === 'BC General Service' ? '🏗' : '🏢'} {soc} {presenzeApprovate[soc] ? '✓' : ''}
                {na > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                    {na > 9 ? '9+' : na}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Banner giorni arretrati non approvati */}
        {giorniNonApprovati[societaAttiva].length > 0 && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-3 flex-shrink-0">
            <span className="text-red-600 font-bold text-xs">⚠️ {giorniNonApprovati[societaAttiva].length} {giorniNonApprovati[societaAttiva].length === 1 ? 'giorno' : 'giorni'} non approvati ({societaAttiva}):</span>
            <div className="flex gap-1 flex-wrap">
              {giorniNonApprovati[societaAttiva].slice(0, 8).map(d => (
                <button key={d}
                  className="text-xs bg-red-100 text-red-700 border border-red-300 rounded px-1.5 py-0.5 hover:bg-red-200 font-medium"
                  onClick={() => setDataProgr(d)}>
                  {new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                </button>
              ))}
              {giorniNonApprovati[societaAttiva].length > 8 && (
                <span className="text-xs text-red-500">…+{giorniNonApprovati[societaAttiva].length - 8}</span>
              )}
            </div>
          </div>
        )}

        <div className="flex md:hidden border-b border-gray-200 flex-shrink-0 bg-white">
          {(['pool','cantieri','anteprima'] as const).map(t => (
            <button key={t} onClick={() => setTabMobile(t)} className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tabMobile === t ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500'}`}>
              {t === 'pool' ? '👥 Persone/Mezzi' : t === 'cantieri' ? '🏗 Cantieri' : '📱 Messaggio'}
            </button>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className={`w-full md:w-52 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex-col overflow-hidden ${tabMobile === 'pool' ? 'flex' : 'hidden md:flex'}`}>
            <div className="flex border-b border-gray-200 flex-shrink-0">
              {(['liberi','tutti'] as const).map(v => (
                <button key={v} onClick={() => setVistaPool(v)} className={`flex-1 py-2 text-xs font-medium transition-colors ${vistaPool === v ? 'bg-white text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  {v === 'liberi' ? 'Liberi' : 'Tutti'}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? <p className="text-xs text-gray-400 text-center py-4">Caricamento...</p> : (
                <>
                  {aziendeOrdinate.map(az => (
                    <div key={az}>
                      <div className="px-3 py-1.5 bg-gray-800 sticky top-0 z-10"><p className="text-xs font-medium text-white truncate">{az}</p></div>
                      {dipPerAzienda[az].map((d: any) => {
                        const usato = dipUsati.has(d.id)
                        const dove = vistaPool === 'tutti' && usato ? dovePiazzato(d.id) : ''
                        const altraSoc = dovePiazzatoAltraSocieta(d.id)
                        return (
                          <div key={d.id} className={`px-3 py-2 border-b border-gray-100 transition-colors ${usato ? 'opacity-40' : 'cursor-grab hover:bg-blue-50'} ${altraSoc ? 'bg-yellow-50' : ''}`}>
                            <div className="flex items-center gap-2">
                              {d.foto_url ? <img src={d.foto_url} className="w-7 h-7 rounded-full object-cover flex-shrink-0" /> : <div className="w-7 h-7 rounded-full bg-gray-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-medium">{(d.nome?.charAt(0)||'')+(d.cognome?.charAt(0)||'')}</div>}
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate">{d.nome_programma || d.nome}</p>
                                {d.nome_programma && <p className="text-xs text-gray-400 truncate">{d.cognome} {d.nome}</p>}
                                {dove && <p className="text-xs text-blue-600 truncate">📍 {dove}</p>}
                                {!usato && altraSoc && <p className="text-xs text-amber-700 font-medium truncate">⚠️ Già in {altraSoc.societa === 'Filosofia' ? 'Filosofia' : 'BC'}: {altraSoc.cantiere}</p>}
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
                  {mezziSocieta.length === 0 && <p className="text-xs text-gray-400 text-center py-3 px-2">Nessun mezzo per {societaAttiva}.</p>}
                  {mezziSocieta.map(m => {
                    const usato = mezziUsati.has(m.id)
                    const dove = vistaPool === 'tutti' && usato ? dovePiazzatoMezzo(m.id) : ''
                    if (vistaPool === 'liberi' && usato) return null
                    const isInSelezione = mezzoInSelezione?.id === m.id
                    return (
                      <div key={m.id}>
                        <div
                          className={`px-3 py-2 border-b border-gray-100 transition-colors ${usato ? 'opacity-40' : 'cursor-pointer hover:bg-blue-50'} ${isInSelezione ? 'bg-blue-100 border-blue-300' : ''}`}
                          onClick={() => { if (!usato) setMezzoInSelezione(isInSelezione ? null : { id: m.id, nome: m.nome }) }}>
                          <div className="flex items-center justify-between">
                            <p className={`text-xs font-semibold truncate ${societaAttiva === 'Filosofia' ? 'text-orange-800' : 'text-blue-800'}`}>
                              🚐 {m.nome}
                              {!usato && <span className="ml-1 text-gray-400 font-normal">{isInSelezione ? '▲ scegli cantiere' : '→'}</span>}
                            </p>
                            {m.posti && <span className="text-xs text-gray-400 flex-shrink-0">👥{m.posti}p</span>}
                          </div>
                          {dove && <p className="text-xs text-blue-500 truncate">📍 {dove}</p>}
                        </div>
                        {/* Mini-picker cantiere quando il mezzo è selezionato */}
                        {isInSelezione && cantieri.length > 0 && (
                          <div className="bg-blue-50 border-b border-blue-200 px-2 py-1.5">
                            <p className="text-xs text-blue-600 font-medium mb-1">Aggiungi a:</p>
                            {cantieri.map(c => (
                              <button key={c.id}
                                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-blue-200 text-blue-900 truncate block mb-0.5"
                                onClick={e => { e.stopPropagation(); aggiungiMezzo(c.id, m); setMezzoInSelezione(null) }}>
                                📍 {c.nome || 'Cantiere senza nome'}
                              </button>
                            ))}
                            <button className="text-xs text-gray-400 mt-1" onClick={e => { e.stopPropagation(); setMezzoInSelezione(null) }}>Annulla</button>
                          </div>
                        )}
                        {isInSelezione && cantieri.length === 0 && (
                          <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-xs text-amber-700">
                            Aggiungi prima un cantiere
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          <div className={`flex-1 overflow-y-auto p-3 space-y-3 bg-white ${tabMobile === 'cantieri' ? 'block' : 'hidden md:block'}`}>
            <div className={`text-xs font-semibold px-3 py-1.5 rounded-lg inline-block mb-1 ${societaAttiva === 'Filosofia' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>Stai modificando: {societaAttiva}</div>
            {cantieri.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400"><p className="text-4xl mb-3">🏗</p><p className="text-sm">Nessun cantiere per {societaAttiva}.</p></div>
            ) : cantieri.map(c => (
              <div key={c.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className={`px-3 py-2 flex items-center gap-2 ${societaAttiva === 'Filosofia' ? 'bg-orange-800' : 'bg-gray-800'}`}>
                  <input className="flex-1 bg-transparent text-white text-sm font-semibold placeholder-gray-300 outline-none" placeholder="Nome cantiere..." value={c.nome} onChange={e => aggiornaCantiere(c.id, 'nome', e.target.value)} list={`cantieri-list-${c.id}`} />
                  <datalist id={`cantieri-list-${c.id}`}>
                    {cantieriAperti.map(nome => <option key={nome} value={nome} />)}
                  </datalist>
                  {/* Frecce riordino */}
                  <button onClick={e => { e.stopPropagation(); spostaCantiere(c.id, 'su') }}
                    className="text-gray-300 hover:text-white text-sm px-0.5" title="Sposta su">↑</button>
                  <button onClick={e => { e.stopPropagation(); spostaCantiere(c.id, 'giu') }}
                    className="text-gray-300 hover:text-white text-sm px-0.5" title="Sposta giù">↓</button>
                  <button onClick={() => rimuoviCantiere(c.id)} className="text-gray-300 hover:text-red-300 text-lg">×</button>
                </div>
                <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                  <input className="w-full text-xs bg-transparent outline-none text-gray-600 placeholder-gray-400" placeholder="Note cantiere..." value={c.note} onChange={e => aggiornaCantiere(c.id, 'note', e.target.value)} />
                </div>
                <div className="p-3 space-y-2">
                  {c.lavorazioni.map(lav => (
                    <div key={lav.id} className="bg-gray-50 rounded-lg p-2">
                      <div className="flex items-center gap-2 mb-2">
                        <input className="flex-1 input text-xs py-1" placeholder="Lavorazione..." value={lav.nome} onChange={e => aggiornaLavorazione(c.id, lav.id, e.target.value)} />
                        {c.lavorazioni.length > 1 && <button onClick={() => rimuoviLavorazione(c.id, lav.id)} className="text-gray-300 hover:text-red-500 text-sm">×</button>}
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2 min-h-6">
                        {lav.persone.map(p => (
                          <div key={p.id} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${p.capocantiere ? 'bg-amber-50 border-amber-400 text-amber-800' : 'bg-white border-gray-300 text-gray-700'}`}>
                            {p.capocantiere && <span className="font-bold text-amber-600">"</span>}
                            <span className="font-medium">{p.nomeBreve}</span>
                            <button onClick={() => toggleCapo(c.id, lav.id, p.id)} className="text-gray-300 hover:text-amber-500 ml-0.5">{p.capocantiere ? '★' : '☆'}</button>
                            <button onClick={() => rimuoviPersona(c.id, lav.id, p.id)} className="text-gray-300 hover:text-red-500 ml-0.5">×</button>
                          </div>
                        ))}
                        {lav.persone.length === 0 && <p className="text-xs text-gray-300 italic">Seleziona persone dalla lista</p>}
                      </div>
                      <select className="input text-xs py-1 w-full" value="" onChange={e => { if (!e.target.value) return; const dip = dipendenti.find(d => d.id === e.target.value); if (dip) aggiungiPersona(c.id, lav.id, dip); e.target.value = '' }}>
                        <option value="">+ Aggiungi persona...</option>
                        {aziendeOrdinate.map(az => (
                          <optgroup key={az} label={az}>
                            {dipendenti.filter(d => d.azienda === az && !dipUsati.has(d.id)).map(d => {
                              const altraSoc = dovePiazzatoAltraSocieta(d.id)
                              return <option key={d.id} value={d.id}>{nomeBreve(d)}{d.nome_programma ? ` (${d.cognome} ${d.nome})` : ''}{altraSoc ? ` ⚠️ già in ${altraSoc.societa}` : ''}</option>
                            })}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  ))}
                  <button onClick={() => aggiungiLavorazione(c.id)} className="btn btn-sm text-xs w-full">+ Lavorazione</button>
                  <div className="border-t border-gray-100 pt-2">
                    <div className="flex flex-wrap gap-1 mb-2">
                      {c.mezzi.map(m => { const mc = mezziSocieta.find(x => x.id === m.id); return (
                        <div key={m.id} className="flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 text-blue-800 px-2 py-0.5 rounded-full">
                          <span>🚐 {mc ? labelMezzoUI(mc) : m.nome}</span>
                          <button onClick={() => rimuoviMezzo(c.id, m.id)} className="text-blue-300 hover:text-red-500 ml-0.5">×</button>
                        </div>
                      )})}
                    </div>
                    <select className="input text-xs py-1 w-full" value="" onChange={e => { if (!e.target.value) return; const m = mezziSocieta.find(x => x.id === e.target.value); if (m) aggiungiMezzo(c.id, m); e.target.value = '' }}>
                      <option value="">🚐 Aggiungi mezzo...</option>
                      {mezziSocieta.filter(m => !mezziUsati.has(m.id)).map(m => <option key={m.id} value={m.id}>{labelMezzoUI(m)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={aggiungiCantiere} className="btn btn-primary w-full">+ Cantiere {societaAttiva}</button>
            {cantieri.length > 0 && <button onClick={() => setTabMobile('anteprima')} className="btn w-full md:hidden text-green-700 border-green-300 bg-green-50">📱 Vedi anteprima messaggio</button>}
          </div>

          <div className={`w-full md:w-72 flex-shrink-0 border-l border-gray-200 flex-col overflow-hidden ${tabMobile === 'anteprima' ? 'flex' : 'hidden md:flex'}`}>
            <div className={`flex items-center justify-between px-3 py-2 flex-shrink-0 ${societaAttiva === 'Filosofia' ? 'bg-orange-600' : 'bg-[#128C7E]'}`}>
              <span className="text-white text-xs font-semibold">📱 {societaAttiva}</span>
              <button onClick={copiaMessaggio} className={`text-xs px-2 py-1 rounded font-medium transition-colors ${copiato ? 'bg-green-400 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}>{copiato ? '✓ Copiato!' : '📋 Copia'}</button>
            </div>
            <div className="flex-1 bg-[#ECE5DD] overflow-y-auto p-2">
              <div className="bg-white rounded-lg p-2 shadow-sm">
                <pre className="text-xs whitespace-pre-wrap font-sans text-gray-800 leading-relaxed">{cantieri.length === 0 ? `Aggiungi cantieri per ${societaAttiva}...` : messaggio}</pre>
                <p className="text-right text-gray-400 text-xs mt-1">{new Date(dataProgr).toLocaleDateString('it-IT')} ✓✓</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {modalApprova && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-base font-semibold">✅ Approva presenze {societaAttiva} — {new Date(dataProgr).toLocaleDateString('it-IT')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Solo {societaAttiva}. L'altra società non viene toccata.</p>
              </div>
              <button onClick={() => setModalApprova(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <h3 className="font-medium text-sm mb-2">👷 Presenze ({Object.keys(statiPresenza).length} assegnati)</h3>
                <div className="space-y-1 max-h-72 overflow-y-auto border border-gray-100 rounded-lg p-2">
                  {Object.entries(statiPresenza).map(([dipId, s]) => {
                    const dip = dipendenti.find(d => d.id === dipId)
                    if (!dip) return null
                    return (
                      <div key={dipId} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{dip.cognome} {dip.nome}</p>
                          {s.cantiere && <p className="text-xs text-blue-600 truncate">📍 {s.cantiere}</p>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {(['presente','parziale','assente'] as const).map(opt => (
                            <button key={opt} onClick={() => cambiaStato(dipId, opt)}
                              className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors ${s.stato === opt ? (opt === 'presente' ? 'bg-green-600 text-white border-green-600' : opt === 'parziale' ? 'bg-amber-500 text-white border-amber-500' : 'bg-red-500 text-white border-red-500') : 'bg-white text-gray-400 border-gray-200'}`}>
                              {opt === 'presente' ? '✓ Pres.' : opt === 'parziale' ? '½ Mezza' : '✕ Ass.'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {Object.keys(statiPresenza).length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nessun dipendente assegnato ai cantieri di {societaAttiva} oggi.</p>}
                </div>
              </div>
              {/* Sezione Tecnici */}
              {Object.keys(statiPresenzaTecnici).length > 0 && (
                <div>
                  <h3 className="font-medium text-sm mb-2">🖥️ Tecnici — conferma presenza</h3>
                  <div className="space-y-1 border border-purple-100 rounded-lg p-2 bg-purple-50">
                    {Object.entries(statiPresenzaTecnici).map(([dipId, s]) => {
                      const dip = dipendenti.find(d => d.id === dipId)
                      if (!dip) return null
                      return (
                        <div key={dipId} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-purple-100">
                          <p className="text-sm font-medium truncate">{dip.cognome} {dip.nome}</p>
                          <div className="flex gap-1 flex-shrink-0">
                            {(['presente','parziale','assente'] as const).map(opt => (
                              <button key={opt}
                                onClick={() => {
                                  const ore = opt === 'presente' ? 1 : opt === 'parziale' ? 0.5 : 0
                                  setStatiPresenzaTecnici(prev => ({ ...prev, [dipId]: { stato: opt, ore } }))
                                }}
                                className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors ${s.stato === opt
                                  ? (opt === 'presente' ? 'bg-green-600 text-white border-green-600' : opt === 'parziale' ? 'bg-amber-500 text-white border-amber-500' : 'bg-red-500 text-white border-red-500')
                                  : 'bg-white text-gray-400 border-gray-200'}`}>
                                {opt === 'presente' ? '✓ Pres.' : opt === 'parziale' ? '½ Mezza' : '✕ Ass.'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-medium text-sm mb-2">🚐 Abbinamento mezzi (obbligatorio)</h3>                {mezziDaAbbinare().length === 0 ? <p className="text-sm text-gray-400">Nessun mezzo assegnato oggi.</p> : (
                  <div className="space-y-2">
                    {mezziDaAbbinare().map(m => (
                      <div key={m.mezzoId} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">🚐 {m.nomeMezzo}</p>
                          <p className="text-xs text-gray-500 truncate">📍 {m.cantiere}</p>
                        </div>
                        <select className={`input text-xs py-1 w-48 ${!conducenti[m.mezzoId] ? 'border-amber-400' : 'border-green-400'}`} value={conducenti[m.mezzoId] || ''} onChange={e => setConducenti(prev => ({ ...prev, [m.mezzoId]: e.target.value }))}>
                          <option value="">— scegli conducente —</option>
                          {m.personeDisponibili.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button className="btn" onClick={() => setModalApprova(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={confermaApprovazione} disabled={salvandoApprovazione}>{salvandoApprovazione ? 'Salvataggio...' : '✅ Conferma approvazione'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTA DA MESSAGGIO WHATSAPP */}
      {modalMessaggio && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-semibold">✨ Crea programma dal messaggio</h2>
                <p className="text-xs text-gray-500 mt-0.5">Incolla il messaggio WhatsApp — Claude abbina automaticamente nomi e cantieri</p>
              </div>
              <button onClick={() => { setModalMessaggio(false); setAnteprimaAI(null); setErroreAI('') }} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="label">Messaggio WhatsApp</label>
                <textarea className="input h-36 resize-none font-mono text-sm"
                  placeholder={"Incolla qui il messaggio del gruppo, es:\n\nVilla Chierici: Mario Rossi, Luigi Bianchi\nCondominio Roma: Giuseppe Neri\nVario: Antonio Verde (ritira materiale)"}
                  value={testoMessaggio}
                  onChange={e => { setTestoMessaggio(e.target.value); setAnteprimaAI(null); setErroreAI('') }} />
              </div>
              <button className="btn btn-primary w-full" onClick={analizzaMessaggio} disabled={analizzando || !testoMessaggio.trim()}>
                {analizzando ? '✨ Analisi in corso...' : '✨ Analizza messaggio'}
              </button>
              {erroreAI && (
                <div className={`text-xs px-3 py-2 rounded-lg border ${erroreAI.startsWith('⚠️') ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                  {erroreAI}
                </div>
              )}
              {anteprimaAI && anteprimaAI.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Anteprima — {societaAttiva}</p>
                  <div className="space-y-2">
                    {anteprimaAI.map((c: any, i: number) => (
                      <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-800 text-white px-3 py-2 flex items-center justify-between">
                          <span className="font-semibold text-sm">{c.nome}</span>
                          <span className="text-xs text-gray-400">{(c.persone || []).length} persone</span>
                        </div>
                        {c.note && <div className="px-3 py-1 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">{c.note}</div>}
                        <div className="px-3 py-2 flex flex-wrap gap-1">
                          {(c.persone || []).map((p: any, j: number) => (
                            <span key={j} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                              {p.cognome} {p.nome}
                            </span>
                          ))}
                          {(c.persone || []).length === 0 && <span className="text-xs text-gray-400 italic">Nessuna persona abbinata</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Puoi modificare il programma dopo l'importazione. Sovrascrive il programma {societaAttiva} esistente per la data selezionata.</p>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
              <button className="btn" onClick={() => { setModalMessaggio(false); setAnteprimaAI(null); setErroreAI('') }}>Annulla</button>
              {anteprimaAI && anteprimaAI.length > 0 && (
                <button className="btn btn-primary" onClick={applicaAI}>✅ Crea programma ({anteprimaAI.length} cantieri)</button>
              )}
            </div>
          </div>
        </div>
      )}

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
