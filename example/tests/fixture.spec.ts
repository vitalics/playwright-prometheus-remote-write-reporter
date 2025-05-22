import { test } from "playwright-prometheus-remote-write-reporter";

test("inline metric", async ({ page, useCounterMetric }) => {
  const a = useCounterMetric("qwe_simple_metric");
  page.goto("https://example.com");
  a.inc();
  a.collect();
});
