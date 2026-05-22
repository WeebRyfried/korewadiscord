const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { sampleQuestions } = require('./seed-data');

function now() {
  return new Date().toISOString();
}

function normalizeDiscordId(value) {
  return String(value || '').trim().toLowerCase();
}

function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  migrate(db);
  seed(db);

  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS exam_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      normalized_discord_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('OPENED', 'CLOSED')) DEFAULT 'CLOSED',
      timer_seconds_per_question INTEGER NOT NULL DEFAULT 60,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      question_type TEXT NOT NULL CHECK (question_type IN ('MULTIPLE_CHOICE', 'SHORT_ESSAY')),
      question_text TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS question_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      option_text TEXT NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      exam_user_id INTEGER REFERENCES exam_users(id) ON DELETE SET NULL,
      discord_id TEXT NOT NULL,
      normalized_discord_id TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'RESET')) DEFAULT 'IN_PROGRESS'
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_option_id INTEGER REFERENCES question_options(id) ON DELETE SET NULL,
      essay_answer TEXT,
      answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (attempt_id, question_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS attempts_one_active_per_test
      ON attempts (test_id, normalized_discord_id)
      WHERE status IN ('IN_PROGRESS', 'SUBMITTED');

    CREATE INDEX IF NOT EXISTS attempts_by_discord_id
      ON attempts (normalized_discord_id);

    CREATE INDEX IF NOT EXISTS questions_by_test_position
      ON questions (test_id, position);
  `);
}

function seed(db) {
  const testCount = db.prepare('SELECT COUNT(*) AS count FROM tests').get().count;
  if (testCount > 0) {
    return;
  }

  const insert = db.transaction(() => {
    const timestamp = now();
    const testInfo = db.prepare(`
      INSERT INTO tests (title, description, instructions, status, timer_seconds_per_question, created_at, updated_at)
      VALUES (?, ?, ?, 'OPENED', 60, ?, ?)
    `).run(
      'KorewaDiscord Community Basics',
      'A sample onboarding test with multiple-choice and short essay questions.',
      'Answer each question before its one-minute timer ends. Multiple-choice questions may have one correct answer. Short essay answers should be brief and clear.',
      timestamp,
      timestamp
    );

    const insertQuestion = db.prepare(`
      INSERT INTO questions (test_id, question_type, question_text, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertOption = db.prepare(`
      INSERT INTO question_options (question_id, option_text, is_correct, position)
      VALUES (?, ?, ?, ?)
    `);

    sampleQuestions.forEach((question, index) => {
      const questionInfo = insertQuestion.run(
        testInfo.lastInsertRowid,
        question.type,
        question.text,
        index + 1,
        timestamp,
        timestamp
      );

      if (question.type === 'MULTIPLE_CHOICE') {
        question.options.forEach(([optionText, isCorrect], optionIndex) => {
          insertOption.run(questionInfo.lastInsertRowid, optionText, isCorrect ? 1 : 0, optionIndex + 1);
        });
      }
    });
  });

  insert();
}

function getOrCreateExamUser(db, discordId) {
  const cleanDiscordId = String(discordId || '').trim();
  const normalized = normalizeDiscordId(cleanDiscordId);

  if (!normalized) {
    throw new Error('Discord ID or username is required.');
  }

  const existing = db.prepare('SELECT * FROM exam_users WHERE normalized_discord_id = ?').get(normalized);
  if (existing) {
    return existing;
  }

  db.prepare(`
    INSERT INTO exam_users (discord_id, normalized_discord_id, created_at)
    VALUES (?, ?, ?)
  `).run(cleanDiscordId, normalized, now());

  return db.prepare('SELECT * FROM exam_users WHERE normalized_discord_id = ?').get(normalized);
}

function getPublicTestsForUser(db, discordId) {
  const normalized = normalizeDiscordId(discordId);

  return db.prepare(`
    SELECT
      tests.*,
      COUNT(questions.id) AS question_count,
      (
        SELECT attempts.status
        FROM attempts
        WHERE attempts.test_id = tests.id
          AND attempts.normalized_discord_id = ?
          AND attempts.status IN ('IN_PROGRESS', 'SUBMITTED')
        ORDER BY attempts.started_at DESC
        LIMIT 1
      ) AS attempt_status,
      (
        SELECT attempts.id
        FROM attempts
        WHERE attempts.test_id = tests.id
          AND attempts.normalized_discord_id = ?
          AND attempts.status = 'IN_PROGRESS'
        ORDER BY attempts.started_at DESC
        LIMIT 1
      ) AS in_progress_attempt_id
    FROM tests
    LEFT JOIN questions ON questions.test_id = tests.id
    WHERE tests.archived_at IS NULL
    GROUP BY tests.id
    ORDER BY tests.created_at DESC
  `).all(normalized, normalized);
}

function getTest(db, testId) {
  return db.prepare(`
    SELECT
      tests.*,
      COUNT(questions.id) AS question_count
    FROM tests
    LEFT JOIN questions ON questions.test_id = tests.id
    WHERE tests.id = ? AND tests.archived_at IS NULL
    GROUP BY tests.id
  `).get(testId);
}

