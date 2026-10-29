/**
 * Build the environment for a child process.
 *
 * Windows environment variable names are case-insensitive, but spreading
 * `process.env` into a plain object is not: setting `npm_config_cache` next to
 * an inherited `NPM_CONFIG_CACHE` puts two names for one setting in the child's
 * environment block, and which one the child (and npm, which reads every
 * `npm_config_*` name case-insensitively) sees is undefined. Each override
 * therefore replaces every existing name that matches it case-insensitively,
 * so the child has exactly one name per setting.
 */
export function withEnv(
  baseEnv: NodeJS.ProcessEnv,
  overrides: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const defined = Object.entries(overrides).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  const overridden = new Set(defined.map(([name]) => name.toLowerCase()));
  const env: NodeJS.ProcessEnv = {};

  for (const [name, value] of Object.entries(baseEnv)) {
    if (value === undefined) continue;
    if (overridden.has(name.toLowerCase())) continue;
    env[name] = value;
  }
  for (const [name, value] of defined) {
    env[name] = value;
  }

  return env;
}
