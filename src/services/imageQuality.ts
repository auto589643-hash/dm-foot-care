export interface ImageQualityMetrics {
  width: number
  height: number
  meanLuminance?: number
  luminanceVariance?: number
}

export interface ImageQualityCheck {
  label: string
  passed: boolean
}

export interface ImageQualityResult {
  passed: boolean
  message: string
  checks: ImageQualityCheck[]
}

/**
 * Browser-friendly heuristic only. It does not claim to detect a disease or
 * segment a foot; the backend must perform authoritative image validation.
 */
export function evaluateImageQuality(metrics: ImageQualityMetrics): ImageQualityResult {
  const dimensionOk = metrics.width >= 480 && metrics.height >= 480
  const aspectRatio = metrics.width > 0 && metrics.height > 0 ? metrics.width / metrics.height : 0
  // Extremely wide/tall files are usually cropped, too close, or not framed for this flow.
  const framingOk = aspectRatio >= 0.55 && aspectRatio <= 1.8
  const brightnessOk = metrics.meanLuminance === undefined || (metrics.meanLuminance >= 35 && metrics.meanLuminance <= 232)
  const detailOk = metrics.luminanceVariance === undefined || metrics.luminanceVariance >= 18
  const passed = dimensionOk && framingOk && brightnessOk && detailOk
  const message = !dimensionOk
    ? 'ภาพมีความละเอียดต่ำเกินไป ลองถือโทรศัพท์ให้ใกล้ขึ้นเล็กน้อย'
    : !framingOk
      ? 'สัดส่วนภาพไม่เหมาะกับกรอบ ลองจัดเท้าให้อยู่ในกรอบและถ่ายใหม่'
      : !brightnessOk
        ? (metrics.meanLuminance! < 35 ? 'ภาพมืดเกินไป ลองเพิ่มแสงบริเวณเท้า' : 'ภาพสว่างเกินไป ลองหลบแสงสะท้อน')
        : !detailOk
          ? 'ภาพอาจเบลอหรือสั่น ลองวางโทรศัพท์ให้นิ่งแล้วถ่ายใหม่'
          : 'ภาพอยู่ในเกณฑ์เบื้องต้น'
  return {
    passed,
    message,
    checks: [
      { label: 'ความละเอียดเพียงพอ', passed: dimensionOk },
      { label: 'จัดภาพในกรอบเหมาะสม', passed: framingOk },
      { label: 'แสงพอดี', passed: brightnessOk },
      { label: 'มีรายละเอียดชัด', passed: detailOk },
    ],
  }
}