function getTestWithQuestions(db, testId, options = {}) {
  const test = getTest(db, testId);
  if (!test) {
    return null;
  }

  const questions = db.prepare(`
    SELECT *
    FROM questions
    WHERE test_id = ?
    ORDER BY position ASC, id ASC
  `).all(testId);

  const optionRows = db.prepare(`
    SELECT *
    FROM question_options
    WHERE question_id = ?
    ORDER BY position ASC, id ASC
  `);

  test.questions = questions.map((question) => {
    const row = { ...question };
    row.options = optionRows.all(question.id).map((option) => {
      if (options.includeCorrect) {
        return option;
      }

      const { is_correct: _isCorrect, ...publicOption } = option;
      return publicOption;
    });
    return row;
  });

  return test;
}

function createOrResumeAttempt(db, testId, discordId) {
  return db.transaction(() => {
    const test = getTest(db, testId);
    if (!test) {
      throw new Error('Test was not found.');
    }
    if (test.status !== 'OPENED') {
      throw new Error('This test is currently closed.');
    }

    const examUser = getOrCreateExamUser(db, discordId);
    const activeAttempt = db.prepare(`
      SELECT *
      FROM attempts
      WHERE test_id = ?
        AND normalized_discord_id = ?
        AND status IN ('IN_PROGRESS', 'SUBMITTED')
      ORDER BY started_at DESC
      LIMIT 1
    `).get(test.id, examUser.normalized_discord_id);

    if (activeAttempt?.status === 'SUBMITTED') {
      throw new Error('This Discord ID has already submitted this test.');
    }
    if (activeAttempt?.status === 'IN_PROGRESS') {
      return activeAttempt;
    }

    const result = db.prepare(`
      INSERT INTO attempts (test_id, exam_user_id, discord_id, normalized_discord_id, started_at, status)
      VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS')
    `).run(test.id, examUser.id, examUser.discord_id, examUser.normalized_discord_id, now());

    return db.prepare('SELECT * FROM attempts WHERE id = ?').get(result.lastInsertRowid);
  })();
}

function getAttemptForUser(db, attemptId, discordId) {
  return db.prepare(`
    SELECT attempts.*, tests.title AS test_title, tests.timer_seconds_per_question, tests.status AS test_status
    FROM attempts
    INNER JOIN tests ON tests.id = attempts.test_id
    WHERE attempts.id = ?
      AND attempts.normalized_discord_id = ?
  `).get(attemptId, normalizeDiscordId(discordId));
}

function getAttemptAnswers(db, attemptId) {
  return db.prepare(`
    SELECT *
    FROM answers
    WHERE attempt_id = ?
  `).all(attemptId);
}

function saveAnswer(db, attemptId, questionId, payload) {
  return db.transaction(() => {
    const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
    if (!attempt || attempt.status !== 'IN_PROGRESS') {
      throw new Error('Attempt is not available for answers.');
    }

    const question = db.prepare(`
      SELECT *
      FROM questions
      WHERE id = ? AND test_id = ?
    `).get(questionId, attempt.test_id);
    if (!question) {
      throw new Error('Question does not belong to this attempt.');
    }

    let selectedOptionId = null;
    let essayAnswer = null;

    if (question.question_type === 'MULTIPLE_CHOICE') {
      selectedOptionId = payload.selected_option_id ? Number(payload.selected_option_id) : null;
      if (selectedOptionId) {
        const option = db.prepare(`
          SELECT id
          FROM question_options
          WHERE id = ? AND question_id = ?
        `).get(selectedOptionId, question.id);
        if (!option) {
          throw new Error('Selected option does not belong to this question.');
        }
      }
    } else {
      essayAnswer = String(payload.essay_answer || '').slice(0, 8000);
    }

    db.prepare(`
      INSERT INTO answers (attempt_id, question_id, selected_option_id, essay_answer, answered_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(attempt_id, question_id) DO UPDATE SET
        selected_option_id = excluded.selected_option_id,
        essay_answer = excluded.essay_answer,
        answered_at = excluded.answered_at
    `).run(attempt.id, question.id, selectedOptionId, essayAnswer, now());
  })();
}

function submitAttempt(db, attemptId, discordId) {
  const attempt = getAttemptForUser(db, attemptId, discordId);
  if (!attempt) {
    throw new Error('Attempt was not found.');
  }
  if (attempt.status === 'SUBMITTED') {
    return attempt;
  }
  if (attempt.status !== 'IN_PROGRESS') {
    throw new Error('Attempt cannot be submitted.');
  }

  db.prepare(`
    UPDATE attempts
    SET status = 'SUBMITTED', submitted_at = ?
    WHERE id = ?
  `).run(now(), attempt.id);

  return getAttemptForUser(db, attemptId, discordId);
}

function resetAttempt(db, attemptId) {
  db.prepare(`
    UPDATE attempts
    SET status = 'RESET'
    WHERE id = ? AND status IN ('IN_PROGRESS', 'SUBMITTED')
  `).run(attemptId);
}

module.exports = {
  openDatabase,
  normalizeDiscordId,
  now,
  getOrCreateExamUser,
  getPublicTestsForUser,
  getTest,
  getTestWithQuestions,
  createOrResumeAttempt,
  getAttemptForUser,
  getAttemptAnswers,
  saveAnswer,
  submitAttempt,
  resetAttempt
};
