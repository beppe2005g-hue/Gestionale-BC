'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function FattureClienti() {
  const [fatture, setFatture] = useState<any[]>([])
  const [clienti, setClienti] = useState<any[]>([])
  const [progetti, setProgetti] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [modalModifica, setModalModifica] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    data: '', numero: '', cliente_id: '', progetto_id: '', descrizione: '',
    imponibile: '', iva_percentuale: '0',
    r1i: '', r1s: '', r2i: '', r2s: '', r3i: '', r3s: '', note: ''
  })

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: f }, { data: c }, { data: p }] = await Promise.all([
      supabase.from('fatture_clienti').select('*').order('data', { ascending: false }),
      supabase.from('clienti').select('id,ragione_sociale').eq('attivo', true),
      supabase.from('progetti').select('id,codice,nome'),
    ])
    setFatture(f || [])
    setClienti(c || [])
    setProgetti(p || [])
  }

  async function incassaRata(id: string, rata: number) {
    const { data: fatt } = await supabase.from('fatture_clienti').select('*').eq('id', id).single()
    if (!fatt) return
    if (!confirm(`Confermi incasso rata ${rata}?\n${fatt.cliente_nome} - ${fatt.numero}`)) return
    await supabase.from('fatture_clienti').update({ [`rata${rata}_stato`]: 'Incassata' }).eq('id', id)
    const imp = (fatt as any)[`rata${rata}_importo`] || 0
    await supabase.from('cash_flow').insert({
      data: new Date().toISOString().split('T')[0],
      descrizione: `Incasso ${fatt.cliente_nome} - Ft ${fatt.numero} rata ${rata}`,
      conto: 'Conto 1', tipologia: 'Incasso Cliente',
      entrata: imp, uscita: 0,
      progetto_id: (fatt as any).progetto_id || null, riferimento_fattura: fatt.numero
    })
    load()
  }

  async function annullaIncasso(id: string, rata: number) {
    if (!confirm(`Annullare l'incasso della rata ${rata}?\nNota: il movimento in cash flow NON viene rimosso automaticamente.`)) return
    await supabase.from('fatture_clienti').update({ [`rata${rata}_stato`]: 'Da Incassare' }).eq('id', id)
    load()
  }

  async function elimina(id: string, numero: string) {
    if (!confirm(`Eliminare la fattura ${numero}?`)) return
    await supabase.from('fatture_clienti').delete().eq('id', id)
    load()
  }

  async function salvaModifica() {
    if (!modalModifica) return
    setLoading(true)
    await supabase.from('fatture_clienti').update({
      data: modalModifica.data,
      numero: modalModifica.numero,
      descrizione: modalModifica.descrizione,
      imponibile: parseFloat(modalModifica.imponibile) || 0,
      iva_percentuale: parseFloat(modalModifica.iva_percentuale) || 0,
      rata1_importo: parseFloat(modalModifica.rata1_importo) || 0,
      rata1_scadenza: modalModifica.rata1_scadenza || null,
      rata2_importo: parseFloat(modalModifica.rata2_importo) || 0,
      rata2_scadenza: modalModifica.rata2_scadenza || null,
      rata3_importo: parseFloat(modalModifica.rata3_importo) || 0,
      rata3_scadenza: modalModifica.rata3_scadenza || null,
      note: modalModifica.note
    }).eq('id', modalModifica.id)
    setModalModifica(null); setLoading(false); load()
  }

  async function salva() {
    if (!form.numero || !form.imponibile || !form.cliente_id) {
      alert('Compilare N° fattura, cliente e imponibile'); return
    }
    // Controlla duplicati
    const { data: dup } = await supabase.from('fatture_clienti')
      .select('id').eq('numero', form.numero).eq('cliente_id', form.cliente_id)
    if (dup && dup.length > 0) {
      alert(`⚠️ Fattura ${form.numero} di questo cliente già presente. Non inserita.`); return
    }
    setLoading(true)
    const cli = clienti.find(c => c.id === form.cliente_id)
    const prj = progetti.find(p => p.id === form.progetto_id)
    const imp = parseFloat(form.imponibile) || 0
    await supabase.from('fatture_clienti').insert({
      data: form.data || new Date().toISOString().split('T')[0],
      numero: form.numero, cliente_id: form.cliente_id,
      cliente_nome: cli?.ragione_sociale || '',
      progetto_id: form.progetto_id || null,
      progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
      descrizione: form.descrizione, imponibile: imp,
      iva_percentuale: parseFloat(form.iva_percentuale) || 0,
      rata1_importo: parseFloat(form.r1i) || imp,
      rata1_scadenza: form.r1s || null, rata1_stato: 'Da Incassare',
      rata2_importo: parseFloat(form.r2i) || 0,
      rata2_scadenza: form.r2s || null, rata2_stato: form.r2i ? 'Da Incassare' : null,
      rata3_importo: parseFloat(form.r3i) || 0,
      rata3_scadenza: form.r3s || null, rata3_stato: form.r3i ? 'Da Incassare' : null,
      note: form.note
    })
    setModal(false); setLoading(false); load()
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Fatture clienti</h1>
          <button className="btn btn-primary text-sm" onClick={() => setModal(true)}>+ Nuova fattura</button>
        </div>
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Data</th><th>N° Fattura</th><th>Cliente</th><th>Cantiere</th><th>Imponibile</th><th>Rata 1</th><th>Rata 2</th><th>Rata 3</th><th></th></tr></thead>
            <tbody>
              {fatture.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-gray-400 py-8">Nessuna fattura cliente.</td></tr>
              ) : fatture.map(f => (
                <tr key={f.id}>
                  <td className="text-xs">{new Date(f.data).toLocaleDateString('it-IT')}</td>
                  <td className="font-medium text-sm">{f.numero}</td>
                  <td className="text-sm">{f.cliente_nome}</td>
                  <td className="text-xs text-gray-500">{f.progetto_nome || '—'}</td>
                  <td className="font-medium text-sm">{euro(f.imponibile)}</td>
                  {[1,2,3].map(n => (
                    <td key={n}>
                      {f[`rata${n}_importo`] > 0 ? (
                        <div className="text-xs">
                          <div className="font-medium">{euro(f[`rata${n}_importo`])}</div>
                          <div className="text-gray-400">{f[`rata${n}_scadenza`] ? new Date(f[`rata${n}_scadenza`]).toLocaleDateString('it-IT') : ''}</div>
                          {f[`rata${n}_stato`] === 'Incassata' ? (
                            <div className="flex gap-1 mt-1 items-center">
                              <span className="badge badge-green">Incassata</span>
                              <button className="text-amber-600 hover:text-amber-800 text-sm font-bold px-1"
                                onClick={() => annullaIncasso(f.id, n)} title="Annulla incasso">↩</button>
                            </div>
                          ) : (
                            <button className="btn btn-sm btn-success mt-1" onClick={() => incassaRata(f.id, n)}>Incassa</button>
                          )}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => setModalModifica({...f})}>✏️</button>
                      <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => elimina(f.id, f.numero)}>✕</button>
                    </div>
                  </td>
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
              <h2 className="text-base font-semibold">Nuova fattura cliente</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="bg-blue-50 rounded-lg p-2 mb-3 text-xs text-blue-700">IVA = 0% (Reverse Charge) impostata di default</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Data</label><input className="input" type="date" value={form.data} onChange={e => setForm({...form, data: e.target.value})} /></div>
              <div><label className="label">N° Fattura *</label><input className="input" placeholder="es. FT/2026/001" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} /></div>
              <div><label className="label">Cliente *</label>
                <select className="input" value={form.cliente_id} onChange={e => setForm({...form, cliente_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {clienti.map(c => <option key={c.id} value={c.id}>{c.ragione_sociale}</option>)}
                </select></div>
              <div><label className="label">Cantiere</label>
                <select className="input" value={form.progetto_id} onChange={e => setForm({...form, progetto_id: e.target.value})}>
                  <option value="">-- seleziona --</option>
                  {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                </select></div>
              <div><label className="label">Imponibile (€) *</label><input className="input" type="number" step="0.01" value={form.imponibile} onChange={e => setForm({...form, imponibile: e.target.value})} /></div>
              <div><label className="label">IVA %</label>
                <select className="input" value={form.iva_percentuale} onChange={e => setForm({...form, iva_percentuale: e.target.value})}>
                  <option value="0">0% (RC)</option><option value="22">22%</option><option value="10">10%</option>
                </select></div>
              <div className="col-span-2 mt-1 text-xs font-medium text-gray-500 border-t pt-2">Rate di incasso</div>
              <div><label className="label">Rata 1 — Importo</label><input className="input" type="number" step="0.01" value={form.r1i} onChange={e => setForm({...form, r1i: e.target.value})} /></div>
              <div><label className="label">Rata 1 — Scadenza</label><input className="input" type="date" value={form.r1s} onChange={e => setForm({...form, r1s: e.target.value})} /></div>
              <div><label className="label">Rata 2 (opz.)</label><input className="input" type="number" step="0.01" value={form.r2i} onChange={e => setForm({...form, r2i: e.target.value})} /></div>
              <div><label className="label">Rata 2 — Scadenza</label><input className="input" type="date" value={form.r2s} onChange={e => setForm({...form, r2s: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={form.note} onChange={e => setForm({...form, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {modalModifica && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Modifica fattura — {modalModifica.numero}</h2>
              <button onClick={() => setModalModifica(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Data</label><input className="input" type="date" value={modalModifica.data} onChange={e => setModalModifica({...modalModifica, data: e.target.value})} /></div>
              <div><label className="label">N° Fattura</label><input className="input" value={modalModifica.numero} onChange={e => setModalModifica({...modalModifica, numero: e.target.value})} /></div>
              <div><label className="label">Imponibile (€)</label><input className="input" type="number" step="0.01" value={modalModifica.imponibile} onChange={e => setModalModifica({...modalModifica, imponibile: e.target.value})} /></div>
              <div><label className="label">IVA %</label>
                <select className="input" value={modalModifica.iva_percentuale} onChange={e => setModalModifica({...modalModifica, iva_percentuale: e.target.value})}>
                  <option value="0">0% (RC)</option><option value="22">22%</option><option value="10">10%</option>
                </select></div>
              <div className="col-span-2 mt-1 text-xs font-medium text-gray-500 border-t pt-2">Rate</div>
              <div><label className="label">Rata 1 — Importo</label><input className="input" type="number" step="0.01" value={modalModifica.rata1_importo || ''} onChange={e => setModalModifica({...modalModifica, rata1_importo: e.target.value})} /></div>
              <div><label className="label">Rata 1 — Scadenza</label><input className="input" type="date" value={modalModifica.rata1_scadenza || ''} onChange={e => setModalModifica({...modalModifica, rata1_scadenza: e.target.value})} /></div>
              <div><label className="label">Rata 2 — Importo</label><input className="input" type="number" step="0.01" value={modalModifica.rata2_importo || ''} onChange={e => setModalModifica({...modalModifica, rata2_importo: e.target.value})} /></div>
              <div><label className="label">Rata 2 — Scadenza</label><input className="input" type="date" value={modalModifica.rata2_scadenza || ''} onChange={e => setModalModifica({...modalModifica, rata2_scadenza: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={modalModifica.note || ''} onChange={e => setModalModifica({...modalModifica, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalModifica(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaModifica} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva modifiche'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
