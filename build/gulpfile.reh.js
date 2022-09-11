'use strict';

const gulp = require('gulp');
const path = require('path');
const es = require('event-stream');
const util = require('./lib/util');
const task = require('./lib/task');
const common = require('./lib/optimize');
// const product = require('../production.json');
const rename = require('gulp-rename');
// const replace = require('gulp-replace');
const filter = require('gulp-filter');
const flatmap = require('gulp-flatmap');
const gunzip = require('gulp-gunzip');
const fs = require('fs');
const vfs = require('vinyl-fs');
// const cp = require('child-process');

const REPO_ROOT = path.dirname(__dirname);

// Targets

const BUILD_TARGETS = [
  { platform: 'win32', arch: 'ia32' },
  { platform: 'win32', arch: 'x64' },
  { platform: 'darwin', arch: 'x64' },
  { platform: 'darwin', arch: 'arm64' },
  { platform: 'linux', arch: 'ia32' },
  { platform: 'linux', arch: 'x64' },
  { platform: 'linux', arch: 'armhf' },
  { platform: 'linux', arch: 'arm64' },
  { platform: 'alpine', arch: 'arm64' },
  { platform: 'linux', arch: 'alpine' },
];

function getNodeVersion() {
  const yarnrc = fs.readFileSync(path.join(REPO_ROOT, '.yarnrc'), 'utf-8');
  const target = /^target "(.*)"$/m.exec(yarnrc)[1];
  return target;
}

const nodeVersion = getNodeVersion();

function nodejs(platform, arch) {
  const remote = require('gulp-remote-retry-src');
  const untar = require('gulp-untar');

  if (arch === 'ia32') {
    arch = 'x86';
  }

  if (platform === 'win32') {
    return remote(`/dist/v${nodeVersion}/win-${arch}/node.exe`, { base: 'https://nodejs.org' })
      .pipe(rename('node.exe'));
  }

  if (arch === 'alpine' || platform === 'alpine') {
    const imageName = arch === 'arm64' ? 'arm64v8/node' : 'node';
    const contents = cp.execSync(
      `docker run --rm ${imageName} ${nodeVersion}-alpine /bin/sh -c 'cat \`which node\`'`,
      { maxBuffer: 100 * 1024 * 1024, encoding: 'buffer' });
    return es.readArray([new File({ path: 'node', contents, stat: { mode: parseInt('755', 8) } })]);
  }

  if (arch === 'armhf') {
    arch = 'armv7l';
  }

  return remote(
      `/dist/v${nodeVersion}/node-v${nodeVersion}-${platform}-${arch}.tar.gz`,
      { base: 'https://nodejs.org' })
    .pipe(flatmap(stream => stream.pipe(gunzip()).pipe(untar())))
    .pipe(filter('**/node'))
    .pipe(util.setExecutableBit('**'))
    .pipe(rename('node'));
}

BUILD_TARGETS.forEach(({ platform, arch }) => {
  gulp.task(task.define(`node-${platform}-${arch}`, () => {
    const nodePath = path.join('.build', 'node', `v${nodeVersion}`, `${platform}-${arch}`);

    if (!fs.existsSync(nodePath)) {
      util.rimraf(nodePath);

      return nodejs(platform, arch).pipe(vfs.dest(nodePath));
    }

    return Promise.resolve(null);
  }));
});

const defaultnodeTask = gulp.task(`node-${process.platform}-${process.arch}`);

if (defaultnodeTask) {
  gulp.task(task.define('node', defaultnodeTask));
}
