const escapeCell = value => {
  const text = value === undefined || value === null || value === '' ? '-' : String(value);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]/g, ' ');
};

const escapeHtml = value => escapeCell(value);

const escapeLinkText = value => escapeCell(value).replace(/\[/g, '\\[').replace(/\]/g, '\\]');

const markdownLink = (text, url) => {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    return escapeLinkText(text);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return escapeLinkText(text);
  const href = parsed.href.replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `[${escapeLinkText(text)}](${href})`;
};

const code = value => `<code>${escapeHtml(value)}</code>`;

module.exports = {
  code,
  escapeCell,
  escapeHtml,
  escapeLinkText,
  markdownLink,
};
