const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

let pool;

function getDB() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT) || 3306,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            waitForConnections: true,
            connectionLimit: 2,
            queueLimit: 100,
            timezone: '+05:30',
            dateStrings: true,
        });
    }
    return pool;
}

async function initDB() {
    const db = getDB();

    await db.execute(`
        CREATE TABLE IF NOT EXISTS members (
            ID INT NOT NULL AUTO_INCREMENT,
            Name VARCHAR(50) DEFAULT NULL,
            Phone BIGINT DEFAULT NULL,
            Emergency_Phone BIGINT DEFAULT NULL,
            DOB DATE DEFAULT NULL,
            Address TEXT DEFAULT NULL,
            PRIMARY KEY (ID),
            UNIQUE KEY uq_members_phone (Phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS payments (
            ID INT NOT NULL AUTO_INCREMENT,
            Name VARCHAR(50) NOT NULL,
            Date DATE NOT NULL,
            Phone BIGINT NOT NULL,
            Mode VARCHAR(10) NOT NULL,
            Money INT NOT NULL,
            PRIMARY KEY (ID)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS daily_entry (
            Sno INT NOT NULL AUTO_INCREMENT,
            Name VARCHAR(50) NOT NULL,
            Phone BIGINT NOT NULL,
            Date DATE NOT NULL,
            Time TIME NOT NULL,
            PRIMARY KEY (Sno)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS admins (
            ID INT NOT NULL AUTO_INCREMENT,
            Username VARCHAR(100) NOT NULL,
            Password VARCHAR(255) NOT NULL,
            PRIMARY KEY (ID),
            UNIQUE KEY uq_admins_username (Username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS data_issues (
            id INT NOT NULL AUTO_INCREMENT,
            table_name VARCHAR(50) NOT NULL,
            record_id INT NOT NULL,
            issue_type VARCHAR(50) NOT NULL,
            field_name VARCHAR(50) DEFAULT NULL,
            field_value TEXT DEFAULT NULL,
            notes TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS plans (
            ID INT NOT NULL AUTO_INCREMENT,
            label VARCHAR(100) NOT NULL,
            amount INT NOT NULL,
            duration_days INT NOT NULL,
            category VARCHAR(100) NOT NULL DEFAULT 'General',
            is_active TINYINT NOT NULL DEFAULT 1,
            PRIMARY KEY (ID)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [[{ c: memberCount }]] = await db.execute('SELECT COUNT(*) AS c FROM members');
    if (memberCount === 0) await seedFromSQL(db);

    const [[{ c: planCount }]] = await db.execute('SELECT COUNT(*) AS c FROM plans');
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
        for (const p of seedPlans) {
            await db.execute(
                'INSERT INTO plans (label, amount, duration_days, category) VALUES (?, ?, ?, ?)',
                [p.label, p.amount, p.duration_days, p.category]
            );
        }
    }

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminHash = bcrypt.hashSync(adminPassword, 12);

    const [[adminRow]] = await db.execute('SELECT 1 FROM admins WHERE Username = ?', [adminUsername]);
    if (!adminRow) {
        await db.execute('INSERT IGNORE INTO admins (Username, Password) VALUES (?, ?)', [adminUsername, adminHash]);
    } else {
        await db.execute('UPDATE admins SET Password = ? WHERE Username = ?', [adminHash, adminUsername]);
    }

    console.log('[DB] MySQL connected and schema ready.');
}

async function seedFromSQL(db) {
    const sqlPath = path.join(__dirname, '..', 'inchbyin_44FitnessCenter.sql');
    if (!fs.existsSync(sqlPath)) return;

    const content = fs.readFileSync(sqlPath, 'utf8');
    // Extract all INSERT INTO statements — the dump may span multiple lines
    const insertRegex = /INSERT INTO\s+`?\w+`?\s+\([^)]+\)\s+VALUES[\s\S]+?;/g;
    const statements = content.match(insertRegex) || [];

    for (const stmt of statements) {
        // Skip INSERT statements for tables we manage separately (admins, plans, data_issues)
        if (/INSERT INTO\s+`?(admins|plans|data_issues)`?/i.test(stmt)) continue;
        try {
            await db.query(stmt);
        } catch (err) {
            if (err.code !== 'ER_DUP_ENTRY') {
                console.warn('[Seed] Warning:', err.message.slice(0, 120));
            }
        }
    }
    console.log('[DB] Seed from SQL file complete.');
}

module.exports = { getDB, initDB };
