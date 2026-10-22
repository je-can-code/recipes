/**
 * Builds the program into bin/recipes with its version written in, named the way `bun run release` names
 * one: by what git calls this commit. A release's own commit is its tag, like v1.1.0, so the always-on copy
 * says which release it's running. Between releases it's the last tag, the commits since and a short hash,
 * like v1.1.0-2-g1a2b3c4, ending in -dirty when files have changed since that commit. Without git, or
 * outside a clone of the repository, it's dev, as a program built by hand is.
 */

/**
 * What git calls this commit, asked the same way server/cmd/release asks, or dev when git can't say.
 */
const describe = (): string =>
{
  // a computer without git can't say, and Bun throws rather than start a program it can't find.
  if (Bun.which('git') === null)
  {
    return 'dev';
  }

  // a folder that isn't a clone, like the source downloaded as a zip, makes git fail instead of answering.
  const described = Bun.spawnSync([ 'git', 'describe', '--tags', '--always', '--dirty' ]);
  if (described.exitCode !== 0)
  {
    return 'dev';
  }
  return described.stdout.toString().trim();
};

const version = describe();

// -X writes the version over the program's own "dev", the same flag the release build uses.
const linkerFlags = `-X main.version=${version}`;
const goBuild = Bun.spawnSync([ 'go', 'build', '-ldflags', linkerFlags, '-o', '../bin/recipes', './cmd/recipes' ], {
  cwd: 'server',
  stdout: 'inherit',
  stderr: 'inherit',
});
if (goBuild.exitCode !== 0)
{
  process.exit(1);
}
console.log(`Built bin/recipes as ${version}.`);
