import * as core from '@actions/core'
import { run } from './run.js'

try {
  await run()
} catch (e) {
  core.setFailed(e instanceof Error ? e : String(e))
  console.error(e)
}
