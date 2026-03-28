/**
 * Data Cleanup Script — 44 Fitness Center
 *
 * Run once with:  node scripts/cleanup.js
 *
 * What it does:
 *  1. Creates the data_issues table if missing.
 *  2. Clears any previous issue records (fresh run).
 *  3. For every member:
 *     - Uppercases Name and Address (safe, always done).
 *     - Propagates the uppercased Name to payments + daily_entry.
 *     - Flags phone values that are NOT exactly 10 digits into data_issues
 *       — those records are NOT modified.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'gym.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Ensure data_issues table exists ─────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS data_issues (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name  TEXT NOT NULL,
    record_id   INTEGER NOT NULL,
    issue_type  TEXT NOT NULL,
    field_name  TEXT,
    field_value TEXT,
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// Clear previous run results
db.prepare('DELETE FROM data_issues').run();
console.log('🧹  Cleared previous data_issues entries.');

// ── Prepared statements ──────────────────────────────────
const insertIssue = db.prepare(
    'INSERT INTO data_issues (table_name, record_id, issue_type, field_name, field_value, notes) VALUES (?, ?, ?, ?, ?, ?)'
);
const updateMember = db.prepare(
    'UPDATE members SET Name = ?, Address = ? WHERE ID = ?'
);
const updatePaymentsName = db.prepare(
    'UPDATE payments SET Name = ? WHERE Phone = ?'
);
const updateEntryName = db.prepare(
    'UPDATE daily_entry SET Name = ? WHERE Phone = ?'
);

// ── Process all members inside a single transaction ──────
const members = db.prepare('SELECT * FROM members').all();
let uppercaseFixed = 0;
let phonesFlagged = 0;

const run = db.transaction(() => {
    for (const m of members) {
        // ── Phone validation ─────────────────────────────
        const phoneStr = String(m.Phone);
        const phoneValid = /^\d{10}$/.test(phoneStr);

        if (!phoneValid) {
            insertIssue.run(
                'members',
                m.ID,
                'INVALID_PHONE',
                'Phone',
                phoneStr,
                `Phone "${phoneStr}" is not exactly 10 digits. Record left unchanged.`
            );
            phonesFlagged++;
            // Still uppercase name/address even for flagged records
        }

        // ── Uppercase name & address ─────────────────────
        const newName = (m.Name || '').toUpperCase();
        const newAddr = m.Address != null ? m.Address.toUpperCase() : null;

        const nameChanged = newName !== m.Name;
        const addrChanged = newAddr !== m.Address;

        if (nameChanged || addrChanged) {
            updateMember.run(newName, newAddr, m.ID);
            uppercaseFixed++;
        }

        // Cascade name change to related tables
        if (nameChanged) {
            updatePaymentsName.run(newName, m.Phone);
            updateEntryName.run(newName, m.Phone);
        }
    }
});

run();

// ── Summary ──────────────────────────────────────────────
console.log(`\n✅  Cleanup complete.`);
console.log(`   Records processed    : ${members.length}`);
console.log(`   Name/Address fixed   : ${uppercaseFixed}`);
console.log(`   Phone issues flagged : ${phonesFlagged}`);

if (phonesFlagged > 0) {
    console.log(`\n⚠️   ${phonesFlagged} record(s) have invalid phone numbers.`);
    console.log(`    Open /dashboard/data-issues to review them.\n`);
}

db.close();
