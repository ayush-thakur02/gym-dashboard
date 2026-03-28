const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'gym.sqlite');

let db;

function getDB() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

function initDB() {
    const database = getDB();

    database.exec(`
    CREATE TABLE IF NOT EXISTS members (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      Phone INTEGER UNIQUE NOT NULL,
      Emergency_Phone INTEGER DEFAULT 0,
      DOB TEXT,
      Address TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      Date TEXT NOT NULL,
      Phone INTEGER NOT NULL,
      Mode TEXT NOT NULL,
      Money INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_entry (
      Sno INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      Phone INTEGER NOT NULL,
      Date TEXT NOT NULL,
      Time TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Username TEXT UNIQUE NOT NULL,
      Password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS data_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      issue_type TEXT NOT NULL,
      field_name TEXT,
      field_value TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plans (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      amount INTEGER NOT NULL,
      duration_days INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

    // Migrate: drop UNIQUE constraint on plans.amount if it exists
    const plansInfo = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='plans'").get();
    if (plansInfo && /amount\s+INTEGER\s+NOT\s+NULL\s+UNIQUE/i.test(plansInfo.sql)) {
        database.exec(`
            CREATE TABLE plans_new (
              ID INTEGER PRIMARY KEY AUTOINCREMENT,
              label TEXT NOT NULL,
              amount INTEGER NOT NULL,
              duration_days INTEGER NOT NULL,
              category TEXT NOT NULL DEFAULT 'General',
              is_active INTEGER NOT NULL DEFAULT 1
            );
            INSERT INTO plans_new SELECT * FROM plans;
            DROP TABLE plans;
            ALTER TABLE plans_new RENAME TO plans;
        `);
        console.log('Migrated plans table: removed UNIQUE constraint on amount');
    }

    // Seed only when tables are empty
    const memberCount = database.prepare('SELECT COUNT(*) AS c FROM members').get().c;
    if (memberCount === 0) {
        console.log('Seeding database from SQL file...');
        seedFromSQL(database);
    }

    // Seed default plans when plans table is empty
    const planCount = database.prepare('SELECT COUNT(*) AS c FROM plans').get().c;
    if (planCount === 0) {
        const seedPlans = [
            { label: '1 Month', amount: 1500, duration_days: 30, category: 'Single — Old' },
            { label: '3 Months', amount: 4000, duration_days: 90, category: 'Single — Old' },
            { label: '6 Months', amount: 7000, duration_days: 180, category: 'Single — Old' },
            { label: '1 Year', amount: 12000, duration_days: 365, category: 'Single — Old' },
            { label: '3 Months', amount: 3000, duration_days: 90, category: 'Couple — Old' },
            { label: '6 Months', amount: 5000, duration_days: 180, category: 'Couple — Old' },
            { label: '1 Year', amount: 8000, duration_days: 365, category: 'Couple — Old' },
            { label: '1 Month', amount: 1200, duration_days: 30, category: 'Other' },
            { label: '3 Months', amount: 3600, duration_days: 90, category: 'Other' },
            { label: '1 Month', amount: 2001, duration_days: 30, category: 'Single — New' },
            { label: '3 Months', amount: 5001, duration_days: 90, category: 'Single — New' },
            { label: '6 Months', amount: 9001, duration_days: 180, category: 'Single — New' },
            { label: '1 Year', amount: 15001, duration_days: 365, category: 'Single — New' },
            { label: '1 Month', amount: 3501, duration_days: 30, category: 'Couple — New' },
            { label: '3 Months', amount: 8501, duration_days: 90, category: 'Couple — New' },
            { label: '6 Months', amount: 16001, duration_days: 180, category: 'Couple — New' },
            { label: '1 Year', amount: 25001, duration_days: 365, category: 'Couple — New' },
        ];
        const insertPlan = database.prepare(
            'INSERT INTO plans (label, amount, duration_days, category) VALUES (?, ?, ?, ?)'
        );
        for (const p of seedPlans) {
            insertPlan.run(p.label, p.amount, p.duration_days, p.category);
        }
        console.log(`Seeded ${seedPlans.length} default plans`);
    }

    // Ensure default admin exists and password matches env
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminHash = bcrypt.hashSync(adminPassword, 12);

    const adminExists = database.prepare('SELECT 1 FROM admins WHERE Username = ?').get(adminUsername);
    if (!adminExists) {
        database
            .prepare('INSERT OR IGNORE INTO admins (Username, Password) VALUES (?, ?)')
            .run(adminUsername, adminHash);
        console.log(`Default admin created → username: ${adminUsername}`);
    } else {
        // Always sync password from env on startup
        database
            .prepare('UPDATE admins SET Password = ? WHERE Username = ?')
            .run(adminHash, adminUsername);
    }

    console.log('✅ Database ready');
}

function seedFromSQL(database) {
    const sqlPath = path.join(__dirname, '..', 'inchbyin_44FitnessCenter.sql');
    if (!fs.existsSync(sqlPath)) {
        console.warn('SQL seed file not found — skipping seed');
        return;
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    const lines = sql.split('\n');

    let currentStatement = '';
    let inInsert = false;
    let count = 0;

    for (const line of lines) {
        const trimmed = line.trim();

        // Start accumulating an INSERT statement
        if (!inInsert && trimmed.startsWith('INSERT INTO')) {
            inInsert = true;
            currentStatement = '';
        }

        if (inInsert) {
            currentStatement += line + '\n';

            if (trimmed.endsWith(';')) {
                // Convert MySQL backtick identifiers to plain (SQLite accepts backticks too, but be safe)
                const stmt = currentStatement.replace(/`/g, '"');
                try {
                    database.exec(stmt.trim());
                    count++;
                } catch (err) {
                    if (
                        !err.message.toLowerCase().includes('unique constraint') &&
                        !err.message.toLowerCase().includes('not unique')
                    ) {
                        console.warn('Seed warning:', err.message.slice(0, 120));
                    }
                }
                currentStatement = '';
                inInsert = false;
            }
        }
    }

    console.log(`Seeded ${count} INSERT statements from SQL file`);
}

module.exports = { getDB, initDB };
