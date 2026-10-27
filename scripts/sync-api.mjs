// Azure builds api/ on its own, so it can't import from ../src. This copies the
// registrar code into api/src/shared/registrars. Run it (npm run sync:api) after
// changing anything in src/registrars/, and commit the result; a test fails if
// the copy is stale.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SOURCE_DIR = join(root, 'src', 'registrars')
export const TARGET_DIR = join(root, 'api', 'src', 'shared', 'registrars')

export const sharedFiles = () => readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rmSync(TARGET_DIR, { recursive: true, force: true })
  mkdirSync(TARGET_DIR, { recursive: true })
  for (const file of sharedFiles()) cpSync(join(SOURCE_DIR, file), join(TARGET_DIR, file))
  console.log(`Copied ${sharedFiles().length} files to ${TARGET_DIR}`)
}
