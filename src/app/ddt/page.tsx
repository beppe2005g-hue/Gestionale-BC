'use client'
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { logActivity } from '@/lib/logActivity'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MACRO_CATEGORIE = ['Cementi','Laterizi','Ferro e Acciaio','Legno','Isolanti','Impermeabilizzanti','Inerti e Calcestruzzo','Impianti','Attrezzatura','Noli','Trasporti','Altro']
type Societa = 'BC General Service' | 'Filosofia'

interface Voce {
  id?: string
  descrizione: string; macro_categoria: string; categoria: string
  unita_misura: string; quantita: number; prezzo_unitario: number; importo_totale: number
}

// ── VOCE ROW ── definita FUORI dal componente per evitare re-mount ad ogni render
const VoceRow = React.memo(({ voce, idx, onUpdate, onDelete }: {
  voce: Voce; idx: number
  onUpdate: (idx: number, campo: string, valore: any) => void
  onDelete: (idx: number) => void
}) => {
  const [local, setLocal] = React.useState({ ...voce })
  React.useEffect(() => { setLocal({ ...voce }) }, [voce.id])

  function set(campo: string, valore: any) {
    setLocal(prev => {
      const n = { ...prev, [campo]: valore }
      if (campo === 'quantita' || campo === 'prezzo_unitario') {
        const q = campo === 'quantita' ? parseFloat(valore) || 0 : parseFloat(String(prev.quantita)) || 0
        const pu = campo === 'prezzo_unitario' ? parseFloat(valore) || 0 : parseFloat(String(prev.prezzo_unitario)) || 0
        n.importo_totale = Math.round(q * pu * 100) / 100
      }
      return n
    })
  }

  function flush(campo: string) {
    setLocal(prev => {
      onUpdate(idx, campo, prev[campo as keyof typeof prev])
      if (campo === 'quantita' || campo === 'prezzo_unitario') {
        onUpdate(idx, 'importo_totale', prev.importo_totale)
      }
      return prev
    })
  }

  return (
    <tr>
      <td><input className="input text-xs py-1" value={local.descrizione || ''} onChange={e => set('descrizione', e.target.value)} onBlur={() => flush('descrizione')} /></td>
      <td><select className="input text-xs py-1" value={local.macro_categoria || 'Altro'} onChange={e => { set('macro_categoria', e.target.value); onUpdate(idx, 'macro_categoria', e.target.value) }}>
        {MACRO_CATEGORIE.map(m => <option key={m}>{m}</option>)}
      </select></td>
      <td><input className="input text-xs py-1 w-14" value={local.unita_misura || ''} onChange={e => set('unita_misura', e.target.value)} onBlur={() => flush('unita_misura')} /></td>
      <td><input className="input text-xs py-1 w-20" type="number" step="0.001" value={local.quantita || ''} onChange={e => set('quantita', e.target.value)} onBlur={() => flush('quantita')} /></td>
      <td><input className="input text-xs py-1 w-24" type="number" step="0.0001" value={local.prezzo_unitario || ''} onChange={e => set('prezzo_unitario', e.target.value)} onBlur={() => flush('prezzo_unitario')} /></td>
      <td className="font-medium text-sm text-blue-700">{euro(local.importo_totale || 0)}</td>
      <td><button type="button" className="text-gray-300 hover:text-red-500 text-lg px-1 font-bold" onClick={() => onDelete(idx)}>×</button></td>
    </tr>
  )
})
VoceRow.displayName = 'VoceRow'

