import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { pool } from './db.js';
import { answerGuardianQuestion, answerStaffQuestion, assistantErrorMessage } from './assistant.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET;
const cookieName = 'kz_staff_session';
const classNames = new Set(['P.G', 'Nursery', 'L.K.G', 'U.K.G', 'Class 1', 'Class 2', 'Class 3']);
const subjects = ['English', 'Mathematics', 'Science', 'Hindi', 'Social Studies'];
const resultMarkSubjects = [
  'English Rhymes', 'English Reading', 'English Conversation', 'English Handwriting', 'English Written',
  'Hindi Rhymes', 'Hindi Reading', 'Hindi Conversation', 'Hindi Handwriting', 'Hindi Written',
  'Maths', 'EVS', 'Computer', 'General Knowledge', 'Drawing',
];
const resultGradeSubjects = ['Work Education', 'Art & Craft', 'Health & Physical Education', 'Behaviour', 'Neatness', 'Punctuality'];
const resultGrades = new Set(['A+', 'A', 'B', 'C', 'D', 'E']);
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
}

app.disable('x-powered-by');
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '600kb' }));
app.use(cookieParser());

app.get('/', (_req, res) => {
  res.redirect(302, process.env.FRONTEND_ORIGIN || 'http://localhost:3000');
});

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

function createSession(user) {
  return jwt.sign({ sub: user.id, schoolId: user.school_id, role: user.role }, jwtSecret, { expiresIn: '8h' });
}

function requireStaff(req, res, next) {
  try {
    const token = req.cookies[cookieName];
    if (!token) return res.status(401).json({ error: 'Sign in required.' });
    req.staff = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.clearCookie(cookieName, cookieOptions);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

const assistantRequestWindows = new Map();
const guardianAssistantRequestWindows = new Map();

app.post('/api/assistant/chat', requireStaff, async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: 'KZ Assistant needs to be configured by the administrator.' });
  }
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 12
    || messages.some((message) => !message || !['assistant', 'user'].includes(message.from)
      || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 3000)
    || messages.reduce((length, message) => length + (typeof message?.text === 'string' ? message.text.length : 0), 0) > 9000) {
    return res.status(400).json({ error: 'Send a short question to KZ Assistant.' });
  }

  const now = Date.now();
  const window = assistantRequestWindows.get(req.staff.sub);
  if (window && now - window.startedAt < 60_000 && window.count >= 12) {
    return res.status(429).json({ error: 'Please wait a minute before asking KZ Assistant again.' });
  }
  assistantRequestWindows.set(req.staff.sub, window && now - window.startedAt < 60_000
    ? { ...window, count: window.count + 1 }
    : { startedAt: now, count: 1 });

  try {
    const reply = await answerStaffQuestion(messages.slice(-12));
    res.json({ reply });
  } catch (error) {
    console.error('KZ Assistant request failed:', error.status || error.code || error.name);
    res.status(error.code === 'credit_balance_exhausted' || error.code === 'insufficient_quota' || error.status === 402 ? 503 : 502)
      .json({ error: assistantErrorMessage(error) });
  }
});

app.post('/api/guardian/assistant/chat', async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: 'The guardian help assistant is not configured. Ask the school administrator for help.' });
  }
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 10
    || messages.some((message) => !message || !['assistant', 'user'].includes(message.from)
      || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 2000)
    || messages.reduce((length, message) => length + (typeof message?.text === 'string' ? message.text.length : 0), 0) > 6000) {
    return res.status(400).json({ error: 'Please ask a short question about the guardian portal or report card.' });
  }

  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const window = guardianAssistantRequestWindows.get(key);
  if (window && now - window.startedAt < 60_000 && window.count >= 12) {
    return res.status(429).json({ error: 'The help assistant is busy. Please wait a minute before trying again.' });
  }
  guardianAssistantRequestWindows.set(key, window && now - window.startedAt < 60_000
    ? { ...window, count: window.count + 1 }
    : { startedAt: now, count: 1 });

  try {
    const reply = await answerGuardianQuestion(messages.slice(-10));
    res.json({ reply });
  } catch (error) {
    console.error('Guardian assistant request failed:', error.status || error.code || error.name);
    res.status(error.code === 'credit_balance_exhausted' || error.code === 'insufficient_quota' || error.status === 402 ? 503 : 502)
      .json({ error: assistantErrorMessage(error) });
  }
});

