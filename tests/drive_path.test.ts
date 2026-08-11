import assert from 'node:assert/strict'
import { buildOriginalDriveFilename, buildOriginalDrivePath } from '../src/services/drivePath.ts'

assert.equal(buildOriginalDrivePath('DM001', 'EX000124', '2026-08-08T12:00:00.000Z'), 'DMFC Program/2026/08/08/DM001')
assert.equal(buildOriginalDrivePath('DM001', 'EX000124', new Date('2026-02-03T00:00:00.000Z')), 'DMFC Program/2026/02/03/DM001')
assert.throws(() => buildOriginalDrivePath('DM/001', 'EX000124', '2026-08-08T00:00:00.000Z'), /Drive path segment is invalid/)
assert.throws(() => buildOriginalDrivePath('DM001', 'EX000124', 'not-a-date'), /Invalid examination timestamp/)
assert.equal(buildOriginalDriveFilename('left-dorsal', 'image/jpeg'), 'หลังเท้าซ้าย.jpg')
assert.equal(buildOriginalDriveFilename('right-sole', 'image/png'), 'ฝ่าเท้าขวา.png')
assert.equal(buildOriginalDriveFilename('left-sole', 'image/unknown'), 'ฝ่าเท้าซ้าย.jpg')

console.log('Drive path tests passed')
