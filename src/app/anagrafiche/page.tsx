'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

export default function Anagrafiche() {
  const [tab, setTab] = useState<'clienti'|'fornitori'>('clienti')
  const [clienti, setClienti] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [modal, setModal] = useState<'cliente'|'fornitore'|null>(null)
  const [modalModifica, setModalModifica] = useState<{tipo:'cliente'|'fornitore', dati:any}|null>(null)
  const [loading, setLoading] = useState(false)
  const [fc, setFc] = useState({ ragione_sociale:'',cf_piva:'',tipo:'Azienda',indirizzo:'',citta:'',email:'',pec:'',telefono:'',iban:'',termini_pagamento:'30' })
  const [ff, setFf] = useState({ ragione_sociale:'',cf_piva:'',categoria:'Materiali',indirizzo:'',citta:'',email:'',pec:'',telefono:'',iban:'',termini_pagamento:'30',modalita_pagamento:'Bonifico' })

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: c }, { data: f }] = await Promise.all([
      supabase.from('clienti').select('*').order('ragione_sociale'),
      supabase.from('fornitori').select('*').order('ragione_sociale'),
    ])
    setClienti(c || [])
    setFornitori(f || [])
  }

  async function salvaCliente() {
    if (!fc.ragione_sociale) { alert('Inserisci ragione sociale'); return }
    setLoading(true)
    await supabase.from('clienti').insert({ ...fc, termini_pagamento: parseInt(fc.termini_pagamento) || 30, attivo: true })
    setModal(null); setLoading(false)
    setFc({ ragione_sociale:'',cf_piva:'',tipo:'Azienda',indirizzo:'',citta:'',email:'',pec:'',telefono:'',iban:'',termini_pagamento:'30' })
    load()
  }

  async function salvaFornitore() {
    if (!ff.ragione_sociale) { alert('Inserisci ragione sociale'); return }
    setLoading(true)
    await supabase.from('fornitori').insert({ ...ff, termini_pagamento: parseInt(ff.termini_pagamento) || 30, attivo: true })
    setModal(null); setLoading(false)
    setFf({ ragione_sociale:'',cf_piva:'',categoria:'Materiali',indirizzo:'',citta:'',email:'',pec:'',telefono:'',iban:'',termini_pagamento:'30',modalita_pagamento:'Bonifico' })
    load()
  }

  async function toggleAttivo(tipo: string, id: string, attivo: boolean) {
    await supabase.from(tipo).update({ attivo: !attivo }).eq('id', id)
    load()
  }

  function apriModificaCliente(c: any) {
    setModalModifica({ tipo: 'cliente', dati: { ...c, termini_pagamento: String(c.termini_pagamento ?? 30) } })
  }
  function apriModificaFornitore(f: any) {
    setModalModifica({ tipo: 'fornitore', dati: { ...f, termini_pagamento: String(f.termini_pagamento ?? 30) } })
  }

  async function salvaModifica() {
    if (!modalModifica) return
    const { tipo, dati } = modalModifica
    if (!dati.ragione_sociale) { alert('Inserisci ragione sociale'); return }
    setLoading(true)
    const tabella = tipo === 'cliente' ? 'clienti' : 'fornitori'
    const payload: any = {
      ragione_sociale: dati.ragione_sociale, cf_piva: dati.cf_piva,
      indirizzo: dati.indirizzo, citta: dati.citta, email: dati.email,
      pec: dati.pec, telefono: dati.telefono, iban: dati.iban,
      termini_pagamento: parseInt(dati.termini_pagamento) || 30,
    }
    if (tipo === 'cliente') payload.tipo = dati.tipo
    else { payload.categoria = dati.categoria; payload.modalita_pagamento = dati.modalita_pagamento }

    const { error } = await supabase.from(tabella).update(payload).eq('id', dati.id)
    setLoading(false)
    if (error) { alert('Errore: ' + error.message); return }
    setModalModifica(null)
    load()
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Anagrafiche</h1>
          <div className="flex gap-2">
            <button className="btn btn-primary text-sm" onClick={() => setModal('cliente')}>+ Nuovo cliente</button>
            <button className="btn btn-primary text-sm" onClick={() => setModal('fornitore')}>+ Nuovo fornitore</button>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {(['clienti','fornitori'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`btn ${tab === t ? 'btn-primary' : ''}`}>
              {t === 'clienti' ? `Clienti (${clienti.length})` : `Fornitori (${fornitori.length})`}
            </button>
          ))}
        </div>

        <div className="card overflow-x-auto">
          {tab === 'clienti' ? (
            <table className="table-base">
              <thead><tr><th>Ragione Sociale</th><th>CF / P.IVA</th><th>Tipo</th><th>Email</th><th>Telefono</th><th>Termini</th><th>Stato</th><th></th></tr></thead>
              <tbody>
                {clienti.length === 0 ? <tr><td colSpan={8} className="text-center text-gray-400 py-8">Nessun cliente. Aggiungine uno.</td></tr>
                : clienti.map(c => (
                  <tr key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => apriModificaCliente(c)}>
                    <td className="font-medium text-sm">{c.ragione_sociale}</td>
                    <td className="text-xs text-gray-500">{c.cf_piva || '—'}</td>
                    <td><span className="badge badge-gray">{c.tipo}</span></td>
                    <td className="text-xs text-gray-500">{c.email || '—'}</td>
                    <td className="text-xs text-gray-500">{c.telefono || '—'}</td>
                    <td className="text-xs">{c.termini_pagamento} gg</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleAttivo('clienti', c.id, c.attivo)}
                        className={`badge cursor-pointer ${c.attivo ? 'badge-green' : 'badge-red'}`}>
                        {c.attivo ? 'Attivo' : 'Inattivo'}
                      </button>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => apriModificaCliente(c)}>✏️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="table-base">
              <thead><tr><th>Ragione Sociale</th><th>CF / P.IVA</th><th>Categoria</th><th>Email</th><th>Telefono</th><th>Pagamento</th><th>Stato</th><th></th></tr></thead>
              <tbody>
                {fornitori.length === 0 ? <tr><td colSpan={8} className="text-center text-gray-400 py-8">Nessun fornitore. Aggiungine uno.</td></tr>
                : fornitori.map(f => (
                  <tr key={f.id} className="cursor-pointer hover:bg-gray-50" onClick={() => apriModificaFornitore(f)}>
                    <td className="font-medium text-sm">{f.ragione_sociale}</td>
                    <td className="text-xs text-gray-500">{f.cf_piva || '—'}</td>
                    <td><span className="badge badge-amber">{f.categoria}</span></td>
                    <td className="text-xs text-gray-500">{f.email || '—'}</td>
                    <td className="text-xs text-gray-500">{f.telefono || '—'}</td>
                    <td className="text-xs">{f.modalita_pagamento} / {f.termini_pagamento}gg</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleAttivo('fornitori', f.id, f.attivo)}
                        className={`badge cursor-pointer ${f.attivo ? 'badge-green' : 'badge-red'}`}>
                        {f.attivo ? 'Attivo' : 'Inattivo'}
                      </button>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => apriModificaFornitore(f)}>✏️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Modal cliente */}
      {modal === 'cliente' && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuovo cliente</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Ragione Sociale *</label><input className="input" value={fc.ragione_sociale} onChange={e => setFc({...fc,ragione_sociale:e.target.value})} /></div>
              <div><label className="label">CF / P.IVA</label><input className="input" value={fc.cf_piva} onChange={e => setFc({...fc,cf_piva:e.target.value})} /></div>
              <div><label className="label">Tipo</label>
                <select className="input" value={fc.tipo} onChange={e => setFc({...fc,tipo:e.target.value})}>
                  <option>Privato</option><option>Azienda</option><option>Ente Pubblico</option><option>Subappaltatore</option>
                </select></div>
              <div className="col-span-2"><label className="label">Indirizzo</label><input className="input" value={fc.indirizzo} onChange={e => setFc({...fc,indirizzo:e.target.value})} /></div>
              <div><label className="label">Città</label><input className="input" value={fc.citta} onChange={e => setFc({...fc,citta:e.target.value})} /></div>
              <div><label className="label">Telefono</label><input className="input" value={fc.telefono} onChange={e => setFc({...fc,telefono:e.target.value})} /></div>
              <div><label className="label">Email</label><input className="input" type="email" value={fc.email} onChange={e => setFc({...fc,email:e.target.value})} /></div>
              <div><label className="label">PEC</label><input className="input" value={fc.pec} onChange={e => setFc({...fc,pec:e.target.value})} /></div>
              <div><label className="label">IBAN</label><input className="input" value={fc.iban} onChange={e => setFc({...fc,iban:e.target.value})} /></div>
              <div><label className="label">Termini pagamento (gg)</label><input className="input" type="number" value={fc.termini_pagamento} onChange={e => setFc({...fc,termini_pagamento:e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaCliente} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva cliente'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal fornitore */}
      {modal === 'fornitore' && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuovo fornitore</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Ragione Sociale *</label><input className="input" value={ff.ragione_sociale} onChange={e => setFf({...ff,ragione_sociale:e.target.value})} /></div>
              <div><label className="label">CF / P.IVA</label><input className="input" value={ff.cf_piva} onChange={e => setFf({...ff,cf_piva:e.target.value})} /></div>
              <div><label className="label">Categoria</label>
                <select className="input" value={ff.categoria} onChange={e => setFf({...ff,categoria:e.target.value})}>
                  <option>Materiali</option><option>Subappaltatore</option><option>Nolo Mezzi</option><option>Trasporti</option><option>Servizi</option><option>Utenze</option><option>Altro</option>
                </select></div>
              <div className="col-span-2"><label className="label">Indirizzo</label><input className="input" value={ff.indirizzo} onChange={e => setFf({...ff,indirizzo:e.target.value})} /></div>
              <div><label className="label">Città</label><input className="input" value={ff.citta} onChange={e => setFf({...ff,citta:e.target.value})} /></div>
              <div><label className="label">Telefono</label><input className="input" value={ff.telefono} onChange={e => setFf({...ff,telefono:e.target.value})} /></div>
              <div><label className="label">Email</label><input className="input" value={ff.email} onChange={e => setFf({...ff,email:e.target.value})} /></div>
              <div><label className="label">PEC</label><input className="input" value={ff.pec} onChange={e => setFf({...ff,pec:e.target.value})} /></div>
              <div><label className="label">IBAN</label><input className="input" value={ff.iban} onChange={e => setFf({...ff,iban:e.target.value})} /></div>
              <div><label className="label">Modalità pagamento</label>
                <select className="input" value={ff.modalita_pagamento} onChange={e => setFf({...ff,modalita_pagamento:e.target.value})}>
                  <option>Bonifico</option><option>RiBa</option><option>Contanti</option><option>Assegno</option>
                </select></div>
              <div><label className="label">Termini pagamento (gg)</label><input className="input" type="number" value={ff.termini_pagamento} onChange={e => setFf({...ff,termini_pagamento:e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaFornitore} disabled={loading}>{loading ? 'Salvataggio...' : 'Salva fornitore'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal modifica (cliente o fornitore) */}
      {modalModifica && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">
                Modifica {modalModifica.tipo === 'cliente' ? 'cliente' : 'fornitore'} — {modalModifica.dati.ragione_sociale}
              </h2>
              <button onClick={() => setModalModifica(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Ragione Sociale *</label>
                <input className="input" value={modalModifica.dati.ragione_sociale || ''} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, ragione_sociale: e.target.value}})} /></div>
              <div><label className="label">CF / P.IVA</label>
                <input className="input" value={modalModifica.dati.cf_piva || ''} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, cf_piva: e.target.value}})} /></div>

              {modalModifica.tipo === 'cliente' ? (
                <div><label className="label">Tipo</label>
                  <select className="input" value={modalModifica.dati.tipo || 'Azienda'} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, tipo: e.target.value}})}>
                    <option>Privato</option><option>Azienda</option><option>Ente Pubblico</option><option>Subappaltatore</option>
                  </select></div>
              ) : (
                <div><label className="label">Categoria</label>
                  <select className="input" value={modalModifica.dati.categoria || 'Materiali'} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, categoria: e.target.value}})}>
                    <option>Materiali</option><option>Subappaltatore</option><option>Nolo Mezzi</option><option>Trasporti</option><option>Servizi</option><option>Utenze</option><option>Altro</option>
                  </select></div>
              )}

              <div className="col-span-2"><label className="label">Indirizzo</label>
                <input className="input" value={modalModifica.dati.indirizzo || ''} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, indirizzo: e.target.value}})} /></div>
              <div><label className="label">Città</label>
                <input className="input" value={modalModifica.dati.citta || ''} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, citta: e.target.value}})} /></div>
              <div><label className="label">Telefono</label>
                <input className="input" value={modalModifica.dati.telefono || ''} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, telefono: e.target.value}})} /></div>
              <div><label className="label">Email</label>
                <input className="input" value={modalModifica.dati.email || ''} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, email: e.target.value}})} /></div>
              <div><label className="label">PEC</label>
                <input className="input" value={modalModifica.dati.pec || ''} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, pec: e.target.value}})} /></div>
              <div><label className="label">IBAN</label>
                <input className="input" value={modalModifica.dati.iban || ''} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, iban: e.target.value}})} /></div>

              {modalModifica.tipo === 'fornitore' && (
                <div><label className="label">Modalità pagamento</label>
                  <select className="input" value={modalModifica.dati.modalita_pagamento || 'Bonifico'} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, modalita_pagamento: e.target.value}})}>
                    <option>Bonifico</option><option>RiBa</option><option>Contanti</option><option>Assegno</option>
                  </select></div>
              )}
              <div><label className="label">Termini pagamento (gg)</label>
                <input className="input" type="number" value={modalModifica.dati.termini_pagamento || '30'} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, termini_pagamento: e.target.value}})} /></div>
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
