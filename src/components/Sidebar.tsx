'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'bonarrigogiuseppe05@gmail.com'

// Mappa href → chiave permesso
const PERM_KEY: Record<string, string> = {
  '/dashboard':          'dashboard',
  '/progetti':           'progetti',
  '/costi-cantiere':     'costi_cantiere',
  '/ddt':                'ddt',
  '/da-ricevere':        'da_ricevere',
  '/fatture-fornitori':  'fatture_fornitori',
  '/fatture-clienti':    'fatture_clienti',
  '/import-sdi':         'import_sdi',
  '/scadenzario':        'scadenzario',
  '/cashflow':           'cashflow',
  '/budget':             'budget',
  '/anagrafiche':        'anagrafiche',
  '/dipendenti':         'dipendenti',
  '/utenti':             'utenti',
}

const nav = [
  { section: 'Principale', items: [
    { href: '/dashboard',      label: 'Dashboard',      icon: '▦' },
    { href: '/progetti',       label: 'Progetti',       icon: '🏗' },
    { href: '/costi-cantiere', label: 'Costi cantiere', icon: '💰' },
  ]},
  { section: 'Ciclo Passivo', items: [
    { href: '/ddt',               label: 'DDT / Bolle',    icon: '📋' },
    { href: '/da-ricevere',       label: 'Da ricevere',    icon: '⏳' },
    { href: '/fatture-fornitori', label: 'Fatt. fornitori', icon: '📄' },
    { href: '/import-sdi',        label: 'Import SDI',     icon: '📥' },
  ]},
  { section: 'Ciclo Attivo', items: [
    { href: '/fatture-clienti', label: 'Fatt. clienti', icon: '🧾' },
  ]},
  { section: 'Controllo', items: [
    { href: '/scadenzario', label: 'Scadenzario',       icon: '📅' },
    { href: '/cashflow',    label: 'Cash flow',          icon: '📈' },
    { href: '/budget',      label: 'Budget vs Consuntivo', icon: '⚖' },
  ]},
  { section: 'Impostazioni', items: [
    { href: '/anagrafiche', label: 'Anagrafiche',       icon: '👥' },
    { href: '/dipendenti',  label: 'Dipendenti',         icon: '👷' },
    { href: '/utenti',      label: 'Utenti e permessi', icon: '🔒' },
  ]},
]

export default function Sidebar() {
  const path = usePathname()
  const [permessi, setPermessi] = useState<Record<string, boolean> | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadPermessi() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      if (user.email === ADMIN_EMAIL) {
        setIsAdmin(true)
        setPermessi(null) // null = tutto visibile
        setLoading(false)
        return
      }

      // Legge i permessi dalla tabella
      const { data } = await supabase
        .from('permessi_utenti')
        .select('*')
        .eq('utente_id', user.id)
        .single()

      if (data) {
        const { utente_id, ...rest } = data
        setPermessi(rest)
      } else {
        // Nessun record → nessun accesso
        setPermessi({})
      }
      setLoading(false)
    }
    loadPermessi()
  }, [])

  function canSee(href: string): boolean {
    if (isAdmin || permessi === null) return true
    const key = PERM_KEY[href]
    if (!key) return true // pagine senza restrizione
    return !!permessi[key]
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <aside className="w-52 bg-white border-r border-gray-200 flex flex-col min-h-screen flex-shrink-0">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">E</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Gestionale</p>
            <p className="text-xs text-gray-500">Impresa Edile</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-6 text-xs text-gray-400 animate-pulse">Caricamento...</div>
        ) : (
          nav.map(group => {
            // Filtra le voci visibili per questo utente
            const visibleItems = group.items.filter(item => canSee(item.href))
            if (visibleItems.length === 0) return null

            return (
              <div key={group.section} className="mb-1">
                <p className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  {group.section}
                </p>
                {visibleItems.map(item => (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors border-l-2
                      ${path === item.href
                        ? 'text-blue-700 bg-blue-50 border-blue-700 font-medium'
                        : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-900'}`}>
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            )
          })
        )}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <button onClick={logout}
          className="w-full text-left text-sm text-gray-500 hover:text-red-600 transition-colors">
          Esci
        </button>
      </div>
    </aside>
  )
}
