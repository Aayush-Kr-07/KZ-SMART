import React, { useMemo, useState } from 'react';
import { apiRequest } from './api';
import SCHOOL_LOGO from './schoolLogo';
import './StudentsPage.css';

const CLASSES = ['P.G', 'Nursery', 'L.K.G', 'U.K.G', 'Class 1', 'Class 2', 'Class 3'];
const SUBJECTS = ['English', 'Mathematics', 'Science', 'Hindi', 'Social Studies'];
const RESULT_MARK_SUBJECTS = ['English Rhymes', 'English Reading', 'English Conversation', 'English Handwriting', 'English Written', 'Hindi Rhymes', 'Hindi Reading', 'Hindi Conversation', 'Hindi Handwriting', 'Hindi Written', 'Maths', 'EVS', 'Computer', 'General Knowledge', 'Drawing'];
const RESULT_GRADE_SUBJECTS = ['Work Education', 'Art & Craft', 'Health & Physical Education', 'Behaviour', 'Neatness', 'Punctuality'];
const emptyMarks = () => Object.fromEntries(SUBJECTS.map((subject) => [subject, '']));
const initials = (name = '') => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
const newStudent = () => ({ id: null, studentCode: '', name: '', className: '', parent: '', photoUrl: '', marks: emptyMarks(), status: 'Draft' });
const hasSavedResult = (student) => RESULT_MARK_SUBJECTS.every((subject) => Number.isFinite(Number(student.resultMarks?.[subject])))
  && RESULT_GRADE_SUBJECTS.every((subject) => Boolean(student.resultGrades?.[subject]))
  && student.resultPercentage !== null && student.resultPercentage !== undefined;
const hasPreviousResult = (student) => student.previousResultPercentage !== null && student.previousResultPercentage !== undefined && Number.isFinite(Number(student.previousResultPercentage));

function StudentAvatar({ student, large = false }) {
  return student.photoUrl
    ? <img className={`roster-avatar${large ? ' large' : ''}`} src={student.photoUrl} alt={student.name} />
    : <span className={`roster-avatar roster-avatar-fallback${large ? ' large' : ''}`} aria-label={`${student.name} initials`}>{initials(student.name)}</span>;
}

function readPhoto(file) {
  if (!file) return Promise.resolve('');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return Promise.reject(new Error('Use a JPG, PNG, or WebP image.'));
  if (file.size > 280 * 1024) return Promise.reject(new Error('Choose an image smaller than 280 KB.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The photo could not be read.'));
    reader.readAsDataURL(file);
  });
}

