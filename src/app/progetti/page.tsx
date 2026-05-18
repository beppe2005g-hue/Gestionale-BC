'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + Math.round(n || 0).toLocaleString('it-IT')

export default function Progetti() {
  const [progetti, setProgetti] = useState<any[]>([])
  const [clienti, setClienti] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    codice: '', nome: '', cliente_id: '', tipo: 'Privato', responsabile: '',
    valore_contratto: '', budget_costi: '', data_inizio: '', data_fine: '',
    stato: 'In Corso', note: ''
  })

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('progetti').select('*').order('created_at', { ascending: false }),
      supabase.from('clienti').select('id,ragione_sociale').eq('attivo', true),
    ])
    // Calcola ricavi e costi per ogni progetto
    const [{ data: fc }, { data: ff }] = await Promise.all([
      supabase.from('fatture_clienti').select('progetto_id,imponibile'),
      supabase.from('fatture_fornitori').select('progetto_id,imponibile'),
    ])
    const enhanced = (p || []).map(proj => {
      const ric = (fc || []).filter(f => f.progetto_id === proj.id).reduce((s, f) => s + (f.imponibile || 0), 0)
      const cos = (ff || []).filter(f => f.progetto_id === proj.id).reduce((s, f) => s + (f.imponibile || 0), 0)
      const marg = ric > 0 ? Math.round((ric - cos) / ric * 100) : 0
      return { ...proj, ricavi_attuali: ric, costi_attuali: cos, margine_perc: marg }
    })
    setProgetti(enhanced)
    setClienti(c || [])
  }

  async function generaCodice() {
    const { data } = await supabase.from('progetti').select('codice').order('created_at', { ascending: false }).limit(1)
    const last = data?.[0]?.codice
    const n = last ? parseInt(last.replace(/\D/g, '')) + 1 : 1
    return 'PRJ' + String(n).padStart(3, '0')
  }

  async function apriModal() {
    const codice = await generaCodice()
    setForm({ ...form, codice })
    setModal(true)
  }

  async function salva() {
    if (!form.nome || !form.codice) { alert('Inserisci almeno codice e nome cantiere'); return }
    setLoading(true)
    const cli = clienti.find(c => c.id === form.cliente_id)
    await supabase.from('progetti').insert({
      codice: form.codice, nome: form.nome,
      cliente_id: form.cliente_id || null, cliente_nome: cli?.ragione_sociale || '',
      tipo: form.tipo, responsabile: form.responsabile,
      valore_contratto: parseFloat(form.valore_contratto) || 0,
      budget_costi: parseFloat(form.budget_costi) || 0,
      data_inizio: form.data_inizio || null, data_fine: form.data_fine || null,
      stato: form.stato, note: form.note
    })
    setModal(false); setLoading(false)
    setForm({ codice: '', nome: '', cliente_id: '', tipo: 'Privato', responsabile: '', valore_contratto: '', budget_costi: '', data_inizio: '', data_fine: '', stato: 'In Corso', note: '' })
    load()
  }

  const statoBadge = (s: string) => {
    if (s === 'Completato') return <span className="badge badge-green">Completato</span>
    if (s === 'Sospeso') return <span className="badge badge-red">Sospeso</span>
    if (s === 'Offerta') return <span className="badge badge-gray">Offerta</span>
    return <span className="badge badge-blue">In Corso</span>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Progetti / Cantieri</h1>
          <button className="btn btn-primary text-sm" onClick={apriModal}>+ Nuovo progetto</button>
        </div>
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Codice</th><th>Nome</th><th>Cliente</th><th>Tipo</th><th>Contratto</th><th>Ricavi</th><th>Costi</th><th>Margine</th><th>Stato</th></tr></thead>
            <tbody>
              {progetti.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-gray-400 py-8">Nessun progetto. Crea il primo cantiere.</td></tr>
              ) : progetti.map(p => (
                <tr key={p.id}>
                  <td className="font-medium text-sm text-blue-700">{p.codice}</td>
                  <td className="font-medium text-sm">{p.nome}</td>
                  <td className="text-xs text-gray-600">{p.cliente_nome || '—'}</td>
                  <td className="text-xs"><span className="badge badge-gray">{p.tipo}</span></td>
                  <td className="text-sm">{euro(p.valore_contratto)}</td>
                  <td className="text-sm text-green-700">{euro(p.ricavi_attuali)}</td>
                  <td className="text-sm text-red-700">{euro(p.costi_attuali)}</td>
                  <td className={`font-medium text-sm ${p.margine_perc >= 15 ? 'text-green-700' : p.margine_perc >= 8 ? 'text-amber-700' : 'text-red-700'}`}>
                    {p.margine_perc}%
                  </td>
                  <td>{statoBadge(p.stato)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuovo progetto</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Codice (auto)</label><input className="input bg-gray-50" value={form.codice} readOnly /></div>
              <div><label className="label">Nome cantiere *</label><input className="input" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} /></div>
              <div><label className="label">Cliente</label>
                <select className="input" value={form.cliente_id} onChange={e => setForm({...form, cliente_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {clienti.map(c => <option key={c.id} value={c.id}>{c.ragione_sociale}</option>)}
                </select></div>
              <div><label className="label">Tipo</label>
                <select className="input" value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})}>
                  <option>Privato</option><option>Corporate</option><option>Pubblica</option><option>Movimenti Terra</option><option>Gestione Completa</option>
                </select></div>
              <div><label className="label">Responsabile cantiere</label><input className="input" value={form.responsabile} onChange={e => setForm({...form, responsabile: e.target.value})} /></div>
              <div><label className="label">Stato</label>
                <select className="input" value={form.stato} onChange={e => setForm({...form, stato: e.target.value})}>
                  <option>Offerta</option><option>In Corso</option><option>Completato</option><option>Sospeso</option><option>Annullato</option>
                </select></div>
              <div><label className="label">Valore contratto (€)</label><input className="input" type="number" step="0.01" value={form.valore_contratto} onChange={e => setForm({...form, valore_contratto: e.target.value})} /></div>
              <div><label className="label">Budget costi (€)</label><input className="input" type="number" step="0.01" value={form.budget_costi} onChange={e => setForm({...form, budget_costi: e.target.value})} /></div>
              <div><label className="label">Data inizio</label><input className="input" type="date" value={form.data_inizio} onChange={e => setForm({...form, data_inizio: e.target.value})} /></div>
              <div><label className="label">Data fine prevista</label><input className="input" type="date" value={form.data_fine} onChange={e => setForm({...form, data_fine: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={form.note} onChange={e => setForm({...form, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={loading}>{loading ? 'Salvataggio...' : 'Crea progetto'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
