import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Copy backend/.env.example to backend/.env and add your Neon connection string.');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });