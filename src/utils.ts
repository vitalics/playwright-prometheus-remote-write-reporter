import { Timeseries } from "prometheus-remote-write";

export class Event {
  static readonly name = "prometheus-remote-writer";
  constructor(
    readonly payload: Timeseries,
    readonly name = Event.name,
  ) {}

  /**
   * Returns `true` if incoming object is event.
   * False in other cases
   */
  static is(input: unknown): input is Event {
    if (
      typeof input === "object" &&
      input !== null &&
      "name" in input &&
      "payload" in input &&
      input.name === Event.name &&
      typeof input.payload === "object"
    ) {
      return true;
    }
    return false;
  }
}
