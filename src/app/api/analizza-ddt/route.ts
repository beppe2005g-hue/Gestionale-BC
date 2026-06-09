import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { base64, mediaType } = body

    const isImage = mediaType?.startsWith('image/')
    const isPDF = mediaType === 'application/pdf'

    if (!isImage && !isPDF) {
      return NextResponse.json({ error: 'Formato non supportato' }, { status: 400 })
    }

    const contentBlock = isImage
      ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }

    // Per PDF usiamo Sonnet con più token — può gestire documenti lunghi
    const model = isPDF ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
    const maxTokens = isPDF ? 8000 : 1500

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: isPDF
                ? `Questo PDF contiene più bolle DDT, una per pagina. Analizza TUTTE le pagine ed estrai TUTTI i DDT. Restituisci SOLO un array JSON valido (nessun testo prima o dopo):
[{"numero":"","data":"YYYY-MM-DD","fornitore_nome":"","fornitore_piva":"","voci":[{"descrizione":"","macro_categoria":"Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro","categoria":"","unita_misura":"","quantita":0,"prezzo_unitario":0,"importo_totale":0}]}]
Includi un elemento nell'array per ogni DDT trovato. Se una pagina non contiene un DDT ignorala.`
                : `Analizza questo DDT italiano. Restituisci SOLO un array JSON con un elemento:
[{"numero":"","data":"YYYY-MM-DD","fornitore_nome":"","fornitore_piva":"","voci":[{"descrizione":"","macro_categoria":"Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro","categoria":"","unita_misura":"","quantita":0,"prezzo_unitario":0,"importo_totale":0}]}]`
            }
          ]
        }]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error:', response.status, err)
      return NextResponse.json({ error: `Errore Anthropic ${response.status}` }, { status: 500 })
    }

    const data = await response.json()
    const testo = data.content?.[0]?.text || ''

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
        jsonStr = testo.slice(objStart, objEnd + 1)
      } else {
        return NextResponse.json({ error: 'Nessun JSON trovato' }, { status: 500 })
      }

      jsonStr = jsonStr
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/,\s*\]/g, ']')
        .replace(/,\s*\}/g, '}')

      try {
        parsed = JSON.parse(jsonStr)
      } catch (e2: any) {
        return NextResponse.json({ error: 'JSON malformato: ' + e2.message }, { status: 500 })
      }
    }

    // Normalizza sempre ad array
    const ddtArray = Array.isArray(parsed) ? parsed : [parsed]
    return NextResponse.json({ parsed: ddtArray })

  } catch (e: any) {
    console.error('Route error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
