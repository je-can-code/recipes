/**
 * Runs the site for development: the Go server for the API on port 8686, and Vite on port 5173 for the
 * pages, reloading as files change and passing /api through to Go. Open the Vite one. Ctrl+C stops both.
 *
 * The server is built first and then run as itself rather than through go run. go run starts the real
 * server as a child of its own, so stopping go run would leave that child running and holding the port.
 */
const build = Bun.spawnSync([ 'go', 'build', '-o', '../bin/recipes-dev', './cmd/recipes' ], {
  cwd: 'server',
  stdout: 'inherit',
  stderr: 'inherit',
});
if (build.exitCode !== 0)
{
  process.exit(1);
}

const server = Bun.spawn([ './bin/recipes-dev', '-config', 'config.yaml' ], {
  stdout: 'inherit',
  stderr: 'inherit',
});
const website = Bun.spawn([ 'bunx', '--bun', 'vite', '--host' ], {
  stdout: 'inherit',
  stderr: 'inherit',
});

/**
 * Stops both processes, so neither is left holding its port.
 */
const stopBoth = (): void =>
{
  server.kill();
  website.kill();
};

// Ctrl+C in a terminal, or a plain kill from anywhere else, stops both before leaving.
[ 'SIGINT', 'SIGTERM' ].forEach((signal) =>
{
  process.on(signal, () =>
  {
    stopBoth();
    process.exit(0);
  });
});

// when either one stops on its own, the other has no reason to keep running.
void Promise.race([ server.exited, website.exited ]).then(stopBoth);
