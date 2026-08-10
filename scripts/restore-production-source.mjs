import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function restore(partsDirectory, targetFile) {
  const directory = path.join(root, partsDirectory)
  const names = (await readdir(directory))
    .filter((name) => /^part-\d+\.txt$/.test(name))
    .sort()

  if (!names.length) throw new Error(`No production source fragments found in ${partsDirectory}`)

  const chunks = await Promise.all(names.map((name) => readFile(path.join(directory, name), 'utf8')))
  await writeFile(path.join(root, targetFile), chunks.join(''), 'utf8')
}

await restore('src/production-source/app', 'src/App.tsx')
await restore('src/production-source/styles', 'src/styles.css')
