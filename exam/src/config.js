const path = require('path');

function requireInProduction(name, fallback = '') {
  const value = process.env[name];
  if (process.env.NODE_ENV === 'production' && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value || fallback;
}

function loadConfig() {
  const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');
  const cookieSecure = String(process.env.EXAM_COOKIE_SECURE || 'false').toLowerCase() === 'true';

  return {
    env: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT || 3000),
    basePath,
    dbPath: process.env.EXAM_DB_PATH || path.join(process.cwd(), 'data', 'exam.sqlite'),
    adminUser: requireInProduction('EXAM_ADMIN_USER', 'ryfried'),
    adminPassword: requireInProduction('EXAM_ADMIN_PASSWORD', 'development-password'),
    sessionSecret: requireInProduction('EXAM_SESSION_SECRET', 'development-session-secret-change-me'),
    cookieSecure,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
    deepseekBaseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
    deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
  };
}

module.exports = { loadConfig };
