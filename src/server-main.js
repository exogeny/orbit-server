const perf = require('./orbit/base/common/performance');

perf.mark('orbit/server/start');
global.orbitServerStartTime = performance.now();

async function start() {
  console.log('test');
}

start();
