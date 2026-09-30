import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { apiRequest } from "./api";
import SCHOOL_LOGO from "./schoolLogo";
import StudentsPage from "./StudentsPage";
import MarksPage from "./MarksPage";
import ReportsPage from "./ReportsPage";
import GuardianPortal from "./GuardianPortal";

const SUBJECTS = [
  "English",
  "Mathematics",
  "Science",
  "Hindi",
  "Social Studies",
];
const RESULT_SECTIONS = [
  {
    title: "English",
    subjects: [
      "English Rhymes",
      "English Reading",
      "English Conversation",
      "English Handwriting",
      "English Written",
    ],
  },
  {
    title: "Hindi",
    subjects: [
      "Hindi Rhymes",
      "Hindi Reading",
      "Hindi Conversation",
      "Hindi Handwriting",
      "Hindi Written",
    ],
  },
  {
    title: "Other Subjects",
    subjects: ["Maths", "EVS", "Computer", "General Knowledge", "Drawing"],
  },
];
const RESULT_MARK_SUBJECTS = RESULT_SECTIONS.flatMap(
  (section) => section.subjects,
);
const RESULT_GRADE_SUBJECTS = [
  "Work Education",
  "Art & Craft",
  "Health & Physical Education",
  "Behaviour",
  "Neatness",
  "Punctuality",
];
const CLASSES = [
  "P.G",
  "Nursery",
  "L.K.G",
  "U.K.G",
  "Class 1",
  "Class 2",
  "Class 3",
];
const gradeFor = (score) =>
  score >= 90
    ? "A+"
    : score >= 80
      ? "A"
      : score >= 70
        ? "B"
        : score >= 60
          ? "C"
          : score >= 40
            ? "D"
            : "E";
const totalFor = (student) =>
  SUBJECTS.reduce(
    (sum, subject) => sum + (Number(student.marks[subject]) || 0),
    0,
  );
const averageFor = (student) => Number(student.resultPercentage);
const hasMarks = (student) =>
  RESULT_MARK_SUBJECTS.every(
    (subject) =>
      student.resultMarks?.[subject] !== "" &&
      student.resultMarks?.[subject] !== null &&
      Number.isFinite(Number(student.resultMarks?.[subject])),
  ) &&
  RESULT_GRADE_SUBJECTS.every((subject) =>
    Boolean(student.resultGrades?.[subject]),
  ) &&
  student.resultPercentage !== null &&
  student.resultPercentage !== undefined;
const sectionAverage = (students, section) =>
  students.length
    ? Math.round(
        students.reduce(
          (sum, student) =>
            sum +
            section.subjects.reduce(
              (sectionTotal, subject) =>
                sectionTotal + Number(student.resultMarks[subject]),
              0,
            ) /
              section.subjects.length,
          0,
        ) / students.length,
      )
    : 0;

