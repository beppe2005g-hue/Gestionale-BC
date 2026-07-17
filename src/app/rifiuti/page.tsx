'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const kg = (n: number) => (n || 0).toLocaleString('it-IT') + ' kg'

const FORM_EMPTY = {
  id: '', numero_formulario: '', data_emissione: '', fornitore_id: '',
  fornitore_nome: '', codice_eer: '', descrizione_rifiuto: '', quantita: '',
  unita_misura: 'kg', prezzo_unitario: '', conducente: '', targa: '',
  data_arrivo: '', quantita_accettata: '', cantiere: '', note: ''
}

export default function RifiutiPage() {
  const [formulari, setFormulari] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [progetti, setProgetti] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...FORM_EMPTY })
  const [loading, setLoading] = useState(false)
  const [modalDettaglio, setModalDettaglio] = useState<any | null>(null)

  // Filtri
  const [cercaFornitore, setCercaFornitore] = useState('')
  const [cercaEer, setCercaEer] = useState('')
  const [dataDA, setDataDA] = useState('')
  const [dataA, setDataA] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: f }, { data: fo }, { data: p }] = await Promise.all([
      supabase.from('formulari_rifiuti').select('*').order('data_emissione', { ascending: false }),
      supabase.from('fornitori').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale'),
      supabase.from('progetti').select('id,codice,nome').eq('stato', 'In Corso').order('nome'),
    ])
    setFormulari(f || [])
    setFornitori(fo || [])
    setProgetti(p || [])
  }

  function apriNuovo() {
    setForm({ ...FORM_EMPTY, data_emissione: new Date().toISOString().split('T')[0] })
    setModal(true)
  }

  function apriModifica(f: any) {
    setForm({
      id: f.id, numero_formulario: f.numero_formulario || '',
      data_emissione: f.data_emissione || '', fornitore_id: f.fornitore_id || '',
      fornitore_nome: f.fornitore_nome || '', codice_eer: f.codice_eer || '',
      descrizione_rifiuto: f.descrizione_rifiuto || '',
      quantita: String(f.quantita || ''), unita_misura: f.unita_misura || 'kg',
      prezzo_unitario: String(f.prezzo_unitario || ''),
      conducente: f.conducente || '', targa: f.targa || '',
      data_arrivo: f.data_arrivo || '',
      quantita_accettata: String(f.quantita_accettata || ''),
      cantiere: f.cantiere || '', note: f.note || ''
    })
    setModalDettaglio(null)
    setModal(true)
  }

  async function salva() {
    if (!form.fornitore_id || !form.codice_eer) {
      alert('Inserisci almeno fornitore e codice EER'); return
    }
    setLoading(true)
    const forn = fornitori.find(f => f.id === form.fornitore_id)
    const payload = {
      numero_formulario: form.numero_formulario || null,
      data_emissione: form.data_emissione || null,
      fornitore_id: form.fornitore_id,
      fornitore_nome: forn?.ragione_sociale || form.fornitore_nome,
      codice_eer: form.codice_eer,
      descrizione_rifiuto: form.descrizione_rifiuto,
      quantita: parseFloat(form.quantita) || 0,
      unita_misura: form.unita_misura,
      prezzo_unitario: parseFloat(form.prezzo_unitario) || 0,
      conducente: form.conducente || null,
      targa: form.targa || null,
      data_arrivo: form.data_arrivo || null,
      quantita_accettata: parseFloat(form.quantita_accettata) || null,
      cantiere: form.cantiere || null,
      note: form.note || null,
    }

    if (form.id) {
      await supabase.from('formulari_rifiuti').update(payload).eq('id', form.id)
    } else {
      await supabase.from('formulari_rifiuti').insert(payload)
    }

    // Aggiorna prezzario con il prezzo del formulario (per suggerimento nei DDT)
    if (payload.prezzo_unitario > 0 && payload.descrizione_rifiuto && forn) {
      const { data: pz } = await supabase.from('prezzario')
        .select('id,prezzo_medio,n_acquisti')
        .ilike('descrizione', payload.descrizione_rifiuto)
        .eq('fornitore_nome', forn.ragione_sociale)
        .limit(1)
      if (pz && pz.length > 0) {
        const p = pz[0]
        const media = ((p.prezzo_medio * p.n_acquisti) + payload.prezzo_unitario) / (p.n_acquisti + 1)
        await supabase.from('prezzario').update({
          ultimo_prezzo: payload.prezzo_unitario,
          prezzo_medio: Math.round(media * 10000) / 10000,
          ultima_data: payload.data_emissione,
          n_acquisti: p.n_acquisti + 1
        }).eq('id', p.id)
      } else {
        await supabase.from('prezzario').insert({
          descrizione: payload.descrizione_rifiuto,
          categoria: 'Rifiuti',
          macro_categoria: 'Altro',
          unita_misura: payload.unita_misura,
          fornitore_id: form.fornitore_id,
          fornitore_nome: forn.ragione_sociale,
          ultimo_prezzo: payload.prezzo_unitario,
          prezzo_medio: payload.prezzo_unitario,
          ultima_data: payload.data_emissione,
          n_acquisti: 1
        })
      }
    }

    setModal(false); setLoading(false); load()
  }

  async function elimina(id: string) {
    if (!confirm('Eliminare questo formulario?')) return
    await supabase.from('formulari_rifiuti').delete().eq('id', id)
    setModalDettaglio(null); load()
  }

  const filtrati = useMemo(() => formulari.filter(f => {
    if (cercaFornitore && !f.fornitore_nome?.toLowerCase().includes(cercaFornitore.toLowerCase())) return false
    if (cercaEer && !f.codice_eer?.toLowerCase().includes(cercaEer.toLowerCase()) && !f.descrizione_rifiuto?.toLowerCase().includes(cercaEer.toLowerCase())) return false
    if (dataDA && f.data_emissione < dataDA) return false
    if (dataA && f.data_emissione > dataA) return false
    return true
  }), [formulari, cercaFornitore, cercaEer, dataDA, dataA])

  const totKg = filtrati.reduce((s, f) => s + (f.quantita_accettata || f.quantita || 0), 0)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold">♻️ Rifiuti — Formulari di trasporto</h1>
            <p className="text-xs text-gray-500 mt-0.5">Registro formulari rifiuti (FIR) per smaltimento a terzi</p>
          </div>
          <button className="btn btn-primary text-sm" onClick={apriNuovo}>+ Nuovo formulario</button>
        </div>

        {/* Filtri */}
        <div className="card mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div><label className="label">Azienda smaltimento</label>
              <input className="input" placeholder="es. S.E.A.R..." value={cercaFornitore} onChange={e => setCercaFornitore(e.target.value)} /></div>
            <div><label className="label">Codice EER o descrizione</label>
              <input className="input" placeholder="es. 17.01.07..." value={cercaEer} onChange={e => setCercaEer(e.target.value)} /></div>
            <div><label className="label">Data dal</label>
              <input className="input" type="date" value={dataDA} onChange={e => setDataDA(e.target.value)} /></div>
            <div><label className="label">Data al</label>
              <input className="input" type="date" value={dataA} onChange={e => setDataA(e.target.value)} /></div>
          </div>
          {(cercaFornitore || cercaEer || dataDA || dataA) && (
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">{filtrati.length} formulari · {kg(totKg)} accettati</span>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => { setCercaFornitore(''); setCercaEer(''); setDataDA(''); setDataA('') }}>× Azzera</button>
            </div>
          )}
        </div>

        {/* Tabella */}
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">{filtrati.length} formulari — {kg(totKg)} tot. accettati</span>
          </div>
          <table className="table-base">
            <thead><tr>
              <th>N° Formulario</th><th>Data emissione</th><th>Azienda smaltimento</th>
              <th>Codice EER</th><th>Descrizione rifiuto</th><th>Quantità</th>
              <th>Acc. (kg)</th><th>€/unità</th><th>Cantiere</th><th></th>
            </tr></thead>
            <tbody>
              {filtrati.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-gray-400 py-8">Nessun formulario. Inserisci il primo.</td></tr>
              ) : filtrati.map(f => (
                <tr key={f.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setModalDettaglio(f)}>
                  <td className="font-medium text-xs text-blue-700">{f.numero_formulario || '—'}</td>
                  <td className="text-xs">{f.data_emissione ? new Date(f.data_emissione).toLocaleDateString('it-IT') : '—'}</td>
                  <td className="text-sm">{f.fornitore_nome}</td>
                  <td><span className="badge badge-amber text-xs">{f.codice_eer}</span></td>
                  <td className="text-xs text-gray-600 max-w-xs truncate">{f.descrizione_rifiuto || '—'}</td>
                  <td className="text-xs text-right">{(f.quantita || 0).toLocaleString('it-IT')} {f.unita_misura}</td>
                  <td className="text-xs text-right font-medium">{f.quantita_accettata ? (f.quantita_accettata||0).toLocaleString('it-IT') + ' kg' : '—'}</td>
                  <td className="text-xs text-right">{f.prezzo_unitario > 0 ? euro(f.prezzo_unitario) : <span className="text-gray-300">—</span>}</td>
                  <td className="text-xs text-gray-500 truncate max-w-28">{f.cantiere || '—'}</td>
                  <td onClick={e => e.stopPropagation()} className="flex gap-1">
                    <button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => apriModifica(f)}>✏️</button>
                    <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => elimina(f.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* MODAL NUOVO / MODIFICA */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">{form.id ? '✏️ Modifica formulario' : '+ Nuovo formulario rifiuti'}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">

              {/* Dati formulario */}
              <div><label className="label">N° Formulario (FIR)</label>
                <input className="input" placeholder="es. SMWWH 005196 PG" value={form.numero_formulario} onChange={e => set('numero_formulario', e.target.value)} /></div>
              <div><label className="label">Data emissione</label>
                <input className="input" type="date" value={form.data_emissione} onChange={e => set('data_emissione', e.target.value)} /></div>

              {/* Azienda smaltimento */}
              <div className="col-span-2">
                <label className="label">Azienda smaltimento / Destinatario *</label>
                <select className="input" value={form.fornitore_id} onChange={e => set('fornitore_id', e.target.value)}>
                  <option value="">-- seleziona --</option>
                  {fornitori.map(f => <option key={f.id} value={f.id}>{f.ragione_sociale}</option>)}
                </select>
              </div>

              {/* Rifiuto */}
              <div><label className="label">Codice EER *</label>
                <input className="input" placeholder="es. 17.01.07" value={form.codice_eer} onChange={e => set('codice_eer', e.target.value)} /></div>
              <div><label className="label">Cantiere di provenienza</label>
                <select className="input" value={form.cantiere} onChange={e => set('cantiere', e.target.value)}>
                  <option value="">-- nessun cantiere --</option>
                  {progetti.map(p => <option key={p.id} value={`${p.codice} - ${p.nome}`}>{p.codice} - {p.nome}</option>)}
                </select></div>

              <div className="col-span-2">
                <label className="label">Descrizione rifiuto</label>
                <input className="input" placeholder="es. miscugli o scorie di cemento, mattoni, mattonelle..." value={form.descrizione_rifiuto} onChange={e => set('descrizione_rifiuto', e.target.value)} />
              </div>

              {/* Quantità */}
              <div><label className="label">Quantità prodotta</label>
                <input className="input" type="number" step="0.01" placeholder="0" value={form.quantita} onChange={e => set('quantita', e.target.value)} /></div>
              <div><label className="label">Unità di misura</label>
                <select className="input" value={form.unita_misura} onChange={e => set('unita_misura', e.target.value)}>
                  <option value="kg">kg</option>
                  <option value="Nr.">Nr. (pezzi/cassoni)</option>
                  <option value="m³">m³</option>
                  <option value="litri">litri</option>
                </select></div>
              <div><label className="label">Quantità accettata (kg)</label>
                <input className="input" type="number" step="0.01" placeholder="0" value={form.quantita_accettata} onChange={e => set('quantita_accettata', e.target.value)} /></div>

              {/* Prezzo */}
              <div>
                <label className="label">Prezzo unitario (€/{form.unita_misura || 'unità'})</label>
                <p className="text-xs text-gray-400 mb-1">Come appare in fattura — verrà suggerito nei DDT successivi</p>
                <input className="input" type="number" step="0.0001" placeholder="0.00" value={form.prezzo_unitario} onChange={e => set('prezzo_unitario', e.target.value)} />
              </div>

              {/* Trasportatore */}
              <div><label className="label">Conducente</label>
                <input className="input" placeholder="es. POLASTRI DEVID" value={form.conducente} onChange={e => set('conducente', e.target.value)} /></div>
              <div><label className="label">Targa automezzo</label>
                <input className="input" placeholder="es. GG900TF" value={form.targa} onChange={e => set('targa', e.target.value)} /></div>

              {/* Date arrivo */}
              <div><label className="label">Data arrivo al destinatario</label>
                <input className="input" type="date" value={form.data_arrivo} onChange={e => set('data_arrivo', e.target.value)} /></div>

              <div className="col-span-2"><label className="label">Note</label>
                <input className="input" value={form.note} onChange={e => set('note', e.target.value)} /></div>
            </div>

            {/* Riepilogo importo */}
            {form.prezzo_unitario && form.quantita_accettata && (
              <div className="mt-3 bg-blue-50 rounded-lg px-4 py-2 flex justify-between items-center text-sm">
                <span className="text-blue-700">Importo stimato fattura:</span>
                <span className="font-bold text-blue-900">
                  {euro((parseFloat(form.prezzo_unitario)||0) * (parseFloat(form.quantita_accettata)||0))}
                  <span className="text-xs text-gray-500 font-normal ml-2">({form.quantita_accettata} kg × {euro(parseFloat(form.prezzo_unitario)||0)}/kg)</span>
                </span>
              </div>
            )}

            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={loading}>{loading ? 'Salvataggio...' : form.id ? 'Salva modifiche' : 'Inserisci formulario'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETTAGLIO */}
      {modalDettaglio && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">♻️ {modalDettaglio.numero_formulario || 'Formulario rifiuto'}</h2>
              <button onClick={() => setModalDettaglio(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="label">Azienda smaltimento</span><p className="font-semibold">{modalDettaglio.fornitore_nome}</p></div>
                <div><span className="label">Data emissione</span><p>{modalDettaglio.data_emissione ? new Date(modalDettaglio.data_emissione).toLocaleDateString('it-IT') : '—'}</p></div>
                <div><span className="label">Codice EER</span><span className="badge badge-amber">{modalDettaglio.codice_eer}</span></div>
                <div><span className="label">Cantiere</span><p className="text-gray-600">{modalDettaglio.cantiere || '—'}</p></div>
              </div>
              <div><span className="label">Descrizione rifiuto</span><p className="text-gray-700">{modalDettaglio.descrizione_rifiuto || '—'}</p></div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="label">Quantità prodotta</span><p className="font-semibold">{(modalDettaglio.quantita||0).toLocaleString('it-IT')} {modalDettaglio.unita_misura}</p></div>
                <div><span className="label">Quantità accettata</span><p className="font-semibold text-green-700">{modalDettaglio.quantita_accettata ? (modalDettaglio.quantita_accettata||0).toLocaleString('it-IT') + ' kg' : '—'}</p></div>
                <div><span className="label">Prezzo unitario</span><p className="font-bold text-blue-700">{modalDettaglio.prezzo_unitario > 0 ? `${euro(modalDettaglio.prezzo_unitario)}/${modalDettaglio.unita_misura}` : '—'}</p></div>
                <div><span className="label">Importo stimato</span><p className="font-bold">{modalDettaglio.prezzo_unitario > 0 && modalDettaglio.quantita_accettata ? euro((modalDettaglio.prezzo_unitario||0)*(modalDettaglio.quantita_accettata||0)) : '—'}</p></div>
                <div><span className="label">Conducente</span><p>{modalDettaglio.conducente || '—'}</p></div>
                <div><span className="label">Targa</span><p>{modalDettaglio.targa || '—'}</p></div>
                <div><span className="label">Data arrivo</span><p>{modalDettaglio.data_arrivo ? new Date(modalDettaglio.data_arrivo).toLocaleDateString('it-IT') : '—'}</p></div>
              </div>
              {modalDettaglio.note && <div><span className="label">Note</span><p className="text-gray-600 italic">{modalDettaglio.note}</p></div>}
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn text-red-600 border-red-200 hover:bg-red-50" onClick={() => elimina(modalDettaglio.id)}>✕ Elimina</button>
              <button className="btn btn-primary" onClick={() => apriModifica(modalDettaglio)}>✏️ Modifica</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
