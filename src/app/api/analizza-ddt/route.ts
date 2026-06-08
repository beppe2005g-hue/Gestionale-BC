import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    let { base64, mediaType } = body

    const isImage = mediaType?.startsWith('image/')
    const isPDF = mediaType === 'application/pdf'

    if (!isImage && !isPDF) {
      return NextResponse.json({ error: 'Formato non supportato' }, { status: 400 })
    }

    // Per immagini, ridimensiona lato server se troppo grande
    // Limit base64 size to ~1MB (circa 750KB file originale)
    if (isImage && base64.length > 1000000) {
      // Tronca — l'immagine verrà comunque letta ma con meno dettagli inutili
      // Il ridimensionamento vero avviene lato client
      console.log('Immagine grande:', Math.round(base64.length / 1024), 'KB base64')
    }

    const contentBlock = isImage
      ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: `Questo PDF può contenere UNA O PIÙ bolle DDT su pagine diverse. Analizza TUTTE le pagine e restituisci SOLO un array JSON valido (nessun testo prima o dopo) con un oggetto per ogni DDT trovato:
[
  {
    "numero": "numero bolla",
    "data": "YYYY-MM-DD",
    "fornitore_nome": "nome fornitore",
    "fornitore_piva": "partita iva",
    "voci": [
      {
        "descrizione": "descrizione materiale",
        "macro_categoria": "Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro",
        "categoria": "",
        "unita_misura": "mc/kg/ml/pz/m2/t/l",
        "quantita": 0.0,
        "prezzo_unitario": 0.0,
        "importo_totale": 0.0
      }
    ]
  }
]
Se c'è solo una bolla restituisci un array con un solo elemento. Se un campo non è leggibile usa stringa vuota o 0.`
            }
          ]
        }]
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
      // Cerca array [...] o oggetto {...}
      const arrMatch = testo.match(/\[[\s\S]*\]/)
      const objMatch = testo.match(/\{[\s\S]*\}/)
      const jsonStr = (arrMatch || objMatch)?.[0]
      if (!jsonStr) {
        return NextResponse.json({ error: 'Nessun JSON trovato' }, { status: 500 })
      }
      const cleaned = jsonStr
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/,\s*\]/g, ']')
        .replace(/,\s*\}/g, '}')
      try {
        parsed = JSON.parse(cleaned)
      } catch (e2: any) {
        return NextResponse.json({ error: 'JSON malformato: ' + e2.message }, { status: 500 })
      }
    }

    // Normalizza: se l'AI ha restituito un singolo oggetto invece di array, wrappalo
    const ddtArray = Array.isArray(parsed) ? parsed : [parsed]

    return NextResponse.json({ parsed: ddtArray })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
