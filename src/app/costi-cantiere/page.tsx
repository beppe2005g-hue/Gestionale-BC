'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { logActivity } from '@/lib/logActivity'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const euroShort = (n: number) => (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (d: string) => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : ''

const CATEGORIE = ['Ore Operai', 'Materiali', 'Noli mezzi', 'Manodopera esterna', 'Subappalto', 'Trasporti', 'Attrezzatura', 'Smaltimento', 'Altro', 'Personalizzato']
const CAT_COLORS: Record<string, string> = {
  'Ore Operai': '#0f766e', 'Materiali': '#1d4ed8', 'Noli mezzi': '#7c3aed',
  'Manodopera esterna': '#0891b2', 'Subappalto': '#b45309', 'Trasporti': '#059669',
  'Attrezzatura': '#dc2626', 'Smaltimento': '#9333ea', 'Altro': '#6b7280', 'Personalizzato': '#d97706',
}

interface RigaCosto { id: string; data: string; categoria: string; categoria_personalizzata: string; descrizione: string; quantita: string; prezzo_unitario: string; importo: string; note: string }
function nuovaRiga(data: string): RigaCosto { return { id: Math.random().toString(36).slice(2), data, categoria: 'Ore Operai', categoria_personalizzata: '', descrizione: '', quantita: '', prezzo_unitario: '', importo: '', note: '' } }

interface VoceEsterna { id: string; visibile: boolean; data: string; categoria: string; descrizione: string; quantita: number; quantita_mod: string; prezzo_vendita: string; importo_calcolato: number; libera: boolean }

const statoBadge = (s: string) => {
  if (s === 'Fatturato') return <span className="badge badge-green">Fatturato</span>
  if (s === 'Parziale') return <span className="badge badge-amber">Parziale</span>
  return <span className="badge badge-amber">Da Fatturare</span>
}

// Quale report stampare
type PrintMode = 'interna' | 'esterna' | null

