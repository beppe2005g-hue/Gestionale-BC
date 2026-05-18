'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const euro = (n: number) => '€ ' + Math.round(n || 0).toLocaleString('it-IT')

export default function CashFlow() {
  const [movimenti, setMovimenti] = useState<any[]>([])
  const [saldo, setSaldo] = useState(0)
  const [mensile, setMensile] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ data: '', descrizione: '', conto: 'Conto 1', tipologia: 'Altro', entrata: '', uscita: '', note: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('cash_flow').select('*').order('data', { ascending: false })
    if (!data) return
    setMovimenti(data)
    const s = data.reduce((acc, m) => acc + (m.entrata || 0) - (m.uscita || 0), 0)
    setSaldo(s)
    const mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
    const anno = new Date().getFullYear()
    const md = mesi.map((m, i) => {
      const filt = data.filter(r => r.data?.startsWith(`${anno}-${String(i+1).padStart(2,'0')}`))
      return {
        mese: m,
        entrate: filt.reduce((s, r) => s + (r.entrata || 0), 0),
        uscite: filt.reduce((s, r) => s + (r.uscita || 0), 0),
      }
    })
    setMensile(md)
  }

  async function salva() {
    if (!form.descrizione) { alert('Inserisci una descrizione'); return }
    await supabase.from('cash_flow').insert({
      data: form.data || new Date().toISOString().split('T')[0],
      descrizione: form.descrizione, conto: form.conto, tipologia: form.tipologia,
      entrata: parseFloat(form.entrata) || 0, uscita: parseFloat(form.uscita) || 0,
    })
    setModal(false)
    setForm({ data: '', descrizione: '', conto: 'Conto 1', tipologia: 'Altro', entrata: '', uscita: '', note: '' })
    load()
  }

  let saldoProg = 0

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Cash flow</h1>
          <button className="btn btn-primary text-sm" onClick={() => setModal(true)}>+ Movimento manuale</button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Saldo progressivo reale</p>
            <p className={`text-2xl font-semibold ${saldo >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{euro(saldo)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Totale entrate</p>
            <p className="text-2xl font-semibold text-green-700">{euro(movimenti.reduce((s, m) => s + (m.entrata || 0), 0))}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Totale uscite</p>
            <p className="text-2xl font-semibold text-red-700">{euro(movimenti.reduce((s, m) => s + (m.uscita || 0), 0))}</p>
          </div>
        </div>

        <div className="card mb-4">
          <h3 className="text-sm font-medium text-gray-600 mb-3">Entrate vs Uscite mensili</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mensile} margin={{ top: 0, right: 0, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'k' : String(v)} />
              <Tooltip formatter={(v: number) => euro(v)} />
              <Bar dataKey="entrate" name="Entrate" fill="#3B6D11" radius={[2,2,0,0]} />
              <Bar dataKey="uscite" name="Uscite" fill="#A32D2D" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card overflow-x-auto">
          <h3 className="text-sm font-medium text-gray-600 mb-3">Registro movimenti</h3>
          <table className="table-base">
            <thead><tr><th>Data</th><th>Descrizione</th><th>Conto</th><th>Tipologia</th><th>Entrata</th><th>Uscita</th><th>Saldo prog.</th></tr></thead>
            <tbody>
              {[...movimenti].reverse().map((m, i) => {
                saldoProg += (m.entrata || 0) - (m.uscita || 0)
                const sp = saldoProg
                return (
                  <tr key={m.id}>
                    <td className="text-xs">{new Date(m.data).toLocaleDateString('it-IT')}</td>
                    <td className="text-sm">{m.descrizione}</td>
                    <td className="text-xs text-gray-500">{m.conto}</td>
                    <td className="text-xs text-gray-500">{m.tipologia}</td>
                    <td className="text-sm font-medium text-green-700">{m.entrata > 0 ? euro(m.entrata) : '—'}</td>
                    <td className="text-sm font-medium text-red-700">{m.uscita > 0 ? euro(m.uscita) : '—'}</td>
                    <td className={`text-sm font-medium ${sp >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{euro(sp)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nuovo movimento</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Data</label><input className="input" type="date" value={form.data} onChange={e => setForm({...form, data: e.target.value})} /></div>
              <div><label className="label">Conto</label>
                <select className="input" value={form.conto} onChange={e => setForm({...form, conto: e.target.value})}>
                  <option>Conto 1</option><option>Conto 2</option><option>Conto 3</option>
                </select></div>
              <div className="col-span-2"><label className="label">Descrizione *</label><input className="input" value={form.descrizione} onChange={e => setForm({...form, descrizione: e.target.value})} /></div>
              <div><label className="label">Tipologia</label>
                <select className="input" value={form.tipologia} onChange={e => setForm({...form, tipologia: e.target.value})}>
                  <option>Pagamento Fornitore</option><option>Incasso Cliente</option><option>Costo Operativo</option><option>Stipendi</option><option>Entrata Finanziaria</option><option>Trasferimento</option><option>Altro</option>
                </select></div>
              <div></div>
              <div><label className="label">Entrata (€)</label><input className="input" type="number" step="0.01" value={form.entrata} onChange={e => setForm({...form, entrata: e.target.value})} /></div>
              <div><label className="label">Uscita (€)</label><input className="input" type="number" step="0.01" value={form.uscita} onChange={e => setForm({...form, uscita: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva}>Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
