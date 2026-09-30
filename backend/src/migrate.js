import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

try {
  const schemaUrl = new URL('../schema.sql', import.meta.url);
  const schema = await readFile(fileURLToPath(schemaUrl), 'utf8');
  const statements = schema.split(';').map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await pool.query(statement);
  const result = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'students' AND column_name = 'photo_url'",
  );
  if (!result.rowCount) throw new Error('Migration verification failed: students.photo_url is missing.');
  console.log('Neon schema is ready.');
} catch (error) {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}