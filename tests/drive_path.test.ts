import assert from 'node:assert/strict'
import { buildOriginalDriveFilename, buildOriginalDrivePath } from '../src/services/drivePath.ts'

assert.equal(buildOriginalDrivePath('DM001', 'EX000124', '2026-08-08T12:00:00.000Z'), 'DM Foot Care/รูปเท้า/2026/August/08/DM001_EX000124')
assert.equal(buildOriginalDrivePath('DM001', 'EX000124', new Date('2026-02-03T00:00:00.000Z')), 'DM Foot Care/รูปเท้า/2026/February/03/DM001_EX000124')
assert.throws(() => buildOriginalDrivePath('DM/001', 'EX000124', '2026-08-08T00:00:00.000Z'), /Drive path segment is invalid/)
assert.throws(() => buildOriginalDrivePath('DM001', 'EX000124', 'not-a-date'), /Invalid examination timestamp/)
assert.equal(buildOriginalDriveFilename('left-dorsal', 'image/jpeg'), '01_left_dorsal.jpg')
assert.equal(buildOriginalDriveFilename('right-sole', 'image/png'), '04_right_sole.png')
assert.equal(buildOriginalDriveFilename('left-sole', 'image/unknown'), '02_left_sole.jpg')

console.log('Drive path tests passed')
