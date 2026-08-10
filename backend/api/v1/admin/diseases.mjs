import { handleOptions, sendJson, setCors } from '../../_lib/http.mjs'
import { requireAdminUser, supabaseRest } from '../../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    const [diseases, levels] = await Promise.all([
      supabaseRest('/rest/v1/diseases?select=id,code,name,category,description,detection_criteria,care_instruction,recommendation,reference_image_path,active,revision&order=code'),
      supabaseRest('/rest/v1/disease_severity_levels?select=disease_id,label,rank,criteria&order=rank'),
    ])
    const levelsByDisease = new Map()
    for (const level of levels) {
      const list = levelsByDisease.get(level.disease_id) || []
      list.push({ label: level.label, rank: level.rank, criteria: JSON.stringify(level.criteria || {}) })
      levelsByDisease.set(level.disease_id, list)
    }
    return sendJson(res, 200, {
      diseases: diseases.map((disease) => ({
        id: disease.code,
        name: disease.name,
        category: disease.category,
        description: disease.description,
        criteria: JSON.stringify(disease.detection_criteria || {}),
        severityCriteria: '',
        severity: 'เล็กน้อย',
        severityLevels: levelsByDisease.get(disease.id) || [],
        care: disease.care_instruction,
        recommendation: disease.recommendation,
        referenceImage: disease.reference_image_path || undefined,
        active: disease.active,
      })),
    })
  } catch (error) {
    console.error('admin diseases read failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดรายการภาวะได้' })
  }
}