export default function CostiCantiere() {
  const [tab, setTab] = useState<'costi' | 'ddt' | 'sal' | 'fatture'>('costi')
  const [progetti, setProgetti] = useState<any[]>([])
  const [progettoSel, setProgettoSel] = useState('')
  const [costi, setCosti] = useState<any[]>([])
  const [filtroMese, setFiltroMese] = useState('')
  const [modalCosto, setModalCosto] = useState(false)
  const [loadingCosto, setLoadingCosto] = useState(false)
  const [dataBase, setDataBase] = useState(new Date().toISOString().split('T')[0])
  const [righe, setRighe] = useState<RigaCosto[]>([nuovaRiga(new Date().toISOString().split('T')[0])])
  const [ddts, setDdts] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [modalDdt, setModalDdt] = useState(false)
  const [loadingDdt, setLoadingDdt] = useState(false)
  const [formDdt, setFormDdt] = useState({ data: '', numero: '', fornitore_id: '', descrizione: '', importo: '', mese_fattura_previsto: '', note: '' })
  const [modalModificaCosto, setModalModificaCosto] = useState<any>(null)

  // SAL (Stato Avanzamento Lavori)
  const [salList, setSalList] = useState<any[]>([])
  const [modalSal, setModalSal] = useState(false)
  const [loadingSal, setLoadingSal] = useState(false)
  const [formSal, setFormSal] = useState({ data: '', numero_sal: '', importo_lavori: '', descrizione: '', note: '' })
  const [modalModificaSal, setModalModificaSal] = useState<any>(null)

  // Fatture da Emettere
  const [clienti, setClienti] = useState<any[]>([])
  const [fattureDaEmettere, setFattureDaEmettere] = useState<any[]>([])
  const [modalFde, setModalFde] = useState(false)
  const [loadingFde, setLoadingFde] = useState(false)
  const [formFde, setFormFde] = useState<{ cliente_id: string, aliquota_iva: string, scadenza_prevista: string, note: string, righe: { descrizione: string, importo: string }[] }>({
    cliente_id: '', aliquota_iva: '22', scadenza_prevista: '', note: '', righe: [{ descrizione: '', importo: '' }]
  })
  const [modalEmissione, setModalEmissione] = useState<any>(null)
  const [formEmissione, setFormEmissione] = useState({ numero_fattura_emessa: '', importo_emesso: '', scadenza_emessa: '' })
  const [espansaFde, setEspansaFde] = useState<string | null>(null)

  // Contabilità Interna
  const [modalInterna, setModalInterna] = useState(false)
  const [meseInterna, setMeseInterna] = useState('')
  const [ricaviPerCat, setRicaviPerCat] = useState<Record<string, string>>({})
  const [ricaviACorpo, setRicaviACorpo] = useState('')
  const [usaACorpo, setUsaACorpo] = useState(false)

  // Contabilità Esterna
  const [modalEsterna, setModalEsterna] = useState(false)
  const [meseEsterna, setMeseEsterna] = useState('')
  const [vociEsterne, setVociEsterne] = useState<VoceEsterna[]>([])
  const [prezziCliente, setPrezziCliente] = useState<Record<string, string>>({})
  const [loadingEsterna, setLoadingEsterna] = useState(false)
  const [noteEsterna, setNoteEsterna] = useState('')

  // Quale report è aperto per la stampa
  const [printMode, setPrintMode] = useState<PrintMode>(null)

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (progettoSel) { loadCosti(); loadDdt(); loadSal(); loadFatture() } }, [progettoSel])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    let profilo: any = null
    if (user) {
      const { data: p } = await supabase.from('utenti').select('*').eq('id', user.id).single()
      profilo = p
    }
    const soloAssegnati = profilo?.perm_solo_cantieri_assegnati === true
    let queryProgetti = supabase.from('progetti').select('id,codice,nome,geometra_id,geometra_nome,budget_costi,valore_contratto,cliente_id,cliente_nome').eq('stato', 'In Corso').order('codice')
    if (soloAssegnati && user) queryProgetti = queryProgetti.eq('geometra_id', user.id)
    const [{ data: p }, { data: f }, { data: cl }] = await Promise.all([
      queryProgetti,
      supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale'),
      supabase.from('clienti').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale'),
    ])
    setProgetti(p || [])
    setFornitori(f || [])
    setClienti(cl || [])
    if (p && p.length > 0) setProgettoSel(p[0].id)
  }

  async function loadCosti() {
    if (!progettoSel) return
    const { data } = await supabase.from('costi_cantiere').select('*').eq('progetto_id', progettoSel).order('data', { ascending: true })
    setCosti(data || [])
  }

  async function loadDdt() {
    if (!progettoSel) return
    const { data } = await supabase.from('ddt').select('*').eq('progetto_id', progettoSel).order('data', { ascending: false })
    setDdts(data || [])
  }

  async function loadSal() {
    if (!progettoSel) return
    const { data } = await supabase.from('sal_cantiere').select('*').eq('progetto_id', progettoSel).order('data', { ascending: false })
    setSalList(data || [])
  }

  async function loadFatture() {
    if (!progettoSel) return
    const { data } = await supabase.from('fatture_da_emettere').select('*, fatture_da_emettere_righe(*)').eq('progetto_id', progettoSel).order('created_at', { ascending: false })
    setFattureDaEmettere(data || [])
  }

  function aggiornaRiga(id: string, campo: keyof RigaCosto, valore: string) {
    setRighe(prev => prev.map(r => {
      if (r.id !== id) return r
      const n = { ...r, [campo]: valore }
      if (campo === 'quantita' || campo === 'prezzo_unitario') {
        const q = parseFloat(campo === 'quantita' ? valore : r.quantita) || 0
        const p = parseFloat(campo === 'prezzo_unitario' ? valore : r.prezzo_unitario) || 0
        if (q > 0 && p > 0) n.importo = (q * p).toFixed(2)
      }
      return n
    }))
  }

  async function salvaCosti() {
    const righeValide = righe.filter(r => r.importo && parseFloat(r.importo) > 0)
    if (righeValide.length === 0) { alert('Inserisci almeno un costo con importo'); return }
    setLoadingCosto(true)
    const prj = progetti.find(p => p.id === progettoSel)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profilo } = await supabase.from('utenti').select('nome').eq('id', user?.id).single()
    for (const r of righeValide) {
      const categoriaEffettiva = r.categoria === 'Personalizzato' ? (r.categoria_personalizzata || 'Personalizzato') : r.categoria
      const { data: inserted } = await supabase.from('costi_cantiere').insert({
        progetto_id: progettoSel, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
        data: r.data || dataBase, categoria: categoriaEffettiva, descrizione: r.descrizione,
        importo: parseFloat(r.importo) || 0,
        quantita: r.quantita ? parseFloat(r.quantita) : null,
        prezzo_unitario: r.prezzo_unitario ? parseFloat(r.prezzo_unitario) : null,
        inserito_da: user?.id, inserito_da_nome: profilo?.nome || user?.email, note: r.note
      }).select('id').single()
      await logActivity('inserimento', 'costi_cantiere', inserted?.id || '', `${categoriaEffettiva} — ${prj?.codice} ${prj?.nome} · € ${r.importo}`)
    }
    setModalCosto(false); setLoadingCosto(false); loadCosti()
  }

  async function salvaDdt() {
    if (!formDdt.numero || !formDdt.importo || !formDdt.fornitore_id) { alert('Compilare N° DDT, fornitore e importo'); return }
    setLoadingDdt(true)
    const for_ = fornitori.find(f => f.id === formDdt.fornitore_id)
    const prj = progetti.find(p => p.id === progettoSel)
    const { data: inserted, error } = await supabase.from('ddt').insert({
      data: formDdt.data || new Date().toISOString().split('T')[0], numero: formDdt.numero,
      fornitore_id: formDdt.fornitore_id, fornitore_nome: for_?.ragione_sociale || '',
      progetto_id: progettoSel, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: formDdt.descrizione, importo: parseFloat(formDdt.importo) || 0,
      mese_fattura_previsto: formDdt.mese_fattura_previsto, stato: 'Da Fatturare', note: formDdt.note,
    }).select('id').single()
    if (error) alert('Errore: ' + error.message)
    else {
      await logActivity('inserimento', 'ddt', inserted?.id || '', `DDT ${formDdt.numero} — ${for_?.ragione_sociale} · ${prj?.codice} ${prj?.nome} · € ${formDdt.importo}`)
      setModalDdt(false)
      setFormDdt({ data: '', numero: '', fornitore_id: '', descrizione: '', importo: '', mese_fattura_previsto: '', note: '' })
      loadDdt()
    }
    setLoadingDdt(false)
  }

  async function eliminaCosto(id: string) {
    if (!confirm('Eliminare questo costo?')) return
    const costo = costi.find(c => c.id === id)
    const prj = progetti.find(p => p.id === progettoSel)
    await supabase.from('costi_cantiere').delete().eq('id', id)
    await logActivity('eliminazione', 'costi_cantiere', id, `${costo?.categoria} — ${prj?.codice} ${prj?.nome} · € ${costo?.importo}`)
    loadCosti()
  }

  async function salvaModificaCosto() {
    if (!modalModificaCosto) return
    const { error } = await supabase.from('costi_cantiere').update({
      data: modalModificaCosto.data,
      categoria: modalModificaCosto.categoria,
      descrizione: modalModificaCosto.descrizione,
      importo: parseFloat(modalModificaCosto.importo) || 0,
      quantita: modalModificaCosto.quantita ? parseFloat(modalModificaCosto.quantita) : null,
      prezzo_unitario: modalModificaCosto.prezzo_unitario ? parseFloat(modalModificaCosto.prezzo_unitario) : null,
      note: modalModificaCosto.note,
    }).eq('id', modalModificaCosto.id)
    if (error) { alert('Errore: ' + error.message); return }
    await logActivity('modifica', 'costi_cantiere', modalModificaCosto.id, `${modalModificaCosto.categoria} · € ${modalModificaCosto.importo}`)
    setModalModificaCosto(null); loadCosti()
  }

  async function eliminaDdt(id: string) {
    if (!confirm('Eliminare questo DDT?')) return
    const ddt = ddts.find(d => d.id === id)
    await supabase.from('ddt').delete().eq('id', id)
    await logActivity('eliminazione', 'ddt', id, `DDT ${ddt?.numero} — ${ddt?.fornitore_nome} · ${ddt?.progetto_nome} · € ${ddt?.importo}`)
    loadDdt()
  }

  // ── SAL (Stato Avanzamento Lavori) ──
  function apriModalSal() {
    setFormSal({ data: new Date().toISOString().split('T')[0], numero_sal: '', importo_lavori: '', descrizione: '', note: '' })
    setModalSal(true)
  }

  async function salvaSal() {
    if (!formSal.importo_lavori || parseFloat(formSal.importo_lavori) <= 0) { alert('Inserisci un importo lavori valido'); return }
    setLoadingSal(true)
    const prj = progetti.find(p => p.id === progettoSel)
    const { data: inserted, error } = await supabase.from('sal_cantiere').insert({
      progetto_id: progettoSel,
      data: formSal.data || new Date().toISOString().split('T')[0],
      numero_sal: formSal.numero_sal || null,
      importo_lavori: parseFloat(formSal.importo_lavori) || 0,
      descrizione: formSal.descrizione || null,
      note: formSal.note || null,
    }).select('id').single()
    if (error) alert('Errore: ' + error.message)
    else {
      await logActivity('inserimento', 'sal_cantiere', inserted?.id || '', `SAL ${formSal.numero_sal || ''} — ${prj?.codice} ${prj?.nome} · € ${formSal.importo_lavori}`)
      setModalSal(false)
      loadSal()
    }
    setLoadingSal(false)
  }

  async function salvaModificaSal() {
    if (!modalModificaSal) return
    const { error } = await supabase.from('sal_cantiere').update({
      data: modalModificaSal.data,
      numero_sal: modalModificaSal.numero_sal || null,
      importo_lavori: parseFloat(modalModificaSal.importo_lavori) || 0,
      descrizione: modalModificaSal.descrizione || null,
      note: modalModificaSal.note || null,
    }).eq('id', modalModificaSal.id)
    if (error) { alert('Errore: ' + error.message); return }
    await logActivity('modifica', 'sal_cantiere', modalModificaSal.id, `SAL ${modalModificaSal.numero_sal || ''} · € ${modalModificaSal.importo_lavori}`)
    setModalModificaSal(null)
    loadSal()
  }

  async function eliminaSal(id: string) {
    if (!confirm('Eliminare questo SAL?')) return
    const sal = salList.find(s => s.id === id)
    await supabase.from('sal_cantiere').delete().eq('id', id)
    await logActivity('eliminazione', 'sal_cantiere', id, `SAL ${sal?.numero_sal || ''} · € ${sal?.importo_lavori}`)
    loadSal()
  }

  // ── Fatture da Emettere ──
  function apriModalFde() {
    const prj = progetti.find(p => p.id === progettoSel)
    setFormFde({ cliente_id: prj?.cliente_id || '', aliquota_iva: '22', scadenza_prevista: '', note: '', righe: [{ descrizione: '', importo: '' }] })
    setModalFde(true)
  }

  function aggiungiRigaFde() {
    setFormFde(prev => ({ ...prev, righe: [...prev.righe, { descrizione: '', importo: '' }] }))
  }

  function aggiornaRigaFde(idx: number, campo: 'descrizione' | 'importo', valore: string) {
    setFormFde(prev => ({ ...prev, righe: prev.righe.map((r, i) => i === idx ? { ...r, [campo]: valore } : r) }))
  }

  function rimuoviRigaFde(idx: number) {
    setFormFde(prev => ({ ...prev, righe: prev.righe.filter((_, i) => i !== idx) }))
  }

  const totaleImponibileFde = formFde.righe.reduce((s, r) => s + (parseFloat(r.importo) || 0), 0)

  async function salvaFde() {
    const righeValide = formFde.righe.filter(r => r.descrizione && parseFloat(r.importo) > 0)
    if (righeValide.length === 0) { alert('Inserisci almeno una riga con descrizione e importo'); return }
    if (!formFde.cliente_id) { alert('Seleziona il cliente'); return }
    setLoadingFde(true)
    const prj = progetti.find(p => p.id === progettoSel)
    const cli = clienti.find(c => c.id === formFde.cliente_id)
    const { data: inserted, error } = await supabase.from('fatture_da_emettere').insert({
      progetto_id: progettoSel,
      cliente_id: formFde.cliente_id,
      cliente_nome: cli?.ragione_sociale || '',
      aliquota_iva: parseFloat(formFde.aliquota_iva) || 22,
      scadenza_prevista: formFde.scadenza_prevista || null,
      stato: 'Da Emettere',
      note: formFde.note || null,
    }).select('id').single()
    if (error) { alert('Errore: ' + error.message); setLoadingFde(false); return }
    if (inserted?.id) {
      await supabase.from('fatture_da_emettere_righe').insert(
        righeValide.map(r => ({ fattura_da_emettere_id: inserted.id, descrizione: r.descrizione, importo: parseFloat(r.importo) || 0 }))
      )
      await logActivity('inserimento', 'fatture_da_emettere', inserted.id, `Richiesta fattura — ${prj?.codice} ${prj?.nome} · ${cli?.ragione_sociale} · € ${totaleImponibileFde.toFixed(2)}`)
    }
    setModalFde(false)
    loadFatture()
    setLoadingFde(false)
  }

  function apriModalEmissione(f: any) {
    const imponibile = (f.fatture_da_emettere_righe || []).reduce((s: number, r: any) => s + (r.importo || 0), 0)
    setFormEmissione({ numero_fattura_emessa: '', importo_emesso: String(imponibile), scadenza_emessa: f.scadenza_prevista || '' })
    setModalEmissione(f)
  }

  async function confermaEmissione() {
    if (!modalEmissione) return
    if (!formEmissione.numero_fattura_emessa || !formEmissione.importo_emesso) { alert('Inserisci numero fattura e importo'); return }
    const { error } = await supabase.from('fatture_da_emettere').update({
      stato: 'Emessa',
      numero_fattura_emessa: formEmissione.numero_fattura_emessa,
      importo_emesso: parseFloat(formEmissione.importo_emesso) || 0,
      scadenza_emessa: formEmissione.scadenza_emessa || null,
    }).eq('id', modalEmissione.id)
    if (error) { alert('Errore: ' + error.message); return }
    await logActivity('modifica', 'fatture_da_emettere', modalEmissione.id, `Fattura emessa ${formEmissione.numero_fattura_emessa} · € ${formEmissione.importo_emesso}`)
    setModalEmissione(null)
    loadFatture()
  }

  async function riapriFde(id: string) {
    if (!confirm('Riportare questa fattura a "Da Emettere"?')) return
    await supabase.from('fatture_da_emettere').update({
      stato: 'Da Emettere', numero_fattura_emessa: null, importo_emesso: null, scadenza_emessa: null
    }).eq('id', id)
    loadFatture()
  }

  async function eliminaFde(id: string) {
    if (!confirm('Eliminare questa richiesta di fattura?')) return
    await supabase.from('fatture_da_emettere').delete().eq('id', id)
    await logActivity('eliminazione', 'fatture_da_emettere', id, 'Richiesta fattura eliminata')
    loadFatture()
  }

  const progetto = progetti.find(p => p.id === progettoSel)
  const costiFiltrati = useMemo(() => filtroMese ? costi.filter(c => c.data?.startsWith(filtroMese)) : costi, [costi, filtroMese])
  const totalePerCategoria = useMemo(() => {
    const m: Record<string, number> = {}
    costiFiltrati.forEach(c => { m[c.categoria] = (m[c.categoria] || 0) + (c.importo || 0) })
    return m
  }, [costiFiltrati])
  const totale = costiFiltrati.reduce((s, c) => s + (c.importo || 0), 0)
  const totaleTutti = costi.reduce((s, c) => s + (c.importo || 0), 0)
  const budgetPerc = progetto?.budget_costi > 0 ? Math.round(totaleTutti / progetto.budget_costi * 100) : 0
  const mesiDisponibili = useMemo(() => {
    const mesi = new Set(costi.map(c => c.data?.substring(0, 7)).filter(Boolean))
    return Array.from(mesi).sort().reverse()
  }, [costi])
  const totaleDdt = ddts.reduce((s, d) => s + (d.importo || 0), 0)
  const totaleRighe = righe.reduce((s, r) => s + (parseFloat(r.importo) || 0), 0)

  // ── Totali SAL e Fatture da Emettere ──
  const totaleSal = useMemo(() => salList.reduce((s, sal) => s + (sal.importo_lavori || 0), 0), [salList])
  const totaleFatturatoEmesso = useMemo(() =>
    fattureDaEmettere.filter(f => f.stato === 'Emessa').reduce((s, f) => s + (f.importo_emesso || 0), 0)
  , [fattureDaEmettere])
  const totaleFattureDaEmettere = useMemo(() =>
    fattureDaEmettere.filter(f => f.stato === 'Da Emettere').reduce((s, f) => {
      const imp = (f.fatture_da_emettere_righe || []).reduce((ss: number, r: any) => ss + (r.importo || 0), 0)
      return s + imp
    }, 0)
  , [fattureDaEmettere])
  const scostamentoSalFatturato = totaleSal - totaleFatturatoEmesso
  const margineSal = totaleSal - totaleTutti
  const margineSalPerc = totaleSal > 0 ? Math.round(margineSal / totaleSal * 100) : 0

  // ── CONTABILITÀ INTERNA ──
  const datiInterna = useMemo(() => {
    const costiPer = meseInterna ? costi.filter(c => c.data?.startsWith(meseInterna)) : costi

    // Giorni ordinati (per il blocco "dettaglio per giornata")
    const giorniSet = new Set(costiPer.map(c => c.data).filter(Boolean))
    const giorni = Array.from(giorniSet).sort()

    // Voci raggruppate per giorno (per il rendering verticale)
    const vociPerGiorno: Record<string, any[]> = {}
    giorni.forEach(g => { vociPerGiorno[g] = [] })
    costiPer.forEach(c => { if (vociPerGiorno[c.data]) vociPerGiorno[c.data].push(c) })
    const totaliGiorno: Record<string, number> = {}
    giorni.forEach(g => { totaliGiorno[g] = vociPerGiorno[g].reduce((s, c) => s + (c.importo || 0), 0) })

    // Categorie presenti su tutto il periodo filtrato
    const catPresenti = [...new Set(costiPer.map(c => c.categoria))].filter(Boolean)
    const totaliCategoria: Record<string, number> = {}
    catPresenti.forEach(cat => {
      totaliCategoria[cat] = costiPer.filter(c => c.categoria === cat).reduce((s, c) => s + (c.importo || 0), 0)
    })
    const totaleGenerale = catPresenti.reduce((s, cat) => s + totaliCategoria[cat], 0)

    // Raggruppamento per mese → categoria (per il riepilogo mensile, sempre su TUTTI i costi, non solo il filtro)
    const mesiSet = new Set(costi.map(c => c.data?.substring(0, 7)).filter(Boolean))
    const mesiOrdinati = Array.from(mesiSet).sort()
    const riepilogoMensile = mesiOrdinati.map(mese => {
      const costiMese = costi.filter(c => c.data?.startsWith(mese))
      const catMese = [...new Set(costiMese.map(c => c.categoria))].filter(Boolean)
      const perCategoria = catMese.map(cat => ({
        categoria: cat,
        importo: costiMese.filter(c => c.categoria === cat).reduce((s, c) => s + (c.importo || 0), 0)
      })).sort((a, b) => b.importo - a.importo)
      const totaleMese = perCategoria.reduce((s, c) => s + c.importo, 0)
      return { mese, perCategoria, totaleMese }
    })
    const totaleComplessivoTutti = riepilogoMensile.reduce((s, m) => s + m.totaleMese, 0)

    return { giorni, vociPerGiorno, totaliGiorno, catPresenti, totaliCategoria, totaleGenerale, riepilogoMensile, totaleComplessivoTutti }
  }, [costi, meseInterna])

  function apriInterna() {
    setMeseInterna(filtroMese || mesiDisponibili[0] || '')
    setRicaviPerCat({}); setRicaviACorpo(''); setUsaACorpo(false)
    setPrintMode('interna')
    setModalInterna(true)
  }

  const totaleRicaviPerCat = datiInterna.catPresenti.reduce((s, cat) => s + (parseFloat(ricaviPerCat[cat]) || 0), 0)
  const totaleRicaviFinale = usaACorpo ? (parseFloat(ricaviACorpo) || 0) : totaleRicaviPerCat
  const margineInterna = totaleRicaviFinale - datiInterna.totaleGenerale
  const marginePercInterna = totaleRicaviFinale > 0 ? Math.round(margineInterna / totaleRicaviFinale * 100) : 0

  // ── CONTABILITÀ ESTERNA ──
  async function apriEsterna() {
    const m = filtroMese || mesiDisponibili[0] || ''
    setMeseEsterna(m); setNoteEsterna(''); setLoadingEsterna(true)
    const clienteId = progetto?.cliente_id
    let prezziSalvati: Record<string, string> = {}
    if (clienteId) {
      const { data: pv } = await supabase.from('prezzi_vendita_cliente').select('*').eq('cliente_id', clienteId)
      if (pv) pv.forEach((r: any) => { prezziSalvati[r.categoria] = String(r.prezzo_vendita) })
    }
    setPrezziCliente(prezziSalvati)
    const costiPer = m ? costi.filter(c => c.data?.startsWith(m)) : costi
    const voci: VoceEsterna[] = costiPer.map(c => ({
      id: c.id, visibile: true, data: c.data, categoria: c.categoria,
      descrizione: c.descrizione || c.categoria, quantita: c.quantita || 1,
      quantita_mod: String(c.quantita || 1), prezzo_vendita: prezziSalvati[c.categoria] || '',
      importo_calcolato: 0, libera: false,
    }))
    setVociEsterne(voci)
    setLoadingEsterna(false)
    setPrintMode('esterna')
    setModalEsterna(true)
  }

  function aggiornaVoceEsterna(id: string, campo: string, valore: any) {
    setVociEsterne(prev => prev.map(v => v.id === id ? { ...v, [campo]: valore } : v))
  }

  function aggiungiVoceLibera() {
    setVociEsterne(prev => [...prev, {
      id: Math.random().toString(36).slice(2), visibile: true,
      data: new Date().toISOString().split('T')[0], categoria: 'Altro',
      descrizione: '', quantita: 1, quantita_mod: '1', prezzo_vendita: '', importo_calcolato: 0, libera: true
    }])
  }

  async function salvaePrezziEsterna() {
    const clienteId = progetto?.cliente_id
    if (!clienteId) return
    const prezziUsati: Record<string, number> = {}
    vociEsterne.filter(v => v.visibile && v.prezzo_vendita).forEach(v => {
      if (!prezziUsati[v.categoria]) prezziUsati[v.categoria] = parseFloat(v.prezzo_vendita) || 0
    })
    for (const [cat, prezzo] of Object.entries(prezziUsati)) {
      await supabase.from('prezzi_vendita_cliente').upsert({
        cliente_id: clienteId, categoria: cat, prezzo_vendita: prezzo, updated_at: new Date().toISOString()
      }, { onConflict: 'cliente_id,categoria' })
    }
  }

  const vociVisibili = vociEsterne.filter(v => v.visibile)
  const totaleEsterno = vociVisibili.reduce((s, v) => {
    const q = parseFloat(v.quantita_mod) || v.quantita || 1
    const p = parseFloat(v.prezzo_vendita) || 0
    return s + q * p
  }, 0)

  const riepilogoEsterno = useMemo(() => {
    const m: Record<string, number> = {}
    vociVisibili.forEach(v => {
      const q = parseFloat(v.quantita_mod) || v.quantita || 1
      const p = parseFloat(v.prezzo_vendita) || 0
      m[v.categoria] = (m[v.categoria] || 0) + q * p
    })
    return m
  }, [vociEsterne])

  const giorniEsterni = useMemo(() => {
    const s = new Set(vociVisibili.map(v => v.data).filter(Boolean))
    return Array.from(s).sort()
  }, [vociEsterne])

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Costi cantiere giornalieri</h1>
          <div className="flex gap-2">
            {tab === 'costi' && costi.length > 0 && (
              <>
                <button className="btn" onClick={apriInterna}>📊 Contabilità Interna</button>
                <button className="btn" onClick={apriEsterna}>📋 Contabilità Cliente</button>
              </>
            )}
            {tab === 'costi' && <button className="btn btn-primary" onClick={() => { const oggi = new Date().toISOString().split('T')[0]; setDataBase(oggi); setRighe([nuovaRiga(oggi)]); setModalCosto(true) }}>+ Inserisci costi</button>}
            {tab === 'ddt' && <button className="btn btn-primary" onClick={() => setModalDdt(true)}>+ Inserisci DDT</button>}
            {tab === 'sal' && <button className="btn btn-primary" onClick={apriModalSal}>+ Inserisci SAL</button>}
            {tab === 'fatture' && <button className="btn btn-primary" onClick={apriModalFde}>+ Richiedi fattura</button>}
          </div>
        </div>

        <div className="card mb-4">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-52">
              <label className="label">Cantiere</label>
              <select className="input" value={progettoSel} onChange={e => setProgettoSel(e.target.value)}>
                {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} — {p.nome}</option>)}
              </select>
            </div>
            {tab === 'costi' && (
              <div>
                <label className="label">Filtra per mese</label>
                <select className="input w-auto" value={filtroMese} onChange={e => setFiltroMese(e.target.value)}>
                  <option value="">Tutti i mesi</option>
                  {mesiDisponibili.map(m => (
                    <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {progetto && (
          <>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="bg-teal-50 rounded-xl p-4 border border-teal-100">
                <p className="text-xs text-teal-600 mb-1">Ricavi (SAL maturati)</p>
                <p className="text-xl font-semibold text-teal-800">{euro(totaleSal)}</p>
                <p className="text-xs text-teal-500 mt-1">{salList.length} SAL inseriti</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="text-xs text-blue-600 mb-1">Totale costi inseriti</p>
                <p className="text-xl font-semibold text-blue-800">{euro(totaleTutti)}</p>
                {filtroMese && tab === 'costi' && <p className="text-xs text-blue-500 mt-1">Mese: {euro(totale)}</p>}
              </div>
              <div className={`rounded-xl p-4 border ${margineSal >= 0 ? 'bg-purple-50 border-purple-100' : 'bg-red-50 border-red-200'}`}>
                <p className={`text-xs mb-1 ${margineSal >= 0 ? 'text-purple-600' : 'text-red-600'}`}>Margine (su SAL)</p>
                <p className={`text-xl font-semibold ${margineSal >= 0 ? 'text-purple-800' : 'text-red-700'}`}>{euro(margineSal)} {totaleSal > 0 && <span className="text-sm font-normal">({margineSalPerc}%)</span>}</p>
              </div>
              <div className={`rounded-xl p-4 border ${budgetPerc >= 100 ? 'bg-red-50 border-red-200' : budgetPerc >= 80 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <p className={`text-xs mb-1 ${budgetPerc >= 100 ? 'text-red-600' : budgetPerc >= 80 ? 'text-amber-600' : 'text-green-600'}`}>Budget utilizzato</p>
                <p className={`text-xl font-semibold ${budgetPerc >= 100 ? 'text-red-700' : budgetPerc >= 80 ? 'text-amber-700' : 'text-green-700'}`}>{budgetPerc}%</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                <p className="text-xs text-purple-600 mb-1">Totale DDT cantiere</p>
                <p className="text-xl font-semibold text-purple-800">{euro(totaleDdt)}</p>
                <p className="text-xs text-purple-500 mt-1">{ddts.length} DDT inseriti</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <p className="text-xs text-emerald-600 mb-1">Fatturato (emesso)</p>
                <p className="text-xl font-semibold text-emerald-800">{euro(totaleFatturatoEmesso)}</p>
                {totaleFattureDaEmettere > 0 && <p className="text-xs text-emerald-500 mt-1">Da emettere: {euro(totaleFattureDaEmettere)}</p>}
              </div>
              <div className={`rounded-xl p-4 border ${Math.abs(scostamentoSalFatturato) < 0.02 ? 'bg-green-50 border-green-200' : scostamentoSalFatturato > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-xs mb-1 ${scostamentoSalFatturato > 0 ? 'text-amber-600' : 'text-gray-600'}`}>SAL vs Fatturato</p>
                <p className={`text-xl font-semibold ${scostamentoSalFatturato > 0 ? 'text-amber-700' : 'text-gray-700'}`}>
                  {scostamentoSalFatturato > 0 ? `${euro(scostamentoSalFatturato)} da fatturare` : Math.abs(scostamentoSalFatturato) < 0.02 ? 'In pari' : `${euro(Math.abs(scostamentoSalFatturato))} oltre SAL`}
                </p>
                {scostamentoSalFatturato > 0 && <p className="text-xs text-amber-500 mt-1">🟡 Sei a rilento con la fatturazione</p>}
              </div>
            </div>

            <div className="flex gap-1 mb-4 border-b border-gray-200 flex-wrap">
              <button onClick={() => setTab('costi')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'costi' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                💰 Costi giornalieri ({costi.length})
              </button>
              <button onClick={() => setTab('ddt')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'ddt' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                📋 DDT / Bolle ({ddts.length})
              </button>
              <button onClick={() => setTab('sal')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'sal' ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                📈 SAL ({salList.length})
              </button>
              <button onClick={() => setTab('fatture')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'fatture' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                🧾 Fatture da Emettere ({fattureDaEmettere.length})
              </button>
            </div>

            {tab === 'costi' && (
              <>
                {Object.keys(totalePerCategoria).length > 0 && (
                  <div className="card mb-4">
                    <h3 className="text-sm font-medium text-gray-600 mb-3">Ripartizione costi per categoria</h3>
                    <div className="space-y-2">
                      {Object.entries(totalePerCategoria).sort((a, b) => b[1] - a[1]).map(([cat, imp]) => (
                        <div key={cat} className="flex items-center gap-3">
                          <span className="text-xs w-36 flex-shrink-0 text-gray-600">{cat}</span>
                          <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden">
                            <div className="h-full rounded-lg flex items-center px-2" style={{ width: `${Math.max((imp / totale) * 100, 2)}%`, background: CAT_COLORS[cat] || '#6b7280' }}>
                              <span className="text-white text-xs font-medium whitespace-nowrap">{Math.round((imp / totale) * 100)}%</span>
                            </div>
                          </div>
                          <span className="text-sm font-medium text-gray-700 w-24 text-right">{euro(imp)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                      <span className="text-xs font-medium text-gray-500">Totale periodo</span>
                      <span className="text-sm font-semibold text-gray-800">{euro(totale)}</span>
                    </div>
                  </div>
                )}
                <div className="card overflow-x-auto">
                  <h3 className="text-sm font-medium text-gray-600 mb-3">Registro costi ({costiFiltrati.length})</h3>
                  <table className="table-base">
                    <thead><tr><th>Data</th><th>Categoria</th><th>Descrizione</th><th>Qtà</th><th>Pr. Unit.</th><th>Importo</th><th>Inserito da</th><th>Note</th><th></th></tr></thead>
                    <tbody>
                      {costiFiltrati.length === 0 ? (
                        <tr><td colSpan={9} className="text-center text-gray-400 py-8">Nessun costo registrato per questo cantiere.</td></tr>
                      ) : costiFiltrati.map(c => (
                        <tr key={c.id}>
                          <td className="text-xs">{new Date(c.data).toLocaleDateString('it-IT')}</td>
                          <td><span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ background: CAT_COLORS[c.categoria] || '#6b7280' }}>{c.categoria}</span></td>
                          <td className="text-sm">{c.descrizione || '—'}</td>
                          <td className="text-xs text-gray-500">{c.quantita != null ? c.quantita : '—'}</td>
                          <td className="text-xs text-gray-500">{c.prezzo_unitario != null ? euro(c.prezzo_unitario) : '—'}</td>
                          <td className="font-semibold text-sm text-blue-800">{euro(c.importo)}</td>
                          <td className="text-xs text-gray-500">{c.inserito_da_nome || '—'}</td>
                          <td className="text-xs text-gray-400">{c.note || '—'}</td>
                          <td>
                            <div className="flex gap-1">
                              <button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setModalModificaCosto({...c, importo: String(c.importo), quantita: c.quantita != null ? String(c.quantita) : '', prezzo_unitario: c.prezzo_unitario != null ? String(c.prezzo_unitario) : ''})}>✏️</button>
                              <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaCosto(c.id)}>✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tab === 'ddt' && (
              <div className="card overflow-x-auto">
                <h3 className="text-sm font-medium text-gray-600 mb-3">DDT inseriti per questo cantiere ({ddts.length})</h3>
                <table className="table-base">
                  <thead><tr><th>Data</th><th>N° DDT</th><th>Fornitore</th><th>Descrizione</th><th>Importo</th><th>Stato</th><th>Mese prev.</th><th></th></tr></thead>
                  <tbody>
                    {ddts.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-gray-400 py-8">Nessun DDT inserito per questo cantiere.</td></tr>
                    ) : ddts.map(d => (
                      <tr key={d.id}>
                        <td className="text-xs">{d.data ? new Date(d.data).toLocaleDateString('it-IT') : '—'}</td>
                        <td className="font-medium text-sm">{d.numero}</td>
                        <td className="text-sm">{d.fornitore_nome}</td>
                        <td className="text-xs text-gray-600">{d.descrizione || '—'}</td>
                        <td className="font-semibold text-sm text-purple-800">{euro(d.importo)}</td>
                        <td>{statoBadge(d.stato)}</td>
                        <td className="text-xs text-gray-500">{d.mese_fattura_previsto || '—'}</td>
                        <td>{d.stato === 'Da Fatturare' && <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaDdt(d.id)}>✕</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'sal' && (
              <div className="card overflow-x-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-600">SAL inseriti per questo cantiere ({salList.length})</h3>
                  <span className="text-sm font-semibold text-teal-700">Totale: {euro(totaleSal)}</span>
                </div>
                <table className="table-base">
                  <thead><tr><th>Data</th><th>N° SAL</th><th>Descrizione</th><th>Importo lavori</th><th>Note</th><th></th></tr></thead>
                  <tbody>
                    {salList.length === 0 ? (
                      <tr><td colSpan={6} className="text-center text-gray-400 py-8">Nessun SAL inserito per questo cantiere.</td></tr>
                    ) : salList.map(s => (
                      <tr key={s.id}>
                        <td className="text-xs">{s.data ? new Date(s.data).toLocaleDateString('it-IT') : '—'}</td>
                        <td className="font-medium text-sm">{s.numero_sal || '—'}</td>
                        <td className="text-sm text-gray-600">{s.descrizione || '—'}</td>
                        <td className="font-semibold text-sm text-teal-800">{euro(s.importo_lavori)}</td>
                        <td className="text-xs text-gray-400">{s.note || '—'}</td>
                        <td>
                          <div className="flex gap-1">
                            <button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50"
                              onClick={() => setModalModificaSal({ ...s, importo_lavori: String(s.importo_lavori) })}>✏️</button>
                            <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaSal(s.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'fatture' && (
              <div className="card overflow-x-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-600">Fatture da emettere per questo cantiere ({fattureDaEmettere.length})</h3>
                  <div className="flex gap-3 text-sm">
                    <span className="text-amber-700 font-medium">Da emettere: {euro(totaleFattureDaEmettere)}</span>
                    <span className="text-emerald-700 font-medium">Emesso: {euro(totaleFatturatoEmesso)}</span>
                  </div>
                </div>
                {fattureDaEmettere.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">Nessuna richiesta di fattura per questo cantiere.</div>
                ) : (
                  <div className="space-y-2">
                    {fattureDaEmettere.map(f => {
                      const imponibile = (f.fatture_da_emettere_righe || []).reduce((s: number, r: any) => s + (r.importo || 0), 0)
                      const iva = imponibile * (f.aliquota_iva || 22) / 100
                      return (
                        <div key={f.id} className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                            onClick={() => setEspansaFde(espansaFde === f.id ? null : f.id)}>
                            <div className="flex-1">
                              <span className="font-medium text-sm">{f.cliente_nome}</span>
                              {f.stato === 'Emessa' && <span className="text-gray-400 text-xs ml-2">{f.numero_fattura_emessa}</span>}
                            </div>
                            <span className="text-sm font-semibold">{euro(imponibile)}</span>
                            <span className="text-xs text-gray-400">+IVA {f.aliquota_iva}%: {euro(iva)}</span>
                            {f.stato === 'Emessa'
                              ? <span className="badge badge-green">Emessa</span>
                              : <span className="badge badge-amber">Da Emettere</span>}
                            <span className="text-gray-400 text-sm">{espansaFde === f.id ? '▲' : '▼'}</span>
                          </div>
                          {espansaFde === f.id && (
                            <div className="border-t border-gray-100 bg-gray-50 p-4">
                              <table className="table-base mb-3">
                                <thead><tr><th>Descrizione</th><th>Importo</th></tr></thead>
                                <tbody>
                                  {(f.fatture_da_emettere_righe || []).map((r: any) => (
                                    <tr key={r.id}>
                                      <td className="text-sm">{r.descrizione}</td>
                                      <td className="font-medium text-sm">{euro(r.importo)}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-gray-100">
                                    <td className="text-xs font-medium text-right text-gray-600">Imponibile</td>
                                    <td className="font-bold text-sm">{euro(imponibile)}</td>
                                  </tr>
                                </tbody>
                              </table>
                              <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                                <span>Scadenza prevista: {f.scadenza_prevista ? new Date(f.scadenza_prevista).toLocaleDateString('it-IT') : '—'}</span>
                                {f.note && <span>Note: {f.note}</span>}
                              </div>
                              {f.stato === 'Emessa' ? (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                                  <div className="text-sm text-emerald-800">
                                    <strong>Fattura {f.numero_fattura_emessa}</strong> · {euro(f.importo_emesso)} · Scadenza: {f.scadenza_emessa ? new Date(f.scadenza_emessa).toLocaleDateString('it-IT') : '—'}
                                  </div>
                                  <div className="flex gap-2">
                                    <button className="btn btn-sm" onClick={() => riapriFde(f.id)}>↺ Riapri</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex justify-end gap-2">
                                  <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaFde(f.id)}>✕ Elimina</button>
                                  <button className="btn btn-success btn-sm" onClick={() => apriModalEmissione(f)}>✓ Segna come emessa</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ── MODAL COSTI MULTI-RIGA ── */}
      {modalCosto && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Inserisci costi giornalieri</h2>
                <p className="text-xs text-gray-500 mt-0.5">{progetto?.codice} — {progetto?.nome}</p>
              </div>
              <button onClick={() => setModalCosto(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <label className="label mb-0">Data di default:</label>
              <input className="input w-40" type="date" value={dataBase}
                onChange={e => { setDataBase(e.target.value); setRighe(prev => prev.map(r => ({ ...r, data: e.target.value }))) }} />
              <span className="text-xs text-gray-400">(modificabile per ogni riga)</span>
            </div>
            <div className="overflow-x-auto mb-3">
              <table className="table-base" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Data</th><th style={{ width: 160 }}>Categoria</th>
                    <th>Descrizione</th><th style={{ width: 80 }}>Qtà</th><th style={{ width: 90 }}>€/unit</th>
                    <th style={{ width: 100 }}>Importo *</th><th style={{ width: 140 }}>Note</th><th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map(r => (
                    <tr key={r.id}>
                      <td><input className="input text-xs py-1" type="date" value={r.data} onChange={e => aggiornaRiga(r.id, 'data', e.target.value)} /></td>
                      <td>
                        <select className="input text-xs py-1" value={r.categoria} onChange={e => aggiornaRiga(r.id, 'categoria', e.target.value)}>
                          {CATEGORIE.map(c => <option key={c}>{c}</option>)}
                        </select>
                        {r.categoria === 'Personalizzato' && (
                          <input className="input text-xs py-1 mt-1" placeholder="Nome categoria..." value={r.categoria_personalizzata} onChange={e => aggiornaRiga(r.id, 'categoria_personalizzata', e.target.value)} />
                        )}
                      </td>
                      <td><input className="input text-xs py-1" placeholder="es. Operaio, calcestruzzo..." value={r.descrizione} onChange={e => aggiornaRiga(r.id, 'descrizione', e.target.value)} /></td>
                      <td><input className="input text-xs py-1" type="number" step="0.01" value={r.quantita} onChange={e => aggiornaRiga(r.id, 'quantita', e.target.value)} /></td>
                      <td><input className="input text-xs py-1" type="number" step="0.01" value={r.prezzo_unitario} onChange={e => aggiornaRiga(r.id, 'prezzo_unitario', e.target.value)} /></td>
                      <td><input className="input text-xs py-1 font-semibold text-blue-800" type="number" step="0.01" placeholder="0.00" value={r.importo} onChange={e => aggiornaRiga(r.id, 'importo', e.target.value)} /></td>
                      <td><input className="input text-xs py-1" placeholder="Note..." value={r.note} onChange={e => aggiornaRiga(r.id, 'note', e.target.value)} /></td>
                      <td><button className="text-gray-300 hover:text-red-500 text-sm" onClick={() => setRighe(prev => prev.filter(x => x.id !== r.id))} disabled={righe.length === 1}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <button className="btn btn-sm" onClick={() => setRighe(prev => [...prev, nuovaRiga(dataBase)])}>+ Aggiungi riga</button>
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-gray-700">Totale: <span className="text-blue-800">{euro(totaleRighe)}</span></span>
                <button className="btn" onClick={() => setModalCosto(false)}>Annulla</button>
                <button className="btn btn-primary" onClick={salvaCosti} disabled={loadingCosto}>{loadingCosto ? 'Salvataggio...' : `Salva ${righe.filter(r => parseFloat(r.importo) > 0).length} costi`}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DDT ── */}
      {modalDdt && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Inserisci DDT</h2>
                <p className="text-xs text-gray-500 mt-0.5">{progetto?.codice} — {progetto?.nome}</p>
              </div>
              <button onClick={() => setModalDdt(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Data</label><input className="input" type="date" value={formDdt.data} onChange={e => setFormDdt({...formDdt, data: e.target.value})} /></div>
              <div><label className="label">N° DDT *</label><input className="input" placeholder="es. DDT/2026/001" value={formDdt.numero} onChange={e => setFormDdt({...formDdt, numero: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Fornitore *</label>
                <select className="input" value={formDdt.fornitore_id} onChange={e => setFormDdt({...formDdt, fornitore_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {fornitori.map(f => <option key={f.id} value={f.id}>{f.ragione_sociale}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className="label">Descrizione</label><input className="input" value={formDdt.descrizione} onChange={e => setFormDdt({...formDdt, descrizione: e.target.value})} /></div>
              <div><label className="label">Importo (€) *</label><input className="input" type="number" step="0.01" value={formDdt.importo} onChange={e => setFormDdt({...formDdt, importo: e.target.value})} /></div>
              <div><label className="label">Mese fattura previsto</label><input className="input" type="month" value={formDdt.mese_fattura_previsto} onChange={e => setFormDdt({...formDdt, mese_fattura_previsto: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={formDdt.note} onChange={e => setFormDdt({...formDdt, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalDdt(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaDdt} disabled={loadingDdt}>{loadingDdt ? 'Salvataggio...' : 'Salva DDT'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL INSERISCI SAL ── */}
      {modalSal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Inserisci SAL</h2>
                <p className="text-xs text-gray-500 mt-0.5">{progetto?.codice} — {progetto?.nome}</p>
              </div>
              <button onClick={() => setModalSal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Data</label><input className="input" type="date" value={formSal.data} onChange={e => setFormSal({...formSal, data: e.target.value})} /></div>
              <div><label className="label">N° SAL</label><input className="input" placeholder="es. SAL 3" value={formSal.numero_sal} onChange={e => setFormSal({...formSal, numero_sal: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Importo lavori eseguiti (€) *</label>
                <input className="input font-semibold text-teal-800" type="number" step="0.01" placeholder="0.00" value={formSal.importo_lavori} onChange={e => setFormSal({...formSal, importo_lavori: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Descrizione</label><input className="input" placeholder="Lavorazioni svolte..." value={formSal.descrizione} onChange={e => setFormSal({...formSal, descrizione: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={formSal.note} onChange={e => setFormSal({...formSal, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalSal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaSal} disabled={loadingSal}>{loadingSal ? 'Salvataggio...' : 'Salva SAL'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL MODIFICA SAL ── */}
      {modalModificaSal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Modifica SAL</h2>
              <button onClick={() => setModalModificaSal(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Data</label><input className="input" type="date" value={modalModificaSal.data || ''}
                onChange={e => setModalModificaSal({...modalModificaSal, data: e.target.value})} /></div>
              <div><label className="label">N° SAL</label><input className="input" value={modalModificaSal.numero_sal || ''}
                onChange={e => setModalModificaSal({...modalModificaSal, numero_sal: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Importo lavori (€) *</label>
                <input className="input font-semibold text-teal-800" type="number" step="0.01" value={modalModificaSal.importo_lavori || ''}
                  onChange={e => setModalModificaSal({...modalModificaSal, importo_lavori: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Descrizione</label><input className="input" value={modalModificaSal.descrizione || ''}
                onChange={e => setModalModificaSal({...modalModificaSal, descrizione: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={modalModificaSal.note || ''}
                onChange={e => setModalModificaSal({...modalModificaSal, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalModificaSal(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaModificaSal}>Salva modifiche</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RICHIEDI FATTURA (Fatture da Emettere) ── */}
      {modalFde && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Richiedi emissione fattura</h2>
                <p className="text-xs text-gray-500 mt-0.5">{progetto?.codice} — {progetto?.nome}</p>
              </div>
              <button onClick={() => setModalFde(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="col-span-2"><label className="label">Cliente *</label>
                <select className="input" value={formFde.cliente_id} onChange={e => setFormFde({...formFde, cliente_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {clienti.map(c => <option key={c.id} value={c.id}>{c.ragione_sociale}</option>)}
                </select>
              </div>
              <div><label className="label">Aliquota IVA (%)</label>
                <input className="input" type="number" step="0.01" value={formFde.aliquota_iva} onChange={e => setFormFde({...formFde, aliquota_iva: e.target.value})} /></div>
              <div><label className="label">Scadenza prevista</label>
                <input className="input" type="date" value={formFde.scadenza_prevista} onChange={e => setFormFde({...formFde, scadenza_prevista: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Note</label>
                <input className="input" placeholder="Note opzionali" value={formFde.note} onChange={e => setFormFde({...formFde, note: e.target.value})} /></div>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Righe descrizione (si sommano per l'imponibile):</p>
              <div className="space-y-2">
                {formFde.righe.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input className="input flex-1 text-sm" placeholder="es. Lavori di fondazione" value={r.descrizione}
                      onChange={e => aggiornaRigaFde(idx, 'descrizione', e.target.value)} />
                    <input className="input w-32 text-sm text-right" type="number" step="0.01" placeholder="0.00" value={r.importo}
                      onChange={e => aggiornaRigaFde(idx, 'importo', e.target.value)} />
                    <button onClick={() => rimuoviRigaFde(idx)} disabled={formFde.righe.length === 1}
                      className="text-gray-300 hover:text-red-500 text-sm disabled:opacity-30">✕</button>
                  </div>
                ))}
              </div>
              <button className="btn btn-sm mt-2" onClick={aggiungiRigaFde}>+ Aggiungi riga</button>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Imponibile totale</span>
              <span className="text-lg font-bold text-gray-800">{euro(totaleImponibileFde)}</span>
            </div>

            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setModalFde(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaFde} disabled={loadingFde}>{loadingFde ? 'Salvataggio...' : 'Salva richiesta'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONFERMA EMISSIONE FATTURA ── */}
      {modalEmissione && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Segna come emessa</h2>
                <p className="text-xs text-gray-500 mt-0.5">{modalEmissione.cliente_nome}</p>
              </div>
              <button onClick={() => setModalEmissione(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div><label className="label">N° Fattura emessa *</label>
                <input className="input" placeholder="es. FE/2026/012" value={formEmissione.numero_fattura_emessa}
                  onChange={e => setFormEmissione({...formEmissione, numero_fattura_emessa: e.target.value})} /></div>
              <div><label className="label">Importo imponibile (€) *</label>
                <input className="input" type="number" step="0.01" value={formEmissione.importo_emesso}
                  onChange={e => setFormEmissione({...formEmissione, importo_emesso: e.target.value})} /></div>
              <div><label className="label">Scadenza pagamento</label>
                <input className="input" type="date" value={formEmissione.scadenza_emessa}
                  onChange={e => setFormEmissione({...formEmissione, scadenza_emessa: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalEmissione(null)}>Annulla</button>
              <button className="btn btn-success" onClick={confermaEmissione}>Confirma emissione</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONTABILITÀ INTERNA ── */}
      {modalInterna && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-xl w-full max-w-7xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 no-print">
              <div>
                <h2 className="text-base font-semibold">📊 Contabilità Interna</h2>
                <p className="text-xs text-gray-500">{progetto?.codice} — {progetto?.nome}</p>
              </div>
              <div className="flex items-center gap-3">
                <select className="input w-auto text-sm" value={meseInterna} onChange={e => setMeseInterna(e.target.value)}>
                  <option value="">Tutti i mesi</option>
                  {mesiDisponibili.map(m => <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</option>)}
                </select>
                <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Stampa</button>
                <button onClick={() => { setModalInterna(false); setPrintMode(null) }} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6" id="report-interna">
              <div className="report-header flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-800">
                <div className="flex items-center gap-4">
                  <img src="/logo.png" alt="BC General Service" style={{ height: 50, objectFit: 'contain' }} />
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a' }}>BC GENERAL SERVICE</p>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>Società Consortile a R.L.</p>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>Via Duca d'Este 7 — 41036 Medolla (MO)</p>
                  </div>
                </div>
                <div className="text-right">
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>CONTABILITÀ INTERNA</p>
                  <p style={{ fontSize: 11, color: '#6b7280' }}>Cantiere: <strong>{progetto?.codice} — {progetto?.nome}</strong></p>
                  <p style={{ fontSize: 11, color: '#6b7280' }}>Periodo: <strong>{meseInterna ? new Date(meseInterna + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : 'Tutti i mesi'}</strong></p>
                  <p style={{ fontSize: 11, color: '#6b7280' }}>Data: <strong>{new Date().toLocaleDateString('it-IT')}</strong></p>
                </div>
              </div>

              {/* Inserimento ricavi per categoria (solo schermo) */}
              {!usaACorpo && datiInterna.catPresenti.length > 0 && (
                <div className="no-print card mb-4 border-gray-200">
                  <h3 className="text-sm font-medium text-gray-600 mb-3">Ricavi per categoria (periodo selezionato)</h3>
                  <div className="space-y-2">
                    {datiInterna.catPresenti.map(cat => (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="text-xs w-40 flex-shrink-0" style={{ color: CAT_COLORS[cat] || '#374151' }}>{cat}</span>
                        <span className="text-xs text-gray-400 w-28">Costo: {euro(datiInterna.totaliCategoria[cat] || 0)}</span>
                        <input type="number" step="0.01" placeholder="Ricavo €" className="input w-32 text-sm"
                          value={ricaviPerCat[cat] || ''}
                          onChange={e => setRicaviPerCat(prev => ({ ...prev, [cat]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── DETTAGLIO PER GIORNATA (verticale, illimitato) ── */}
              {datiInterna.giorni.length > 0 && (
                <div className="mb-6">
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderLeft: '4px solid #1e3a8a', paddingLeft: 8 }}>DETTAGLIO COSTI PER GIORNATA</p>
                  {datiInterna.giorni.map(giorno => {
                    const vociGiorno = datiInterna.vociPerGiorno[giorno] || []
                    if (vociGiorno.length === 0) return null
                    return (
                      <div key={giorno} className="day-block" style={{ marginBottom: 12 }}>
                        <div style={{ background: '#1e40af', color: 'white', padding: '4px 12px', borderRadius: '4px 4px 0 0', fontSize: 11, fontWeight: 600 }}>
                          {new Date(giorno).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                        </div>
                        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, border: '1px solid #e5e7eb' }}>
                          <thead>
                            <tr style={{ background: '#f8faff' }}>
                              <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>Categoria</th>
                              <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>Descrizione</th>
                              <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151', width: 90 }}>Importo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vociGiorno.map((c: any, idx: number) => (
                              <tr key={c.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8faff' }}>
                                <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', color: CAT_COLORS[c.categoria] || '#374151', fontWeight: 600 }}>{c.categoria}</td>
                                <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9' }}>{c.descrizione || '—'}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: '#1e40af' }}>€ {euroShort(c.importo)}</td>
                              </tr>
                            ))}
                            <tr style={{ background: '#eff6ff' }}>
                              <td colSpan={2} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#1e3a8a' }}>Totale giornata</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(datiInterna.totaliGiorno[giorno])}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── RIEPILOGO PER MESE (categorie + totale mese) ── */}
              {datiInterna.riepilogoMensile.length > 0 && (
                <div className="mb-6">
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderLeft: '4px solid #1e3a8a', paddingLeft: 8 }}>RIEPILOGO PER MESE</p>
                  {datiInterna.riepilogoMensile.map(({ mese, perCategoria, totaleMese }) => (
                    <div key={mese} className="month-block" style={{ marginBottom: 14 }}>
                      <div style={{ background: '#374151', color: 'white', padding: '4px 12px', borderRadius: '4px 4px 0 0', fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                        {new Date(mese + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                      </div>
                      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, border: '1px solid #e5e7eb' }}>
                        <thead>
                          <tr style={{ background: '#f8faff' }}>
                            <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>Categoria</th>
                            <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151', width: 110 }}>Importo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {perCategoria.map((c, idx) => (
                            <tr key={c.categoria} style={{ background: idx % 2 === 0 ? '#fff' : '#f8faff' }}>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: 600, color: CAT_COLORS[c.categoria] || '#374151' }}>{c.categoria}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: '#1e40af' }}>€ {euroShort(c.importo)}</td>
                            </tr>
                          ))}
                          <tr style={{ background: '#eff6ff' }}>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1e3a8a' }}>Totale mese</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(totaleMese)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}

              {/* Ricavi a corpo */}
              <div className="no-print card mb-4 border-green-200 bg-green-50">
                <div className="flex items-center gap-3 mb-2">
                  <input type="checkbox" id="acorpo" checked={usaACorpo} onChange={e => setUsaACorpo(e.target.checked)} className="rounded" />
                  <label htmlFor="acorpo" className="text-sm font-medium text-green-800 cursor-pointer">Ricavi a corpo (inserisci totale senza dettaglio per categoria)</label>
                </div>
                {usaACorpo && (
                  <div className="flex items-center gap-3 mt-2">
                    <label className="text-sm text-green-700">Totale ricavi:</label>
                    <input type="number" step="0.01" placeholder="0.00" className="input w-40"
                      value={ricaviACorpo} onChange={e => setRicaviACorpo(e.target.value)} />
                  </div>
                )}
              </div>

              {/* ── TOTALONI FINALI ── */}
              <div className="totals-block" style={{ marginTop: 24 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderLeft: '4px solid #1e3a8a', paddingLeft: 8 }}>TOTALI COMPLESSIVI</p>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div style={{ border: '2px solid #1e40af', borderRadius: 8, padding: 16, background: '#eff6ff' }}>
                    <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>TOTALE COSTI</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(meseInterna ? datiInterna.totaleGenerale : datiInterna.totaleComplessivoTutti)}</p>
                  </div>
                  <div style={{ border: '2px solid #059669', borderRadius: 8, padding: 16, background: '#f0fdf4' }}>
                    <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>TOTALE RICAVI</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#065f46' }}>{totaleRicaviFinale > 0 ? '€ ' + euroShort(totaleRicaviFinale) : '—'}</p>
                    {usaACorpo && <p style={{ fontSize: 10, color: '#6b7280' }}>A corpo</p>}
                  </div>
                  <div style={{ border: `2px solid ${margineInterna >= 0 ? '#7c3aed' : '#dc2626'}`, borderRadius: 8, padding: 16, background: margineInterna >= 0 ? '#f5f3ff' : '#fef2f2' }}>
                    <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>MARGINE {marginePercInterna > 0 ? `(${marginePercInterna}%)` : ''}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: margineInterna >= 0 ? '#5b21b6' : '#dc2626' }}>
                      {totaleRicaviFinale > 0 ? '€ ' + euroShort(margineInterna) : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Firme */}
              <div className="signatures-block grid grid-cols-2 gap-8 mt-8 pt-4 border-t border-gray-200">
                <div>
                  <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 32 }}>Firma geometra</p>
                  <div style={{ borderBottom: '1px solid #374151', width: 200 }}></div>
                  <p style={{ fontSize: 11, marginTop: 4 }}>{progetto?.geometra_nome || '_______________'}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 32 }}>Firma responsabile</p>
                  <div style={{ borderBottom: '1px solid #374151', width: 200 }}></div>
                  <p style={{ fontSize: 11, marginTop: 4 }}>BC General Service</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONTABILITÀ ESTERNA (CLIENTE) ── */}
      {modalEsterna && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-xl w-full max-w-7xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 no-print">
              <div>
                <h2 className="text-base font-semibold">📋 Contabilità Cliente</h2>
                <p className="text-xs text-gray-500">{progetto?.codice} — {progetto?.nome} | Cliente: <strong>{progetto?.cliente_nome || '—'}</strong></p>
              </div>
              <div className="flex items-center gap-3">
                <select className="input w-auto text-sm" value={meseEsterna} onChange={e => {
                  setMeseEsterna(e.target.value)
                  const costiPer = e.target.value ? costi.filter(c => c.data?.startsWith(e.target.value)) : costi
                  setVociEsterne(costiPer.map(c => ({
                    id: c.id, visibile: true, data: c.data, categoria: c.categoria,
                    descrizione: c.descrizione || c.categoria, quantita: c.quantita || 1,
                    quantita_mod: String(c.quantita || 1),
                    prezzo_vendita: prezziCliente[c.categoria] || '', importo_calcolato: 0, libera: false
                  })))
                }}>
                  <option value="">Tutti i mesi</option>
                  {mesiDisponibili.map(m => <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</option>)}
                </select>
                <button className="btn btn-primary no-print" onClick={async () => { await salvaePrezziEsterna(); window.print() }}>🖨️ Salva prezzi e stampa</button>
                <button onClick={() => { setModalEsterna(false); setPrintMode(null) }} className="text-gray-400 hover:text-gray-600 text-2xl no-print">×</button>
              </div>
            </div>

            {loadingEsterna ? (
              <div className="flex-1 flex items-center justify-center"><div className="text-gray-400">Caricamento...</div></div>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="no-print px-6 py-3 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs font-medium text-gray-600 mb-2">Seleziona le voci da mostrare al cliente e imposta i prezzi di vendita:</p>
                  <div className="overflow-x-auto">
                    <table className="table-base" style={{ minWidth: 800 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}>✓</th><th style={{ width: 90 }}>Data</th>
                          <th style={{ width: 140 }}>Categoria</th><th>Descrizione</th>
                          <th style={{ width: 80 }}>Qtà orig.</th><th style={{ width: 90 }}>Qtà cliente</th>
                          <th style={{ width: 110 }}>Prezzo vendita</th><th style={{ width: 100 }}>Totale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vociEsterne.map(v => {
                          const q = parseFloat(v.quantita_mod) || v.quantita || 1
                          const p = parseFloat(v.prezzo_vendita) || 0
                          const tot = q * p
                          return (
                            <tr key={v.id} className={!v.visibile ? 'opacity-40' : ''}>
                              <td><input type="checkbox" checked={v.visibile} onChange={e => aggiornaVoceEsterna(v.id, 'visibile', e.target.checked)} className="rounded" /></td>
                              <td className="text-xs">{fmt(v.data)}</td>
                              <td><span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: CAT_COLORS[v.categoria] || '#6b7280' }}>{v.categoria}</span></td>
                              <td><input className="input text-xs py-1" value={v.descrizione} onChange={e => aggiornaVoceEsterna(v.id, 'descrizione', e.target.value)} /></td>
                              <td className="text-xs text-gray-400 text-center">{v.libera ? '—' : v.quantita}</td>
                              <td><input className="input text-xs py-1" type="number" step="0.01" value={v.quantita_mod} onChange={e => aggiornaVoceEsterna(v.id, 'quantita_mod', e.target.value)} /></td>
                              <td>
                                <input className="input text-xs py-1" type="number" step="0.01" placeholder="€ vendita"
                                  value={v.prezzo_vendita} onChange={e => aggiornaVoceEsterna(v.id, 'prezzo_vendita', e.target.value)} />
                              </td>
                              <td className="font-semibold text-sm text-right">{p > 0 ? euro(tot) : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <button className="btn btn-sm" onClick={aggiungiVoceLibera}>+ Aggiungi voce libera</button>
                    <span className="text-sm font-semibold text-gray-700">Totale selezionato: <span className="text-blue-800">{euro(totaleEsterno)}</span></span>
                  </div>
                  <div className="mt-2">
                    <label className="label">Note per il cliente</label>
                    <input className="input" placeholder="Note da includere nel documento..." value={noteEsterna} onChange={e => setNoteEsterna(e.target.value)} />
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-6" id="report-esterno">
                  <div className="report-header flex items-start justify-between mb-6 pb-4" style={{ borderBottom: '3px solid #1e3a8a' }}>
                    <div className="flex items-center gap-4">
                      <img src="/logo.png" alt="BC General Service" style={{ height: 55, objectFit: 'contain' }} />
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 800, color: '#1e3a8a', letterSpacing: 1 }}>BC GENERAL SERVICE</p>
                        <p style={{ fontSize: 10, color: '#6b7280' }}>Società Consortile a Responsabilità Limitata</p>
                        <p style={{ fontSize: 10, color: '#6b7280' }}>Via Duca d'Este 7 — 41036 Medolla (MO)</p>
                        <p style={{ fontSize: 10, color: '#6b7280' }}>P.IVA 03943310361</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 8 }}>CONTABILITÀ LAVORI</p>
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px', textAlign: 'left', minWidth: 200 }}>
                        <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>COMMITTENTE</p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{progetto?.cliente_nome || '—'}</p>
                        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 6, marginBottom: 2 }}>CANTIERE</p>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#1e40af' }}>{progetto?.codice} — {progetto?.nome}</p>
                        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 6, marginBottom: 2 }}>PERIODO</p>
                        <p style={{ fontSize: 10, color: '#374151' }}>{meseEsterna ? new Date(meseEsterna + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : 'Tutti i mesi'}</p>
                        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>Data emissione: <strong>{new Date().toLocaleDateString('it-IT')}</strong></p>
                      </div>
                    </div>
                  </div>

                  {giorniEsterni.length > 0 && (
                    <div className="mb-6">
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderLeft: '4px solid #1e3a8a', paddingLeft: 8 }}>DETTAGLIO LAVORAZIONI PER GIORNATA</p>
                      {giorniEsterni.map(giorno => {
                        const vociGiorno = vociVisibili.filter(v => v.data === giorno)
                        if (vociGiorno.length === 0) return null
                        const totGiorno = vociGiorno.reduce((s, v) => s + (parseFloat(v.quantita_mod) || 1) * (parseFloat(v.prezzo_vendita) || 0), 0)
                        return (
                          <div key={giorno} className="day-block" style={{ marginBottom: 12 }}>
                            <div style={{ background: '#1e40af', color: 'white', padding: '4px 12px', borderRadius: '4px 4px 0 0', fontSize: 11, fontWeight: 600 }}>
                              {new Date(giorno).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                            </div>
                            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, border: '1px solid #e5e7eb' }}>
                              <thead>
                                <tr style={{ background: '#f8faff' }}>
                                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>Descrizione</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', color: '#374151', width: 80 }}>Quantità</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151', width: 100 }}>Prezzo unit.</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151', width: 100 }}>Importo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {vociGiorno.map((v, idx) => {
                                  const q = parseFloat(v.quantita_mod) || 1
                                  const p = parseFloat(v.prezzo_vendita) || 0
                                  return (
                                    <tr key={v.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8faff' }}>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9' }}>{v.descrizione}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{q}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{p > 0 ? '€ ' + euroShort(p) : '—'}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: '#1e40af' }}>{p > 0 ? '€ ' + euroShort(q * p) : '—'}</td>
                                    </tr>
                                  )
                                })}
                                <tr style={{ background: '#eff6ff' }}>
                                  <td colSpan={3} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#1e3a8a' }}>Totale giornata</td>
                                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(totGiorno)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ marginBottom: 24 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderLeft: '4px solid #1e3a8a', paddingLeft: 8 }}>RIEPILOGO PER CATEGORIA</p>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: '#1e3a8a', color: 'white' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Categoria</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Importo (€)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>% sul totale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(riepilogoEsterno).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([cat, imp], idx) => (
                          <tr key={cat} style={{ background: idx % 2 === 0 ? '#fff' : '#f8faff' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>{cat}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>€ {euroShort(imp)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', borderBottom: '1px solid #f1f5f9' }}>{totaleEsterno > 0 ? Math.round(imp / totaleEsterno * 100) : 0}%</td>
                          </tr>
                        ))}
                        <tr style={{ background: '#1e3a8a', color: 'white' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 800 }}>TOTALE COMPLESSIVO</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#fbbf24' }}>€ {euroShort(totaleEsterno)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {noteEsterna && (
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 14px', marginBottom: 20, background: '#fffbeb' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>NOTE</p>
                      <p style={{ fontSize: 11, color: '#374151' }}>{noteEsterna}</p>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 40, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
                    <div>
                      <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 28 }}>Per accettazione — Il Committente</p>
                      <div style={{ borderBottom: '1px solid #374151', width: 200 }}></div>
                      <p style={{ fontSize: 10, color: '#374151', marginTop: 4 }}>{progetto?.cliente_nome || '_______________'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 28 }}>Per BC General Service</p>
                      <div style={{ borderBottom: '1px solid #374151', width: 200 }}></div>
                      <p style={{ fontSize: 10, marginTop: 4 }}>{progetto?.geometra_nome || '_______________'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL MODIFICA COSTO ── */}
      {modalModificaCosto && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Modifica costo</h2>
              <button onClick={() => setModalModificaCosto(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Data</label>
                  <input className="input" type="date" value={modalModificaCosto.data || ''}
                    onChange={e => setModalModificaCosto({...modalModificaCosto, data: e.target.value})} />
                </div>
                <div>
                  <label className="label">Categoria</label>
                  <select className="input" value={modalModificaCosto.categoria || ''}
                    onChange={e => setModalModificaCosto({...modalModificaCosto, categoria: e.target.value})}>
                    {CATEGORIE.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Descrizione</label>
                <input className="input" value={modalModificaCosto.descrizione || ''}
                  onChange={e => setModalModificaCosto({...modalModificaCosto, descrizione: e.target.value})} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Quantità</label>
                  <input className="input" type="number" step="0.01" value={modalModificaCosto.quantita || ''}
                    onChange={e => {
                      const q = e.target.value
                      const p = modalModificaCosto.prezzo_unitario
                      const tot = q && p ? (parseFloat(q) * parseFloat(p)).toFixed(2) : modalModificaCosto.importo
                      setModalModificaCosto({...modalModificaCosto, quantita: q, importo: tot})
                    }} />
                </div>
                <div>
                  <label className="label">Prezzo unit. (€)</label>
                  <input className="input" type="number" step="0.01" value={modalModificaCosto.prezzo_unitario || ''}
                    onChange={e => {
                      const p = e.target.value
                      const q = modalModificaCosto.quantita
                      const tot = q && p ? (parseFloat(q) * parseFloat(p)).toFixed(2) : modalModificaCosto.importo
                      setModalModificaCosto({...modalModificaCosto, prezzo_unitario: p, importo: tot})
                    }} />
                </div>
                <div>
                  <label className="label">Importo (€) *</label>
                  <input className="input font-semibold text-blue-800" type="number" step="0.01" value={modalModificaCosto.importo || ''}
                    onChange={e => setModalModificaCosto({...modalModificaCosto, importo: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="label">Note</label>
                <input className="input" value={modalModificaCosto.note || ''}
                  onChange={e => setModalModificaCosto({...modalModificaCosto, note: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalModificaCosto(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaModificaCosto}>Salva modifiche</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }

          body * { visibility: hidden !important; }

          /* Stampa solo il report attivo */
          ${printMode === 'interna' ? `
            #report-interna,
            #report-interna * { visibility: visible !important; }
            #report-interna {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              padding: 0 !important;
              font-size: 10px !important;
              overflow: visible !important;
            }
          ` : ''}

          ${printMode === 'esterna' ? `
            #report-esterno,
            #report-esterno * { visibility: visible !important; }
            #report-esterno {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              padding: 0 !important;
              font-size: 10px !important;
              overflow: visible !important;
            }
          ` : ''}

          /* L'header azienda compare una sola volta, in cima, senza ripetersi a metà pagina */
          .report-header {
            break-inside: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
          }

          /* Ogni blocco giorno/mese non si spezza a metà tra due pagine */
          .day-block, .month-block, .totals-block, .signatures-block {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .no-print { display: none !important; }
          .only-print { display: inline !important; }
        }
        .only-print { display: none; }
      `}</style>
    </div>
  )
}
