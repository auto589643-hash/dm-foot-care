export interface LiveFrameMetrics {
  meanLuminance: number
  luminanceVariance: number
  edgeEnergy: number
  centerDetailRatio: number
  motion?: number
}

export interface AnalysedLiveFrame extends LiveFrameMetrics {
  luminanceSamples: Float32Array
}

export interface LiveFrameReadiness {
  ready: boolean
  message: string
}

/**
 * Small, on-device frame heuristic for capture timing. It verifies light,
 * detail, framing evidence and motion; it is deliberately not presented as a
 * medical or foot-identification model. A calibrated foot model can replace
 * the framing-evidence check without changing the capture state machine.
 */
export function analyseLiveFrame(pixels: Uint8ClampedArray, width: number, height: number, previous?: ArrayLike<number>): AnalysedLiveFrame {
  const count = width * height
  const luminances = new Float32Array(count)
  let sum = 0
  for (let index = 0; index < count; index += 1) {
    const pixel = index * 4
    const luminance = (pixels[pixel] * 0.299) + (pixels[pixel + 1] * 0.587) + (pixels[pixel + 2] * 0.114)
    luminances[index] = luminance
    sum += luminance
  }

  const meanLuminance = count ? sum / count : 0
  let varianceSum = 0
  let edgeSum = 0
  let edgeCount = 0
  let centerDetailCount = 0
  let centerCount = 0
  let motionSum = 0
  const centerLeft = Math.floor(width * 0.18)
  const centerRight = Math.ceil(width * 0.82)
  const centerTop = Math.floor(height * 0.12)
  const centerBottom = Math.ceil(height * 0.9)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width) + x
      const luminance = luminances[index]
      varianceSum += (luminance - meanLuminance) ** 2
      if (previous?.[index] !== undefined) motionSum += Math.abs(luminance - previous[index])
      if (x === 0 || y === 0) continue
      const gradient = Math.abs(luminance - luminances[index - 1]) + Math.abs(luminance - luminances[index - width])
      edgeSum += gradient
      edgeCount += 1
      if (x >= centerLeft && x < centerRight && y >= centerTop && y < centerBottom) {
        centerCount += 1
        if (gradient >= 22) centerDetailCount += 1
      }
    }
  }

  return {
    meanLuminance,
    luminanceVariance: count ? varianceSum / count : 0,
    edgeEnergy: edgeCount ? edgeSum / edgeCount : 0,
    centerDetailRatio: centerCount ? centerDetailCount / centerCount : 0,
    ...(previous?.length === count ? { motion: motionSum / count } : {}),
    luminanceSamples: luminances,
  }
}

export function evaluateLiveFrameReadiness(metrics: LiveFrameMetrics): LiveFrameReadiness {
  if (metrics.meanLuminance < 35) return { ready: false, message: 'แสงน้อยเกินไป' }
  if (metrics.meanLuminance > 232) return { ready: false, message: 'แสงจ้าเกินไป' }
  if (metrics.luminanceVariance < 18 || metrics.edgeEnergy < 12) return { ready: false, message: 'ภาพยังไม่ชัดพอ' }
  if (metrics.centerDetailRatio < 0.045) return { ready: false, message: 'จัดเท้าให้อยู่ในกรอบ' }
  if (metrics.motion !== undefined && metrics.motion > 9) return { ready: false, message: 'อยู่นิ่งสักครู่' }
  return { ready: true, message: 'จัดภาพพร้อมแล้ว' }
}
