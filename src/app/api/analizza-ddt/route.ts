import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 60

// Modello Gemini usato per leggere le bolle.
// Se in futuro 3.5 Flash dovesse di nuovo saturarsi (errori 503 prolungati),
// si può tornare temporaneamente a 'gemini-2.5-flash' cambiando solo questa riga.
const GEMINI_MODEL = 'gemini-3.5-flash'

async function callGemini(apiKey: string, body: any, retries = 5): Promise<any> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )
    if (res.status === 503 && i < retries - 1) {
      await new Promise(r => setTimeout(r, 5000 * (i + 1)))
      continue
    }
    return res
  }
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { pagine } = body
    if (!pagine || pagine.length === 0) {
      return NextResponse.json({ error: 'Nessuna pagina fornita' }, { status: 400 })
    }
    const apiKey = process.env.GOOGLE_API_KEY || ''
    const parts: any[] = []
    for (const pagina of pagine) {
      const { base64, mediaType } = pagina
      if (base64 && mediaType) {
        parts.push({ inline_data: { mime_type: mediaType, data: base64 } })
      }
    }
    parts.push({
      text: `DDT italiano. JSON only:\n{"numero":"","data":"YYYY-MM-DD","fornitore_nome":"","fornitore_piva":"","voci":[{"descrizione":"","macro_categoria":"Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro","categoria":"","unita_misura":"","quantita":0,"prezzo_unitario":0,"importo_totale":0}]}`
    })
    const genRes = await callGemini(apiKey, {
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
    })
    if (!genRes.ok) {
      const err = await genRes.text()
      return NextResponse.json({ error: `Errore Gemini ${genRes.status}: ${err}` }, { status: 500 })
    }
    const data = await genRes.json()
    const testo = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!testo) {
      return NextResponse.json({ error: 'Nessun testo da Gemini' }, { status: 500 })
    }
    // Gemini a volte avvolge il JSON in un blocco markdown ```json ... ```: lo rimuoviamo prima del parsing.
    const testoPulito = testo.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    let parsed
    try {
      parsed = JSON.parse(testoPulito)
    } catch {
      const start = testoPulito.indexOf('{')
      const end = testoPulito.lastIndexOf('}')
      if (start === -1 || end === -1) {
        return NextResponse.json({ error: 'Nessun JSON trovato' }, { status: 500 })
      }
      const jsonStr = testoPulito.slice(start, end + 1)
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/,\s*\]/g, ']')
        .replace(/,\s*\}/g, '}')
      try {
        parsed = JSON.parse(jsonStr)
      } catch (e2: any) {
        return NextResponse.json({ error: 'JSON malformato: ' + e2.message }, { status: 500 })
      }
    }
    return NextResponse.json({ parsed })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
