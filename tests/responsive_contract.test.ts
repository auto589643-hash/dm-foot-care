import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/legacy65925.css', import.meta.url), 'utf8')
for (const required of [
  'Project-owner regression contract: mobile dashboard intrinsic-width containment.',
  '.admin-dashboard-page .admin-grid',
  '.admin-dashboard-page .activity-chart',
  '.admin-dashboard-page .followup-list .status-pill',
  'overflow-wrap: anywhere',
]) assert.ok(css.includes(required), `Missing responsive regression contract: ${required}`)
console.log('Responsive contract tests passed')
