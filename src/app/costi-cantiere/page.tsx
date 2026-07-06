'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { logActivity } from '@/lib/logActivity'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const euroShort = (n: number) => (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (d: string) => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : ''
type Societa = 'BC General Service' | 'Filosofia'

const CATEGORIE = ['Ore Operai', 'Materiali', 'Noli mezzi', 'Manodopera esterna', 'Subappalto', 'Trasporti', 'Attrezzatura', 'Smaltimento', 'Altro', 'Personalizzato']
const MACRO_CATEGORIE_DDT = ['Cementi','Laterizi','Ferro e Acciaio','Legno','Isolanti','Impermeabilizzanti','Inerti e Calcestruzzo','Impianti','Attrezzatura','Noli','Trasporti','Altro']
const CAT_COLORS: Record<string, string> = {
  'Ore Operai': '#0f766e', 'Materiali': '#1d4ed8', 'Noli mezzi': '#7c3aed',
  'Manodopera esterna': '#0891b2', 'Subappalto': '#b45309', 'Trasporti': '#059669',
  'Attrezzatura': '#dc2626', 'Smaltimento': '#9333ea', 'Altro': '#6b7280', 'Personalizzato': '#d97706',
}
const MAPPA_CATEGORIA_DDT: Record<string, string> = {
  'Cementi': 'Materiali', 'Laterizi': 'Materiali', 'Ferro e Acciaio': 'Materiali',
  'Legno': 'Materiali', 'Isolanti': 'Materiali', 'Impermeabilizzanti': 'Materiali',
  'Inerti e Calcestruzzo': 'Materiali', 'Impianti': 'Attrezzatura',
  'Attrezzatura': 'Attrezzatura', 'Noli': 'Noli mezzi', 'Trasporti': 'Trasporti', 'Altro': 'Altro',
}
function mappaCategoriaDdt(macroCategoria: string): string {
  return MAPPA_CATEGORIA_DDT[macroCategoria] || 'Materiali'
}

interface RigaCosto { id: string; data: string; categoria: string; categoria_personalizzata: string; descrizione: string; quantita: string; prezzo_unitario: string; importo: string; note: string }
function nuovaRiga(data: string): RigaCosto { return { id: Math.random().toString(36).slice(2), data, categoria: 'Ore Operai', categoria_personalizzata: '', descrizione: '', quantita: '', prezzo_unitario: '', importo: '', note: '' } }
interface VoceEsterna { id: string; visibile: boolean; data: string; categoria: string; descrizione: string; quantita: number; quantita_mod: string; prezzo_vendita: string; importo_calcolato: number; libera: boolean }

const statoBadge = (s: string) => {
  if (s === 'Fatturato') return <span className="badge badge-green">Fatturato</span>
  if (s === 'Parziale') return <span className="badge badge-amber">Parziale</span>
  return <span className="badge badge-amber">Da Fatturare</span>
}
type PrintMode = 'interna' | 'esterna' | null

