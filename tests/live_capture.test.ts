import assert from 'node:assert/strict'
import { analyseLiveFrame, evaluateLiveFrameReadiness } from '../src/services/liveCapture.ts'

function frame(width: number, height: number, transform: (x: number, y: number) => number) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = transform(x, y)
      const offset = ((y * width) + x) * 4
      pixels[offset] = value
      pixels[offset + 1] = value
      pixels[offset + 2] = value
      pixels[offset + 3] = 255
    }
  }
  return pixels
}

const width = 32
const height = 32
const structured = frame(width, height, (x, y) => {
  const insideGuide = x > 7 && x < 26 && y > 4 && y < 29
  return insideGuide ? ((x + y) % 2 === 0 ? 168 : 72) : 120
})
const first = analyseLiveFrame(structured, width, height)
const second = analyseLiveFrame(structured, width, height, first.luminanceSamples)
assert.equal(evaluateLiveFrameReadiness(second).ready, true)

const dark = analyseLiveFrame(frame(width, height, () => 15), width, height)
assert.match(evaluateLiveFrameReadiness(dark).message, /แสงน้อย/)


const moderateMovement = frame(width, height, (x, y) => {
  const insideGuide = x > 7 && x < 26 && y > 4 && y < 29
  return insideGuide ? ((x + y) % 2 === 0 ? 192 : 96) : 120
})
const moderate = analyseLiveFrame(moderateMovement, width, height, first.luminanceSamples)
assert.ok(moderate.motion !== undefined && moderate.motion > 9 && moderate.motion <= 14)
assert.equal(evaluateLiveFrameReadiness(moderate).ready, true)

const moving = analyseLiveFrame(frame(width, height, (x, y) => ((x + y) % 2 === 0 ? 240 : 20)), width, height, first.luminanceSamples)
assert.match(evaluateLiveFrameReadiness(moving).message, /อยู่นิ่ง/)

console.log('Live capture tests passed')
