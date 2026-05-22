const express = require('express');
const {
  now,
  getTestWithQuestions,
  resetAttempt
} = require('../database');

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.redirect(req.toUrl('/admin/login'));
  }

  return next();
}

function asStatus(value) {
  return value === 'OPENED' ? 'OPENED' : 'CLOSED';
}

function asQuestionType(value) {
  return value === 'SHORT_ESSAY' ? 'SHORT_ESSAY' : 'MULTIPLE_CHOICE';
}

function createAdminRouter(db, config) {
  const router = express.Router();

  router.get('/login', (req, res) => {
    if (req.session.isAdmin) {
      return res.redirect(req.toUrl('/admin'));
    }

    return res.render('admin/login', {
      title: 'Admin login',
      error: ''
    });
  });

  router.post('/login', (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (username === config.adminUser && password === config.adminPassword) {
      req.session.isAdmin = true;
      return res.redirect(req.toUrl('/admin'));
    }

    return res.status(401).render('admin/login', {
      title: 'Admin login',
      error: 'Invalid admin username or password.'
    });
  });

  router.post('/logout', requireAdmin, (req, res) => {
    req.session.isAdmin = false;
    return res.redirect(req.toUrl('/admin/login'));
  });

  router.get('/', requireAdmin, (req, res) => {
    const stats = {
      totalTests: db.prepare('SELECT COUNT(*) AS count FROM tests WHERE archived_at IS NULL').get().count,
      openedTests: db.prepare("SELECT COUNT(*) AS count FROM tests WHERE archived_at IS NULL AND status = 'OPENED'").get().count,
      closedTests: db.prepare("SELECT COUNT(*) AS count FROM tests WHERE archived_at IS NULL AND status = 'CLOSED'").get().count
    };

    const submissionsByTest = db.prepare(`
      SELECT tests.id, tests.title, COUNT(attempts.id) AS submission_count
      FROM tests
      LEFT JOIN attempts ON attempts.test_id = tests.id AND attempts.status = 'SUBMITTED'
      WHERE tests.archived_at IS NULL
      GROUP BY tests.id
      ORDER BY tests.created_at DESC
    `).all();

    const recentSubmissions = db.prepare(`
      SELECT attempts.*, tests.title AS test_title
      FROM attempts
      INNER JOIN tests ON tests.id = attempts.test_id
      WHERE attempts.status = 'SUBMITTED'
      ORDER BY attempts.submitted_at DESC
      LIMIT 8
    `).all();

    return res.render('admin/dashboard', {
      title: 'Admin dashboard',
      stats,
      submissionsByTest,
      recentSubmissions
    });
  });

  router.get('/tests', requireAdmin, (req, res) => {
    const tests = db.prepare(`
      SELECT tests.*, COUNT(questions.id) AS question_count
      FROM tests
      LEFT JOIN questions ON questions.test_id = tests.id
      WHERE tests.archived_at IS NULL
      GROUP BY tests.id
      ORDER BY tests.created_at DESC
    `).all();

    return res.render('admin/tests', {
      title: 'Manage tests',
      tests
    });
  });

  router.post('/tests', requireAdmin, (req, res) => {
    const timestamp = now();
    const result = db.prepare(`
      INSERT INTO tests (title, description, instructions, status, timer_seconds_per_question, created_at, updated_at)
      VALUES (?, '', '', 'CLOSED', 60, ?, ?)
    `).run(String(req.body.title || 'Untitled test').trim() || 'Untitled test', timestamp, timestamp);

    return res.redirect(req.toUrl(`/admin/tests/${result.lastInsertRowid}/edit`));
  });

  router.get('/tests/:testId/edit', requireAdmin, (req, res, next) => {
    const test = getTestWithQuestions(db, Number(req.params.testId), { includeCorrect: true });
    if (!test) {
      return next();
    }

    return res.render('admin/test-edit', {
      title: `Edit ${test.title}`,
      test
    });
  });

  router.post('/tests/:testId', requireAdmin, (req, res) => {
    db.prepare(`
      UPDATE tests
      SET title = ?, description = ?, instructions = ?, status = ?, timer_seconds_per_question = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
    `).run(
      String(req.body.title || '').trim() || 'Untitled test',
      String(req.body.description || '').trim(),
      String(req.body.instructions || '').trim(),
      asStatus(req.body.status),
      Math.max(10, Number(req.body.timer_seconds_per_question || 60)),
      now(),
      Number(req.params.testId)
    );

    return res.redirect(req.toUrl(`/admin/tests/${req.params.testId}/edit`));
  });

  router.post('/tests/:testId/status', requireAdmin, (req, res) => {
    db.prepare(`
      UPDATE tests
      SET status = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
    `).run(asStatus(req.body.status), now(), Number(req.params.testId));

    return res.redirect(req.get('referer') || req.toUrl('/admin/tests'));
  });

  router.post('/tests/:testId/archive', requireAdmin, (req, res) => {
    db.prepare(`
      UPDATE tests
      SET status = 'CLOSED', archived_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now(), now(), Number(req.params.testId));

    return res.redirect(req.toUrl('/admin/tests'));
  });

  router.post('/tests/:testId/questions', requireAdmin, (req, res) => {
    const testId = Number(req.params.testId);
    const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM questions WHERE test_id = ?').get(testId).position;
    const timestamp = now();
    const result = db.prepare(`
      INSERT INTO questions (test_id, question_type, question_text, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      testId,
      asQuestionType(req.body.question_type),
      String(req.body.question_text || '').trim() || 'New question',
      nextPosition,
      timestamp,
      timestamp
    );

    if (asQuestionType(req.body.question_type) === 'MULTIPLE_CHOICE') {
      const insertOption = db.prepare(`
        INSERT INTO question_options (question_id, option_text, is_correct, position)
        VALUES (?, ?, ?, ?)
      `);
      ['Option A', 'Option B', 'Option C', 'Option D'].forEach((label, index) => {
        insertOption.run(result.lastInsertRowid, label, index === 0 ? 1 : 0, index + 1);
      });
    }

    return res.redirect(req.toUrl(`/admin/tests/${testId}/edit`));
  });

  router.post('/questions/:questionId', requireAdmin, (req, res) => {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(Number(req.params.questionId));
    if (!question) {
      return res.redirect(req.toUrl('/admin/tests'));
    }

    db.prepare(`
      UPDATE questions
      SET question_text = ?, position = ?, updated_at = ?
      WHERE id = ?
    `).run(
      String(req.body.question_text || '').trim() || 'Untitled question',
      Math.max(1, Number(req.body.position || question.position)),
      now(),
      question.id
    );

    return res.redirect(req.toUrl(`/admin/tests/${question.test_id}/edit`));
  });

  router.post('/questions/:questionId/delete', requireAdmin, (req, res) => {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(Number(req.params.questionId));
    if (question) {
      db.prepare('DELETE FROM questions WHERE id = ?').run(question.id);
      return res.redirect(req.toUrl(`/admin/tests/${question.test_id}/edit`));
    }

    return res.redirect(req.toUrl('/admin/tests'));
  });

  router.post('/questions/:questionId/options', requireAdmin, (req, res) => {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(Number(req.params.questionId));
    if (!question) {
      return res.redirect(req.toUrl('/admin/tests'));
    }

    const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM question_options WHERE question_id = ?').get(question.id).position;
    db.prepare(`
      INSERT INTO question_options (question_id, option_text, is_correct, position)
      VALUES (?, ?, 0, ?)
    `).run(question.id, String(req.body.option_text || '').trim() || 'New option', nextPosition);

    return res.redirect(req.toUrl(`/admin/tests/${question.test_id}/edit`));
  });

  router.post('/options/:optionId', requireAdmin, (req, res) => {
    const option = db.prepare(`
      SELECT question_options.*, questions.test_id
      FROM question_options
      INNER JOIN questions ON questions.id = question_options.question_id
      WHERE question_options.id = ?
    `).get(Number(req.params.optionId));
    if (!option) {
      return res.redirect(req.toUrl('/admin/tests'));
    }

    db.prepare(`
      UPDATE question_options
      SET option_text = ?, is_correct = ?, position = ?
      WHERE id = ?
    `).run(
      String(req.body.option_text || '').trim() || 'Untitled option',
      req.body.is_correct ? 1 : 0,
      Math.max(1, Number(req.body.position || option.position)),
      option.id
    );

    return res.redirect(req.toUrl(`/admin/tests/${option.test_id}/edit`));
  });

  router.post('/options/:optionId/delete', requireAdmin, (req, res) => {
    const option = db.prepare(`
      SELECT question_options.*, questions.test_id
      FROM question_options
      INNER JOIN questions ON questions.id = question_options.question_id
      WHERE question_options.id = ?
    `).get(Number(req.params.optionId));
    if (option) {
      db.prepare('DELETE FROM question_options WHERE id = ?').run(option.id);
      return res.redirect(req.toUrl(`/admin/tests/${option.test_id}/edit`));
    }

    return res.redirect(req.toUrl('/admin/tests'));
  });

  router.get('/attempts', requireAdmin, (req, res) => {
    const testId = req.query.test_id ? Number(req.query.test_id) : null;
    const discord = String(req.query.discord_id || '').trim().toLowerCase();
    const filters = [];
    const params = [];

    if (testId) {
      filters.push('attempts.test_id = ?');
      params.push(testId);
    }
    if (discord) {
      filters.push('attempts.normalized_discord_id LIKE ?');
      params.push(`%${discord}%`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const attempts = db.prepare(`
      SELECT attempts.*, tests.title AS test_title
      FROM attempts
      INNER JOIN tests ON tests.id = attempts.test_id
      ${where}
      ORDER BY attempts.started_at DESC
      LIMIT 200
    `).all(...params);

    const tests = db.prepare(`
      SELECT id, title
      FROM tests
      WHERE archived_at IS NULL
      ORDER BY title ASC
    `).all();

    return res.render('admin/attempts', {
      title: 'Manage attempts',
      attempts,
      tests,
      selectedTestId: testId,
      discord
    });
  });

  router.get('/attempts/:attemptId', requireAdmin, (req, res, next) => {
    const attempt = db.prepare(`
      SELECT attempts.*, tests.title AS test_title
      FROM attempts
      INNER JOIN tests ON tests.id = attempts.test_id
      WHERE attempts.id = ?
    `).get(Number(req.params.attemptId));
    if (!attempt) {
      return next();
    }

    const answers = db.prepare(`
      SELECT
        questions.position,
        questions.question_text,
        questions.question_type,
        selected.option_text AS selected_option,
        selected.is_correct AS selected_is_correct,
        answers.essay_answer,
        answers.answered_at,
        (
          SELECT GROUP_CONCAT(option_text, ', ')
          FROM question_options
          WHERE question_options.question_id = questions.id AND is_correct = 1
        ) AS correct_options
      FROM questions
      LEFT JOIN answers ON answers.question_id = questions.id AND answers.attempt_id = ?
      LEFT JOIN question_options selected ON selected.id = answers.selected_option_id
      WHERE questions.test_id = ?
      ORDER BY questions.position ASC, questions.id ASC
    `).all(attempt.id, attempt.test_id);

    return res.render('admin/attempt-detail', {
      title: `Attempt ${attempt.id}`,
      attempt,
      answers
    });
  });

  router.post('/attempts/:attemptId/reset', requireAdmin, (req, res) => {
    resetAttempt(db, Number(req.params.attemptId));
    return res.redirect(req.get('referer') || req.toUrl('/admin/attempts'));
  });

  return router;
}

module.exports = { createAdminRouter };
