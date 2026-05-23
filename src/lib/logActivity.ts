import { supabase } from '@/lib/supabase'

export async function logActivity(
  azione: 'inserimento' | 'modifica' | 'eliminazione',
  tabella: string,
  recordId: string,
  descrizione: string
) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profilo } = await supabase
      .from('utenti')
      .select('nome')
      .eq('id', user.id)
      .single()

    await supabase.from('activity_log').insert({
      utente_id: user.id,
      utente_nome: profilo?.nome || user.email,
      azione,
      tabella,
      record_id: recordId,
      descrizione,
    })
  } catch {
    // Il log non blocca mai l'operazione principale
  }

}
