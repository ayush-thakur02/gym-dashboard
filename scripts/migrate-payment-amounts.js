require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const DRY_RUN = process.argv.includes('--dry-run');

const AMOUNT_MAP = [
    { old: 2001, new: 2000 },
    { old: 5001, new: 5000 },
    { old: 9001, new: 9000 },
    { old: 15001, new: 15000 },
    { old: 3501, new: 3500 },
    { old: 8501, new: 8500 },
    { old: 16001, new: 16000 },
    { old: 25001, new: 25000 },
];

async function main() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        waitForConnections: true,
        connectionLimit: 5,
        dateStrings: true,
    });

    console.log(DRY_RUN ? 'DRY RUN — no changes will be written\n' : 'Migrating payment amounts...\n');

    let totalUpdated = 0;
    const con = await pool.getConnection();
    try {
        await con.beginTransaction();

        for (const mapping of AMOUNT_MAP) {
            // Update the plan amount
            const [[planRow]] = await con.execute('SELECT ID FROM plans WHERE amount = ?', [mapping.old]);
            if (planRow) {
                if (!DRY_RUN) {
                    await con.execute('UPDATE plans SET amount = ? WHERE amount = ?', [mapping.new, mapping.old]);
                }
            }

            // Update payments
            const [[{ c: affected }]] = await con.execute('SELECT COUNT(*) AS c FROM payments WHERE Money = ?', [mapping.old]);
            if (affected === 0) {
                console.log(`  ₹${mapping.old} → ₹${mapping.new}  (no payments found, skipping)`);
                continue;
            }

            if (!DRY_RUN) {
                await con.execute('UPDATE payments SET Money = ? WHERE Money = ?', [mapping.new, mapping.old]);
            }
            console.log(`  ₹${mapping.old} → ₹${mapping.new}  (${affected} payment${affected > 1 ? 's' : ''} ${DRY_RUN ? 'would be ' : ''}updated)`);
            totalUpdated += affected;
        }

        if (DRY_RUN) { await con.rollback(); } else { await con.commit(); }
    } catch (err) {
        await con.rollback();
        throw err;
    } finally {
        con.release();
        await pool.end();
    }

    console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'} ${totalUpdated} payment record${totalUpdated !== 1 ? 's' : ''} total.`);
    if (DRY_RUN) console.log('\nRun without --dry-run to apply changes.');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
