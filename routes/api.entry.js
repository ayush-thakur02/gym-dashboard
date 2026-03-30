const express = require('express');
const { getDB } = require('../db/database');
const { asyncHandler, DATE_RE, toDateStr, todayStr } = require('./api.helpers');
const { requireAuth } = require('./api.middleware');

const router = express.Router();

// GET /api/entry
router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const db = getDB();
    const { filter, date, month, year, search } = req.query;
    const today = todayStr();

    let start, end;
    if (filter === 'month' && month && year) {
        const m = Number(month);
        const y = Number(year);
        if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) {
            start = `${y}-${String(m).padStart(2, '0')}-01`;
            end = toDateStr(new Date(y, m, 0));
        } else {
            start = today; end = today;
        }
    } else if (filter === 'date' && date && DATE_RE.test(date)) {
        start = date; end = date;
    } else {
        start = today; end = today;
    }

    const searchParam = `%${search || ''}%`;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [[{ c: total }]] = await db.execute(
        `SELECT COUNT(*) AS c FROM daily_entry
         WHERE (Name LIKE ? OR CAST(Phone AS CHAR) LIKE ?) AND Date >= ? AND Date <= ?`,
        [searchParam, searchParam, start, end]
    );
    const [rows] = await db.execute(
        `SELECT * FROM daily_entry
         WHERE (Name LIKE ? OR CAST(Phone AS CHAR) LIKE ?) AND Date >= ? AND Date <= ?
         ORDER BY Date DESC, Sno DESC LIMIT ? OFFSET ?`,
        [searchParam, searchParam, start, end, limit, offset]
    );

    res.json({ rows, total, page, limit, start, end });
}));

// GET /api/entry/daily-counts
router.get('/daily-counts', requireAuth, asyncHandler(async (req, res) => {
    const db = getDB();
    const { month, year } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const end = toDateStr(new Date(y, m, 0));

    const [rows] = await db.execute(
        'SELECT Date, COUNT(*) AS count FROM daily_entry WHERE Date >= ? AND Date <= ? GROUP BY Date ORDER BY Date',
        [start, end]
    );

    res.json({ rows, start, end });
}));

module.exports = router;
