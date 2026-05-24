const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { openDatabase } = require('../src/database');
const { createApp } = require('../src/app');

function createTestApp(configOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'korewa-exam-'));
  const db = openDatabase(path.join(dir, 'exam.sqlite'));
  const app = createApp({
    db,
    config: {
      env: 'test',
      port: 0,
      basePath: '',
      dbPath: path.join(dir, 'exam.sqlite'),
      adminUser: 'admin',
      adminPassword: 'password',
      sessionSecret: 'test-secret',
      ...configOverrides
    }
  });

  return { app, db };
}

test('public flow identifies a user and lists the seeded test', async () => {
  const { app } = createTestApp();
  const agent = request.agent(app);

  const home = await agent.get('/').expect(200);
  assert.match(home.text, /KorewaDiscord Underground/);
  const csrf = home.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post('/identify')
    .type('form')
    .send({ _csrf: csrf, discord_id: 'tester#0001' })
    .expect(302)
    .expect('Location', '/tests');

  const testsPage = await agent.get('/tests').expect(200);
  assert.match(testsPage.text, /KorewaDiscord Community Basics/);
  assert.match(testsPage.text, /OPENED/);
});

test('admin can log in and see dashboard stats', async () => {
  const { app } = createTestApp();
  const agent = request.agent(app);

  const login = await agent.get('/admin/login').expect(200);
  const csrf = login.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post('/admin/login')
    .type('form')
    .send({ _csrf: csrf, username: 'admin', password: 'password' })
    .expect(302)
    .expect('Location', '/admin');

  const dashboard = await agent.get('/admin').expect(200);
  assert.match(dashboard.text, /Total tests/);
  assert.match(dashboard.text, /Recent submissions/);
});

test('admin can delete a test from the dashboard', async () => {
  const { app, db } = createTestApp();
  const agent = request.agent(app);

  const login = await agent.get('/admin/login').expect(200);
  const loginCsrf = login.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post('/admin/login')
    .type('form')
    .send({ _csrf: loginCsrf, username: 'admin', password: 'password' })
    .expect(302)
    .expect('Location', '/admin');

  const dashboard = await agent.get('/admin').expect(200);
  assert.match(dashboard.text, /Delete/);

  const dashboardCsrf = dashboard.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await agent
    .post('/admin/tests/1/delete')
    .type('form')
    .send({ _csrf: dashboardCsrf })
    .expect(302)
    .expect('Location', '/admin/tests');

  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tests').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM questions').get().count, 0);
});

test('duplicate submitted attempts are blocked until reset', async () => {
  const { db } = createTestApp();
  const { createOrResumeAttempt, submitAttempt, resetAttempt } = require('../src/database');

  const first = createOrResumeAttempt(db, 1, 'same-user');
  submitAttempt(db, first.id, 'same-user');

  assert.throws(() => createOrResumeAttempt(db, 1, 'same-user'), /already submitted/);

  resetAttempt(db, first.id);
  const second = createOrResumeAttempt(db, 1, 'same-user');
  assert.notEqual(second.id, first.id);
});


test('admin can configure randomized question sets', async () => {
  const { app, db } = createTestApp();
  const agent = request.agent(app);

  const login = await agent.get('/admin/login').expect(200);
  const loginCsrf = login.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post('/admin/login')
    .type('form')
    .send({ _csrf: loginCsrf, username: 'admin', password: 'password' })
    .expect(302)
    .expect('Location', '/admin');

  const editPage = await agent.get('/admin/tests/1/edit').expect(200);
  const csrf = editPage.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post('/admin/tests/1')
    .type('form')
    .send({
      _csrf: csrf,
      title: 'Randomized onboarding',
      description: 'Each user sees a random subset.',
      instructions: 'Answer your assigned questions.',
      status: 'OPENED',
      timer_seconds_per_question: '45',
      randomize_questions: '1',
      question_limit: '10'
    })
    .expect(302)
    .expect('Location', '/admin/tests/1/edit');

  const row = db.prepare('SELECT randomize_questions, question_limit, timer_seconds_per_question FROM tests WHERE id = 1').get();
  assert.equal(row.randomize_questions, 1);
  assert.equal(row.question_limit, 10);
  assert.equal(row.timer_seconds_per_question, 45);

  const updatedPage = await agent.get('/admin/tests/1/edit').expect(200);
  assert.match(updatedPage.text, /Randomized question set per attempt/);
  assert.match(updatedPage.text, /value="10"/);
});

