# Gestionale Edile — Istruzioni Deploy

## Prerequisiti completati
- Account GitHub ✓
- Account Supabase ✓  
- Account Vercel ✓

---

## STEP 1 — Configura Supabase (5 minuti)

1. Vai su **supabase.com** → apri il tuo progetto
2. Clicca **SQL Editor** nel menu a sinistra
3. Copia tutto il contenuto del file `schema.sql`
4. Incollalo nell'editor e clicca **Run**
5. Dovresti vedere "Success" — il database è pronto

6. Ora prendi le credenziali:
   - Clicca **Settings → API** nel menu
   - Copia **Project URL** (es. https://abcdef.supabase.co)
   - Copia **anon public key** (stringa lunga che inizia con eyJ...)

---

## STEP 2 — Carica il codice su GitHub (5 minuti)

1. Vai su **github.com** → clicca **+** in alto → **New repository**
2. Nome: `gestionale-edile`
3. Lascia tutto il resto come default → **Create repository**
4. Clicca **uploading an existing file**
5. Trascina TUTTI i file e cartelle di questa cartella nella pagina
6. Clicca **Commit changes**

---

## STEP 3 — Deploy su Vercel (5 minuti)

1. Vai su **vercel.com** → clicca **Add New Project**
2. Importa il repository `gestionale-edile` da GitHub
3. Prima di cliccare Deploy, clicca **Environment Variables**
4. Aggiungi queste due variabili:
   - Nome: `NEXT_PUBLIC_SUPABASE_URL` → Valore: (l'URL copiato dal passo 1)
   - Nome: `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Valore: (la chiave copiata dal passo 1)
5. Clicca **Deploy**
6. Aspetta 2-3 minuti → Vercel ti dà il link (es. gestionale-edile.vercel.app)

---

## STEP 4 — Crea il primo utente admin (2 minuti)

1. Vai su **supabase.com** → il tuo progetto → **Authentication → Users**
2. Clicca **Invite user**
3. Inserisci la tua email → **Send Invite**
4. Controlla la mail → clicca il link → imposta la password
5. Apri il link di Vercel → accedi con email e password

**Sei online!** 🎉

---

## Come aggiungere altri utenti

1. Supabase → Authentication → Users → Invite user
2. Inserisci l'email del collaboratore
3. Riceverà email con link per impostare la password
4. Dal gestionale → sezione Utenti → assegna il ruolo

---

## Aggiornamenti futuri

Quando vuoi aggiornare l'applicazione:
1. Carica i file aggiornati su GitHub
2. Vercel si aggiorna automaticamente in 2 minuti

---

## Supporto

In caso di problemi scrivi a Claude con il messaggio di errore esatto.
