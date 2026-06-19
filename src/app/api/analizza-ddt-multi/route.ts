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
    const { base64, mediaType } = body
    if (!base64 || !mediaType) {
      return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })
    }
    const apiKey = process.env.GOOGLE_API_KEY || ''
    const isPDF = mediaType === 'application/pdf'
    const prompt = isPDF
      ? `DDT italiano. JSON array only:\n[{"numero":"","data":"YYYY-MM-DD","fornitore_nome":"","fornitore_piva":"","voci":[{"descrizione":"","macro_categoria":"Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro","categoria":"","unita_misura":"","quantita":0,"prezzo_unitario":0,"importo_totale":0}]}]`
      : `DDT italiano. JSON array only:\n[{"numero":"","data":"YYYY-MM-DD","fornitore_nome":"","fornitore_piva":"","voci":[{"descrizione":"","macro_categoria":"Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro","categoria":"","unita_misura":"","quantita":0,"prezzo_unitario":0,"importo_totale":0}]}]`
    const genBody = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mediaType, data: base64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
    }
    const genRes = await callGemini(apiKey, genBody)
    if (!genRes.ok) {
      const err = await genRes.text()
      return NextResponse.json({ error: `Errore Gemini ${genRes.status}: ${err}` }, { status: 500 })
    }
    const data = await genRes.json()
    const testo = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!testo) {
      // Gemini ha risposto ma senza testo utile: spesso succede per blocco di sicurezza,
      // risposta troncata per instabilità del servizio, o output vuoto. Rendiamo visibile il motivo
      // invece di restituire silenziosamente un array vuoto.
      const finishReason = data.candidates?.[0]?.finishReason || 'sconosciuto'
      const promptFeedback = data.promptFeedback?.blockReason || null
      const dettaglio = promptFeedback
        ? `Risposta bloccata da Gemini (motivo: ${promptFeedback}).`
        : `Gemini ha risposto senza contenuto utile (finishReason: ${finishReason}). Possibile instabilità temporanea del servizio: riprova tra qualche minuto.`
      return NextResponse.json({ error: dettaglio, parsed: [] }, { status: 200 })
    }
    let parsed
    try {
      parsed = JSON.parse(testo)
    } catch {
      const arrStart = testo.indexOf('[')
      const arrEnd = testo.lastIndexOf(']')
      const objStart = testo.indexOf('{')
      const objEnd = testo.lastIndexOf('}')
      let jsonStr = ''
      if (arrStart !== -1 && arrEnd !== -1) {
        jsonStr = testo.slice(arrStart, arrEnd + 1)
      } else if (objStart !== -1 && objEnd !== -1) {
        jsonStr = `[${testo.slice(objStart, objEnd + 1)}]`
      } else {
        return NextResponse.json({ error: 'Gemini ha risposto con un testo che non contiene JSON riconoscibile.', parsed: [], testoGrezzo: testo.slice(0, 500) }, { status: 200 })
      }
      jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}')
      try { parsed = JSON.parse(jsonStr) } catch (e3: any) {
        return NextResponse.json({ error: 'JSON malformato nella risposta di Gemini: ' + e3.message, parsed: [], testoGrezzo: testo.slice(0, 500) }, { status: 200 })
      }
    }
    const ddtArray = Array.isArray(parsed) ? parsed : [parsed]
    const filtrati = ddtArray.filter((d: any) => !d.skip && d.numero !== undefined)
    return NextResponse.json({ parsed: filtrati })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