// ── FORM VOCI ── definita FUORI dal componente per evitare re-mount
const FormVoci = React.memo(({ voci, onAdd, onUpdate, onDelete }: {
  voci: Voce[]
  onAdd: () => void
  onUpdate: (idx: number, campo: string, valore: any) => void
  onDelete: (idx: number) => void
}) => {
  const totale = voci.reduce((s, v) => s + (v.importo_totale || 0), 0)
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-600">📦 Voci ({voci.length})</h3>
        <button type="button" className="btn btn-sm btn-primary" onClick={onAdd}>+ Voce</button>
      </div>
      {voci.length === 0 ? (
        <p className="text-xs text-gray-400 py-3 text-center border border-dashed rounded-lg">Nessuna voce. Clicca "+ Voce" per aggiungerne.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr>
              <th>Descrizione</th><th>Categoria</th><th>U.M.</th><th>Qtà</th><th>€/unit</th><th>Totale</th><th></th>
            </tr></thead>
            <tbody>
              {voci.map((v, idx) => (
                <VoceRow key={v.id || `new-${idx}`} voce={v} idx={idx} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-2 pt-2 border-t border-gray-100">
            <span className="font-semibold text-sm">Totale: <span className="text-blue-700">{euro(totale)}</span></span>
          </div>
        </div>
      )}
    </div>
  )
})
FormVoci.displayName = 'FormVoci'

// ── SOCIETA TOGGLE ── definita FUORI dal componente
const SocietaToggle = React.memo(({ value, onChange }: { value: Societa; onChange: (s: Societa) => void }) => (
  <div className="col-span-2 md:col-span-4">
    <label className="label">Società *</label>
    <div className="flex gap-2">
      {(['BC General Service', 'Filosofia'] as Societa[]).map(s => (
        <button key={s} type="button" onClick={() => onChange(s)}
          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
            value === s
              ? s === 'Filosofia' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
          }`}>
          {s === 'BC General Service' ? '🏗 BC General Service' : '🏢 Filosofia'}
        </button>
      ))}
    </div>
  </div>
))
SocietaToggle.displayName = 'SocietaToggle'

export default function DDTPage() {
  const [ddts, setDdts] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [progetti, setProgetti] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [modalDettaglio, setModalDettaglio] = useState<any>(null)
  const [vociDettaglio, setVociDettaglio] = useState<Voce[]>([])
  const [modalModifica, setModalModifica] = useState(false)
  const [loading, setLoading] = useState(false)
  const [societaAttiva, setSocietaAttiva] = useState<Societa>('BC General Service')
  const [tabFatturazione, setTabFatturazione] = useState<'da_fatturare'|'fatturati'>('da_fatturare')
  const [cercaNumero, setCercaNumero] = useState('')
  const [cercaFornitore, setCercaFornitore] = useState('')
  const [filtroStato, setFiltroStato] = useState('tutti')
  const [dataDA, setDataDA] = useState('')
  const [dataA, setDataA] = useState('')
  const [form, setForm] = useState({
    data: '', numero: '', fornitore_id: '', progetto_id: '',
    descrizione: '', mese_fattura_previsto: '', note: '',
    societa: 'BC General Service' as Societa
  })
  const [voci, setVoci] = useState<Voce[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: d }, { data: f }, { data: p }] = await Promise.all([
      supabase.from('ddt').select('*').order('data', { ascending: false }),
      supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale'),
      supabase.from('progetti').select('id,codice,nome,societa').eq('stato', 'In Corso').order('nome'),
    ])
    setDdts(d || [])
    setFornitori(f || [])
    setProgetti(p || [])
  }

  // useCallback per evitare che le funzioni cambino reference ad ogni render
  const aggiungiVoce = useCallback(() => {
    setVoci(prev => [...prev, { descrizione: '', macro_categoria: 'Altro', categoria: '', unita_misura: '', quantita: 0, prezzo_unitario: 0, importo_totale: 0 }])
  }, [])

  const aggiornaVoce = useCallback((idx: number, campo: string, valore: any) => {
    setVoci(prev => {
      const n = [...prev]
      n[idx] = { ...n[idx], [campo]: valore }
      return n
    })
  }, [])

  const eliminaVoceForm = useCallback((idx: number) => {
    setVoci(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const totaleVoci = useMemo(() => voci.reduce((s, v) => s + (v.importo_totale || 0), 0), [voci])

  async function salva() {
    if (!form.numero || !form.fornitore_id) { alert('Compilare N° DDT e fornitore'); return }
    const vociValide = voci.filter(v => v.descrizione)
    if (vociValide.length === 0) { alert('Inserisci almeno una voce con descrizione'); return }
    const importoTotale = vociValide.reduce((s, v) => s + (v.importo_totale || 0), 0)
    setLoading(true)
    const for_ = fornitori.find(f => f.id === form.fornitore_id)
    const prj = progetti.find(p => p.id === form.progetto_id)
    const { data: inserted, error } = await supabase.from('ddt').insert({
      data: form.data || new Date().toISOString().split('T')[0],
      numero: form.numero, fornitore_id: form.fornitore_id,
      fornitore_nome: for_?.ragione_sociale || '',
      progetto_id: form.progetto_id || null,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: form.descrizione || `DDT con ${vociValide.length} voci`,
      importo: importoTotale, mese_fattura_previsto: form.mese_fattura_previsto,
      stato: 'Da Fatturare', note: form.note, societa: form.societa,
    }).select('id').single()
    if (error) { alert('Errore: ' + error.message); setLoading(false); return }
    for (const v of vociValide) {
      await supabase.from('ddt_voci').insert({
        ddt_id: inserted!.id, descrizione: v.descrizione, categoria: v.categoria,
        macro_categoria: v.macro_categoria, unita_misura: v.unita_misura,
        quantita: v.quantita, prezzo_unitario: v.prezzo_unitario, importo_totale: v.importo_totale,
        fornitore_id: form.fornitore_id, fornitore_nome: for_?.ragione_sociale || '',
        data_ddt: form.data || new Date().toISOString().split('T')[0]
      })
    }
    await logActivity('inserimento', 'ddt', inserted?.id || '', `DDT ${form.numero} — ${for_?.ragione_sociale} · € ${importoTotale} [${form.societa}]`)
    setModal(false)
    setForm({ data: '', numero: '', fornitore_id: '', progetto_id: '', descrizione: '', mese_fattura_previsto: '', note: '', societa: societaAttiva })
    setVoci([])
    load()
    setLoading(false)
  }

  async function apriDettaglio(d: any) {
    setModalDettaglio(d)
    const { data: v } = await supabase.from('ddt_voci').select('*').eq('ddt_id', d.id).order('id')
    setVociDettaglio(v || [])
  }

  function apriModifica(d: any) {
    setForm({
      data: d.data, numero: d.numero, fornitore_id: d.fornitore_id || '',
      progetto_id: d.progetto_id || '', descrizione: d.descrizione || '',
      mese_fattura_previsto: d.mese_fattura_previsto || '', note: d.note || '',
      societa: d.societa || 'BC General Service'
    })
    setModalDettaglio(d)
    setModalModifica(true)
    supabase.from('ddt_voci').select('*').eq('ddt_id', d.id).order('id').then(({ data }) => {
      setVoci((data || []).map((v: any) => ({ ...v })))
      setVociDettaglio(data || [])
    })
  }

  async function salvaModifica() {
    if (!modalDettaglio) return
    if (!form.numero || !form.fornitore_id) { alert('Compilare N° DDT e fornitore'); return }
    setLoading(true)
    const for_ = fornitori.find(f => f.id === form.fornitore_id)
    const prj = progetti.find(p => p.id === form.progetto_id)
    const vociValide = voci.filter(v => v.descrizione)
    const importoTotale = vociValide.reduce((s, v) => s + (v.importo_totale || 0), 0)
    await supabase.from('ddt').update({
      data: form.data, numero: form.numero, fornitore_id: form.fornitore_id,
      fornitore_nome: for_?.ragione_sociale || '', progetto_id: form.progetto_id || null,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: form.descrizione || `DDT con ${vociValide.length} voci`,
      importo: importoTotale, mese_fattura_previsto: form.mese_fattura_previsto,
      note: form.note, societa: form.societa,
    }).eq('id', modalDettaglio.id)
    await supabase.from('ddt_voci').delete().eq('ddt_id', modalDettaglio.id)
    for (const v of vociValide) {
      await supabase.from('ddt_voci').insert({
        ddt_id: modalDettaglio.id, descrizione: v.descrizione, categoria: v.categoria,
        macro_categoria: v.macro_categoria, unita_misura: v.unita_misura,
        quantita: v.quantita, prezzo_unitario: v.prezzo_unitario, importo_totale: v.importo_totale,
        fornitore_id: form.fornitore_id, fornitore_nome: for_?.ragione_sociale || '', data_ddt: form.data
      })
    }
    await logActivity('modifica', 'ddt', modalDettaglio.id, `DDT ${form.numero} — ${for_?.ragione_sociale} · € ${importoTotale} [${form.societa}]`)
    setModalModifica(false); setModalDettaglio(null); setVoci([]); setLoading(false)
    load()
  }

  async function elimina(id: string) {
    if (!confirm('Eliminare questo DDT e tutte le sue voci?')) return
    const ddt = ddts.find(d => d.id === id)
    await supabase.from('ddt_voci').delete().eq('ddt_id', id)
    await supabase.from('ddt').delete().eq('id', id)
    await logActivity('eliminazione', 'ddt', id, `DDT ${ddt?.numero} — ${ddt?.fornitore_nome} · € ${ddt?.importo}`)
    setModalDettaglio(null)
    load()
  }

  function resetFiltri() { setCercaNumero(''); setCercaFornitore(''); setFiltroStato('tutti'); setDataDA(''); setDataA('') }

  const filtered = useMemo(() => ddts.filter(d => {
    if ((d.societa || 'BC General Service') !== societaAttiva) return false
    // Tab fatturazione
    if (tabFatturazione === 'da_fatturare' && d.stato === 'Fatturato') return false
    if (tabFatturazione === 'fatturati' && d.stato !== 'Fatturato') return false
    if (cercaNumero && !d.numero?.toLowerCase().includes(cercaNumero.toLowerCase())) return false
    if (cercaFornitore && !d.fornitore_nome?.toLowerCase().includes(cercaFornitore.toLowerCase())) return false
    if (tabFatturazione === 'da_fatturare' && filtroStato !== 'tutti' && d.stato !== filtroStato) return false
    if (dataDA && d.data < dataDA) return false
    if (dataA && d.data > dataA) return false
    return true
  }), [ddts, societaAttiva, tabFatturazione, cercaNumero, cercaFornitore, filtroStato, dataDA, dataA])

  const hasFiltriAttivi = cercaNumero || cercaFornitore || filtroStato !== 'tutti' || dataDA || dataA
  const totaleFiltered = useMemo(() => filtered.reduce((s, d) => s + (d.importo || 0), 0), [filtered])
  const nBC = useMemo(() => ddts.filter(d => (d.societa || 'BC General Service') === 'BC General Service').length, [ddts])
  const nFil = useMemo(() => ddts.filter(d => d.societa === 'Filosofia').length, [ddts])
  const progettiSocieta = useMemo(() => progetti.filter(p => (p.societa || 'BC General Service') === form.societa), [progetti, form.societa])

  const statoBadge = (s: string) => {
    if (s === 'Fatturato') return <span className="badge badge-green">Fatturato</span>
    if (s === 'Parziale') return <span className="badge badge-amber">Parziale</span>
    return <span className="badge badge-amber">Da Fatturare</span>
  }

  function chiudiModali() { setModal(false); setModalDettaglio(null); setModalModifica(false); setVoci([]); setVociDettaglio([]) }

  function apriNuovoDDT() {
    setForm({ data: '', numero: '', fornitore_id: '', progetto_id: '', descrizione: '', mese_fattura_previsto: '', note: '', societa: societaAttiva })
    setVoci([])
    setModal(true)
  }

  // Callback stabile per SocietaToggle nel form
  const handleSocietaChange = useCallback((s: Societa) => {
    setForm(f => ({ ...f, societa: s, progetto_id: '' }))
  }, [])

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">DDT / Bolle di consegna</h1>
          <button className="btn btn-primary text-sm" onClick={apriNuovoDDT}>+ Nuovo DDT</button>
        </div>

        <div className="flex gap-2 mb-4">
          {(['BC General Service', 'Filosofia'] as Societa[]).map(soc => (
            <button key={soc} onClick={() => setSocietaAttiva(soc)}
              className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                soc === 'BC General Service'
                  ? societaAttiva === soc ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-blue-50 text-blue-700 border-blue-300'
                  : societaAttiva === soc ? 'bg-orange-500 text-white border-orange-500 shadow' : 'bg-orange-50 text-orange-700 border-orange-300'
              }`}>
              {soc === 'BC General Service' ? '🏗' : '🏢'} {soc}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${societaAttiva === soc ? 'bg-white/20' : 'bg-white'}`}>
                {soc === 'BC General Service' ? nBC : nFil}
              </span>
            </button>
          ))}
        </div>

        {/* Tab Da Fatturare / Fatturati */}
        <div className="flex gap-0 mb-4 border-b border-gray-200">
          <button onClick={() => setTabFatturazione('da_fatturare')}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px mr-1 transition-colors ${tabFatturazione === 'da_fatturare' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            ⏳ Da Fatturare
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${tabFatturazione === 'da_fatturare' ? 'bg-amber-100' : 'bg-gray-100'}`}>
              {ddts.filter(d => (d.societa||'BC General Service')===societaAttiva && d.stato !== 'Fatturato').length}
            </span>
          </button>
          <button onClick={() => setTabFatturazione('fatturati')}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tabFatturazione === 'fatturati' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            ✅ Fatturati
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${tabFatturazione === 'fatturati' ? 'bg-green-100' : 'bg-gray-100'}`}>
              {ddts.filter(d => (d.societa||'BC General Service')===societaAttiva && d.stato === 'Fatturato').length}
            </span>
          </button>
        </div>

        <div className="card mb-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <div><label className="label">N° DDT</label><input className="input" placeholder="Cerca numero..." value={cercaNumero} onChange={e => setCercaNumero(e.target.value)} /></div>
            <div><label className="label">Fornitore</label><input className="input" placeholder="Cerca fornitore..." value={cercaFornitore} onChange={e => setCercaFornitore(e.target.value)} /></div>
            {tabFatturazione === 'da_fatturare' && (
              <div><label className="label">Stato</label>
                <select className="input" value={filtroStato} onChange={e => setFiltroStato(e.target.value)}>
                  <option value="tutti">Tutti</option>
                  <option value="Da Fatturare">Da fatturare</option>
                  <option value="Parziale">Parziali</option>
                </select></div>
            )}
            <div><label className="label">Data dal</label><input className="input" type="date" value={dataDA} onChange={e => setDataDA(e.target.value)} /></div>
            <div><label className="label">Data al</label><input className="input" type="date" value={dataA} onChange={e => setDataA(e.target.value)} /></div>
          </div>
          {hasFiltriAttivi && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">{filtered.length} risultati — Totale: <strong>{euro(totaleFiltered)}</strong></span>
              <button onClick={resetFiltri} className="text-xs text-blue-600 hover:underline">× Azzera filtri</button>
            </div>
          )}
        </div>

        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">{filtered.length} DDT {societaAttiva} — Totale: {euro(totaleFiltered)}</span>
          </div>
          <table className="table-base">
            <thead><tr>
              <th>Data</th><th>N° DDT</th><th>Fornitore</th><th>Cantiere</th>
              <th>Importo</th><th>Stato</th><th>Fattura abbinata</th><th></th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-8">
                  {hasFiltriAttivi ? 'Nessun DDT corrisponde ai filtri.' : `Nessun DDT per ${societaAttiva}.`}
                </td></tr>
              ) : filtered.map(d => (
                <tr key={d.id} className="cursor-pointer hover:bg-gray-50" onClick={() => apriDettaglio(d)}>
                  <td className="text-xs">{d.data ? new Date(d.data).toLocaleDateString('it-IT') : '—'}</td>
                  <td className="font-medium text-sm">{d.numero}</td>
                  <td className="text-sm">{d.fornitore_nome}</td>
                  <td className="text-xs text-gray-600">{d.progetto_nome || '—'}</td>
                  <td className="font-medium text-sm">{euro(d.importo)}</td>
                  <td>{statoBadge(d.stato)}</td>
                  <td className="text-xs text-gray-500">{d.fattura_abbinata || '—'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => elimina(d.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal nuovo DDT */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuovo DDT</h2>
              <button onClick={chiudiModali} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SocietaToggle value={form.societa} onChange={handleSocietaChange} />
              <div><label className="label">Data</label>
                <input className="input" type="date" value={form.data} onChange={e => setForm(f => ({...f, data: e.target.value}))} /></div>
              <div><label className="label">N° DDT *</label>
                <input className="input" placeholder="es. DDT/2026/001" value={form.numero} onChange={e => setForm(f => ({...f, numero: e.target.value}))} /></div>
              <div><label className="label">Fornitore *</label>
                <select className="input" value={form.fornitore_id} onChange={e => setForm(f => ({...f, fornitore_id: e.target.value}))}>
                  <option value="">-- seleziona --</option>
                  {fornitori.map(f => <option key={f.id} value={f.id}>{f.ragione_sociale}</option>)}
                </select></div>
              <div><label className="label">Cantiere</label>
                <select className="input" value={form.progetto_id} onChange={e => setForm(f => ({...f, progetto_id: e.target.value}))}>
                  <option value="">-- seleziona --</option>
                  {progettiSocieta.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                </select></div>
            </div>
            <FormVoci voci={voci} onAdd={aggiungiVoce} onUpdate={aggiornaVoce} onDelete={eliminaVoceForm} />
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div><label className="label">Mese fattura previsto</label>
                <input className="input" type="month" value={form.mese_fattura_previsto} onChange={e => setForm(f => ({...f, mese_fattura_previsto: e.target.value}))} /></div>
              <div className="col-span-2"><label className="label">Note</label>
                <input className="input" value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={chiudiModali}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva DDT'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal dettaglio / modifica */}
      {modalDettaglio && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">
                {modalModifica ? `Modifica — ${modalDettaglio.numero}` : `Dettaglio DDT — ${modalDettaglio.numero}`}
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${(modalDettaglio.societa || 'BC') === 'Filosofia' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                  {modalDettaglio.societa || 'BC General Service'}
                </span>
              </h2>
              <button onClick={chiudiModali} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {!modalModifica ? (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4 text-sm">
                  <div><span className="text-gray-400 text-xs block">Data</span>{new Date(modalDettaglio.data).toLocaleDateString('it-IT')}</div>
                  <div><span className="text-gray-400 text-xs block">Fornitore</span>{modalDettaglio.fornitore_nome}</div>
                  <div><span className="text-gray-400 text-xs block">Cantiere</span>{modalDettaglio.progetto_nome || '—'}</div>
                  <div><span className="text-gray-400 text-xs block">Stato</span>{statoBadge(modalDettaglio.stato)}</div>
                  <div className="col-span-2"><span className="text-gray-400 text-xs block">Note</span>{modalDettaglio.note || '—'}</div>
                  <div><span className="text-gray-400 text-xs block">Fattura abbinata</span>{modalDettaglio.fattura_abbinata || '—'}</div>
                </div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">📦 Voci ({vociDettaglio.length})</h3>
                {vociDettaglio.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center border border-dashed rounded-lg">Nessuna voce registrata.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead><tr><th>Descrizione</th><th>Categoria</th><th>U.M.</th><th>Qtà</th><th>€/unit</th><th>Totale</th></tr></thead>
                      <tbody>
                        {vociDettaglio.map(v => (
                          <tr key={v.id}>
                            <td className="text-sm">{v.descrizione}</td>
                            <td className="text-xs text-gray-500">{v.macro_categoria}</td>
                            <td className="text-xs">{v.unita_misura}</td>
                            <td className="text-xs">{v.quantita}</td>
                            <td className="text-xs">{euro(v.prezzo_unitario)}</td>
                            <td className="font-medium text-sm">{euro(v.importo_totale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex justify-end mt-2 pt-2 border-t border-gray-100">
                      <span className="font-semibold text-sm">Totale: {euro(modalDettaglio.importo)}</span>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 justify-end mt-4">
                  <button className="btn text-red-600 border-red-200 hover:bg-red-50" onClick={() => elimina(modalDettaglio.id)}>✕ Elimina</button>
                  <button className="btn btn-primary" onClick={() => apriModifica(modalDettaglio)}>✏️ Modifica</button>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <SocietaToggle value={form.societa} onChange={handleSocietaChange} />
                  <div><label className="label">Data</label>
                    <input className="input" type="date" value={form.data} onChange={e => setForm(f => ({...f, data: e.target.value}))} /></div>
                  <div><label className="label">N° DDT *</label>
                    <input className="input" value={form.numero} onChange={e => setForm(f => ({...f, numero: e.target.value}))} /></div>
                  <div><label className="label">Fornitore *</label>
                    <select className="input" value={form.fornitore_id} onChange={e => setForm(f => ({...f, fornitore_id: e.target.value}))}>
                      <option value="">-- seleziona --</option>
                      {fornitori.map(f => <option key={f.id} value={f.id}>{f.ragione_sociale}</option>)}
                    </select></div>
                  <div><label className="label">Cantiere</label>
                    <select className="input" value={form.progetto_id} onChange={e => setForm(f => ({...f, progetto_id: e.target.value}))}>
                      <option value="">-- seleziona --</option>
                      {progettiSocieta.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                    </select></div>
                </div>
                <FormVoci voci={voci} onAdd={aggiungiVoce} onUpdate={aggiornaVoce} onDelete={eliminaVoceForm} />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div><label className="label">Mese fattura previsto</label>
                    <input className="input" type="month" value={form.mese_fattura_previsto} onChange={e => setForm(f => ({...f, mese_fattura_previsto: e.target.value}))} /></div>
                  <div className="col-span-2"><label className="label">Note</label>
                    <input className="input" value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))} /></div>
                </div>
                <div className="flex gap-2 justify-end mt-4">
                  <button className="btn" onClick={() => setModalModifica(false)}>← Torna al dettaglio</button>
                  <button className="btn btn-primary" onClick={salvaModifica} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva modifiche'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
