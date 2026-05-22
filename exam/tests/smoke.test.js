const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { openDatabase } = require('../src/database');
const { createApp } = require('../src/app');

function createTestApp() {
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
      sessionSecret: 'test-secret'
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
