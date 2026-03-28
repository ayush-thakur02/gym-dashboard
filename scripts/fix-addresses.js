/**
 * Address Fixer — 44 Fitness Center
 *
 * Uses LM Studio structured output to clean up messy member addresses.
 * No parsing — just rewrites each address in a clean, readable way.
 *
 * Prerequisites:
 *   1. LM Studio running locally with a model loaded.
 *   2. Server listening on http://localhost:1234 (default LM Studio port).
 *
 * Usage:
 *   Dry-run (preview, no DB writes):  node scripts/fix-addresses.js --dry-run
 *   Apply changes:                    node scripts/fix-addresses.js
 *   Custom URL/model:                 LMS_URL=http://localhost:1234 LMS_MODEL=my-model node scripts/fix-addresses.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const LMS_URL = (process.env.LMS_URL || 'http://localhost:1234').replace(/\/$/, '');
const LMS_MODEL = process.env.LMS_MODEL || 'liquid/lfm2.5-1.2b';
const CONCURRENCY = 3;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'gym.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Structured output schema — just one field ─────────────────────────────────
const ADDRESS_SCHEMA = {
    name: 'address',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            address: {
                type: 'string',
                description: 'The cleaned, properly written address.'
            }
        },
        required: ['address'],
        additionalProperties: false
    }
};

const SYSTEM_PROMPT = `You are a data cleaning assistant. The user will give you a raw address string.
Rewrite it cleanly and naturally. Rules:
- Remove Gali No., Street No., House No., Sector, Block, etc. — just write the actual address without those labels.
- Remove tokens like <NA>, N/A, HOUSE NO:, SECTOR: — just write the values naturally.
- Remove extra spaces, fix capitalisation (Title Case for place names).
- Keep all real information that was in the original — do not invent or remove anything meaningful.
- Return only the cleaned address string, nothing else.`;

// ── Call LM Studio ────────────────────────────────────────────────────────────
async function cleanAddress(member) {
    const response = await fetch(`${LMS_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LMS_MODEL,
            temperature: 0,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: member.Address }
            ],
            response_format: {
                type: 'json_schema',
                json_schema: ADDRESS_SCHEMA
            }
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`LM Studio ${response.status}: ${text}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty response from LM Studio');

    const parsed = JSON.parse(raw);
    return parsed.address?.trim();
}

// ── Concurrency helper ────────────────────────────────────────────────────────
async function runWithConcurrency(tasks, limit) {
    const results = [];
    let i = 0;
    async function worker() {
        while (i < tasks.length) {
            const idx = i++;
            results[idx] = await tasks[idx]();
        }
    }
    await Promise.all(Array.from({ length: limit }, worker));
    return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    console.log(DRY_RUN
        ? '🔍  DRY RUN — no changes will be written\n'
        : '✏️   Fixing addresses…\n');

    const members = db
        .prepare("SELECT ID, Name, Address FROM members WHERE Address IS NOT NULL AND TRIM(Address) != ''")
        .all();

    console.log(`Found ${members.length} members with addresses.\n`);

    const updateStmt = db.prepare('UPDATE members SET Address = ? WHERE ID = ?');
    let changed = 0, unchanged = 0, failed = 0;

    const tasks = members.map(m => async () => {
        try {
            const cleaned = await cleanAddress(m);
            const original = m.Address.trim();

            if (!cleaned || cleaned === original) {
                process.stdout.write('.');
                unchanged++;
                return;
            }

            console.log(`\n[ID ${m.ID}] ${m.Name.trim()}`);
            console.log(`  Before : ${original}`);
            console.log(`  After  : ${cleaned}`);

            if (!DRY_RUN) {
                updateStmt.run(cleaned, m.ID);
            }
            changed++;
        } catch (err) {
            console.error(`\n[ID ${m.ID}] ${m.Name.trim()} — ERROR: ${err.message}`);
            failed++;
        }
    });

    await runWithConcurrency(tasks, CONCURRENCY);

    console.log('\n\n' + '─'.repeat(50));
    console.log(`  Total    : ${members.length}`);
    console.log(`  Changed  : ${changed}${DRY_RUN ? '  (dry run — not written)' : ''}`);
    console.log(`  Same     : ${unchanged}`);
    console.log(`  Errors   : ${failed}`);
    console.log('─'.repeat(50));

    if (DRY_RUN && changed > 0) {
        console.log('\n  Run without --dry-run to apply.\n');
    }

    db.close();
})();
