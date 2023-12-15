# playwright-prometheus-remote-write-reporter

## Get Started

**NOTE**: We need to configure prometheus as a precondition.

1. Enable feature flag - remote write receiver
2. in prometheus.yml file add next configuration:

```yaml
...
remote_write:
    # local?
  - url: http://localhost:9090/api/v1/write
...

```

You may found complete example in `example` folder.

## Installation

``` bash
npm i playwright-prometheus-remote-write-reporter # npm
yarn add playwright-prometheus-remote-write-reporter # yarn
pnpm add playwright-prometheus-remote-write-reporter # pnpm
bun a playwright-prometheus-remote-write-reporter # bun
```

## Configure reporter

In your `playwright.config.ts` add next lines:

```ts
import PrometheusRWReporter from 'playwright-prometheus-remote-write-reporter'

export default defineConfig({
// ...
  reporter: [
    ['playwright-prometheus-remote-write-reporter', {
      // options object
    }]
  ],
// ...
})

```

## Reporter Options

| Option        | Description                                               | Default                              |
|---------------|-----------------------------------------------------------|--------------------------------------|
| serverUrl     | Remote writer server URL                                  | `http://localhost:9090/api/v1/write` |
| headers       | Custom headers for prometheus. E.g. `{header1: 'value1'}` | undefined                            |
| prefix        | Custom metric prefix name                                 | `pw_`                                |
| auth.username | Basic auth. username                                      | undefined                            |
| auth.password | Basic auth. password                                      | undefined                            |

## Collected metrics

Each metric name starts from `prefix`. By default it's `pw_`. So every metric name described without prefix.

### Test(s)

this metrics below sends periodically and you may found when they sends

| Name                         | Description                                                  | When Sends (hook name) |
|------------------------------|--------------------------------------------------------------|------------------------|
| config                       | playwright configuration object                              | onExit                 |
| project                      | playwright project object. E.g. chromium, firefox            | onExit                 |
| test                         | test object                                                  | onTestEnd              |
| test_attachment              | test attachment information                                  | onTestEnd              |
| test_attachment_size         | attachment size in bytes                                     | onTestEnd              |
| test_annnotation             | annotations for 1 test                                       | onTestEnd              |
| test_error                   | test errors information                                      | onTestEnd              |
| test_duration                | test duration in milliseconds                                | onTestEnd              |
| test_retry_count             | count of retries for 1 test                                  | onTestEnd              |
| tests_attachment_total_size  | total attachment size in bytes for all tests                 | onExit                 |
| tests_total_duration         | time for all tests                                           | onExit                 |
| tests_total_count            | total count of all tests                                     | onExit                 |
| tests_skip_count             | count of all skipped tests                                   | onExit                 |
| tests_pass_count             | count of all passed tests                                    | onExit                 |
| tests_fail_count             | count of all failed tests                                    | onExit                 |
| tests_attachment_total_count | count of attachments across all tests                        | onExit                 |
| error_count                  | count of errors                                              | onError                |
| stdout                       | stdout for test. Reporter logs have label: `internal="true"` | onStdOut               |
| stderr                       | stdout for test. Reporter logs have label: `internal="true"` | onStdErr               |

### Node.js internals

This metrics collects every reporter lifecycle.

[Playwright Reporter API hooks](https://playwright.dev/docs/api/class-reporter)

| Name                      | Description                                                                          | Value               |
|---------------------------|--------------------------------------------------------------------------------------|---------------------|
| node_env                  | environment variables [1] [2].                                                       | process.env         |
| node_argv                 | command-line arguments passed when the Node.js process was launched (playwright) [3] | process.argv        |
| node_versions             | version strings of Node.js and its dependencies [4]                                  | process.versions    |
| node_os                   | information about current operation system [5]                                       | os                  |
| node_cpu_system           | cpu system utilization [6]                                                           | process.cpuUsage    |
| node_cpu_user             | cpu user utilization [6]                                                             | process.cpuUsage    |
| node_memory_external      | memory usage of the Node.js process measured in bytes [7]                            | process.memotyUsage |
| node_memory_array_buffers | memory usage of the Node.js process measured in bytes [7]                            | process.memotyUsage |
| node_memory_heap_used     | memory usage of the Node.js process measured in bytes [7]                            | process.memotyUsage |
| node_memory_rss           | memory usage of the Node.js process measured in bytes [7]                            | process.memotyUsage |
| node_memory_heap_total    | memory usage of the Node.js process measured in bytes [7]                            | process.memotyUsage |

[1]: Do not use "process.env.name" variable since it can overwrite your "node_env" metric.
[2]: docs: https://nodejs.org/docs/latest/api/process.html#processenv
[3]: docs: https://nodejs.org/docs/latest/api/process.html#processargv
[4]: docs: https://nodejs.org/docs/latest/api/process.html#processversions
[5]: docs: https://nodejs.org/docs/latest/api/os.html#osarch
[6]: docs: https://nodejs.org/docs/latest/api/process.html#processcpuusagepreviousvalue
[7]: docs: https://nodejs.org/docs/latest/api/process.html#processmemoryusage

## Using custom metrics

You can define own metrics following next code:

```ts
import { test } from '@playwright/test'
import { Counter, Gauge } from 'playwright-prometheus-remote-write-reporter'

const countOfUrlCalls = new Counter({
  // only name is requrired
  name: 'url_open' // will automatically appends prefix
}, 0) // starts from 0

test('simple counter test', async ({ page }) => {
  await page.goto('https://example.com')
  countOfUrlCalls.inc()

  // ... rest test
})

test.afterAll(() => {
  countOfUrlCalls.collect() // sends metrics to prometheus
})

```

### Counter

Counters go up, and reset when the process restarts.

#### Counter API

- `constructor`(labels, initialValue)
  - `labels`: `Record<string, string>` - collected metrics. only `name` field is required.
  - `initialValue`: `number` - default is 0. If metric is constant we recommend to set to `1`
- `inc([value])` increments your counter.
  - `value`: `number | undefined` - count of increasing
- `collect()` - Send metrics to prometheus
- `labels(label)` - append extra labels
  - `label`: `Record<string, string>`. Do not overwrite `name` property.

### Gauge

Gauges are similar to Counters but a Gauge's value can be decreased.

#### Gauge API

Same for [Counter](#counter)

- `set(value)` - set gauge value
  - `value`: `number`
- `zero()` - same as `set(0)`
- `dec([value])` - decrement gauge value
  - `value`: `number | undefined`

### Best practice

We Highly recommend use one of 2 practiceies for send metrics to prometheus via `collect` method:

- on afterEach/afterAll hook
- on base hook

example:

```ts
import { test as base } from '@playwright/test'
import { Counter, Gauge } from 'playwright-prometheus-remote-write-reporter'

type Context = {
  urlCalls: Counter
}

const test = base.extend<Context>({
  urlCalls: async ({}, use) => {
    const counter = new Counter({name: 'url_calls'})
    await use(counter)
    // automatically sends metrics
    counter.collect()
  }
})

test('extended test', ({urlCalls}) => {
  // ...
  urlCalls.inc()
})

// or
const anotherCounter = new Counter({name: 'custom_counter'})
base('some test', () => {
  anotherCounter.inc()
})
base.afterAll(() => {
  anotherCounter.colect()
})

```
