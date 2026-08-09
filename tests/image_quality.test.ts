import assert from 'node:assert/strict'
import { evaluateImageQuality } from '../src/services/imageQuality.ts'

const good = evaluateImageQuality({ width: 1280, height: 960, meanLuminance: 120, luminanceVariance: 55 })
assert.equal(good.passed, true)
assert.equal(good.checks.length, 4)

const dark = evaluateImageQuality({ width: 1280, height: 960, meanLuminance: 20, luminanceVariance: 55 })
assert.equal(dark.passed, false)
assert.match(dark.message, /มืดเกินไป/)

const bright = evaluateImageQuality({ width: 1280, height: 960, meanLuminance: 245, luminanceVariance: 55 })
assert.equal(bright.passed, false)
assert.match(bright.message, /สว่างเกินไป/)

const blurry = evaluateImageQuality({ width: 1280, height: 960, meanLuminance: 120, luminanceVariance: 4 })
assert.equal(blurry.passed, false)
assert.match(blurry.message, /เบลอหรือสั่น/)

const lowResolution = evaluateImageQuality({ width: 320, height: 480, meanLuminance: 120, luminanceVariance: 55 })
assert.equal(lowResolution.passed, false)
assert.match(lowResolution.message, /ความละเอียดต่ำ/)

const badlyFramed = evaluateImageQuality({ width: 2400, height: 480, meanLuminance: 120, luminanceVariance: 55 })
assert.equal(badlyFramed.passed, false)
assert.equal(badlyFramed.checks[1].passed, false)
assert.match(badlyFramed.message, /สัดส่วนภาพ/)

console.log('Image quality tests passed')
