'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const formatData = (d: string | null) => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const PREAVVISO_SCADENZA = 30

function giorniAllaScadenza(data: string | null): number | null {
  if (!data) return null
  const oggi = new Date(); oggi.setHours(0,0,0,0)
  const d = new Date(data); d.setHours(0,0,0,0)
  return Math.ceil((d.getTime() - oggi.getTime()) / 86400000)
}

function statoScadenza(data: string | null): 'scaduta' | 'in_preavviso' | 'ok' | 'nessuna' {
  if (!data) return 'nessuna'
  const gg = giorniAllaScadenza(data)
  if (gg === null) return 'nessuna'
  if (gg < 0) return 'scaduta'
  if (gg <= PREAVVISO_SCADENZA) return 'in_preavviso'
  return 'ok'
}

function BadgeScadenza({ data, label }: { data: string | null, label: string }) {
  const stato = statoScadenza(data)
  const gg = giorniAllaScadenza(data)
  if (stato === 'nessuna') return <span className="text-xs text-gray-300">—</span>
  const cls = stato === 'scaduta' ? 'bg-red-100 text-red-700' : stato === 'in_preavviso' ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'
  const icon = stato === 'scaduta' ? '🔴' : stato === 'in_preavviso' ? '🟡' : '🟢'
  return (
    <div className={`text-xs px-2 py-1 rounded-lg ${cls}`}>
      <p className="font-medium">{icon} {label}</p>
      <p>{formatData(data)}</p>
      {gg !== null && gg < 0 && <p className="font-bold">Scaduto da {Math.abs(gg)} gg</p>}
      {gg !== null && gg >= 0 && gg <= PREAVVISO_SCADENZA && <p className="font-bold">Tra {gg} gg</p>}
    </div>
  )
}

