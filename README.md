# playwright-prometheus-remote-write-reporter

## Get Started

**NOTE**: We need to configure prometheus as a precondition.

1. Enable feature flag - remote write receiver
2. in `prometheus.yml` file add next configuration:

```yaml
---
remote_write:
  # local?
  - url: http://localhost:9090/api/v1/write
```

You may found complete example in `example` folder.

## Installation

```bash
npm i playwright-prometheus-remote-write-reporter # npm
yarn add playwright-prometheus-remote-write-reporter # yarn
pnpm add playwright-prometheus-remote-write-reporter # pnpm
bun a playwright-prometheus-remote-write-reporter # bun
```

## Configure reporter

In your `playwright.config.ts` add next lines:

```ts
import { defineConfig } from "@playwright/test";
import { type PrometheusOptions } from "playwright-prometheus-remote-write-reporter";

export default defineConfig({
  // ...
  reporter: [
    [
      "playwright-prometheus-remote-write-reporter",
      {
        serverUrl: "http://localhost:9090/api/v1/write", // same url as declared in precondition
      } satisfies PrometheusOptions, // for autocomplete
    ],
  ],
  // ...
});
```

## Reporter Options

| Option        | Description                                               | Default                                 |
| ------------- | --------------------------------------------------------- | --------------------------------------- |
| serverUrl     | Remote writer server URL [1]                              | Not set. But throws an error if not set |
| headers       | Custom headers for prometheus. E.g. `{header1: 'value1'}` | undefined                               |
| prefix        | Custom metric prefix name                                 | `pw_`                                   |
| auth.username | Basic auth. username                                      | `undefined`                             |
| auth.password | Basic auth. password                                      | `undefined`                             |
| labels        | Ext. labels for all metrics. E.g. `{label1: 'value1'}`    | `undefined`                             |
| env           | Node.js environments object [2]                           | `{}`                                    |

[1]: docs - https://prometheus.io/docs/prometheus/latest/configuration/configuration/#remote_write

[2]: We send empty object due to security reasons, since sending **all** environment variables can be visible for any user.

## Collected metrics

Each metric name starts from `prefix`. By default it's `pw_`. So every metric name described without prefix.

### Test(s)

this metrics below sends periodically and you may found when they sends

| Name                         | Description                                                  | When Sends (hook name) |
| ---------------------------- | ------------------------------------------------------------ | ---------------------- |
| config                       | playwright configuration object                              | onExit                 |
| project                      | playwright project object. E.g. chromium, firefox            | onExit                 |
| test                         | test object                                                  | onTestEnd              |
| test_attachment              | test attachment information                                  | onTestEnd              |
| tests_total_attachment_size  | size (in bytes) about attachments across whole run           | onTestEnd              |
| test_attachment_count        | count of attachments across whole run                        | onTestEnd              |
| test_attachment_size         | attachment size in bytes                                     | onTestEnd              |
| test_annotation              | annotations for 1 test                                       | onTestEnd              |
| test_step_total_count        | count of test steps across whole run                         | onTestEnd              |
| test_step_total_duration     | duration(in ms) how long test steps has been executed        | onTestEnd              |
| test_annotation_count        | count of annotations across all tests                        | onTestEnd              |
| test_error                   | test errors information                                      | onTestEnd              |
| test_duration                | test duration in milliseconds                                | onTestEnd              |
| test_retry_count             | count of retries for 1 test                                  | onTestEnd              |
| timed_out_tests_count        | count of tests with `timedOut` status                        | onTestEnd              |
| test_step_total_error        | Count of errors in all test steps                            | onTestEnd              |
| test_step_duration           | duration of test step                                        | onTestStepEnd          |
| test_step_error_count        | Count of errors in test steps                                | onTestStepEnd          |
| test_step                    | Individual test steps information                            | onTestStepEnd          |
| tests_attachment_total_size  | total attachment size in bytes for all tests                 | onExit                 |
| tests_total_duration         | time for all tests                                           | onExit                 |
| tests_total_count            | total count of all tests                                     | onExit                 |
| passed_count                 | count of all passed tests                                    | onExit                 |
| timed_out_tests_count        | count of all tests with `timedOut` status                    | onExit                 |
| skipped_tests_count          | count of all skipped tests                                   | onExit                 |
| passed_count                 | count of all tests with `passed` status                      | onExit                 |
| failed_count                 | count of all failed tests                                    | onExit                 |
| tests_attachment_total_count | count of attachments across all tests                        | onExit                 |
| errors_count                 | count of errors across all tests                             | onError                |
| stdout                       | stdout for test. Reporter logs have label: `internal="true"` | onStdOut               |
| stderr                       | stdout for test. Reporter logs have label: `internal="true"` | onStdErr               |

### Node.js internals

This metrics collects every reporter lifecycle.

