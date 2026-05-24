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

function columnExists(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function addColumnIfMissing(db, tableName, columnName, definition) {
  if (!columnExists(db, tableName, columnName)) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
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
      randomize_questions INTEGER NOT NULL DEFAULT 0,
      question_limit INTEGER,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      question_type TEXT NOT NULL CHECK (question_type IN ('MULTIPLE_CHOICE', 'SHORT_ESSAY')),
      question_text TEXT NOT NULL,
      sample_answer TEXT NOT NULL DEFAULT '',
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
      score REAL,
      score_status TEXT NOT NULL DEFAULT 'PENDING',
      score_feedback TEXT,
      scored_at TEXT,
      scored_by TEXT,
      UNIQUE (attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS attempt_questions (
      attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      PRIMARY KEY (attempt_id, question_id),
      UNIQUE (attempt_id, position)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS attempts_one_active_per_test
      ON attempts (test_id, normalized_discord_id)
      WHERE status IN ('IN_PROGRESS', 'SUBMITTED');

    CREATE INDEX IF NOT EXISTS attempts_by_discord_id
      ON attempts (normalized_discord_id);

    CREATE INDEX IF NOT EXISTS questions_by_test_position
      ON questions (test_id, position);

    CREATE INDEX IF NOT EXISTS attempt_questions_by_attempt_position
      ON attempt_questions (attempt_id, position);
  `);

  addColumnIfMissing(db, 'tests', 'randomize_questions', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'tests', 'question_limit', 'INTEGER');
  addColumnIfMissing(db, 'questions', 'sample_answer', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'answers', 'score', 'REAL');
  addColumnIfMissing(db, 'answers', 'score_status', "TEXT NOT NULL DEFAULT 'PENDING'");
  addColumnIfMissing(db, 'answers', 'score_feedback', 'TEXT');
  addColumnIfMissing(db, 'answers', 'scored_at', 'TEXT');
  addColumnIfMissing(db, 'answers', 'scored_by', 'TEXT');
  addColumnIfMissing(db, 'answers', 'score_dispute_message', 'TEXT');
  addColumnIfMissing(db, 'answers', 'score_disputed_at', 'TEXT');
  backfillAttemptQuestions(db);
  backfillMultipleChoiceScores(db);
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

function normalizeQuestionLimit(value) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit < 1) {
    return null;
  }

  return Math.floor(limit);
}

function normalizeAnswerScore(value) {
  const numeric = Number(value);
  if (![0, 0.5, 1].includes(numeric)) {
    throw new Error('Answer score must be 0, 0.5, or 1.');
  }

  return numeric;
}

function asPayloadBoolean(value) {
  return value === true || value === '1' || value === 'on' || value === 'true';
}

function asPayloadObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function asPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function effectiveQuestionCount(test) {
  const total = Number(test.question_count || 0);
  if (!Number(test.randomize_questions)) {
    return total;
  }

  const limit = normalizeQuestionLimit(test.question_limit);
  if (!limit || limit >= total) {
    return total;
  }

  return limit;
}

function decorateTest(test) {
  if (!test) {
    return null;
  }

  test.randomize_questions = Number(test.randomize_questions || 0);
  test.question_limit = normalizeQuestionLimit(test.question_limit);
  test.question_count = Number(test.question_count || 0);
  test.effective_question_count = effectiveQuestionCount(test);
  test.question_summary = test.effective_question_count === test.question_count
    ? String(test.question_count)
    : `${test.effective_question_count} of ${test.question_count}`;

  return test;
}

function shuffleRows(rows) {
  const shuffled = rows.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function orderedQuestionsForTest(db, testId) {
  return db.prepare(`
    SELECT *
    FROM questions
    WHERE test_id = ?
    ORDER BY position ASC, id ASC
  `).all(testId);
}

function chooseQuestionsForAttempt(db, test) {
  const questions = orderedQuestionsForTest(db, test.id);
  if (!Number(test.randomize_questions)) {
    return questions;
  }

  const randomized = shuffleRows(questions);
  const limit = effectiveQuestionCount({ ...test, question_count: questions.length });
  return randomized.slice(0, limit);
}

function assignQuestionsToAttempt(db, attempt) {
  const test = getTest(db, attempt.test_id);
  if (!test) {
    return;
  }

  const selectedQuestions = chooseQuestionsForAttempt(db, test);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO attempt_questions (attempt_id, question_id, position)
    VALUES (?, ?, ?)
  `);

  selectedQuestions.forEach((question, index) => {
    insert.run(attempt.id, question.id, index + 1);
  });
}

function ensureAttemptQuestionAssignments(db, attempt) {
  const existing = db.prepare(`
    SELECT COUNT(*) AS count
    FROM attempt_questions
    WHERE attempt_id = ?
  `).get(attempt.id).count;

  if (existing === 0) {
    assignQuestionsToAttempt(db, attempt);
  }
}

function backfillAttemptQuestions(db) {
  db.prepare(`
    INSERT OR IGNORE INTO attempt_questions (attempt_id, question_id, position)
    SELECT attempt_id, question_id, assigned_position
    FROM (
      SELECT
        attempts.id AS attempt_id,
        questions.id AS question_id,
        ROW_NUMBER() OVER (
          PARTITION BY attempts.id
          ORDER BY questions.position ASC, questions.id ASC
        ) AS assigned_position
      FROM attempts
      INNER JOIN questions ON questions.test_id = attempts.test_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM attempt_questions
        WHERE attempt_questions.attempt_id = attempts.id
      )
    )
  `).run();
}

function attachOptionsToQuestions(db, questions, options = {}) {
  const optionRows = db.prepare(`
    SELECT *
    FROM question_options
    WHERE question_id = ?
    ORDER BY position ASC, id ASC
  `);

  return questions.map((question) => {
    const row = { ...question };
    if (!options.includeCorrect) {
      delete row.sample_answer;
    }
    row.options = optionRows.all(question.id).map((option) => {
      if (options.includeCorrect) {
        return option;
      }

      const { is_correct: _isCorrect, ...publicOption } = option;
      return publicOption;
    });
    return row;
  });
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
  `).all(normalized, normalized).map(decorateTest);
}

function getTest(db, testId) {
  return decorateTest(db.prepare(`
    SELECT
      tests.*,
      COUNT(questions.id) AS question_count
    FROM tests
    LEFT JOIN questions ON questions.test_id = tests.id
    WHERE tests.id = ? AND tests.archived_at IS NULL
    GROUP BY tests.id
  `).get(testId));
}

function getTestWithQuestions(db, testId, options = {}) {
  const test = getTest(db, testId);
  if (!test) {
    return null;
  }

  const questions = orderedQuestionsForTest(db, testId);
  test.questions = attachOptionsToQuestions(db, questions, options);

  return test;
}

function updateQuestionOptions(db, questionId, payload = {}) {
  return db.transaction(() => {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
    if (!question) {
      throw new Error('Question was not found.');
    }
    if (question.question_type !== 'MULTIPLE_CHOICE') {
      throw new Error('Only multiple-choice questions have options.');
    }

    const existingOptions = db.prepare('SELECT id FROM question_options WHERE question_id = ?').all(question.id);
    const existingOptionIds = new Set(existingOptions.map((option) => Number(option.id)));
    const submittedOptions = asPayloadObject(payload.options);
    const updateOption = db.prepare(`
      UPDATE question_options
      SET option_text = ?, is_correct = ?, position = ?
      WHERE id = ? AND question_id = ?
    `);
    const deleteOption = db.prepare('DELETE FROM question_options WHERE id = ? AND question_id = ?');

    Object.entries(submittedOptions).forEach(([optionIdValue, optionPayload]) => {
      const optionId = Number(String(optionIdValue).replace(/^option_/, ''));
      if (!existingOptionIds.has(optionId)) {
        throw new Error('Submitted option does not belong to this question.');
      }

      const option = asPayloadObject(optionPayload);
      if (asPayloadBoolean(option.delete)) {
        deleteOption.run(optionId, question.id);
        return;
      }

      updateOption.run(
        String(option.option_text || '').trim() || 'Untitled option',
        asPayloadBoolean(option.is_correct) ? 1 : 0,
        asPositiveInteger(option.position, 1),
        optionId,
        question.id
      );
    });

    let nextPosition = db.prepare(`
      SELECT COALESCE(MAX(position), 0) + 1 AS position
      FROM question_options
      WHERE question_id = ?
    `).get(question.id).position;
    const insertOption = db.prepare(`
      INSERT INTO question_options (question_id, option_text, is_correct, position)
      VALUES (?, ?, ?, ?)
    `);

    Object.values(asPayloadObject(payload.new_options)).forEach((optionPayload) => {
      const option = asPayloadObject(optionPayload);
      const optionText = String(option.option_text || '').trim();
      if (!optionText) {
        return;
      }

      insertOption.run(
        question.id,
        optionText,
        asPayloadBoolean(option.is_correct) ? 1 : 0,
        asPositiveInteger(option.position, nextPosition)
      );
      nextPosition += 1;
    });

    db.prepare('UPDATE questions SET updated_at = ? WHERE id = ?').run(now(), question.id);
    return question;
  })();
}

function getTestWithAttemptQuestions(db, attemptId, options = {}) {
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  if (!attempt) {
    return null;
  }

  ensureAttemptQuestionAssignments(db, attempt);
  const test = getTest(db, attempt.test_id);
  if (!test) {
    return null;
  }

  const questions = db.prepare(`
    SELECT
      questions.*,
      questions.position AS original_position,
      attempt_questions.position AS attempt_position
    FROM attempt_questions
    INNER JOIN questions ON questions.id = attempt_questions.question_id
    WHERE attempt_questions.attempt_id = ?
    ORDER BY attempt_questions.position ASC
  `).all(attempt.id).map((question) => ({
    ...question,
    position: question.attempt_position
  }));

  test.questions = attachOptionsToQuestions(db, questions, options);
  test.assigned_question_count = test.questions.length;
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
    if (test.question_count < 1) {
      throw new Error('This test has no questions yet.');
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
      ensureAttemptQuestionAssignments(db, activeAttempt);
      return activeAttempt;
    }

    const result = db.prepare(`
      INSERT INTO attempts (test_id, exam_user_id, discord_id, normalized_discord_id, started_at, status)
      VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS')
    `).run(test.id, examUser.id, examUser.discord_id, examUser.normalized_discord_id, now());

    const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(result.lastInsertRowid);
    ensureAttemptQuestionAssignments(db, attempt);
    return attempt;
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

    ensureAttemptQuestionAssignments(db, attempt);
    const assignedQuestion = db.prepare(`
      SELECT 1
      FROM attempt_questions
      WHERE attempt_id = ? AND question_id = ?
    `).get(attempt.id, questionId);
    if (!assignedQuestion) {
      throw new Error('Question does not belong to this attempt.');
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
    let score = null;
    let scoreStatus = 'PENDING';
    let scoreFeedback = null;
    let scoredAt = null;
    let scoredBy = null;
    const answeredAt = now();

    if (question.question_type === 'MULTIPLE_CHOICE') {
      selectedOptionId = payload.selected_option_id ? Number(payload.selected_option_id) : null;
      let selectedOption = null;
      if (selectedOptionId) {
        selectedOption = db.prepare(`
          SELECT id, is_correct
          FROM question_options
          WHERE id = ? AND question_id = ?
        `).get(selectedOptionId, question.id);
        if (!selectedOption) {
          throw new Error('Selected option does not belong to this question.');
        }
      }

      score = selectedOption?.is_correct ? 1 : 0;
      scoreStatus = 'SCORED';
      scoredAt = answeredAt;
      scoredBy = 'multiple-choice';
    } else {
      essayAnswer = String(payload.essay_answer || '').slice(0, 8000);
    }

    db.prepare(`
      INSERT INTO answers (
        attempt_id,
        question_id,
        selected_option_id,
        essay_answer,
        answered_at,
        score,
        score_status,
        score_feedback,
        scored_at,
        scored_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(attempt_id, question_id) DO UPDATE SET
        selected_option_id = excluded.selected_option_id,
        essay_answer = excluded.essay_answer,
        answered_at = excluded.answered_at,
        score = excluded.score,
        score_status = excluded.score_status,
        score_feedback = excluded.score_feedback,
        scored_at = excluded.scored_at,
        scored_by = excluded.scored_by
    `).run(
      attempt.id,
      question.id,
      selectedOptionId,
      essayAnswer,
      answeredAt,
      score,
      scoreStatus,
      scoreFeedback,
      scoredAt,
      scoredBy
    );
  })();
}

function setAnswerScore(db, answerId, score, feedback, scoredBy) {
  const normalizedScore = normalizeAnswerScore(score);

  db.prepare(`
    UPDATE answers
    SET score = ?, score_status = 'SCORED', score_feedback = ?, scored_at = ?, scored_by = ?
    WHERE id = ?
  `).run(normalizedScore, String(feedback || '').slice(0, 1000), now(), String(scoredBy || 'manual').slice(0, 64), answerId);
}

function setAnswerDispute(db, answerId, message) {
  db.prepare(`
    UPDATE answers
    SET score_dispute_message = ?, score_disputed_at = ?
    WHERE id = ?
  `).run(String(message || '').trim().slice(0, 2000), now(), answerId);
}

function setAnswerScoreError(db, answerId, feedback, scoredBy = 'deepseek') {
  db.prepare(`
    UPDATE answers
    SET score = NULL, score_status = 'ERROR', score_feedback = ?, scored_at = ?, scored_by = ?
    WHERE id = ?
  `).run(String(feedback || 'Could not grade answer.').slice(0, 1000), now(), String(scoredBy).slice(0, 64), answerId);
}

function setManualAnswerScore(db, attemptId, questionId, score, feedback) {
  return db.transaction(() => {
    const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
    if (!attempt) {
      throw new Error('Attempt was not found.');
    }

    ensureAttemptQuestionAssignments(db, attempt);
    const assignedQuestion = db.prepare(`
      SELECT 1
      FROM attempt_questions
      WHERE attempt_id = ? AND question_id = ?
    `).get(attempt.id, questionId);
    if (!assignedQuestion) {
      throw new Error('Question does not belong to this attempt.');
    }

    const timestamp = now();
    db.prepare(`
      INSERT INTO answers (
        attempt_id,
        question_id,
        selected_option_id,
        essay_answer,
        answered_at,
        score,
        score_status,
        score_feedback,
        scored_at,
        scored_by
      )
      VALUES (?, ?, NULL, NULL, ?, ?, 'SCORED', ?, ?, 'manual-override')
      ON CONFLICT(attempt_id, question_id) DO UPDATE SET
        score = excluded.score,
        score_status = excluded.score_status,
        score_feedback = excluded.score_feedback,
        scored_at = excluded.scored_at,
        scored_by = excluded.scored_by
    `).run(
      attempt.id,
      questionId,
      timestamp,
      normalizeAnswerScore(score),
      String(feedback || '').trim().slice(0, 1000),
      timestamp
    );

    return db.prepare('SELECT * FROM answers WHERE attempt_id = ? AND question_id = ?').get(attempt.id, questionId);
  })();
}

function getAttemptScoreSummary(db, attemptId) {
  const row = db.prepare(`
    SELECT
      COUNT(attempt_questions.question_id) AS total_questions,
      COALESCE(SUM(CASE WHEN answers.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS answered_questions,
      COALESCE(SUM(CASE WHEN answers.score_status = 'SCORED' THEN 1 ELSE 0 END), 0) AS scored_questions,
      COALESCE(SUM(CASE WHEN answers.score_status = 'ERROR' THEN 1 ELSE 0 END), 0) AS grading_error_count,
      COALESCE(SUM(CASE WHEN answers.score_status = 'SCORED' THEN answers.score ELSE 0 END), 0) AS earned_score
    FROM attempt_questions
    LEFT JOIN answers
      ON answers.attempt_id = attempt_questions.attempt_id
     AND answers.question_id = attempt_questions.question_id
    WHERE attempt_questions.attempt_id = ?
  `).get(attemptId);

  const total = Number(row?.total_questions || 0);
  const earned = Number(row?.earned_score || 0);
  const scored = Number(row?.scored_questions || 0);
  const pending = Math.max(0, total - scored);
  const percent = total ? Math.round((earned / total) * 1000) / 10 : null;

  return {
    score_earned: earned,
    score_total: total,
    score_percent: percent,
    score_answered_count: Number(row?.answered_questions || 0),
    score_scored_count: scored,
    score_pending_count: pending,
    score_error_count: Number(row?.grading_error_count || 0)
  };
}

function decorateAttemptWithScore(db, attempt) {
  if (!attempt) {
    return attempt;
  }

  return Object.assign(attempt, getAttemptScoreSummary(db, attempt.id));
}

function decorateAttemptsWithScores(db, attempts) {
  return attempts.map((attempt) => decorateAttemptWithScore(db, attempt));
}

function backfillMultipleChoiceScores(db) {
  const rows = db.prepare(`
    SELECT answers.id, answers.answered_at, COALESCE(question_options.is_correct, 0) AS is_correct
    FROM answers
    INNER JOIN questions ON questions.id = answers.question_id
    LEFT JOIN question_options ON question_options.id = answers.selected_option_id
    WHERE questions.question_type = 'MULTIPLE_CHOICE'
      AND (answers.score_status IS NULL OR answers.score_status != 'SCORED')
  `).all();

  const update = db.prepare(`
    UPDATE answers
    SET score = ?, score_status = 'SCORED', score_feedback = NULL, scored_at = ?, scored_by = 'multiple-choice'
    WHERE id = ?
  `);

  rows.forEach((row) => {
    update.run(row.is_correct ? 1 : 0, row.answered_at || now(), row.id);
  });
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

  ensureAttemptQuestionAssignments(db, attempt);

  db.prepare(`
    UPDATE attempts
    SET status = 'SUBMITTED', submitted_at = ?
    WHERE id = ?
  `).run(now(), attempt.id);

  return getAttemptForUser(db, attemptId, discordId);
}

function getAttemptAnswerReview(db, attemptId) {
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  if (!attempt) {
    return [];
  }

  ensureAttemptQuestionAssignments(db, attempt);
  return db.prepare(`
    SELECT
      attempt_questions.position,
      questions.id AS question_id,
      questions.position AS original_position,
      questions.question_text,
      questions.sample_answer,
      questions.question_type,
      selected.option_text AS selected_option,
      selected.is_correct AS selected_is_correct,
      answers.id AS answer_id,
      answers.essay_answer,
      answers.answered_at,
      answers.score,
      answers.score_status,
      answers.score_feedback,
      answers.scored_at,
      answers.scored_by,
      answers.score_dispute_message,
      answers.score_disputed_at,
      (
        SELECT GROUP_CONCAT(option_text, ', ')
        FROM question_options
        WHERE question_options.question_id = questions.id AND is_correct = 1
      ) AS correct_options
    FROM attempt_questions
    INNER JOIN questions ON questions.id = attempt_questions.question_id
    LEFT JOIN answers ON answers.question_id = questions.id AND answers.attempt_id = attempt_questions.attempt_id
    LEFT JOIN question_options selected ON selected.id = answers.selected_option_id
    WHERE attempt_questions.attempt_id = ?
    ORDER BY attempt_questions.position ASC
  `).all(attempt.id);
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
  updateQuestionOptions,
  getTestWithAttemptQuestions,
  createOrResumeAttempt,
  getAttemptForUser,
  getAttemptAnswers,
  saveAnswer,
  setAnswerScore,
  setAnswerDispute,
  setAnswerScoreError,
  setManualAnswerScore,
  submitAttempt,
  getAttemptAnswerReview,
  getAttemptScoreSummary,
  decorateAttemptWithScore,
  decorateAttemptsWithScores,
  resetAttempt
};
