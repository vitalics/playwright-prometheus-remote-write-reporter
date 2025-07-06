import { Timeseries } from "prometheus-remote-write";
import { Event } from "./utils";

export abstract class Metric<
  const MetricName extends string = string,
  const Labels extends Record<string, string> = Record<string, string>,
> {
  /** **NOTE:** Must be initialized in constructor */
  protected series!: Timeseries;
  constructor(metadata: Record<"name", MetricName> & Labels) {
    if (!metadata.name) {
      throw new Error(`"name" property for metadata is required`);
    }
  }
  /** Internal method */
  _getSeries(): Timeseries {
    return this.series;
  }
  /** Append extra labels */
  labels(labels: Record<string, string>): this {
    this.series.labels = {
      ...this.series.labels,
      ...labels,
    };
    return this;
  }

  /** Send metrics to prometheus */
  collect() {
    const event = new Event(this.series);
    process.stdout.write(JSON.stringify(event));
    return this;
  }
  /** revert metric to initial state */
  abstract reset(): this;

  [Symbol.dispose]() {
    this.collect();
    this.reset();
  }
}

/**
 * Counters go up, and reset when the process restarts.
 *
 * Initial value is 0
 */
export class Counter<
  const MetricName extends string = string,
  const Labels extends Record<string, string> = Record<string, string>,
> extends Metric<MetricName, Labels> {
  protected counter: number = 0;
  constructor(
    protected readonly metadata: Record<"name", MetricName> & Labels,
    protected initialValue = 0,
  ) {
    super(metadata);

    this.counter = initialValue;
    const { name, ...restMetadata } = this.metadata;
    this.series = {
      labels: {
        __name__: name,
        ...restMetadata,
      },
      samples: [
        {
          value: this.counter,
          timestamp: Date.now(),
        },
      ],
    };
  }
  /** Increase counter by selected value */
  inc(value = 1) {
    this.counter += value;
    this.series.samples.push({
      value: this.counter,
      timestamp: Date.now(),
    });
    return this;
  }

  reset(): this {
    return new Counter(this.metadata, this.initialValue) as never;
  }
}

/* Gauges are similar to Counters but a Gauge's value can be decreased. */
export class Gauge<
  const MetricName extends string = string,
  const Labels extends Record<string, string> = Record<string, string>,
> extends Counter<MetricName, Labels> {
  /** Decrement gauge value */
  dec(value = 1) {
    this.counter -= value;
    this.series.samples.push({
      value: this.counter,
      timestamp: Date.now(),
    });
    return this;
  }

  /** set gauge value */
  set(value = 1) {
    this.counter = value;
    this.series.samples.push({
      value: this.counter,
      timestamp: Date.now(),
    });
    return this;
  }

  /** set gauge to zero  */
  zero() {
    return this.set(0);
  }

  reset(): this {
    return new Gauge(this.metadata, this.initialValue) as never;
  }
}
