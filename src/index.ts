import path from "node:path";
import { URL } from "node:url";
import { cpuUsage, memoryUsage, argv, versions } from "node:process";
import {
  arch,
  cpus,
  availableParallelism,
  machine,
  userInfo,
  platform,
  release,
  type,
  version,
  freemem,
} from "node:os";

import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
  TestStep,
  TestError,
} from "@playwright/test/reporter";
import { pushTimeseries, Options, Timeseries } from "prometheus-remote-write";
import { Event } from "./utils";
import { Counter, Gauge, Metric } from "./helpers";

export type PrometheusOptions = {
  /**
   * URL of the Prometheus remote write implementation's endpoint.
   * @throws "TypeError" if not defined in options
   */
  serverUrl: string | URL;
  /**
   * Additional headers to include in the HTTP requests.
   * @example
   * { header1: 'key1' }
   */
  headers?: Record<string, string>;
  auth?: {
    /** Basic auth. Username */
    username?: string;
    /** Basic auth. Password */
    password?: string;
  };
  /** @default 'pw_' */
  prefix?: string;
  /**
   * Additional labels to apply to each timeseries.
   * @example
   * { instance: "hostname" }
   */
  labels?: Record<string, string>;
  /**
   * env variables to send. Default is empty object due to security reasons.
   * @default `{}` empty object
   * @see {@link https://nodejs.org/docs/latest/api/process.html#processenv node.js - process.env}
   * @example
   * // setup all env variables, unsafe ❌
   * export default defineConfig({
   *   // ...
   *   reporter: [
   *     ['playwright-prometheus-remote-write-reporter', {
   *       serverUrl: 'http://localhost:9090/api/v1/write',
   *       env: process.env // setup all env variables. Use it own risk
   *     }]
   *   ],
   *   // ...
   * });
   * @example
   * // collect system info only - good ✅
   * import os from 'node:os'
   * export default defineConfig({
   *   // ...
   *   reporter: [
   *     ['playwright-prometheus-remote-write-reporter', {
   *       serverUrl: 'http://localhost:9090/api/v1/write',
   *       env: {
   *         user: os.userInfo().username,
   *         platform: os.platform(),
   *         type: os.type(),
   *         version: os.version(),
   *         productVersion: process.env.MY_PRODUCT_VERSION, // e.g. 2.4.8
   *      },
   *     }]
   *   ],
   *   // ...
   * });
   */
  env?: Record<string, string | undefined>;
};

const DEFAULT_PREFIX = `pw_`;

type CPUUsageObject = ReturnType<typeof cpuUsage>;
type MemoryUsageObject = ReturnType<typeof memoryUsage>;

export default class PrometheusReporter implements Reporter {
  private readonly options: Options = {};
  private readonly prefix: string;
  private readonly env: Record<string, string | undefined>;
  private pw_projects: Counter[] = [];

  private readonly test_step_total_count = new Counter({
    name: "test_step_total_count",
    description: "count of all test_step that was executed in all time",
  });
  private readonly test_step_total_duration = new Gauge({
    name: "test_step_total_duration",
    unit: "ms",
    description:
      "duration in milliseconds of all test_step that was executed in all time",
  });
  private readonly test_annotation_count = new Counter({
    name: "test_annotation_count",
    description: "Count of annotations in tests",
  });
  private test_step_duration = new Gauge({
    name: "test_step_duration",
    unit: "ms",
    description: `Total duration of all test steps`,
  });
  private test_step_error_count = new Counter({
    name: "test_step_error_count",
    description: `Count of errors in test steps`,
  });
  private test_step_total_error = new Counter({
    name: "test_step_total_error",
    description: `Total errors in test steps`,
  });
  private test_step = new Counter({
    name: "test_step",
    description: `Individual test steps`,
  });
  private readonly pw_stderr = new Counter({
    name: "stderr",
    description: `Standard error stream from Playwright`,
  });
  private readonly pw_stdout = new Counter({
    name: "stdout",
    description: `Standard output stream from Playwright`,
  });
  private readonly pw_config = new Counter(
    {
      name: "config",
      description: `Configuration settings for Playwright`,
    },
    1,
  );

