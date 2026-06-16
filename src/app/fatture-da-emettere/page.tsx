'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { logActivity } from '@/lib/logActivity'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function FattureDaEmetterePage() {
  const [progetti, setProgetti] = useState<any[]>([])
  const [clienti, setClienti] = useState<any[]>([])
  const [fatture, setFatture] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<'da_emettere' | 'emesse'>('da_emettere')
  const [cercaCliente, setCercaCliente] = useState('')
  const [cercaCantiere, setCercaCantiere] = useState('')
  const [espansaFde, setEspansaFde] = useState<string | null>(null)

  const [modalFde, setModalFde] = useState(false)
  const [loadingFde, setLoadingFde] = useState(false)
  const [formFde, setFormFde] = useState<{ progetto_id: string, cliente_id: string, aliquota_iva: string, scadenza_prevista: string, note: string, righe: { descrizione: string, importo: string }[] }>({
    progetto_id: '', cliente_id: '', aliquota_iva: '22', scadenza_prevista: '', note: '', righe: [{ descrizione: '', importo: '' }]
  })

  const [modalEmissione, setModalEmissione] = useState<any>(null)
  const [formEmissione, setFormEmissione] = useState({ numero_fattura_emessa: '', importo_emesso: '', scadenza_emessa: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: p }, { data: cl }, { data: f }] = await Promise.all([
      supabase.from('progetti').select('id,codice,nome,cliente_id').order('codice'),
      supabase.from('clienti').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale'),
      supabase.from('fatture_da_emettere').select('*, fatture_da_emettere_righe(*), progetti(codice,nome)').order('created_at', { ascending: false }),
    ])
    setProgetti(p || [])
    setClienti(cl || [])
    setFatture(f || [])
    setLoading(false)
  }

  function apriModalFde() {
    setFormFde({ progetto_id: '', cliente_id: '', aliquota_iva: '22', scadenza_prevista: '', note: '', righe: [{ descrizione: '', importo: '' }] })
    setModalFde(true)
  }

  function onCambiaProgetto(progettoId: string) {
    const prj = progetti.find(p => p.id === progettoId)
    setFormFde(prev => ({ ...prev, progetto_id: progettoId, cliente_id: prj?.cliente_id || prev.cliente_id }))
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
    if (!formFde.progetto_id) { alert('Seleziona il cantiere'); return }
    if (!formFde.cliente_id) { alert('Seleziona il cliente'); return }
    setLoadingFde(true)
    const prj = progetti.find(p => p.id === formFde.progetto_id)
    const cli = clienti.find(c => c.id === formFde.cliente_id)
    const { data: inserted, error } = await supabase.from('fatture_da_emettere').insert({
      progetto_id: formFde.progetto_id,
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
    loadAll()
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
    loadAll()
  }

  async function riapriFde(id: string) {
    if (!confirm('Riportare questa fattura a "Da Emettere"?')) return
    await supabase.from('fatture_da_emettere').update({
      stato: 'Da Emettere', numero_fattura_emessa: null, importo_emesso: null, scadenza_emessa: null
    }).eq('id', id)
    loadAll()
  }

  async function eliminaFde(id: string) {
    if (!confirm('Eliminare questa richiesta di fattura?')) return
    await supabase.from('fatture_da_emettere').delete().eq('id', id)
    await logActivity('eliminazione', 'fatture_da_emettere', id, 'Richiesta fattura eliminata')
    loadAll()
  }

  const fattureFiltrate = useMemo(() => {
    return fatture.filter(f => {
      if (tab === 'da_emettere' && f.stato !== 'Da Emettere') return false
      if (tab === 'emesse' && f.stato !== 'Emessa') return false
      if (cercaCliente && !f.cliente_nome?.toLowerCase().includes(cercaCliente.toLowerCase())) return false
      if (cercaCantiere) {
        const testo = `${f.progetti?.codice || ''} ${f.progetti?.nome || ''}`.toLowerCase()
        if (!testo.includes(cercaCantiere.toLowerCase())) return false
      }
      return true
    })
  }, [fatture, tab, cercaCliente, cercaCantiere])

  const numDaEmettere = fatture.filter(f => f.stato === 'Da Emettere').length
  const numEmesse = fatture.filter(f => f.stato === 'Emessa').length
  const totaleDaEmettere = fatture.filter(f => f.stato === 'Da Emettere').reduce((s, f) => s + (f.fatture_da_emettere_righe || []).reduce((ss: number, r: any) => ss + (r.importo || 0), 0), 0)
  const totaleEmesso = fatture.filter(f => f.stato === 'Emessa').reduce((s, f) => s + (f.importo_emesso || 0), 0)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Fatture da emettere</h1>
          <button className="btn btn-primary text-sm" onClick={apriModalFde}>+ Richiedi fattura</button>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <p className="text-xs text-amber-600 mb-1">Da emettere</p>
            <p className="text-xl font-semibold text-amber-800">{numDaEmettere}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <p className="text-xs text-amber-600 mb-1">Imponibile da emettere</p>
            <p className="text-xl font-semibold text-amber-800">{euro(totaleDaEmettere)}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <p className="text-xs text-emerald-600 mb-1">Emesse</p>
            <p className="text-xl font-semibold text-emerald-800">{numEmesse}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <p className="text-xs text-emerald-600 mb-1">Imponibile emesso</p>
            <p className="text-xl font-semibold text-emerald-800">{euro(totaleEmesso)}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('da_emettere')} className={`btn ${tab === 'da_emettere' ? 'btn-primary' : ''}`}>
            🔔 Da emettere ({numDaEmettere})
          </button>
          <button onClick={() => setTab('emesse')} className={`btn ${tab === 'emesse' ? 'btn-primary' : ''}`}>
            ✓ Emesse ({numEmesse})
          </button>
        </div>

        <div className="card mb-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="label">Cerca cliente</label>
              <input className="input" placeholder="Nome cliente..." value={cercaCliente} onChange={e => setCercaCliente(e.target.value)} />
            </div>
            <div className="flex-1 min-w-48">
              <label className="label">Cerca cantiere</label>
              <input className="input" placeholder="Nome o codice cantiere..." value={cercaCantiere} onChange={e => setCercaCantiere(e.target.value)} />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card text-center py-12 text-gray-400">Caricamento...</div>
        ) : fattureFiltrate.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            {tab === 'da_emettere' ? 'Nessuna fattura da emettere.' : 'Nessuna fattura emessa ancora.'}
          </div>
        ) : (
          <div className="space-y-2">
            {fattureFiltrate.map(f => {
              const imponibile = (f.fatture_da_emettere_righe || []).reduce((s: number, r: any) => s + (r.importo || 0), 0)
              const iva = imponibile * (f.aliquota_iva || 22) / 100
              return (
                <div key={f.id} className="card p-0 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => setEspansaFde(espansaFde === f.id ? null : f.id)}>
                    <div className="flex-1">
                      <span className="font-medium text-sm">{f.cliente_nome}</span>
                      <span className="text-xs text-gray-400 ml-2">{f.progetti?.codice} — {f.progetti?.nome}</span>
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
      </main>

      {/* ── MODAL RICHIEDI FATTURA ── */}
      {modalFde && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Richiedi emissione fattura</h2>
              <button onClick={() => setModalFde(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="col-span-2"><label className="label">Cantiere *</label>
                <select className="input" value={formFde.progetto_id} onChange={e => onCambiaProgetto(e.target.value)}>
                  <option value="">-- seleziona --</option>
                  {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} — {p.nome}</option>)}
                </select>
              </div>
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

      {/* ── MODAL CONFERMA EMISSIONE ── */}
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
              <button className="btn btn-success" onClick={confermaEmissione}>Conferma emissione</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
