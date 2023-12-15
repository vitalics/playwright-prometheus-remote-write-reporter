import { Timeseries } from 'prometheus-remote-write';

export class Event {
  static readonly name = 'prometheus-remote-writer'
  constructor(readonly payload: Timeseries, readonly name = Event.name) { }
  static from(input: unknown): input is Event {
    if (typeof input === 'object' && input !== null && 'name' in input && 'payload' in input && input.name === Event.name && typeof input.payload === 'object') {
      return true
    }
    return false
  }
}
