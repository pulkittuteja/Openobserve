// @ts-check
const crypto = require('crypto');

/**
 * Generate short, unique names/ids so each test run is isolated.
 * Prefixes make it easy to recognise and clean up test artefacts in the UI.
 */
function uniqueId(prefix = 'qa') {
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${suffix}`;
}

module.exports = { uniqueId };
