import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { base64, mediaType } = body

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: mediaType === 'application/pdf' ? 'document' : 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 }
            },
            {
              type: 'text',
              text: `Analizza questo DDT/bolla di consegna italiana e restituisci SOLO un oggetto JSON valido (nessun testo prima o dopo) con questa struttura esatta:
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
Se un campo non è leggibile usa stringa vuota o 0. Estrai TUTTE le voci presenti nel DDT.`
            }
          ]
        }]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