[Playwright Reporter API hooks](https://playwright.dev/docs/api/class-reporter)

| Name                      | Description                                                                              | Value               |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------- |
| node_env                  | environment variables [1] [2].                                                           | undefined           |
| node_argv                 | command-line arguments passed when the Node.js process was launched (playwright) [3] [4] | process.argv        |
| node_versions             | version strings of Node.js and its dependencies [5]                                      | process.versions    |
| node_os                   | information about current operation system [6]                                           | os                  |
| node_cpu_system           | cpu system utilization [7]                                                               | process.cpuUsage    |
| node_cpu_user             | cpu user utilization [7]                                                                 | process.cpuUsage    |
| node_memory_external      | memory usage of the Node.js process measured in bytes [8]                                | process.memoryUsage |
| node_memory_array_buffers | memory usage of the Node.js process measured in bytes [8]                                | process.memoryUsage |
| node_memory_heap_used     | memory usage of the Node.js process measured in bytes [8]                                | process.memoryUsage |
| node_memory_rss           | memory usage of the Node.js process measured in bytes [8]                                | process.memoryUsage |
| node_memory_heap_total    | memory usage of the Node.js process measured in bytes [8]                                | process.memoryUsage |

[1]: Do not use "process.env.name" variable since it can overwrite your "node_env" metric.

[2]: docs: https://nodejs.org/docs/latest/api/process.html#processenv

[3]: docs: https://nodejs.org/docs/latest/api/process.html#processargv
[4]: Map process.argv into process.argv with labels `arg_{index} = value` (see issue #34)

[5]: docs: https://nodejs.org/docs/latest/api/process.html#processversions

[6]: docs: https://nodejs.org/docs/latest/api/os.html#osarch

[7]: docs: https://nodejs.org/docs/latest/api/process.html#processcpuusagepreviousvalue

[8]: docs: https://nodejs.org/docs/latest/api/process.html#processmemoryusage

## Using custom metrics

You can define own metrics following next code:

```ts
import { test } from "@playwright/test";
import { Counter, Gauge } from "playwright-prometheus-remote-write-reporter";

const countOfUrlCalls = new Counter(
  {
    // only name is required
    name: "url_open", // will automatically appends prefix
  },
  0,
); // starts from 0

test("simple counter test", async ({ page }) => {
  await page.goto("https://example.com");
  countOfUrlCalls.inc();

  // ... rest test
});

test.afterAll(() => {
  countOfUrlCalls.collect(); // sends metrics to prometheus
});
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

1. Add (or create) in your fixture

```ts
// file: fixture.ts
import { mergeExpects, mergeTests } from "@playwright/test";
import {
  expect as promRWExpect,
  test as promRWTests,
} from "playwright-prometheus-remote-write-reporter";

export const expect = mergeExpects(promRWExpect);
export const test = mergeTests(promRWTests);
```

2. Use it!

```ts
// filename: some.test.ts
import { test, expect } from "./fixture";

test("use some base metric", async ({ useCounterMetric, page }) => {
  const urlCallsMetric = useCounterMetric("url_calls");
  const cssInteractionsMetric = useCounterMetric("css_interactions", {
    selector: "css", // custom label
  });
  // your logic
  await page.goto("https://example.com");
  urlCallsMetric.inc();

  await page.locator("css=.example-class");
  cssInteractionsMetric.inc();

  // on test end
  urlCallsMetric.collect();
  cssInteractionsMetric.collect();
});
```

You can read more about fixtures in [official docs page](https://playwright.dev/docs/test-fixtures#combine-custom-fixtures-from-multiple-modules)

### Other practices

We additional recommends to use one of 2 practices for send metrics to prometheus via `collect` method:

- on afterEach/afterAll hook
- on each test
- on base hook

You also can use `using` keyword to automatically call `.collect` and `.reset` methods after the end of lexical environment. See [explicit resource management](https://github.com/tc39/proposal-explicit-resource-management) TC39 proposal.

example:

```ts
import { test as base } from "@playwright/test";
import { Counter, Gauge } from "playwright-prometheus-remote-write-reporter";

type Context = {
  urlCalls: Counter;
};

const test = base.extend<Context>({
  urlCalls: async ({}, use) => {
    const counter = new Counter({ name: "url_calls" });
    await use(counter);
    // automatically sends metrics
    counter.collect();
  },
});

test("extended test", ({ urlCalls }) => {
  // ...
  urlCalls.inc();
});

// or with using keyword
test("Some long test", () => {
  using someMetricDuringTheTest = new Counter({ name: "some_metric" });
  someMetricDuringTheTest.inc();
  page.goto("SomePage");
  // ...
  // automatically calls .collect and .reset methods, due to the using keyword
});

// or
const anotherCounter = new Counter({ name: "custom_counter" });
base("some test", () => {
  anotherCounter.inc();
});
base.afterAll(() => {
  anotherCounter.collect();
});
```
