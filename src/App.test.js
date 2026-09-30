import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, { StaffDashboard } from './App';
import { apiRequest } from './api';
import html2pdf from 'html2pdf.js';

jest.mock('./api', () => ({ apiRequest: jest.fn() }));
jest.mock('html2pdf.js', () => jest.fn(() => ({
  set() { return this; },
  from() { return this; },
  save: jest.fn().mockResolvedValue(undefined),
})));

let testStudents;

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  html2pdf.mockClear();
  testStudents = [];
  apiRequest.mockImplementation(async (path, options = {}) => {
    if (path === '/api/health') return { status: 'ok', database: 'connected' };
    if (path === '/api/auth/me') throw new Error('Sign in required.');
    if (path === '/api/auth/login') throw new Error('Backend unavailable in test.');
    if (path === '/api/auth/logout') return null;
    if (path === '/api/guardian/login' && options.method === 'POST') {
      const { studentCode } = JSON.parse(options.body);
      const student = testStudents.find((item) => item.studentCode.toLowerCase() === studentCode.toLowerCase());
      if (!student) throw new Error('Student ID not found.');
      return { student: { schoolName: 'Kid Zone Public School', ...student } };
    }
    if (path.startsWith('/api/guardian/')) {
      const code = decodeURIComponent(path.split('/').at(-1));
      const student = testStudents.find((item) => item.studentCode.toLowerCase() === code.toLowerCase());
      if (!student) throw new Error('Student ID not found.');
      return { student: { schoolName: 'Kid Zone Public School', ...student } };
    }
    if (path.endsWith('/report/send') && options.method === 'POST') return { sent: true, email: 'guardian@example.com' };
    if (path === '/api/assistant/chat') return { reply: 'Open Marks Input, select the class and student, complete the fields, then save the result.' };
    if (path === '/api/students' && (!options.method || options.method === 'GET')) return { students: testStudents };
    if (path === '/api/students' && options.method === 'POST') {
      const student = { ...JSON.parse(options.body), id: 'student-uuid-1', marks: {}, status: 'Draft' };
      testStudents = [student, ...testStudents];
      return { student };
    }
    if (path.startsWith('/api/students/') && options.method === 'PUT' && !path.endsWith('/marks') && !path.endsWith('/result')) {
      const studentId = path.split('/')[3];
      const updated = JSON.parse(options.body);
      testStudents = testStudents.map((student) => student.id === studentId ? { ...student, ...updated } : student);
      return { student: updated };
    }
    if (path.startsWith('/api/students/') && options.method === 'DELETE') {
      const studentId = path.split('/')[3];
      testStudents = testStudents.filter((student) => student.id !== studentId);
      return null;
    }
    if (path.endsWith('/marks') && options.method === 'PUT') {
      const studentId = path.split('/')[3];
      testStudents = testStudents.map((student) => student.id === studentId ? { ...student, marks: JSON.parse(options.body).marks } : student);
      return { saved: true };
    }
    if (path.endsWith('/result') && options.method === 'PUT') {
      const studentId = path.split('/')[3];
      const result = JSON.parse(options.body);
      testStudents = testStudents.map((student) => student.id === studentId ? { ...student, fatherName: result.fatherName, motherName: result.motherName, resultMarks: result.marks, resultGrades: result.grades, resultTotal: 1350, resultPercentage: 90, status: 'Result saved' } : student);
      return { saved: true, totalMarks: 1350, percentage: 90 };
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
});

test('opens on signup without a workspace preview shortcut', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: /create your account/i });
  expect(screen.getAllByText(/KZ ONLINE/i).length).toBeGreaterThan(0);
  expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/school name/i)).toBeInTheDocument();
  expect(screen.queryByText(/Student results/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /workspace preview/i })).not.toBeInTheDocument();
});

test('switches to login and shows backend authentication errors', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: /create your account/i });
  await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
  expect(screen.getByRole('heading', { name: /sign in to your account/i })).toBeInTheDocument();
  expect(screen.queryByLabelText(/school name/i)).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/work email/i), 'staff@example.com');
  await userEvent.type(screen.getByLabelText(/^password$/i), 'not-a-real-password');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByRole('status')).toHaveTextContent(/Backend unavailable in test/i);
});

test('opens mobile navigation from the hamburger control', async () => {
  render(<StaffDashboard onSignOut={jest.fn()} />);
  const menuButton = screen.getByRole('button', { name: /open navigation/i });
  expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(menuButton);
  expect(screen.getByRole('button', { name: /close navigation/i })).toBeInTheDocument();
});

