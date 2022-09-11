const cp = require('child_process');
const { dirs } = require('./dirs');
const { setupBuildYarnrc } = require('./setupBuildYarnrc');
const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';

/**
 * @param {string} location
 * @param {*} [opts]
 */
 function yarnInstall(location, opts) {
  opts = opts || { env: process.env };
  opts.cwd = location;
  opts.stdio = 'inherit';

  const raw = process.env['npm_config_argv'] || '{}';
  const argv = JSON.parse(raw);
  const original = argv.original || [];
  const args = original.filter(arg => arg === '--ignore-optional' || arg === '--frozen-lockfile' || arg === '--check-files');
  if (opts.ignoreEngines) {
    args.push('--ignore-engines');
    delete opts.ignoreEngines;
  }

  console.log(`Installing dependencies in ${location}...`);
  console.log(`$ yarn ${args.join(' ')}`);
  const result = cp.spawnSync(yarn, args, opts);

  if (result.error || result.status !== 0) {
    process.exit(1);
  }
}

/**
 * @param {*} location 
 * @param {*} opts 
 */
function yarnCompile(location, opts) {
  opts = opts || { env: process.env };
  opts.cwd = location;
  opts.stdio = 'inherit';

  console.log(`Compiling dependencies in ${location}...`);
  console.log(`$ yarn compile`);
  const result = cp.spawnSync(yarn, ['compile'], opts);

  if (result.error || result.status !== 0) {
    process.exit(1);
  }
}

for (let dir of dirs) {

  if (dir === '') {
    // `yarn` already executed in root
    continue;
  }

  if (/^remote/.test(dir) && process.platform === 'win32' && (process.arch === 'arm64' || process.env['npm_config_arch'] === 'arm64')) {
    // windows arm: do not execute `yarn` on remote folder
    continue;
  }

  if (dir === 'build') {
    setupBuildYarnrc();
    yarnInstall('build');
    yarnCompile('build');
    continue;
  }

  yarnInstall(dir, opts);
}

// cp.execSync('git config pull.rebase merges');
// cp.execSync('git config blame.ignoreRevsFile .git-blame-ignore');
