'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'bonarrigogiuseppe05@gmail.com'
const PREAVVISO_VISITA = 60
const PREAVVISO_CONTRATTO = 25

const nav = [
  { section: 'Principale', items: [
    { href: '/dashboard', label: 'Dashboard', icon: '▦', perm: 'perm_dashboard' },
    { href: '/progetti', label: 'Progetti', icon: '🏗', perm: 'perm_progetti' },
    { href: '/costi-cantiere', label: 'Costi cantiere', icon: '💰', perm: 'perm_costi_cantiere' },
    { href: '/programmi', label: 'Programmi', icon: '📋', perm: 'perm_programmi' },
    { href: '/presenze', label: 'Presenze', icon: '📅', perm: 'perm_presenze' },
    { href: '/cantieri', label: 'Cantieri', icon: '🏗️', perm: 'perm_cantieri' },
    { href: '/cassa-edile', label: 'Cassa Edile', icon: '🏗️', perm: 'perm_cassa_edile' },
  ]},
  { section: 'Ciclo Passivo', items: [
    { href: '/ddt', label: 'DDT / Bolle', icon: '📋', perm: 'perm_ddt' },
    { href: '/import-ddt', label: 'Import DDT con AI', icon: '🤖', perm: 'perm_import_ddt' },
    { href: '/da-ricevere', label: 'Da ricevere', icon: '⏳', perm: 'perm_da_ricevere' },
    { href: '/fatture-fornitori', label: 'Fatt. fornitori', icon: '📄', perm: 'perm_fatture_fornitori' },
    { href: '/import-sdi', label: 'Import SDI', icon: '📥', perm: 'perm_import_sdi' },
    { href: '/prezzario', label: 'Prezzario', icon: '💹', perm: 'perm_prezzario' },
  ]},
  { section: 'Ciclo Attivo', items: [
    { href: '/fatture-clienti', label: 'Fatt. clienti', icon: '🧾', perm: 'perm_fatture_clienti' },
    { href: '/fatture-da-emettere', label: 'Fatture da emettere', icon: '🔔', perm: 'perm_fatture_da_emettere', badgeKey: 'fattureDaEmettere' },
  ]},
  { section: 'Controllo', items: [
    { href: '/scadenze-aziendali', label: 'Scadenze aziendali', icon: '⏰', perm: 'perm_scadenze_aziendali', badgeKey: 'scadenzeAziendali' },
    { href: '/scadenzario', label: 'Scadenzario', icon: '📅', perm: 'perm_scadenzario' },
    { href: '/cashflow', label: 'Cash flow', icon: '📈', perm: 'perm_cashflow' },
    { href: '/budget', label: 'Budget vs Consuntivo', icon: '⚖', perm: 'perm_budget' },
  ]},
  { section: 'Impostazioni', items: [
    { href: '/anagrafiche', label: 'Anagrafiche', icon: '👥', perm: 'perm_anagrafiche' },
    { href: '/dipendenti', label: 'Dipendenti', icon: '👷', perm: 'perm_dipendenti', badgeKey: 'dipendentiScadenze' },
    { href: '/mezzi', label: 'Mezzi', icon: '🚐', perm: 'perm_mezzi', badgeKey: 'mezziScadenze' },
    { href: '/utenti', label: 'Utenti e permessi', icon: '🔒', perm: 'perm_utenti' },
  ]},
]

function giorniAllaScadenza(data: string | null): number | null {
  if (!data) return null
  const oggi = new Date(); oggi.setHours(0,0,0,0)
  const d = new Date(data); d.setHours(0,0,0,0)
  return Math.ceil((d.getTime() - oggi.getTime()) / 86400000)
}

function inAllertaConPreavviso(data: string | null, giorniPreavviso: number): boolean {
  const giorni = giorniAllaScadenza(data)
  if (giorni === null) return false
  return giorni <= giorniPreavviso
}