test('shows the live database connection state in the sidebar', async () => {
  render(<StaffDashboard onSignOut={jest.fn()} />);
  expect(await screen.findByText('Database connected')).toBeInTheDocument();
  expect(screen.getByText('Live connection to school records')).toBeInTheDocument();
});

test('shows unavailable when the database health check fails', async () => {
  const existingImplementation = apiRequest.getMockImplementation();
  apiRequest.mockImplementation((path, options) => path === '/api/health' ? Promise.reject(new Error('API unavailable')) : existingImplementation(path, options));
  render(<StaffDashboard onSignOut={jest.fn()} />);
  expect(await screen.findByText('Database disconnected')).toBeInTheDocument();
  expect(screen.getByText('API or database unavailable')).toBeInTheDocument();
});

test('KZ Assistant greets staff and answers through the authenticated chat API', async () => {
  render(<StaffDashboard onSignOut={jest.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /open help assistant/i }));
  expect(screen.getByText("Hi, I'm KZ Assistant. How can I help you today?")).toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: /ask a question/i }), 'How do I save a result?');
  await userEvent.click(screen.getByRole('button', { name: /send question/i }));
  expect(await screen.findByText(/complete the fields, then save the result/i)).toBeInTheDocument();
  const request = apiRequest.mock.calls.find(([path]) => path === '/api/assistant/chat');
  expect(request[1].method).toBe('POST');
  expect(JSON.parse(request[1].body).messages.at(-1)).toEqual({ from: 'user', text: 'How do I save a result?' });
});

test('adds a roster student, then saves a complete marks input result', async () => {
  render(<StaffDashboard onSignOut={jest.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /add student/i }));
  await userEvent.type(screen.getByLabelText(/student name/i), 'Jordan Lee');
  await userEvent.type(screen.getByLabelText(/unique student id/i), 'KZ-1001');
  await userEvent.selectOptions(screen.getByLabelText(/^class$/i), 'Class 2');
  await userEvent.click(screen.getByRole('button', { name: /add to roster/i }));

  expect((await screen.findAllByText('Jordan Lee')).length).toBeGreaterThan(0);
  expect(screen.getByText('Not entered')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /marks input/i }));
  await userEvent.selectOptions(screen.getByLabelText(/^class$/i), 'Class 2');
  const studentSelect = screen.getByLabelText(/^student$/i);
  await userEvent.selectOptions(studentSelect, screen.getByRole('option', { name: /Jordan Lee · KZ-1001/i }).value);
  await userEvent.type(screen.getByLabelText(/father's name/i), 'Alex Lee');
  await userEvent.type(screen.getByLabelText(/mother's name/i), 'Taylor Lee');
  for (const subject of ['English Rhymes', 'English Reading', 'English Conversation', 'English Handwriting', 'English Written', 'Hindi Rhymes', 'Hindi Reading', 'Hindi Conversation', 'Hindi Handwriting', 'Hindi Written', 'Maths', 'EVS', 'Computer', 'General Knowledge', 'Drawing']) {
    await userEvent.type(screen.getByLabelText(`${subject} marks`), '90');
  }
  for (const subject of ['Work Education', 'Art & Craft', 'Health & Physical Education', 'Behaviour', 'Neatness', 'Punctuality']) {
    await userEvent.selectOptions(screen.getByLabelText(`${subject} grade`), 'A');
  }
  expect(screen.getAllByText('90.00%')).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: /save result/i }));
  expect(await screen.findByRole('status')).toHaveTextContent(/result saved/i);
  expect(apiRequest).toHaveBeenCalledWith('/api/students/student-uuid-1/result', expect.objectContaining({ method: 'PUT' }));
  await userEvent.click(screen.getByRole('button', { name: /^overview$/i }));
  expect(await screen.findByText('Results saved')).toBeInTheDocument();
  expect(screen.getByText('Results saved').parentElement.querySelector('.metric-value')).toHaveTextContent('1 / 1');
  expect(screen.getAllByText('90.00%').length).toBeGreaterThan(0);
  expect(screen.getByText('Result saved', { selector: '.status' })).toBeInTheDocument();
}, 20000);

