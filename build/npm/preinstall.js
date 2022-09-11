let err = false;

const nodeVersion = /^(\d+)\.(\d+)\.(\d+)/.exec(process.versions.node);
const majorNodeVersion = parseInt(nodeVersion[1]);
const minorNodeVersion = parseInt(nodeVersion[2]);
const patchNodeVersion = parseInt(nodeVersion[3]);

if (majorNodeVersion < 16 || (majorNodeVersion === 16 && minorNodeVersion < 14)) {
  console.error('\033[1;31m*** Please use node.js versions >=16.14.x and <17.\033[0;0m');
  err = true;
}
if (majorNodeVersion >= 17) {
  console.warn('\033[1;31m*** Warning: Versions of node.js >= 17 have not been tested.\033[0;0m')
}

const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const yarnVersion = cp.execSync('yarn -v', { encoding: 'utf8' }).trim();
const parsedYarnVersion = /^(\d+)\.(\d+)\./.exec(yarnVersion);
const majorYarnVersion = parseInt(parsedYarnVersion[1]);
const minorYarnVersion = parseInt(parsedYarnVersion[2]);

if (majorYarnVersion < 1 || minorYarnVersion < 10) {
  console.error('\033[1;31m*** Please use yarn >=1.10.1.\033[0;0m');
  err = true;
}

if (!/yarn[\w-.]*\.c?js$|yarnpkg$/.test(process.env['npm_execpath'])) {
  console.error('\033[1;31m*** Please use yarn to install dependencies.\033[0;0m');
  err = true;
}

if (err) {
  console.error('');
  process.exit(1);
}
