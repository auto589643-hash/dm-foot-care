const positions = ['left-dorsal', 'left-sole', 'right-dorsal', 'right-sole']
const severities = ['เล็กน้อย', 'ปานกลาง', 'รุนแรง']

function extractText(response) {
  return response?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || ''
}

function parseJsonText(value) {
  const cleaned = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  return JSON.parse(cleaned)
}

export async function callGemini({ images, diseaseMaster }) {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
  if (!Array.isArray(images) || images.length === 0) throw new Error('At least one image is required for the Gemini smoke path')

  const prompt = [
    'คุณเป็นระบบช่วยประเมินภาพเท้า ไม่ใช่ผู้วินิจฉัยโรค',
    'ประเมินเฉพาะรายการใน DISEASE_MASTER ที่ให้เท่านั้น ห้ามสร้างรายการใหม่',
    'ใช้ detection_criteria เพื่อตัดสินว่าพบหรือไม่พบ และใช้ severityLevels ของโรคนั้นเพื่อเลือกระดับความรุนแรง',
    'ถ้าไม่พบให้ detected เป็น false และ suggestedSeverity เป็น null',
    'ระบุตำแหน่งภาพที่พบใน imagePositions และตอบเป็น JSON เท่านั้น',
    `DISEASE_MASTER:\n${JSON.stringify(diseaseMaster)}`,
  ].join('\n\n')

  const parts = [{ text: prompt }]
  for (const image of images) {
    if (!positions.includes(image.position) || typeof image.data !== 'string' || !image.data) continue
    parts.push({ text: `ภาพ ${image.position}` })
    parts.push({ inlineData: { mimeType: image.mimeType || 'image/jpeg', data: image.data } })
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            findings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  diseaseId: { type: 'string' },
                  detected: { type: 'boolean' },
                  suggestedSeverity: { type: 'string', enum: severities },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  imagePositions: { type: 'array', items: { type: 'string', enum: positions } },
                },
                required: ['diseaseId', 'detected', 'confidence', 'imagePositions'],
              },
            },
          },
          required: ['findings'],
        },
      },
    }),
  })
  const rawBody = await response.text()
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}): ${rawBody.slice(0, 400)}`)
  const payload = JSON.parse(rawBody)
  const text = extractText(payload)
  if (!text) throw new Error('Gemini returned an empty response')
  return { rawResult: parseJsonText(text), model }
}

