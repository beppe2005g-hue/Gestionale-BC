'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { logActivity } from '@/lib/logActivity'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const euroShort = (n: number) => (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const CATEGORIE = ['Ore Operai', 'Materiali', 'Noli mezzi', 'Manodopera esterna', 'Subappalto', 'Trasporti', 'Attrezzatura', 'Smaltimento', 'Altro', 'Personalizzato']

const CAT_COLORS: Record<string, string> = {
  'Ore Operai':         '#0f766e',
  'Materiali':          '#1d4ed8',
  'Noli mezzi':         '#7c3aed',
  'Manodopera esterna': '#0891b2',
  'Subappalto':         '#b45309',
  'Trasporti':          '#059669',
  'Attrezzatura':       '#dc2626',
  'Smaltimento':        '#9333ea',
  'Altro':              '#6b7280',
  'Personalizzato':     '#d97706',
}
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

export default function CostiCantiere() {
  const [tab, setTab] = useState<'costi' | 'ddt'>('costi')
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

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (progettoSel) { loadCosti(); loadDdt() } }, [progettoSel])

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
    const [{ data: p }, { data: f }] = await Promise.all([
      queryProgetti,
      supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale'),
    ])
    setProgetti(p || [])
    setFornitori(f || [])
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

  async function eliminaDdt(id: string) {
    if (!confirm('Eliminare questo DDT?')) return
    const ddt = ddts.find(d => d.id === id)
    await supabase.from('ddt').delete().eq('id', id)
    await logActivity('eliminazione', 'ddt', id, `DDT ${ddt?.numero} — ${ddt?.fornitore_nome} · ${ddt?.progetto_nome} · € ${ddt?.importo}`)
    loadDdt()
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

  // ── CONTABILITÀ INTERNA ──
  const datiInterna = useMemo(() => {
    const costiPer = meseInterna ? costi.filter(c => c.data?.startsWith(meseInterna)) : costi
    const giorniSet = new Set(costiPer.map(c => c.data).filter(Boolean))
    const giorni = Array.from(giorniSet).sort()
    const catPresenti = [...new Set(costiPer.map(c => c.categoria))].filter(Boolean)
    const matrice: Record<string, Record<string, number>> = {}
    catPresenti.forEach(cat => { matrice[cat] = {} })
    costiPer.forEach(c => {
      if (!matrice[c.categoria]) matrice[c.categoria] = {}
      matrice[c.categoria][c.data] = (matrice[c.categoria][c.data] || 0) + (c.importo || 0)
    })
    const totaliGiorno: Record<string, number> = {}
    giorni.forEach(g => { totaliGiorno[g] = catPresenti.reduce((s, cat) => s + (matrice[cat]?.[g] || 0), 0) })
    const totaliCategoria: Record<string, number> = {}
    catPresenti.forEach(cat => { totaliCategoria[cat] = giorni.reduce((s, g) => s + (matrice[cat]?.[g] || 0), 0) })
    const totaleGenerale = catPresenti.reduce((s, cat) => s + totaliCategoria[cat], 0)
    return { giorni, catPresenti, matrice, totaliGiorno, totaliCategoria, totaleGenerale }
  }, [costi, meseInterna])

  function apriInterna() {
    setMeseInterna(filtroMese || mesiDisponibili[0] || '')
    setRicaviPerCat({})
    setRicaviACorpo('')
    setUsaACorpo(false)
    setModalInterna(true)
  }

  const totaleRicaviPerCat = datiInterna.catPresenti.reduce((s, cat) => s + (parseFloat(ricaviPerCat[cat]) || 0), 0)
  const totaleRicaviFinale = usaACorpo ? (parseFloat(ricaviACorpo) || 0) : totaleRicaviPerCat
  const margineInterna = totaleRicaviFinale - datiInterna.totaleGenerale
  const marginePercInterna = totaleRicaviFinale > 0 ? Math.round(margineInterna / totaleRicaviFinale * 100) : 0

  // ── CONTABILITÀ ESTERNA ──
  async function apriEsterna() {
    const m = filtroMese || mesiDisponibili[0] || ''
    setMeseEsterna(m)
    setNoteEsterna('')
    setLoadingEsterna(true)

    // Carica prezzi salvati per questo cliente
    const clienteId = progetto?.cliente_id
    let prezziSalvati: Record<string, string> = {}
    if (clienteId) {
      const { data: pv } = await supabase.from('prezzi_vendita_cliente').select('*').eq('cliente_id', clienteId)
      if (pv) pv.forEach((r: any) => { prezziSalvati[r.categoria] = String(r.prezzo_vendita) })
    }
    setPrezziCliente(prezziSalvati)

    // Costruisce voci dai costi
    const costiPer = m ? costi.filter(c => c.data?.startsWith(m)) : costi
    const voci: VoceEsterna[] = costiPer.map(c => ({
      id: c.id,
      visibile: true,
      data: c.data,
      categoria: c.categoria,
      descrizione: c.descrizione || c.categoria,
      quantita: c.quantita || 1,
      quantita_mod: String(c.quantita || 1),
      prezzo_vendita: prezziSalvati[c.categoria] || '',
      importo_calcolato: 0,
      libera: false,
    }))
    setVociEsterne(voci)
    setLoadingEsterna(false)
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
    // Raccoglie prezzi usati per categoria
    const prezziUsati: Record<string, number> = {}
    vociEsterne.filter(v => v.visibile && v.prezzo_vendita).forEach(v => {
      if (!prezziUsati[v.categoria]) prezziUsati[v.categoria] = parseFloat(v.prezzo_vendita) || 0
    })
    // Upsert — sovrascrive sempre l'ultimo
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

  // Per riepilogo esterno per categoria
  const riepilogoEsterno = useMemo(() => {
    const m: Record<string, number> = {}
    vociVisibili.forEach(v => {
      const q = parseFloat(v.quantita_mod) || v.quantita || 1
      const p = parseFloat(v.prezzo_vendita) || 0
      m[v.categoria] = (m[v.categoria] || 0) + q * p
    })
    return m
  }, [vociEsterne])

  // Giorni per esterna
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
            {tab === 'costi'
              ? <button className="btn btn-primary" onClick={() => { const oggi = new Date().toISOString().split('T')[0]; setDataBase(oggi); setRighe([nuovaRiga(oggi)]); setModalCosto(true) }}>+ Inserisci costi</button>
              : <button className="btn btn-primary" onClick={() => setModalDdt(true)}>+ Inserisci DDT</button>
            }
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
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="text-xs text-blue-600 mb-1">Totale costi inseriti</p>
                <p className="text-xl font-semibold text-blue-800">{euro(totaleTutti)}</p>
                {filtroMese && tab === 'costi' && <p className="text-xs text-blue-500 mt-1">Mese: {euro(totale)}</p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Budget costi</p>
                <p className="text-xl font-semibold text-gray-800">{euro(progetto.budget_costi)}</p>
              </div>
              <div className={`rounded-xl p-4 border ${budgetPerc >= 100 ? 'bg-red-50 border-red-200' : budgetPerc >= 80 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <p className={`text-xs mb-1 ${budgetPerc >= 100 ? 'text-red-600' : budgetPerc >= 80 ? 'text-amber-600' : 'text-green-600'}`}>Budget utilizzato</p>
                <p className={`text-xl font-semibold ${budgetPerc >= 100 ? 'text-red-700' : budgetPerc >= 80 ? 'text-amber-700' : 'text-green-700'}`}>{budgetPerc}%</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                <p className="text-xs text-purple-600 mb-1">Totale DDT cantiere</p>
                <p className="text-xl font-semibold text-purple-800">{euro(totaleDdt)}</p>
                <p className="text-xs text-purple-500 mt-1">{ddts.length} DDT inseriti</p>
              </div>
            </div>

            <div className="flex gap-1 mb-4 border-b border-gray-200">
              <button onClick={() => setTab('costi')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'costi' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                💰 Costi giornalieri ({costi.length})
              </button>
              <button onClick={() => setTab('ddt')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'ddt' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                📋 DDT / Bolle ({ddts.length})
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
                          <td><button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaCosto(c.id)}>✕</button></td>
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

      {/* ── MODAL CONTABILITÀ INTERNA ── */}
      {modalInterna && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-xl w-full max-w-7xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 print:hidden">
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
                <button onClick={() => setModalInterna(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6" id="report-interna">
              {/* Header */}
              <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-800">
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
                  {progetto?.localita && <p style={{ fontSize: 11, color: '#6b7280' }}>📍 {progetto.localita}</p>}
                  <p style={{ fontSize: 11, color: '#6b7280' }}>Periodo: <strong>{meseInterna ? new Date(meseInterna + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : 'Tutti i mesi'}</strong></p>
                  <p style={{ fontSize: 11, color: '#6b7280' }}>Data: <strong>{new Date().toLocaleDateString('it-IT')}</strong></p>
                </div>
              </div>

              {/* Tabella costi per giorno */}
              <div className="overflow-x-auto mb-6">
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ background: '#1e3a8a', color: 'white', padding: '8px 12px', textAlign: 'left', minWidth: 140 }}>Categoria</th>
                      {datiInterna.giorni.map(g => (
                        <th key={g} style={{ background: '#1e40af', color: 'white', padding: '6px 8px', textAlign: 'center', minWidth: 70 }}>{fmt(g)}</th>
                      ))}
                      <th style={{ background: '#374151', color: 'white', padding: '8px 12px', textAlign: 'right', minWidth: 90 }}>TOT. COSTI</th>
                      <th style={{ background: '#065f46', color: 'white', padding: '8px 12px', textAlign: 'right', minWidth: 90 }}>TOT. RICAVI</th>
                      <th style={{ background: '#7c3aed', color: 'white', padding: '8px 12px', textAlign: 'right', minWidth: 80 }}>MARGINE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datiInterna.catPresenti.map((cat, idx) => {
                      const totCostiCat = datiInterna.totaliCategoria[cat] || 0
                      const ricavoCat = usaACorpo ? 0 : (parseFloat(ricaviPerCat[cat]) || 0)
                      const margineCat = usaACorpo ? 0 : ricavoCat - totCostiCat
                      return (
                        <tr key={cat} style={{ background: idx % 2 === 0 ? '#f8faff' : '#fff' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid #e2e8f0', color: CAT_COLORS[cat] || '#374151' }}>{cat}</td>
                          {datiInterna.giorni.map(g => (
                            <td key={g} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #f1f5f9' }}>
                              {datiInterna.matrice[cat]?.[g] ? <span style={{ fontWeight: 500, color: '#1e40af' }}>{euroShort(datiInterna.matrice[cat][g])}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                          ))}
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1e3a8a', background: '#eff6ff' }}>{euroShort(totCostiCat)}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                            {!usaACorpo && (
                              <input className="print:hidden" type="number" step="0.01" placeholder="—"
                                style={{ width: 80, textAlign: 'right', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}
                                value={ricaviPerCat[cat] || ''}
                                onChange={e => setRicaviPerCat(prev => ({ ...prev, [cat]: e.target.value }))} />
                            )}
                            <span className="hidden print:inline">{ricavoCat > 0 ? euroShort(ricavoCat) : '—'}</span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: !usaACorpo && margineCat >= 0 ? '#065f46' : '#991b1b', background: '#f5f3ff' }}>
                            {!usaACorpo && ricavoCat > 0 ? euroShort(margineCat) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                    {/* Totali */}
                    <tr style={{ background: '#1e3a8a' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'white' }}>TOTALE GIORNALIERO</td>
                      {datiInterna.giorni.map(g => (
                        <td key={g} style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: 'white' }}>
                          {datiInterna.totaliGiorno[g] > 0 ? euroShort(datiInterna.totaliGiorno[g]) : '—'}
                        </td>
                      ))}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#fbbf24' }}>{euroShort(datiInterna.totaleGenerale)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#6ee7b7' }}>{totaleRicaviFinale > 0 ? euroShort(totaleRicaviFinale) : '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: margineInterna >= 0 ? '#6ee7b7' : '#fca5a5' }}>
                        {totaleRicaviFinale > 0 ? euroShort(margineInterna) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Ricavi a corpo */}
              <div className="print:hidden card mb-4 border-green-200 bg-green-50">
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

              {/* Riepilogo finale */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div style={{ border: '2px solid #1e40af', borderRadius: 8, padding: 16, background: '#eff6ff' }}>
                  <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>TOTALE COSTI</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(datiInterna.totaleGenerale)}</p>
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

              {/* Firme */}
              <div className="grid grid-cols-2 gap-8 mt-8 pt-4 border-t border-gray-200">
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
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 print:hidden">
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
                <button className="btn btn-primary print:hidden" onClick={async () => { await salvaePrezziEsterna(); window.print() }}>🖨️ Salva prezzi e stampa</button>
                <button onClick={() => setModalEsterna(false)} className="text-gray-400 hover:text-gray-600 text-2xl print:hidden">×</button>
              </div>
            </div>

            {loadingEsterna ? (
              <div className="flex-1 flex items-center justify-center"><div className="text-gray-400">Caricamento...</div></div>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Pannello selezione voci (non stampato) */}
                <div className="print:hidden px-6 py-3 bg-gray-50 border-b border-gray-200">
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
                                <div className="flex items-center gap-1">
                                  <input className="input text-xs py-1" type="number" step="0.01" placeholder="€ vendita"
                                    value={v.prezzo_vendita}
                                    onChange={e => aggiornaVoceEsterna(v.id, 'prezzo_vendita', e.target.value)} />
                                </div>
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

                {/* DOCUMENTO STAMPABILE */}
                <div className="flex-1 overflow-auto p-6" id="report-esterno">
                  {/* Header documento */}
                  <div className="flex items-start justify-between mb-6 pb-4" style={{ borderBottom: '3px solid #1e3a8a' }}>
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
                        {progetto?.localita && <p style={{ fontSize: 10, color: '#6b7280' }}>📍 {progetto.localita}</p>}
                        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 6, marginBottom: 2 }}>PERIODO</p>
                        <p style={{ fontSize: 10, color: '#374151' }}>{meseEsterna ? new Date(meseEsterna + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : 'Tutti i mesi'}</p>
                        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>Data emissione: <strong>{new Date().toLocaleDateString('it-IT')}</strong></p>
                      </div>
                    </div>
                  </div>

                  {/* Tabella per giorni */}
                  {giorniEsterni.length > 0 && (
                    <div className="mb-6">
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderLeft: '4px solid #1e3a8a', paddingLeft: 8 }}>DETTAGLIO LAVORAZIONI PER GIORNATA</p>
                      {giorniEsterni.map(giorno => {
                        const vociGiorno = vociVisibili.filter(v => v.data === giorno)
                        if (vociGiorno.length === 0) return null
                        const totGiorno = vociGiorno.reduce((s, v) => s + (parseFloat(v.quantita_mod) || 1) * (parseFloat(v.prezzo_vendita) || 0), 0)
                        return (
                          <div key={giorno} style={{ marginBottom: 12 }}>
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

                  {/* Riepilogo per categoria */}
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

                  {/* Note */}
                  {noteEsterna && (
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 14px', marginBottom: 20, background: '#fffbeb' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>NOTE</p>
                      <p style={{ fontSize: 11, color: '#374151' }}>{noteEsterna}</p>
                    </div>
                  )}

                  {/* Firme */}
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

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-interna, #report-interna *, #report-esterno, #report-esterno * { visibility: visible; }
          #report-interna, #report-esterno { position: fixed; top: 0; left: 0; width: 100%; padding: 16px; font-size: 10px; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}

interface RigaCosto {
  id: string
  data: string
  categoria: string
  categoria_personalizzata: string
  descrizione: string
  quantita: string
  prezzo_unitario: string
  importo: string
  note: string
}

function nuovaRiga(data: string): RigaCosto {
  return { id: Math.random().toString(36).slice(2), data, categoria: 'Ore Operai', categoria_personalizzata: '', descrizione: '', quantita: '', prezzo_unitario: '', importo: '', note: '' }
}

const statoBadge = (s: string) => {
  if (s === 'Fatturato') return <span className="badge badge-green">Fatturato</span>
  if (s === 'Parziale') return <span className="badge badge-amber">Parziale</span>
  return <span className="badge badge-amber">Da Fatturare</span>
}

export default function CostiCantiere() {
  const [tab, setTab] = useState<'costi' | 'ddt'>('costi')
  const [progetti, setProgetti] = useState<any[]>([])
  const [progettoSel, setProgettoSel] = useState('')
  const [utente, setUtente] = useState<any>(null)
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
  const [modalContabilita, setModalContabilita] = useState(false)
  const [meseContabilita, setMeseContabilita] = useState('')

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (progettoSel) { loadCosti(); loadDdt() } }, [progettoSel])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    let profilo: any = null
    if (user) {
      const { data: p } = await supabase.from('utenti').select('*').eq('id', user.id).single()
      profilo = p
      setUtente({ ...user, profilo: p })
    }
    const soloAssegnati = profilo?.perm_solo_cantieri_assegnati === true
    let queryProgetti = supabase.from('progetti').select('id,codice,nome,geometra_id,geometra_nome,budget_costi,valore_contratto').eq('stato', 'In Corso').order('codice')
    if (soloAssegnati && user) queryProgetti = queryProgetti.eq('geometra_id', user.id)
    const [{ data: p }, { data: f }] = await Promise.all([
      queryProgetti,
      supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale'),
    ])
    setProgetti(p || [])
    setFornitori(f || [])
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

  function eliminaRiga(id: string) {
    if (righe.length === 1) return
    setRighe(prev => prev.filter(r => r.id !== id))
  }

  function apriModalCosto() {
    const oggi = new Date().toISOString().split('T')[0]
    setDataBase(oggi)
    setRighe([nuovaRiga(oggi)])
    setModalCosto(true)
  }

  async function salvaCosti() {
    const righeValide = righe.filter(r => r.importo && parseFloat(r.importo) > 0)
    if (righeValide.length === 0) { alert('Inserisci almeno un costo con importo'); return }
    if (!progettoSel) { alert('Seleziona un cantiere'); return }
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
      await logActivity('inserimento', 'costi_cantiere', inserted?.id || '', `${categoriaEffettiva} — ${prj?.codice} ${prj?.nome} · € ${r.importo}${r.descrizione ? ' · ' + r.descrizione : ''}`)
    }
    setModalCosto(false)
    setLoadingCosto(false)
    loadCosti()
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

  async function eliminaDdt(id: string) {
    if (!confirm('Eliminare questo DDT?')) return
    const ddt = ddts.find(d => d.id === id)
    await supabase.from('ddt').delete().eq('id', id)
    await logActivity('eliminazione', 'ddt', id, `DDT ${ddt?.numero} — ${ddt?.fornitore_nome} · ${ddt?.progetto_nome} · € ${ddt?.importo}`)
    loadDdt()
  }

  const progetto = progetti.find(p => p.id === progettoSel)
  const costiFiltrati = useMemo(() => filtroMese ? costi.filter(c => c.data?.startsWith(filtroMese)) : costi, [costi, filtroMese])
  const totalePerCategoria = useMemo(() => {
    const mappa: Record<string, number> = {}
    costiFiltrati.forEach(c => { mappa[c.categoria] = (mappa[c.categoria] || 0) + (c.importo || 0) })
    return mappa
  }, [costiFiltrati])
  const totale = costiFiltrati.reduce((s, c) => s + (c.importo || 0), 0)
  const totaleTutti = costi.reduce((s, c) => s + (c.importo || 0), 0)
  const budgetPerc = progetto?.budget_costi > 0 ? Math.round(totaleTutti / progetto.budget_costi * 100) : 0
  const mesiDisponibili = useMemo(() => {
    const mesi = new Set(costi.map(c => c.data?.substring(0, 7)).filter(Boolean))
    return Array.from(mesi).sort().reverse()
  }, [costi])
  const totaleDdt = ddts.reduce((s, d) => s + (d.importo || 0), 0)

  const datiContabilita = useMemo(() => {
    const costiPerReport = meseContabilita ? costi.filter(c => c.data?.startsWith(meseContabilita)) : costi
    const giorniSet = new Set(costiPerReport.map(c => c.data).filter(Boolean))
    const giorni = Array.from(giorniSet).sort()
    const catPresenti = [...new Set(costiPerReport.map(c => c.categoria))].filter(Boolean)
    const matrice: Record<string, Record<string, number>> = {}
    catPresenti.forEach(cat => { matrice[cat] = {} })
    costiPerReport.forEach(c => {
      if (!matrice[c.categoria]) matrice[c.categoria] = {}
      matrice[c.categoria][c.data] = (matrice[c.categoria][c.data] || 0) + (c.importo || 0)
    })
    const totaliGiorno: Record<string, number> = {}
    giorni.forEach(g => { totaliGiorno[g] = catPresenti.reduce((s, cat) => s + (matrice[cat][g] || 0), 0) })
    const totaliCategoria: Record<string, number> = {}
    catPresenti.forEach(cat => { totaliCategoria[cat] = giorni.reduce((s, g) => s + (matrice[cat][g] || 0), 0) })
    const totaleGenerale = catPresenti.reduce((s, cat) => s + totaliCategoria[cat], 0)
    return { giorni, catPresenti, matrice, totaliGiorno, totaliCategoria, totaleGenerale }
  }, [costi, meseContabilita])

  const totaleRighe = righe.reduce((s, r) => s + (parseFloat(r.importo) || 0), 0)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Costi cantiere giornalieri</h1>
          <div className="flex gap-2">
            {tab === 'costi' && costi.length > 0 && (
              <button className="btn" onClick={() => { setMeseContabilita(filtroMese || mesiDisponibili[0] || ''); setModalContabilita(true) }}>📊 Crea Contabilità</button>
            )}
            {tab === 'costi'
              ? <button className="btn btn-primary" onClick={apriModalCosto}>+ Inserisci costi</button>
              : <button className="btn btn-primary" onClick={() => setModalDdt(true)}>+ Inserisci DDT</button>
            }
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
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="text-xs text-blue-600 mb-1">Totale costi inseriti</p>
                <p className="text-xl font-semibold text-blue-800">{euro(totaleTutti)}</p>
                {filtroMese && tab === 'costi' && <p className="text-xs text-blue-500 mt-1">Mese: {euro(totale)}</p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Budget costi</p>
                <p className="text-xl font-semibold text-gray-800">{euro(progetto.budget_costi)}</p>
              </div>
              <div className={`rounded-xl p-4 border ${budgetPerc >= 100 ? 'bg-red-50 border-red-200' : budgetPerc >= 80 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <p className={`text-xs mb-1 ${budgetPerc >= 100 ? 'text-red-600' : budgetPerc >= 80 ? 'text-amber-600' : 'text-green-600'}`}>Budget utilizzato</p>
                <p className={`text-xl font-semibold ${budgetPerc >= 100 ? 'text-red-700' : budgetPerc >= 80 ? 'text-amber-700' : 'text-green-700'}`}>{budgetPerc}%</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                <p className="text-xs text-purple-600 mb-1">Totale DDT cantiere</p>
                <p className="text-xl font-semibold text-purple-800">{euro(totaleDdt)}</p>
                <p className="text-xs text-purple-500 mt-1">{ddts.length} DDT inseriti</p>
              </div>
            </div>

            <div className="flex gap-1 mb-4 border-b border-gray-200">
              <button onClick={() => setTab('costi')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'costi' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                💰 Costi giornalieri ({costi.length})
              </button>
              <button onClick={() => setTab('ddt')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'ddt' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                📋 DDT / Bolle ({ddts.length})
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
                          <td><button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminaCosto(c.id)}>✕</button></td>
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
          </>
        )}
      </main>

      {/* Modal costi multi-riga */}
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
              <label className="label mb-0">Data di default per le righe:</label>
              <input className="input w-40" type="date" value={dataBase}
                onChange={e => {
                  setDataBase(e.target.value)
                  setRighe(prev => prev.map(r => ({ ...r, data: e.target.value })))
                }} />
              <span className="text-xs text-gray-400">(puoi cambiare la data singolarmente per ogni riga)</span>
            </div>

            <div className="overflow-x-auto mb-3">
              <table className="table-base" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Data</th>
                    <th style={{ width: 160 }}>Categoria</th>
                    <th>Descrizione</th>
                    <th style={{ width: 80 }}>Qtà</th>
                    <th style={{ width: 90 }}>€/unit</th>
                    <th style={{ width: 100 }}>Importo *</th>
                    <th style={{ width: 140 }}>Note</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r, idx) => (
                    <tr key={r.id}>
                      <td>
                        <input className="input text-xs py-1" type="date" value={r.data}
                          onChange={e => aggiornaRiga(r.id, 'data', e.target.value)} />
                      </td>
                      <td>
                        <select className="input text-xs py-1" value={r.categoria}
                          onChange={e => aggiornaRiga(r.id, 'categoria', e.target.value)}>
                          {CATEGORIE.map(c => <option key={c}>{c}</option>)}
                        </select>
                        {r.categoria === 'Personalizzato' && (
                          <input className="input text-xs py-1 mt-1" placeholder="Nome categoria..."
                            value={r.categoria_personalizzata}
                            onChange={e => aggiornaRiga(r.id, 'categoria_personalizzata', e.target.value)} />
                        )}
                      </td>
                      <td>
                        <input className="input text-xs py-1" placeholder="es. Operaio, calcestruzzo..."
                          value={r.descrizione}
                          onChange={e => aggiornaRiga(r.id, 'descrizione', e.target.value)} />
                      </td>
                      <td>
                        <input className="input text-xs py-1" type="number" step="0.01" placeholder="es. 8"
                          value={r.quantita}
                          onChange={e => aggiornaRiga(r.id, 'quantita', e.target.value)} />
                      </td>
                      <td>
                        <input className="input text-xs py-1" type="number" step="0.01" placeholder="es. 25"
                          value={r.prezzo_unitario}
                          onChange={e => aggiornaRiga(r.id, 'prezzo_unitario', e.target.value)} />
                      </td>
                      <td>
                        <input className="input text-xs py-1 font-semibold text-blue-800" type="number" step="0.01" placeholder="0.00"
                          value={r.importo}
                          onChange={e => aggiornaRiga(r.id, 'importo', e.target.value)} />
                      </td>
                      <td>
                        <input className="input text-xs py-1" placeholder="Note..."
                          value={r.note}
                          onChange={e => aggiornaRiga(r.id, 'note', e.target.value)} />
                      </td>
                      <td>
                        <button className="text-gray-300 hover:text-red-500 text-sm" onClick={() => eliminaRiga(r.id)} disabled={righe.length === 1}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <button className="btn btn-sm" onClick={() => setRighe(prev => [...prev, nuovaRiga(dataBase)])}>+ Aggiungi riga</button>
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-gray-700">
                  Totale: <span className="text-blue-800">{euro(totaleRighe)}</span>
                  {' '}({righe.filter(r => parseFloat(r.importo) > 0).length} voci)
                </span>
                <button className="btn" onClick={() => setModalCosto(false)}>Annulla</button>
                <button className="btn btn-primary" onClick={salvaCosti} disabled={loadingCosto}>
                  {loadingCosto ? 'Salvataggio...' : `Salva ${righe.filter(r => parseFloat(r.importo) > 0).length} costi`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal DDT */}
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

      {/* Modal Contabilità */}
      {modalContabilita && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-xl w-full max-w-7xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 print:hidden">
              <div>
                <h2 className="text-base font-semibold">📊 Contabilità cantiere</h2>
                <p className="text-xs text-gray-500 mt-0.5">{progetto?.codice} — {progetto?.nome}</p>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <label className="label">Periodo</label>
                  <select className="input w-auto text-sm" value={meseContabilita} onChange={e => setMeseContabilita(e.target.value)}>
                    <option value="">Tutti i mesi</option>
                    {mesiDisponibili.map(m => (
                      <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Stampa / PDF</button>
                <button onClick={() => setModalContabilita(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6" id="report-contabilita">
              <div className="mb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">BC General Service</h1>
                    <h2 className="text-lg font-semibold text-gray-700 mt-1">Contabilità cantiere</h2>
                    <p className="text-sm text-gray-600 mt-1">{progetto?.codice} — {progetto?.nome}</p>
                    {progetto?.localita && <p className="text-sm text-gray-500">📍 {progetto.localita}</p>}
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <p>Geometra: <strong>{progetto?.geometra_nome || '—'}</strong></p>
                    <p>Periodo: <strong>{meseContabilita ? new Date(meseContabilita + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : 'Tutti i mesi'}</strong></p>
                    <p>Stampato il: <strong>{new Date().toLocaleDateString('it-IT')}</strong></p>
                  </div>
                </div>
              </div>
              {datiContabilita.giorni.length === 0 ? (
                <p className="text-gray-400 text-center py-12">Nessun costo nel periodo selezionato.</p>
              ) : (
                <>
                  <div className="overflow-x-auto mb-6">
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                      <thead>
                        <tr>
                          <th style={{ background: '#1e3a8a', color: 'white', padding: '8px 12px', textAlign: 'left', minWidth: 140, position: 'sticky', left: 0, zIndex: 2, fontWeight: 600 }}>Categoria</th>
                          {datiContabilita.giorni.map(g => (
                            <th key={g} style={{ background: '#1e40af', color: 'white', padding: '6px 8px', textAlign: 'center', minWidth: 80, fontWeight: 500 }}>
                              {new Date(g).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                            </th>
                          ))}
                          <th style={{ background: '#1e3a8a', color: 'white', padding: '8px 12px', textAlign: 'right', minWidth: 100, fontWeight: 700 }}>TOTALE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datiContabilita.catPresenti.map((cat, idx) => (
                          <tr key={cat} style={{ background: idx % 2 === 0 ? '#f8faff' : '#ffffff' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid #e2e8f0', position: 'sticky', left: 0, background: 'inherit', color: CAT_COLORS[cat] || '#374151' }}>{cat}</td>
                            {datiContabilita.giorni.map(g => (
                              <td key={g} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #f1f5f9' }}>
                                {datiContabilita.matrice[cat][g] ? <span style={{ fontWeight: 500, color: '#1e40af' }}>{euroShort(datiContabilita.matrice[cat][g])}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                              </td>
                            ))}
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid #e2e8f0', background: '#eff6ff', color: '#1e3a8a' }}>{euroShort(datiContabilita.totaliCategoria[cat])}</td>
                          </tr>
                        ))}
                        <tr style={{ background: '#1e3a8a' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: 'white', position: 'sticky', left: 0, background: '#1e3a8a' }}>TOTALE GIORNALIERO</td>
                          {datiContabilita.giorni.map(g => (
                            <td key={g} style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: 'white', borderLeft: '1px solid #2d4fa0' }}>
                              {datiContabilita.totaliGiorno[g] > 0 ? euroShort(datiContabilita.totaliGiorno[g]) : '—'}
                            </td>
                          ))}
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#fbbf24', fontSize: 13 }}>{euroShort(datiContabilita.totaleGenerale)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div style={{ border: '2px solid #1e40af', borderRadius: 8, padding: 16 }}>
                      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Totale costi periodo</p>
                      <p style={{ fontSize: 20, fontWeight: 800, color: '#1e3a8a' }}>€ {euroShort(datiContabilita.totaleGenerale)}</p>
                    </div>
                    <div style={{ border: '2px solid #059669', borderRadius: 8, padding: 16 }}>
                      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Giorni lavorati</p>
                      <p style={{ fontSize: 20, fontWeight: 800, color: '#065f46' }}>{datiContabilita.giorni.length}</p>
                    </div>
                    <div style={{ border: '2px solid #7c3aed', borderRadius: 8, padding: 16 }}>
                      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Costo medio giornaliero</p>
                      <p style={{ fontSize: 20, fontWeight: 800, color: '#5b21b6' }}>€ {euroShort(datiContabilita.giorni.length > 0 ? datiContabilita.totaleGenerale / datiContabilita.giorni.length : 0)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-8 mt-8 pt-4 border-t border-gray-200">
                    <div>
                      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 32 }}>Firma geometra</p>
                      <div style={{ borderBottom: '1px solid #374151', width: 200 }}></div>
                      <p style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>{progetto?.geometra_nome || '_______________'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 32 }}>Firma responsabile</p>
                      <div style={{ borderBottom: '1px solid #374151', width: 200 }}></div>
                      <p style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>BC General Service</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-contabilita, #report-contabilita * { visibility: visible; }
          #report-contabilita { position: fixed; top: 0; left: 0; width: 100%; padding: 16px; font-size: 10px; }
          #report-contabilita table { page-break-inside: auto; }
          #report-contabilita tr { page-break-inside: avoid; page-break-after: auto; }
          #report-contabilita thead { display: table-header-group; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
