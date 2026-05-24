const {
  setAnswerScore,
  setAnswerDispute,
  setAnswerScoreError
} = require('./database');

function normalizeScore(value) {
  const numeric = Number(value);
  if (numeric >= 0.75) {
    return 1;
  }
  if (numeric >= 0.25) {
    return 0.5;
  }
  return 0;
}

function parseJsonObject(value) {
  const text = String(value || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(text);
}

async function scoreEssayWithDeepSeek(config, answer) {
  if (!config.deepseekApiKey) {
    throw new Error('DeepSeek API key is not configured.');
  }

  const disputeMessage = String(answer.dispute_message || answer.score_dispute_message || '').trim();
  const previousFeedback = String(answer.score_feedback || '').trim();
  const promptLines = [
    `Question: ${answer.question_text}`,
    `Sample answer: ${answer.sample_answer}`,
    `Student answer: ${answer.essay_answer}`
  ];

  if (disputeMessage) {
    promptLines.push(
      `Admin dispute message: ${disputeMessage}`,
      `Previous score: ${answer.score ?? 'not scored'}`,
      `Previous feedback: ${previousFeedback || 'none'}`
    );
  }

  const response = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.deepseekApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.deepseekModel,
      temperature: 0,
      max_tokens: 180,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You grade short essay answers. Return JSON only with keys score and feedback. score must be exactly 0, 0.5, or 1. Give 1 when the answer is mostly accurate, 0.5 when it is similar but incomplete or partly inaccurate, and 0 when it is wrong, empty, unrelated, or too vague. If an admin dispute message is provided, you are reviewing an appealed grade: treat the dispute as authoritative grading guidance that may clarify the rubric, explicitly address it in the feedback, and do not repeat previous feedback if the dispute changes the rationale. Keep feedback under 45 words.'
        },
        {
          role: 'user',
          content: promptLines.join('\n\n')
        }
      ]
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `DeepSeek request failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('DeepSeek response did not include grading content.');
  }

  const parsed = parseJsonObject(content);
  return {
    score: normalizeScore(parsed.score),
    feedback: String(parsed.feedback || '').slice(0, 1000)
  };
}

function getEssayAnswerForGrading(db, answerId) {
  return db.prepare(`
    SELECT
      answers.id,
      answers.essay_answer,
      answers.score,
      answers.score_status,
      answers.score_feedback,
      answers.score_dispute_message,
      attempts.status AS attempt_status,
      questions.question_text,
      questions.sample_answer
    FROM answers
    INNER JOIN attempts ON attempts.id = answers.attempt_id
    INNER JOIN questions ON questions.id = answers.question_id
    WHERE answers.id = ?
      AND questions.question_type = 'SHORT_ESSAY'
  `).get(answerId);
}

async function gradeSubmittedAttempt(db, config, attemptId, options = {}) {
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  if (!attempt || attempt.status !== 'SUBMITTED') {
    return { graded: 0, skipped: 0, errors: 0 };
  }

  const force = Boolean(options.force);
  const grader = options.gradeEssay || config.gradeEssay || scoreEssayWithDeepSeek;
  const answers = db.prepare(`
    SELECT
      answers.id,
      answers.essay_answer,
      answers.score,
      answers.score_status,
      answers.score_feedback,
      answers.score_dispute_message,
      answers.scored_by,
      questions.question_text,
      questions.sample_answer
    FROM answers
    INNER JOIN questions ON questions.id = answers.question_id
    WHERE answers.attempt_id = ?
      AND questions.question_type = 'SHORT_ESSAY'
    ORDER BY questions.position ASC, questions.id ASC
  `).all(attempt.id);

  let graded = 0;
  let skipped = 0;
  let errors = 0;

  for (const answer of answers) {
    if (answer.scored_by === 'manual-override') {
      skipped += 1;
      continue;
    }

    if (!force && answer.score_status === 'SCORED') {
      skipped += 1;
      continue;
    }

    if (!String(answer.sample_answer || '').trim()) {
      skipped += 1;
      continue;
    }

    if (!String(answer.essay_answer || '').trim()) {
      setAnswerScore(db, answer.id, 0, 'No essay answer was recorded.', 'essay-local');
      graded += 1;
      continue;
    }

    try {
      const result = await grader(config, answer);
      const scoredBy = String(answer.score_dispute_message || '').trim() ? 'deepseek-dispute' : 'deepseek';
      setAnswerScore(db, answer.id, result.score, result.feedback, scoredBy);
      graded += 1;
    } catch (error) {
      setAnswerScoreError(db, answer.id, error.message, 'deepseek');
      errors += 1;
    }
  }

  return { graded, skipped, errors };
}

async function regradeEssayAnswerWithDispute(db, config, answerId, disputeMessage, options = {}) {
  const answer = getEssayAnswerForGrading(db, answerId);
  if (!answer) {
    throw new Error('Essay answer was not found.');
  }
  if (answer.attempt_status !== 'SUBMITTED') {
    throw new Error('Only submitted attempts can be AI regraded.');
  }

  const cleanMessage = String(disputeMessage || '').trim().slice(0, 2000);
  setAnswerDispute(db, answer.id, cleanMessage);

  if (!String(answer.sample_answer || '').trim()) {
    setAnswerScoreError(db, answer.id, 'Sample answer is required before AI regrading.', 'deepseek');
    return { graded: 0, skipped: 0, errors: 1 };
  }

  if (!String(answer.essay_answer || '').trim()) {
    setAnswerScore(db, answer.id, 0, 'No essay answer was recorded.', 'essay-local');
    return { graded: 1, skipped: 0, errors: 0 };
  }

  const grader = options.gradeEssay || config.gradeEssay || scoreEssayWithDeepSeek;
  try {
    const result = await grader(config, {
      ...answer,
      dispute_message: cleanMessage
    });
    setAnswerScore(db, answer.id, result.score, result.feedback, 'deepseek-dispute');
    return { graded: 1, skipped: 0, errors: 0 };
  } catch (error) {
    setAnswerScoreError(db, answer.id, error.message, 'deepseek');
    return { graded: 0, skipped: 0, errors: 1 };
  }
}

module.exports = {
  gradeSubmittedAttempt,
  regradeEssayAnswerWithDispute,
  scoreEssayWithDeepSeek,
  normalizeScore
};
