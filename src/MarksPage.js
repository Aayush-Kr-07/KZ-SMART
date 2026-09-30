import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from './api';
import SCHOOL_LOGO from './schoolLogo';
import './MarksPage.css';

const CLASSES = ['P.G', 'Nursery', 'L.K.G', 'U.K.G', 'Class 1', 'Class 2', 'Class 3'];
const GRADES = ['A+', 'A', 'B', 'C', 'D', 'E'];
const MARK_SECTIONS = [
  { title: 'English', subjects: ['English Rhymes', 'English Reading', 'English Conversation', 'English Handwriting', 'English Written'] },
  { title: 'Hindi', subjects: ['Hindi Rhymes', 'Hindi Reading', 'Hindi Conversation', 'Hindi Handwriting', 'Hindi Written'] },
  { title: 'Other Subjects', subjects: ['Maths', 'EVS', 'Computer', 'General Knowledge', 'Drawing'] },
];
const GRADE_SECTIONS = [
  { title: 'Co-Scholastic Areas', subjects: ['Work Education', 'Art & Craft', 'Health & Physical Education'] },
  { title: 'Discipline', subjects: ['Behaviour', 'Neatness', 'Punctuality'] },
];
const MARK_SUBJECTS = MARK_SECTIONS.flatMap((section) => section.subjects);
const GRADE_SUBJECTS = GRADE_SECTIONS.flatMap((section) => section.subjects);
const emptyMarks = () => Object.fromEntries(MARK_SUBJECTS.map((subject) => [subject, '']));
const emptyGrades = () => Object.fromEntries(GRADE_SUBJECTS.map((subject) => [subject, '']));

function createDraft(student) {
  return {
    fatherName: student.fatherName || '',
    motherName: student.motherName || '',
    marks: { ...emptyMarks(), ...(student.resultMarks || {}) },
    grades: { ...emptyGrades(), ...(student.resultGrades || {}) },
  };
}

function MarkSection({ section, marks, onChange }) {
  return <section className="mark-input-section"><h3>{section.title}</h3><div className="mark-input-list">
    {section.subjects.map((subject) => <label key={subject} className="mark-input-row"><span>{subject}</span><span className="mark-input-control"><input aria-label={`${subject} marks`} type="number" min="0" max="100" step="0.01" required value={marks[subject]} onChange={(event) => onChange(subject, event.target.value)} /><small>/ 100</small></span></label>)}
  </div></section>;
}

function GradeSection({ section, grades, onChange }) {
  return <section className="mark-input-section"><h3>{section.title}</h3><div className="mark-input-list">
    {section.subjects.map((subject) => <label key={subject} className="mark-input-row"><span>{subject}</span><select aria-label={`${subject} grade`} required value={grades[subject]} onChange={(event) => onChange(subject, event.target.value)}><option value="">Select grade</option>{GRADES.map((grade) => <option key={grade}>{grade}</option>)}</select></label>)}
  </div></section>;
}

