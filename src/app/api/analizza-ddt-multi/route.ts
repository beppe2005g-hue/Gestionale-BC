import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { pagine } = body

    if (!pagine || pagine.length === 0) {
      return NextResponse.json({ error: 'Nessuna pagina fornita' }, { status: 400 })
    }

    // Costruisci il contenuto con tutte le pagine
    const content: any[] = []
    
    for (const pagina of pagine) {
      const { base64, mediaType } = pagina
      const isImage = mediaType?.startsWith('image/')
      
      if (isImage) {
        content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } })
      } else {
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } })
      }
    }

    content.push({
      type: 'text',
      text: `Questo DDT è composto da ${pagine.length} pagine. Analizza tutte le pagine insieme e restituisci SOLO un oggetto JSON valido con questa struttura:
{
  "numero": "numero bolla",
  "data": "YYYY-MM-DD",
  "fornitore_nome": "nome fornitore",
  "fornitore_piva": "partita iva",
  "voci": [
    {
      "descrizione": "descrizione materiale",
      "macro_categoria": "una di: Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro",
      "categoria": "categoria specifica",
      "unita_misura": "mc/kg/ml/pz/m2/t/l",
      "quantita": 0.0,
      "prezzo_unitario": 0.0,
      "importo_totale": 0.0
    }
  ]
}
Estrai TUTTE le voci da tutte le pagine. Non duplicare voci già presenti.`
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content }]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: `Errore Anthropic ${response.status}: ${err}` }, { status: 500 })
    }

    const data = await response.json()
    const testo = data.content?.[0]?.text || ''

    let parsed
    try {
      parsed = JSON.parse(testo)
    } catch {
      const start = testo.indexOf('{')
      const end = testo.lastIndexOf('}')
      if (start === -1 || end === -1) {
        return NextResponse.json({ error: 'Nessun JSON trovato' }, { status: 500 })
      }
      const jsonStr = testo.slice(start, end + 1)
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
