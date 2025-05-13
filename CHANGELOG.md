# playwright-prometheus-remote-write-reporter

## 1.0.0

### Major Changes

- 0ca42dd: This file contains next updates:

  ### 💥 Breaking Changes

  - `serverUrl` now is required property. Now you get an error if it's not set.

  Error Message:

  ```txt
  'serverUrl' is not defined for 'playwright-prometheus-remote-write-reporter' package. You can set it by following example:

  import { defineConfig } from '@playwright/test';

  export default defineConfig({
    // ...
    reporter: [
      ['playwright-prometheus-remote-write-reporter', {
        serverUrl: 'http://localhost:9090/api/v1/write'
      }]
    ],
    // ...
  });
  ```

  ### 🚀 Features

  - fixture for your short-time (test visibility) metrics.
    Example:

  ```ts
  // filename: fixture.ts
  import { mergeExpects, mergeTests } from "@playwright/test";
  import {
    test as promRWTests,
    expect as promRWExpect,
  } from "playwright-prometheus-remote-write-reporter";

  export const expect = mergeExpects(promRWExpect);
  export const test = mergeTests(promRWTests);
  ```

  Usage:

  ```ts
  // filename: api.test.ts
  import { test } from "./fixture";

  test("track API request count", async ({ useCounterMetric, page }) => {
    // Create a counter metric for API requests
    const apiRequestCounter = useCounterMetric("api_requests", {
      endpoint: "/users", // endpoint is a custom label
    });
    // Increment counter when API is called
    await page.goto("/users");
    apiRequestCounter.inc();
    // Increment by specific amount
    await page.click(".load-more-users");
    apiRequestCounter.inc(5);
    // Add additional labels and collect metrics
    apiRequestCounter.labels({ status: "success" }).collect();
  });
  ```

  ### 🐛 Fixes

  - Fix double test duration metric sending. Code partial takes from #27.
  - Set env variables to empty object for default behavior due to security reason.
  - Fix issue when tests with reason `timedOut` does not send #26.

  ### 🏡 Chore/Infra/Internal/Tests

  - Remove bun lock file.
  - Fix typos in docs.
  - Add JSDoc `env` reporter option with good and bad example.

## 0.1.1

### Patch Changes

- 4c0cbad: update package dependencies

## 0.1.0

### Minor Changes

- f245201: This file contains next updates:

  ### 💥 Breaking Changes

  None

  ### 🚀 Features

  - custom env support: feat: custom env support #8, #13

  - custom labels #9, #10, #11,

  ### 🐛 Fixes

  - auth is not applies #15

  ### 🏡 Chore/Infra/Internal/Tests

  - move to pnpm instead of bun #12
  - add template(`UPCOMING.md`) file for future releases #16
  - add `.DS_Store` in `.gitignore` file #16

## 0.0.4

### Patch Changes

- 2b799f3: Fix peer dependency.

  Add free memory metric for node.js internals.

## 0.0.3

### Patch Changes

- df764f4: fix readme file. Update PW version

## 0.0.2

### Patch Changes

- 61f7af4: initial release