export function StudentResult({ student, draft, totalMarks, percentage, enteredCount, complete }) {
  return <article className="result-preview" aria-label="Student result preview">
    <header className="result-school-heading"><img src={SCHOOL_LOGO} alt="Kid Zone Public School logo" /><div><h2>KID ZONE PUBLIC SCHOOL</h2><p>STUDENT ACADEMIC RESULT</p></div><span className="result-session">EXAM RESULT</span></header>
    {student && draft ? <>
      <section className="result-student-details"><div><span>STUDENT NAME</span><b>{student.name}</b></div><div><span>STUDENT ID</span><b>{student.studentCode}</b></div><div><span>CLASS</span><b>{student.className}</b></div><div><span>FATHER'S NAME</span><b>{draft.fatherName || 'Not provided'}</b></div><div><span>MOTHER'S NAME</span><b>{draft.motherName || 'Not provided'}</b></div><div><span>RESULT STATUS</span><b>{complete ? 'Complete' : 'In progress'}</b></div></section>
      <div className="result-subject-grid">{MARK_SECTIONS.map((section) => <section className="result-subject-section" key={section.title}><h3>{section.title}</h3>{section.subjects.map((subject) => <div className="result-subject-row" key={subject}><span>{subject}</span><b>{draft.marks[subject] === '' ? '--' : `${draft.marks[subject]} / 100`}</b></div>)}</section>)}</div>
      <div className="result-grade-grid">{GRADE_SECTIONS.map((section) => <section className="result-subject-section" key={section.title}><h3>{section.title}</h3>{section.subjects.map((subject) => <div className="result-subject-row" key={subject}><span>{subject}</span><b>{draft.grades[subject] || '--'}</b></div>)}</section>)}</div>
      <section className="result-summary"><div><span>TOTAL MARKS</span><b>{totalMarks.toFixed(2)} / 1500</b></div><div><span>MARKS ENTERED</span><b>{enteredCount} / 15</b></div><div><span>PERCENTAGE</span><b>{enteredCount ? `${percentage.toFixed(2)}%` : '--'}</b></div></section>
      <footer className="result-signatures"><span>Class Teacher</span><span>Principal</span></footer>
    </> : <div className="result-empty"><span>RESULT PREVIEW</span><p>Select a class and student to start a result card.</p></div>}
  </article>;
}

