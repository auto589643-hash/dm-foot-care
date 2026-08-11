import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const processingStart = app.indexOf("if (stage !== 'processing') return")
const finalizeStart = app.indexOf('const finalize = async', processingStart)
assert.ok(processingStart >= 0 && finalizeStart > processingStart)
const processing = app.slice(processingStart, finalizeStart)
const analysisIndex = processing.indexOf('runAnalysisWorkflow({')
const thumbnailIndex = processing.indexOf('thumbnailServiceRef.current.generateAndStore')
assert.ok(analysisIndex >= 0 && thumbnailIndex > analysisIndex, 'thumbnail persistence must begin after analysis workflow/image references')

const endpoint = readFileSync(new URL('../backend/api/v1/examinations/[id]/thumbnails.mjs', import.meta.url), 'utf8')
assert.ok(endpoint.includes("Prefer: 'return=representation'"))
assert.ok(endpoint.includes('linkedRows.length !== 1'))
assert.ok(endpoint.includes('Thumbnail uploaded but image reference is missing'))

const migration = readFileSync(new URL('../supabase/migrations/20260811102500_attach_precreated_thumbnail_on_image_insert.sql', import.meta.url), 'utf8')
assert.ok(migration.includes('examination_images_attach_precreated_thumbnail'))
assert.ok(migration.includes("bucket_id = 'dm-foot-thumbnails'"))
console.log('Thumbnail dependency contract tests passed')
