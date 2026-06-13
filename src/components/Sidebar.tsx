'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'bonarrigogiuseppe05@gmail.com'

const nav = [
  { section: 'Principale', items: [
    { href: '/dashboard', label: 'Dashboard', icon: '▦', perm: 'perm_dashboard' },
    { href: '/progetti', label: 'Progetti', icon: '🏗', perm: 'perm_progetti' },
    { href: '/costi-cantiere', label: 'Costi cantiere', icon: '💰', perm: 'perm_costi_cantiere' },
  ]},
  { section: 'Ciclo Passivo', items: [
    { href: '/ddt', label: 'DDT / Bolle', icon: '📋', perm: 'perm_ddt' },
    { href: '/import-ddt', label: 'Import DDT con AI', icon: '🤖', perm: 'perm_ddt' },
    { href: '/da-ricevere', label: 'Da ricevere', icon: '⏳', perm: 'perm_da_ricevere' },
    { href: '/fatture-fornitori', label: 'Fatt. fornitori', icon: '📄', perm: 'perm_fatture_fornitori' },
    { href: '/import-sdi', label: 'Import SDI', icon: '📥', perm: 'perm_import_sdi' },
    { href: '/prezzario', label: 'Prezzario', icon: '💹', perm: 'perm_ddt' },
  ]},
  { section: 'Ciclo Attivo', items: [
    { href: '/fatture-clienti', label: 'Fatt. clienti', icon: '🧾', perm: 'perm_fatture_clienti' },
  ]},
  { section: 'Controllo', items: [
    { href: '/scadenzario', label: 'Scadenzario', icon: '📅', perm: 'perm_scadenzario' },
    { href: '/cashflow', label: 'Cash flow', icon: '📈', perm: 'perm_cashflow' },
    { href: '/budget', label: 'Budget vs Consuntivo', icon: '⚖', perm: 'perm_budget' },
  ]},
  { section: 'Impostazioni', items: [
    { href: '/anagrafiche', label: 'Anagrafiche', icon: '👥', perm: 'perm_anagrafiche' },
    { href: '/dipendenti', label: 'Dipendenti', icon: '👷', perm: 'perm_dipendenti' },
    { href: '/utenti', label: 'Utenti e permessi', icon: '🔒', perm: 'perm_utenti' },
  ]},
]

export default function Sidebar() {
  const path = usePathname()
  const [permessi, setPermessi] = useState<Record<string, boolean> | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function loadPermessi() {
      const { data: authData } = await supabase.auth.getUser()
      const email = authData.user?.email

      if (email === ADMIN_EMAIL) {
        setIsAdmin(true)
        setLoaded(true)
        return
      }

      if (!authData.user?.id) { setLoaded(true); return }

      const { data: utente } = await supabase
        .from('utenti')
        .select('*')
        .eq('id', authData.user.id)
        .single()

      setPermessi(utente || {})
      setLoaded(true)
    }
    loadPermessi()
  }, [])

  function hasPerm(permKey: string) {
    if (isAdmin) return true
    if (!loaded) return false // nasconde finché non carica, evita flash
    if (!permessi) return false
    return !!permessi[permKey]
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <aside className="w-52 bg-white border-r border-gray-200 flex flex-col min-h-screen flex-shrink-0">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="BC General Service" className="h-10 w-auto object-contain flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">BC General Service</p>
            <p className="text-xs text-gray-500">Impresa Edile</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {nav.map(group => {
          const visibleItems = group.items.filter(item => hasPerm(item.perm))
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
        })}
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
