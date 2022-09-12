import * as es from 'event-stream';
import * as fs from 'fs';
import * as gulp from 'gulp';
import * as bom from 'gulp-bom';
import * as os from 'os';
import * as path from 'path';
import * as fancyLog from 'fancy-log';
import * as ansiColors from 'ansi-colors';

import * as orbitdts from './orbit-api';
import * as util from './util';

import { createReporter } from './reporter';
import ts = require('typescript');
const reporter = createReporter();

const REPO_SRC_FOLDER = path.join(__dirname, '../../src');

class OrbitGenerator {
  private readonly _isWatch: boolean;
  public readonly stream: NodeJS.ReadWriteStream;

  private readonly _watchedFiles: { [filePath: string]: boolean };
  private readonly _fsProvider: orbitdts.FSProvider;
  private readonly _declarationResolver: orbitdts.DeclarationResolver;

  constructor(isWatch: boolean) {
    this._isWatch = isWatch;
    this.stream = es.through();
    this._watchedFiles = {};

    const onWillReadFile = (moduleId: string, filePath: string) => {
      if (!this._isWatch) {
        return;
      }

      if (this._watchedFiles[filePath]) {
        return;
      }

      this._watchedFiles[filePath] = true;

      fs.watchFile(filePath, () => {
        this._declarationResolver.invalidateCache(moduleId);
        this._executeSoon();
      });
    };
    this._fsProvider = new class extends orbitdts.FSProvider {
      public readFileSync(moduleId: string, filePath: string): Buffer {
        onWillReadFile(moduleId, filePath);
        return super.readFileSync(moduleId, filePath);
      }
    };
    this._declarationResolver = new orbitdts.DeclarationResolver(this._fsProvider);

    if (this._isWatch) {
      fs.watchFile(orbitdts.RECIPE_PATH, () => {
        this._executeSoon();
      });
    }
  }

  private _executeSoonTimer: NodeJS.Timer | null = null;
  private _executeSoon(): void {
    if (this._executeSoonTimer != null) {
      clearTimeout(this._executeSoonTimer);
      this._executeSoonTimer = null;
    }

    this._executeSoonTimer = setTimeout(() => {
      this._executeSoonTimer = null;
      this.execute();
    }, 20);
  }

  private _run(): orbitdts.IOrbitDeclarationResult | null {
    const r = orbitdts.run3(this._declarationResolver);
    if (!r && !this._isWatch) {
      // The build must always be able to generate the orbit.d.ts
      throw new Error(`orbit.d.ts generation error - Cannot continue`);
    }
    return r;
  }

  private _log(message: any, ...rest: any[]): void {
    fancyLog(ansiColors.cyan('[orbit.d.ts]'), message, ...rest);
  }

  public execute(): void {
    const startTime = Date.now();
    const result = this._run();
    if (!result) {
      // nothing really changed
      return;
    }
    if (result.isTheSame) {
      return;
    }

    fs.writeFileSync(result.filePath, result.content);
    fs.writeFileSync(path.join(REPO_SRC_FOLDER, 'orbit/common/standalone/standaloneEnums.ts'), result.enums);
    this._log(`orbit.d.ts is changed - total time took ${Date.now() - startTime} ms`);
    if (!this._isWatch) {
      this.stream.emit('error', 'orbit.d.ts is no longer up to date. Please run gulp watch and commit the new file.');
    }
  }
}

function getTypeScriptCompilerOptions(src: string): ts.CompilerOptions {
  const rootDir = path.join(__dirname, `../../${src}`);
  const options: ts.CompilerOptions = {};
  options.verbose = false;
  options.sourceMap = true;
  if (process.env['ORBIT_NO_SOURCEMAP']) { // To be used by developers in a hurry
    options.sourceMap = false;
  }
  options.rootDir = rootDir;
  options.baseUrl = rootDir;
  options.sourceRoot = util.toFileUri(rootDir);
  options.newLine = /\r\n/.test(fs.readFileSync(__filename, 'utf8')) ? 0 : 1;
  return options;
}

function createCompile(src: string, build: boolean, emitError: boolean, transpileOnly: boolean) {
  const tsb = require('./tsb') as typeof import('./tsb');
  const sourcemaps = require('gulp-sourcemaps') as typeof import('gulp-sourcemaps');

  const projectPath = path.join(__dirname, '../../', src, 'tsconfig.json');
  const overrideOptions = { ...getTypeScriptCompilerOptions(src), inlineSources: Boolean(build) };
  if (!build) {
    overrideOptions.inlineSources = true;
  }

  const compilation = tsb.create(
    projectPath, overrideOptions, { verbose: false, transpileOnly }, err => reporter(err));

  function pipeline(token?: util.ICancellationToken) {

    const utf8Filter = util.filter(data => /(\/|\\)test(\/|\\).*utf8/.test(data.path));
    const tsFilter = util.filter(data => /\.ts$/.test(data.path));
    const noDeclarationsFilter = util.filter(data => !(/\.d\.ts$/.test(data.path)));

    const input = es.through();
    const output = input
      .pipe(utf8Filter)
      .pipe(bom())
      .pipe(utf8Filter.restore)
      .pipe(tsFilter)
      .pipe(util.loadSourcemaps())
      .pipe(compilation(token))
      .pipe(noDeclarationsFilter)
      // .pipe(build ? nls.nls() : es.through())
      .pipe(noDeclarationsFilter.restore)
      .pipe(transpileOnly ? es.through() : sourcemaps.write('.', {
        addComment: false,
        includeContent: !!build,
        sourceRoot: overrideOptions.sourceRoot,
      }))
      .pipe(tsFilter.restore)
      .pipe(reporter.end(!!emitError));

    return es.duplex(input, output);
  }

  pipeline.tsProjectSrc = () => {
    return compilation.src({ base: src });
  };
  return pipeline;
}

export function compileTask(src: string, out: string, build: boolean): () => NodeJS.ReadWriteStream {
  return function () {
    if (os.totalmem() < 4_000_000_000) {
      throw new Error('compilation acquires 4GB of RAM.');
    }

    const compile = createCompile(src, build, true, false);
    const srcPipe = gulp.src(`${src}/**`, { base: `${src}` });
    const generator = new OrbitGenerator(false);
    if (src === 'src') {
      generator.execute();
    }

    return srcPipe.pipe(generator.stream).pipe(compile()).pipe(gulp.dest(out));
  };
}
