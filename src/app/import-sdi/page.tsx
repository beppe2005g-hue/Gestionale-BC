'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import * as XLSX from 'xlsx'

const euro = (n: number) => '€ ' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function parseExcelDate(val: any): string {
  if (!val) return ''
  if (typeof val === 'string') {
    const trimmed = val.trim()
    const itMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (itMatch) return `${itMatch[3]}-${itMatch[2].padStart(2,'0')}-${itMatch[1].padStart(2,'0')}`
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.substring(0, 10)
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    return ''
  }
  if (typeof val === 'number') {
    const d = new Date(new Date(1899, 11, 30).getTime() + val * 86400000)
    if (!isNaN(d.getTime()) && d.getFullYear() > 1980 && d.getFullYear() < 2100) return d.toISOString().split('T')[0]
    return ''
  }
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().split('T')[0]
  return ''
}

// Confronto nome fornitore flessibile: rimuove s.r.l., spa, ecc. e confronta le parole chiave
function nomeSimilare(a: string, b: string): boolean {
  const normalizza = (s: string) => s.toLowerCase()
    .replace(/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|soc\.?|scarl|srls|srl|spa|sas|snc)\b/g, '')
    .replace(/[.\-,]/g, ' ').replace(/\s+/g, ' ').trim()
  const na = normalizza(a), nb = normalizza(b)
  return na.includes(nb) || nb.includes(na) || na === nb
}

type Stato = 'ok' | 'duplicato' | 'abbinata' | 'escluso' | 'errore'

type PresetPag = 'saldo' | '30' | '60' | '30/60' | '30/60/90'
interface Rata { importo: number; scadenza: string }
function calcolaRate(totale: number, data: string, preset: PresetPag): Rata[] {
  if (!data) return []
  const d = new Date(data + 'T12:00:00')
  const addGg = (gg: number) => { const x = new Date(d); x.setDate(x.getDate() + gg); return x.toISOString().split('T')[0] }
  if (preset === 'saldo')     return [{ importo: totale, scadenza: addGg(0) }]
  if (preset === '30')        return [{ importo: totale, scadenza: addGg(30) }]
  if (preset === '60')        return [{ importo: totale, scadenza: addGg(60) }]
  if (preset === '30/60')     return [{ importo: +(totale/2).toFixed(2), scadenza: addGg(30) }, { importo: +(totale/2).toFixed(2), scadenza: addGg(60) }]
  if (preset === '30/60/90') {
    const q = +(totale/3).toFixed(2)
    const resto = +(totale - q*2).toFixed(2)
    return [{ importo: q, scadenza: addGg(30) }, { importo: q, scadenza: addGg(60) }, { importo: resto, scadenza: addGg(90) }]
  }
  return [{ importo: totale, scadenza: addGg(0) }]
}

interface RigaRic {
  data: string; numero: string; fornitore: string; piva: string
  totale: number; netto: number; data_ricezione: string; rate: Rata[]
  selezionata: boolean; stato: Stato; motivo?: string
  fattura_esistente?: { id: string; numero: string; data: string; fornitore_nome: string }
  abbinata_a?: string; abbinata_label?: string
}

interface RigaEm {
  data: string; numero: string; cliente: string; piva: string
  totale: number; netto: number; rate: Rata[]
  selezionata: boolean; stato: Stato; motivo?: string
  fattura_esistente?: { id: string; numero: string; data: string; cliente_nome: string }
  abbinata_a?: string; abbinata_label?: string
}

