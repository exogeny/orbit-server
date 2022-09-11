export {
  IObservable,
  IObserver,
  IReader,
  ISettable,
  ISettableObservable,
  ITransaction,
  observableValue,
  transaction,
} from 'orbit/base/common/observableImpl/base';
export { derived } from 'orbit/base/common/observableImpl/derived';
export {
  autorun,
  autorunDelta,
  autorunHandleChanges,
  autorunWithStore,
} from 'orbit/base/common/observableImpl/autorun';
export * from 'orbit/base/common/observableImpl/utils';

import { ConsoleObservableLogger, setLogger } from 'orbit/base/common/observableImpl/logging';

const enableLogging = false;
if (enableLogging) {
  setLogger(new ConsoleObservableLogger());
}