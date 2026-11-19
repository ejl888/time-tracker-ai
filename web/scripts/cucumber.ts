// Runs the shared Gherkin specs for `npm run check`.
// Plain cucumber-js fails on undefined steps, even with strict: false. Here, scenarios with undefined
// steps are reported as not implemented yet instead; failed and ambiguous steps still fail the run.
// Run `npx cucumber-js` directly to get snippets for undefined steps.
import { loadConfiguration, runCucumber } from '@cucumber/cucumber/api'
import { Writable } from 'node:stream'

type OnMessage = NonNullable<Parameters<typeof runCucumber>[2]>
type Envelope = Parameters<OnMessage>[0]
type Pickle = { name: string; uri: string }

const FAILING = new Set(['FAILED', 'AMBIGUOUS'])

const pickles = new Map<string, Pickle>()
const pickleOfTestCase = new Map<string, string>()
const testCaseOfStart = new Map<string, string>()
const stepStatuses = new Map<string, Set<string>>()
const failures: string[] = []
let runError: string | undefined

function onMessage(message: Envelope) {
  if (message.pickle) {
    const { id, name, uri } = message.pickle
    pickles.set(id, { name, uri })
    stepStatuses.set(id, new Set())
  }
  if (message.testCase) {
    pickleOfTestCase.set(message.testCase.id, message.testCase.pickleId)
  }
  if (message.testCaseStarted) {
    testCaseOfStart.set(
      message.testCaseStarted.id,
      message.testCaseStarted.testCaseId,
    )
  }
  if (message.testStepFinished) {
    const { testCaseStartedId, testStepResult } = message.testStepFinished
    const testCaseId = testCaseOfStart.get(testCaseStartedId)
    const pickleId = testCaseId && pickleOfTestCase.get(testCaseId)
    if (!pickleId) return
    const status: string = testStepResult.status
    stepStatuses.get(pickleId)?.add(status)
    if (FAILING.has(status)) {
      const pickle = pickles.get(pickleId)
      failures.push(
        `${pickle?.uri} › ${pickle?.name}\n${testStepResult.message ?? status}`,
      )
    }
  }
  if (message.testRunFinished?.exception) {
    runError = message.testRunFinished.exception.message
  }
}

const { runConfiguration } = await loadConfiguration()
// Discard the formatter output: the summary below replaces it.
const discard = new Writable({ write: (_chunk, _encoding, done) => done() })
await runCucumber(runConfiguration, { stdout: discard }, onMessage)

let passed = 0
let failed = 0
const notImplemented = new Map<string, number>()
for (const [pickleId, statuses] of stepStatuses) {
  if ([...statuses].some((status) => FAILING.has(status))) {
    failed++
  } else if (statuses.has('UNDEFINED') || statuses.has('PENDING')) {
    const uri = pickles.get(pickleId)?.uri ?? '?'
    notImplemented.set(uri, (notImplemented.get(uri) ?? 0) + 1)
  } else {
    passed++
  }
}
const notImplementedTotal = [...notImplemented.values()].reduce(
  (sum, count) => sum + count,
  0,
)

for (const failure of failures) console.error(`\nFAILED ${failure}`)
if (runError) console.error(`\nCucumber run failed: ${runError}`)

console.log(
  `\nScenarios: ${stepStatuses.size} total, ${passed} passed, ${failed} failed, ` +
    `${notImplementedTotal} not implemented yet`,
)
for (const [uri, count] of notImplemented) {
  console.log(`  not implemented: ${count} in ${uri}`)
}

process.exitCode = failed > 0 || runError ? 1 : 0
