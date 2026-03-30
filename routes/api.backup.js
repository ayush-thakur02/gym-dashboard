const express = require('express');
const { getDB } = require('../db/database');
const { asyncHandler } = require('./api.helpers');
const { requireAuth } = require('./api.middleware');

const router = express.Router();

const BACKUP_TABLES = ['members', 'payments', 'daily_entry', 'plans'];

function escapeSqlValue(v) {
    if (v === null || v === undefined) return 'NULL';
    const str = String(v);
    return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

// GET /api/backup/sql
router.get('/sql', requireAuth, asyncHandler(async (_req, res) => {
    const db = getDB();
    const date = new Date().toISOString().slice(0, 10);
    let sql = `-- 44 Fitness Center — Database Backup\n-- Generated: ${new Date().toISOString()}\n-- Tables: ${BACKUP_TABLES.join(', ')}\n\nSET FOREIGN_KEY_CHECKS=0;\n\n`;

    for (const table of BACKUP_TABLES) {
        const [rows] = await db.execute(`SELECT * FROM \`${table}\``);
        sql += `-- --------------------------------------------------------\n`;
        sql += `-- Table: \`${table}\`\n`;
        sql += `-- --------------------------------------------------------\n\n`;

        if (rows.length === 0) {
            sql += `-- (no rows)\n\n`;
            continue;
        }

        const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');
        for (const row of rows) {
            const vals = Object.values(row).map(escapeSqlValue).join(', ');
            sql += `INSERT INTO \`${table}\` (${cols}) VALUES (${vals});\n`;
        }
        sql += '\n';
    }

    sql += `SET FOREIGN_KEY_CHECKS=1;\n`;

    const filename = `44fitness_backup_${date}.sql`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sql);
}));

module.exports = router;
