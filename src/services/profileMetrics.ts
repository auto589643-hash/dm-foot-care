import type { Profile } from '../types.ts'

/** Calculate completed years from a calendar date without relying on a static profile age. */
export function calculateAge(dateOfBirth: string, now = new Date()): number {
  const date = new Date(`${dateOfBirth}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 0
  let age = now.getFullYear() - date.getFullYear()
  const beforeBirthday = now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())
  if (beforeBirthday) age -= 1
  return Math.max(0, age)
}

/** Generation bands are an explicit product rule so the UI remains deterministic across clients. */
export function calculateGeneration(dateOfBirth: string): string {
  const year = Number.parseInt(dateOfBirth.slice(0, 4), 10)
  if (!Number.isFinite(year)) return 'ไม่ระบุ'
  if (year <= 1945) return 'Silent Generation'
  if (year <= 1964) return 'Baby Boomer'
  if (year <= 1980) return 'Gen X'
  if (year <= 1996) return 'Millennial'
  if (year <= 2012) return 'Gen Z'
  return 'Gen Alpha'
}

export function withDerivedProfile(profile: Profile, now = new Date()): Profile {
  return {
    ...profile,
    age: calculateAge(profile.dateOfBirth, now),
    generation: calculateGeneration(profile.dateOfBirth),
  }
}

