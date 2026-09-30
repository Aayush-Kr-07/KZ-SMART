import React, { useEffect, useMemo, useState } from 'react';
import { StudentResult } from './MarksPage';
import SCHOOL_LOGO from './schoolLogo';
import './ReportsPage.css';

const CLASSES = ['P.G', 'Nursery', 'L.K.G', 'U.K.G', 'Class 1', 'Class 2', 'Class 3'];
const MARK_SUBJECTS = ['English Rhymes', 'English Reading', 'English Conversation', 'English Handwriting', 'English Written', 'Hindi Rhymes', 'Hindi Reading', 'Hindi Conversation', 'Hindi Handwriting', 'Hindi Written', 'Maths', 'EVS', 'Computer', 'General Knowledge', 'Drawing'];
const GRADE_SUBJECTS = ['Work Education', 'Art & Craft', 'Health & Physical Education', 'Behaviour', 'Neatness', 'Punctuality'];
const isSaved = (student) => MARK_SUBJECTS.every((subject) => student.resultMarks?.[subject] !== undefined && Number.isFinite(Number(student.resultMarks[subject])))
  && GRADE_SUBJECTS.every((subject) => Boolean(student.resultGrades?.[subject]))
  && student.resultPercentage !== null && student.resultPercentage !== undefined;
const gradeFor = (percentage) => percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : percentage >= 40 ? 'D' : 'E';

function reportDraft(student) {
  return { fatherName: student.fatherName || '', motherName: student.motherName || '', marks: student.resultMarks, grades: student.resultGrades };
}

