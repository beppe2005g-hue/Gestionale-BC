'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const nav = [
  { section: 'Principale', items: [
    { href: '/dashboard', label: 'Dashboard', icon: '▦' },
    { href: '/progetti', label: 'Progetti', icon: '🏗' },
  ]},
  { section: 'Ciclo Passivo', items: [
    { href: '/ddt', label: 'DDT / Bolle', icon: '📋' },
    { href: '/da-ricevere', label: 'Da ricevere', icon: '⏳' },
    { href: '/fatture-fornitori', label: 'Fatt. fornitori', icon: '📄' },
  ]},
  { section: 'Ciclo Attivo', items: [
    { href: '/fatture-clienti', label: 'Fatt. clienti', icon: '🧾' },
  ]},
  { section: 'Controllo', items: [
    { href: '/scadenzario', label: 'Scadenzario', icon: '📅' },
    { href: '/cashflow', label: 'Cash flow', icon: '📈' },
    { href: '/budget', label: 'Budget vs Consuntivo', icon: '⚖' },
  ]},
  { section: 'Impostazioni', items: [
    { href: '/anagrafiche', label: 'Anagrafiche', icon: '👥' },
    { href: '/utenti', label: 'Utenti e permessi', icon: '🔒' },
  ]},
]

export default function Sidebar() {
  const path = usePathname()

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
        {nav.map(group => (
          <div key={group.section} className="mb-1">
            <p className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
              {group.section}
            </p>
            {group.items.map(item => (
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
        ))}
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