export default function MezziPage() {
  const [mezzi, setMezzi] = useState<any[]>([])
  const [selezionato, setSelezionato] = useState<any>(null)
  const [interventi, setInterventi] = useState<any[]>([])
  const [attrezzatura, setAttrezzatura] = useState<any[]>([])
  const [subTab, setSubTab] = useState<'scheda' | 'interventi' | 'attrezzatura'>('scheda')
  const [modal, setModal] = useState(false)
  const [modalModifica, setModalModifica] = useState<any>(null)
  const [modalIntervento, setModalIntervento] = useState(false)
  const [modalAttrezzatura, setModalAttrezzatura] = useState(false)
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    nome: '', targa: '', posti: '', societa: 'BC General Service', marca: '', modello: '', anno: '',
    scadenza_assicurazione: '', scadenza_bollo: '', scadenza_revisione: '',
    km_attuali: '', note: ''
  })

  const [formIntervento, setFormIntervento] = useState({
    data: new Date().toISOString().split('T')[0],
    tipo: 'Tagliando', descrizione: '', km: '', costo: '', fornitore: '', note: ''
  })

  const [formAttrezzatura, setFormAttrezzatura] = useState({ nome: '', quantita: '1', note: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('mezzi').select('*').order('nome')
    setMezzi(data || [])
  }

  async function apriMezzo(m: any) {
    setSelezionato(m)
    setSubTab('scheda')
    const [{ data: inv }, { data: att }] = await Promise.all([
      supabase.from('mezzi_interventi').select('*').eq('mezzo_id', m.id).order('data', { ascending: false }),
      supabase.from('mezzi_attrezzatura').select('*').eq('mezzo_id', m.id).order('nome'),
    ])
    setInterventi(inv || [])
    setAttrezzatura(att || [])
  }

  async function salvaMezzo() {
    if (!form.nome) { alert('Inserisci il nome del mezzo'); return }
    setLoading(true)
    await supabase.from('mezzi').insert({
      nome: form.nome, targa: form.targa || null,
      posti: form.posti ? parseInt(form.posti) : null,
      societa: form.societa,
      marca: form.marca || null, modello: form.modello || null,
      anno: form.anno ? parseInt(form.anno) : null,
      scadenza_assicurazione: form.scadenza_assicurazione || null,
      scadenza_bollo: form.scadenza_bollo || null,
      scadenza_revisione: form.scadenza_revisione || null,
      km_attuali: form.km_attuali ? parseInt(form.km_attuali) : 0,
      note: form.note || null, attivo: true
    })
    setModal(false)
    setForm({ nome:'',targa:'',posti:'',societa:'BC General Service',marca:'',modello:'',anno:'',scadenza_assicurazione:'',scadenza_bollo:'',scadenza_revisione:'',km_attuali:'',note:'' })
    setLoading(false); load()
  }

  async function salvaModifica() {
    if (!modalModifica) return
    setLoading(true)
    await supabase.from('mezzi').update({
      nome: modalModifica.nome, targa: modalModifica.targa || null,
      posti: modalModifica.posti ? parseInt(modalModifica.posti) : null,
      societa: modalModifica.societa || 'BC General Service',
      marca: modalModifica.marca || null, modello: modalModifica.modello || null,
      anno: modalModifica.anno ? parseInt(modalModifica.anno) : null,
      scadenza_assicurazione: modalModifica.scadenza_assicurazione || null,
      scadenza_bollo: modalModifica.scadenza_bollo || null,
      scadenza_revisione: modalModifica.scadenza_revisione || null,
      km_attuali: modalModifica.km_attuali ? parseInt(modalModifica.km_attuali) : 0,
      note: modalModifica.note || null,
      attivo: modalModifica.attivo !== false
    }).eq('id', modalModifica.id)
    setModalModifica(null); setLoading(false)
    load()
    if (selezionato?.id === modalModifica.id) setSelezionato({ ...selezionato, ...modalModifica })
  }

  async function salvaIntervento() {
    if (!selezionato || !formIntervento.tipo) { alert('Inserisci tipo intervento'); return }
    await supabase.from('mezzi_interventi').insert({
      mezzo_id: selezionato.id,
      data: formIntervento.data,
      tipo: formIntervento.tipo,
      descrizione: formIntervento.descrizione || null,
      km: formIntervento.km ? parseInt(formIntervento.km) : null,
      costo: formIntervento.costo ? parseFloat(formIntervento.costo) : 0,
      fornitore: formIntervento.fornitore || null,
      note: formIntervento.note || null
    })
    setModalIntervento(false)
    setFormIntervento({ data: new Date().toISOString().split('T')[0], tipo:'Tagliando', descrizione:'', km:'', costo:'', fornitore:'', note:'' })
    apriMezzo(selezionato)
  }

  async function salvaAttrezzatura() {
    if (!selezionato || !formAttrezzatura.nome) { alert('Inserisci nome attrezzatura'); return }
    await supabase.from('mezzi_attrezzatura').insert({
      mezzo_id: selezionato.id,
      nome: formAttrezzatura.nome,
      quantita: parseInt(formAttrezzatura.quantita) || 1,
      note: formAttrezzatura.note || null
    })
    setModalAttrezzatura(false)
    setFormAttrezzatura({ nome:'', quantita:'1', note:'' })
    apriMezzo(selezionato)
  }

  async function eliminaIntervento(id: string) {
    if (!confirm('Eliminare questo intervento?')) return
    await supabase.from('mezzi_interventi').delete().eq('id', id)
    apriMezzo(selezionato)
  }

  async function eliminaAttrezzatura(id: string) {
    if (!confirm('Eliminare questa voce?')) return
    await supabase.from('mezzi_attrezzatura').delete().eq('id', id)
    apriMezzo(selezionato)
  }

  async function toggleAttivo(id: string, attivo: boolean) {
    await supabase.from('mezzi').update({ attivo: !attivo }).eq('id', id)
    load()
    if (selezionato?.id === id) setSelezionato({ ...selezionato, attivo: !attivo })
  }

  const alertMezzi = mezzi.filter(m => {
    const s1 = statoScadenza(m.scadenza_assicurazione)
    const s2 = statoScadenza(m.scadenza_bollo)
    const s3 = statoScadenza(m.scadenza_revisione)
    return [s1,s2,s3].some(s => s === 'scaduta' || s === 'in_preavviso')
  })

  function hasAlert(m: any) {
    return ['scadenza_assicurazione','scadenza_bollo','scadenza_revisione']
      .some(k => { const s = statoScadenza(m[k]); return s === 'scaduta' || s === 'in_preavviso' })
  }

  const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">🚐 Mezzi</h1>
          <button className="btn btn-primary text-sm" onClick={() => setModal(true)}>+ Nuovo mezzo</button>
        </div>

        {alertMezzi.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <p className="text-sm font-medium text-amber-800 mb-2">⚠️ Scadenze in arrivo ({alertMezzi.length} mezzi)</p>
            <div className="flex flex-wrap gap-2">
              {alertMezzi.map(m => (
                <span key={m.id} className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full cursor-pointer"
                  onClick={() => apriMezzo(m)}>
                  🚐 {m.nome}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <div className="w-56 flex-shrink-0 space-y-1">
            {mezzi.filter(m => m.attivo !== false).map(m => (
              <div key={m.id} onClick={() => apriMezzo(m)}
                className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all ${selezionato?.id === m.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-blue-800">🚐 {m.nome}</p>
                  {hasAlert(m) && <span className="text-xs">⚠️</span>}
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${m.societa === 'Filosofia' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                  {m.societa === 'Filosofia' ? '🏢 Filosofia' : '🏗 BC General'}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  {m.targa && <p className="text-xs text-gray-500 font-mono">{m.targa}</p>}
                  {m.posti && <p className="text-xs text-blue-500">👥 {m.posti}p</p>}
                </div>
                {m.marca && <p className="text-xs text-gray-400">{m.marca} {m.modello}</p>}
              </div>
            ))}
            {mezzi.filter(m => m.attivo === false).length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 px-3 py-1">Inattivi</p>
                {mezzi.filter(m => m.attivo === false).map(m => (
                  <div key={m.id} onClick={() => apriMezzo(m)}
                    className="px-3 py-2 rounded-lg cursor-pointer opacity-50 hover:opacity-100 bg-white border border-gray-100 mb-1">
                    <p className="text-sm text-gray-500">🚐 {m.nome}</p>
                  </div>
                ))}
              </div>
            )}
            {mezzi.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Nessun mezzo.</p>}
          </div>

          {selezionato ? (
            <div className="flex-1 space-y-4">
              <div className="card bg-gray-900 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold">🚐 {selezionato.nome}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${selezionato.societa === 'Filosofia' ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'}`}>
                      {selezionato.societa === 'Filosofia' ? '🏢 Filosofia' : '🏗 BC General Service'}
                    </span>
                    <div className="flex items-center gap-3 mt-1.5">
                      {selezionato.targa && <p className="font-mono text-gray-300 text-sm">{selezionato.targa}</p>}
                      {selezionato.posti && <p className="text-blue-300 text-sm">👥 {selezionato.posti} posti</p>}
                    </div>
                    {selezionato.marca && <p className="text-gray-400 text-sm">{selezionato.marca} {selezionato.modello} {selezionato.anno && `(${selezionato.anno})`}</p>}
                    {selezionato.km_attuali > 0 && <p className="text-gray-400 text-xs mt-1">📍 {selezionato.km_attuali.toLocaleString('it-IT')} km</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setModalModifica({...selezionato})} className="btn btn-sm bg-blue-700 text-white border-blue-600">✏️ Modifica</button>
                    <button onClick={() => toggleAttivo(selezionato.id, selezionato.attivo !== false)}
                      className="btn btn-sm bg-gray-700 text-white border-gray-600">
                      {selezionato.attivo !== false ? 'Disattiva' : 'Riattiva'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setSubTab('scheda')} className={`btn btn-sm ${subTab === 'scheda' ? 'btn-primary' : ''}`}>📋 Scheda</button>
                <button onClick={() => setSubTab('interventi')} className={`btn btn-sm ${subTab === 'interventi' ? 'btn-primary' : ''}`}>🔧 Interventi ({interventi.length})</button>
                <button onClick={() => setSubTab('attrezzatura')} className={`btn btn-sm ${subTab === 'attrezzatura' ? 'btn-primary' : ''}`}>🧰 Attrezzatura ({attrezzatura.length})</button>
              </div>

              {subTab === 'scheda' && (
                <div className="space-y-4">
                  <div className="card">
                    <h3 className="font-medium text-sm mb-4">📅 Scadenze</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <BadgeScadenza data={selezionato.scadenza_assicurazione} label="Assicurazione" />
                      <BadgeScadenza data={selezionato.scadenza_bollo} label="Bollo" />
                      <BadgeScadenza data={selezionato.scadenza_revisione} label="Revisione" />
                    </div>
                  </div>
                  <div className="card">
                    <h3 className="font-medium text-sm mb-3">📋 Dati mezzo</h3>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div><p className="text-xs text-gray-400">Nome/Identificativo</p><p className="font-medium">{selezionato.nome}</p></div>
                      <div><p className="text-xs text-gray-400">Targa</p><p className="font-medium font-mono">{selezionato.targa || '—'}</p></div>
                      <div><p className="text-xs text-gray-400">Posti</p><p className="font-medium">{selezionato.posti ? `${selezionato.posti} posti` : '—'}</p></div>
                      <div><p className="text-xs text-gray-400">Marca</p><p className="font-medium">{selezionato.marca || '—'}</p></div>
                      <div><p className="text-xs text-gray-400">Modello</p><p className="font-medium">{selezionato.modello || '—'}</p></div>
                      <div><p className="text-xs text-gray-400">Anno</p><p className="font-medium">{selezionato.anno || '—'}</p></div>
                      <div><p className="text-xs text-gray-400">KM attuali</p><p className="font-medium">{selezionato.km_attuali ? selezionato.km_attuali.toLocaleString('it-IT') + ' km' : '—'}</p></div>
                    </div>
                    {selezionato.note && <div className="mt-3 pt-3 border-t border-gray-100"><p className="text-xs text-gray-400">Note</p><p className="text-sm">{selezionato.note}</p></div>}
                  </div>
                </div>
              )}

              {subTab === 'interventi' && (
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-sm">🔧 Storico interventi e manutenzioni</h3>
                    <button className="btn btn-sm btn-primary" onClick={() => setModalIntervento(true)}>+ Aggiungi</button>
                  </div>
                  {interventi.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Nessun intervento registrato.</p>
                  ) : (
                    <div className="space-y-2">
                      {interventi.map(inv => (
                        <div key={inv.id} className="bg-gray-50 rounded-lg p-3 flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{inv.tipo}</span>
                              <span className="text-xs text-gray-500">{formatData(inv.data)}</span>
                              {inv.km && <span className="text-xs text-gray-400">{inv.km.toLocaleString('it-IT')} km</span>}
                              {inv.costo > 0 && <span className="text-xs font-semibold text-amber-700">{euro(inv.costo)}</span>}
                            </div>
                            {inv.descrizione && <p className="text-sm text-gray-700 mt-1">{inv.descrizione}</p>}
                            {inv.fornitore && <p className="text-xs text-gray-400 mt-0.5">🔧 {inv.fornitore}</p>}
                            {inv.note && <p className="text-xs text-gray-400">{inv.note}</p>}
                          </div>
                          <button onClick={() => eliminaIntervento(inv.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {subTab === 'attrezzatura' && (
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-sm">🧰 Attrezzatura assegnata</h3>
                    <button className="btn btn-sm btn-primary" onClick={() => setModalAttrezzatura(true)}>+ Aggiungi</button>
                  </div>
                  {attrezzatura.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Nessuna attrezzatura assegnata.</p>
                  ) : (
                    <div className="space-y-2">
                      {attrezzatura.map(att => (
                        <div key={att.id} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-sm text-gray-800">{att.nome}</span>
                              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">×{att.quantita}</span>
                            </div>
                            {att.note && <p className="text-xs text-gray-400 mt-0.5">{att.note}</p>}
                          </div>
                          <button onClick={() => eliminaAttrezzatura(att.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center"><p className="text-4xl mb-3">🚐</p><p className="text-sm">Seleziona un mezzo</p></div>
            </div>
          )}
        </div>
      </main>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuovo mezzo</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Nome/Identificativo *</label><input className="input" placeholder="es. Iveco EH" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} /></div>
              <div className="col-span-2">
                <label className="label">Società</label>
                <div className="flex gap-2">
                  {(['BC General Service', 'Filosofia'] as const).map(s => (
                    <button key={s} type="button" onClick={() => setForm({...form, societa: s})}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${form.societa === s ? (s === 'Filosofia' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-blue-600 border-blue-600 text-white') : 'bg-white border-gray-200 text-gray-600'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="label">Targa</label><input className="input" placeholder="es. AB123CD" value={form.targa} onChange={e => setForm({...form, targa: e.target.value})} /></div>
              <div><label className="label">Posti</label><input className="input" type="number" min="1" placeholder="es. 3" value={form.posti} onChange={e => setForm({...form, posti: e.target.value})} /></div>
              <div><label className="label">Marca</label><input className="input" placeholder="es. Iveco" value={form.marca} onChange={e => setForm({...form, marca: e.target.value})} /></div>
              <div><label className="label">Modello</label><input className="input" placeholder="es. Daily 35C" value={form.modello} onChange={e => setForm({...form, modello: e.target.value})} /></div>
              <div><label className="label">Anno</label><input className="input" type="number" placeholder="es. 2020" value={form.anno} onChange={e => setForm({...form, anno: e.target.value})} /></div>
              <div><label className="label">KM attuali</label><input className="input" type="number" value={form.km_attuali} onChange={e => setForm({...form, km_attuali: e.target.value})} /></div>
              <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
                <p className="text-xs font-medium text-gray-500 mb-2">Scadenze</p>
              </div>
              <div><label className="label">Assicurazione</label><input className="input" type="date" value={form.scadenza_assicurazione} onChange={e => setForm({...form, scadenza_assicurazione: e.target.value})} /></div>
              <div><label className="label">Bollo</label><input className="input" type="date" value={form.scadenza_bollo} onChange={e => setForm({...form, scadenza_bollo: e.target.value})} /></div>
              <div><label className="label">Revisione</label><input className="input" type="date" value={form.scadenza_revisione} onChange={e => setForm({...form, scadenza_revisione: e.target.value})} /></div>
              <div></div>
              <div className="col-span-2"><label className="label">Note</label><textarea className="input h-16 resize-none" value={form.note} onChange={e => setForm({...form, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaMezzo} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva mezzo'}</button>
            </div>
          </div>
        </div>
      )}

      {modalModifica && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Modifica — {modalModifica.nome}</h2>
              <button onClick={() => setModalModifica(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Nome/Identificativo *</label><input className="input" value={modalModifica.nome||''} onChange={e => setModalModifica({...modalModifica, nome: e.target.value})} /></div>
              <div className="col-span-2">
                <label className="label">Società</label>
                <div className="flex gap-2">
                  {(['BC General Service', 'Filosofia'] as const).map(s => (
                    <button key={s} type="button" onClick={() => setModalModifica({...modalModifica, societa: s})}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${(modalModifica.societa || 'BC General Service') === s ? (s === 'Filosofia' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-blue-600 border-blue-600 text-white') : 'bg-white border-gray-200 text-gray-600'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="label">Targa</label><input className="input" value={modalModifica.targa||''} onChange={e => setModalModifica({...modalModifica, targa: e.target.value})} /></div>
              <div><label className="label">Posti</label><input className="input" type="number" min="1" value={modalModifica.posti||''} onChange={e => setModalModifica({...modalModifica, posti: e.target.value})} /></div>
              <div><label className="label">Marca</label><input className="input" value={modalModifica.marca||''} onChange={e => setModalModifica({...modalModifica, marca: e.target.value})} /></div>
              <div><label className="label">Modello</label><input className="input" value={modalModifica.modello||''} onChange={e => setModalModifica({...modalModifica, modello: e.target.value})} /></div>
              <div><label className="label">Anno</label><input className="input" type="number" value={modalModifica.anno||''} onChange={e => setModalModifica({...modalModifica, anno: e.target.value})} /></div>
              <div><label className="label">KM attuali</label><input className="input" type="number" value={modalModifica.km_attuali||''} onChange={e => setModalModifica({...modalModifica, km_attuali: e.target.value})} /></div>
              <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
                <p className="text-xs font-medium text-gray-500 mb-2">Scadenze</p>
              </div>
              <div><label className="label">Assicurazione</label><input className="input" type="date" value={modalModifica.scadenza_assicurazione||''} onChange={e => setModalModifica({...modalModifica, scadenza_assicurazione: e.target.value})} /></div>
              <div><label className="label">Bollo</label><input className="input" type="date" value={modalModifica.scadenza_bollo||''} onChange={e => setModalModifica({...modalModifica, scadenza_bollo: e.target.value})} /></div>
              <div><label className="label">Revisione</label><input className="input" type="date" value={modalModifica.scadenza_revisione||''} onChange={e => setModalModifica({...modalModifica, scadenza_revisione: e.target.value})} /></div>
              <div></div>
              <div className="col-span-2"><label className="label">Note</label><textarea className="input h-16 resize-none" value={modalModifica.note||''} onChange={e => setModalModifica({...modalModifica, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalModifica(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaModifica} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva modifiche'}</button>
            </div>
          </div>
        </div>
      )}

      {modalIntervento && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">🔧 Aggiungi intervento — {selezionato?.nome}</h2>
              <button onClick={() => setModalIntervento(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Data *</label><input className="input" type="date" value={formIntervento.data} onChange={e => setFormIntervento({...formIntervento, data: e.target.value})} /></div>
              <div><label className="label">Tipo *</label>
                <select className="input" value={formIntervento.tipo} onChange={e => setFormIntervento({...formIntervento, tipo: e.target.value})}>
                  <option>Tagliando</option><option>Revisione</option><option>Riparazione</option>
                  <option>Cambio gomme</option><option>Assicurazione</option><option>Bollo</option>
                  <option>Carrozzeria</option><option>Altro</option>
                </select>
              </div>
              <div className="col-span-2"><label className="label">Descrizione</label><input className="input" placeholder="es. Cambio olio + filtri" value={formIntervento.descrizione} onChange={e => setFormIntervento({...formIntervento, descrizione: e.target.value})} /></div>
              <div><label className="label">KM al momento</label><input className="input" type="number" value={formIntervento.km} onChange={e => setFormIntervento({...formIntervento, km: e.target.value})} /></div>
              <div><label className="label">Costo (€)</label><input className="input" type="number" step="0.01" value={formIntervento.costo} onChange={e => setFormIntervento({...formIntervento, costo: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Officina/Fornitore</label><input className="input" value={formIntervento.fornitore} onChange={e => setFormIntervento({...formIntervento, fornitore: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Note</label><input className="input" value={formIntervento.note} onChange={e => setFormIntervento({...formIntervento, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalIntervento(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaIntervento}>Salva intervento</button>
            </div>
          </div>
        </div>
      )}

      {modalAttrezzatura && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">🧰 Aggiungi attrezzatura — {selezionato?.nome}</h2>
              <button onClick={() => setModalAttrezzatura(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div><label className="label">Nome attrezzatura *</label><input className="input" placeholder="es. Scala, Trapano, Generatore..." value={formAttrezzatura.nome} onChange={e => setFormAttrezzatura({...formAttrezzatura, nome: e.target.value})} /></div>
              <div><label className="label">Quantità</label><input className="input" type="number" min="1" value={formAttrezzatura.quantita} onChange={e => setFormAttrezzatura({...formAttrezzatura, quantita: e.target.value})} /></div>
              <div><label className="label">Note</label><input className="input" value={formAttrezzatura.note} onChange={e => setFormAttrezzatura({...formAttrezzatura, note: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModalAttrezzatura(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaAttrezzatura}>Aggiungi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
