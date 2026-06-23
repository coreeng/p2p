const assert = require('assert');
const { parseInput, selectLatestTag } = require('../latest-image');

assert.strictEqual(
  selectLatestTag(['0.0.204', '0.0.204-abc123', 'v0.0.5']),
  '0.0.204',
  'normalizes optional leading v before comparing versions',
);

assert.strictEqual(
  selectLatestTag(['0.0.204-ff00aa', '0.0.204']),
  '0.0.204',
  'release versions rank above prereleases with the same core',
);

assert.strictEqual(
  selectLatestTag(['v1.2.3', '1.2.2']),
  'v1.2.3',
  'returns the original selected tag after normalization',
);

assert.strictEqual(
  selectLatestTag(['1.2.3-alpha.1', '1.2.3-alpha.2', '1.2.3-alpha.beta']),
  '1.2.3-alpha.beta',
  'preserves SemVer prerelease identifier ordering',
);

assert.strictEqual(
  selectLatestTag(['1.2.3+build.9', '1.2.3+build.1']),
  '1.2.3+build.9',
  'keeps the first original tag when normalized SemVer values tie',
);

assert.strictEqual(
  selectLatestTag(['not-a-version', '0.9.0']),
  '0.9.0',
  'ignores non-SemVer tags',
);

const artifactRegistryJson = JSON.stringify([
  { tags: ['v0.0.5', '0.0.204-abc123'] },
  { tags: ['0.0.204'] },
]);
assert.strictEqual(
  selectLatestTag(parseInput(artifactRegistryJson)),
  '0.0.204',
  'extracts tags from Artifact Registry image JSON',
);

console.log('latest image resolver fixtures passed');
