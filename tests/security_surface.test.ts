import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const projectRoot = process.cwd()
const sourceRoot = join(projectRoot, 'src')
const bundleRoot = join(projectRoot, 'dist', 'assets')

const forbiddenPatterns = [
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i,
  /(?:sk|pk)_(?:live|test)_[a-z0-9]{12,}/i,
  /eyJ[a-z0-9_-]{16,}\.[a-z0-9_-]{16,}\.[a-z0-9_-]{16,}/i,
  /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON|CLOUD_AI_API_KEY)\s*[=:]\s*(?!['"]{2}|undefined|null|[,}\]])\S+/i,
]

function collectFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry)
    return statSync(path).isDirectory() ? collectFiles(path) : [path]
  })
}

for (const file of [...collectFiles(sourceRoot), ...collectFiles(bundleRoot)]) {
  const content = readFileSync(file, 'utf8')
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(content), false, `secret-like value found in ${file}: ${pattern}`)
  }
}

const appSource = readFileSync(join(sourceRoot, 'App.tsx'), 'utf8')
assert.equal(/localStorage\.setItem\(['"]dmfc-demo-pin/i.test(appSource), false, 'raw PIN must not be persisted by the client')
assert.equal(/console\.log\([^)]*(?:pin|token|credential|base64)/i.test(appSource), false, 'sensitive values must not be logged by the client')

console.log('Security surface tests passed')