  private test_attachment_count = new Counter({
    name: "test_attachment_count",
    description: "Count of attachments in tests",
  });
  private test_attachment_size = new Gauge({
    name: "test_attachment_size",
    unit: "bytes",
    description: "information about attachment size for each test",
  });
  private tests_total_attachment_size = new Gauge({
    name: "tests_attachment_total_size",
    unit: "bytes",
  });
  private errors_count = new Counter({
    name: "error_count",
  });
  private test_errors = new Counter({
    name: "test_errors",
  });
  private tests_total_attachment = new Counter({
    name: "tests_attachment_total_count",
  });
  private test_duration = new Gauge({
    name: "test_duration",
    unit: "ms",
  });
  private test = new Counter({
    name: "test",
  });
  private test_retry_count = new Counter({
    name: "test_retry_count",
  });
  private total_duration = new Gauge({
    name: "tests_total_duration",
    unit: "ms",
  });
  private readonly test_total_count = new Counter({
    name: "tests_total_count",
  });
  private readonly skipped_tests_count = new Counter({
    name: "tests_skipped_count",
  });
  private readonly timed_out_tests_count = new Counter({
    name: "tests_timed_out_count",
  });
  private readonly passed_count = new Counter({
    name: "tests_passed_count",
  });
  private readonly failed_count = new Counter({
    name: "tests_failed_count",
  });
  // Node.js internals. Useful to see memory leaks
  private readonly node_memory_heap_total = new Gauge({
    name: "node_memory_heap_total",
    unit: "bytes",
  });
  private readonly node_memory_rss = new Gauge({
    name: "node_memory_rss",
    unit: "bytes",
  });
  private readonly node_memory_heap_used = new Gauge({
    name: "node_memory_heap_used",
    unit: "bytes",
  });
  private readonly node_memory_external = new Gauge({
    name: "node_memory_external",
    unit: "bytes",
  });
  private readonly node_memory_free = new Gauge({
    name: "node_memory_free",
    unit: "bytes",
  });
  private readonly node_memory_array_buffers = new Gauge({
    name: "node_memory_array_buffers",
    unit: "bytes",
  });

  private readonly node_cpu_user = new Gauge({
    name: "node_cpu_user",
  });
  private readonly node_cpu_system = new Gauge({
    name: "node_cpu_system",
  });
  private readonly node_argv = new Counter(
    {
      name: "node_argv",
      ...Object.fromEntries(
        argv.map((value, index) => [`arg_${index}`, value] as const),
      ),
    },
    1,
  );
  private readonly node_os = new Counter(
    {
      name: "node_os",
      arch: arch(),
      cpusCount: String(cpus().length),
      availableParallelism: String(availableParallelism()),
      machine: machine(),
      username: userInfo().username,
      shell: userInfo().shell ?? "",
      uid: String(userInfo().uid),
      gid: String(userInfo().gid),
      homedir: userInfo().homedir,
      platform: platform(),
      release: release(),
      type: type(),
      version: version(),
    },
    1,
  );

  private readonly node_env: Counter;

  private readonly node_versions = new Counter(
    {
      name: "node_versions",
      ...versions,
    },
    1,
  );

  /** timeseries from user tests */
  private readonly timeseries: Timeseries[] = [];
  constructor(options: PrometheusOptions = {} as PrometheusOptions) {
    this.options.url =
      new URL(options.serverUrl).toString() ??
      (() => {
        throw new TypeError(
          `'serverUrl' is not defined for 'playwright-prometheus-remote-write-reporter' package. You can set it by following example:

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
`,
        );
      })();
    this.options.headers = options?.headers ?? {};
    this.options.fetch = fetch as never;
    this.prefix = options.prefix ?? DEFAULT_PREFIX;
    this.options.labels = options?.labels ?? {};
    this.options.auth = options?.auth;
    this.env = options?.env ?? {};
    this.node_env = new Counter(
      {
        name: "env",
        ...this.env,
      },
      1,
    );
  }

  private memoryDelta: MemoryUsageObject | undefined;
  private cpuDelta: CPUUsageObject | undefined;
  private updateNodejsStats() {
    this.cpuDelta = cpuUsage(this.cpuDelta);
    this.node_cpu_user.set(this.cpuDelta.user);
    this.node_cpu_system.set(this.cpuDelta.system);

    this.node_memory_free.set(freemem());

    this.memoryDelta = memoryUsage();
    this.node_memory_array_buffers.set(this.memoryDelta.arrayBuffers);
    this.node_memory_external.set(this.memoryDelta.external);
    this.node_memory_heap_total.set(this.memoryDelta.heapTotal);
    this.node_memory_heap_used.set(this.memoryDelta.heapUsed);
    this.node_memory_rss.set(this.memoryDelta.rss);
  }
  private async sendNodejsStats() {
    const stats = [
      this.node_cpu_user,
      this.node_cpu_system,
      this.node_memory_array_buffers,
      this.node_memory_external,
      this.node_memory_heap_total,
      this.node_memory_heap_used,
      this.node_memory_rss,
      this.node_os,
      this.node_env,
      this.node_argv,
      this.node_versions,
    ].map((s) => this.mapTimeseries(s));

    await this.send(stats);
  }

