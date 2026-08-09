import assert from 'node:assert/strict'
import { calculateAge, calculateGeneration } from '../src/services/profileMetrics.ts'

const now = new Date('2026-08-08T12:00:00')
assert.equal(calculateAge('1964-04-12', now), 62)
assert.equal(calculateAge('1964-12-12', now), 61)
assert.equal(calculateAge('not-a-date', now), 0)
assert.equal(calculateGeneration('1964-04-12'), 'Baby Boomer')
assert.equal(calculateGeneration('1978-01-01'), 'Gen X')
assert.equal(calculateGeneration('1990-01-01'), 'Millennial')
assert.equal(calculateGeneration('2005-01-01'), 'Gen Z')

console.log('Profile metrics tests passed')

