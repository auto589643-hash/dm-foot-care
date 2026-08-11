import fs from 'node:fs'
const path = 'scripts/apply_production_hardening.mjs'
const before = fs.readFileSync(path, 'utf8')
const after = before.replaceAll('\\\\`', '\\`')
fs.writeFileSync(path, after)
console.log(`normalized ${before === after ? 0 : 1} hardening script`)
