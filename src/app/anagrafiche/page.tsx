'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

export default function Anagrafiche() {
  const [tab, setTab] = useState<'clienti'|'fornitori'>('clienti')
  const [clienti, setClienti] = useState<any[]>([])
  const [fornitori, setFornitori] = useState<any[]>([])
  const [categorie, setCategorie] = useState<string[]>([])
  const [modal, setModal] = useState<'cliente'|'fornitore'|null>(null)
  const [modalModifica, setModalModifica] = useState<{tipo:'cliente'|'fornitore', dati:any}|null>(null)
  const [modalCategorie, setModalCategorie] = useState(false)
  const [nuovaCategoria, setNuovaCategoria] = useState('')
  const [loading, setLoading] = useState(false)

  // Ricerca
  const [cercaClienti, setCercaClienti] = useState('')
  const [cercaFornitori, setCercaFornitori] = useState('')
  const [filtroCategoriaFornitori, setFiltroCategoriaFornitori] = useState('')

  const [fc, setFc] = useState({ ragione_sociale:'',cf_piva:'',tipo:'Azienda',indirizzo:'',citta:'',email:'',pec:'',telefono:'',iban:'',termini_pagamento:'30' })
  const [ff, setFf] = useState({ ragione_sociale:'',cf_piva:'',categoria:'Magazzini',indirizzo:'',citta:'',email:'',pec:'',telefono:'',iban:'',termini_pagamento:'30',modalita_pagamento:'Bonifico' })

  useEffect(() => {
    load()
    window.addEventListener('gestionale:refresh', load)
    return () => window.removeEventListener('gestionale:refresh', load)
  }, [])

  async function load() {
    const [{ data: c }, { data: f }, { data: cat }] = await Promise.all([
      supabase.from('clienti').select('*').order('ragione_sociale'),
      supabase.from('fornitori').select('*').order('ragione_sociale'),
      supabase.from('categorie_fornitori').select('nome,ordine').order('ordine').order('nome'),
    ])
    setClienti(c || [])
    setFornitori(f || [])
    setCategorie((cat || []).map((x: any) => x.nome))
  }

  // ── Clienti filtrati ──
  const clientiFiltrati = useMemo(() => {
    if (!cercaClienti.trim()) return clienti
    const q = cercaClienti.toLowerCase()
    return clienti.filter(c =>
      c.ragione_sociale?.toLowerCase().includes(q) ||
      c.cf_piva?.toLowerCase().includes(q) ||
      c.citta?.toLowerCase().includes(q)
    )
  }, [clienti, cercaClienti])

  // ── Fornitori filtrati e raggruppati per categoria ──
  const fornitoriFiltratiGruppi = useMemo(() => {
    let f = fornitori
    if (cercaFornitori.trim()) {
      const q = cercaFornitori.toLowerCase()
      f = f.filter(x =>
        x.ragione_sociale?.toLowerCase().includes(q) ||
        x.cf_piva?.toLowerCase().includes(q) ||
        x.citta?.toLowerCase().includes(q)
      )
    }
    if (filtroCategoriaFornitori) {
      f = f.filter(x => x.categoria === filtroCategoriaFornitori)
    }
    // Raggruppa per categoria mantenendo l'ordine delle categorie
    const gruppi: Record<string, any[]> = {}
    f.forEach(x => {
      const cat = x.categoria || 'Altro'
      if (!gruppi[cat]) gruppi[cat] = []
      gruppi[cat].push(x)
    })
    // Ordina i gruppi secondo l'ordine delle categorie
    const ordinati: { cat: string, items: any[] }[] = []
    categorie.forEach(cat => {
      if (gruppi[cat]) ordinati.push({ cat, items: gruppi[cat] })
    })
    // Categorie non in lista (es. vecchie categorie)
    Object.keys(gruppi).forEach(cat => {
      if (!categorie.includes(cat)) ordinati.push({ cat, items: gruppi[cat] })
    })
    return ordinati
  }, [fornitori, cercaFornitori, filtroCategoriaFornitori, categorie])

  async function salvaNuovaCategoria() {
    const nome = nuovaCategoria.trim()
    if (!nome) return
    if (categorie.includes(nome)) { alert('Categoria già esistente'); return }
    const { error } = await supabase.from('categorie_fornitori').insert({ nome, ordine: 50 })
    if (error) { alert('Errore: ' + error.message); return }
    setNuovaCategoria('')
    load()
  }

  async function eliminaCategoria(nome: string) {
    const inUso = fornitori.some(f => f.categoria === nome)
    if (inUso) { alert(`La categoria "${nome}" è usata da alcuni fornitori. Riassegnali prima di eliminarla.`); return }
    if (!confirm(`Eliminare la categoria "${nome}"?`)) return
    await supabase.from('categorie_fornitori').delete().eq('nome', nome)
    load()
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
    setFf({ ragione_sociale:'',cf_piva:'',categoria:'Magazzini',indirizzo:'',citta:'',email:'',pec:'',telefono:'',iban:'',termini_pagamento:'30',modalita_pagamento:'Bonifico' })
    load()
  }

  async function toggleAttivo(tipo: string, id: string, attivo: boolean) {
    await supabase.from(tipo).update({ attivo: !attivo }).eq('id', id)
    load()
  }

  async function elimina(tipo: 'clienti'|'fornitori', id: string, nome: string) {
    if (!confirm(`Eliminare definitivamente "${nome}"?\nSe è collegato a DDT o fatture esistenti l'operazione potrebbe non riuscire.`)) return
    const { error } = await supabase.from(tipo).delete().eq('id', id)
    if (error) {
      alert('Impossibile eliminare: è collegato a DDT o fatture esistenti. Puoi solo disattivarlo.\n\n' + error.message)
      return
    }
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
            {tab === 'fornitori' && (
              <button className="btn text-sm" onClick={() => setModalCategorie(true)}>⚙️ Categorie</button>
            )}
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

        {/* ── TAB CLIENTI ── */}
        {tab === 'clienti' && (
          <>
            <div className="card mb-3">
              <input className="input" placeholder="🔍 Cerca per nome, P.IVA, città..."
                value={cercaClienti} onChange={e => setCercaClienti(e.target.value)} />
              {cercaClienti && (
                <p className="text-xs text-gray-500 mt-2">{clientiFiltrati.length} su {clienti.length} clienti</p>
              )}
            </div>
            <div className="card overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Ragione Sociale</th><th>CF / P.IVA</th><th>Tipo</th><th>Email</th><th>Telefono</th><th>Termini</th><th>Stato</th><th></th></tr></thead>
                <tbody>
                  {clientiFiltrati.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-gray-400 py-8">
                      {cercaClienti ? 'Nessun cliente trovato con questa ricerca.' : 'Nessun cliente. Aggiungine uno.'}
                    </td></tr>
                  ) : clientiFiltrati.map(c => (
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
                        <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50 ml-1" onClick={() => elimina('clienti', c.id, c.ragione_sociale)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── TAB FORNITORI ── */}
        {tab === 'fornitori' && (
          <>
            <div className="card mb-3">
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-48">
                  <input className="input" placeholder="🔍 Cerca per nome, P.IVA, città..."
                    value={cercaFornitori} onChange={e => setCercaFornitori(e.target.value)} />
                </div>
                <div className="min-w-44">
                  <select className="input" value={filtroCategoriaFornitori} onChange={e => setFiltroCategoriaFornitori(e.target.value)}>
                    <option value="">Tutte le categorie</option>
                    {categorie.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {(cercaFornitori || filtroCategoriaFornitori) && (
                  <button className="btn btn-sm" onClick={() => { setCercaFornitori(''); setFiltroCategoriaFornitori('') }}>× Reset</button>
                )}
              </div>
              {(cercaFornitori || filtroCategoriaFornitori) && (
                <p className="text-xs text-gray-500 mt-2">
                  {fornitoriFiltratiGruppi.reduce((s, g) => s + g.items.length, 0)} su {fornitori.length} fornitori
                </p>
              )}
            </div>

            {fornitoriFiltratiGruppi.length === 0 ? (
              <div className="card text-center py-8 text-gray-400">
                {cercaFornitori || filtroCategoriaFornitori ? 'Nessun fornitore trovato con questa ricerca.' : 'Nessun fornitore. Aggiungine uno.'}
              </div>
            ) : (
              <div className="space-y-4">
                {fornitoriFiltratiGruppi.map(({ cat, items }) => (
                  <div key={cat}>
                    {/* Intestazione categoria */}
                    <div className="flex items-center gap-3 mb-2">
                      <span className="badge badge-amber text-sm px-3 py-1">{cat}</span>
                      <span className="text-xs text-gray-400">{items.length} fornitori</span>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                    <div className="card overflow-x-auto p-0">
                      <table className="table-base">
                        <thead><tr><th>Ragione Sociale</th><th>CF / P.IVA</th><th>Email</th><th>Telefono</th><th>Pagamento</th><th>Stato</th><th></th></tr></thead>
                        <tbody>
                          {items.map(f => (
                            <tr key={f.id} className="cursor-pointer hover:bg-gray-50" onClick={() => apriModificaFornitore(f)}>
                              <td className="font-medium text-sm">{f.ragione_sociale}</td>
                              <td className="text-xs text-gray-500">{f.cf_piva || '—'}</td>
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
                                <button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50 ml-1" onClick={() => elimina('fornitori', f.id, f.ragione_sociale)}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* ── MODAL GESTIONE CATEGORIE ── */}
      {modalCategorie && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Categorie fornitori</h2>
              <button onClick={() => setModalCategorie(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-2 mb-4">
              {categorie.map(cat => (
                <div key={cat} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-gray-800">{cat}</span>
                  <button className="text-gray-300 hover:text-red-500 text-sm"
                    onClick={() => eliminaCategoria(cat)} title="Elimina categoria">✕</button>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Aggiungi nuova categoria</p>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Es. Idraulici, Elettricisti..."
                  value={nuovaCategoria}
                  onChange={e => setNuovaCategoria(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && salvaNuovaCategoria()} />
                <button className="btn btn-primary" onClick={salvaNuovaCategoria}>+ Aggiungi</button>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button className="btn" onClick={() => setModalCategorie(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NUOVO CLIENTE ── */}
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

      {/* ── MODAL NUOVO FORNITORE ── */}
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
                  {categorie.map(c => <option key={c} value={c}>{c}</option>)}
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

      {/* ── MODAL MODIFICA ── */}
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
                  <select className="input" value={modalModifica.dati.categoria || categorie[0] || 'Altro'} onChange={e => setModalModifica({...modalModifica, dati: {...modalModifica.dati, categoria: e.target.value}})}>
                    {categorie.map(c => <option key={c} value={c}>{c}</option>)}
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
