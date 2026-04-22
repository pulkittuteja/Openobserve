// @ts-check
/**
 * Centralised env/config for the Playwright suite. Using one module means
 * credentials and URLs are never hard-coded inside a test or a POM.
 */
const config = {
  baseURL: process.env.OO_BASE_URL || 'http://localhost:5080',
  org: process.env.OO_ORG || 'default',
  user: process.env.OO_USER || 'root@example.com',
  password: process.env.OO_PASSWORD || 'Complexpass#123',
};

config.basicAuthHeader = 'Basic ' + Buffer.from(`${config.user}:${config.password}`).toString('base64');

module.exports = { config };
