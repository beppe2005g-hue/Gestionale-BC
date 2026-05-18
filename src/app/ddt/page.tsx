'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function DDTPage() {
  const [ddts, setDdts] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [progetti, setProgetti] = useState<any[]>([])
  const [filtro, setFiltro] = useState('tutti')
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    data: '', numero: '', fornitore_id: '', progetto_id: '',
    descrizione: '', importo: '', mese_fattura_previsto: '', note: ''
  })

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: d }, { data: f }, { data: p }] = await Promise.all([
      supabase.from('ddt').select('*').order('data', { ascending: false }),
      supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true),
      supabase.from('progetti').select('id,codice,nome').eq('stato', 'In Corso'),
    ])
    setDdts(d || [])
    setFornitori(f || [])
    setProgetti(p || [])
  }

  async function salva() {
    if (!form.numero || !form.importo || !form.fornitore_id) {
      alert('Compilare N° DDT, fornitore e importo')
      return
    }
    setLoading(true)
    const for_ = fornitori.find(f => f.id === form.fornitore_id)
    const prj = progetti.find(p => p.id === form.progetto_id)
    const { error } = await supabase.from('ddt').insert({
      data: form.data || new Date().toISOString().split('T')[0],
      numero: form.numero,
      fornitore_id: form.fornitore_id,
      fornitore_nome: for_?.ragione_sociale || '',
      progetto_id: form.progetto_id || null,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: form.descrizione,
      importo: parseFloat(form.importo) || 0,
      mese_fattura_previsto: form.mese_fattura_previsto,
      stato: 'Da Fatturare',
      note: form.note,
    })
    if (error) alert('Errore: ' + error.message)
    else {
      setModal(false)
      setForm({ data: '', numero: '', fornitore_id: '', progetto_id: '', descrizione: '', importo: '', mese_fattura_previsto: '', note: '' })
      load()
    }
    setLoading(false)
  }

  async function elimina(id: string) {
    if (!confirm('Eliminare questo DDT?')) return
    await supabase.from('ddt').delete().eq('id', id)
    load()
  }

  const filtered = filtro === 'tutti' ? ddts : ddts.filter(d => d.stato === filtro)

  const statoBadge = (s: string) => {
    if (s === 'Fatturato') return <span className="badge badge-green">Fatturato</span>
    if (s === 'Parziale') return <span className="badge badge-amber">Parziale</span>
    return <span className="badge badge-amber">Da Fatturare</span>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">DDT / Bolle di consegna</h1>
          <button className="btn btn-primary text-sm" onClick={() => setModal(true)}>+ Nuovo DDT</button>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">{filtered.length} DDT</span>
            <select className="input w-auto text-sm" value={filtro} onChange={e => setFiltro(e.target.value)}>
              <option value="tutti">Tutti gli stati</option>
              <option value="Da Fatturare">Da fatturare</option>
              <option value="Fatturato">Fatturati</option>
              <option value="Parziale">Parziali</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr>
                <th>Data</th><th>N° DDT</th><th>Fornitore</th><th>Cantiere</th>
                <th>Importo</th><th>Stato</th><th>Fattura abbinata</th><th></th>
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-8">Nessun DDT. Inserisci il primo.</td></tr>
                ) : filtered.map(d => (
                  <tr key={d.id}>
                    <td className="text-xs">{d.data ? new Date(d.data).toLocaleDateString('it-IT') : '—'}</td>
                    <td className="font-medium text-sm">{d.numero}</td>
                    <td className="text-sm">{d.fornitore_nome}</td>
                    <td className="text-xs text-gray-600">{d.progetto_nome || '—'}</td>
                    <td className="font-medium text-sm">{euro(d.importo)}</td>
                    <td>{statoBadge(d.stato)}</td>
                    <td className="text-xs text-gray-500">{d.fattura_abbinata || '—'}</td>
                    <td>
                      <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => elimina(d.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuovo DDT</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Data</label>
                <input className="input" type="date" value={form.data} onChange={e => setForm({...form, data: e.target.value})} /></div>
              <div><label className="label">N° DDT *</label>
                <input className="input" placeholder="es. DDT/2026/001" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} /></div>
              <div><label className="label">Fornitore *</label>
                <select className="input" value={form.fornitore_id} onChange={e => setForm({...form, fornitore_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {fornitori.map(f => <option key={f.id} value={f.id}>{f.ragione_sociale}</option>)}
                </select></div>
              <div><label className="label">Cantiere</label>
                <select className="input" value={form.progetto_id} onChange={e => setForm({...form, progetto_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                </select></div>
              <div className="col-span-2"><label className="label">Descrizione materiale/servizio</label>
                <input className="input" placeholder="es. Calcestruzzo C25/30 - 50mc" value={form.descrizione} onChange={e => setForm({...form, descrizione: e.target.value})} /></div>
              <div><label className="label">Importo (€) *</label>
                <input className="input" type="number" step="0.01" placeholder="0.00" value={form.importo} onChange={e => setForm({...form, importo: e.target.value})} /></div>
              <div><label className="label">Mese fattura previsto</label>
                <input className="input" type="month" value={form.mese_fattura_previsto} onChange={e => setForm({...form, mese_fattura_previsto: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Note</label>
                <input className="input" value={form.note} onChange={e => setForm({...form, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={loading}>
                {loading ? 'Salvataggio...' : 'Salva DDT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