function StaffDashboard({ onSignOut }) {
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [printStudentId, setPrintStudentId] = useState(null);
  const [view, setView] = useState("Overview");
  const [filter, setFilter] = useState("All students");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(null);
  const [marksDraft, setMarksDraft] = useState(null);
  const [assistant, setAssistant] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    {
      from: "assistant",
      text: "Hi, I'm KZ Assistant. How can I help you today?",
    },
  ]);
  const [toast, setToast] = useState("");
  const [databaseStatus, setDatabaseStatus] = useState("checking");
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let active = true;
    const checkDatabase = () =>
      apiRequest("/api/health")
        .then(({ database }) => {
          if (active)
            setDatabaseStatus(
              database === "connected" ? "connected" : "disconnected",
            );
        })
        .catch(() => {
          if (active) setDatabaseStatus("disconnected");
        });
    checkDatabase();
    const timer = setInterval(checkDatabase, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let active = true;
    apiRequest("/api/students")
      .then(({ students: loadedStudents }) => {
        if (active) setStudents(loadedStudents);
      })
      .catch((error) => {
        if (active) setToast(error.message);
      })
      .finally(() => {
        if (active) setStudentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selected =
    students.find((student) => student.id === selectedId) || students[0];
  const shown = useMemo(
    () =>
      students.filter(
        (student) =>
          (filter === "All students" ||
            (filter === "Result saved" && hasMarks(student)) ||
            (filter === "Marks pending" && !hasMarks(student))) &&
          `${student.name} ${student.studentCode} ${student.className}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [students, filter, search],
  );
  const gradedStudents = students.filter(hasMarks);
  const marksCandidates = marksDraft
    ? students.filter((student) => student.className === marksDraft.className)
    : [];
  const classAverage = gradedStudents.length
    ? gradedStudents.reduce((sum, student) => sum + averageFor(student), 0) /
      gradedStudents.length
    : null;
  const openForm = (student) =>
    setDraft(
      student
        ? { ...student }
        : {
            id: null,
            studentCode: "",
            name: "",
            className: "",
            parent: "",
            marks: Object.fromEntries(SUBJECTS.map((subject) => [subject, ""])),
            status: "Draft",
          },
    );
  const saveStudent = async (event) => {
    event.preventDefault();
    const duplicateCode = students.some(
      (student) =>
        student.studentCode.toLowerCase() ===
          draft.studentCode.trim().toLowerCase() && student.id !== draft.id,
    );
    if (duplicateCode) {
      setToast("That Student ID is already in use. Enter a unique ID.");
      return;
    }
    const payload = {
      studentCode: draft.studentCode.trim(),
      name: draft.name.trim(),
      className: draft.className,
      parent: draft.parent.trim(),
    };
    try {
      if (draft.id) {
        await apiRequest(`/api/students/${draft.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        const refreshed = await apiRequest("/api/students");
        setStudents(refreshed.students);
        setToast("Student details updated.");
      } else {
        const { student: created } = await apiRequest("/api/students", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setStudents((all) => [created, ...all]);
        setSelectedId(created.id);
        setToast(
          "Student added to the class roster. Enter marks from Examinations when ready.",
        );
      }
      setDraft(null);
    } catch (error) {
      setToast(error.message);
    }
  };
  const openMarksForm = () =>
    setMarksDraft({
      className: "",
      studentId: "",
      marks: Object.fromEntries(SUBJECTS.map((subject) => [subject, ""])),
    });
  const saveMarks = async (event) => {
    event.preventDefault();
    const studentId = marksDraft.studentId;
    try {
      await apiRequest(`/api/students/${studentId}/marks`, {
        method: "PUT",
        body: JSON.stringify({ marks: marksDraft.marks }),
      });
      const refreshed = await apiRequest("/api/students");
      setStudents(refreshed.students);
      setSelectedId(studentId);
      setMarksDraft(null);
      setToast("Marks saved to the database and report card calculated.");
    } catch (error) {
      setToast(error.message);
    }
  };
  const publish = () => {
    if (!selected) return;
    setToast(
      "Parent portal is not connected. Reports cannot be shared until the database and portal are configured.",
    );
  };
  const signOut = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch (error) {
      setToast("Signed out locally. The server session may have expired.");
    }
    onSignOut();
  };
  const sendReport = async (student) => {
    try {
      const { email } = await apiRequest(
        `/api/students/${student.id}/report/send`,
        { method: "POST" },
      );
      setToast(`Report card sent to ${email}.`);
      return true;
    } catch (error) {
      setToast(error.message);
      return false;
    }
  };
  const requestStudentPrint = useCallback((studentId) => {
    setPrintStudentId(studentId);
    setView("Marks Input");
  }, []);
  const finishStudentPrint = useCallback(() => {
    setPrintStudentId(null);
    setView("Students");
  }, []);
  const ask = async (event) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || assistantBusy) return;
    const conversation = [...messages.slice(-10), { from: "user", text }];
    setMessages(conversation);
    setQuestion("");
    setAssistantBusy(true);
    try {
      const { reply } = await apiRequest("/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ messages: conversation }),
      });
      setMessages((all) => [...all, { from: "assistant", text: reply }]);
    } catch (error) {
      setMessages((all) => [
        ...all,
        { from: "assistant", text: error.message },
      ]);
    } finally {
      setAssistantBusy(false);
    }
  };

  if (view === "Students")
    return (
      <StudentsPage
        students={students}
        setStudents={setStudents}
        loading={studentsLoading}
        onNavigate={setView}
        onSignOut={signOut}
        onSelectStudent={setSelectedId}
        onPrintResult={requestStudentPrint}
        onSendReport={sendReport}
      />
    );
  if (view === "Marks Input")
    return (
      <MarksPage
        students={students}
        setStudents={setStudents}
        onNavigate={setView}
        onSignOut={signOut}
        printStudentId={printStudentId}
        onPrintComplete={finishStudentPrint}
      />
    );
  if (view === "Reports")
    return (
      <ReportsPage
        students={students}
        loading={studentsLoading}
        onNavigate={setView}
        onSignOut={signOut}
        onSendReport={sendReport}
      />
    );

  return (
    <div className="app-shell">
      {navOpen && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className={`sidebar ${navOpen ? "sidebar-open" : ""}`}>
        <a
          className="brand"
          href="#overview"
          onClick={() => setView("Overview")}
        >
          <img
            className="brand-mark"
            src={SCHOOL_LOGO}
            alt="KID ZONE PUBLIC SCHOOL logo"
          />
          <span className="brand-name">
            KZ ONLINE<span>RESULT SYSTEM</span>
          </span>
        </a>
        <div className="school-switcher">
          <span className="school-avatar">S</span>
          <span>
            <b>School name</b>
            <small>Workspace not connected</small>
          </span>
          <span className="switch-chevron">v</span>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="main-nav" aria-label="Main navigation">
          {[
            ["Overview", "OV"],
            ["Students", "ST"],
            ["Marks Input", "MK"],
            ["Reports", "RP"],
          ].map(([label, icon]) => (
            <button
              key={label}
              className={`nav-item ${view === label ? "active" : ""}`}
              onClick={() => {
                setView(label);
                setFilter(
                  label === "Reports" ? "Result saved" : "All students",
                );
                setNavOpen(false);
              }}
            >
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
              {label === "Students" && (
                <span className="nav-count">{students.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="term-card">
            <span className={`term-dot ${databaseStatus}`} aria-hidden="true" />
            <span>
              <b>
                {databaseStatus === "checking"
                  ? "Checking database"
                  : `Database ${databaseStatus}`}
              </b>
              <small>
                {databaseStatus === "connected"
                  ? "Live connection to school records"
                  : databaseStatus === "checking"
                    ? "Checking API and database status"
                    : "API or database unavailable"}
              </small>
            </span>
          </div>
          <div className="profile-row">
            <span className="profile-avatar">KZ</span>
            <span>
              <b>Staff workspace</b>
              <small>Signed in</small>
            </span>
          </div>
          <button className="logout-button" onClick={signOut}>
            <span aria-hidden="true">↪</span> Log out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            className="hamburger"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <i />
            <i />
            <i />
          </button>
          <div className="breadcrumb">
            School / <strong>{view}</strong>
          </div>
          <div className="top-actions">
            <span className="term-label">
              Term not set <span>v</span>
            </span>
            <button className="help-link" onClick={() => setAssistant(true)}>
              <span className="help-mark">?</span> Help assistant
            </button>
            <span className="top-avatar" role="img" aria-label="User profile" />
          </div>
        </header>
        <div className="page-content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">
                SCHOOL WORKSPACE <span className="live-dot" />
              </p>
              <h1>{view === "Overview" ? "Results overview" : view}</h1>
              <p className="subheading">
                {view === "Examinations"
                  ? "Choose a class and student to enter examination marks."
                  : "Examination records will appear here when connected."}
              </p>
            </div>
            {view === "Examinations" ? (
              <button className="primary-button" onClick={openMarksForm}>
                <span className="button-plus">+</span> Enter marks
              </button>
            ) : (
              <button className="primary-button" onClick={() => openForm(null)}>
                <span className="button-plus">+</span> Add student
              </button>
            )}
          </section>
          <section className="metric-grid" aria-label="Examination summary">
            <Metric
              label="Total students"
              value={students.length}
              trend="Across P.G to Class 3"
              accent="mint"
              icon="01"
            />
            <Metric
              label="Class average"
              value={
                classAverage === null ? "--" : `${classAverage.toFixed(2)}%`
              }
              trend={
                gradedStudents.length
                  ? `${gradedStudents.length} saved results`
                  : "No results saved yet"
              }
              accent="blue"
              icon="%"
            />
            <Metric
              label="Results saved"
              value={`${gradedStudents.length} / ${students.length}`}
              trend={
                students.length
                  ? `${students.length - gradedStudents.length} marks pending`
                  : "No students yet"
              }
              accent="peach"
              icon="✓"
            />
            <Metric
              label="Top grade"
              value={
                gradedStudents.length
                  ? gradeFor(Math.max(...gradedStudents.map(averageFor)))
                  : "--"
              }
              trend={
                gradedStudents.length
                  ? "Based on saved percentages"
                  : "No grades yet"
              }
              accent="yellow"
              icon="A+"
            />
          </section>
          <section className="insight-row">
            <div className="chart-panel">
              <div className="panel-heading">
                <div>
                  <h2>Class performance</h2>
                  <p>Average marks by subject group</p>
                </div>
                <span className="chart-period">SAVED RESULTS</span>
              </div>
              <div className="chart-area">
                <div className="chart-scale">
                  <span>100</span>
                  <span>75</span>
                  <span>50</span>
                  <span>25</span>
                  <span>0</span>
                </div>
                <div className="chart-gridlines">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="bar-set">
                  {RESULT_SECTIONS.map((section, index) => {
                    const score = sectionAverage(gradedStudents, section);
                    return (
                      <div className="bar-column" key={section.title}>
                        <span className="bar-value">
                          {gradedStudents.length ? score : "--"}
                        </span>
                        <div
                          className={`bar bar-${index + 1}`}
                          style={{ height: `${score}%` }}
                        />
                        <span className="bar-label">{section.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="grading-panel">
              <div className="panel-heading">
                <div>
                  <h2>Grade distribution</h2>
                  <p>Completed result cards</p>
                </div>
                <button
                  className="dots-button"
                  aria-label="Grade distribution options"
                >
                  ...
                </button>
              </div>
              <div className="grade-list">
                {[
                  ["A+", "grade-green"],
                  ["A", "grade-blue"],
                  ["B", "grade-yellow"],
                  ["C", "grade-peach"],
                  ["D", "grade-peach"],
                  ["E", "grade-peach"],
                ].map(([grade, color]) => {
                  const count = gradedStudents.filter(
                    (student) => gradeFor(averageFor(student)) === grade,
                  ).length;
                  return (
                    <div className="grade-line" key={grade}>
                      <span className={`grade-pill ${color}`}>{grade}</span>
                      <div className="grade-track">
                        <span
                          style={{
                            width: `${gradedStudents.length ? (count / gradedStudents.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <b>{count}</b>
                    </div>
                  );
                })}
              </div>
              <div className="grading-foot">
                <span className="mini-check">✓</span> Calculated from saved
                result percentages
              </div>
            </div>
          </section>
          <section className="students-panel">
            <div className="students-heading">
              <div>
                <h2>
                  {view === "Reports"
                    ? "Published report cards"
                    : "Student results"}
                </h2>
                <p>Manage marks and share report cards with parents</p>
              </div>
              <button
                className="outline-button"
                onClick={() => setToast("Student list is up to date.")}
              >
                View all <span>→</span>
              </button>
            </div>
            <div className="table-tools">
              <div
                className="filter-tabs"
                role="tablist"
                aria-label="Filter students"
              >
                {["All students", "Result saved", "Marks pending"].map(
                  (item) => (
                    <button
                      key={item}
                      role="tab"
                      aria-selected={filter === item}
                      className={filter === item ? "selected" : ""}
                      onClick={() => setFilter(item)}
                    >
                      {item}
                      {item === "All students" && (
                        <span>{students.length}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
              <label className="search-box">
                <span>⌕</span>
                <input
                  aria-label="Search students"
                  placeholder="Search students..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <kbd>⌘ K</kbd>
              </label>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    <th>STUDENT ID</th>
                    <th>CLASS</th>
                    <th>AVERAGE</th>
                    <th>GRADE</th>
                    <th>REPORT STATUS</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((student, index) => (
                    <tr
                      key={student.id}
                      className={
                        selectedId === student.id ? "row-selected" : ""
                      }
                      onClick={() => setSelectedId(student.id)}
                    >
                      <td>
                        <div className="student-cell">
                          <span
                            className={`student-avatar avatar-${index % 5}`}
                          >
                            {student.name
                              .split(" ")
                              .map((part) => part[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <span>
                            <b>{student.name}</b>
                            <small>
                              {student.parent || "Parent contact not added"}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td className="muted-cell">{student.studentCode}</td>
                      <td className="muted-cell">{student.className}</td>
                      <td>
                        <strong className="score-value">
                          {hasMarks(student) ? `${averageFor(student)}%` : "--"}
                        </strong>
                      </td>
                      <td>
                        {hasMarks(student) ? (
                          <span
                            className={`table-grade grade-${gradeFor(averageFor(student)).replace("+", "plus").toLowerCase()}`}
                          >
                            {gradeFor(averageFor(student))}
                          </span>
                        ) : (
                          <span className="muted-cell">Not entered</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status ${student.status.toLowerCase()}`}
                        >
                          <i />
                          {hasMarks(student) ? student.status : "Marks pending"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="row-more"
                          aria-label={`Edit ${student.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openForm(student);
                          }}
                        >
                          ...
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length === 0 && (
                <div className="empty-state">
                  {studentsLoading
                    ? "Loading student records..."
                    : students.length
                      ? "No students match this search."
                      : "No student records yet. Add students to start the class roster."}
                </div>
              )}
            </div>
            <div className="table-footer">
              <span>
                Showing <b>{shown.length}</b> of <b>{students.length}</b>{" "}
                students
              </span>
              <div>
                <button disabled aria-label="Previous page">
                  ←
                </button>
                <button className="page-current">1</button>
                <button disabled aria-label="Next page">
                  →
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      <aside className="report-rail">
        <div className="rail-header">
          <div>
            <span className="eyebrow">QUICK PREVIEW</span>
            <h2>Report card</h2>
          </div>
          <button className="dots-button" aria-label="More report options">
            ...
          </button>
        </div>
        {selected ? (
          <>
            <div className="report-card">
              <div className="report-school">
                <div className="report-crest">S</div>
                <b>SCHOOL NAME</b>
                <span>ACADEMIC REPORT</span>
              </div>
              <div className="report-title">
                <span>ACADEMIC REPORT</span>
                <b>TERM NOT SET</b>
              </div>
              <div className="report-student">
                <div>
                  <span>STUDENT NAME</span>
                  <b>{selected.name}</b>
                </div>
                <div>
                  <span>CLASS / STUDENT ID</span>
                  <b>
                    {selected.className} / {selected.studentCode}
                  </b>
                </div>
              </div>
              <div className="report-subjects">
                <div className="report-table-head">
                  <span>SUBJECT</span>
                  <span>MARKS</span>
                  <span>GRADE</span>
                </div>
                {SUBJECTS.map((subject) => (
                  <div className="report-subject" key={subject}>
                    <span>{subject}</span>
                    <b>
                      {hasMarks(selected)
                        ? `${selected.marks[subject]}/100`
                        : "—"}
                    </b>
                    <i>
                      {hasMarks(selected)
                        ? gradeFor(Number(selected.marks[subject]))
                        : "—"}
                    </i>
                  </div>
                ))}
              </div>
              <div className="report-total">
                <div>
                  <span>TOTAL</span>
                  <b>
                    {hasMarks(selected)
                      ? `${totalFor(selected)} / 500`
                      : "Pending"}
                  </b>
                </div>
                <div>
                  <span>AVERAGE</span>
                  <b>
                    {hasMarks(selected)
                      ? `${averageFor(selected)}%`
                      : "Pending"}
                  </b>
                </div>
              </div>
              <div className="report-result">
                <span>OVERALL GRADE</span>
                <b>
                  {hasMarks(selected)
                    ? gradeFor(averageFor(selected))
                    : "Pending"}
                </b>
              </div>
              <div className="report-signatures">
                <span>Class teacher</span>
                <span>Principal</span>
              </div>
            </div>
            <div className="report-selected">
              <span className="student-avatar avatar-0">
                {selected.name
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                <b>{selected.name}</b>
                <small>
                  {selected.className} · ID {selected.studentCode}
                </small>
              </span>
            </div>
            <button
              className="print-button"
              disabled={!hasMarks(selected)}
              onClick={() => window.print()}
            >
              <span>PDF</span> Print / Save PDF
            </button>
            <button
              className="share-button"
              disabled={!hasMarks(selected)}
              onClick={publish}
            >
              <span>↗</span> Share with parent
            </button>
            <p className="delivery-note">
              <span className="secure-dot" /> Connect a parent portal to enable
              sharing
            </p>
          </>
        ) : (
          <div className="empty-state">
            No report preview yet. Student and school details will appear after
            the database is connected or a record is added.
          </div>
        )}
      </aside>

      <button
        className="assistant-fab"
        aria-label="Open help assistant"
        onClick={() => setAssistant(!assistant)}
      >
        KZ<span>?</span>
      </button>
      {assistant && (
        <section className="assistant-panel" aria-label="KZ help assistant">
          <div className="assistant-head">
            <div>
              <span className="assistant-avatar">KZ</span>
              <span>
                <b>KZ Assistant</b>
                <small>
                  <i /> {assistantBusy ? "Writing a reply" : "Ready to help"}
                </small>
              </span>
            </div>
            <button
              aria-label="Close assistant"
              onClick={() => setAssistant(false)}
            >
              ×
            </button>
          </div>
          <div className="assistant-demo-label">STAFF HELP</div>
          <div className="assistant-messages">
            {messages.map((message, index) => (
              <div
                key={`${message.from}-${index}`}
                className={`chat-message ${message.from}`}
              >
                {message.text}
              </div>
            ))}
            {assistantBusy && (
              <div className="chat-message assistant" role="status">
                KZ Assistant is thinking...
              </div>
            )}
          </div>
          <form className="assistant-form" onSubmit={ask}>
            <input
              aria-label="Ask a question"
              placeholder="Ask about students, marks, reports..."
              value={question}
              disabled={assistantBusy}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button
              aria-label="Send question"
              disabled={assistantBusy || !question.trim()}
            >
              ↑
            </button>
          </form>
          <p className="assistant-disclaimer">
            AI can make mistakes. Do not share passwords or private student
            information.
          </p>
        </section>
      )}

      {draft && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDraft(null);
          }}
        >
          <form className="marks-modal" onSubmit={saveStudent}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">STUDENT ROSTER</span>
                <h2>{draft.id ? "Edit student details" : "Add student"}</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setDraft(null)}
              >
                ×
              </button>
            </div>
            <div className="student-fields">
              <label>
                Student name
                <input
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  placeholder="Enter full name"
                />
              </label>
              <label>
                Unique student ID
                <input
                  required
                  value={draft.studentCode}
                  onChange={(event) =>
                    setDraft({ ...draft, studentCode: event.target.value })
                  }
                  placeholder="Enter unique ID"
                />
              </label>
              <label>
                Class
                <select
                  required
                  value={draft.className}
                  onChange={(event) =>
                    setDraft({ ...draft, className: event.target.value })
                  }
                >
                  <option value="">Select class</option>
                  {CLASSES.map((className) => (
                    <option key={className} value={className}>
                      {className}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Parent email
                <input
                  type="email"
                  value={draft.parent}
                  onChange={(event) =>
                    setDraft({ ...draft, parent: event.target.value })
                  }
                  placeholder="Parent email address"
                />
              </label>
            </div>
            <p className="form-note">
              Marks can be entered later from Examinations after students have
              been added to the roster.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="outline-button"
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
              <button className="primary-button" type="submit">
                {draft.id ? "Save student" : "Add to roster"}
              </button>
            </div>
          </form>
        </div>
      )}
      {marksDraft && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMarksDraft(null);
          }}
        >
          <form className="marks-modal" onSubmit={saveMarks}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">EXAMINATIONS</span>
                <h2>Enter student marks</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setMarksDraft(null)}
              >
                ×
              </button>
            </div>
            <div className="student-fields">
              <label>
                Class
                <select
                  required
                  value={marksDraft.className}
                  onChange={(event) =>
                    setMarksDraft({
                      className: event.target.value,
                      studentId: "",
                      marks: Object.fromEntries(
                        SUBJECTS.map((subject) => [subject, ""]),
                      ),
                    })
                  }
                >
                  <option value="">Select class</option>
                  {CLASSES.map((className) => (
                    <option key={className} value={className}>
                      {className}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Student
                <select
                  required
                  disabled={
                    !marksDraft.className || marksCandidates.length === 0
                  }
                  value={marksDraft.studentId}
                  onChange={(event) => {
                    const student = marksCandidates.find(
                      (candidate) => candidate.id === event.target.value,
                    );
                    setMarksDraft({
                      ...marksDraft,
                      studentId: event.target.value,
                      marks: student
                        ? { ...student.marks }
                        : Object.fromEntries(
                            SUBJECTS.map((subject) => [subject, ""]),
                          ),
                    });
                  }}
                >
                  <option value="">
                    {!marksDraft.className
                      ? "Select a class first"
                      : marksCandidates.length
                        ? "Select student"
                        : "No students in this class"}
                  </option>
                  {marksCandidates.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} · {student.studentCode}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {marksDraft.className && marksCandidates.length === 0 && (
              <p className="form-note">
                There are no students in this class yet. Add them from Students
                first.
              </p>
            )}
            <div className="marks-fields">
              <div className="marks-fields-heading">
                <b>Examination marks</b>
                <span>Out of 100 each</span>
              </div>
              {SUBJECTS.map((subject) => (
                <label key={subject}>
                  {subject}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    disabled={!marksDraft.studentId}
                    value={marksDraft.marks[subject]}
                    onChange={(event) =>
                      setMarksDraft({
                        ...marksDraft,
                        marks: {
                          ...marksDraft.marks,
                          [subject]: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            {hasMarks({ marks: marksDraft.marks }) && (
              <div className="modal-summary">
                <span>
                  Calculated total{" "}
                  <b>{totalFor({ marks: marksDraft.marks })} / 500</b>
                </span>
                <span>
                  Average grade{" "}
                  <b>{gradeFor(averageFor({ marks: marksDraft.marks }))}</b>
                </span>
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="outline-button"
                onClick={() => setMarksDraft(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={!marksDraft.studentId}
              >
                Save marks
              </button>
            </div>
          </form>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, trend, accent, icon }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${accent}`}>{icon}</div>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-trend">{trend}</span>
    </article>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [portal, setPortal] = useState(() =>
    window.location.hash === "#guardian" ? "guardian" : "staff",
  );
  useEffect(() => {
    const updatePortal = () =>
      setPortal(window.location.hash === "#guardian" ? "guardian" : "staff");
    window.addEventListener("hashchange", updatePortal);
    return () => window.removeEventListener("hashchange", updatePortal);
  }, []);
  useEffect(() => {
    if (portal === "guardian") {
      setCheckingSession(false);
      return undefined;
    }
    let active = true;
    setCheckingSession(true);
    apiRequest("/api/auth/me")
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, [portal]);
  if (portal === "guardian") return <GuardianPortal />;
  if (checkingSession)
    return (
      <main className="auth-loading" aria-label="Checking session">
        <img
          className="brand-mark"
          src={SCHOOL_LOGO}
          alt="KID ZONE PUBLIC SCHOOL logo"
        />
        <span>Loading account...</span>
      </main>
    );
  if (user) return <StaffDashboard onSignOut={() => setUser(null)} />;
  return <AuthPage onAuthenticated={setUser} />;
}

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState("signup");
  const [notice, setNotice] = useState("");

  const submitCredentials = async (event) => {
    event.preventDefault();
    setNotice("");
    const formData = new FormData(event.currentTarget);
    const requestBody = {
      email: formData.get("email"),
      password: formData.get("password"),
      ...(mode === "signup"
        ? { fullName: formData.get("fullName"), school: formData.get("school") }
        : {}),
    };
    try {
      const { user: authenticatedUser } = await apiRequest(
        `/api/auth/${mode}`,
        { method: "POST", body: JSON.stringify(requestBody) },
      );
      onAuthenticated(authenticatedUser);
    } catch (error) {
      setNotice(error.message);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <a className="auth-brand" href="#home">
          <img
            className="auth-brand-mark"
            src={SCHOOL_LOGO}
            alt="KID ZONE PUBLIC SCHOOL logo"
          />
          <span>
            KZ ONLINE<span>RESULT SYSTEM</span>
          </span>
        </a>
        <div className="auth-story-copy">
          <span className="auth-overline">SCHOOL STAFF WORKSPACE</span>
          <h1>Every student’s progress, in one place.</h1>
          <p>
            A clear path from class records to report cards, built for the
            people who help students grow.
          </p>
        </div>
        <div className="auth-report-art" aria-hidden="true">
          <div className="art-paper">
            <div className="art-heading">
              <i />
              <span />
              <span />
            </div>
            <div className="art-student-line">
              <span />
              <i />
              <i />
            </div>
            <div className="art-score-row">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="art-score-row short">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="art-grade">
              <span>TERM RESULT</span>
              <b>A</b>
            </div>
          </div>
          <div className="art-stamp">
            KZ
            <br />
            SCHOOL
            <br />
            RECORDS
          </div>
        </div>
        <div className="auth-story-footer">
          <span>
            01 <i />
          </span>
          <span>STAFF ACCESS</span>
          <span>STUDENT-FIRST RECORDS</span>
        </div>
      </section>
      <section className="auth-main">
        <div className="auth-topline">
          <span>
            <i /> STAFF PORTAL
          </span>
          <span>Secure access</span>
        </div>
        <div className="auth-form-wrap">
          <span className="auth-kicker">
            {mode === "signup" ? "GET STARTED" : "WELCOME BACK"}
          </span>
          <h2>
            {mode === "signup"
              ? "Create your account"
              : "Sign in to your account"}
          </h2>
          <p className="auth-intro">
            {mode === "signup"
              ? "Set up access for your school staff workspace."
              : "Enter your staff credentials to continue."}
          </p>
          <form className="auth-form" onSubmit={submitCredentials}>
            {mode === "signup" && (
              <>
                <label>
                  Full name
                  <input
                    name="fullName"
                    autoComplete="name"
                    placeholder="Your name"
                    required
                  />
                </label>
                <label>
                  School name
                  <input
                    name="school"
                    autoComplete="organization"
                    placeholder="Your school"
                    required
                  />
                </label>
              </>
            )}
            <label>
              Work email
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@school.edu"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                placeholder={
                  mode === "signup"
                    ? "At least 8 characters"
                    : "Enter your password"
                }
                minLength={mode === "signup" ? 8 : undefined}
                required
              />
            </label>
            {mode === "login" && (
              <button
                type="button"
                className="forgot-link"
                onClick={() =>
                  setNotice(
                    "Password reset will be available after secure account services are connected.",
                  )
                }
              >
                Forgot password?
              </button>
            )}
            <button className="auth-submit" type="submit">
              {mode === "signup" ? "Create staff account" : "Sign in"}
              <span>→</span>
            </button>
          </form>
          <div className="auth-switch">
            {mode === "signup"
              ? "Already have an account?"
              : "New to KZ Online Result System?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setNotice("");
              }}
            >
              {mode === "signup" ? "Sign in" : "Create an account"}
            </button>
          </div>
          {notice && (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          )}
          <p className="auth-setup-note">
            Secure signup and login will be available when account services are
            connected.
          </p>
        </div>
        <footer className="auth-footer">
          <span>© KZ ONLINE RESULT SYSTEM</span>
          <span>STAFF PORTAL · ACCOUNT SERVICES PENDING</span>
        </footer>
      </section>
    </main>
  );
}

export { StaffDashboard };
export default App;
