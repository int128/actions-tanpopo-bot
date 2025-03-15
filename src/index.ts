import * as core from '@actions/core'
import { run } from './run.js'

try {
  await run({
    appId: core.getInput('github-app-id', { required: true }),
    appPrivateKey: core.getInput('github-app-private-key', { required: true }),
    dryRun: core.getBooleanInput('dry-run'),
  })
} catch (e) {
  core.setFailed(e instanceof Error ? e : String(e))
  console.error(e)
}
