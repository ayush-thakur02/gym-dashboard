/**
 * Payment Amount Migration Script — 44 Fitness Center
 *
 * Remaps old plan amounts (seeded with +1 quirks) to the correct
 * round-number amounts now stored in the plans table.
 *
 * Run with:  node scripts/migrate-payment-amounts.js
 * Dry-run:   node scripts/migrate-payment-amounts.js --dry-run
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'gym.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Amount remapping: old value → new value ──────────────────────────────────
// These were the original seeded amounts before the round-number refactor.
const AMOUNT_MAP = [
    { old: 2001, new: 2000 }, // Single 2025 — 1 Month
    { old: 5001, new: 5000 }, // Single 2025 — 3 Months
    { old: 9001, new: 9000 }, // Single 2025 — 6 Months
    { old: 15001, new: 15000 }, // Single 2025 — 1 Year
    { old: 3501, new: 3500 }, // Couple 2025 — 1 Month
    { old: 8501, new: 8500 }, // Couple 2025 — 3 Months
    { old: 16001, new: 16000 }, // Couple 2025 — 6 Months
    { old: 25001, new: 25000 }, // Couple 2025 — 1 Year
];

// ── Verify that every new amount actually exists as a plan ───────────────────
const mismatches = AMOUNT_MAP.filter(m => {
    const plan = db.prepare('SELECT 1 FROM plans WHERE amount = ? AND is_active = 1').get(m.new);
    return !plan;
});
if (mismatches.length) {
    console.error('ERROR: The following new amounts have no matching active plan in the DB:');
    mismatches.forEach(m => console.error(`  ${m.old} → ${m.new} (NOT FOUND)`));
    process.exit(1);
}

// ── Run migration ─────────────────────────────────────────────────────────────
console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be written\n' : '🔄 Migrating payment amounts…\n');

let totalUpdated = 0;

const migrate = db.transaction(() => {
    for (const mapping of AMOUNT_MAP) {
        const affected = db
            .prepare('SELECT COUNT(*) AS c FROM payments WHERE Money = ?')
            .get(mapping.old).c;

        if (affected === 0) {
            console.log(`  ₹${mapping.old} → ₹${mapping.new}  (no payments found, skipping)`);
            continue;
        }

        if (!DRY_RUN) {
            db.prepare('UPDATE payments SET Money = ? WHERE Money = ?').run(mapping.new, mapping.old);
        }

        console.log(`  ₹${mapping.old} → ₹${mapping.new}  (${affected} payment${affected > 1 ? 's' : ''} ${DRY_RUN ? 'would be ' : ''}updated)`);
        totalUpdated += affected;
    }
});

migrate();

console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'} ${totalUpdated} payment record${totalUpdated !== 1 ? 's' : ''} total.`);
if (DRY_RUN) {
    console.log('\nRun without --dry-run to apply changes.');
}
