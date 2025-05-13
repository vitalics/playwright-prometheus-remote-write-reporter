import { expect as baseExpect, test as baseTest } from "@playwright/test";

import { Counter, Gauge } from "./helpers";

export interface PromRWFixture {
  /**
   * Creates a Counter metric with the specified name and optional labels.
   * @param name - The name of the counter metric.
   * @param labels - Optional key-value pairs for metric labeling.
   * @returns A Counter instance that can be used to track incremental values.
   * @example
   * ```ts
   * test('track API request count', async ({ useCounterMetric, page }) => {
   *   // Create a counter metric for API requests
   *   const apiRequestCounter = useCounterMetric(
   *     'api_requests', {
   *       endpoint: '/users' // endpoint is a custom label
   *     });
   *
   *   // Increment counter when API is called
   *   await page.goto('/users');
   *   apiRequestCounter.inc();
   *
   *   // Increment by specific amount
   *   await page.click('.load-more-users');
   *   apiRequestCounter.inc(5);
   *
   *   // Add additional labels and collect metrics
   *   apiRequestCounter.labels({ status: 'success' }).collect();
   * });
   * ```
   */
  useCounterMetric: (name: string, labels?: Record<string, string>) => Counter;
  /**
   * Creates a Gauge metric with the specified name and optional labels.
   * @param name - The name of the gauge metric.
   * @param labels - Optional key-value pairs for metric labeling.
   * @returns A Gauge instance that can be used to track values that can go up and down.
   * @example
   * ```ts
   * test('track active users', async ({ useGaugeMetric, page }) => {
   *   // Create a gauge metric for active users
   *   const activeUsersGauge = useGaugeMetric('active_users', { region: 'us-east' });
   *
   *   // Set gauge to initial value
   *   activeUsersGauge.set(10);
   *
   *   // Increment gauge when users log in
   *   await page.goto('/login');
   *   await page.fill('#username', 'testuser');
   *   await page.fill('#password', 'password');
   *   await page.click('#login-button');
   *   activeUsersGauge.inc();
   *
   *   // Decrement gauge when users log out
   *   await page.click('#logout-button');
   *   activeUsersGauge.dec();
   *
   *   // Reset to zero and collect metrics
   *   activeUsersGauge.zero().collect();
   * });
   * ```
   */
  useGaugeMetric: (name: string, labels?: Record<string, string>) => Gauge;
}

export const test = baseTest.extend<PromRWFixture>({
  useCounterMetric: [
    async ({}, use) => {
      await use((name, labels) => {
        return new Counter({ name, ...labels });
      });
    },
    { box: true },
  ],
  useGaugeMetric: [
    async ({}, use) => {
      await use((name, labels) => {
        return new Gauge({ name, ...labels });
      });
    },
    { box: true },
  ],
});

export const expect = baseExpect.extend({});
