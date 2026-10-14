/**
 * Runs the site for development: the Go server for the API on port 8686, and Vite on port 5173 for the
 * pages, reloading as files change and passing /api through to Go. Open the Vite one. Ctrl+C stops both.
 */
const server = Bun.spawn([ 'go', 'run', './cmd/recipes', '-config', '../config.yaml' ], {
  cwd: 'server',
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

process.on('SIGINT', () =>
{
  stopBoth();
  process.exit(0);
});

// when either one stops on its own, the other has no reason to keep running.
void Promise.race([ server.exited, website.exited ]).then(stopBoth);
