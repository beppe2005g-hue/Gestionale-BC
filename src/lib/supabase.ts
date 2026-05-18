import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type UserRole = 'admin' | 'operatore' | 'cantiere' | 'sola_lettura'

export interface Utente {
  id: string
  email: string
  nome: string
  ruolo: UserRole
  permessi: {
    dashboard: boolean
    progetti: boolean
    ddt: boolean
    fatture_fornitori: boolean
    fatture_clienti: boolean
    scadenzario: boolean
    cashflow: boolean
    anagrafiche: boolean
    utenti: boolean
  }
}

export interface Progetto {
  id: string
  codice: string
  nome: string
  cliente: string
  tipo: string
  responsabile: string
  valore_contratto: number
  budget_costi: number
  data_inizio: string
  data_fine: string
  stato: string
  note: string
  created_at: string
}

export interface Cliente {
  id: string
  ragione_sociale: string
  cf_piva: string
  tipo: string
  indirizzo: string
  citta: string
  email: string
  pec: string
  telefono: string
  iban: string
  termini_pagamento: number
  attivo: boolean
}

export interface Fornitore {
  id: string
  ragione_sociale: string
  cf_piva: string
  categoria: string
  indirizzo: string
  citta: string
  email: string
  pec: string
  telefono: string
  iban: string
  termini_pagamento: number
  modalita_pagamento: string
  attivo: boolean
}

export interface DDT {
  id: string
  data: string
  numero: string
  fornitore_id: string
  fornitore_nome: string
  progetto_id: string
  progetto_nome: string
  descrizione: string
  importo: number
  mese_fattura_previsto: string
  stato: 'Da Fatturare' | 'Fatturato' | 'Parziale'
  fattura_abbinata: string
  note: string
  created_at: string
}

export interface FatturaFornitore {
  id: string
  data: string
  numero: string
  fornitore_id: string
  fornitore_nome: string
  progetto_id: string
  progetto_nome: string
  descrizione: string
  imponibile: number
  iva_percentuale: number
  totale: number
  rata1_importo: number
  rata1_scadenza: string
  rata1_stato: string
  rata1_data_pagamento: string
  rata2_importo: number
  rata2_scadenza: string
  rata2_stato: string
  rata2_data_pagamento: string
  rata3_importo: number
  rata3_scadenza: string
  rata3_stato: string
  rata3_data_pagamento: string
  modalita_pagamento: string
  note: string
  created_at: string
}

export interface FatturaCliente {
  id: string
  data: string
  numero: string
  cliente_id: string
  cliente_nome: string
  progetto_id: string
  progetto_nome: string
  descrizione: string
  imponibile: number
  iva_percentuale: number
  totale: number
  rata1_importo: number
  rata1_scadenza: string
  rata1_stato: string
  rata2_importo: number
  rata2_scadenza: string
  rata2_stato: string
  rata3_importo: number
  rata3_scadenza: string
  rata3_stato: string
  note: string
  created_at: string
}

export interface MovimentoCashFlow {
  id: string
  data: string
  descrizione: string
  conto: string
  tipologia: string
  entrata: number
  uscita: number
  progetto_id: string
  riferimento_fattura: string
  created_at: string
}
