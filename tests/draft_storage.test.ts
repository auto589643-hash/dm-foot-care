import assert from 'node:assert/strict'
import { clearExaminationDraft, readExaminationDraft, saveExaminationDraft } from '../src/services/draftStorage.ts'

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'window', { value: { localStorage: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
} } })

saveExaminationDraft({ stage: 'capture', step: 2, photos: { 'left-dorsal': 'demo', 'left-sole': 'data:image/jpeg;base64,abc' } })
const draft = readExaminationDraft()
assert.equal(draft?.stage, 'capture')
assert.equal(draft?.step, 2)
assert.equal(draft?.photos['left-dorsal'], 'demo')
assert.equal(draft?.photos['left-sole'], 'data:image/jpeg;base64,abc')

memory.set('dmfc-examination-draft-v1', JSON.stringify({ stage: 'capture', step: 9, photos: {} }))
assert.equal(readExaminationDraft(), null)
clearExaminationDraft()
assert.equal(readExaminationDraft(), null)
console.log('Draft storage tests passed')
