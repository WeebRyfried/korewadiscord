const crypto = require('crypto');
const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const cookieSession = require('cookie-session');
const helmet = require('helmet');
const morgan = require('morgan');
const { createPublicRouter } = require('./routes/public');
const { createAdminRouter } = require('./routes/admin');

function createApp({ db, config }) {
  const app = express();

  app.set('trust proxy', true);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('layout', 'layout');

  app.use(expressLayouts);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(morgan(config.env === 'test' ? 'tiny' : 'combined'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieSession({
    name: 'korewa_exam',
    keys: [config.sessionSecret],
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: config.basePath || '/',
    maxAge: 24 * 60 * 60 * 1000
  }));

  app.locals.db = db;
  app.locals.config = config;

  app.use('/assets', express.static(path.join(__dirname, '..', 'public'), {
    maxAge: config.env === 'production' ? '1h' : 0
  }));

  app.use((req, res, next) => {
    const basePath = config.basePath;
    const toUrl = (target = '/') => {
      const normalizedTarget = target.startsWith('/') ? target : `/${target}`;
      return `${basePath}${normalizedTarget}`;
    };

    req.toUrl = toUrl;
    res.locals.basePath = basePath;
    res.locals.url = toUrl;
    res.locals.admin = Boolean(req.session?.isAdmin);
    res.locals.discordId = req.session?.discordId || '';
    res.locals.safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;

    next();
  });

  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const token = req.body?._csrf || req.get('x-csrf-token');
    if (token && token === req.session.csrfToken) {
      return next();
    }

    if (req.accepts('json')) {
      return res.status(403).json({ error: 'Invalid security token.' });
    }

    return res.status(403).render('error', {
      title: 'Security check failed',
      message: 'The form expired or could not be verified. Please refresh and try again.'
    });
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/', createPublicRouter(db));
  app.use('/admin', createAdminRouter(db, config));

  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Page not found',
      message: 'That exam page does not exist.'
    });
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    const status = err.status || 500;
    const message = status >= 500 ? 'Something went wrong while handling the request.' : err.message;

    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(status).json({ error: message });
    }

    return res.status(status).render('error', {
      title: status >= 500 ? 'Server error' : 'Request failed',
      message
    });
  });

  return app;
}

module.exports = { createApp };
