# KZ Online Result API

The Express API is the only part of this app that connects to Neon. Keep `DATABASE_URL` and `JWT_SECRET` in `backend/.env`; never put either value in React environment variables or commit the `.env` file.

## Local setup

1. Copy `.env.example` to `.env` and enter the Neon connection string, a random `JWT_SECRET` of at least 32 characters, and a Groq API key as `GROQ_API_KEY`.
2. To send report cards directly, configure `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM`; add `SMTP_USER` and `SMTP_PASS` when the mail server requires authentication.
3. Install backend dependencies with `npm install` from this folder.
4. Create/update the tables with `npm run db:migrate`.
5. Start the API with `npm run dev`.
6. In another terminal, start the React app from the project root with `npm start`.

The React development server proxies `/api` requests to `http://localhost:4000`. For deployment, configure `DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY`, `GROQ_MODEL`, `FRONTEND_ORIGIN`, `PORT`, `NODE_ENV`, and the SMTP variables in the backend hosting provider. Set `REACT_APP_API_URL` to the deployed API origin only when the frontend and API use different origins. Never place the Groq or SMTP credentials in React environment variables.

## Included API

- `POST /api/auth/signup` creates a school and its first administrator.
- `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout` manage staff sessions with an HTTP-only cookie.
- `POST /api/guardian/login` and `GET /api/guardian/:studentCode` look up one student's current and previous result using the staff-entered student ID. Lookup is limited to 10 attempts per IP per 15 minutes.
- `POST /api/students/:studentId/report/send` emails the active saved report card to the guardian email on the roster and requires a staff session plus SMTP configuration.
- `GET /api/students`, `POST /api/students`, and `PUT /api/students/:studentId` manage a school-scoped roster.
- `PUT /api/students/:studentId/marks` saves marks for the active exam.
- `POST /api/assistant/chat` provides authenticated, rate-limited help grounded in the staff website guide. It does not access student records.
- `GET /api/health` checks API-to-Neon connectivity.

Staff and roster operations are isolated by the school ID in the signed session. Guardian access intentionally accepts only the student ID; anyone who knows or guesses an ID can view that student's report, so this access model is not strong authentication and should be upgraded to a PIN or one-time code before exposing sensitive records publicly. PDF download uses the browser's print-to-PDF dialog; report emails contain the result details and a guardian portal link.