import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const useUserContextSource = readFileSync(
  join(__dirname, 'useUserContext.ts'),
  'utf8',
)

const providersSource = readFileSync(
  join(__dirname, '..', 'providers.tsx'),
  'utf8',
)

describe('useUserContext provider contracts', () => {
  it('exports a provider-backed singleton hook instead of per-call fetch state (#5903)', () => {
    expect(useUserContextSource).toContain('createContext')
    expect(useUserContextSource).toContain('export function UserContextProvider')
    expect(useUserContextSource).toContain('useContext(')
    expect(providersSource).toContain('<UserContextProvider>')
  })
})
