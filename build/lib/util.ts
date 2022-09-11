import * as es from 'event-stream';
import * as _filter from 'gulp-filter';
import * as path from 'path';
import * as fs from 'fs';
import * as sm from 'source-map';
import * as _rimraf from 'rimraf';
import * as VinylFile from 'vinyl';
import { ThroughStream } from 'through';

export interface ICancellationToken {
  isCancellationRequested(): boolean;
}

export function acquireWebNodePaths() {
  const root = path.join(__dirname, '..', '..');
  const webPackageJSON = path.join(root, '/remote/web', 'package.json');
  const webPackages = JSON.parse(fs.readFileSync(webPackageJSON, 'utf8')).dependencies;
  const nodePaths: { [key: string]: string } = {};

  for (const key of Object.keys(webPackages)) {
    const packageJSON = path.join(root, 'node_modules', key, 'package.json');
    const packageData = JSON.parse(fs.readFileSync(packageJSON, 'utf8'));
    let entryPoint: string = packageData.browser ?? packageData.main;

    // On rare cases a package doesn't have an entrypoint so we assume it has a dist folder with a min.js
    if (!entryPoint) {
      if (key !== 'jschardet') {
        console.warn(`No entry point for ${key} assuming dist/${key}.min.js`);
      }

      entryPoint = `dist/${key}.min.js`;
    }
    
    // Remove any starting path information so it's all relative info
    if (entryPoint.startsWith('./')) {
      entryPoint = entryPoint.substring(2);
    } else if (entryPoint.startsWith('/')) {
      entryPoint = entryPoint.substring(1);
    }

    // Search for a minified entrypoint as well
    if (/(?<!\.min)\.js$/i.test(entryPoint)) {
      const minEntryPoint = entryPoint.replace(/\.js$/i, '.min.js');
      if (fs.existsSync(path.join(root, 'node_modules', key, minEntryPoint))) {
        entryPoint = minEntryPoint;
      }
    }

    nodePaths[key] = entryPoint;
  }

  return nodePaths;
}

declare class FileSourceMap extends VinylFile {
  public sourceMap: sm.RawSourceMap;
}

export function loadSourcemaps(): NodeJS.ReadWriteStream {
  const input = es.through();
  const output = input
    .pipe(es.map<FileSourceMap, FileSourceMap | undefined>((f, cb): FileSourceMap | undefined => {
      if (f.sourceMap) {
        cb(undefined, f);
        return;
      }

      if (!f.contents) {
        cb(undefined, f);
        return;
      }

      const contents = (<Buffer>f.contents).toString('utf-8');
      const reg = /\/\# sourceMappingURL=(.*)$/g;
      let lastMatch: RegExpMatchArray | null = null;
      let match: RegExpMatchArray | null = null;

      while (match = reg.exec(contents)) {
        lastMatch = match;
      }

      if (!lastMatch) {
        f.sourceMap = {
          version: '3',
          names: [],
          mappings: '',
          sources: [f.relative],
          sourcesContent: [contents],
        };
        cb(undefined, f);
        return;
      }

      f.contents = Buffer.from(contents.replace(/\/\# sourceMappingURL=(.*)$/g, ''), 'utf-8');
      fs.readFile(path.join(path.dirname(f.path), lastMatch[1]), 'utf-8', (err, contents) => {
        if (err) {
          return cb(err);
        }

        f.sourceMap = JSON.parse(contents);
        cb(undefined, f);
      });
    }));
  
  return es.duplex(input, output);
}

export function setExecutableBit(pattern?: string | string[]): NodeJS.ReadWriteStream {
  const setBit = es.mapSync<VinylFile, VinylFile>(f => {
    if (!f.stat) {
      f.stat = { isFile() { return true; } } as any;
    }
    f.stat.mode = /* 100755 */ 33261;
    return f;
  });

  if (!pattern) {
    return setBit;
  }

  const input = es.through();
  const filter = _filter(pattern, { restore: true });
  const output = input.pipe(filter).pipe(setBit).pipe(filter.restore);
  return es.duplex(input, output);
}

export interface FilterStream extends NodeJS.ReadWriteStream {
  restore: ThroughStream;
}

export function filter(fn: (data: any) => boolean): FilterStream {
  const result = <FilterStream><any>es.through(function (data) {
    if (fn(data)) {
      this.emit('data', data);
    } else {
      result.restore.push(data);
    }
  });

  result.restore = es.through();
  return result;
}

export function rimraf(dir: string): () => Promise<void> {
  const result = () => new Promise<void>((c, e) => {
    let retries = 0;

    const retry = () => {
      _rimraf(dir, { maxBusyTries: 1 }, (err: any) => {
        if (!err) {
          return c();
        }

        if (err.code === 'ENOTEMPTY' && ++retries < 5) {
          return setTimeout(() => retry(), 10);
        }

        return e(err);
      });
    };

    retry();
  });

  result.taskName = `clean-${path.basename(dir).toLowerCase()}`;
  return result;
}

export function toFileUri(filePath: string): string {
  const match = filePath.match(/^([a-z])\:(.*)$/i);
  if (match) {
    filePath = `/${match[1].toUpperCase()}:${match[2]}`;
  }
  return `file://${filePath.replace(/\\/g, '/')}`;
}

export function buildWebNodePaths(outDir: string) {
  const result = () => new Promise<void>((resolve, _) => {
    const root = path.join(__dirname, '..', '..');
    const nodePaths = acquireWebNodePaths();
    // Write the node paths
    const outDirectory = path.join(root, outDir, 'orbit');
    fs.mkdirSync(outDirectory, { recursive: true });
    const headerWithGeneratedFileWarning = `/*-----------------------------------------------
 *  Copyright (c) Sprmon. All rights reserved.
 *  Licensed under the MIT License.
 *---------------------------------------------*/

// This file is generated by build/npm/postinstall.js. Do not edit.`;
    const fileContents = `${headerWithGeneratedFileWarning}\nself.webPackagePaths = ${JSON.stringify(nodePaths, null, 2)};`;
    fs.writeFileSync(path.join(outDirectory, 'webPackagePaths.js'), fileContents, 'utf8');
    resolve();
  });
  result.taskName = 'build-web-node-paths';
  return result;
}
