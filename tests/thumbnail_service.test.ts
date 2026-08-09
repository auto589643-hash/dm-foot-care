import assert from 'node:assert/strict'
import { createThumbnail, createThumbnails } from '../src/services/thumbnailService.ts'

assert.equal(await createThumbnail('demo'), 'demo')
assert.equal(await createThumbnail(''), '')
const thumbnails = await createThumbnails({ 'left-dorsal': 'demo', 'right-sole': 'demo' })
assert.deepEqual(thumbnails, { 'left-dorsal': 'demo', 'right-sole': 'demo' })

console.log('Thumbnail service tests passed')
