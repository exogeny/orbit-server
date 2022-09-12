import * as es from 'event-stream';
import * as gulp from 'gulp';
import * as path from 'path';
import * as util from './util';
import { createReporter } from './reporter';
const reporter = createReporter();

// compile AMD Loader.
export function createLoaderCompileTask() {

  return function () {
    const tsb = require('./tsb') as typeof import('./tsb');
    const projectPath = path.join(__dirname, '../../src', 'tsconfig.loader.json');
    const compilation = tsb.create(projectPath, {}, { verbose: false }, err => reporter(err));

    function compile(token?: util.ICancellationToken) {
      const utf8Filter = util.filter(data => /(\/|\\)test(\/|\\).*utf8/.test(data.path));
      const tsFilter = util.filter(data => /\.ts$/.test(data.path));
      const noDeclarationsFilter = util.filter(data => !(/\.d\.ts$/.test(data.path)));

      const input = es.through();
      const output = input
      .pipe(utf8Filter)
      .pipe(utf8Filter.restore)
      .pipe(tsFilter)
      .pipe(compilation(token))
      .pipe(noDeclarationsFilter)
      .pipe(noDeclarationsFilter.restore)
      .pipe(tsFilter.restore)
      .pipe(reporter.end(false));

      return es.duplex(input, output);
    }

    compile.tsProjectSrc = () => {
      return compilation.src({ base: 'src' });
    };

    const srcPipe = gulp.src(`src/loader/**`, { base: `src` });
    return srcPipe.pipe(compile()).pipe(gulp.dest('out'));
  };
}