export default function CostiCantiere() {
  const [tab, setTab] = useState<'costi' | 'ddt' | 'sal'>('costi')
  const [progetti, setProgetti] = useState<any[]>([])
  const [progettoSel, setProgettoSel] = useState('')
  const [societaFiltroCC, setSocietaFiltroCC] = useState<Societa>('BC General Service')
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
  const [modalDettaglioDdt, setModalDettaglioDdt] = useState<any>(null)
  const [vociDettaglioDdt, setVociDettaglioDdt] = useState<any[]>([])
  const [editandoDdt, setEditandoDdt] = useState(false)
  const [formEditDdt, setFormEditDdt] = useState({ data: '', numero: '', fornitore_id: '', descrizione: '', note: '', mese_fattura_previsto: '' })
  const [loadingEditDdt, setLoadingEditDdt] = useState(false)
  const [salList, setSalList] = useState<any[]>([])
  const [modalSal, setModalSal] = useState(false)
  const [loadingSal, setLoadingSal] = useState(false)
  const [formSal, setFormSal] = useState({ data: '', numero_sal: '', importo_lavori: '', descrizione: '', note: '' })
  const [modalModificaSal, setModalModificaSal] = useState<any>(null)
  const [fattureDaEmettere, setFattureDaEmettere] = useState<any[]>([])
  const [modalInterna, setModalInterna] = useState(false)
  const [meseInterna, setMeseInterna] = useState('')
  const [ricaviPerCat, setRicaviPerCat] = useState<Record<string, string>>({})
  const [ricaviACorpo, setRicaviACorpo] = useState('')
  const [usaACorpo, setUsaACorpo] = useState(false)
  const [modalEsterna, setModalEsterna] = useState(false)
  const [meseEsterna, setMeseEsterna] = useState('')
  const [vociEsterne, setVociEsterne] = useState<VoceEsterna[]>([])
  const [prezziCliente, setPrezziCliente] = useState<Record<string, string>>({})
  const [loadingEsterna, setLoadingEsterna] = useState(false)
  const [noteEsterna, setNoteEsterna] = useState('')
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
    let queryProgetti = supabase.from('progetti').select('id,codice,nome,geometra_id,geometra_nome,budget_costi,valore_contratto,cliente_id,cliente_nome,societa').eq('stato', 'In Corso').order('codice')
    if (soloAssegnati && user) queryProgetti = queryProgetti.eq('geometra_id', user.id)
    const [{ data: p }, { data: f }] = await Promise.all([
      queryProgetti,
      supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale'),
    ])
    setProgetti(p || [])
    setFornitori(f || [])
    const primoSoc = (p || []).find((x: any) => (x.societa || 'BC General Service') === 'BC General Service')
    if (primoSoc) setProgettoSel(primoSoc.id)
    else if (p && p.length > 0) setProgettoSel(p[0].id)
  }

  async function loadCosti() {
    if (!progettoSel) return
    const { data } = await supabase.from('costi_cantiere').select('*').eq('progetto_id', progettoSel).order('data', { ascending: true })
    setCosti(data || [])
  }
  async function loadDdt() {
    if (!progettoSel) return
    const { data } = await supabase.from('ddt').select('*, ddt_voci(*)').eq('progetto_id', progettoSel).order('data', { ascending: false })
    setDdts(data || [])
  }
  async function apriDettaglioDdt(d: any) {
    setModalDettaglioDdt(d); setVociDettaglioDdt(d.ddt_voci || []); setEditandoDdt(false)
  }
  function entraEditDdt() {
    setFormEditDdt({ data: modalDettaglioDdt.data || '', numero: modalDettaglioDdt.numero || '', fornitore_id: modalDettaglioDdt.fornitore_id || '', descrizione: modalDettaglioDdt.descrizione || '', note: modalDettaglioDdt.note || '', mese_fattura_previsto: modalDettaglioDdt.mese_fattura_previsto || '' })
    setVociDettaglioDdt((modalDettaglioDdt.ddt_voci || []).map((v: any) => ({ ...v })))
    setEditandoDdt(true)
  }
  function aggiornaVoceDdtEdit(idx: number, campo: string, valore: any) {
    setVociDettaglioDdt(prev => {
      const n = [...prev]; n[idx] = { ...n[idx], [campo]: valore }
      if (campo === 'quantita' || campo === 'prezzo_unitario') {
        const q = campo === 'quantita' ? parseFloat(valore) || 0 : n[idx].quantita
        const p = campo === 'prezzo_unitario' ? parseFloat(valore) || 0 : n[idx].prezzo_unitario
        n[idx].importo_totale = Math.round(q * p * 100) / 100
      }
      return n
    })
  }
  function aggiungiVoceDdtEdit() { setVociDettaglioDdt(prev => [...prev, { descrizione: '', macro_categoria: 'Altro', categoria: '', unita_misura: '', quantita: 0, prezzo_unitario: 0, importo_totale: 0 }]) }
  function rimuoviVoceDdtEdit(idx: number) { setVociDettaglioDdt(prev => prev.filter((_, i) => i !== idx)) }
  async function salvaEditDdt() {
    if (!modalDettaglioDdt) return
    if (!formEditDdt.numero || !formEditDdt.fornitore_id) { alert('Compilare N° DDT e fornitore'); return }
    setLoadingEditDdt(true)
    const for_ = fornitori.find(f => f.id === formEditDdt.fornitore_id)
    const vociValide = vociDettaglioDdt.filter(v => v.descrizione)
    const importoTotale = vociValide.reduce((s, v) => s + (v.importo_totale || 0), 0)
    const { error } = await supabase.from('ddt').update({ data: formEditDdt.data, numero: formEditDdt.numero, fornitore_id: formEditDdt.fornitore_id, fornitore_nome: for_?.ragione_sociale || '', descrizione: formEditDdt.descrizione || `DDT con ${vociValide.length} voci`, importo: importoTotale, mese_fattura_previsto: formEditDdt.mese_fattura_previsto, note: formEditDdt.note }).eq('id', modalDettaglioDdt.id)
    if (error) { alert('Errore: ' + error.message); setLoadingEditDdt(false); return }
    await supabase.from('ddt_voci').delete().eq('ddt_id', modalDettaglioDdt.id)
    for (const v of vociValide) {
      await supabase.from('ddt_voci').insert({ ddt_id: modalDettaglioDdt.id, descrizione: v.descrizione, categoria: v.categoria, macro_categoria: v.macro_categoria, unita_misura: v.unita_misura, quantita: v.quantita, prezzo_unitario: v.prezzo_unitario, importo_totale: v.importo_totale, fornitore_id: formEditDdt.fornitore_id, fornitore_nome: for_?.ragione_sociale || '', data_ddt: formEditDdt.data })
    }
    await logActivity('modifica', 'ddt', modalDettaglioDdt.id, `DDT ${formEditDdt.numero} — ${for_?.ragione_sociale} · € ${importoTotale} (da Costi Cantiere)`)
    setEditandoDdt(false); setModalDettaglioDdt(null); setVociDettaglioDdt([]); setLoadingEditDdt(false); loadDdt()
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
      const { data: inserted } = await supabase.from('costi_cantiere').insert({ progetto_id: progettoSel, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '', data: r.data || dataBase, categoria: categoriaEffettiva, descrizione: r.descrizione, importo: parseFloat(r.importo) || 0, quantita: r.quantita ? parseFloat(r.quantita) : null, prezzo_unitario: r.prezzo_unitario ? parseFloat(r.prezzo_unitario) : null, inserito_da: user?.id, inserito_da_nome: profilo?.nome || user?.email, note: r.note }).select('id').single()
      await logActivity('inserimento', 'costi_cantiere', inserted?.id || '', `${categoriaEffettiva} — ${prj?.codice} ${prj?.nome} · € ${r.importo}`)
    }
    setModalCosto(false); setLoadingCosto(false); loadCosti()
  }
  async function salvaDdt() {
    if (!formDdt.numero || !formDdt.importo || !formDdt.fornitore_id) { alert('Compilare N° DDT, fornitore e importo'); return }
    setLoadingDdt(true)
    const for_ = fornitori.find(f => f.id === formDdt.fornitore_id)
    const prj = progetti.find(p => p.id === progettoSel)
    const { data: inserted, error } = await supabase.from('ddt').insert({ data: formDdt.data || new Date().toISOString().split('T')[0], numero: formDdt.numero, fornitore_id: formDdt.fornitore_id, fornitore_nome: for_?.ragione_sociale || '', progetto_id: progettoSel, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '', descrizione: formDdt.descrizione, importo: parseFloat(formDdt.importo) || 0, mese_fattura_previsto: formDdt.mese_fattura_previsto, stato: 'Da Fatturare', note: formDdt.note }).select('id').single()
    if (error) alert('Errore: ' + error.message)
    else { await logActivity('inserimento', 'ddt', inserted?.id || '', `DDT ${formDdt.numero} — ${for_?.ragione_sociale} · ${prj?.codice} ${prj?.nome} · € ${formDdt.importo}`); setModalDdt(false); setFormDdt({ data: '', numero: '', fornitore_id: '', descrizione: '', importo: '', mese_fattura_previsto: '', note: '' }); loadDdt() }
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
    const { error } = await supabase.from('costi_cantiere').update({ data: modalModificaCosto.data, categoria: modalModificaCosto.categoria, descrizione: modalModificaCosto.descrizione, importo: parseFloat(modalModificaCosto.importo) || 0, quantita: modalModificaCosto.quantita ? parseFloat(modalModificaCosto.quantita) : null, prezzo_unitario: modalModificaCosto.prezzo_unitario ? parseFloat(modalModificaCosto.prezzo_unitario) : null, note: modalModificaCosto.note }).eq('id', modalModificaCosto.id)
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
  function apriModalSal() { setFormSal({ data: new Date().toISOString().split('T')[0], numero_sal: '', importo_lavori: '', descrizione: '', note: '' }); setModalSal(true) }
  async function salvaSal() {
    if (!formSal.importo_lavori || parseFloat(formSal.importo_lavori) <= 0) { alert('Inserisci un importo lavori valido'); return }
    setLoadingSal(true)
    const prj = progetti.find(p => p.id === progettoSel)
    const { data: inserted, error } = await supabase.from('sal_cantiere').insert({ progetto_id: progettoSel, data: formSal.data || new Date().toISOString().split('T')[0], numero_sal: formSal.numero_sal || null, importo_lavori: parseFloat(formSal.importo_lavori) || 0, descrizione: formSal.descrizione || null, note: formSal.note || null }).select('id').single()
    if (error) alert('Errore: ' + error.message)
    else { await logActivity('inserimento', 'sal_cantiere', inserted?.id || '', `SAL ${formSal.numero_sal || ''} — ${prj?.codice} ${prj?.nome} · € ${formSal.importo_lavori}`); setModalSal(false); loadSal() }
    setLoadingSal(false)
  }
  async function salvaModificaSal() {
    if (!modalModificaSal) return
    const { error } = await supabase.from('sal_cantiere').update({ data: modalModificaSal.data, numero_sal: modalModificaSal.numero_sal || null, importo_lavori: parseFloat(modalModificaSal.importo_lavori) || 0, descrizione: modalModificaSal.descrizione || null, note: modalModificaSal.note || null }).eq('id', modalModificaSal.id)
    if (error) { alert('Errore: ' + error.message); return }
    await logActivity('modifica', 'sal_cantiere', modalModificaSal.id, `SAL ${modalModificaSal.numero_sal || ''} · € ${modalModificaSal.importo_lavori}`)
    setModalModificaSal(null); loadSal()
  }
  async function eliminaSal(id: string) {
    if (!confirm('Eliminare questo SAL?')) return
    const sal = salList.find(s => s.id === id)
    await supabase.from('sal_cantiere').delete().eq('id', id)
    await logActivity('eliminazione', 'sal_cantiere', id, `SAL ${sal?.numero_sal || ''} · € ${sal?.importo_lavori}`)
    loadSal()
  }
  const progetto = progetti.find(p => p.id === progettoSel)
  function voceDdtIncompleta(v: any): boolean { return (!v.importo_totale || v.importo_totale === 0) || (!v.prezzo_unitario || v.prezzo_unitario === 0) }
  function ddtHaVociIncomplete(d: any): boolean { const voci = d.ddt_voci || []; if (voci.length === 0) return !d.importo || d.importo === 0; return voci.some((v: any) => voceDdtIncompleta(v)) }
  const righeDdtEspanse = useMemo(() => {
    const righe: any[] = []
    ddts.forEach(d => {
      const voci = d.ddt_voci || []
      if (voci.length === 0) { righe.push({ id: `ddt-${d.id}`, tipo: 'ddt', ddtId: d.id, ddtRiferimento: d, data: d.data, categoria: 'Altro', descrizione: d.descrizione || `DDT ${d.numero}`, quantita: null, prezzo_unitario: null, importo: d.importo || 0, inserito_da_nome: d.fornitore_nome, note: d.note, incompleta: !d.importo || d.importo === 0 }) }
      else { voci.forEach((v: any) => { righe.push({ id: `ddt-voce-${v.id}`, tipo: 'ddt', ddtId: d.id, ddtRiferimento: d, data: d.data, categoria: mappaCategoriaDdt(v.macro_categoria), descrizione: v.descrizione || d.numero, quantita: v.quantita, prezzo_unitario: v.prezzo_unitario, importo: v.importo_totale || 0, inserito_da_nome: d.fornitore_nome, note: null, incompleta: voceDdtIncompleta(v) }) }) }
    })
    return righe
  }, [ddts])
  const registroUnificato = useMemo(() => { const righeManuali = costi.map(c => ({ ...c, tipo: 'manuale' })); return [...righeManuali, ...righeDdtEspanse].sort((a, b) => (b.data || '').localeCompare(a.data || '')) }, [costi, righeDdtEspanse])
  const costiFiltrati = useMemo(() => filtroMese ? registroUnificato.filter(c => c.data?.startsWith(filtroMese)) : registroUnificato, [registroUnificato, filtroMese])
  const totalePerCategoria = useMemo(() => { const m: Record<string, number> = {}; costiFiltrati.forEach(c => { m[c.categoria] = (m[c.categoria] || 0) + (c.importo || 0) }); return m }, [costiFiltrati])
  const totale = costiFiltrati.reduce((s, c) => s + (c.importo || 0), 0)
  const totaleTutti = registroUnificato.reduce((s, c) => s + (c.importo || 0), 0)
  const budgetPerc = progetto?.budget_costi > 0 ? Math.round(totaleTutti / progetto.budget_costi * 100) : 0
  const mesiDisponibili = useMemo(() => { const mesi = new Set(registroUnificato.map(c => c.data?.substring(0, 7)).filter(Boolean)); return Array.from(mesi).sort().reverse() }, [registroUnificato])
  const totaleDdt = ddts.reduce((s, d) => s + (d.importo || 0), 0)
  const totaleRighe = righe.reduce((s, r) => s + (parseFloat(r.importo) || 0), 0)
  const totaleSal = useMemo(() => salList.reduce((s, sal) => s + (sal.importo_lavori || 0), 0), [salList])
  const totaleFatturatoEmesso = useMemo(() => fattureDaEmettere.filter(f => f.stato === 'Emessa').reduce((s, f) => s + (f.importo_emesso || 0), 0), [fattureDaEmettere])
  const totaleFattureDaEmettere = useMemo(() => fattureDaEmettere.filter(f => f.stato === 'Da Emettere').reduce((s, f) => { const imp = (f.fatture_da_emettere_righe || []).reduce((ss: number, r: any) => ss + (r.importo || 0), 0); return s + imp }, 0), [fattureDaEmettere])
  const scostamentoSalFatturato = totaleSal - totaleFatturatoEmesso
  const margineSal = totaleSal - totaleTutti
  const margineSalPerc = totaleSal > 0 ? Math.round(margineSal / totaleSal * 100) : 0
  const progettiSocieta = progetti.filter(p => (p.societa || 'BC General Service') === societaFiltroCC)

  const datiInterna = useMemo(() => {
    const costiPer = meseInterna ? registroUnificato.filter(c => c.data?.startsWith(meseInterna)) : registroUnificato
    const giorniSet = new Set(costiPer.map(c => c.data).filter(Boolean))
    const giorni = Array.from(giorniSet).sort()
    const vociPerGiorno: Record<string, any[]> = {}
    giorni.forEach(g => { vociPerGiorno[g] = [] })
    costiPer.forEach(c => { if (vociPerGiorno[c.data]) vociPerGiorno[c.data].push(c) })
    const totaliGiorno: Record<string, number> = {}
    giorni.forEach(g => { totaliGiorno[g] = vociPerGiorno[g].reduce((s, c) => s + (c.importo || 0), 0) })
    const catPresenti = [...new Set(costiPer.map(c => c.categoria))].filter(Boolean)
    const totaliCategoria: Record<string, number> = {}
    catPresenti.forEach(cat => { totaliCategoria[cat] = costiPer.filter(c => c.categoria === cat).reduce((s, c) => s + (c.importo || 0), 0) })
    const totaleGenerale = catPresenti.reduce((s, cat) => s + totaliCategoria[cat], 0)
    const mesiSet = new Set(registroUnificato.map(c => c.data?.substring(0, 7)).filter(Boolean))
    const mesiOrdinati = Array.from(mesiSet).sort()
    const riepilogoMensile = mesiOrdinati.map(mese => {
      const costiMese = registroUnificato.filter(c => c.data?.startsWith(mese))
      const catMese = [...new Set(costiMese.map(c => c.categoria))].filter(Boolean)
      const perCategoria = catMese.map(cat => ({ categoria: cat, importo: costiMese.filter(c => c.categoria === cat).reduce((s, c) => s + (c.importo || 0), 0) })).sort((a, b) => b.importo - a.importo)
      const totaleMese = perCategoria.reduce((s, c) => s + c.importo, 0)
      return { mese, perCategoria, totaleMese }
    })
    const totaleComplessivoTutti = riepilogoMensile.reduce((s, m) => s + m.totaleMese, 0)
    return { giorni, vociPerGiorno, totaliGiorno, catPresenti, totaliCategoria, totaleGenerale, riepilogoMensile, totaleComplessivoTutti }
  }, [costi, meseInterna])

  function apriInterna() { setMeseInterna(filtroMese || mesiDisponibili[0] || ''); setRicaviPerCat({}); setRicaviACorpo(''); setUsaACorpo(false); setPrintMode('interna'); setModalInterna(true) }
  const totaleRicaviPerCat = datiInterna.catPresenti.reduce((s, cat) => s + (parseFloat(ricaviPerCat[cat]) || 0), 0)
  const totaleRicaviFinale = usaACorpo ? (parseFloat(ricaviACorpo) || 0) : totaleRicaviPerCat
  const margineInterna = totaleRicaviFinale - datiInterna.totaleGenerale
  const marginePercInterna = totaleRicaviFinale > 0 ? Math.round(margineInterna / totaleRicaviFinale * 100) : 0

  async function apriEsterna() {
    const m = filtroMese || mesiDisponibili[0] || ''
    setMeseEsterna(m); setNoteEsterna(''); setLoadingEsterna(true)
    const clienteId = progetto?.cliente_id
    let prezziSalvati: Record<string, string> = {}
    if (clienteId) { const { data: pv } = await supabase.from('prezzi_vendita_cliente').select('*').eq('cliente_id', clienteId); if (pv) pv.forEach((r: any) => { prezziSalvati[r.categoria] = String(r.prezzo_vendita) }) }
    setPrezziCliente(prezziSalvati)
    const costiPer = m ? costi.filter(c => c.data?.startsWith(m)) : costi
    const voci: VoceEsterna[] = costiPer.map(c => ({ id: c.id, visibile: true, data: c.data, categoria: c.categoria, descrizione: c.descrizione || c.categoria, quantita: c.quantita || 1, quantita_mod: String(c.quantita || 1), prezzo_vendita: prezziSalvati[c.categoria] || '', importo_calcolato: 0, libera: false }))
    setVociEsterne(voci); setLoadingEsterna(false); setPrintMode('esterna'); setModalEsterna(true)
  }
  function aggiornaVoceEsterna(id: string, campo: string, valore: any) { setVociEsterne(prev => prev.map(v => v.id === id ? { ...v, [campo]: valore } : v)) }
  function aggiungiVoceLibera() { setVociEsterne(prev => [...prev, { id: Math.random().toString(36).slice(2), visibile: true, data: new Date().toISOString().split('T')[0], categoria: 'Altro', descrizione: '', quantita: 1, quantita_mod: '1', prezzo_vendita: '', importo_calcolato: 0, libera: true }]) }
  async function salvaePrezziEsterna() {
    const clienteId = progetto?.cliente_id; if (!clienteId) return
    const prezziUsati: Record<string, number> = {}
    vociEsterne.filter(v => v.visibile && v.prezzo_vendita).forEach(v => { if (!prezziUsati[v.categoria]) prezziUsati[v.categoria] = parseFloat(v.prezzo_vendita) || 0 })
    for (const [cat, prezzo] of Object.entries(prezziUsati)) { await supabase.from('prezzi_vendita_cliente').upsert({ cliente_id: clienteId, categoria: cat, prezzo_vendita: prezzo, updated_at: new Date().toISOString() }, { onConflict: 'cliente_id,categoria' }) }
  }
  const vociVisibili = vociEsterne.filter(v => v.visibile)
  const totaleEsterno = vociVisibili.reduce((s, v) => { const q = parseFloat(v.quantita_mod) || v.quantita || 1; const p = parseFloat(v.prezzo_vendita) || 0; return s + q * p }, 0)
  const riepilogoEsterno = useMemo(() => { const m: Record<string, number> = {}; vociVisibili.forEach(v => { const q = parseFloat(v.quantita_mod) || v.quantita || 1; const p = parseFloat(v.prezzo_vendita) || 0; m[v.categoria] = (m[v.categoria] || 0) + q * p }); return m }, [vociEsterne])
  const giorniEsterni = useMemo(() => { const s = new Set(vociVisibili.map(v => v.data).filter(Boolean)); return Array.from(s).sort() }, [vociEsterne])

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Costi cantiere giornalieri</h1>
          <div className="flex gap-2">
            {tab === 'costi' && costi.length > 0 && (<><button className="btn" onClick={apriInterna}>📊 Contabilità Interna</button><button className="btn" onClick={apriEsterna}>📋 Contabilità Cliente</button></>)}
            {tab === 'costi' && <button className="btn btn-primary" onClick={() => { const oggi = new Date().toISOString().split('T')[0]; setDataBase(oggi); setRighe([nuovaRiga(oggi)]); setModalCosto(true) }}>+ Inserisci costi</button>}
            {tab === 'ddt' && <button className="btn btn-primary" onClick={() => setModalDdt(true)}>+ Inserisci DDT</button>}
            {tab === 'sal' && <button className="btn btn-primary" onClick={apriModalSal}>+ Inserisci SAL</button>}
          </div>
        </div>

        {/* Tab BC / Filosofia */}
        <div className="flex gap-2 mb-4">
          {(['BC General Service', 'Filosofia'] as Societa[]).map(soc => (
            <button key={soc} onClick={() => {
              setSocietaFiltroCC(soc)
              const primo = progetti.find(p => (p.societa || 'BC General Service') === soc)
              if (primo) setProgettoSel(primo.id)
            }}
              className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                soc === 'BC General Service'
                  ? societaFiltroCC === soc ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-blue-50 text-blue-700 border-blue-300'
                  : societaFiltroCC === soc ? 'bg-orange-500 text-white border-orange-500 shadow' : 'bg-orange-50 text-orange-700 border-orange-300'
              }`}>
              {soc === 'BC General Service' ? '🏗' : '🏢'} {soc}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${societaFiltroCC === soc ? 'bg-white/20' : 'bg-white'}`}>
                {progetti.filter(p => (p.societa || 'BC General Service') === soc).length}
              </span>
            </button>
          ))}
        </div>

        <div className="card mb-4">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-52">
              <label className="label">Cantiere</label>
              <select className="input" value={progettoSel} onChange={e => setProgettoSel(e.target.value)}>
                {progettiSocieta.map(p => <option key={p.id} value={p.id}>{p.codice} — {p.nome}</option>)}
              </select>
            </div>
            {tab === 'costi' && (
              <div>
                <label className="label">Filtra per mese</label>
                <select className="input w-auto" value={filtroMese} onChange={e => setFiltroMese(e.target.value)}>
                  <option value="">Tutti i mesi</option>
                  {mesiDisponibili.map(m => (<option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</option>))}
                </select>
              </div>
            )}
          </div>
        </div>

        {progetto && (
          <>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="bg-teal-50 rounded-xl p-4 border border-teal-100"><p className="text-xs text-teal-600 mb-1">Ricavi (SAL maturati)</p><p className="text-xl font-semibold text-teal-800">{euro(totaleSal)}</p><p className="text-xs text-teal-500 mt-1">{salList.length} SAL inseriti</p></div>
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100"><p className="text-xs text-blue-600 mb-1">Totale costi inseriti</p><p className="text-xl font-semibold text-blue-800">{euro(totaleTutti)}</p>{filtroMese && tab === 'costi' && <p className="text-xs text-blue-500 mt-1">Mese: {euro(totale)}</p>}</div>
              <div className={`rounded-xl p-4 border ${margineSal >= 0 ? 'bg-purple-50 border-purple-100' : 'bg-red-50 border-red-200'}`}><p className={`text-xs mb-1 ${margineSal >= 0 ? 'text-purple-600' : 'text-red-600'}`}>Margine (su SAL)</p><p className={`text-xl font-semibold ${margineSal >= 0 ? 'text-purple-800' : 'text-red-700'}`}>{euro(margineSal)} {totaleSal > 0 && <span className="text-sm font-normal">({margineSalPerc}%)</span>}</p></div>
              <div className={`rounded-xl p-4 border ${budgetPerc >= 100 ? 'bg-red-50 border-red-200' : budgetPerc >= 80 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}><p className={`text-xs mb-1 ${budgetPerc >= 100 ? 'text-red-600' : budgetPerc >= 80 ? 'text-amber-600' : 'text-green-600'}`}>Budget utilizzato</p><p className={`text-xl font-semibold ${budgetPerc >= 100 ? 'text-red-700' : budgetPerc >= 80 ? 'text-amber-700' : 'text-green-700'}`}>{budgetPerc}%</p></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-100"><p className="text-xs text-purple-600 mb-1">Totale DDT cantiere</p><p className="text-xl font-semibold text-purple-800">{euro(totaleDdt)}</p><p className="text-xs text-purple-500 mt-1">{ddts.length} DDT inseriti</p></div>
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100"><p className="text-xs text-emerald-600 mb-1">Fatturato (emesso)</p><p className="text-xl font-semibold text-emerald-800">{euro(totaleFatturatoEmesso)}</p>{totaleFattureDaEmettere > 0 && <p className="text-xs text-emerald-500 mt-1">Da emettere: {euro(totaleFattureDaEmettere)}</p>}</div>
              <div className={`rounded-xl p-4 border ${Math.abs(scostamentoSalFatturato) < 0.02 ? 'bg-green-50 border-green-200' : scostamentoSalFatturato > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-xs mb-1 ${scostamentoSalFatturato > 0 ? 'text-amber-600' : 'text-gray-600'}`}>SAL vs Fatturato</p>
                <p className={`text-xl font-semibold ${scostamentoSalFatturato > 0 ? 'text-amber-700' : 'text-gray-700'}`}>{scostamentoSalFatturato > 0 ? `${euro(scostamentoSalFatturato)} da fatturare` : Math.abs(scostamentoSalFatturato) < 0.02 ? 'In pari' : `${euro(Math.abs(scostamentoSalFatturato))} oltre SAL`}</p>
                {scostamentoSalFatturato > 0 && <p className="text-xs text-amber-500 mt-1">🟡 Sei a rilento con la fatturazione</p>}
              </div>
            </div>
            <div className="flex gap-1 mb-4 border-b border-gray-200 flex-wrap">
              <button onClick={() => setTab('costi')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'costi' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>💰 Costi giornalieri ({registroUnificato.length})</button>
              <button onClick={() => setTab('ddt')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'ddt' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>📋 DDT / Bolle ({ddts.length})</button>
              <button onClick={() => setTab('sal')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'sal' ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>📈 SAL ({salList.length})</button>
            </div>

            {tab === 'costi' && (<>
              {Object.keys(totalePerCategoria).length > 0 && (
                <div className="card mb-4">
                  <h3 className="text-sm font-medium text-gray-600 mb-3">Ripartizione costi per categoria</h3>
                  <div className="space-y-2">
                    {Object.entries(totalePerCategoria).sort((a, b) => b[1] - a[1]).map(([cat, imp]) => (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="text-xs w-36 flex-shrink-0 text-gray-600">{cat}</span>
                        <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden"><div className="h-full rounded-lg flex items-center px-2" style={{ width: `${Math.max((imp / totale) * 100, 2)}%`, background: CAT_COLORS[cat] || '#6b7280' }}><span className="text-white text-xs font-medium whitespace-nowrap">{Math.round((imp / totale) * 100)}%</span></div></div>
                        <span className="text-sm font-medium text-gray-700 w-24 text-right">{euro(imp)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100"><span className="text-xs font-medium text-gray-500">Totale periodo</span><span className="text-sm font-semibold text-gray-800">{euro(totale)}</span></div>
                </div>
              )}
              <div className="card overflow-x-auto">
                <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-medium text-gray-600">Registro costi ({costiFiltrati.length})</h3><span className="text-xs text-gray-400">Include costi manuali e DDT collegati a questo cantiere</span></div>
                <table className="table-base">
                  <thead><tr><th></th><th>Data</th><th>Categoria</th><th>Descrizione</th><th>Qtà</th><th>Pr. Unit.</th><th>Importo</th><th>Origine</th><th>Note</th><th></th></tr></thead>
                  <tbody>
                    {costiFiltrati.length === 0 ? (<tr><td colSpan={10} className="text-center text-gray-400 py-8">Nessun costo registrato per questo cantiere.</td></tr>) : costiFiltrati.map(c => (
                      <tr key={c.id} className={c.tipo === 'ddt' ? 'cursor-pointer hover:bg-purple-50' : ''} onClick={() => { if (c.tipo === 'ddt') apriDettaglioDdt(c.ddtRiferimento) }}>
                        <td>{c.tipo === 'ddt' && (<span className="text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 inline-flex items-center gap-1">DDT {c.incompleta && <span title="Manca il prezzo">⚠️</span>}</span>)}</td>
                        <td className="text-xs">{new Date(c.data).toLocaleDateString('it-IT')}</td>
                        <td><span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ background: CAT_COLORS[c.categoria] || '#6b7280' }}>{c.categoria}</span></td>
                        <td className="text-sm">{c.descrizione || '—'}</td>
                        <td className="text-xs text-gray-500">{c.quantita != null ? c.quantita : '—'}</td>
                        <td className="text-xs text-gray-500">{c.prezzo_unitario != null ? euro(c.prezzo_unitario) : '—'}</td>
                        <td className={`font-semibold text-sm ${c.tipo === 'ddt' ? 'text-purple-800' : 'text-blue-800'}`}>{euro(c.importo)}</td>
                        <td className="text-xs text-gray-500">{c.tipo === 'ddt' ? `DDT ${c.ddtRiferimento?.numero || ''} — ${c.inserito_da_nome || ''}` : (c.inserito_da_nome || '—')}</td>
                        <td className="text-xs text-gray-400">{c.note || '—'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          {c.tipo === 'ddt' ? (<button className="btn btn-sm text-purple-600 border-purple-200 hover:bg-purple-50" onClick={() => apriDettaglioDdt(c.ddtRiferimento)}>👁️</button>) : (
                            <div className="flex gap-1">
                              <button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setModalModificaCosto({...c, importo: String(c.importo), quantita: c.quantita != null ? String(c.quantita) : '', prezzo_unitario: c.prezzo_unitario != null ? String(c.prezzo_unitario) : ''})}>✏️</button>
                              <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaCosto(c.id)}>✕</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}

            {tab === 'ddt' && (
              <div className="card overflow-x-auto">
                <h3 className="text-sm font-medium text-gray-600 mb-3">DDT inseriti per questo cantiere ({ddts.length})</h3>
                <table className="table-base">
                  <thead><tr><th></th><th>Data</th><th>N° DDT</th><th>Fornitore</th><th>Descrizione</th><th>Importo</th><th>Stato</th><th>Mese prev.</th><th></th></tr></thead>
                  <tbody>
                    {ddts.length === 0 ? (<tr><td colSpan={9} className="text-center text-gray-400 py-8">Nessun DDT inserito per questo cantiere.</td></tr>) : ddts.map(d => (
                      <tr key={d.id} className="cursor-pointer hover:bg-gray-50" onClick={() => apriDettaglioDdt(d)}>
                        <td>{ddtHaVociIncomplete(d) && <span title="Manca il prezzo">⚠️</span>}</td>
                        <td className="text-xs">{d.data ? new Date(d.data).toLocaleDateString('it-IT') : '—'}</td>
                        <td className="font-medium text-sm">{d.numero}</td>
                        <td className="text-sm">{d.fornitore_nome}</td>
                        <td className="text-xs text-gray-600">{d.descrizione || '—'}</td>
                        <td className="font-semibold text-sm text-purple-800">{euro(d.importo)}</td>
                        <td>{statoBadge(d.stato)}</td>
                        <td className="text-xs text-gray-500">{d.mese_fattura_previsto || '—'}</td>
                        <td onClick={e => e.stopPropagation()}>{d.stato === 'Da Fatturare' && <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaDdt(d.id)}>✕</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'sal' && (
              <div className="card overflow-x-auto">
                <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-medium text-gray-600">SAL inseriti per questo cantiere ({salList.length})</h3><span className="text-sm font-semibold text-teal-700">Totale: {euro(totaleSal)}</span></div>
                <table className="table-base">
                  <thead><tr><th>Data</th><th>N° SAL</th><th>Descrizione</th><th>Importo lavori</th><th>Note</th><th></th></tr></thead>
                  <tbody>
                    {salList.length === 0 ? (<tr><td colSpan={6} className="text-center text-gray-400 py-8">Nessun SAL inserito per questo cantiere.</td></tr>) : salList.map(s => (
                      <tr key={s.id}>
                        <td className="text-xs">{s.data ? new Date(s.data).toLocaleDateString('it-IT') : '—'}</td>
                        <td className="font-medium text-sm">{s.numero_sal || '—'}</td>
                        <td className="text-sm text-gray-600">{s.descrizione || '—'}</td>
                        <td className="font-semibold text-sm text-teal-800">{euro(s.importo_lavori)}</td>
                        <td className="text-xs text-gray-400">{s.note || '—'}</td>
                        <td><div className="flex gap-1"><button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setModalModificaSal({ ...s, importo_lavori: String(s.importo_lavori) })}>✏️</button><button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaSal(s.id)}>✕</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {/* MODAL COSTI */}
      {modalCosto && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4"><div><h2 className="text-base font-semibold">Inserisci costi giornalieri</h2><p className="text-xs text-gray-500 mt-0.5">{progetto?.codice} — {progetto?.nome}</p></div><button onClick={() => setModalCosto(false)} className="text-gray-400 text-xl">×</button></div>
        <div className="flex items-center gap-3 mb-4"><label className="label mb-0">Data di default:</label><input className="input w-40" type="date" value={dataBase} onChange={e => { setDataBase(e.target.value); setRighe(prev => prev.map(r => ({ ...r, data: e.target.value }))) }} /><span className="text-xs text-gray-400">(modificabile per ogni riga)</span></div>
        <div className="overflow-x-auto mb-3"><table className="table-base" style={{ minWidth: 900 }}>
          <thead><tr><th style={{ width: 110 }}>Data</th><th style={{ width: 160 }}>Categoria</th><th>Descrizione</th><th style={{ width: 80 }}>Qtà</th><th style={{ width: 90 }}>€/unit</th><th style={{ width: 100 }}>Importo *</th><th style={{ width: 140 }}>Note</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>{righe.map(r => (<tr key={r.id}>
            <td><input className="input text-xs py-1" type="date" value={r.data} onChange={e => aggiornaRiga(r.id, 'data', e.target.value)} /></td>
            <td><select className="input text-xs py-1" value={r.categoria} onChange={e => aggiornaRiga(r.id, 'categoria', e.target.value)}>{CATEGORIE.map(c => <option key={c}>{c}</option>)}</select>{r.categoria === 'Personalizzato' && <input className="input text-xs py-1 mt-1" placeholder="Nome categoria..." value={r.categoria_personalizzata} onChange={e => aggiornaRiga(r.id, 'categoria_personalizzata', e.target.value)} />}</td>
            <td><input className="input text-xs py-1" placeholder="es. Operaio, calcestruzzo..." value={r.descrizione} onChange={e => aggiornaRiga(r.id, 'descrizione', e.target.value)} /></td>
            <td><input className="input text-xs py-1" type="number" step="0.01" value={r.quantita} onChange={e => aggiornaRiga(r.id, 'quantita', e.target.value)} /></td>
            <td><input className="input text-xs py-1" type="number" step="0.01" value={r.prezzo_unitario} onChange={e => aggiornaRiga(r.id, 'prezzo_unitario', e.target.value)} /></td>
            <td><input className="input text-xs py-1 font-semibold text-blue-800" type="number" step="0.01" placeholder="0.00" value={r.importo} onChange={e => aggiornaRiga(r.id, 'importo', e.target.value)} /></td>
            <td><input className="input text-xs py-1" placeholder="Note..." value={r.note} onChange={e => aggiornaRiga(r.id, 'note', e.target.value)} /></td>
            <td><button className="text-gray-300 hover:text-red-500 text-sm" onClick={() => setRighe(prev => prev.filter(x => x.id !== r.id))} disabled={righe.length === 1}>✕</button></td>
          </tr>))}</tbody>
        </table></div>
        <div className="flex items-center justify-between"><button className="btn btn-sm" onClick={() => setRighe(prev => [...prev, nuovaRiga(dataBase)])}>+ Aggiungi riga</button><div className="flex items-center gap-4"><span className="text-sm font-semibold text-gray-700">Totale: <span className="text-blue-800">{euro(totaleRighe)}</span></span><button className="btn" onClick={() => setModalCosto(false)}>Annulla</button><button className="btn btn-primary" onClick={salvaCosti} disabled={loadingCosto}>{loadingCosto ? 'Salvataggio...' : `Salva ${righe.filter(r => parseFloat(r.importo) > 0).length} costi`}</button></div></div>
      </div></div>)}

      {/* MODAL DDT */}
      {modalDdt && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4"><div><h2 className="text-base font-semibold">Inserisci DDT</h2><p className="text-xs text-gray-500 mt-0.5">{progetto?.codice} — {progetto?.nome}</p></div><button onClick={() => setModalDdt(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Data</label><input className="input" type="date" value={formDdt.data} onChange={e => setFormDdt({...formDdt, data: e.target.value})} /></div>
          <div><label className="label">N° DDT *</label><input className="input" placeholder="es. DDT/2026/001" value={formDdt.numero} onChange={e => setFormDdt({...formDdt, numero: e.target.value})} /></div>
          <div className="col-span-2"><label className="label">Fornitore *</label><select className="input" value={formDdt.fornitore_id} onChange={e => setFormDdt({...formDdt, fornitore_id: e.target.value})}><option value="">-- seleziona --</option>{fornitori.map(f => <option key={f.id} value={f.id}>{f.ragione_sociale}</option>)}</select></div>
          <div className="col-span-2"><label className="label">Descrizione</label><input className="input" value={formDdt.descrizione} onChange={e => setFormDdt({...formDdt, descrizione: e.target.value})} /></div>
          <div><label className="label">Importo (€) *</label><input className="input" type="number" step="0.01" value={formDdt.importo} onChange={e => setFormDdt({...formDdt, importo: e.target.value})} /></div>
          <div><label className="label">Mese fattura previsto</label><input className="input" type="month" value={formDdt.mese_fattura_previsto} onChange={e => setFormDdt({...formDdt, mese_fattura_previsto: e.target.value})} /></div>
          <div className="col-span-2"><label className="label">Note</label><input className="input" value={formDdt.note} onChange={e => setFormDdt({...formDdt, note: e.target.value})} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={() => setModalDdt(false)}>Annulla</button><button className="btn btn-primary" onClick={salvaDdt} disabled={loadingDdt}>{loadingDdt ? 'Salvataggio...' : 'Salva DDT'}</button></div>
      </div></div>)}

      {/* MODAL SAL */}
      {modalSal && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4"><div><h2 className="text-base font-semibold">Inserisci SAL</h2><p className="text-xs text-gray-500 mt-0.5">{progetto?.codice} — {progetto?.nome}</p></div><button onClick={() => setModalSal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Data</label><input className="input" type="date" value={formSal.data} onChange={e => setFormSal({...formSal, data: e.target.value})} /></div>
          <div><label className="label">N° SAL</label><input className="input" placeholder="es. SAL 3" value={formSal.numero_sal} onChange={e => setFormSal({...formSal, numero_sal: e.target.value})} /></div>
          <div className="col-span-2"><label className="label">Importo lavori eseguiti (€) *</label><input className="input font-semibold text-teal-800" type="number" step="0.01" placeholder="0.00" value={formSal.importo_lavori} onChange={e => setFormSal({...formSal, importo_lavori: e.target.value})} /></div>
          <div className="col-span-2"><label className="label">Descrizione</label><input className="input" placeholder="Lavorazioni svolte..." value={formSal.descrizione} onChange={e => setFormSal({...formSal, descrizione: e.target.value})} /></div>
          <div className="col-span-2"><label className="label">Note</label><input className="input" value={formSal.note} onChange={e => setFormSal({...formSal, note: e.target.value})} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={() => setModalSal(false)}>Annulla</button><button className="btn btn-primary" onClick={salvaSal} disabled={loadingSal}>{loadingSal ? 'Salvataggio...' : 'Salva SAL'}</button></div>
      </div></div>)}

      {/* MODAL MODIFICA SAL */}
      {modalModificaSal && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold">Modifica SAL</h2><button onClick={() => setModalModificaSal(null)} className="text-gray-400 text-xl">×</button></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Data</label><input className="input" type="date" value={modalModificaSal.data || ''} onChange={e => setModalModificaSal({...modalModificaSal, data: e.target.value})} /></div>
          <div><label className="label">N° SAL</label><input className="input" value={modalModificaSal.numero_sal || ''} onChange={e => setModalModificaSal({...modalModificaSal, numero_sal: e.target.value})} /></div>
          <div className="col-span-2"><label className="label">Importo lavori (€) *</label><input className="input font-semibold text-teal-800" type="number" step="0.01" value={modalModificaSal.importo_lavori || ''} onChange={e => setModalModificaSal({...modalModificaSal, importo_lavori: e.target.value})} /></div>
          <div className="col-span-2"><label className="label">Descrizione</label><input className="input" value={modalModificaSal.descrizione || ''} onChange={e => setModalModificaSal({...modalModificaSal, descrizione: e.target.value})} /></div>
          <div className="col-span-2"><label className="label">Note</label><input className="input" value={modalModificaSal.note || ''} onChange={e => setModalModificaSal({...modalModificaSal, note: e.target.value})} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={() => setModalModificaSal(null)}>Annulla</button><button className="btn btn-primary" onClick={salvaModificaSal}>Salva modifiche</button></div>
      </div></div>)}

      {/* MODAL MODIFICA COSTO */}
      {modalModificaCosto && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold">Modifica costo</h2><button onClick={() => setModalModificaCosto(null)} className="text-gray-400 text-xl">×</button></div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Data</label><input className="input" type="date" value={modalModificaCosto.data || ''} onChange={e => setModalModificaCosto({...modalModificaCosto, data: e.target.value})} /></div>
            <div><label className="label">Categoria</label><select className="input" value={modalModificaCosto.categoria || ''} onChange={e => setModalModificaCosto({...modalModificaCosto, categoria: e.target.value})}>{CATEGORIE.map(c => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div><label className="label">Descrizione</label><input className="input" value={modalModificaCosto.descrizione || ''} onChange={e => setModalModificaCosto({...modalModificaCosto, descrizione: e.target.value})} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Quantità</label><input className="input" type="number" step="0.01" value={modalModificaCosto.quantita || ''} onChange={e => { const q = e.target.value; const p = modalModificaCosto.prezzo_unitario; const tot = q && p ? (parseFloat(q) * parseFloat(p)).toFixed(2) : modalModificaCosto.importo; setModalModificaCosto({...modalModificaCosto, quantita: q, importo: tot}) }} /></div>
            <div><label className="label">Prezzo unit. (€)</label><input className="input" type="number" step="0.01" value={modalModificaCosto.prezzo_unitario || ''} onChange={e => { const p = e.target.value; const q = modalModificaCosto.quantita; const tot = q && p ? (parseFloat(q) * parseFloat(p)).toFixed(2) : modalModificaCosto.importo; setModalModificaCosto({...modalModificaCosto, prezzo_unitario: p, importo: tot}) }} /></div>
            <div><label className="label">Importo (€) *</label><input className="input font-semibold text-blue-800" type="number" step="0.01" value={modalModificaCosto.importo || ''} onChange={e => setModalModificaCosto({...modalModificaCosto, importo: e.target.value})} /></div>
          </div>
          <div><label className="label">Note</label><input className="input" value={modalModificaCosto.note || ''} onChange={e => setModalModificaCosto({...modalModificaCosto, note: e.target.value})} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={() => setModalModificaCosto(null)}>Annulla</button><button className="btn btn-primary" onClick={salvaModificaCosto}>Salva modifiche</button></div>
      </div></div>)}

      {/* MODAL DETTAGLIO / MODIFICA DDT */}
      {modalDettaglioDdt && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold">{editandoDdt ? '✏️ Modifica DDT' : '📋 Dettaglio DDT'} — {modalDettaglioDdt.numero}</h2><button onClick={() => { setModalDettaglioDdt(null); setVociDettaglioDdt([]); setEditandoDdt(false) }} className="text-gray-400 hover:text-gray-600 text-xl">×</button></div>
        {!editandoDdt ? (<>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4 text-sm">
            <div><span className="text-gray-400 text-xs block">Data</span>{modalDettaglioDdt.data ? new Date(modalDettaglioDdt.data).toLocaleDateString('it-IT') : '—'}</div>
            <div><span className="text-gray-400 text-xs block">Fornitore</span>{modalDettaglioDdt.fornitore_nome}</div>
            <div><span className="text-gray-400 text-xs block">Cantiere</span>{modalDettaglioDdt.progetto_nome || '—'}</div>
            <div><span className="text-gray-400 text-xs block">Stato</span>{statoBadge(modalDettaglioDdt.stato)}</div>
            <div className="col-span-2"><span className="text-gray-400 text-xs block">Note</span>{modalDettaglioDdt.note || '—'}</div>
            <div><span className="text-gray-400 text-xs block">Fattura abbinata</span>{modalDettaglioDdt.fattura_abbinata || '—'}</div>
          </div>
          <h3 className="text-sm font-medium text-gray-600 mb-2">📦 Voci ({vociDettaglioDdt.length})</h3>
          {vociDettaglioDdt.length === 0 ? (<p className="text-xs text-gray-400 py-3 text-center border border-dashed rounded-lg">Nessuna voce registrata.</p>) : (
            <div className="overflow-x-auto"><table className="table-base">
              <thead><tr><th></th><th>Descrizione</th><th>Macro-cat.</th><th>Categoria costi</th><th>U.M.</th><th>Qtà</th><th>€/unit</th><th>Totale</th></tr></thead>
              <tbody>{vociDettaglioDdt.map((v: any) => (<tr key={v.id} className={voceDdtIncompleta(v) ? 'bg-amber-50' : ''}>
                <td>{voceDdtIncompleta(v) && <span title="Manca il prezzo">⚠️</span>}</td>
                <td className="text-sm">{v.descrizione}</td><td className="text-xs text-gray-500">{v.macro_categoria}</td>
                <td><span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ background: CAT_COLORS[mappaCategoriaDdt(v.macro_categoria)] || '#6b7280' }}>{mappaCategoriaDdt(v.macro_categoria)}</span></td>
                <td className="text-xs">{v.unita_misura}</td><td className="text-xs">{v.quantita}</td>
                <td className="text-xs">{v.prezzo_unitario ? euro(v.prezzo_unitario) : <span className="text-amber-600 font-medium">manca</span>}</td>
                <td className="font-medium text-sm">{euro(v.importo_totale)}</td>
              </tr>))}</tbody>
            </table><div className="flex justify-end mt-2 pt-2 border-t border-gray-100"><span className="font-semibold text-sm">Totale: {euro(modalDettaglioDdt.importo)}</span></div></div>
          )}
          <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={() => { setModalDettaglioDdt(null); setVociDettaglioDdt([]) }}>Chiudi</button><button className="btn btn-primary" onClick={entraEditDdt}>✏️ Modifica</button></div>
        </>) : (<>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
            <div><label className="label">Data</label><input className="input" type="date" value={formEditDdt.data} onChange={e => setFormEditDdt({...formEditDdt, data: e.target.value})} /></div>
            <div><label className="label">N° DDT *</label><input className="input" value={formEditDdt.numero} onChange={e => setFormEditDdt({...formEditDdt, numero: e.target.value})} /></div>
            <div><label className="label">Fornitore *</label><select className="input" value={formEditDdt.fornitore_id} onChange={e => setFormEditDdt({...formEditDdt, fornitore_id: e.target.value})}><option value="">-- seleziona --</option>{fornitori.map(f => <option key={f.id} value={f.id}>{f.ragione_sociale}</option>)}</select></div>
            <div><label className="label">Mese fattura previsto</label><input className="input" type="month" value={formEditDdt.mese_fattura_previsto} onChange={e => setFormEditDdt({...formEditDdt, mese_fattura_previsto: e.target.value})} /></div>
            <div className="col-span-2"><label className="label">Descrizione</label><input className="input" value={formEditDdt.descrizione} onChange={e => setFormEditDdt({...formEditDdt, descrizione: e.target.value})} /></div>
            <div className="col-span-2"><label className="label">Note</label><input className="input" value={formEditDdt.note} onChange={e => setFormEditDdt({...formEditDdt, note: e.target.value})} /></div>
          </div>
          <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-medium text-gray-600">📦 Voci ({vociDettaglioDdt.length})</h3><button className="btn btn-sm btn-primary" onClick={aggiungiVoceDdtEdit}>+ Voce</button></div>
          {vociDettaglioDdt.length === 0 ? (<p className="text-xs text-gray-400 py-3 text-center border border-dashed rounded-lg">Nessuna voce. Clicca "+ Voce" per aggiungerne.</p>) : (
            <div className="overflow-x-auto"><table className="table-base">
              <thead><tr><th></th><th>Descrizione</th><th>Macro-cat.</th><th>U.M.</th><th>Qtà</th><th>€/unit</th><th>Totale</th><th></th></tr></thead>
              <tbody>{vociDettaglioDdt.map((v: any, idx: number) => (<tr key={v.id || idx} className={voceDdtIncompleta(v) ? 'bg-amber-50' : ''}>
                <td>{voceDdtIncompleta(v) && <span title="Manca il prezzo">⚠️</span>}</td>
                <td><input className="input text-xs py-1" value={v.descrizione} onChange={e => aggiornaVoceDdtEdit(idx, 'descrizione', e.target.value)} /></td>
                <td><select className="input text-xs py-1" value={v.macro_categoria} onChange={e => aggiornaVoceDdtEdit(idx, 'macro_categoria', e.target.value)}>{MACRO_CATEGORIE_DDT.map(m => <option key={m}>{m}</option>)}</select></td>
                <td><input className="input text-xs py-1 w-14" value={v.unita_misura || ''} onChange={e => aggiornaVoceDdtEdit(idx, 'unita_misura', e.target.value)} /></td>
                <td><input className="input text-xs py-1 w-20" type="number" step="0.001" value={v.quantita || ''} onChange={e => aggiornaVoceDdtEdit(idx, 'quantita', e.target.value)} /></td>
                <td><input className="input text-xs py-1 w-24" type="number" step="0.0001" placeholder="manca" value={v.prezzo_unitario || ''} onChange={e => aggiornaVoceDdtEdit(idx, 'prezzo_unitario', e.target.value)} /></td>
                <td className="font-medium text-sm">{euro(v.importo_totale)}</td>
                <td><button className="text-gray-300 hover:text-red-500 text-sm" onClick={() => rimuoviVoceDdtEdit(idx)}>✕</button></td>
              </tr>))}</tbody>
            </table><div className="flex justify-end mt-2 pt-2 border-t border-gray-100"><span className="font-semibold text-sm">Totale: {euro(vociDettaglioDdt.reduce((s, v) => s + (v.importo_totale || 0), 0))}</span></div></div>
          )}
          <div className="flex gap-2 justify-end mt-4"><button className="btn" onClick={() => setEditandoDdt(false)}>← Annulla</button><button className="btn btn-primary" onClick={salvaEditDdt} disabled={loadingEditDdt}>{loadingEditDdt ? 'Salvataggio...' : 'Salva modifiche'}</button></div>
        </>)}
      </div></div>)}

      {/* MODAL CONTABILITÀ INTERNA */}
      {modalInterna && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2"><div className="bg-white rounded-xl w-full max-w-7xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 no-print">
          <div><h2 className="text-base font-semibold">📊 Contabilità Interna</h2><p className="text-xs text-gray-500">{progetto?.codice} — {progetto?.nome}</p></div>
          <div className="flex items-center gap-3">
            <select className="input w-auto text-sm" value={meseInterna} onChange={e => setMeseInterna(e.target.value)}><option value="">Tutti i mesi</option>{mesiDisponibili.map(m => <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</option>)}</select>
            <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Stampa</button>
            <button onClick={() => { setModalInterna(false); setPrintMode(null) }} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6" id="report-interna">
          <div className="report-header flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-800">
            <div className="flex items-center gap-4"><img src="/logo.png" alt="BC General Service" style={{ height: 50, objectFit: 'contain' }} /><div><p style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a' }}>BC GENERAL SERVICE</p><p style={{ fontSize: 11, color: '#6b7280' }}>Società Consortile a R.L.</p><p style={{ fontSize: 11, color: '#6b7280' }}>Via Duca d'Este 7 — 41036 Medolla (MO)</p></div></div>
            <div className="text-right"><p style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>CONTABILITÀ INTERNA</p><p style={{ fontSize: 11, color: '#6b7280' }}>Cantiere: <strong>{progetto?.codice} — {progetto?.nome}</strong></p><p style={{ fontSize: 11, color: '#6b7280' }}>Periodo: <strong>{meseInterna ? new Date(meseInterna + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : 'Tutti i mesi'}</strong></p><p style={{ fontSize: 11, color: '#6b7280' }}>Data: <strong>{new Date().toLocaleDateString('it-IT')}</strong></p></div>
          </div>
          {!usaACorpo && datiInterna.catPresenti.length > 0 && (<div className="no-print card mb-4 border-gray-200"><h3 className="text-sm font-medium text-gray-600 mb-3">Ricavi per categoria</h3><div className="space-y-2">{datiInterna.catPresenti.map(cat => (<div key={cat} className="flex items-center gap-3"><span className="text-xs w-40 flex-shrink-0" style={{ color: CAT_COLORS[cat] || '#374151' }}>{cat}</span><span className="text-xs text-gray-400 w-28">Costo: {euro(datiInterna.totaliCategoria[cat] || 0)}</span><input type="number" step="0.01" placeholder="Ricavo €" className="input w-32 text-sm" value={ricaviPerCat[cat] || ''} onChange={e => setRicaviPerCat(prev => ({ ...prev, [cat]: e.target.value }))} /></div>))}</div></div>)}
          {datiInterna.giorni.length > 0 && (<div className="mb-6"><p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderLeft: '4px solid #1e3a8a', paddingLeft: 8 }}>DETTAGLIO COSTI PER GIORNATA</p>
            {datiInterna.giorni.map(giorno => { const vociGiorno = datiInterna.vociPerGiorno[giorno] || []; if (vociGiorno.length === 0) return null; return (<div key={giorno} className="day-block" style={{ marginBottom: 12 }}>
              <div style={{ background: '#1e40af', color: 'white', padding: '4px 12px', borderRadius: '4px 4px 0 0', fontSize: 11, fontWeight: 600 }}>{new Date(giorno).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, border: '1px solid #e5e7eb' }}><thead><tr style={{ background: '#f8faff' }}><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>Categoria</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>Descrizione</th><th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151', width: 90 }}>Importo</th></tr></thead>
              <tbody>{vociGiorno.map((c: any, idx: number) => (<tr key={c.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8faff' }}><td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', color: CAT_COLORS[c.categoria] || '#374151', fontWeight: 600 }}>{c.categoria}</td><td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9' }}>{c.descrizione || '—'}</td><td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: '#1e40af' }}>€ {euroShort(c.importo)}</td></tr>))}
              <tr style={{ background: '#eff6ff' }}><td colSpan={2} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#1e3a8a' }}>Totale giornata</td><td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(datiInterna.totaliGiorno[giorno])}</td></tr></tbody></table>
            </div>) })}
          </div>)}
          {datiInterna.riepilogoMensile.length > 0 && (<div className="mb-6"><p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderLeft: '4px solid #1e3a8a', paddingLeft: 8 }}>RIEPILOGO PER MESE</p>
            {datiInterna.riepilogoMensile.map(({ mese, perCategoria, totaleMese }) => (<div key={mese} className="month-block" style={{ marginBottom: 14 }}>
              <div style={{ background: '#374151', color: 'white', padding: '4px 12px', borderRadius: '4px 4px 0 0', fontSize: 11, fontWeight: 700 }}>{new Date(mese + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</div>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, border: '1px solid #e5e7eb' }}><thead><tr style={{ background: '#f8faff' }}><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>Categoria</th><th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151', width: 110 }}>Importo</th></tr></thead>
              <tbody>{perCategoria.map((c, idx) => (<tr key={c.categoria} style={{ background: idx % 2 === 0 ? '#fff' : '#f8faff' }}><td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: 600, color: CAT_COLORS[c.categoria] || '#374151' }}>{c.categoria}</td><td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: '#1e40af' }}>€ {euroShort(c.importo)}</td></tr>))}
              <tr style={{ background: '#eff6ff' }}><td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1e3a8a' }}>Totale mese</td><td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(totaleMese)}</td></tr></tbody></table>
            </div>))}
          </div>)}
          <div className="no-print card mb-4 border-green-200 bg-green-50"><div className="flex items-center gap-3 mb-2"><input type="checkbox" id="acorpo" checked={usaACorpo} onChange={e => setUsaACorpo(e.target.checked)} className="rounded" /><label htmlFor="acorpo" className="text-sm font-medium text-green-800 cursor-pointer">Ricavi a corpo</label></div>{usaACorpo && (<div className="flex items-center gap-3 mt-2"><label className="text-sm text-green-700">Totale ricavi:</label><input type="number" step="0.01" placeholder="0.00" className="input w-40" value={ricaviACorpo} onChange={e => setRicaviACorpo(e.target.value)} /></div>)}</div>
          <div className="totals-block" style={{ marginTop: 24 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderLeft: '4px solid #1e3a8a', paddingLeft: 8 }}>TOTALI COMPLESSIVI</p>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div style={{ border: '2px solid #1e40af', borderRadius: 8, padding: 16, background: '#eff6ff' }}><p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>TOTALE COSTI</p><p style={{ fontSize: 22, fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(meseInterna ? datiInterna.totaleGenerale : datiInterna.totaleComplessivoTutti)}</p></div>
              <div style={{ border: '2px solid #059669', borderRadius: 8, padding: 16, background: '#f0fdf4' }}><p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>TOTALE RICAVI</p><p style={{ fontSize: 22, fontWeight: 800, color: '#065f46' }}>{totaleRicaviFinale > 0 ? '€ ' + euroShort(totaleRicaviFinale) : '—'}</p></div>
              <div style={{ border: `2px solid ${margineInterna >= 0 ? '#7c3aed' : '#dc2626'}`, borderRadius: 8, padding: 16, background: margineInterna >= 0 ? '#f5f3ff' : '#fef2f2' }}><p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>MARGINE {marginePercInterna > 0 ? `(${marginePercInterna}%)` : ''}</p><p style={{ fontSize: 22, fontWeight: 800, color: margineInterna >= 0 ? '#5b21b6' : '#dc2626' }}>{totaleRicaviFinale > 0 ? '€ ' + euroShort(margineInterna) : '—'}</p></div>
            </div>
          </div>
          <div className="signatures-block grid grid-cols-2 gap-8 mt-8 pt-4 border-t border-gray-200">
            <div><p style={{ fontSize: 11, color: '#6b7280', marginBottom: 32 }}>Firma geometra</p><div style={{ borderBottom: '1px solid #374151', width: 200 }}></div><p style={{ fontSize: 11, marginTop: 4 }}>{progetto?.geometra_nome || '_______________'}</p></div>
            <div><p style={{ fontSize: 11, color: '#6b7280', marginBottom: 32 }}>Firma responsabile</p><div style={{ borderBottom: '1px solid #374151', width: 200 }}></div><p style={{ fontSize: 11, marginTop: 4 }}>BC General Service</p></div>
          </div>
        </div>
      </div></div>)}

      {/* MODAL CONTABILITÀ ESTERNA */}
      {modalEsterna && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2"><div className="bg-white rounded-xl w-full max-w-7xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 no-print">
          <div><h2 className="text-base font-semibold">📋 Contabilità Cliente</h2><p className="text-xs text-gray-500">{progetto?.codice} — {progetto?.nome} | Cliente: <strong>{progetto?.cliente_nome || '—'}</strong></p></div>
          <div className="flex items-center gap-3">
            <select className="input w-auto text-sm" value={meseEsterna} onChange={e => { setMeseEsterna(e.target.value); const costiPer = e.target.value ? costi.filter(c => c.data?.startsWith(e.target.value)) : costi; setVociEsterne(costiPer.map(c => ({ id: c.id, visibile: true, data: c.data, categoria: c.categoria, descrizione: c.descrizione || c.categoria, quantita: c.quantita || 1, quantita_mod: String(c.quantita || 1), prezzo_vendita: prezziCliente[c.categoria] || '', importo_calcolato: 0, libera: false }))) }}><option value="">Tutti i mesi</option>{mesiDisponibili.map(m => <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</option>)}</select>
            <button className="btn btn-primary no-print" onClick={async () => { await salvaePrezziEsterna(); window.print() }}>🖨️ Salva prezzi e stampa</button>
            <button onClick={() => { setModalEsterna(false); setPrintMode(null) }} className="text-gray-400 hover:text-gray-600 text-2xl no-print">×</button>
          </div>
        </div>
        {loadingEsterna ? (<div className="flex-1 flex items-center justify-center"><div className="text-gray-400">Caricamento...</div></div>) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="no-print px-6 py-3 bg-gray-50 border-b border-gray-200">
              <p className="text-xs font-medium text-gray-600 mb-2">Seleziona le voci da mostrare al cliente e imposta i prezzi di vendita:</p>
              <div className="overflow-x-auto"><table className="table-base" style={{ minWidth: 800 }}>
                <thead><tr><th style={{ width: 36 }}>✓</th><th style={{ width: 90 }}>Data</th><th style={{ width: 140 }}>Categoria</th><th>Descrizione</th><th style={{ width: 80 }}>Qtà orig.</th><th style={{ width: 90 }}>Qtà cliente</th><th style={{ width: 110 }}>Prezzo vendita</th><th style={{ width: 100 }}>Totale</th></tr></thead>
                <tbody>{vociEsterne.map(v => { const q = parseFloat(v.quantita_mod) || v.quantita || 1; const p = parseFloat(v.prezzo_vendita) || 0; const tot = q * p; return (<tr key={v.id} className={!v.visibile ? 'opacity-40' : ''}>
                  <td><input type="checkbox" checked={v.visibile} onChange={e => aggiornaVoceEsterna(v.id, 'visibile', e.target.checked)} className="rounded" /></td>
                  <td className="text-xs">{fmt(v.data)}</td>
                  <td><span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: CAT_COLORS[v.categoria] || '#6b7280' }}>{v.categoria}</span></td>
                  <td><input className="input text-xs py-1" value={v.descrizione} onChange={e => aggiornaVoceEsterna(v.id, 'descrizione', e.target.value)} /></td>
                  <td className="text-xs text-gray-400 text-center">{v.libera ? '—' : v.quantita}</td>
                  <td><input className="input text-xs py-1" type="number" step="0.01" value={v.quantita_mod} onChange={e => aggiornaVoceEsterna(v.id, 'quantita_mod', e.target.value)} /></td>
                  <td><input className="input text-xs py-1" type="number" step="0.01" placeholder="€ vendita" value={v.prezzo_vendita} onChange={e => aggiornaVoceEsterna(v.id, 'prezzo_vendita', e.target.value)} /></td>
                  <td className="font-semibold text-sm text-right">{p > 0 ? euro(tot) : '—'}</td>
                </tr>) })}</tbody>
              </table></div>
              <div className="flex items-center justify-between mt-2"><button className="btn btn-sm" onClick={aggiungiVoceLibera}>+ Aggiungi voce libera</button><span className="text-sm font-semibold text-gray-700">Totale selezionato: <span className="text-blue-800">{euro(totaleEsterno)}</span></span></div>
              <div className="mt-2"><label className="label">Note per il cliente</label><input className="input" placeholder="Note da includere nel documento..." value={noteEsterna} onChange={e => setNoteEsterna(e.target.value)} /></div>
            </div>
            <div className="flex-1 overflow-auto p-6" id="report-esterno">
              <div className="report-header flex items-start justify-between mb-6 pb-4" style={{ borderBottom: '3px solid #1e3a8a' }}>
                <div className="flex items-center gap-4"><img src="/logo.png" alt="BC General Service" style={{ height: 55, objectFit: 'contain' }} /><div><p style={{ fontSize: 15, fontWeight: 800, color: '#1e3a8a', letterSpacing: 1 }}>BC GENERAL SERVICE</p><p style={{ fontSize: 10, color: '#6b7280' }}>Società Consortile a Responsabilità Limitata</p><p style={{ fontSize: 10, color: '#6b7280' }}>Via Duca d'Este 7 — 41036 Medolla (MO)</p><p style={{ fontSize: 10, color: '#6b7280' }}>P.IVA 03943310361</p></div></div>
                <div style={{ textAlign: 'right' }}><p style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 8 }}>CONTABILITÀ LAVORI</p><div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px', textAlign: 'left', minWidth: 200 }}><p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>COMMITTENTE</p><p style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{progetto?.cliente_nome || '—'}</p><p style={{ fontSize: 10, color: '#9ca3af', marginTop: 6, marginBottom: 2 }}>CANTIERE</p><p style={{ fontSize: 11, fontWeight: 600, color: '#1e40af' }}>{progetto?.codice} — {progetto?.nome}</p><p style={{ fontSize: 10, color: '#9ca3af', marginTop: 6, marginBottom: 2 }}>PERIODO</p><p style={{ fontSize: 10, color: '#374151' }}>{meseEsterna ? new Date(meseEsterna + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : 'Tutti i mesi'}</p><p style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>Data emissione: <strong>{new Date().toLocaleDateString('it-IT')}</strong></p></div></div>
              </div>
              {giorniEsterni.length > 0 && (<div className="mb-6"><p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderLeft: '4px solid #1e3a8a', paddingLeft: 8 }}>DETTAGLIO LAVORAZIONI PER GIORNATA</p>
                {giorniEsterni.map(giorno => { const vociGiorno = vociVisibili.filter(v => v.data === giorno); if (vociGiorno.length === 0) return null; const totGiorno = vociGiorno.reduce((s, v) => s + (parseFloat(v.quantita_mod) || 1) * (parseFloat(v.prezzo_vendita) || 0), 0); return (<div key={giorno} className="day-block" style={{ marginBottom: 12 }}>
                  <div style={{ background: '#1e40af', color: 'white', padding: '4px 12px', borderRadius: '4px 4px 0 0', fontSize: 11, fontWeight: 600 }}>{new Date(giorno).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, border: '1px solid #e5e7eb' }}><thead><tr style={{ background: '#f8faff' }}><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>Descrizione</th><th style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', color: '#374151', width: 80 }}>Quantità</th><th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151', width: 100 }}>Prezzo unit.</th><th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151', width: 100 }}>Importo</th></tr></thead>
                  <tbody>{vociGiorno.map((v, idx) => { const q = parseFloat(v.quantita_mod) || 1; const p = parseFloat(v.prezzo_vendita) || 0; return (<tr key={v.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8faff' }}><td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9' }}>{v.descrizione}</td><td style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{q}</td><td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{p > 0 ? '€ ' + euroShort(p) : '—'}</td><td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f1f5f9', color: '#1e40af' }}>{p > 0 ? '€ ' + euroShort(q * p) : '—'}</td></tr>) })}
                  <tr style={{ background: '#eff6ff' }}><td colSpan={3} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#1e3a8a' }}>Totale giornata</td><td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(totGiorno)}</td></tr></tbody></table>
                </div>) })}
              </div>)}
              <div style={{ marginBottom: 24 }}><p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderLeft: '4px solid #1e3a8a', paddingLeft: 8 }}>RIEPILOGO PER CATEGORIA</p>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}><thead><tr style={{ background: '#1e3a8a', color: 'white' }}><th style={{ padding: '8px 12px', textAlign: 'left' }}>Categoria</th><th style={{ padding: '8px 12px', textAlign: 'right' }}>Importo (€)</th><th style={{ padding: '8px 12px', textAlign: 'right' }}>% sul totale</th></tr></thead>
                <tbody>{Object.entries(riepilogoEsterno).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([cat, imp], idx) => (<tr key={cat} style={{ background: idx % 2 === 0 ? '#fff' : '#f8faff' }}><td style={{ padding: '8px 12px', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>{cat}</td><td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>€ {euroShort(imp)}</td><td style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', borderBottom: '1px solid #f1f5f9' }}>{totaleEsterno > 0 ? Math.round(imp / totaleEsterno * 100) : 0}%</td></tr>))}
                <tr style={{ background: '#1e3a8a', color: 'white' }}><td style={{ padding: '10px 12px', fontWeight: 800 }}>TOTALE COMPLESSIVO</td><td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#fbbf24' }}>€ {euroShort(totaleEsterno)}</td><td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>100%</td></tr></tbody></table>
              </div>
              {noteEsterna && (<div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 14px', marginBottom: 20, background: '#fffbeb' }}><p style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>NOTE</p><p style={{ fontSize: 11, color: '#374151' }}>{noteEsterna}</p></div>)}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 40, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
                <div><p style={{ fontSize: 10, color: '#6b7280', marginBottom: 28 }}>Per accettazione — Il Committente</p><div style={{ borderBottom: '1px solid #374151', width: 200 }}></div><p style={{ fontSize: 10, color: '#374151', marginTop: 4 }}>{progetto?.cliente_nome || '_______________'}</p></div>
                <div><p style={{ fontSize: 10, color: '#6b7280', marginBottom: 28 }}>Per BC General Service</p><div style={{ borderBottom: '1px solid #374151', width: 200 }}></div><p style={{ fontSize: 10, marginTop: 4 }}>{progetto?.geometra_nome || '_______________'}</p></div>
              </div>
            </div>
          </div>
        )}
      </div></div>)}

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body * { visibility: hidden !important; }
          ${printMode === 'interna' ? '#report-interna, #report-interna * { visibility: visible !important; }' : ''}
          ${printMode === 'esterna' ? '#report-esterno, #report-esterno * { visibility: visible !important; }' : ''}
          .fixed.inset-0 { position: static !important; background: none !important; padding: 0 !important; display: block !important; }
          .fixed.inset-0 > div { position: static !important; max-width: none !important; max-height: none !important; width: 100% !important; height: auto !important; border-radius: 0 !important; box-shadow: none !important; display: block !important; overflow: visible !important; }
          #report-interna, #report-esterno { position: static !important; width: 100% !important; max-height: none !important; height: auto !important; overflow: visible !important; padding: 0 !important; font-size: 10px !important; }
          .report-header { break-inside: avoid !important; break-after: avoid !important; page-break-inside: avoid !important; }
          .day-block, .month-block, .totals-block, .signatures-block { break-inside: avoid !important; page-break-inside: avoid !important; }
          .no-print { display: none !important; }
          .only-print { display: inline !important; }
        }
        .only-print { display: none; }
      `}</style>
    </div>
  )
}
