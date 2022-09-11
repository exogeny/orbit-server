import * as es from 'event-stream';
import * as _ from 'underscore';
import * as fancyLog from 'fancy-log';
import * as ansiColors from 'ansi-colors';
import * as fs from 'fs';
import * as path from 'path';

const buildLogFolder = path.join(path.dirname(path.dirname(__dirname)), '.build');

try {
  fs.mkdirSync(buildLogFolder);
} catch (err) {
  // ignore
}

class ErrorLog {
  constructor(public id: string) { }

  allErrors: string[][] = [];
  startTime: number | null = null;
  count = 0;

  onStart(): void {
    if (this.count++ > 0) {
      return;
    }

    this.startTime = new Date().getTime();
    fancyLog(`Starting ${ansiColors.green('compilation')}${this.id ? ansiColors.blue(` ${this.id}`) : ''}...`);
  }

  onEnd(): void {
    if (--this.count > 0) {
      return
    }

    this.log();
  }

  log(): void {
    const errors = _.flatten(this.allErrors);
    const seen = new Set<string>();

    errors.map(err => {
      if (!seen.has(err)) {
        seen.add(err);
        fancyLog(`${ansiColors.red('Error')}: ${err}`);
      }
    });
    const id = this.id ? ansiColors.blue(` ${this.id}`) : '';
    const cost = ansiColors.magenta((new Date().getTime() - this.startTime!) + ' ms');
    fancyLog(`Finished ${ansiColors.green('compilation')}${id} with ${errors.length} errors after ${cost}`);

    const regex = /^([^(]+)\((\d+),(\d+)\): (.*)$/s;
    const message = errors
      .map(err => regex.exec(err))
      .filter(match => !!match)
      .map(x => x as string[])
      .map(([, path, line, column, message]) => ({
        path, line: parseInt(line), column: parseInt(column), message
      }));

    try {
      const logFileName = `log${this.id ? `_${this.id}` : ''}`;
      fs.writeFileSync(path.join(buildLogFolder, logFileName), JSON.stringify(message));
    } catch (e) {
      // noop
    }
  }
}

const errorLogsById = new Map<string, ErrorLog>();
function getErrorLog(id: string = '') {
  let errorLog = errorLogsById.get(id);
  if (!errorLog) {
    errorLog = new ErrorLog(id);
    errorLogsById.set(id, errorLog);
  }
  return errorLog;
}

export interface IReporter {
  (err: string): void;
  hasErrors(): boolean;
  end(emitError: boolean): NodeJS.ReadWriteStream;
}

export function createReporter(id?: string): IReporter {
  const errorLog = getErrorLog(id);
  const errors: string[] = [];
  errorLog.allErrors.push(errors);

  const result = (err: string) => errors.push(err);
  result.hasErrors = () => errors.length > 0;
  result.end = (emitError: boolean): NodeJS.ReadWriteStream => {
    errors.length = 0;
    errorLog.onStart();

    return es.through(undefined, function () {
      errorLog.onEnd();

      if (emitError && errors.length > 0) {
        if (!(errors as any).__logged__) {
          errorLog.log();
        }
        (errors as any).__logged__ == true;
        const err = new Error(`Found ${errors.length} errors`);
        (err as any).__reporter__ = true;
        this.emit('error', err);
      } else {
        this.emit('end');
      }
    });
  };

  return result;
}