test('randomized tests assign a stable subset and reject unassigned questions', () => {
  const { db } = createTestApp();
  const {
    createOrResumeAttempt,
    getPublicTestsForUser,
    getTestWithAttemptQuestions,
    saveAnswer
  } = require('../src/database');

  db.prepare('UPDATE tests SET randomize_questions = 1, question_limit = 10 WHERE id = 1').run();

  const attempt = createOrResumeAttempt(db, 1, 'random-user');
  const assigned = db.prepare(`
    SELECT question_id
    FROM attempt_questions
    WHERE attempt_id = ?
    ORDER BY position ASC
  `).all(attempt.id);

  assert.equal(assigned.length, 10);

  const visibleTest = getTestWithAttemptQuestions(db, attempt.id);
  assert.equal(visibleTest.questions.length, 10);
  assert.deepEqual(visibleTest.questions.map((question) => question.id), assigned.map((row) => row.question_id));

  const resumed = createOrResumeAttempt(db, 1, 'random-user');
  assert.equal(resumed.id, attempt.id);
  const assignedAfterResume = db.prepare(`
    SELECT question_id
    FROM attempt_questions
    WHERE attempt_id = ?
    ORDER BY position ASC
  `).all(attempt.id);
  assert.deepEqual(assignedAfterResume, assigned);

  const publicTest = getPublicTestsForUser(db, 'random-user').find((row) => row.id === 1);
  assert.equal(publicTest.question_count, 25);
  assert.equal(publicTest.effective_question_count, 10);
  assert.equal(publicTest.question_summary, '10 of 25');

  const unassigned = db.prepare(`
    SELECT id
    FROM questions
    WHERE test_id = 1
      AND id NOT IN (
        SELECT question_id
        FROM attempt_questions
        WHERE attempt_id = ?
      )
    LIMIT 1
  `).get(attempt.id);

  assert.ok(unassigned);
  assert.throws(
    () => saveAnswer(db, attempt.id, unassigned.id, { essay_answer: 'not assigned' }),
    /does not belong to this attempt/
  );
});

test('attempt UI only exposes submit after all assigned questions are complete', () => {
  const script = fs.readFileSync(path.join(__dirname, '../public/js/exam.js'), 'utf8');

  assert.match(script, /function allQuestionsComplete\(\)/);
  assert.match(script, /submitButton\.hidden = !complete/);
  assert.match(script, /Answer or wait out every question before submitting/);
  assert.match(script, /Save final answer/);
  assert.doesNotMatch(script, /submitButton\.hidden = index !== boot\.questions\.length - 1/);
});

