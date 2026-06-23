const NUMERIC_IDENTIFIER = '(?:0|[1-9]\\d*)';
const NON_NUMERIC_IDENTIFIER = '(?:[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)';
const PRERELEASE_IDENTIFIER = `(?:${NUMERIC_IDENTIFIER}|${NON_NUMERIC_IDENTIFIER})`;
const BUILD_IDENTIFIER = '(?:[0-9A-Za-z-]+)';
const SEMVER_TAG_PATTERN = new RegExp(
  `^v?(${NUMERIC_IDENTIFIER})\\.(${NUMERIC_IDENTIFIER})\\.(${NUMERIC_IDENTIFIER})` +
  `(?:-(${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*))?` +
  `(?:\\+(${BUILD_IDENTIFIER}(?:\\.${BUILD_IDENTIFIER})*))?$`,
);

function parseSemverTag(tag) {
  const value = String(tag || '').trim();
  const match = value.match(SEMVER_TAG_PATTERN);
  if (!match) return null;

  return {
    original: value,
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function isNumericPrereleaseIdentifier(value) {
  return /^(0|[1-9]\d*)$/.test(value);
}

function comparePrereleaseIdentifier(left, right) {
  const leftNumeric = isNumericPrereleaseIdentifier(left);
  const rightNumeric = isNumericPrereleaseIdentifier(right);

  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareSemver(left, right) {
  for (let i = 0; i < 3; i += 1) {
    if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i];
  }

  const leftIsRelease = left.prerelease.length === 0;
  const rightIsRelease = right.prerelease.length === 0;
  if (leftIsRelease && rightIsRelease) return 0;
  if (leftIsRelease) return 1;
  if (rightIsRelease) return -1;

  const maxLength = Math.max(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < maxLength; i += 1) {
    if (left.prerelease[i] === undefined) return -1;
    if (right.prerelease[i] === undefined) return 1;
    const result = comparePrereleaseIdentifier(left.prerelease[i], right.prerelease[i]);
    if (result !== 0) return result;
  }
  return 0;
}

function selectLatestTag(tags) {
  let latest = null;
  for (const tag of tags) {
    const candidate = parseSemverTag(tag);
    if (!candidate) continue;
    if (!latest || compareSemver(candidate, latest) > 0) latest = candidate;
  }
  return latest ? latest.original : '';
}

function extractArtifactRegistryTags(images) {
  if (!Array.isArray(images)) return [];
  if (images.every(item => typeof item === 'string')) return images;

  const tags = [];
  for (const image of images) {
    if (!Array.isArray(image?.tags)) continue;
    for (const tag of image.tags) tags.push(tag);
  }
  return tags;
}

function parseInput(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return [];

  try {
    return extractArtifactRegistryTags(JSON.parse(trimmed));
  } catch {
    return trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    process.stdout.write(selectLatestTag(parseInput(input)));
  });
}

module.exports = {
  compareSemver,
  extractArtifactRegistryTags,
  parseInput,
  parseSemverTag,
  selectLatestTag,
};
