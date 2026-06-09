import { NextRequest, NextResponse } from 'next/server'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { base64, mediaType } = body

    if (!base64 || !mediaType) {
      return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })
    }

    const isPDF = mediaType === 'application/pdf'

    const prompt = isPDF
      ? `Questo PDF contiene una o più bolle DDT italiane. Analizza TUTTE le pagine ed estrai TUTTI i DDT. Restituisci SOLO un array JSON valido senza testo prima o dopo:\n[{"numero":"","data":"YYYY-MM-DD","fornitore_nome":"","fornitore_piva":"","voci":[{"descrizione":"","macro_categoria":"Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro","categoria":"","unita_misura":"","quantita":0,"prezzo_unitario":0,"importo_totale":0}]}]`
      : `Analizza questa bolla DDT italiana. Restituisci SOLO un array JSON:\n[{"numero":"","data":"YYYY-MM-DD","fornitore_nome":"","fornitore_piva":"","voci":[{"descrizione":"","macro_categoria":"Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro","categoria":"","unita_misura":"","quantita":0,"prezzo_unitario":0,"importo_totale":0}]}]\nSe non è un DDT: [{"skip":true}]`

    const contentParts: any[] = [
      isPDF
        ? { type: 'file', data: base64, mimeType: mediaType }
        : { type: 'image', image: base64, mimeType: mediaType },
      { type: 'text', text: prompt }
    ]

    const { text } = await generateText({
      model: google('gemini-3.5-flash'),
      messages: [{ role: 'user', content: contentParts }]
    })

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      const arrStart = text.indexOf('[')
      const arrEnd = text.lastIndexOf(']')
      const objStart = text.indexOf('{')
      const objEnd = text.lastIndexOf('}')
      let jsonStr = ''
      if (arrStart !== -1 && arrEnd !== -1) {
        jsonStr = text.slice(arrStart, arrEnd + 1)
      } else if (objStart !== -1 && objEnd !== -1) {
        jsonStr = `[${text.slice(objStart, objEnd + 1)}]`
      } else {
        return NextResponse.json({ parsed: [] })
      }
      jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}')
      try { parsed = JSON.parse(jsonStr) } catch { return NextResponse.json({ parsed: [] }) }
    }

    const ddtArray = Array.isArray(parsed) ? parsed : [parsed]
    const filtrati = ddtArray.filter((d: any) => !d.skip && d.numero !== undefined)
    return NextResponse.json({ parsed: filtrati })

  } catch (e: any) {
    console.error('Route error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