  private async send(series: Timeseries | Timeseries[]) {
    await pushTimeseries(series, this.options);
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.pw_config.labels({
      workers: String(config.workers),
      forbidOnly: String(config.forbidOnly),
      configFile: config.configFile ?? "",
      fullyParallel: String(config.fullyParallel),
      preserveOutput: config.preserveOutput,
      quiet: String(config.quiet),
      updateSnapshots: config.updateSnapshots,
      version: config.version,
      shard_current: String(config.shard?.current ?? 1),
      shard_total: String(config.shard?.total ?? 1),
    });
    this.pw_projects = config.projects.map((project) => {
      return new Counter(
        {
          name: "project",
          projectName: project.name,
          outputDir: project.outputDir,
          repeatEach: String(project.repeatEach),
          snapshotDir: project.snapshotDir,
          testDir: project.testDir,
          timeout: String(project.timeout),
          unit: "ms",
        },
        1,
      );
    });
    this.updateNodejsStats();
  }

  private updateResults(result: TestResult) {
    if (result.status === "passed") {
      this.passed_count.inc();
    }
    if (result.status === "failed") {
      this.failed_count.inc();
    }
    if (result.status === "skipped") {
      this.skipped_tests_count.inc();
    }
    if (result.status === "timedOut") {
      this.timed_out_tests_count.inc();
    }
    this.test_total_count.inc();
    this.total_duration.inc(result.duration);
  }

  async onStepEnd(test: TestCase, result: TestResult, step: TestStep) {
    const location = this.location(step);
    const labels: Record<string, string> = {
      category: step.category,
      path: location,
      testId: test.id,
      duration: String(step.duration),
      startTime: String(step.startTime),
      titlePath: step.titlePath().join("->"),
      stepsCount: String(step.steps.length),
      testTitle: test.title,
      stepInnerCount: String(step.steps.length),
      parallelIndex: String(result.parallelIndex),
      retryCount: String(result.retry),
      status: String(result.status),
    };
    if (step.error) {
      const errorMessage =
        step.error.message?.replace(/\r?\n|\r/g, " ") ??
        // [TODO] trim message?
        JSON.stringify(step.error.message);
      labels.errorMessage = errorMessage;
      labels.errorSnippet = String(step.error.snippet ?? "<unknown snippet>");
      labels.errorStack = String(step.error.stack ?? "<empty stack>");
      labels.errorValue = String(step.error.value ?? "<unknown value>");
      labels.errorPath = this.location(step.error);

      this.test_step_total_error.labels(labels).inc();
      this.test_step_error_count.labels(labels).inc();
    }

    this.test_step_total_duration.inc(step.duration);
    this.test_step_total_count.inc();
    this.test_step_duration.labels(labels).inc(step.duration);

    this.test_step.labels(labels);

    this.test_step_total_duration
      .labels({
        testId: test.id,
        testTitle: test.title,
      })
      .inc(step.duration);
    this.updateNodejsStats();
    await this.send(
      [this.test_step_duration, this.test_step_error_count, this.test_step].map(
        (m) => this.mapTimeseries(m),
      ),
    );
    this.test_step.reset();
  }

  async onTestEnd(test: TestCase, result: TestResult) {
    this.updateResults(result);

    result.attachments.forEach((attach) => {
      const size = attach.body?.length ?? 0;
      this.tests_total_attachment_size.inc(size);
      const labels = {
        testId: test.id,
        testTitle: test.title,
        unit: "bytes",
      };
      this.test_attachment_count
        .labels({
          size: String(size),
          path: attach.path ?? "",
          contentType: attach.contentType,
          attachmentName: attach.name,
          body: attach.body ? Buffer.from(attach.body).toString("utf-8") : "",
          ...labels,
        })
        .inc();
      this.test_attachment_size.labels(labels).inc(size);
      this.tests_total_attachment.inc();
    });

    test.annotations.forEach((annotation) => {
      this.test_annotation_count
        .labels({
          type: annotation.type,
          description: annotation.description ?? "",
          testId: test.id,
          testTitle: test.title,
        })
        .inc();
    });

    const labels = {
      title: test.title,
      id: test.id,
      suite: test.parent.title,
      location: this.location(test),
      expectedStatus: test.expectedStatus,
      actualStatus: result.status,
      duration: String(result.duration),
      parallelIndex: String(result.parallelIndex),
      attachmentsCount: String(result.attachments.length),
      stepsCount: String(result.steps.length),
      workerIndex: String(result.workerIndex),
      retryCount: String(result.retry),
    };

    const testSeries = this.test.labels(labels).inc();
    const testDuration = this.test_duration.labels(labels).set(result.duration);
    const testRetries = this.test_retry_count.labels(labels).inc(result.retry);

    await this.send([
      this.mapTimeseries(this.test_step),
      this.mapTimeseries(this.test_step_total_duration),
      this.mapTimeseries(this.test_attachment_size),
      this.mapTimeseries(this.test_annotation_count),
      this.mapTimeseries(testSeries),
      this.mapTimeseries(testDuration),
      this.mapTimeseries(testRetries),
      this.mapTimeseries(this.test_step_total_error),
      this.mapTimeseries(this.test_attachment_size),
      this.mapTimeseries(this.test_step_total_count),
    ]);

    this.test_step = this.test_step.reset();
    this.test_annotation_count.reset();
    this.test = this.test.reset();
    this.test_duration = this.test_duration.reset();
    this.test_retry_count = this.test_retry_count.reset();
    this.test_attachment_size.reset();
    this.updateNodejsStats();
  }

