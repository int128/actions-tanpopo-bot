import { describe, expect, it } from 'vitest'
import { findCheckedRepositories } from '../src/run.js'

describe('findCheckedRepositories', () => {
  it('returns checked repositories', () => {
    const comment = `<!-- int128/actions-tanpopo-bot -->
## :robot: actions-tanpopo-bot
- [x] int128/foo
- [ ] int128/bar
- [x] int128/baz
`
    const checked = findCheckedRepositories(comment)
    expect(checked).toEqual(['int128/foo', 'int128/baz'])
  })
})
