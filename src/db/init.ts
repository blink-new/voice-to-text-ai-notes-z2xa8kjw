import { blink } from '../blink/client'

export const initializeDatabase = async () => {
  try {
    // Create notes table if it doesn't exist
    await blink.db.sql(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        user_id TEXT NOT NULL,
        duration INTEGER,
        audio_url TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `)

    // Create index for better performance
    await blink.db.sql(`
      CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
    `)

    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Error initializing database:', error)
  }
}