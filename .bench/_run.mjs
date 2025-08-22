import { execSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';

let ohaVersion;
try {
  ohaVersion = execSync('oha --version', { encoding: 'utf8' }).split(' ')[1];
} catch {
  console.error('Please install `oha` first: https://github.com/hatoo/oha');
}

console.log(`
Node.js:\t ${process.version}
OS:\t\t ${process.platform} ${process.arch}
OHA:\t\t ${ohaVersion}
`);

const results = [];

for (const name of ['node', 'vercube'].filter(Boolean)) {
  // Wait for the closest server to start
  await new Promise((resolve) => setTimeout(resolve, 5000));
  process.stdout.write(`${name}...`);
  const entry = new URL(`${name}.mjs`, import.meta.url);
  const worker = new Worker(entry, { type: 'module' });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const stdout = execSync(`oha http://${name === 'node' ? 'localhost' : '[::1]'}:3000/ --no-tui -j -z 3sec`, {
    encoding: 'utf8',
  });
  worker.terminate();
  const result = JSON.parse(stdout);
  const statusCodes = Object.keys(result.statusCodeDistribution);
  if (statusCodes.length > 1 || statusCodes[0] !== '200') {
    throw new Error(`Unexpected status codes: ${statusCodes}`);
  }
  const rps = Math.round(result.rps.mean);
  results.push([name, `${rps} req/sec`]);
  console.log(` ${rps} req/sec`);
}

results.sort((a, b) => b[1].split(' ')[0] - a[1].split(' ')[0]);

console.table(Object.fromEntries(results));
