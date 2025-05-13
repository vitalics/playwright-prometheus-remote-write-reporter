---
"playwright-prometheus-remote-write-reporter": major
---

This file contains next updates:

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
