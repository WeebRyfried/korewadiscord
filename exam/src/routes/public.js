const express = require('express');
const {
  getOrCreateExamUser,
  getPublicTestsForUser,
  getTest,
  getTestWithAttemptQuestions,
  createOrResumeAttempt,
  getAttemptForUser,
  getAttemptAnswers,
  saveAnswer,
  submitAttempt
} = require('../database');
const { gradeSubmittedAttempt } = require('../scoring');

function requireDiscord(req, res, next) {
  if (!req.session.discordId) {
    return res.redirect(req.toUrl('/'));
  }

  return next();
}

function createPublicRouter(db, config = {}) {
  const router = express.Router();

  router.get('/', (req, res) => {
    if (req.session.discordId) {
      return res.redirect(req.toUrl('/tests'));
    }

    return res.render('public/home', {
      title: 'Enter Discord ID'
    });
  });

  router.post('/identify', (req, res, next) => {
    try {
      const discordId = String(req.body.discord_id || '').trim();
      if (!discordId) {
        const err = new Error('Enter your Discord ID or username to continue.');
        err.status = 400;
        throw err;
      }

      const user = getOrCreateExamUser(db, discordId);
      req.session.discordId = user.discord_id;
      return res.redirect(req.toUrl('/tests'));
    } catch (err) {
      return next(err);
    }
  });

  router.post('/logout', (req, res) => {
    req.session.discordId = null;
    return res.redirect(req.toUrl('/'));
  });

  router.get('/tests', requireDiscord, (req, res) => {
    const tests = getPublicTestsForUser(db, req.session.discordId);
    return res.render('public/tests', {
      title: 'Available tests',
      tests
    });
  });

  router.get('/tests/:testId/intro', requireDiscord, (req, res, next) => {
    const test = getTest(db, Number(req.params.testId));
    if (!test) {
      return next();
    }

    const current = getPublicTestsForUser(db, req.session.discordId).find((row) => row.id === test.id);
    return res.render('public/intro', {
      title: test.title,
      test,
      current
    });
  });

  router.post('/tests/:testId/start', requireDiscord, (req, res, next) => {
    try {
      const attempt = createOrResumeAttempt(db, Number(req.params.testId), req.session.discordId);
      return res.redirect(req.toUrl(`/attempts/${attempt.id}`));
    } catch (err) {
      err.status = 400;
      return next(err);
    }
  });

  router.get('/attempts/:attemptId', requireDiscord, (req, res, next) => {
    const attempt = getAttemptForUser(db, Number(req.params.attemptId), req.session.discordId);
    if (!attempt) {
      return next();
    }

    if (attempt.status !== 'IN_PROGRESS') {
      return res.redirect(req.toUrl(`/attempts/${attempt.id}/complete`));
    }

    const test = getTestWithAttemptQuestions(db, attempt.id);
    const answers = getAttemptAnswers(db, attempt.id);

    return res.render('public/attempt', {
      title: attempt.test_title,
      attempt,
      test,
      answers
    });
  });

  router.post('/attempts/:attemptId/answers', requireDiscord, (req, res, next) => {
    try {
      const attempt = getAttemptForUser(db, Number(req.params.attemptId), req.session.discordId);
      if (!attempt) {
        return res.status(404).json({ error: 'Attempt was not found.' });
      }

      saveAnswer(db, attempt.id, Number(req.body.question_id), req.body);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/attempts/:attemptId/submit', requireDiscord, async (req, res, next) => {
    try {
      const attempt = submitAttempt(db, Number(req.params.attemptId), req.session.discordId);
      await gradeSubmittedAttempt(db, config, attempt.id);
      return res.json({ ok: true, redirect: req.toUrl(`/attempts/${attempt.id}/complete`) });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/attempts/:attemptId/complete', requireDiscord, (req, res, next) => {
    const attempt = getAttemptForUser(db, Number(req.params.attemptId), req.session.discordId);
    if (!attempt) {
      return next();
    }

    return res.render('public/complete', {
      title: 'Submission received',
      attempt
    });
  });

  return router;
}

module.exports = { createPublicRouter };