test('attempt page cache-busts the exam browser script', () => {
  const template = fs.readFileSync(path.join(__dirname, '../views/public/attempt.ejs'), 'utf8');

  assert.match(template, /assets\/js\/exam\.js'\) %>\?v=20260523-submit-gate/);
});


test('admin can save short essay sample answers for AI grading', async () => {
  const { app, db } = createTestApp();
  const agent = request.agent(app);
  const essay = db.prepare("SELECT * FROM questions WHERE question_type = 'SHORT_ESSAY' LIMIT 1").get();

  const login = await agent.get('/admin/login').expect(200);
  const loginCsrf = login.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post('/admin/login')
    .type('form')
    .send({ _csrf: loginCsrf, username: 'admin', password: 'password' })
    .expect(302);

  const editPage = await agent.get(`/admin/tests/${essay.test_id}/edit`).expect(200);
  assert.match(editPage.text, /Sample answer for AI grading/);
  const csrf = editPage.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post(`/admin/questions/${essay.id}`)
    .type('form')
    .send({
      _csrf: csrf,
      question_text: essay.question_text,
      position: essay.position,
      sample_answer: 'Members should be respectful and avoid harassment.'
    })
    .expect(302);

  const updated = db.prepare('SELECT sample_answer FROM questions WHERE id = ?').get(essay.id);
  assert.equal(updated.sample_answer, 'Members should be respectful and avoid harassment.');
});

test('admin can bulk save multiple-choice options with one form', async () => {
  const { app, db } = createTestApp();
  const agent = request.agent(app);
  const question = db.prepare("SELECT * FROM questions WHERE question_type = 'MULTIPLE_CHOICE' LIMIT 1").get();
  const options = db.prepare('SELECT * FROM question_options WHERE question_id = ? ORDER BY position ASC').all(question.id);

  const login = await agent.get('/admin/login').expect(200);
  const loginCsrf = login.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post('/admin/login')
    .type('form')
    .send({ _csrf: loginCsrf, username: 'admin', password: 'password' })
    .expect(302);

  const editPage = await agent.get(`/admin/tests/${question.test_id}/edit`).expect(200);
  assert.match(editPage.text, /Save options/);
  assert.match(editPage.text, /Add option row/);
  assert.doesNotMatch(editPage.text, /\/admin\/options\/\d+"/);
  const csrf = editPage.text.match(/name="_csrf" value="([^"]+)"/)[1];

  const payload = new URLSearchParams();
  payload.append('_csrf', csrf);
  payload.append(`options[option_${options[0].id}][position]`, '1');
  payload.append(`options[option_${options[0].id}][option_text]`, 'Updated option text');
  payload.append(`options[option_${options[0].id}][is_correct]`, '1');
  payload.append(`options[option_${options[1].id}][position]`, '2');
  payload.append(`options[option_${options[1].id}][option_text]`, options[1].option_text);
  payload.append('new_options[0][position]', '99');
  payload.append('new_options[0][option_text]', 'Brand new option');
  payload.append('new_options[0][is_correct]', '1');

  await agent
    .post(`/admin/questions/${question.id}/options/bulk`)
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .send(payload.toString())
    .expect(302)
    .expect('Location', `/admin/tests/${question.test_id}/edit`);

  const updated = db.prepare('SELECT option_text, is_correct FROM question_options WHERE id = ?').get(options[0].id);
  assert.equal(updated.option_text, 'Updated option text');
  assert.equal(updated.is_correct, 1);

  const inserted = db.prepare('SELECT option_text, is_correct, position FROM question_options WHERE question_id = ? AND option_text = ?').get(question.id, 'Brand new option');
  assert.equal(inserted.is_correct, 1);
  assert.equal(inserted.position, 99);
});

test('admin can manually override an answer score', async () => {
  const { app, db } = createTestApp();
  const agent = request.agent(app);
  const {
    createOrResumeAttempt,
    saveAnswer,
    submitAttempt
  } = require('../src/database');
  const question = db.prepare("SELECT * FROM questions WHERE question_type = 'MULTIPLE_CHOICE' LIMIT 1").get();
  const wrongOption = db.prepare('SELECT * FROM question_options WHERE question_id = ? AND is_correct = 0 LIMIT 1').get(question.id);
  const attempt = createOrResumeAttempt(db, 1, 'manual-score-user');
  saveAnswer(db, attempt.id, question.id, { selected_option_id: wrongOption.id });
  submitAttempt(db, attempt.id, 'manual-score-user');

  const login = await agent.get('/admin/login').expect(200);
  const loginCsrf = login.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post('/admin/login')
    .type('form')
    .send({ _csrf: loginCsrf, username: 'admin', password: 'password' })
    .expect(302);

  const detailPage = await agent.get(`/admin/attempts/${attempt.id}`).expect(200);
  assert.match(detailPage.text, /Manual grade override/);
  const csrf = detailPage.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post(`/admin/attempts/${attempt.id}/questions/${question.id}/manual-score`)
    .type('form')
    .send({
      _csrf: csrf,
      score: '1',
      feedback: 'Accepted after manual review.'
    })
    .expect(302)
    .expect('Location', `/admin/attempts/${attempt.id}`);

  const answer = db.prepare('SELECT score, score_status, score_feedback, scored_by FROM answers WHERE attempt_id = ? AND question_id = ?').get(attempt.id, question.id);
  assert.equal(answer.score, 1);
  assert.equal(answer.score_status, 'SCORED');
  assert.equal(answer.score_feedback, 'Accepted after manual review.');
  assert.equal(answer.scored_by, 'manual-override');
});

test('admin can dispute an AI essay grade and regrade with the dispute message', async () => {
  let gradingPayload;
  const { app, db } = createTestApp({
    deepseekApiKey: 'test-key',
    gradeEssay: async (config, answer) => {
      gradingPayload = answer;
      return { score: 1, feedback: 'Dispute accepted.' };
    }
  });
  const agent = request.agent(app);
  const {
    createOrResumeAttempt,
    saveAnswer,
    submitAttempt
  } = require('../src/database');
  const essay = db.prepare("SELECT * FROM questions WHERE question_type = 'SHORT_ESSAY' LIMIT 1").get();
  db.prepare('UPDATE questions SET sample_answer = ? WHERE id = ?').run('Members should be respectful.', essay.id);

  const attempt = createOrResumeAttempt(db, 1, 'dispute-user');
  saveAnswer(db, attempt.id, essay.id, { essay_answer: 'People should be respectful.' });
  submitAttempt(db, attempt.id, 'dispute-user');
  const answer = db.prepare('SELECT id FROM answers WHERE attempt_id = ? AND question_id = ?').get(attempt.id, essay.id);

  const login = await agent.get('/admin/login').expect(200);
  const loginCsrf = login.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post('/admin/login')
    .type('form')
    .send({ _csrf: loginCsrf, username: 'admin', password: 'password' })
    .expect(302);

  const detailPage = await agent.get(`/admin/attempts/${attempt.id}`).expect(200);
  assert.match(detailPage.text, /AI grading dispute/);
  const csrf = detailPage.text.match(/name="_csrf" value="([^"]+)"/)[1];

  await agent
    .post(`/admin/answers/${answer.id}/dispute`)
    .type('form')
    .send({
      _csrf: csrf,
      dispute_message: 'The answer names the core respect requirement.'
    })
    .expect(302)
    .expect('Location', `/admin/attempts/${attempt.id}`);

  assert.equal(gradingPayload.dispute_message, 'The answer names the core respect requirement.');
  const updated = db.prepare('SELECT score, score_status, score_feedback, scored_by, score_dispute_message FROM answers WHERE id = ?').get(answer.id);
  assert.equal(updated.score, 1);
  assert.equal(updated.score_status, 'SCORED');
  assert.equal(updated.score_feedback, 'Dispute accepted.');
  assert.equal(updated.scored_by, 'deepseek-dispute');
  assert.equal(updated.score_dispute_message, 'The answer names the core respect requirement.');
});