test('filters students by class and search, edits a record, and opens growth comparison', async () => {
  const markSubjects = ['English Rhymes', 'English Reading', 'English Conversation', 'English Handwriting', 'English Written', 'Hindi Rhymes', 'Hindi Reading', 'Hindi Conversation', 'Hindi Handwriting', 'Hindi Written', 'Maths', 'EVS', 'Computer', 'General Knowledge', 'Drawing'];
  const gradeSubjects = ['Work Education', 'Art & Craft', 'Health & Physical Education', 'Behaviour', 'Neatness', 'Punctuality'];
  testStudents = [
    { id: 'student-1', name: 'Jordan Lee', studentCode: 'KZ-1001', className: 'Class 2', parent: '', marks: {}, previousMarks: {}, resultMarks: Object.fromEntries(markSubjects.map((subject) => [subject, 90])), resultGrades: Object.fromEntries(gradeSubjects.map((subject) => [subject, 'A'])), resultPercentage: 90, previousResultPercentage: 70, status: 'Result saved' },
    { id: 'student-2', name: 'Sam Rivera', studentCode: 'KZ-1002', className: 'Class 1', parent: '', marks: {}, previousMarks: {}, status: 'Draft' },
  ];
  render(<StaffDashboard onSignOut={jest.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /students/i }));
  await userEvent.selectOptions(screen.getByLabelText(/filter by class/i), 'Class 2');
  expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
  expect(screen.queryByText('Sam Rivera')).not.toBeInTheDocument();
  await userEvent.clear(screen.getByRole('textbox', { name: /search students/i }));
  await userEvent.type(screen.getByRole('textbox', { name: /search students/i }), 'KZ-1001');
  expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
  expect(screen.getByText('Results saved').parentElement).toHaveTextContent('1 / 2');
  expect(screen.getByText('Jordan Lee').closest('tr')).toHaveTextContent('90.00%');
  await userEvent.click(screen.getByRole('button', { name: /edit jordan lee/i }));
  await userEvent.clear(screen.getByLabelText(/student name/i));
  await userEvent.type(screen.getByLabelText(/student name/i), 'Jordan Park');
  await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
  expect(await screen.findByText('Jordan Park')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /all-student performance/i }));
  expect(screen.getByRole('heading', { name: /all-student performance/i })).toBeInTheDocument();
  expect(screen.getByText(/↑ 20\.00 points/i)).toBeInTheDocument();
});

test('offers print and one-click guardian report delivery beside a saved student', async () => {
  const markSubjects = ['English Rhymes', 'English Reading', 'English Conversation', 'English Handwriting', 'English Written', 'Hindi Rhymes', 'Hindi Reading', 'Hindi Conversation', 'Hindi Handwriting', 'Hindi Written', 'Maths', 'EVS', 'Computer', 'General Knowledge', 'Drawing'];
  const gradeSubjects = ['Work Education', 'Art & Craft', 'Health & Physical Education', 'Behaviour', 'Neatness', 'Punctuality'];
  testStudents = [{
    id: 'student-print-1',
    name: 'Jordan Lee',
    studentCode: 'KZ-1001',
    className: 'Class 2',
    parent: 'guardian@example.com',
    marks: {},
    previousMarks: {},
    resultMarks: Object.fromEntries(markSubjects.map((subject) => [subject, 90])),
    resultGrades: Object.fromEntries(gradeSubjects.map((subject) => [subject, 'A'])),
    resultTotal: 1350,
    resultPercentage: 90,
    status: 'Draft',
  }];
  const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});
  render(<StaffDashboard onSignOut={jest.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /students/i }));
  await userEvent.click(await screen.findByRole('button', { name: /send to guardian/i }));
  expect(apiRequest).toHaveBeenCalledWith('/api/students/student-print-1/report/send', { method: 'POST' });
  await userEvent.click(screen.getByRole('button', { name: /print jordan lee result/i }));
  await screen.findByRole('heading', { name: /marks input/i });
  await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  printSpy.mockRestore();
});