function validateStudent(body) {
  const studentCode = typeof body.studentCode === 'string' ? body.studentCode.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const className = typeof body.className === 'string' ? body.className : '';
  const parent = typeof body.parent === 'string' ? body.parent.trim() : '';
  const photoUrl = typeof body.photoUrl === 'string' ? body.photoUrl : null;
  if (!studentCode || studentCode.length > 40) return 'Student ID is required and must be at most 40 characters.';
  if (!name || name.length > 160) return 'Student name is required and must be at most 160 characters.';
  if (!classNames.has(className)) return 'Select a valid class.';
  if (parent.length > 254 || (parent && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent))) return 'Enter a valid parent email address.';
  if (photoUrl && (photoUrl.length > 400000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photoUrl))) return 'Choose a valid image smaller than 400 KB.';
  return { studentCode, name, className, parent: parent || null, photoUrl };
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.post('/api/auth/signup', async (req, res, next) => {
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const schoolName = typeof req.body.school === 'string' ? req.body.school.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!fullName || fullName.length > 160 || !schoolName || schoolName.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: 'Enter a name, school, valid email, and password of at least 8 characters.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const school = await client.query('INSERT INTO schools (name) VALUES ($1) RETURNING id', [schoolName]);
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await client.query(
      'INSERT INTO staff_users (school_id, full_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, school_id, full_name, email, role',
      [school.rows[0].id, fullName, email, passwordHash],
    );
    await client.query('INSERT INTO exams (school_id) VALUES ($1)', [school.rows[0].id]);
    await client.query('COMMIT');
    res.cookie(cookieName, createSession(user.rows[0]), { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });
    res.status(201).json({ user: { id: user.rows[0].id, name: user.rows[0].full_name, email: user.rows[0].email, school: schoolName, role: user.rows[0].role } });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    next(error);
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  try {
    const result = await pool.query(
      'SELECT u.id, u.school_id, u.full_name, u.email, u.role, u.password_hash, s.name AS school_name FROM staff_users u JOIN schools s ON s.id = u.school_id WHERE u.email = $1',
      [email],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    res.cookie(cookieName, createSession(user), { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });
    res.json({ user: { id: user.id, name: user.full_name, email: user.email, school: user.school_name, role: user.role } });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireStaff, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT u.id, u.full_name, u.email, u.role, s.name AS school_name FROM staff_users u JOIN schools s ON s.id = u.school_id WHERE u.id = $1 AND u.school_id = $2',
      [req.staff.sub, req.staff.schoolId],
    );
    if (!result.rows[0]) return res.status(401).json({ error: 'Staff account not found.' });
    const user = result.rows[0];
    res.json({ user: { id: user.id, name: user.full_name, email: user.email, school: user.school_name, role: user.role } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(cookieName, cookieOptions);
  res.status(204).end();
});

async function lookupGuardianResult(studentCode) {
  const result = await pool.query(
    `SELECT s.student_code AS "studentCode", s.full_name AS name,
        s.class_name AS "className", school.name AS "schoolName",
        COALESCE(s.photo_url, '') AS "photoUrl",
        COALESCE(s.father_name, '') AS "fatherName",
        COALESCE(s.mother_name, '') AS "motherName",
        exam.name AS "examName", exam.term,
        COALESCE(card.marks, '{}'::jsonb) AS "resultMarks",
        COALESCE(card.grades, '{}'::jsonb) AS "resultGrades",
        card.total_marks AS "resultTotal",
        card.percentage AS "resultPercentage",
        card.updated_at AS "resultUpdatedAt",
        (
          SELECT previous_card.percentage
          FROM student_result_cards previous_card
          JOIN exams previous_exam ON previous_exam.id = previous_card.exam_id
          WHERE previous_card.student_id = s.id
            AND previous_exam.school_id = s.school_id
            AND (exam.id IS NULL OR previous_exam.id <> exam.id)
            AND previous_exam.created_at < COALESCE(exam.created_at, NOW())
          ORDER BY previous_exam.created_at DESC
          LIMIT 1
        ) AS "previousResultPercentage"
       FROM students s
       JOIN schools school ON school.id = s.school_id
       LEFT JOIN exams exam ON exam.school_id = s.school_id AND exam.is_active = TRUE
       LEFT JOIN student_result_cards card ON card.exam_id = exam.id AND card.student_id = s.id
       WHERE LOWER(s.student_code) = LOWER($1)
       ORDER BY school.created_at, s.created_at
       LIMIT 2`,
    [studentCode],
  );
  if (result.rows.length > 1) return { ambiguous: true };
  return { student: result.rows[0] || null };
}

async function handleGuardianLookup(req, res, next, studentCode) {
  if (typeof studentCode !== 'string' || !/^[a-z0-9.-]{1,40}$/i.test(studentCode.trim())) {
    return res.status(400).json({ error: 'Enter the student ID provided by the school.' });
  }
  try {
    const result = await lookupGuardianResult(studentCode.trim());
    if (result.ambiguous) return res.status(409).json({ error: 'This student ID is not unique. Please contact the school office.' });
    if (!result.student) return res.status(404).json({ error: 'Student ID not found. Check the ID or contact the school office.' });
    res.json({ student: result.student });
  } catch (error) {
    next(error);
  }
}

app.post('/api/guardian/login', (req, res, next) => {
  handleGuardianLookup(req, res, next, req.body?.studentCode);
});

app.get('/api/guardian/:studentCode', (req, res, next) => {
  handleGuardianLookup(req, res, next, req.params.studentCode);
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

app.post('/api/students/:studentId/report/send', requireStaff, async (req, res, next) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_FROM) {
    return res.status(503).json({ error: 'Report email is not configured. Set SMTP_HOST, SMTP_PORT, and SMTP_FROM in the backend environment.' });
  }
  try {
    const result = await pool.query(
      `SELECT s.student_code AS "studentCode", s.full_name AS name,
          s.class_name AS "className", s.parent_email AS parent,
          COALESCE(s.father_name, '') AS "fatherName",
          COALESCE(s.mother_name, '') AS "motherName",
          school.name AS "schoolName", exam.name AS "examName", exam.term,
          card.marks AS "resultMarks", card.grades AS "resultGrades",
          card.total_marks AS "resultTotal", card.percentage AS "resultPercentage"
       FROM students s
       JOIN schools school ON school.id = s.school_id
       JOIN exams exam ON exam.school_id = s.school_id AND exam.is_active = TRUE
       JOIN student_result_cards card ON card.exam_id = exam.id AND card.student_id = s.id
       WHERE s.id = $1 AND s.school_id = $2`,
      [req.params.studentId, req.staff.schoolId],
    );
    const student = result.rows[0];
    if (!student) return res.status(404).json({ error: 'A saved result was not found for this student.' });
    if (!student.parent) return res.status(409).json({ error: 'Add a guardian email to the student record before sending.' });

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      ...(SMTP_USER && SMTP_PASS ? { auth: { user: SMTP_USER, pass: SMTP_PASS } } : {}),
    });
    const portalUrl = new URL('/#guardian', process.env.FRONTEND_ORIGIN || 'http://localhost:3000').href;
    const markRows = resultMarkSubjects.map((subject) => `<tr><td>${escapeHtml(subject)}</td><td>${escapeHtml(student.resultMarks[subject])} / 100</td></tr>`).join('');
    const gradeRows = resultGradeSubjects.map((subject) => `<tr><td>${escapeHtml(subject)}</td><td>${escapeHtml(student.resultGrades[subject])}</td></tr>`).join('');
    const details = `${escapeHtml(student.name)} (${escapeHtml(student.studentCode)}) · ${escapeHtml(student.className)}`;
    await transporter.sendMail({
      from: SMTP_FROM,
      to: student.parent,
      subject: `${student.name}'s report card from ${student.schoolName}`,
      text: `${student.name}'s ${student.examName} result is ready.\nStudent ID: ${student.studentCode}\nClass: ${student.className}\nTotal: ${student.resultTotal} / 1500\nPercentage: ${student.resultPercentage}%\n\nOpen the guardian portal: ${portalUrl}\nSign in with student ID: ${student.studentCode}`,
      html: `<main style="font-family:Arial,sans-serif;color:#263b30;max-width:680px;margin:auto"><p>${escapeHtml(student.schoolName)}</p><h1 style="font-size:22px">${escapeHtml(student.examName)} report card</h1><p>${details}</p><p>Guardian: ${escapeHtml(student.fatherName || student.motherName || 'Family')}</p><h2>Result summary</h2><p><strong>${escapeHtml(student.resultTotal)} / 1500</strong> · <strong>${escapeHtml(student.resultPercentage)}%</strong></p><h2>Subject marks</h2><table style="width:100%;border-collapse:collapse">${markRows}</table><h2>Development and conduct</h2><table style="width:100%;border-collapse:collapse">${gradeRows}</table><p style="margin-top:24px"><a href="${escapeHtml(portalUrl)}">Open guardian portal</a> and enter student ID <strong>${escapeHtml(student.studentCode)}</strong>.</p></main>`,
    });
    res.json({ sent: true, email: student.parent });
  } catch (error) {
    console.error('Report email delivery failed:', error.code || error.name);
    if (error.code || error.responseCode) return res.status(502).json({ error: 'The report email could not be delivered. Check the SMTP configuration and try again.' });
    next(error);
  }
});

app.get('/api/students', requireStaff, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.student_code AS "studentCode", s.full_name AS name, s.class_name AS "className",
        COALESCE(s.photo_url, '') AS "photoUrl",
        COALESCE(s.parent_email, '') AS parent,
        COALESCE(s.father_name, '') AS "fatherName",
        COALESCE(s.mother_name, '') AS "motherName",
        COALESCE(jsonb_object_agg(m.subject, m.score) FILTER (WHERE m.subject IS NOT NULL), '{}'::jsonb) AS marks,
        COALESCE(card.marks, '{}'::jsonb) AS "resultMarks",
        COALESCE(card.grades, '{}'::jsonb) AS "resultGrades",
        card.total_marks AS "resultTotal",
        card.percentage AS "resultPercentage",
        card.updated_at AS "resultUpdatedAt",
        (
          SELECT previous_card.percentage
          FROM student_result_cards previous_card
          JOIN exams previous_exam ON previous_exam.id = previous_card.exam_id
          WHERE previous_card.student_id = s.id
            AND previous_exam.school_id = s.school_id
            AND previous_exam.id <> e.id
            AND previous_exam.created_at < e.created_at
          ORDER BY previous_exam.created_at DESC
          LIMIT 1
        ) AS "previousResultPercentage",
        COALESCE((
          SELECT jsonb_object_agg(previous_mark.subject, previous_mark.score)
          FROM student_marks previous_mark
          JOIN exams previous_exam ON previous_exam.id = previous_mark.exam_id
          WHERE previous_mark.student_id = s.id
            AND previous_exam.id = (
              SELECT exam.id FROM exams exam
              WHERE exam.school_id = s.school_id
                AND exam.id <> e.id
                AND exam.created_at < COALESCE(e.created_at, NOW())
              ORDER BY exam.created_at DESC LIMIT 1
            )
        ), '{}'::jsonb) AS "previousMarks",
        CASE WHEN card.student_id IS NOT NULL THEN 'Result saved' ELSE 'Marks pending' END AS status
       FROM students s
       LEFT JOIN exams e ON e.school_id = s.school_id AND e.is_active = TRUE
       LEFT JOIN student_marks m ON m.exam_id = e.id AND m.student_id = s.id
      LEFT JOIN student_result_cards card ON card.exam_id = e.id AND card.student_id = s.id
       WHERE s.school_id = $1
      GROUP BY s.id, e.id, e.created_at, card.student_id, card.marks, card.grades, card.total_marks, card.percentage, card.updated_at
       ORDER BY s.class_name, s.full_name`,
      [req.staff.schoolId],
    );
    res.json({ students: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/students', requireStaff, async (req, res, next) => {
  const student = validateStudent(req.body);
  if (typeof student === 'string') return res.status(400).json({ error: student });
  try {
    const result = await pool.query(
      'INSERT INTO students (school_id, student_code, full_name, class_name, parent_email, photo_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, student_code AS "studentCode", full_name AS name, class_name AS "className", parent_email AS parent, photo_url AS "photoUrl"',
      [req.staff.schoolId, student.studentCode, student.name, student.className, student.parent, student.photoUrl],
    );
    res.status(201).json({ student: { ...result.rows[0], marks: {}, status: 'Draft' } });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That Student ID is already in use at this school.' });
    next(error);
  }
});

app.put('/api/students/:studentId', requireStaff, async (req, res, next) => {
  const student = validateStudent(req.body);
  if (typeof student === 'string') return res.status(400).json({ error: student });
  try {
    const result = await pool.query(
      'UPDATE students SET student_code = $1, full_name = $2, class_name = $3, parent_email = $4, photo_url = $5 WHERE id = $6 AND school_id = $7 RETURNING id',
      [student.studentCode, student.name, student.className, student.parent, student.photoUrl, req.params.studentId, req.staff.schoolId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Student not found.' });
    res.json({ student: { ...student, id: req.params.studentId } });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That Student ID is already in use at this school.' });
    next(error);
  }
});

app.delete('/api/students/:studentId', requireStaff, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM students WHERE id = $1 AND school_id = $2 RETURNING id', [req.params.studentId, req.staff.schoolId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Student not found.' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.put('/api/students/:studentId/marks', requireStaff, async (req, res, next) => {
  const marks = req.body.marks;
  if (!marks || subjects.some((subject) => !Number.isInteger(Number(marks[subject])) || Number(marks[subject]) < 0 || Number(marks[subject]) > 100)) {
    return res.status(400).json({ error: 'Enter a whole-number mark from 0 to 100 for every subject.' });
  }
  const client = await pool.connect();
  try {
    const studentResult = await client.query('SELECT id FROM students WHERE id = $1 AND school_id = $2', [req.params.studentId, req.staff.schoolId]);
    if (!studentResult.rowCount) return res.status(404).json({ error: 'Student not found.' });
    const examResult = await client.query('SELECT id FROM exams WHERE school_id = $1 AND is_active = TRUE', [req.staff.schoolId]);
    if (!examResult.rowCount) return res.status(409).json({ error: 'No active examination is configured.' });
    const examId = examResult.rows[0].id;
    await client.query('BEGIN');
    for (const subject of subjects) {
      await client.query(
        `INSERT INTO student_marks (exam_id, student_id, subject, score) VALUES ($1, $2, $3, $4)
         ON CONFLICT (exam_id, student_id, subject) DO UPDATE SET score = EXCLUDED.score, updated_at = NOW()`,
        [examId, req.params.studentId, subject, Number(marks[subject])],
      );
    }
    await client.query('COMMIT');
    res.json({ saved: true });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

app.put('/api/students/:studentId/result', requireStaff, async (req, res, next) => {
  const { marks, grades } = req.body;
  const fatherName = typeof req.body.fatherName === 'string' ? req.body.fatherName.trim() : '';
  const motherName = typeof req.body.motherName === 'string' ? req.body.motherName.trim() : '';
  if (fatherName.length > 160 || motherName.length > 160) return res.status(400).json({ error: 'Parent names must be 160 characters or fewer.' });
  if (!marks || resultMarkSubjects.some((subject) => marks[subject] === '' || marks[subject] === null || !Number.isFinite(Number(marks[subject])) || Number(marks[subject]) < 0 || Number(marks[subject]) > 100)) {
    return res.status(400).json({ error: 'Enter a mark from 0 to 100 for every English, Hindi, and other subject.' });
  }
  if (!grades || resultGradeSubjects.some((subject) => !resultGrades.has(grades[subject]))) {
    return res.status(400).json({ error: 'Choose a grade for every co-scholastic and discipline area.' });
  }
  const normalizedMarks = Object.fromEntries(resultMarkSubjects.map((subject) => [subject, Number(marks[subject])]));
  const normalizedGrades = Object.fromEntries(resultGradeSubjects.map((subject) => [subject, grades[subject]]));
  const totalMarks = resultMarkSubjects.reduce((total, subject) => total + normalizedMarks[subject], 0);
  const percentage = Math.round((totalMarks / (resultMarkSubjects.length * 100)) * 10000) / 100;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const student = await client.query('SELECT id FROM students WHERE id = $1 AND school_id = $2', [req.params.studentId, req.staff.schoolId]);
    if (!student.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Student not found.' });
    }
    const exam = await client.query('SELECT id FROM exams WHERE school_id = $1 AND is_active = TRUE', [req.staff.schoolId]);
    if (!exam.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No active examination is configured.' });
    }
    await client.query('UPDATE students SET father_name = $1, mother_name = $2 WHERE id = $3 AND school_id = $4', [fatherName || null, motherName || null, req.params.studentId, req.staff.schoolId]);
    await client.query(
      `INSERT INTO student_result_cards (exam_id, student_id, marks, grades, total_marks, percentage)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
       ON CONFLICT (exam_id, student_id) DO UPDATE
       SET marks = EXCLUDED.marks, grades = EXCLUDED.grades, total_marks = EXCLUDED.total_marks,
           percentage = EXCLUDED.percentage, updated_at = NOW()`,
      [exam.rows[0].id, req.params.studentId, JSON.stringify(normalizedMarks), JSON.stringify(normalizedGrades), totalMarks, percentage],
    );
    await client.query('COMMIT');
    res.json({ saved: true, totalMarks, percentage });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'A server error occurred.' });
});

const server = app.listen(port, () => console.log(`KZ API listening on port ${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => { await pool.end(); process.exit(0); }));
}