import { Emitter, Event } from 'orbit/base/common/event';

export interface ISplice<T> {
  readonly start: number;
  readonly deleteCount: number;
  readonly toInsert: T[];
}

export interface ISplicable<T> {
  splice(start: number, deleteCount: number, toInsert: T[]): void;
}

export interface ISequence<T> {
  readonly elements: T[];
  readonly onDidSplice: Event<ISplice<T>>;
}

export class Sequence<T> implements ISequence<T>, ISplicable<T> {

  readonly elements: T[] = [];

  private readonly _onDidSplice = new Emitter<ISplice<T>>();
  readonly onDidSplice: Event<ISplice<T>> = this._onDidSplice.event;

  splice(start: number, deleteCount: number, toInsert: T[] = []): void {
    this.elements.splice(start, deleteCount, ...toInsert);
    this._onDidSplice.fire({ start, deleteCount, toInsert });
  }
}