'use strict';

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

const gulp = require('gulp');
const util = require('./lib/util');
const task = require('./lib/task');
const { compileTask } = require('./lib/compilation');
const { createLoaderCompileTask } = require('./lib/loader');

// Fast compile for development time
const compileClientTask = task.define('compile-client', task.series(
  util.rimraf('out'),
  util.buildWebNodePaths('out'),
  createLoaderCompileTask(),
  compileTask('src', 'out', false)));
gulp.task(compileClientTask);

// All
const _compileTask = task.define('compile', task.parallel(compileClientTask));
gulp.task(_compileTask);

// Default
gulp.task('default', _compileTask);

require('glob').sync('gulpfile.*.js', { cwd: __dirname })
    .forEach(f => require(`./${f}`));
