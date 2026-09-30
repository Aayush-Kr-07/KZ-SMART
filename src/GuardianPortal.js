import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';
import SCHOOL_LOGO from './schoolLogo';
import { StudentResult } from './MarksPage';
import './GuardianPortal.css';

function hasSavedResult(student) {
  return student.resultPercentage !== null && student.resultPercentage !== undefined;
}

export default function GuardianPortal() {
  const [studentCode, setStudentCode] = useState('');
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantMessages, setAssistantMessages] = useState([
    { from: 'assistant', text: 'Hello. I can help explain the guardian portal and report card.' },
  ]);
  const [error, setError] = useState('');
  const reportRef = useRef(null);

  const refreshResult = useCallback(async (code = student?.studentCode) => {
    if (!code) return;
    setRefreshing(true);
    try {
      const { student: currentStudent } = await apiRequest(
        `/api/guardian/${encodeURIComponent(code)}`,
      );
      setStudent(currentStudent);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  }, [student?.studentCode]);

  useEffect(() => {
    if (!student?.studentCode) return undefined;
    const refresh = () => refreshResult(student.studentCode);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, [student?.studentCode, refreshResult]);

  const signIn = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { student: matchedStudent } = await apiRequest('/api/guardian/login', {
        method: 'POST',
        body: JSON.stringify({ studentCode: studentCode.trim() }),
      });
      setStudent(matchedStudent);
      setStudentCode(matchedStudent.studentCode);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    setStudent(null);
    setStudentCode('');
    setError('');
  };

  const downloadReport = async () => {
    if (!reportRef.current || downloading) return;
    setDownloading(true);
    setError('');
    try {
      const pdfModule = await import('html2pdf.js');
      const html2pdf = pdfModule.default || pdfModule;
      const filename = `${student.name}-${student.studentCode}-report-card`
        .replace(/[^a-z0-9.-]+/gi, '-')
        .toLowerCase();
      await html2pdf().set({
        margin: 8,
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      }).from(reportRef.current).save();
    } catch (downloadError) {
      setError('The PDF could not be created. Please try again or use Print.');
    } finally {
      setDownloading(false);
    }
  };

  const askAssistant = async (event) => {
    event.preventDefault();
    const text = assistantQuestion.trim();
    if (!text || assistantBusy) return;
    const conversation = [...assistantMessages.slice(-8), { from: 'user', text }];
    setAssistantMessages(conversation);
    setAssistantQuestion('');
    setAssistantBusy(true);
    try {
      const { reply } = await apiRequest('/api/guardian/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: conversation }),
      });
      setAssistantMessages((messages) => [...messages, { from: 'assistant', text: reply }]);
    } catch (assistantError) {
      setAssistantMessages((messages) => [...messages, { from: 'assistant', text: assistantError.message }]);
    } finally {
      setAssistantBusy(false);
    }
  };

  const saved = student && hasSavedResult(student);
  const currentPercentage = saved ? Number(student.resultPercentage) : 0;
  const previousPercentage = student?.previousResultPercentage;
  const growth = saved && previousPercentage !== null && previousPercentage !== undefined
    ? currentPercentage - Number(previousPercentage)
    : null;
  const resultDraft = saved ? {
    fatherName: student.fatherName,
    motherName: student.motherName,
    marks: student.resultMarks,
    grades: student.resultGrades,
  } : null;

  return <main className="guardian-page">
    <header className="guardian-topbar">
      <div className="guardian-brand">
        <img src={SCHOOL_LOGO} alt="Kid Zone Public School logo" />
        <span>KID ZONE PUBLIC SCHOOL<small>GUARDIAN PORTAL</small></span>
      </div>
    </header>

    {!student ? <section className="guardian-login-layout">
      <div className="guardian-login-copy">
        <p className="guardian-eyebrow">STUDENT RESULTS</p>
        <h1>A clearer view of every step forward.</h1>
        <p>Enter the unique student ID provided by the school to view the latest report card and progress.</p>
      </div>
      <form className="guardian-login-form" onSubmit={signIn}>
        <span className="guardian-form-kicker">GUARDIAN SIGN IN</span>
        <h2>View student record</h2>
        <label htmlFor="guardian-student-id">Unique student ID</label>
        <input
          id="guardian-student-id"
          autoComplete="username"
          autoCapitalize="characters"
          maxLength={40}
          placeholder="kzps.001"
          required
          value={studentCode}
          onChange={(event) => setStudentCode(event.target.value)}
        />
        {error && <p className="guardian-error" role="alert">{error}</p>}
        <button className="guardian-primary" type="submit" disabled={loading}>
          {loading ? 'Checking ID...' : 'View results'} <span aria-hidden="true">→</span>
        </button>
        <p className="guardian-login-note">Student IDs are issued by the school office.</p>
      </form>
    </section> : <>
      <section className="guardian-dashboard-heading">
        <div>
          <p className="guardian-eyebrow">{student.schoolName} / STUDENT RECORD</p>
          <h1>{student.name}</h1>
          <p>{student.className} <span aria-hidden="true">·</span> {student.examName || 'Current examination'}</p>
        </div>
        <div className="guardian-heading-actions">
          <span className="guardian-live"><i /> LIVE RESULT</span>
          <button className="guardian-refresh" type="button" onClick={() => refreshResult()} disabled={refreshing} aria-label="Refresh result" title="Refresh result">
            <span aria-hidden="true">↻</span> {refreshing ? 'Updating' : 'Refresh'}
          </button>
          <button className="guardian-signout" type="button" onClick={signOut}>Change student</button>
        </div>
      </section>

      <section className="guardian-student-strip" aria-label="Student information">
        <div className="guardian-student-identity">
          {student.photoUrl ? <img src={student.photoUrl} alt="" /> : <span>{student.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>}
          <div><small>STUDENT ID</small><b>{student.studentCode}</b></div>
        </div>
        <div><small>CLASS</small><b>{student.className}</b></div>
        <div><small>FATHER / GUARDIAN</small><b>{student.fatherName || 'Not provided'}</b></div>
        <div><small>MOTHER / GUARDIAN</small><b>{student.motherName || 'Not provided'}</b></div>
        <div><small>SESSION</small><b>{student.term || 'Current term'}</b></div>
      </section>

      <section className="guardian-growth" aria-labelledby="guardian-growth-title">
        <div className="guardian-growth-heading">
          <div><p className="guardian-eyebrow">ACADEMIC PROGRESS</p><h2 id="guardian-growth-title">Growth at a glance</h2></div>
          {saved && <strong>{currentPercentage.toFixed(2)}<small>%</small></strong>}
        </div>
        {saved ? <>
          <div className="guardian-progress-track" role="img" aria-label={`Current result ${currentPercentage.toFixed(2)} percent${previousPercentage === null || previousPercentage === undefined ? '' : `, previous result ${Number(previousPercentage).toFixed(2)} percent`}`}>
            <span className="guardian-progress-current" style={{ width: `${Math.max(0, Math.min(100, currentPercentage))}%` }} />
            {previousPercentage !== null && previousPercentage !== undefined && <i className="guardian-progress-previous" style={{ left: `${Math.max(0, Math.min(100, Number(previousPercentage)))}%` }} />}
          </div>
          <div className="guardian-growth-legend">
            <span><i className="guardian-legend-current" /> Current result <b>{currentPercentage.toFixed(2)}%</b></span>
            {previousPercentage !== null && previousPercentage !== undefined
              ? <span><i className="guardian-legend-previous" /> Previous <b>{Number(previousPercentage).toFixed(2)}%</b></span>
              : <span>Previous result not available</span>}
            {growth !== null && <strong className={growth > 0 ? 'guardian-growth-up' : growth < 0 ? 'guardian-growth-down' : ''}>{growth > 0 ? '+' : ''}{growth.toFixed(2)} pts</strong>}
          </div>
        </> : <p className="guardian-pending">The latest result is being prepared by the school. This page refreshes automatically.</p>}
        <p className="guardian-updated">{student.resultUpdatedAt ? `Last updated ${new Date(student.resultUpdatedAt).toLocaleString()}` : 'Waiting for the school to publish this result'} · refreshes every 30 seconds</p>
      </section>

      <section className="guardian-report-section" aria-labelledby="guardian-report-title">
        <div className="guardian-report-heading">
          <div><p className="guardian-eyebrow">OFFICIAL RECORD</p><h2 id="guardian-report-title">Report card</h2></div>
          {saved && <div className="guardian-report-actions">
            <button type="button" className="guardian-secondary" onClick={() => window.print()}>Print</button>
            <button type="button" className="guardian-primary" onClick={downloadReport} disabled={downloading}>{downloading ? 'Preparing PDF...' : 'Download PDF'}</button>
          </div>}
        </div>
        {saved ? <div ref={reportRef} className="guardian-report-preview"><StudentResult
          student={student}
          draft={resultDraft}
          totalMarks={Number(student.resultTotal)}
          percentage={currentPercentage}
          enteredCount={15}
          complete
        /></div> : <div className="guardian-report-pending">Your report card will appear here as soon as the school saves a complete result.</div>}
      </section>
      {error && <p className="guardian-refresh-error" role="status">{error}</p>}
      <footer className="guardian-footer"><span>{student.schoolName}</span><span>STUDENT ID · {student.studentCode}</span></footer>
      <div className="guardian-assistant-dock">
        {assistantOpen && <section className="guardian-assistant-panel" aria-label="Guardian help assistant">
          <header className="guardian-assistant-heading">
            <div><span className="guardian-assistant-mark">AI</span><div><b>Guardian help</b><small>Report card and portal questions</small></div></div>
            <button type="button" aria-label="Close guardian help" onClick={() => setAssistantOpen(false)}>×</button>
          </header>
          <div className="guardian-assistant-messages" aria-live="polite">
            {assistantMessages.map((message, index) => <p key={`${message.from}-${index}`} className={`guardian-assistant-message ${message.from}`}>
              {message.text}
            </p>)}
            {assistantBusy && <p className="guardian-assistant-status">Thinking...</p>}
          </div>
          <form className="guardian-assistant-form" onSubmit={askAssistant}>
            <input aria-label="Ask guardian help" placeholder="Ask about a report or result" maxLength={2000} value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} />
            <button type="submit" disabled={assistantBusy || !assistantQuestion.trim()} aria-label="Send question">Send</button>
          </form>
          <p className="guardian-assistant-privacy">Please don't include private student details.</p>
        </section>}
        <button className="guardian-assistant-toggle" type="button" aria-expanded={assistantOpen} onClick={() => setAssistantOpen((open) => !open)}>
          <span aria-hidden="true">✦</span> {assistantOpen ? 'Close help' : 'Ask AI assistant'}
        </button>
      </div>
    </>}
  </main>;
}