export default function MarksPage({ students, setStudents, onNavigate, onSignOut, printStudentId, onPrintComplete }) {
  const printStudent = students.find((item) => item.id === printStudentId);
  const [className, setClassName] = useState(printStudent?.className || '');
  const [studentId, setStudentId] = useState(printStudent?.id || '');
  const [draft, setDraft] = useState(() => printStudent ? createDraft(printStudent) : null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const classStudents = useMemo(() => students.filter((student) => student.className === className), [students, className]);
  const student = students.find((item) => item.id === studentId);
  const enteredCount = draft ? MARK_SUBJECTS.filter((subject) => draft.marks[subject] !== '' && Number.isFinite(Number(draft.marks[subject]))).length : 0;
  const totalMarks = draft ? MARK_SUBJECTS.reduce((total, subject) => total + (Number(draft.marks[subject]) || 0), 0) : 0;
  const percentage = enteredCount ? totalMarks / (enteredCount * 100) * 100 : 0;
  const complete = Boolean(draft && enteredCount === MARK_SUBJECTS.length && GRADE_SUBJECTS.every((subject) => GRADES.includes(draft.grades[subject])));

  useEffect(() => {
    if (!printStudentId || !student || !complete) return undefined;
    const handleAfterPrint = () => onPrintComplete();
    window.addEventListener('afterprint', handleAfterPrint, { once: true });
    const timer = window.setTimeout(() => window.print(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [printStudentId, student, complete, onPrintComplete]);

  const selectClass = (value) => {
    setClassName(value);
    setStudentId('');
    setDraft(null);
    setNotice('');
    setError('');
  };

  const selectStudent = (id) => {
    setStudentId(id);
    const selected = students.find((item) => item.id === id);
    setDraft(selected ? createDraft(selected) : null);
    setNotice('');
    setError('');
  };

  const saveResult = async (event) => {
    event.preventDefault();
    if (!student || !complete) return;
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      fatherName: draft.fatherName.trim(),
      motherName: draft.motherName.trim(),
      marks: Object.fromEntries(MARK_SUBJECTS.map((subject) => [subject, Number(draft.marks[subject])])),
      grades: draft.grades,
    };
    try {
      const saved = await apiRequest(`/api/students/${student.id}/result`, { method: 'PUT', body: JSON.stringify(payload) });
      setStudents((all) => all.map((item) => item.id === student.id ? {
        ...item,
        fatherName: payload.fatherName,
        motherName: payload.motherName,
        resultMarks: payload.marks,
        resultGrades: payload.grades,
        resultTotal: saved.totalMarks,
        resultPercentage: saved.percentage,
        status: 'Result saved',
      } : item));
      setNotice('Result saved for the active examination.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const updateMark = (subject, value) => setDraft((current) => ({ ...current, marks: { ...current.marks, [subject]: value } }));
  const updateGrade = (subject, value) => setDraft((current) => ({ ...current, grades: { ...current.grades, [subject]: value } }));

  return <main className="marks-page">
    <header className="marks-topbar"><a className="marks-brand" href="#marks" onClick={(event) => event.preventDefault()}><img className="marks-brand-mark" src={SCHOOL_LOGO} alt="KID ZONE PUBLIC SCHOOL logo"/><span>KZ ONLINE<small>RESULT SYSTEM</small></span></a><nav className="marks-nav" aria-label="Main navigation">{['Overview', 'Students', 'Marks Input', 'Reports'].map((item) => <button key={item} className={item === 'Marks Input' ? 'active' : ''} onClick={() => onNavigate(item)}>{item}</button>)}</nav><button className="marks-signout" onClick={onSignOut}>Log out</button></header>
    <div className="marks-content">
      <div className="marks-page-heading"><div><p className="marks-eyebrow">SCHOOL WORKSPACE / MARKS INPUT</p><h1>Marks input</h1><p>Enter subject marks and grade-based areas, then review the result card.</p></div><button className="marks-secondary" onClick={() => onNavigate('Students')}>Manage students</button></div>
      <div className="marks-workspace">
        <form className="marks-entry" onSubmit={saveResult}>
          <section className="marks-student-picker"><label>Class<select required value={className} onChange={(event) => selectClass(event.target.value)}><option value="">Select class</option>{CLASSES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Student<select required disabled={!className || !classStudents.length} value={studentId} onChange={(event) => selectStudent(event.target.value)}><option value="">{!className ? 'Select a class first' : classStudents.length ? 'Select student' : 'No students in this class'}</option>{classStudents.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.studentCode}</option>)}</select></label></section>
          {student && draft ? <>
            <section className="marks-student-fields"><div><span>STUDENT NAME</span><b>{student.name}</b></div><div><span>UNIQUE ID</span><b>{student.studentCode}</b></div><div><span>CLASS</span><b>{student.className}</b></div><label>Father's name<input maxLength="160" value={draft.fatherName} onChange={(event) => setDraft({ ...draft, fatherName: event.target.value })} /></label><label>Mother's name<input maxLength="160" value={draft.motherName} onChange={(event) => setDraft({ ...draft, motherName: event.target.value })} /></label></section>
            <div className="marks-input-grid">{MARK_SECTIONS.map((section) => <MarkSection key={section.title} section={section} marks={draft.marks} onChange={updateMark} />)}{GRADE_SECTIONS.map((section) => <GradeSection key={section.title} section={section} grades={draft.grades} onChange={updateGrade} />)}</div>
            <div className="marks-live-summary"><span>{enteredCount} of 15 marks entered</span><span>Current percentage <b>{enteredCount ? `${percentage.toFixed(2)}%` : '--'}</b></span></div>
            {error && <p className="marks-error" role="alert">{error}</p>}{notice && <p className="marks-success" role="status">{notice}</p>}
            <div className="marks-form-actions"><button type="button" className="marks-secondary" onClick={() => window.print()} disabled={!complete}>Print / Save as PDF</button><button type="submit" className="marks-primary" disabled={!complete || saving}>{saving ? 'Saving result...' : 'Save result'}</button></div>
          </> : <div className="marks-empty">{students.length ? 'Choose a class and student to enter marks.' : <>No students are on the roster yet. <button type="button" onClick={() => onNavigate('Students')}>Add a student</button></>}</div>}
        </form>
        <aside className="marks-preview-panel"><div className="marks-preview-heading"><div><p className="marks-eyebrow">LIVE PREVIEW</p><h2>Result card</h2></div><button type="button" aria-label="Print result" title="Print result" disabled={!complete} onClick={() => window.print()}>Print</button></div><StudentResult student={student} draft={draft} totalMarks={totalMarks} percentage={percentage} enteredCount={enteredCount} complete={complete} /></aside>
      </div>
    </div>
  </main>;
}