export default function ReportsPage({ students, loading, onNavigate, onSignOut, onSendReport }) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('All classes');
  const [statusFilter, setStatusFilter] = useState('All reports');
  const [sendingId, setSendingId] = useState(null);
  const [selectedId, setSelectedId] = useState(() => students.find(isSaved)?.id || students[0]?.id || '');
  const savedStudents = students.filter(isSaved);
  const classAverage = savedStudents.length
    ? savedStudents.reduce((sum, student) => sum + Number(student.resultPercentage), 0) / savedStudents.length
    : null;
  const filteredStudents = useMemo(() => students.filter((student) => (
    (classFilter === 'All classes' || student.className === classFilter)
    && (statusFilter === 'All reports' || (statusFilter === 'Results saved' ? isSaved(student) : !isSaved(student)))
    && `${student.name} ${student.studentCode} ${student.className}`.toLowerCase().includes(search.trim().toLowerCase())
  )), [students, classFilter, statusFilter, search]);
  const selected = filteredStudents.find((student) => student.id === selectedId) || filteredStudents[0];
  const selectedSaved = selected && isSaved(selected);

  const sendReport = async (student) => {
    setSendingId(student.id);
    await onSendReport(student);
    setSendingId(null);
  };

  useEffect(() => {
    if (!students.some((student) => student.id === selectedId)) setSelectedId(students.find(isSaved)?.id || students[0]?.id || '');
  }, [students, selectedId]);

  return <main className="reports-page">
    <header className="reports-topbar"><a className="reports-brand" href="#reports" onClick={(event) => event.preventDefault()}><img className="reports-brand-mark" src={SCHOOL_LOGO} alt="KID ZONE PUBLIC SCHOOL logo"/><span>KZ ONLINE<small>RESULT SYSTEM</small></span></a><nav className="reports-nav" aria-label="Main navigation">{['Overview', 'Students', 'Marks Input', 'Reports'].map((item) => <button key={item} className={item === 'Reports' ? 'active' : ''} onClick={() => onNavigate(item)}>{item}</button>)}</nav><button className="reports-signout" onClick={onSignOut}>Log out</button></header>
    <div className="reports-content">
      <div className="reports-heading"><div><p className="reports-kicker">SCHOOL WORKSPACE / REPORTS</p><h1>Student reports</h1><p>Review saved results and print or email a report card.</p></div><button className="reports-primary" onClick={() => onNavigate('Marks Input')}>Enter marks</button></div>
      <section className="reports-summary" aria-label="Report summary"><div><span>Students</span><strong>{students.length}</strong></div><div><span>Results saved</span><strong>{savedStudents.length}</strong></div><div><span>Marks pending</span><strong>{students.length - savedStudents.length}</strong></div><div><span>Average result</span><strong>{classAverage === null ? '--' : `${classAverage.toFixed(2)}%`}</strong></div></section>
      <div className="reports-workspace">
        <section className="reports-list" aria-labelledby="reports-list-title">
          <div className="reports-list-heading"><div><h2 id="reports-list-title">Report records</h2><p>{filteredStudents.length} records shown</p></div>
            <div className="reports-filters"><label className="reports-search"><span aria-hidden="true">⌕</span><input aria-label="Search reports" placeholder="Search name or ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>Class<select aria-label="Filter reports by class" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option>All classes</option>{CLASSES.map((className) => <option key={className}>{className}</option>)}</select></label><label>Status<select aria-label="Filter reports by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All reports</option><option>Results saved</option><option>Marks pending</option></select></label></div>
          </div>
          <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>STUDENT</th><th>CLASS</th><th>TOTAL</th><th>PERCENTAGE</th><th>GRADE</th><th>STATUS</th></tr></thead><tbody>
            {filteredStudents.map((student) => {
              const complete = isSaved(student);
              return <tr key={student.id} className={selectedId === student.id ? 'selected' : ''}>
                <td><button className="report-student-select" onClick={() => setSelectedId(student.id)}><span className="report-student-avatar">{student.photoUrl ? <img src={student.photoUrl} alt="" /> : student.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span><b>{student.name}</b><small>{student.studentCode}</small></span></button></td>
                <td>{student.className}</td><td>{complete ? `${Number(student.resultTotal).toFixed(2)} / 1500` : '--'}</td><td className="report-percentage">{complete ? `${Number(student.resultPercentage).toFixed(2)}%` : '--'}</td><td>{complete ? gradeFor(Number(student.resultPercentage)) : '--'}</td><td><span className={`report-status ${complete ? 'saved' : 'pending'}`}>{complete ? 'Result saved' : 'Marks pending'}</span></td>
              </tr>;
            })}
          </tbody></table>{!filteredStudents.length && <p className="reports-empty">{loading ? 'Loading report records...' : students.length ? 'No reports match these filters.' : 'No students are on the roster yet.'}</p>}</div>
        </section>

        <aside className="reports-preview-panel"><div className="reports-preview-heading"><div><p className="reports-kicker">SAVED RECORD PREVIEW</p><h2>{selected?.name || 'Select a student'}</h2><p>{selected ? `${selected.className} · ${selected.studentCode}` : 'Choose a student record to preview.'}</p></div></div>
          {selectedSaved ? <>
            {selected.resultUpdatedAt && <p className="report-last-saved">Last saved {new Date(selected.resultUpdatedAt).toLocaleDateString()}</p>}
            <StudentResult student={selected} draft={reportDraft(selected)} totalMarks={Number(selected.resultTotal)} percentage={Number(selected.resultPercentage)} enteredCount={MARK_SUBJECTS.length} complete />
            <div className="reports-preview-actions"><button className="reports-primary" onClick={() => window.print()}>Print / Save PDF</button><button className="reports-secondary" disabled={!selected.parent || sendingId === selected.id} title={!selected.parent ? 'Add a guardian email in the student record first' : 'Email the saved report card to the guardian'} onClick={() => sendReport(selected)}>{sendingId === selected.id ? 'Sending...' : 'Send to guardian'}</button></div>
          </> : <div className="reports-pending-preview">{selected ? <><b>Marks pending</b><span>This student does not have a complete saved result yet.</span><button className="reports-secondary" onClick={() => onNavigate('Marks Input')}>Enter marks</button></> : <span>Select a student from the report records.</span>}</div>}
        </aside>
      </div>
    </div>
  </main>;
}