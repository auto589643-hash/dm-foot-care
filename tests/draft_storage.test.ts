import assert from 'node:assert/strict'
import { clearExaminationDraft, readExaminationDraft, saveExaminationDraft } from '../src/services/draftStorage.ts'

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'window', { value: { localStorage: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
} } })

// Node has no IndexedDB in this test, so the module must still read a valid
// legacy draft while refusing old prototype/demo values.
memory.set('dmfc-examination-draft-v1', JSON.stringify({
  stage: 'capture',
  step: 2,
  photos: {
    'left-dorsal': 'demo',
    'left-sole': 'data:image/jpeg;base64,YWJj',
  },
  updatedAt: 123,
}))
const draft = await readExaminationDraft()
assert.equal(draft?.stage, 'capture')
assert.equal(draft?.step, 2)
assert.equal(draft?.photos['left-dorsal'], undefined)
assert.equal(draft?.photos['left-sole'], 'data:image/jpeg;base64,YWJj')

memory.set('dmfc-examination-draft-v1', JSON.stringify({ stage: 'capture', step: 9, photos: {} }))
assert.equal(await readExaminationDraft(), null)

await clearExaminationDraft()
assert.equal(await readExaminationDraft(), null)
assert.equal(memory.has('dmfc-examination-draft-v1'), false)

// If IndexedDB is unavailable, saving a large photo draft is best-effort and
// deliberately does not recreate the old localStorage quota/main-thread issue.
await saveExaminationDraft({ stage: 'capture', step: 0, photos: { 'left-dorsal': 'data:image/jpeg;base64,YWJj' } })
assert.equal(memory.has('dmfc-examination-draft-v1'), false)

console.log('Draft storage tests passed')