export default function StudentsPage({ students, setStudents, loading, onNavigate, onSignOut, onSelectStudent, onPrintResult, onSendReport }) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('All classes');
  const [draft, setDraft] = useState(null);
  const [showPerformance, setShowPerformance] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [toast, setToast] = useState('');
  const [sendingId, setSendingId] = useState(null);
  const shownStudents = useMemo(() => students.filter((student) => (
    (classFilter === 'All classes' || student.className === classFilter)
    && `${student.name} ${student.studentCode} ${student.className}`.toLowerCase().includes(search.trim().toLowerCase())
  )), [students, classFilter, search]);
  const completedResults = students.filter(hasSavedResult);
  const classAverage = completedResults.length ? completedResults.reduce((sum, student) => sum + Number(student.resultPercentage), 0) / completedResults.length : null;

  const openForm = (student) => {
    setPhotoError('');
    setDraft(student ? { ...student } : newStudent());
  };

  const saveStudent = async (event) => {
    event.preventDefault();
    const duplicate = students.some((student) => student.id !== draft.id && student.studentCode.trim().toLowerCase() === draft.studentCode.trim().toLowerCase());
    if (duplicate) {
      setPhotoError('That student number is already in use. Enter a unique number.');
      return;
    }
    const payload = {
      studentCode: draft.studentCode.trim(),
      name: draft.name.trim(),
      className: draft.className,
      parent: draft.parent.trim(),
      photoUrl: draft.photoUrl || null,
    };
    try {
      if (draft.id) {
        await apiRequest(`/api/students/${draft.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setStudents((all) => all.map((student) => student.id === draft.id ? { ...student, ...payload } : student));
        setToast('Student details updated.');
      } else {
        const { student } = await apiRequest('/api/students', { method: 'POST', body: JSON.stringify(payload) });
        setStudents((all) => [{ ...student, marks: student.marks || emptyMarks(), previousMarks: student.previousMarks || {}, status: student.status || 'Draft' }, ...all]);
        setToast('Student added to the roster.');
      }
      setDraft(null);
    } catch (error) {
      setPhotoError(error.message);
    }
  };

  const deleteStudent = async (student) => {
    if (!window.confirm(`Delete ${student.name} and their saved marks? This cannot be undone.`)) return;
    try {
      await apiRequest(`/api/students/${student.id}`, { method: 'DELETE' });
      setStudents((all) => all.filter((item) => item.id !== student.id));
      onSelectStudent(null);
      setToast(`${student.name} was deleted.`);
    } catch (error) {
      setToast(error.message);
    }
  };

  const updatePhoto = async (event) => {
    try {
      const photoUrl = await readPhoto(event.target.files[0]);
      setDraft((current) => ({ ...current, photoUrl }));
      setPhotoError('');
    } catch (error) {
      setPhotoError(error.message);
    }
    event.target.value = '';
  };

  const sendReport = async (student) => {
    setSendingId(student.id);
    await onSendReport(student);
    setSendingId(null);
  };

  return <main className="roster-page">
    <header className="roster-topbar">
      <a className="roster-brand" href="#students" onClick={(event) => event.preventDefault()}><img className="roster-brand-mark" src={SCHOOL_LOGO} alt="KID ZONE PUBLIC SCHOOL logo"/><span>KZ ONLINE<small>RESULT SYSTEM</small></span></a>
      <nav className="roster-nav" aria-label="Main navigation">
        {['Overview', 'Students', 'Marks Input', 'Reports'].map((item) => <button key={item} className={item === 'Students' ? 'active' : ''} onClick={() => onNavigate(item)}>{item}</button>)}
      </nav>
      <button className="roster-signout" onClick={onSignOut}>Log out</button>
    </header>

    <div className="roster-content">
      <div className="roster-heading">
        <div><p className="roster-kicker">SCHOOL WORKSPACE / STUDENTS</p><h1>Student roster</h1><p>Keep student records current and review class progress.</p></div>
        <div className="roster-heading-actions"><button className="roster-secondary" onClick={() => setShowPerformance(true)}>All-student performance</button><button className="roster-primary" onClick={() => openForm(null)}>+ Add student</button></div>
      </div>

      <section className="roster-summary" aria-label="Roster summary">
        <div><span>Enrolled students</span><strong>{students.length}</strong></div>
        <div><span>Results saved</span><strong>{completedResults.length} / {students.length}</strong></div>
        <div><span>Current average</span><strong>{classAverage === null ? '--' : `${classAverage.toFixed(2)}%`}</strong></div>
      </section>

      <section className="roster-list" aria-labelledby="roster-list-title">
        <div className="roster-list-heading"><div><h2 id="roster-list-title">All students</h2><p>{shownStudents.length} shown · {students.length} total</p></div>
          <div className="roster-controls">
            <label className="roster-search"><span aria-hidden="true">⌕</span><input aria-label="Search students" placeholder="Search name or number" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label className="class-filter-label">Class<select aria-label="Filter by class" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option>All classes</option>{CLASSES.map((className) => <option key={className}>{className}</option>)}</select></label>
          </div>
        </div>
        <div className="roster-table-wrap"><table className="roster-table"><thead><tr><th>STUDENT</th><th>STUDENT NUMBER</th><th>CLASS</th><th>AVERAGE</th><th>GROWTH</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {shownStudents.map((student) => {
            const currentReady = hasSavedResult(student);
            const previousReady = hasPreviousResult(student);
            const change = currentReady && previousReady ? Number(student.resultPercentage) - Number(student.previousResultPercentage) : null;
            return <tr key={student.id}>
              <td><div className="roster-person"><StudentAvatar student={student} /><div className="roster-person-details"><b>{student.name}</b><small>{student.parent || 'Parent email not added'}</small><div className="student-result-actions"><button aria-label={`Print ${student.name} result`} disabled={!hasSavedResult(student)} title={hasSavedResult(student) ? 'Print saved result' : 'Save a complete result before printing'} onClick={() => onPrintResult(student.id)}>Print</button><button disabled={!student.parent || !hasSavedResult(student) || sendingId === student.id} title={!student.parent ? 'Add a guardian email to this student first' : !hasSavedResult(student) ? 'Save a complete result before sharing' : 'Email the saved report card to the guardian'} onClick={() => sendReport(student)}>{sendingId === student.id ? 'Sending...' : 'Send to guardian'}</button></div></div></div></td>
              <td>{student.studentCode}</td><td>{student.className}</td><td className="roster-score">{currentReady ? `${Number(student.resultPercentage).toFixed(2)}%` : 'Marks pending'}</td>
              <td>{change === null ? <span className="growth-neutral">No comparison</span> : <span className={change > 0 ? 'growth-up' : change < 0 ? 'growth-down' : 'growth-neutral'}>{change > 0 ? `↑ ${change.toFixed(2)} pts` : change < 0 ? `↓ ${Math.abs(change).toFixed(2)} pts` : '→ No change'}</span>}</td>
              <td><div className="roster-row-actions"><button aria-label={`Edit ${student.name}`} onClick={() => { onSelectStudent(student.id); openForm(student); }}>Edit</button><button className="delete-action" aria-label={`Delete ${student.name}`} onClick={() => deleteStudent(student)}>Delete</button></div></td>
            </tr>;
          })}
        </tbody></table>{shownStudents.length === 0 && <p className="roster-empty">{loading ? 'Loading student records...' : students.length ? 'No students match your search and class filters.' : 'No students yet. Add a student to start your roster.'}</p>}</div>
      </section>
    </div>

    {draft && <div className="roster-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null); }}><form className="roster-modal" role="dialog" aria-modal="true" aria-labelledby="student-form-title" onSubmit={saveStudent}>
      <div className="roster-modal-heading"><div><p className="roster-kicker">STUDENT RECORD</p><h2 id="student-form-title">{draft.id ? 'Edit student' : 'Add student'}</h2></div><button type="button" aria-label="Close" onClick={() => setDraft(null)}>×</button></div>
      <div className="roster-photo-row"><StudentAvatar student={draft} large /><div><label className="photo-picker">Change photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={updatePhoto} /></label>{draft.photoUrl && <button type="button" className="remove-photo" onClick={() => setDraft({ ...draft, photoUrl: '' })}>Remove photo</button>}<small>JPG, PNG, or WebP · max 280 KB</small></div></div>
      <div className="roster-form-fields"><label>Student name<input required maxLength="160" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Unique student ID<input required maxLength="40" placeholder="kzps.001" value={draft.studentCode} onChange={(event) => setDraft({ ...draft, studentCode: event.target.value })} /></label><label>Class<select required value={draft.className} onChange={(event) => setDraft({ ...draft, className: event.target.value })}><option value="">Select class</option>{CLASSES.map((className) => <option key={className}>{className}</option>)}</select></label><label>Parent email<input type="email" maxLength="254" value={draft.parent} onChange={(event) => setDraft({ ...draft, parent: event.target.value })} /></label></div>
      {photoError && <p className="roster-form-error" role="alert">{photoError}</p>}
      <div className="roster-modal-actions"><button type="button" className="roster-secondary" onClick={() => setDraft(null)}>Cancel</button><button className="roster-primary" type="submit">{draft.id ? 'Save changes' : 'Add student'}</button></div>
    </form></div>}

    {showPerformance && <div className="roster-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPerformance(false); }}><section className="performance-modal" role="dialog" aria-modal="true" aria-labelledby="performance-title">
      <div className="roster-modal-heading"><div><p className="roster-kicker">CLASS OUTCOMES</p><h2 id="performance-title">All-student performance</h2></div><button aria-label="Close" onClick={() => setShowPerformance(false)}>×</button></div>
      <p className="performance-explainer">Current averages are compared with each student’s previous examination average. Growth is shown only when both exams have complete marks.</p>
      <div className="performance-table-wrap"><table className="roster-table performance-table"><thead><tr><th>STUDENT</th><th>CLASS</th><th>PREVIOUS</th><th>CURRENT</th><th>CHANGE</th></tr></thead><tbody>{students.map((student) => {
        const currentReady = hasSavedResult(student);
        const previousReady = hasPreviousResult(student);
        const change = currentReady && previousReady ? Number(student.resultPercentage) - Number(student.previousResultPercentage) : null;
        return <tr key={student.id}><td><div className="roster-person"><StudentAvatar student={student} /><span><b>{student.name}</b><small>{student.studentCode}</small></span></div></td><td>{student.className}</td><td>{previousReady ? `${Number(student.previousResultPercentage).toFixed(2)}%` : '--'}</td><td>{currentReady ? `${Number(student.resultPercentage).toFixed(2)}%` : '--'}</td><td>{change === null ? <span className="growth-neutral">Not enough exam data</span> : <span className={change > 0 ? 'growth-up' : change < 0 ? 'growth-down' : 'growth-neutral'}>{change > 0 ? `↑ ${change.toFixed(2)} points` : change < 0 ? `↓ ${Math.abs(change).toFixed(2)} points` : '→ No change'}</span>}</td></tr>;
      })}</tbody></table>{students.length === 0 && <p className="roster-empty">No students to compare yet.</p>}</div>
      <div className="roster-modal-actions"><button className="roster-primary" onClick={() => setShowPerformance(false)}>Done</button></div>
    </section></div>}
    {toast && <div className="roster-toast" role="status">{toast}</div>}
  </main>;
}