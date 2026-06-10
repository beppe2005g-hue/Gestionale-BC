import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

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
      ? `Questo PDF contiene più bolle DDT italiane. Analizza TUTTE le pagine ed estrai TUTTI i DDT. Restituisci SOLO un array JSON valido senza testo prima o dopo:\n[{"numero":"","data":"YYYY-MM-DD","fornitore_nome":"","fornitore_piva":"","voci":[{"descrizione":"","macro_categoria":"Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro","categoria":"","unita_misura":"","quantita":0,"prezzo_unitario":0,"importo_totale":0}]}]`
      : `Analizza questa bolla DDT italiana. Restituisci SOLO un array JSON:\n[{"numero":"","data":"YYYY-MM-DD","fornitore_nome":"","fornitore_piva":"","voci":[{"descrizione":"","macro_categoria":"Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro","categoria":"","unita_misura":"","quantita":0,"prezzo_unitario":0,"importo_totale":0}]}]\nSe non è un DDT: [{"skip":true}]`

    let testo = ''

    if (isPDF) {
      // Step 1: carica il file su Gemini Files API
      const fileBytes = Buffer.from(base64, 'base64')
      
      const uploadRes = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/pdf',
            'X-Goog-Upload-Protocol': 'raw',
            'X-Goog-Upload-Command': 'upload, finalize',
            'X-Goog-Upload-Header-Content-Length': fileBytes.length.toString(),
            'X-Goog-Upload-Header-Content-Type': 'application/pdf',
          },
          body: fileBytes
        }
      )

      if (!uploadRes.ok) {
        const err = await uploadRes.text()
        return NextResponse.json({ error: `Upload fallito: ${err}` }, { status: 500 })
      }

      const uploadData = await uploadRes.json()
      const fileUri = uploadData.file?.uri

      if (!fileUri) {
        return NextResponse.json({ error: 'URI file non ricevuto' }, { status: 500 })
      }

      // Step 2: analizza con il file URI
      const genRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { file_data: { mime_type: 'application/pdf', file_uri: fileUri } },
                { text: prompt }
              ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
          })
        }
      )

      if (!genRes.ok) {
        const err = await genRes.text()
        return NextResponse.json({ error: `Errore Gemini: ${err}` }, { status: 500 })
      }

      const genData = await genRes.json()
      testo = genData.candidates?.[0]?.content?.parts?.[0]?.text || ''

    } else {
      // Immagine: inline_data funziona
      const genRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: mediaType, data: base64 } },
                { text: prompt }
              ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
          })
        }
      )

      if (!genRes.ok) {
        const err = await genRes.text()
        return NextResponse.json({ error: `Errore Gemini: ${err}` }, { status: 500 })
      }

      const genData = await genRes.json()
      testo = genData.candidates?.[0]?.content?.parts?.[0]?.text || ''
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
        return NextResponse.json({ parsed: [] })
      }
      jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}')
      try { parsed = JSON.parse(jsonStr) } catch { return NextResponse.json({ parsed: [] }) }
    }

    const ddtArray = Array.isArray(parsed) ? parsed : [parsed]
    const filtrati = ddtArray.filter((d: any) => !d.skip && d.numero !== undefined)
    return NextResponse.json({ parsed: filtrati })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
