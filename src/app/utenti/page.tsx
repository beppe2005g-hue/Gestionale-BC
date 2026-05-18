'use client'
import Sidebar from '@/components/Sidebar'

const RUOLI = [
  { ruolo: 'admin', label: 'Amministratore', desc: 'Accesso completo a tutto' },
  { ruolo: 'operatore', label: 'Operatore', desc: 'Vede e modifica fatture, DDT, scadenzario. Non vede utenti.' },
  { ruolo: 'cantiere', label: 'Capo cantiere', desc: 'Solo DDT e progetti. Non vede fatture né finanze.' },
  { ruolo: 'sola_lettura', label: 'Sola lettura', desc: 'Vede dashboard e scadenzario. Non può modificare nulla.' },
]

const PERMESSI: Record<string, Record<string, boolean>> = {
  admin:       { Dashboard: true, Progetti: true, DDT: true, 'Fatt. Fornitori': true, 'Fatt. Clienti': true, Scadenzario: true, 'Cash Flow': true, Anagrafiche: true, Utenti: true },
  operatore:   { Dashboard: true, Progetti: true, DDT: true, 'Fatt. Fornitori': true, 'Fatt. Clienti': true, Scadenzario: true, 'Cash Flow': false, Anagrafiche: true, Utenti: false },
  cantiere:    { Dashboard: true, Progetti: true, DDT: true, 'Fatt. Fornitori': false, 'Fatt. Clienti': false, Scadenzario: false, 'Cash Flow': false, Anagrafiche: false, Utenti: false },
  sola_lettura:{ Dashboard: true, Progetti: false, DDT: false, 'Fatt. Fornitori': false, 'Fatt. Clienti': false, Scadenzario: true, 'Cash Flow': false, Anagrafiche: false, Utenti: false },
}

export default function Utenti() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Utenti e permessi</h1>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
          <strong>Come aggiungere un utente:</strong> vai su <strong>supabase.com → Authentication → Users → Invite user</strong>.
          Inserisci l'email del collaboratore. Riceverà un link per impostare la password.
          Poi torna qui per assegnargli il ruolo.
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {RUOLI.map(r => (
            <div key={r.ruolo} className="card">
              <div className="flex items-center gap-2 mb-3">
                <span className="badge badge-blue">{r.label}</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{r.desc}</p>
              <div className="grid grid-cols-3 gap-1">
                {Object.entries(PERMESSI[r.ruolo]).map(([modulo, ok]) => (
                  <div key={modulo} className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${ok ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                    <span>{ok ? '✓' : '×'}</span>
                    <span>{modulo}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-gray-700 mb-1">Istruzioni per l'invito</h3>
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
            <li>Vai su <strong>supabase.com</strong> e apri il tuo progetto</li>
            <li>Clicca <strong>Authentication → Users → Invite</strong></li>
            <li>Inserisci l'email del collaboratore e clicca Send Invite</li>
            <li>L'utente riceve email con link per impostare la password</li>
            <li>Da Supabase puoi anche bloccare/sbloccare utenti in qualsiasi momento</li>
          </ol>
        </div>
      </main>
    </div>
  )
}
