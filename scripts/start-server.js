const cp = require('child_process');
const path = require('path');
const opn = require('opn');
const minimist = require('minimist');

async function main() {

  const args = minimist(process.argv.slice(2), {
    boolean: [
      'help',
      'launch'
    ]
  });

  if (args.help) {
    console.log(
      './scripts/start-server.sh|bat [options]\n' +
      ' --launch              Opens a browser'
    );
    startServer(['--help']);
    return;
  }

  process.env['SERVER_PORT'] = '9017';

  const serverArgs = process.argv.slice(2).filter(v => v !== '--launch');
  const addr = await startServer(serverArgs);
  if (args['launch']) {
    opn(addr);
  }
}

function startServer(programArgs) {
  return new Promise((s, e) => {
    const env = { ...process.env };
    const entryPoint = path.join(__dirname, '..', 'out', 'server-main.js');

    console.log(`Starting server: ${entryPoint} ${programArgs.join(' ')}`);
    const proc = cp.spawn(process.execPath, [entryPoint, ...programArgs], { env, stdio: [process.stdin, null, process.stderr] });
    proc.stdout.on('data', e => {
      const data = e.toString();
      process.stdout.write(data);
      const m = data.match(/Web UI available at (.*)/);
      if (m) {
        s(m[1]);
      }
    });

    proc.on('exit', (code) => process.exit(code));

    process.on('exit', () => proc.kill());
    process.on('SIGINT', () => {
      proc.kill();
      process.exit(128 + 2); // https://nodejs.org/docs/v14.16.0/api/process.html#process_signal_events
    });
    process.on('SIGTERM', () => {
      proc.kill();
      process.exit(128 + 15); // https://nodejs.org/docs/v14.16.0/api/process.html#process_signal_events
    });
  });

}

main();