export default function Sidebar() {
  const path = usePathname()
  const [aperta, setAperta] = useState(false)

  useEffect(() => {
    function onTornaVisibile() {
      if (document.visibilityState === 'visible') {
        window.dispatchEvent(new Event('gestionale:refresh'))
      }
    }
    document.addEventListener('visibilitychange', onTornaVisibile)
    window.addEventListener('focus', onTornaVisibile)
    return () => {
      document.removeEventListener('visibilitychange', onTornaVisibile)
      window.removeEventListener('focus', onTornaVisibile)
    }
  }, [])

  useEffect(() => { setAperta(false) }, [path])

  const [permessi, setPermessi] = useState<Record<string, boolean> | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [badges, setBadges] = useState<Record<string, number>>({})

  useEffect(() => {
    async function loadPermessi() {
      const { data: authData } = await supabase.auth.getUser()
      const email = authData.user?.email
      if (email === ADMIN_EMAIL) { setIsAdmin(true); setLoaded(true); return }
      if (!authData.user?.id) { setLoaded(true); return }
      const { data: utente } = await supabase.from('utenti').select('*').eq('id', authData.user.id).single()
      setPermessi(utente || {})
      setLoaded(true)
    }
    loadPermessi()
  }, [])

  useEffect(() => {
    async function loadBadges() {
      const { count: countFde } = await supabase
        .from('fatture_da_emettere').select('id', { count: 'exact', head: true }).eq('stato', 'Da Emettere')
      const { data: dip } = await supabase
        .from('dipendenti').select('id,attivo,scadenza_visita_medica,data_fine_contratto').eq('attivo', true)
      const dipendentiInAllerta = (dip || []).filter(d =>
        inAllertaConPreavviso(d.scadenza_visita_medica, PREAVVISO_VISITA) ||
        inAllertaConPreavviso(d.data_fine_contratto, PREAVVISO_CONTRATTO)
      ).length
      const { data: mez } = await supabase
        .from('mezzi').select('scadenza_assicurazione,scadenza_bollo,scadenza_revisione').eq('attivo', true)
      const mezziInAllerta = (mez || []).filter(m =>
        inAllertaConPreavviso(m.scadenza_assicurazione, 30) ||
        inAllertaConPreavviso(m.scadenza_bollo, 30) ||
        inAllertaConPreavviso(m.scadenza_revisione, 30)
      ).length
      const { data: scad } = await supabase
        .from('scadenze_aziendali')
        .select('scadenza')
        .eq('attiva', true)
      const oggi = new Date(); oggi.setHours(0,0,0,0)
      const scadenzeInAllerta = (scad || []).filter(s => {
        const giorni = Math.ceil((new Date(s.scadenza).getTime() - oggi.getTime()) / 86400000)
        return giorni <= 30
      }).length
      setBadges({ fattureDaEmettere: countFde || 0, dipendentiScadenze: dipendentiInAllerta, mezziScadenze: mezziInAllerta, scadenzeAziendali: scadenzeInAllerta })
    }
    loadBadges()
  }, [])

  function hasPerm(permKey: string) {
    if (isAdmin) return true
    if (!loaded) return false
    if (!permessi) return false
    return !!permessi[permKey]
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const contenutoNav = (
    <>
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
              <p className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">{group.section}</p>
              {visibleItems.map(item => {
                const badgeCount = item.badgeKey ? (badges[item.badgeKey] || 0) : 0
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors border-l-2
                      ${path === item.href
                        ? 'text-blue-700 bg-blue-50 border-blue-700 font-medium'
                        : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-900'}`}>
                    <span className="text-base">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {badgeCount > 0 && (
                      <span className="text-xs font-semibold bg-red-500 text-white rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
      <div className="p-4 border-t border-gray-200">
        <button onClick={logout} className="w-full text-left text-sm text-gray-500 hover:text-red-600 transition-colors">Esci</button>
      </div>
    </>
  )

  return (
    <>
      <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-30">
        <button onClick={() => setAperta(true)} className="text-2xl leading-none text-gray-700" aria-label="Apri menu">☰</button>
        <img src="/logo.png" alt="BC General Service" className="h-7 w-auto object-contain" />
        <span className="text-sm font-semibold text-gray-900">BC General Service</span>
      </div>
      <div className="md:hidden" style={{ height: 56 }} />

      {aperta && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setAperta(false)} />
      )}

      <aside className={`
        bg-white border-r border-gray-200 flex flex-col flex-shrink-0
        md:w-52 md:h-screen md:static md:translate-x-0
        fixed top-0 left-0 h-full w-72 z-50 transition-transform duration-200 overflow-y-auto
        ${aperta ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <button onClick={() => setAperta(false)} className="md:hidden absolute top-3 right-3 text-xl text-gray-400" aria-label="Chiudi menu">✕</button>
        {contenutoNav}
      </aside>
    </>
  )
}
