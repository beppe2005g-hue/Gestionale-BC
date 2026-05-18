-- ============================================================
-- GESTIONALE EDILE - Schema database Supabase
-- Esegui questo SQL nel SQL Editor di Supabase
-- ============================================================

-- Abilita RLS (Row Level Security)
-- Le policy vengono gestite tramite autenticazione Supabase

-- CLIENTI
create table if not exists clienti (
  id uuid primary key default gen_random_uuid(),
  ragione_sociale text not null,
  cf_piva text,
  tipo text default 'Azienda',
  indirizzo text,
  citta text,
  email text,
  pec text,
  telefono text,
  iban text,
  termini_pagamento integer default 30,
  attivo boolean default true,
  created_at timestamptz default now()
);

-- FORNITORI
create table if not exists fornitori (
  id uuid primary key default gen_random_uuid(),
  ragione_sociale text not null,
  cf_piva text,
  categoria text default 'Materiali',
  indirizzo text,
  citta text,
  email text,
  pec text,
  telefono text,
  iban text,
  termini_pagamento integer default 30,
  modalita_pagamento text default 'Bonifico',
  attivo boolean default true,
  created_at timestamptz default now()
);

-- PROGETTI
create table if not exists progetti (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique,
  nome text not null,
  cliente_id uuid references clienti(id),
  cliente_nome text,
  tipo text default 'Privato',
  responsabile text,
  valore_contratto numeric(12,2) default 0,
  budget_costi numeric(12,2) default 0,
  data_inizio date,
  data_fine date,
  stato text default 'In Corso',
  note text,
  created_at timestamptz default now()
);

-- DDT
create table if not exists ddt (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  numero text not null,
  fornitore_id uuid references fornitori(id),
  fornitore_nome text not null,
  progetto_id uuid references progetti(id),
  progetto_nome text,
  descrizione text,
  importo numeric(12,2) not null default 0,
  mese_fattura_previsto text,
  stato text default 'Da Fatturare',
  fattura_abbinata text,
  note text,
  created_at timestamptz default now()
);

-- FATTURE FORNITORI
create table if not exists fatture_fornitori (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  numero text not null,
  fornitore_id uuid references fornitori(id),
  fornitore_nome text not null,
  progetto_id uuid references progetti(id),
  progetto_nome text,
  descrizione text,
  imponibile numeric(12,2) not null default 0,
  iva_percentuale numeric(5,2) default 22,
  totale numeric(12,2) generated always as (imponibile + imponibile * iva_percentuale / 100) stored,
  rata1_importo numeric(12,2) default 0,
  rata1_scadenza date,
  rata1_stato text default 'Da Pagare',
  rata1_data_pagamento date,
  rata2_importo numeric(12,2) default 0,
  rata2_scadenza date,
  rata2_stato text default 'Da Pagare',
  rata2_data_pagamento date,
  rata3_importo numeric(12,2) default 0,
  rata3_scadenza date,
  rata3_stato text default 'Da Pagare',
  rata3_data_pagamento date,
  modalita_pagamento text default 'Bonifico',
  note text,
  created_at timestamptz default now()
);

-- FATTURE CLIENTI
create table if not exists fatture_clienti (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  numero text not null,
  cliente_id uuid references clienti(id),
  cliente_nome text not null,
  progetto_id uuid references progetti(id),
  progetto_nome text,
  descrizione text,
  imponibile numeric(12,2) not null default 0,
  iva_percentuale numeric(5,2) default 0,
  totale numeric(12,2) generated always as (imponibile + imponibile * iva_percentuale / 100) stored,
  rata1_importo numeric(12,2) default 0,
  rata1_scadenza date,
  rata1_stato text default 'Da Incassare',
  rata2_importo numeric(12,2) default 0,
  rata2_scadenza date,
  rata2_stato text default 'Da Incassare',
  rata3_importo numeric(12,2) default 0,
  rata3_scadenza date,
  rata3_stato text default 'Da Incassare',
  note text,
  created_at timestamptz default now()
);

-- CASH FLOW
create table if not exists cash_flow (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  descrizione text not null,
  conto text default 'Conto 1',
  tipologia text,
  entrata numeric(12,2) default 0,
  uscita numeric(12,2) default 0,
  progetto_id uuid references progetti(id),
  riferimento_fattura text,
  created_at timestamptz default now()
);

-- UTENTI (profili aggiuntivi oltre auth.users)
create table if not exists utenti (
  id uuid primary key references auth.users(id),
  nome text not null,
  ruolo text default 'operatore',
  perm_dashboard boolean default true,
  perm_progetti boolean default true,
  perm_ddt boolean default true,
  perm_fatture_fornitori boolean default true,
  perm_fatture_clienti boolean default true,
  perm_scadenzario boolean default true,
  perm_cashflow boolean default false,
  perm_anagrafiche boolean default false,
  perm_utenti boolean default false,
  created_at timestamptz default now()
);

-- INDICI per performance
create index if not exists idx_ddt_fornitore on ddt(fornitore_id);
create index if not exists idx_ddt_progetto on ddt(progetto_id);
create index if not exists idx_ddt_stato on ddt(stato);
create index if not exists idx_ff_fornitore on fatture_fornitori(fornitore_id);
create index if not exists idx_ff_progetto on fatture_fornitori(progetto_id);
create index if not exists idx_fc_cliente on fatture_clienti(cliente_id);
create index if not exists idx_fc_progetto on fatture_clienti(progetto_id);
create index if not exists idx_cf_data on cash_flow(data);

-- RLS POLICIES (accesso pubblico per ora - da restringere in produzione)
alter table clienti enable row level security;
alter table fornitori enable row level security;
alter table progetti enable row level security;
alter table ddt enable row level security;
alter table fatture_fornitori enable row level security;
alter table fatture_clienti enable row level security;
alter table cash_flow enable row level security;
alter table utenti enable row level security;

-- Policy: utenti autenticati vedono tutto
create policy "Autenticati leggono tutto" on clienti for all to authenticated using (true);
create policy "Autenticati leggono tutto" on fornitori for all to authenticated using (true);
create policy "Autenticati leggono tutto" on progetti for all to authenticated using (true);
create policy "Autenticati leggono tutto" on ddt for all to authenticated using (true);
create policy "Autenticati leggono tutto" on fatture_fornitori for all to authenticated using (true);
create policy "Autenticati leggono tutto" on fatture_clienti for all to authenticated using (true);
create policy "Autenticati leggono tutto" on cash_flow for all to authenticated using (true);
create policy "Utenti vedono se stessi" on utenti for all to authenticated using (auth.uid() = id);