export default function ImportSDI() {
  const [tab, setTab] = useState<'ricevute' | 'emesse' | 'esclusi'>('ricevute')
  const [progetti, setProgetti] = useState<any[]>([])
  const [esclusi, setEsclusi] = useState<any[]>([])
  const [nuovoEscluso, setNuovoEscluso] = useState({ nome: '', piva: '', motivo: '' })

  // Ricevute
  const [righeRic, setRigheRic] = useState<RigaRic[]>([])
  const [loadingRic, setLoadingRic] = useState(false)
  const [importandoRic, setImportandoRic] = useState(false)
  const [risultatoRic, setRisultatoRic] = useState<{importate: number, errori: number} | null>(null)
  const [progettoDefaultRic, setProgettoDefaultRic] = useState('')
  const [presetRic, setPresetRic] = useState<PresetPag>('30')

  // Emesse
  const [righeEm, setRigheEm] = useState<RigaEm[]>([])
  const [loadingEm, setLoadingEm] = useState(false)
  const [importandoEm, setImportandoEm] = useState(false)
  const [risultatoEm, setRisultatoEm] = useState<{importate: number, errori: number} | null>(null)
  const [progettoDefaultEm, setProgettoDefaultEm] = useState('')
  const [presetEm, setPresetEm] = useState<PresetPag>('30')

  // Modal abbinamento manuale
  const [modalAbbina, setModalAbbina] = useState<{ rigaIdx: number; tipo: 'ric' | 'em' } | null>(null)
  const [fattureEsistenti, setFattureEsistenti] = useState<any[]>([])
  const [cercaAbbina, setCercaAbbina] = useState('')

  useEffect(() => {
    supabase.from('progetti').select('id,codice,nome').then(({ data }) => setProgetti(data || []))
    caricaEsclusi()
  }, [])

  async function caricaEsclusi() {
    const { data } = await supabase.from('fornitori_esclusi_import').select('*').order('nome_fornitore')
    setEsclusi(data || [])
  }

  async function aggiungiEscluso() {
    if (!nuovoEscluso.nome.trim()) { alert('Inserisci il nome del fornitore'); return }
    await supabase.from('fornitori_esclusi_import').insert({ nome_fornitore: nuovoEscluso.nome.trim(), piva: nuovoEscluso.piva.trim(), motivo: nuovoEscluso.motivo.trim() })
    setNuovoEscluso({ nome: '', piva: '', motivo: '' })
    caricaEsclusi()
  }

  async function rimuoviEscluso(id: string) {
    if (!confirm('Rimuovere questo fornitore dalla lista di esclusione?')) return
    await supabase.from('fornitori_esclusi_import').delete().eq('id', id)
    caricaEsclusi()
  }

  // ── Apri modal abbinamento manuale ──
  async function apriAbbina(rigaIdx: number, tipo: 'ric' | 'em') {
    setModalAbbina({ rigaIdx, tipo })
    setCercaAbbina('')
    if (tipo === 'ric') {
      const { data } = await supabase.from('fatture_fornitori')
        .select('id,numero,data,fornitore_nome,imponibile')
        .order('data', { ascending: false }).limit(200)
      setFattureEsistenti(data || [])
    } else {
      const { data } = await supabase.from('fatture_clienti')
        .select('id,numero,data,cliente_nome,imponibile')
        .order('data', { ascending: false }).limit(200)
      setFattureEsistenti(data || [])
    }
  }

  function confermaAbbina(fattura: any) {
    if (!modalAbbina) return
    const { rigaIdx, tipo } = modalAbbina
    const label = `${fattura.numero} — ${fattura.fornitore_nome || fattura.cliente_nome} — ${new Date(fattura.data).toLocaleDateString('it-IT')}`
    if (tipo === 'ric') {
      setRigheRic(prev => prev.map((r, i) => i === rigaIdx
        ? { ...r, stato: 'abbinata', selezionata: false, abbinata_a: fattura.id, abbinata_label: label, motivo: 'Abbinata manualmente a fattura esistente' }
        : r))
    } else {
      setRigheEm(prev => prev.map((r, i) => i === rigaIdx
        ? { ...r, stato: 'abbinata', selezionata: false, abbinata_a: fattura.id, abbinata_label: label, motivo: 'Abbinata manualmente a fattura esistente' }
        : r))
    }
    setModalAbbina(null)
  }

  function annullaAbbina(rigaIdx: number, tipo: 'ric' | 'em') {
    if (tipo === 'ric') {
      setRigheRic(prev => prev.map((r, i) => i === rigaIdx
        ? { ...r, stato: 'ok', selezionata: true, abbinata_a: undefined, abbinata_label: undefined, motivo: undefined }
        : r))
    } else {
      setRigheEm(prev => prev.map((r, i) => i === rigaIdx
        ? { ...r, stato: 'ok', selezionata: true, abbinata_a: undefined, abbinata_label: undefined, motivo: undefined }
        : r))
    }
  }

  const fattureFiltrate = fattureEsistenti.filter(f => {
    if (!cercaAbbina.trim()) return true
    const q = cercaAbbina.toLowerCase()
    return (f.numero || '').toLowerCase().includes(q) ||
      (f.fornitore_nome || f.cliente_nome || '').toLowerCase().includes(q)
  })

  // ── LEGGI FILE RICEVUTE ──
  async function leggiFileRicevute(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setLoadingRic(true); setRisultatoRic(null)
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', raw: true })
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }) as any[][]

    let headerRow = -1
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      if (raw[i]?.some((v: any) => String(v) === 'Numero' || String(v) === 'Fornitore')) { headerRow = i; break }
    }
    if (headerRow === -1) { alert('File non riconosciuto.'); setLoadingRic(false); return }

    const headers = raw[headerRow].map((h: any) => String(h || '').trim())
    const col = {
      data: headers.indexOf('Data'), numero: headers.indexOf('Numero'),
      tipo: headers.indexOf('Tipo'), fornitore: headers.indexOf('Fornitore'),
      piva: headers.indexOf('Partita IVA'), totale: headers.indexOf('Tot. documento'),
      netto: headers.indexOf('Netto a pagare'), ricezione: headers.indexOf('Data ricezione'),
    }

    const [{ data: esistenti }, { data: listaEsclusi }] = await Promise.all([
      // Carica tutte le fatture fornitori con numero, nome, piva e data
      supabase.from('fatture_fornitori').select('id,numero,fornitore_nome,data').order('data', { ascending: false }),
      supabase.from('fornitori_esclusi_import').select('nome_fornitore,piva'),
    ])

    const parsed: RigaRic[] = []
    for (let i = headerRow + 1; i < raw.length; i++) {
      const row = raw[i]; if (!row || !row[col.numero]) continue
      const numero = String(row[col.numero] || '').trim()
      const fornitore = String(row[col.fornitore] || '').trim()
      const tipo = String(row[col.tipo] || '').trim().toLowerCase()
      const totale = parseFloat(String(row[col.totale] || '0').replace(',', '.')) || 0
      const netto = parseFloat(String(row[col.netto] || '0').replace(',', '.')) || 0
      const piva = String(row[col.piva] || '').trim()
      if (tipo.includes('reverse') || tipo.includes('integrazione') || (totale === 0 && netto === 0)) continue
      const dataStr = parseExcelDate(row[col.data])
      const dataRicezione = parseExcelDate(row[col.ricezione])

      let stato: Stato = 'ok'
      let motivo = ''
      let fattura_esistente: RigaRic['fattura_esistente'] = undefined

      // 1) Controlla lista esclusioni
      const escluso = listaEsclusi?.find(e =>
        nomeSimilare(fornitore, e.nome_fornitore) || (e.piva && piva && e.piva === piva)
      )
      if (escluso) { stato = 'escluso'; motivo = 'Fornitore in lista esclusioni' }

      if (stato === 'ok') {
        // 2) Rileva duplicato: numero + (nome simile OPPURE P.IVA uguale)
        // Questo cattura anche variazioni di maiuscole/abbreviazioni (Srl vs S.R.L. ecc.)
        const dup = esistenti?.find(e => {
          const numeroMatch = e.numero === numero
          if (!numeroMatch) return false
          const nomeMatch = nomeSimilare(e.fornitore_nome, fornitore)
          // Non abbiamo piva in fatture_fornitori ma possiamo usare solo nome+numero
          return nomeMatch
        })
        if (dup) {
          stato = 'duplicato'
          motivo = `Già presente: N° ${dup.numero} del ${new Date(dup.data).toLocaleDateString('it-IT')}`
          fattura_esistente = { id: dup.id, numero: dup.numero, data: dup.data, fornitore_nome: dup.fornitore_nome }
        }
      }

      parsed.push({ data: dataStr, numero, fornitore, piva, totale, netto, data_ricezione: dataRicezione, rate: calcolaRate(totale, dataStr, presetRic), selezionata: stato === 'ok', stato, motivo, fattura_esistente })
    }
    setRigheRic(parsed); setLoadingRic(false)
  }

  // ── LEGGI FILE EMESSE ──
  async function leggiFileEmesse(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setLoadingEm(true); setRisultatoEm(null)
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', raw: true })
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }) as any[][]

    let headerRow = -1
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      if (raw[i]?.some((v: any) => String(v) === 'Numero' || String(v) === 'Cliente' || String(v).includes('Cessionario'))) { headerRow = i; break }
    }
    if (headerRow === -1) { alert('File non riconosciuto.'); setLoadingEm(false); return }

    const headers = raw[headerRow].map((h: any) => String(h || '').trim())
    const clienteIdx = ['Cliente', 'Cessionario/committente', 'Cessionario', 'Committente', 'Destinatario']
      .map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1
    const col = {
      data: headers.indexOf('Data'), numero: headers.indexOf('Numero'), tipo: headers.indexOf('Tipo'),
      cliente: clienteIdx, piva: headers.indexOf('Partita IVA'),
      totale: headers.indexOf('Tot. documento'), netto: headers.indexOf('Netto a pagare'),
    }

    const { data: esistenti } = await supabase.from('fatture_clienti').select('id,numero,data,cliente_nome')

    const parsed: RigaEm[] = []
    for (let i = headerRow + 1; i < raw.length; i++) {
      const row = raw[i]; if (!row || !row[col.numero]) continue
      const numero = String(row[col.numero] || '').trim()
      const cliente = col.cliente >= 0 ? String(row[col.cliente] || '').trim() : ''
      const tipo = String(row[col.tipo] || '').trim().toLowerCase()
      const totale = parseFloat(String(row[col.totale] || '0').replace(',', '.')) || 0
      const netto = parseFloat(String(row[col.netto] || '0').replace(',', '.')) || 0
      const piva = String(row[col.piva] || '').trim()
      if (tipo.includes('reverse') || tipo.includes('integrazione') || totale < 0) continue
      const dataStr = parseExcelDate(row[col.data])

      let stato: Stato = 'ok'
      let motivo = ''
      let fattura_esistente: RigaEm['fattura_esistente'] = undefined

      const dup = esistenti?.find(e => e.numero === numero && nomeSimilare(e.cliente_nome || '', cliente))
      if (dup) {
        stato = 'duplicato'
        motivo = `Già presente: N° ${dup.numero} del ${new Date(dup.data).toLocaleDateString('it-IT')}`
        fattura_esistente = { id: dup.id, numero: dup.numero, data: dup.data, cliente_nome: dup.cliente_nome }
      }

      parsed.push({ data: dataStr, numero, cliente, piva, totale, netto, rate: calcolaRate(totale, dataStr, presetEm), selezionata: stato === 'ok', stato, motivo, fattura_esistente })
    }
    setRigheEm(parsed); setLoadingEm(false)
  }

  // ── IMPORTA RICEVUTE ──
  async function eseguiImportRicevute() {
    const daImportare = righeRic.filter(r => r.selezionata && r.stato === 'ok')
    if (daImportare.length === 0) { alert('Nessuna fattura selezionata.'); return }
    if (!confirm(`Importare ${daImportare.length} fatture con modalità ${presetRic}?`)) return
    setImportandoRic(true)
    let importate = 0, errori = 0
    for (const r of daImportare) {
      try {
        let { data: fornExist } = await supabase.from('fornitori').select('id').ilike('ragione_sociale', `%${r.fornitore}%`).limit(1)
        let fornitoreId = fornExist?.[0]?.id
        if (!fornitoreId) {
          const { data: nf } = await supabase.from('fornitori').insert({ ragione_sociale: r.fornitore, cf_piva: r.piva, categoria: 'Altro', attivo: true }).select('id').single()
          fornitoreId = nf?.id
        }
        const imponibile = r.netto > 0 ? r.netto : r.totale
        const ivaPerc = r.totale > 0 && r.netto > 0 && r.totale !== r.netto ? Math.round((r.totale / r.netto - 1) * 100) : 22
        const prj = progettoDefaultRic ? progetti.find(p => p.id === progettoDefaultRic) : null
        const rateFields: Record<string,any> = {}
        r.rate.forEach((rt, i) => {
          rateFields[`rata${i+1}_importo`] = rt.importo
          rateFields[`rata${i+1}_scadenza`] = rt.scadenza || null
          rateFields[`rata${i+1}_stato`] = 'Da Pagare'
        })
        const { error } = await supabase.from('fatture_fornitori').insert({
          data: r.data || new Date().toISOString().split('T')[0],
          numero: r.numero, fornitore_id: fornitoreId || null, fornitore_nome: r.fornitore,
          progetto_id: progettoDefaultRic || null, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
          imponibile, iva_percentuale: ivaPerc, ...rateFields,
          note: `SDI - Ricezione: ${r.data_ricezione}`
        })
        if (error) errori++; else importate++
      } catch { errori++ }
    }
    setImportandoRic(false); setRisultatoRic({ importate, errori })
    setRigheRic(prev => prev.map(r => r.selezionata && r.stato === 'ok'
      ? { ...r, stato: 'duplicato', motivo: 'Appena importata', selezionata: false } : r))
  }

  // ── IMPORTA EMESSE ──
  async function eseguiImportEmesse() {
    const daImportare = righeEm.filter(r => r.selezionata && r.stato === 'ok')
    if (daImportare.length === 0) { alert('Nessuna fattura selezionata.'); return }
    if (!confirm(`Importare ${daImportare.length} fatture clienti con modalità ${presetEm}?`)) return
    setImportandoEm(true)
    let importate = 0, errori = 0
    for (const r of daImportare) {
      try {
        let { data: cliExist } = await supabase.from('clienti').select('id').ilike('ragione_sociale', `%${r.cliente}%`).limit(1)
        let clienteId = cliExist?.[0]?.id
        if (!clienteId && r.cliente) {
          const { data: nc } = await supabase.from('clienti').insert({ ragione_sociale: r.cliente, cf_piva: r.piva, attivo: true }).select('id').single()
          clienteId = nc?.id
        }
        const imponibile = r.netto > 0 ? r.netto : r.totale
        const ivaPerc = r.totale > 0 && r.netto > 0 && r.totale !== r.netto ? Math.round((r.totale / r.netto - 1) * 100) : 0
        const prj = progettoDefaultEm ? progetti.find(p => p.id === progettoDefaultEm) : null
        const rateFieldsEm: Record<string,any> = {}
        r.rate.forEach((rt, i) => {
          rateFieldsEm[`rata${i+1}_importo`] = rt.importo
          rateFieldsEm[`rata${i+1}_scadenza`] = rt.scadenza || null
          rateFieldsEm[`rata${i+1}_stato`] = 'Da Incassare'
        })
        const { error } = await supabase.from('fatture_clienti').insert({
          data: r.data || new Date().toISOString().split('T')[0],
          numero: r.numero, cliente_id: clienteId || null, cliente_nome: r.cliente,
          progetto_id: progettoDefaultEm || null, progetto_nome: prj ? `${prj.codice} - ${prj.nome}` : '',
          imponibile, iva_percentuale: ivaPerc, ...rateFieldsEm,
          note: 'SDI - Import fatture emesse'
        })
        if (error) errori++; else importate++
      } catch { errori++ }
    }
    setImportandoEm(false); setRisultatoEm({ importate, errori })
    setRigheEm(prev => prev.map(r => r.selezionata && r.stato === 'ok'
      ? { ...r, stato: 'duplicato', motivo: 'Appena importata', selezionata: false } : r))
  }

  const nOkRic = righeRic.filter(r => r.stato === 'ok').length
  const nDupRic = righeRic.filter(r => r.stato === 'duplicato').length
  const nEscRic = righeRic.filter(r => r.stato === 'escluso').length
  const nAbbRic = righeRic.filter(r => r.stato === 'abbinata').length
  const nSelRic = righeRic.filter(r => r.selezionata && r.stato === 'ok').length
  const nSenzaScadenzaRic = righeRic.filter(r => r.stato === 'ok' && r.selezionata && (!r.rate || r.rate.length === 0)).length

  const nOkEm = righeEm.filter(r => r.stato === 'ok').length
  const nDupEm = righeEm.filter(r => r.stato === 'duplicato').length
  const nAbbEm = righeEm.filter(r => r.stato === 'abbinata').length
  const nSelEm = righeEm.filter(r => r.selezionata && r.stato === 'ok').length
  const nSenzaScadenzaEm = righeEm.filter(r => r.stato === 'ok' && r.selezionata && (!r.rate || r.rate.length === 0)).length

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Import fatture da SDI</h1>
        </div>

        {/* ── BANNER PROCEDURA ── */}
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
          <div className="px-4 py-2 bg-blue-700 text-white flex items-center gap-2">
            <span className="font-bold text-sm uppercase tracking-wide">📋 Procedura Import SDI — istruzioni operative</span>
          </div>
          <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
            {[
              { n:'1', t:'Aprire Qui Fattura', d:'Vai su Fatture Ricevute (o Emesse)', icon:'🌐' },
              { n:'2', t:'Scaricare l\'Excel', d:'Clicca sull\'icona Excel in alto a sinistra', icon:'📥' },
              { n:'3', t:'Caricare sul Gestionale', d:'Usa il pulsante "Carica file" in questa pagina', icon:'📤' },
              { n:'4', t:'Inserire le scadenze', d:'Seleziona le condizioni di pagamento (30/60/90 gg)', icon:'📅' },
              { n:'5', t:'Stampare le fatture', d:'Torna su Qui Fattura e stampa le nuove fatture', icon:'🖨️' },
            ].map(s => (
              <div key={s.n} className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-blue-100">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-700 text-white rounded-full flex items-center justify-center text-xs font-bold">{s.n}</span>
                <div>
                  <p className="font-semibold text-blue-900">{s.icon} {s.t}</p>
                  <p className="text-blue-600 mt-0.5">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-800">
            <span className="font-bold">N.B.</span> Il gestionale scarta automaticamente le fatture già registrate — puoi ricaricare lo stesso file senza rischi di duplicati.
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('ricevute')} className={`btn ${tab === 'ricevute' ? 'btn-primary' : ''}`}>📥 Fatture ricevute</button>
          <button onClick={() => setTab('emesse')} className={`btn ${tab === 'emesse' ? 'btn-primary' : ''}`}>📤 Fatture emesse</button>
          <button onClick={() => setTab('esclusi')} className={`btn ${tab === 'esclusi' ? 'btn-primary' : ''}`}>🚫 Fornitori esclusi ({esclusi.length})</button>
        </div>

        {/* ── TAB RICEVUTE ── */}
        {tab === 'ricevute' && (
          <>
            <div className="card mb-4">
              <h3 className="text-sm font-medium mb-3">Carica file Excel SDI — Fatture ricevute dai fornitori</h3>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3 text-xs text-blue-700 space-y-1">
                <p>🔍 Il sistema rileva automaticamente i duplicati per <strong>numero fattura + nome fornitore</strong> (tollerante a variazioni di maiuscole e abbreviazioni tipo Srl/S.R.L.).</p>
                <p>🔗 Per fatture già inserite a mano che l'SDI non riconosce come duplicate, usa il bottone <strong>Abbina</strong> per collegarle manualmente senza creare un secondo record.</p>
              </div>
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <label className="btn btn-primary cursor-pointer">📂 Scegli file .xlsx
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={leggiFileRicevute} />
                  </label>
                  <p className="text-xs text-gray-400 mt-1">RC e integrazioni escluse automaticamente</p>
                </div>
                <div className="flex-1 min-w-52">
                  <label className="label">Cantiere di default (opzionale)</label>
                  <select className="input" value={progettoDefaultRic} onChange={e => setProgettoDefaultRic(e.target.value)}>
                    <option value="">— nessun cantiere —</option>
                    {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {loadingRic && <div className="card text-center py-8 text-gray-500">Analisi file in corso...</div>}
            {risultatoRic && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <p className="font-medium text-green-800">✅ Import completato — {risultatoRic.importate} fatture importate{risultatoRic.errori > 0 && ` · ❌ ${risultatoRic.errori} errori`}</p>
              </div>
            )}

            {righeRic.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                  <div className="flex gap-4 text-sm flex-wrap">
                    <span className="text-green-700 font-medium">✅ Da importare: {nOkRic}</span>
                    <span className="text-amber-700">⚠️ Già presenti: {nDupRic}</span>
                    {nEscRic > 0 && <span className="text-gray-500">🚫 Esclusi: {nEscRic}</span>}
                    {nAbbRic > 0 && <span className="text-blue-600">🔗 Abbinate: {nAbbRic}</span>}
                    {nSenzaScadenzaRic > 0 && <span className="text-red-600">⚠️ Senza scadenza: {nSenzaScadenzaRic}</span>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn btn-sm" onClick={() => setRigheRic(prev => prev.map(r => ({ ...r, selezionata: r.stato === 'ok' })))}>Seleziona tutti ok</button>
                    <button className="btn btn-sm" onClick={() => setRigheRic(prev => prev.map(r => ({ ...r, selezionata: false })))}>Deseleziona</button>
                    <button className="btn btn-primary btn-sm" onClick={eseguiImportRicevute} disabled={importandoRic || nSelRic === 0}>
                      {importandoRic ? 'Importazione...' : `Importa ${nSelRic} fatture`}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex-wrap">
                  <span className="text-xs text-blue-800 font-semibold flex-shrink-0">💳 Condizioni pagamento:</span>
                  {(['saldo','30','60','30/60','30/60/90'] as PresetPag[]).map(p => (
                    <button key={p} onClick={() => {
                      setPresetRic(p)
                      setRigheRic(prev => prev.map(r => r.stato === 'ok' ? { ...r, rate: calcolaRate(r.totale, r.data, p) } : r))
                    }} className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${presetRic === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-100'}`}>
                      {p === 'saldo' ? 'Saldo immediato' : `${p} gg`}
                    </button>
                  ))}
                  <span className="text-xs text-blue-500 ml-1">— Si applica a tutte le righe da importare</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr><th style={{width:36}}></th><th>Data</th><th>N° Fattura</th><th>Fornitore</th><th>Totale</th><th>Netto</th><th>Rate / Scadenze</th><th>Stato</th><th></th></tr>
                    </thead>
                    <tbody>
                      {righeRic.map((r, i) => (
                        <tr key={i} className={
                          r.stato === 'duplicato' ? 'opacity-50 bg-amber-50' :
                          r.stato === 'abbinata' ? 'bg-blue-50' :
                          r.stato === 'escluso' ? 'opacity-40 bg-gray-50' :
                          r.selezionata ? 'bg-green-50' : ''
                        }>
                          <td>{r.stato === 'ok' && <input type="checkbox" checked={r.selezionata} onChange={() => setRigheRic(prev => prev.map((x, j) => j === i ? { ...x, selezionata: !x.selezionata } : x))} />}</td>
                          <td className="text-xs">{r.data ? new Date(r.data).toLocaleDateString('it-IT') : <span className="text-red-500">—</span>}</td>
                          <td className="font-medium text-xs">{r.numero}</td>
                          <td className="text-xs">{r.fornitore}</td>
                          <td className="text-sm font-medium">{euro(r.totale)}</td>
                          <td className="text-sm">{euro(r.netto)}</td>
                          <td className="min-w-52">
                            {r.stato === 'ok' ? (
                              <div className="space-y-1">
                                {(r.rate || []).map((rt, ri) => (
                                  <div key={ri} className="flex items-center gap-1">
                                    <span className="text-xs text-gray-400 w-14 flex-shrink-0">Rata {ri+1}:</span>
                                    <input type="date" className="input text-xs py-0.5 w-32"
                                      value={rt.scadenza}
                                      onChange={e => setRigheRic(prev => prev.map((x, j) => j !== i ? x : {
                                        ...x, rate: x.rate.map((rr, rj) => rj === ri ? { ...rr, scadenza: e.target.value } : rr)
                                      }))} />
                                    <span className="text-xs font-semibold text-gray-600 ml-1">{euro(rt.importo)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td className="min-w-32">
                            {r.stato === 'ok' && <span className="badge badge-green">Da importare</span>}
                            {r.stato === 'duplicato' && (
                              <div>
                                <span className="badge badge-amber">Già presente</span>
                                {r.fattura_esistente && <p className="text-xs text-amber-700 mt-0.5">{r.motivo}</p>}
                              </div>
                            )}
                            {r.stato === 'abbinata' && (
                              <div>
                                <span className="badge" style={{background:'#dbeafe',color:'#1e40af'}}>🔗 Abbinata</span>
                                <p className="text-xs text-blue-600 mt-0.5 max-w-40 truncate" title={r.abbinata_label}>{r.abbinata_label}</p>
                              </div>
                            )}
                            {r.stato === 'escluso' && <span className="badge badge-gray">🚫 Escluso</span>}
                          </td>
                          <td>
                            {r.stato === 'ok' && (
                              <button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50 text-xs" onClick={() => apriAbbina(i, 'ric')} title="Abbina a fattura già presente">🔗 Abbina</button>
                            )}
                            {r.stato === 'abbinata' && (
                              <button className="btn btn-sm text-gray-400 text-xs" onClick={() => annullaAbbina(i, 'ric')}>✕ Sgancia</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TAB EMESSE ── */}
        {tab === 'emesse' && (
          <>
            <div className="card mb-4">
              <h3 className="text-sm font-medium mb-3">Carica file Excel SDI — Fatture emesse verso clienti</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-xs text-blue-700">
                📌 Le fatture emesse vengono importate in <strong>Fatture Clienti</strong>. Note di credito e RC escluse automaticamente. Usa <strong>🔗 Abbina</strong> per collegare a fatture già inserite a mano.
              </div>
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <label className="btn btn-primary cursor-pointer">📂 Scegli file .xlsx
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={leggiFileEmesse} />
                  </label>
                  <p className="text-xs text-gray-400 mt-1">Note di credito escluse automaticamente</p>
                </div>
                <div className="flex-1 min-w-52">
                  <label className="label">Cantiere di default (opzionale)</label>
                  <select className="input" value={progettoDefaultEm} onChange={e => setProgettoDefaultEm(e.target.value)}>
                    <option value="">— nessun cantiere —</option>
                    {progetti.map(p => <option key={p.id} value={p.id}>{p.codice} - {p.nome}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {loadingEm && <div className="card text-center py-8 text-gray-500">Analisi file in corso...</div>}
            {risultatoEm && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <p className="font-medium text-green-800">✅ Import completato — {risultatoEm.importate} fatture clienti importate{risultatoEm.errori > 0 && ` · ❌ ${risultatoEm.errori} errori`}</p>
              </div>
            )}

            {righeEm.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                  <div className="flex gap-4 text-sm flex-wrap">
                    <span className="text-green-700 font-medium">✅ Da importare: {nOkEm}</span>
                    <span className="text-amber-700">⚠️ Già presenti: {nDupEm}</span>
                    {nAbbEm > 0 && <span className="text-blue-600">🔗 Abbinate: {nAbbEm}</span>}
                    {nSenzaScadenzaEm > 0 && <span className="text-red-600">⚠️ Senza scadenza: {nSenzaScadenzaEm}</span>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn btn-sm" onClick={() => setRigheEm(prev => prev.map(r => ({ ...r, selezionata: r.stato === 'ok' })))}>Seleziona tutti ok</button>
                    <button className="btn btn-sm" onClick={() => setRigheEm(prev => prev.map(r => ({ ...r, selezionata: false })))}>Deseleziona</button>
                    <button className="btn btn-primary btn-sm" onClick={eseguiImportEmesse} disabled={importandoEm || nSelEm === 0}>
                      {importandoEm ? 'Importazione...' : `Importa ${nSelEm} fatture`}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex-wrap">
                  <span className="text-xs text-blue-800 font-semibold flex-shrink-0">💳 Condizioni incasso:</span>
                  {(['saldo','30','60','30/60','30/60/90'] as PresetPag[]).map(p => (
                    <button key={p} onClick={() => {
                      setPresetEm(p)
                      setRigheEm(prev => prev.map(r => r.stato === 'ok' ? { ...r, rate: calcolaRate(r.totale, r.data, p) } : r))
                    }} className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${presetEm === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-100'}`}>
                      {p === 'saldo' ? 'Saldo immediato' : `${p} gg`}
                    </button>
                  ))}
                  <span className="text-xs text-blue-500 ml-1">— Si applica a tutte le righe da importare</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead><tr><th style={{width:36}}></th><th>Data</th><th>N° Fattura</th><th>Cliente</th><th>Totale</th><th>Netto</th><th>Rate / Scadenze</th><th>Stato</th><th></th></tr></thead>
                    <tbody>
                      {righeEm.map((r, i) => (
                        <tr key={i} className={
                          r.stato === 'duplicato' ? 'opacity-50 bg-amber-50' :
                          r.stato === 'abbinata' ? 'bg-blue-50' :
                          r.selezionata ? 'bg-blue-50' : ''
                        }>
                          <td>{r.stato === 'ok' && <input type="checkbox" checked={r.selezionata} onChange={() => setRigheEm(prev => prev.map((x, j) => j === i ? { ...x, selezionata: !x.selezionata } : x))} />}</td>
                          <td className="text-xs">{r.data ? new Date(r.data).toLocaleDateString('it-IT') : <span className="text-red-500">—</span>}</td>
                          <td className="font-medium text-xs">{r.numero}</td>
                          <td className="text-xs">{r.cliente || <span className="text-gray-400">—</span>}</td>
                          <td className="text-sm font-medium">{euro(r.totale)}</td>
                          <td className="text-sm">{euro(r.netto)}</td>
                          <td className="min-w-52">
                            {r.stato === 'ok' ? (
                              <div className="space-y-1">
                                {(r.rate || []).map((rt, ri) => (
                                  <div key={ri} className="flex items-center gap-1">
                                    <span className="text-xs text-gray-400 w-14 flex-shrink-0">Rata {ri+1}:</span>
                                    <input type="date" className="input text-xs py-0.5 w-32"
                                      value={rt.scadenza}
                                      onChange={e => setRigheEm(prev => prev.map((x, j) => j !== i ? x : {
                                        ...x, rate: x.rate.map((rr, rj) => rj === ri ? { ...rr, scadenza: e.target.value } : rr)
                                      }))} />
                                    <span className="text-xs font-semibold text-gray-600 ml-1">{euro(rt.importo)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td>
                            {r.stato === 'ok' && <span className="badge badge-green">Da importare</span>}
                            {r.stato === 'duplicato' && (
                              <div>
                                <span className="badge badge-amber">Già presente</span>
                                {r.fattura_esistente && <p className="text-xs text-amber-700 mt-0.5">{r.motivo}</p>}
                              </div>
                            )}
                            {r.stato === 'abbinata' && (
                              <div>
                                <span className="badge" style={{background:'#dbeafe',color:'#1e40af'}}>🔗 Abbinata</span>
                                <p className="text-xs text-blue-600 mt-0.5 max-w-40 truncate">{r.abbinata_label}</p>
                              </div>
                            )}
                          </td>
                          <td>
                            {r.stato === 'ok' && (
                              <button className="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50 text-xs" onClick={() => apriAbbina(i, 'em')}>🔗 Abbina</button>
                            )}
                            {r.stato === 'abbinata' && (
                              <button className="btn btn-sm text-gray-400 text-xs" onClick={() => annullaAbbina(i, 'em')}>✕ Sgancia</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TAB ESCLUSI ── */}
        {tab === 'esclusi' && (
          <>
            <div className="card mb-4">
              <h3 className="text-sm font-medium mb-3">Aggiungi fornitore da escludere</h3>
              <p className="text-xs text-gray-500 mb-3">Le fatture di questi fornitori verranno scartate automaticamente ad ogni import SDI.</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Nome fornitore *</label><input className="input" placeholder="es. Enel Energia S.p.A." value={nuovoEscluso.nome} onChange={e => setNuovoEscluso({...nuovoEscluso, nome: e.target.value})} /></div>
                <div><label className="label">P.IVA (opzionale)</label><input className="input" placeholder="es. 15844561009" value={nuovoEscluso.piva} onChange={e => setNuovoEscluso({...nuovoEscluso, piva: e.target.value})} /></div>
                <div><label className="label">Motivo (opzionale)</label><input className="input" placeholder="es. Utenza elettrica" value={nuovoEscluso.motivo} onChange={e => setNuovoEscluso({...nuovoEscluso, motivo: e.target.value})} /></div>
              </div>
              <div className="flex justify-end mt-3"><button className="btn btn-primary" onClick={aggiungiEscluso}>+ Aggiungi alla lista</button></div>
            </div>
            <div className="card">
              <h3 className="text-sm font-medium mb-3">Fornitori esclusi ({esclusi.length})</h3>
              {esclusi.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">Nessun fornitore in lista.</p> : (
                <table className="table-base">
                  <thead><tr><th>Nome fornitore</th><th>P.IVA</th><th>Motivo</th><th></th></tr></thead>
                  <tbody>
                    {esclusi.map(e => (
                      <tr key={e.id}>
                        <td className="font-medium text-sm">{e.nome_fornitore}</td>
                        <td className="text-xs text-gray-500">{e.piva || '—'}</td>
                        <td className="text-xs text-gray-500">{e.motivo || '—'}</td>
                        <td><button className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => rimuoviEscluso(e.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>

      {/* ════════ MODAL ABBINAMENTO MANUALE ════════ */}
      {modalAbbina && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold">🔗 Abbina a fattura esistente</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Riga SDI: <strong>
                    {modalAbbina.tipo === 'ric'
                      ? `${righeRic[modalAbbina.rigaIdx]?.numero} — ${righeRic[modalAbbina.rigaIdx]?.fornitore}`
                      : `${righeEm[modalAbbina.rigaIdx]?.numero} — ${righeEm[modalAbbina.rigaIdx]?.cliente}`}
                  </strong>
                </p>
              </div>
              <button onClick={() => setModalAbbina(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <input className="input" placeholder="🔍 Cerca per numero o nome..." value={cercaAbbina} onChange={e => setCercaAbbina(e.target.value)} autoFocus />
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {fattureFiltrate.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nessuna fattura trovata.</p>
              ) : (
                <div className="space-y-1">
                  {fattureFiltrate.slice(0, 50).map(f => (
                    <div key={f.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => confermaAbbina(f)}>
                      <div>
                        <p className="text-sm font-medium">{f.numero}</p>
                        <p className="text-xs text-gray-500">{f.fornitore_nome || f.cliente_nome} — {new Date(f.data).toLocaleDateString('it-IT')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-700">{euro(f.imponibile)}</p>
                        <p className="text-xs text-blue-600">Clicca per abbinare →</p>
                      </div>
                    </div>
                  ))}
                  {fattureFiltrate.length > 50 && <p className="text-xs text-gray-400 text-center pt-2">Affina la ricerca per vedere altri risultati.</p>}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
              <button className="btn" onClick={() => setModalAbbina(null)}>Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