  onError(error: TestError): void {
    this.errors_count
      .labels({
        path: this.location(error),
        message: String(error.message ?? ""),
        snippet: String(error.snippet ?? ""),
        value: String(error.value ?? ""),
      })
      .inc();
    this.test_errors.inc();
    this.updateNodejsStats();
  }

  private mapTimeseries(
    seriesOrMetric: Timeseries | Gauge | Counter | Metric,
  ): Timeseries {
    let series: Timeseries = seriesOrMetric as Timeseries;
    if (seriesOrMetric instanceof Counter || seriesOrMetric instanceof Gauge) {
      series = seriesOrMetric._getSeries();
    }

    const { __name__, ...restLabels } = series.labels;
    const timeseries: Timeseries = {
      labels: {
        __name__: `${this.prefix}${__name__}`,
        ...restLabels,
      },
      samples: series.samples,
    };
    return timeseries;
  }

  async onStdOut(
    chunk: string | Buffer,
    test: void | TestCase,
    result: void | TestResult,
  ) {
    const labels = {
      text: Buffer.from(chunk).toString("utf-8"),
      size: String(chunk.length),
      unit: "bytes",
      encoding: "utf8",
      testId: test?.id ?? "",
      testTitle: test?.title ?? "",
    };
    try {
      const event = JSON.parse(String(chunk));
      if (Event.is(event)) {
        const timeseries = this.mapTimeseries(event.payload);
        await this.send(timeseries);
        this.pw_stdout
          .labels({
            // playwright-prometheus-remote-write-reporter
            internal: "true",
            ...labels,
          })
          .inc();
      }
    } catch (e) {
      // bypass
      this.pw_stdout
        .labels({
          // rest reporter
          internal: "false",
          ...labels,
        })
        .inc();
    }
    this.updateNodejsStats();
  }

  onStdErr(chunk: string | Buffer, test: void | TestCase): void {
    const labels = {
      text: Buffer.from(chunk).toString("utf-8"),
      size: String(chunk.length),
      unit: "bytes",
      encoding: "utf8",
      testId: test?.id ?? "",
      testTitle: test?.title ?? "",
    };
    try {
      const text = JSON.stringify(JSON.parse(labels.text));
      this.pw_stderr
        .labels({
          ...labels,
          json: "true",
          text: text,
        })
        .inc();
    } catch (e) {
      // bypass
      this.pw_stderr
        .labels({
          ...labels,
        })
        .inc();
    }
    this.updateNodejsStats();
  }

  onEnd(result: FullResult) {
    this.updateNodejsStats();
  }
  onStepBegin(test: TestCase, result: TestResult, step: TestStep): void {
    this.updateNodejsStats();
  }
  onTestBegin(test: TestCase, result: TestResult): void {
    this.updateNodejsStats();
  }

  async onExit(): Promise<void> {
    await this.send(this.timeseries);
    await this.send(
      [
        this.pw_config,
        this.pw_stdout,
        this.pw_stderr,
        this.failed_count,
        this.passed_count,
        this.skipped_tests_count,
        this.timed_out_tests_count,
        this.test_total_count,
        this.total_duration,
        this.tests_total_attachment,
        this.test_step_total_count,
        this.tests_total_attachment_size,
        this.test_step_total_duration,
        this.test_step_total_error,
        ...this.pw_projects,
      ].map((metric) => this.mapTimeseries(metric)),
    );

    this.updateNodejsStats();
    await this.sendNodejsStats();
  }
  private location(
    test: TestCase | TestStep | TestError,
  ): `${string}:${number}:${number}` {
    const relativePath = path.relative(
      process.cwd(),
      test.location?.file ?? "unknown",
    );
    return `${relativePath}:${test.location?.line}:${test.location?.column}` as `${string}:${number}:${number}`;
  }
  printsToStdio(): boolean {
    return false;
  }
}

export { Counter, Gauge } from "./helpers";
export * from "./fixture";
