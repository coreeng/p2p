const escapeCell = value => {
  const text = value === undefined || value === null || value === '' ? '-' : String(value);
  return text.replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
};

module.exports = {
  escapeCell,
};
