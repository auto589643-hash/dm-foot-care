import type { ResultReviewFinding, ResultReviewChangeSet } from '../types.ts'

export function canonicalizeReviewFindings(findings: readonly ResultReviewFinding[]): ResultReviewFinding[] {
  const unique = new Map<string, ResultReviewFinding>()
  for (const finding of findings) unique.set(finding.diseaseId, { ...finding })
  return [...unique.values()].sort((a, b) => a.diseaseId.localeCompare(b.diseaseId))
}

export function diffReviewFindings(before: readonly ResultReviewFinding[], after: readonly ResultReviewFinding[]): ResultReviewChangeSet {
  const oldById = new Map(canonicalizeReviewFindings(before).map((finding) => [finding.diseaseId, finding]))
  const newById = new Map(canonicalizeReviewFindings(after).map((finding) => [finding.diseaseId, finding]))
  const added = [...newById.values()].filter((finding) => !oldById.has(finding.diseaseId))
  const removed = [...oldById.values()].filter((finding) => !newById.has(finding.diseaseId))
  const changed = [...newById.values()].flatMap((finding) => {
    const previous = oldById.get(finding.diseaseId)
    return previous && previous.severity !== finding.severity
      ? [{ diseaseId: finding.diseaseId, fromSeverity: previous.severity, toSeverity: finding.severity }]
      : []
  })
  return { added, removed, changed }
}

export function hasMaterialReviewChange(before: readonly ResultReviewFinding[], after: readonly ResultReviewFinding[]): boolean {
  const diff = diffReviewFindings(before, after)
  return Boolean(diff.added.length || diff.removed.length || diff.changed.length)
}