test('submitted attempts expose score percentages and AI essay grades', async () => {
  const { db } = createTestApp();
  const {
    createOrResumeAttempt,
    saveAnswer,
    submitAttempt,
    getAttemptScoreSummary
  } = require('../src/database');
  const { gradeSubmittedAttempt } = require('../src/scoring');

  const essay = db.prepare("SELECT * FROM questions WHERE question_type = 'SHORT_ESSAY' LIMIT 1").get();
  db.prepare('UPDATE questions SET sample_answer = ? WHERE id = ?').run('Respect other members and avoid harassment.', essay.id);

  const attempt = createOrResumeAttempt(db, 1, 'essay-score-user');
  saveAnswer(db, attempt.id, essay.id, { essay_answer: 'Respect everyone and do not harass people.' });
  submitAttempt(db, attempt.id, 'essay-score-user');

  const result = await gradeSubmittedAttempt(db, { deepseekApiKey: 'test' }, attempt.id, {
    gradeEssay: async () => ({ score: 0.5, feedback: 'Similar but incomplete.' })
  });

  assert.equal(result.graded, 1);
  const answer = db.prepare('SELECT score, score_status, score_feedback, scored_by FROM answers WHERE attempt_id = ? AND question_id = ?').get(attempt.id, essay.id);
  assert.equal(answer.score, 0.5);
  assert.equal(answer.score_status, 'SCORED');
  assert.equal(answer.scored_by, 'deepseek');
  assert.equal(answer.score_feedback, 'Similar but incomplete.');

  const summary = getAttemptScoreSummary(db, attempt.id);
  assert.equal(summary.score_earned, 0.5);
  assert.equal(summary.score_total, 25);
  assert.equal(summary.score_percent, 2);
});
