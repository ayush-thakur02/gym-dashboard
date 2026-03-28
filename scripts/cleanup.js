require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

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

    const con = await pool.getConnection();
    try {
        await con.beginTransaction();

        await con.execute('DELETE FROM data_issues');
        console.log('Cleared previous data_issues entries.');

        const [members] = await con.execute('SELECT * FROM members');
        let uppercaseFixed = 0;
        let phonesFlagged = 0;

        for (const m of members) {
            // ── Phone validation ─────────────────────────────
            const phoneStr = String(m.Phone);
            const phoneValid = /^\d{10}$/.test(phoneStr);

            if (!phoneValid) {
                await con.execute(
                    'INSERT INTO data_issues (table_name, record_id, issue_type, field_name, field_value, notes) VALUES (?, ?, ?, ?, ?, ?)',
                    ['members', m.ID, 'INVALID_PHONE', 'Phone', phoneStr,
                        `Phone "${phoneStr}" is not exactly 10 digits. Record left unchanged.`]
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
                await con.execute('UPDATE members SET Name = ?, Address = ? WHERE ID = ?', [newName, newAddr, m.ID]);
                uppercaseFixed++;
            }

            // Cascade name change to related tables
            if (nameChanged) {
                await con.execute('UPDATE payments SET Name = ? WHERE Phone = ?', [newName, m.Phone]);
                await con.execute('UPDATE daily_entry SET Name = ? WHERE Phone = ?', [newName, m.Phone]);
            }
        }

        await con.commit();

        console.log(`\nCleanup complete.`);
        console.log(`  Records processed    : ${members.length}`);
        console.log(`  Name/Address fixed   : ${uppercaseFixed}`);
        console.log(`  Phone issues flagged : ${phonesFlagged}`);

        if (phonesFlagged > 0) {
            console.log(`\n${phonesFlagged} record(s) have invalid phone numbers.`);
            console.log(`  Open /dashboard/data-issues to review them.`);
        }
    } catch (err) {
        await con.rollback();
        throw err;
    } finally {
        con.release();
        await pool.end();
    }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
