import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

async function analizzaPagina(base64: string, mediaType: string): Promise<any> {
  const isImage = mediaType.startsWith('image/')
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
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: `Questa è UNA pagina di un DDT italiano. Restituisci SOLO JSON valido senza testo prima o dopo:
{"numero":"","data":"YYYY-MM-DD","fornitore_nome":"","fornitore_piva":"","voci":[{"descrizione":"","macro_categoria":"Cementi|Laterizi|Ferro e Acciaio|Legno|Isolanti|Impermeabilizzanti|Inerti e Calcestruzzo|Impianti|Attrezzatura|Noli|Trasporti|Altro","categoria":"","unita_misura":"","quantita":0,"prezzo_unitario":0,"importo_totale":0}]}
Se la pagina non è un DDT rispondi: {"skip":true}`
          }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error('Errore Anthropic ' + response.status)
  const data = await response.json()
  const testo = data.content?.[0]?.text || ''

  try {
    return JSON.parse(testo)
  } catch {
    const start = testo.indexOf('{')
    const end = testo.lastIndexOf('}')
    if (start === -1 || end === -1) return { skip: true }
    try {
      return JSON.parse(testo.slice(start, end + 1).replace(/[\x00-\x1F\x7F]/g, ' ').replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}'))
    } catch { return { skip: true } }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { base64, mediaType, pagine } = body

    // Caso 1: array di pagine già estratte (immagini)
    if (pagine && Array.isArray(pagine)) {
      const risultati = []
      for (const pag of pagine) {
        const parsed = await analizzaPagina(pag.base64, pag.mediaType)
        if (!parsed.skip && parsed.numero !== undefined) {
          risultati.push(parsed)
        }
      }
      return NextResponse.json({ parsed: risultati })
    }

    // Caso 2: singola immagine
    if (mediaType?.startsWith('image/')) {
      const parsed = await analizzaPagina(base64, mediaType)
      return NextResponse.json({ parsed: parsed.skip ? [] : [parsed] })
    }

    // Caso 3: PDF — usa pdfjs per estrarre pagine come immagini
    if (mediaType === 'application/pdf') {
      // Converti base64 in buffer
      const pdfBuffer = Buffer.from(base64, 'base64')
      
      try {
        // Usa pdfjs-dist per renderizzare ogni pagina
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as any)
        pdfjsLib.GlobalWorkerOptions.workerSrc = ''
        
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) })
        const pdfDoc = await loadingTask.promise
        const numPages = pdfDoc.numPages
        
        const risultati = []
        
        // Processa ogni pagina
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdfDoc.getPage(pageNum)
          const viewport = page.getViewport({ scale: 1.5 })
          
          // Crea canvas virtuale per renderizzare
          const { createCanvas } = await import('canvas' as any)
          const canvas = createCanvas(viewport.width, viewport.height)
          const context = canvas.getContext('2d')
          
          await page.render({ canvasContext: context, viewport }).promise
          
          const imageBase64 = canvas.toDataURL('image/jpeg', 0.75).split(',')[1]
          
          const parsed = await analizzaPagina(imageBase64, 'image/jpeg')
          if (!parsed.skip && parsed.numero !== undefined) {
            risultati.push(parsed)
          }
        }
        
        return NextResponse.json({ parsed: risultati })
      } catch (pdfErr) {
        // Fallback: manda il PDF direttamente senza split pagine
        console.log('PDF split fallback:', pdfErr)
        const parsed = await analizzaPagina(base64, 'application/pdf')
        return NextResponse.json({ parsed: parsed.skip ? [] : [parsed] })
      }
    }

    return NextResponse.json({ error: 'Formato non supportato' }, { status: 400 })
  } catch (e: any) {
    console.error('Route error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

