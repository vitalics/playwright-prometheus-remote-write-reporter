import path from "node:path";
import { cpuUsage, memoryUsage, env, argv, versions } from "node:process";
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
import { Counter, Gauge } from "./helpers";

export type PrometheusOptions = {
  /**
   * URL of the Prometheus remote write implementation's endpoint.
   * @default 'http://localhost:9090/api/v1/write' */
  serverUrl?: string;
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
   * [{ instance: "hostname" }]
   */
  labels?: Record<string, string>[];
  /**
   * env variables to send.
   * @default `process.env`
   * @see {@link https://nodejs.org/docs/latest/api/process.html#processenv node.js - process.env}  
   */
  env?: Record<string, string | undefined>
};

const DEFAULT_PREFIX = `pw_`;
const DEFAULT_WRITER_URL = "http://localhost:9090/api/v1/write";

type CPUUsageObject = ReturnType<typeof cpuUsage>
type MemoryUsageObject = ReturnType<typeof memoryUsage>

export default class PrometheusReporter implements Reporter {
  private readonly options: Options = {};
  private readonly prefix: string;
  private readonly env: Record<string, string | undefined>
  private pw_projects: Counter[] = [];
  private readonly pw_step_total_count = new Counter({
    name: "step_total_count",
  });
  private readonly pw_step_total_duration = new Gauge(
    {
      name: "test_step_total_duration",
      unit: "ms",
    },
    0,
  );
  private readonly pw_test_annotations = new Counter(
    {
      name: "test_annotation",
    },
    0,
  );
  private readonly pw_step = new Counter(
    {
      name: "test_step",
    },
    1,
  );
  private readonly pw_stderr = new Counter({
    name: "stderr",
  });
  private readonly pw_stdout = new Counter({
    name: "stdout",
  });
  private readonly pw_config = new Counter(
    {
      name: "config",
    },
    1,
  );
  private test_attachment = new Counter(
    {
      name: "test_attachment",
    },
    0,
  );
  private test_attachment_size = new Gauge({
    name: "test_attachment_size",
    unit: "bytes",
  });
  private tests_total_attachment_size = new Gauge({
    name: "tests_attachment_total_size",
    unit: "bytes",
  });
  private errors_count = new Counter({
    name: "error_count",
  });
  private test_errors = new Counter({
    name: "test_error",
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
  private test_retry = new Counter({
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
    name: "tests_skip_count",
  });
  private readonly passed_count = new Counter({
    name: "tests_pass_count",
  });
  private readonly failed_count = new Counter({
    name: "tests_fail_count",
  });
  // Node.js internals. Usefull to see memory leaks
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
        argv.map((value, index) => [index, value] as const),
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

  private readonly node_env: Counter

  private readonly node_versions = new Counter(
    {
      name: "node_versions",
      ...versions,
    },
    1,
  );

  /** timeserties from user tests */
  private readonly timeseries: Timeseries[] = [];
  constructor(options: PrometheusOptions = {} as PrometheusOptions) {
    this.options.url = options?.serverUrl ?? DEFAULT_WRITER_URL;
    this.options.headers = options?.headers ?? {};
    this.options.fetch = fetch as never;
    this.prefix = options.prefix ?? DEFAULT_PREFIX;
    this.options.labels = options?.labels ?? [];
    this.env = options?.env ?? process.env;
    this.node_env = new Counter(
      {
        name: "node_env",
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
      this.node_cpu_user._getSeries(),
      this.node_cpu_system._getSeries(),
      this.node_memory_array_buffers._getSeries(),
      this.node_memory_external._getSeries(),
      this.node_memory_heap_total._getSeries(),
      this.node_memory_heap_used._getSeries(),
      this.node_memory_rss._getSeries(),
      this.node_os._getSeries(),
      this.node_env._getSeries(),
      this.node_argv._getSeries(),
      this.node_versions._getSeries(),
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
    this.test_total_count.inc();
    this.total_duration.inc(result.duration);
  }

  async onStepEnd(test: TestCase, result: TestResult, step: TestStep) {
    this.pw_step.labels({
      category: step.category,
      testId: test.id,
      testTitle: test.title,
      stepTitle: step.title,
    });
    this.pw_step_total_duration
      .labels({
        testId: test.id,
        testTitle: test.title,
      })
      .inc(step.duration);
    this.updateNodejsStats();
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
      this.test_attachment
        .labels({
          path: attach.path ?? "",
          size: String(size),
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
      this.pw_test_annotations
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

    this.pw_step_total_count.inc(result.steps.length);

    const testSeries = this.mapTimeseries(
      this.test.labels(labels).inc()._getSeries(),
    );
    const testDuration = this.mapTimeseries(
      this.test_duration.labels(labels).set(result.duration)._getSeries(),
    );
    const testRetries = this.mapTimeseries(
      this.test_retry.labels(labels).inc(result.retry)._getSeries(),
    );

    await this.send([
      this.mapTimeseries(this.pw_step._getSeries()),
      this.mapTimeseries(this.pw_step_total_duration._getSeries()),
      this.mapTimeseries(this.test_attachment_size._getSeries()),
      this.mapTimeseries(this.pw_test_annotations._getSeries()),
      testSeries,
      testDuration,
      testDuration,
      testRetries,
      this.mapTimeseries(this.test_attachment._getSeries()),
    ]);

    this.pw_step.reset();
    this.pw_test_annotations.reset();
    this.test = this.test.reset();
    this.test_duration = this.test_duration.reset();
    this.test_retry = this.test_retry.reset();
    this.pw_step_total_duration.reset();
    this.test_attachment_size.reset();
    this.updateNodejsStats();
  }

  onError(error: TestError): void {
    this.errors_count
      .labels({
        message: String(error.message ?? ""),
        snippet: String(error.snippet ?? ""),
        value: String(error.value ?? ""),
      })
      .inc();
    this.test_errors.inc();
    this.updateNodejsStats();
  }

  private mapTimeseries(series: Timeseries): Timeseries {
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

  onStdErr(
    chunk: string | Buffer,
    test: void | TestCase,
    result: void | TestResult,
  ): void {
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
    await this.send([
      this.mapTimeseries(this.pw_config._getSeries()),
      this.mapTimeseries(this.pw_stdout._getSeries()),
      this.mapTimeseries(this.pw_stderr._getSeries()),
      this.mapTimeseries(this.failed_count._getSeries()),
      this.mapTimeseries(this.passed_count._getSeries()),
      this.mapTimeseries(this.skipped_tests_count._getSeries()),
      this.mapTimeseries(this.test_total_count._getSeries()),
      this.mapTimeseries(this.total_duration._getSeries()),
      this.mapTimeseries(this.tests_total_attachment._getSeries()),
      this.mapTimeseries(this.pw_step_total_count._getSeries()),
      this.mapTimeseries(this.tests_total_attachment_size._getSeries()),
      ...this.timeseries,
      ...this.pw_projects.map((p) => this.mapTimeseries(p._getSeries())),
    ]);

    this.updateNodejsStats();
    await this.sendNodejsStats();
  }
  private location(test: TestCase) {
    const relativePath = path.relative(process.cwd(), test.location.file);
    return `${relativePath}:${test.location.line}:${test.location.column}`;
  }
  printsToStdio(): boolean {
    return false;
  }
}

export * from "./helpers";
