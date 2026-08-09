import { supabaseRest } from './supabase.mjs'

export async function getOwnedExamination(userId, examinationId) {
  const rows = await supabaseRest(`/rest/v1/examinations?select=id,examination_code,user_id,status,examined_at,created_at&user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(examinationId)}&limit=1`)
  return rows?.[0] || null
}

export function queryParam(req, name) {
  const value = req.query?.[name]
  return Array.isArray(value) ? value[0] : value
}