test('reports page displays saved result data and filters pending reports', async () => {
  const markSubjects = ['English Rhymes', 'English Reading', 'English Conversation', 'English Handwriting', 'English Written', 'Hindi Rhymes', 'Hindi Reading', 'Hindi Conversation', 'Hindi Handwriting', 'Hindi Written', 'Maths', 'EVS', 'Computer', 'General Knowledge', 'Drawing'];
  const gradeSubjects = ['Work Education', 'Art & Craft', 'Health & Physical Education', 'Behaviour', 'Neatness', 'Punctuality'];
  testStudents = [
    { id: 'report-saved-1', name: 'Jordan Lee', studentCode: 'KZ-RP-1001', className: 'Class 2', parent: 'guardian@example.com', fatherName: 'Alex Lee', motherName: 'Taylor Lee', resultMarks: Object.fromEntries(markSubjects.map((subject) => [subject, 90])), resultGrades: Object.fromEntries(gradeSubjects.map((subject) => [subject, 'A'])), resultTotal: 1350, resultPercentage: 90, resultUpdatedAt: '2026-09-30T10:00:00.000Z', status: 'Result saved' },
    { id: 'report-pending-1', name: 'Sam Rivera', studentCode: 'KZ-RP-1002', className: 'Class 1', parent: '', resultMarks: {}, resultGrades: {}, resultTotal: null, resultPercentage: null, status: 'Marks pending' },
  ];
  const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});
  render(<StaffDashboard onSignOut={jest.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /reports/i }));
  expect(await screen.findByRole('heading', { name: /student reports/i })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Jordan Lee KZ-RP-1001/i }));
  expect(screen.getAllByText('1350.00 / 1500').length).toBeGreaterThan(0);
  expect(screen.getAllByText('90.00%').length).toBeGreaterThan(0);
  expect(screen.getByText('Alex Lee')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /send to guardian/i }));
  expect(apiRequest).toHaveBeenCalledWith('/api/students/report-saved-1/report/send', { method: 'POST' });
  await userEvent.click(screen.getByRole('button', { name: /print \/ save pdf/i }));
  expect(printSpy).toHaveBeenCalledTimes(1);
  await userEvent.selectOptions(screen.getByLabelText(/filter reports by status/i), 'Marks pending');
  expect(screen.getByRole('button', { name: /Sam Rivera KZ-RP-1002/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /sam rivera/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Jordan Lee KZ-RP-1001/i })).not.toBeInTheDocument();
  printSpy.mockRestore();
});

test('guardian signs in with only the student ID and sees current growth and report data', async () => {
  const markSubjects = ['English Rhymes', 'English Reading', 'English Conversation', 'English Handwriting', 'English Written', 'Hindi Rhymes', 'Hindi Reading', 'Hindi Conversation', 'Hindi Handwriting', 'Hindi Written', 'Maths', 'EVS', 'Computer', 'General Knowledge', 'Drawing'];
  const gradeSubjects = ['Work Education', 'Art & Craft', 'Health & Physical Education', 'Behaviour', 'Neatness', 'Punctuality'];
  testStudents = [{
    id: 'guardian-student-1',
    name: 'Jordan Lee',
    studentCode: 'kzps.001',
    className: 'Class 2',
    fatherName: 'Alex Lee',
    motherName: 'Taylor Lee',
    resultMarks: Object.fromEntries(markSubjects.map((subject) => [subject, 90])),
    resultGrades: Object.fromEntries(gradeSubjects.map((subject) => [subject, 'A'])),
    resultTotal: 1350,
    resultPercentage: 90,
    previousResultPercentage: 72,
    resultUpdatedAt: '2026-09-30T10:00:00.000Z',
  }];
  window.history.replaceState({}, '', '/#guardian');
  render(<App />);
  expect(await screen.findByRole('heading', { name: /view student record/i })).toBeInTheDocument();
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  await userEvent.type(screen.getByLabelText(/unique student id/i), 'KZPS.001');
  await userEvent.click(screen.getByRole('button', { name: /view results/i }));
  expect(await screen.findByRole('heading', { name: 'Jordan Lee' })).toBeInTheDocument();
  expect(screen.getAllByText('kzps.001').length).toBeGreaterThan(0);
  expect(screen.getByText('+18.00 pts')).toBeInTheDocument();
  expect(screen.getAllByText('90.00%').length).toBeGreaterThan(0);
  expect(apiRequest).toHaveBeenCalledWith('/api/guardian/login', expect.objectContaining({ method: 'POST' }));
  const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});
  await userEvent.click(screen.getByRole('button', { name: /download pdf/i }));
  await waitFor(() => expect(html2pdf).toHaveBeenCalledTimes(1));
  expect(printSpy).not.toHaveBeenCalled();
  printSpy.mockRestore();
});

test('deletes a student after confirmation', async () => {
  window.confirm = jest.fn(() => true);
  testStudents = [{ id: 'student-1', name: 'Jordan Lee', studentCode: 'KZ-1001', className: 'Class 2', parent: '', marks: {}, previousMarks: {}, status: 'Draft' }];
  render(<StaffDashboard onSignOut={jest.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /students/i }));
  await screen.findByText('Jordan Lee');
  await userEvent.click(screen.getByRole('button', { name: /delete jordan lee/i }));
  expect(await screen.findByText(/Jordan Lee was deleted/i)).toBeInTheDocument();
  expect(screen.queryByText('KZ-1001')).not.toBeInTheDocument();
});

test('logs out from the dashboard navigation', async () => {
  const onSignOut = jest.fn();
  render(<StaffDashboard onSignOut={onSignOut} />);
  await userEvent.click(screen.getByRole('button', { name: /log out/i }));
  expect(onSignOut).toHaveBeenCalledTimes(1);
});
