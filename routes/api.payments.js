const express = require('express');
const { getDB } = require('../db/database');
const { asyncHandler, VALID_MODES, DATE_RE, getActivePlanAmounts } = require('./api.helpers');
const { requireAuth } = require('./api.middleware');

const router = express.Router();

// GET /api/payments
router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const db = getDB();
    const search = `%${req.query.search || ''}%`;
    const mode = req.query.mode || '';
    const month = req.query.month || '';
    const year = req.query.year || '';
    const amount = req.query.amount || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const conditions = ['(Name LIKE ? OR CAST(Phone AS CHAR) LIKE ?)'];
    const params = [search, search];

    if (mode) { conditions.push('Mode = ?'); params.push(mode); }
    if (year) { conditions.push('YEAR(Date) = ?'); params.push(year); }
    if (month) { conditions.push("DATE_FORMAT(Date, '%m') = ?"); params.push(month); }
    if (amount) { conditions.push('Money = ?'); params.push(Number(amount)); }

    const where = conditions.join(' AND ');
    const [[{ c: total }]] = await db.execute(`SELECT COUNT(*) AS c FROM payments WHERE ${where}`, params);
    const [rows] = await db.execute(
        `SELECT * FROM payments WHERE ${where} ORDER BY Date DESC, ID DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    res.json({ rows, total, page, limit });
}));

// GET /api/payments/:id
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
    const db = getDB();
    const payId = Number(req.params.id);
    if (!Number.isInteger(payId) || payId <= 0)
        return res.status(400).json({ error: 'Invalid payment ID' });
    const [[pay]] = await db.execute('SELECT * FROM payments WHERE ID = ?', [payId]);
    if (!pay) return res.status(404).json({ error: 'Payment not found' });
    res.json(pay);
}));

// POST /api/payments
router.post('/', requireAuth, asyncHandler(async (req, res) => {
    const { phone, amount, date, mode } = req.body;

    if (!phone?.trim()) return res.status(400).json({ error: 'Phone is required' });
    if (!amount) return res.status(400).json({ error: 'Amount is required' });
    if (!date) return res.status(400).json({ error: 'Date is required' });
    if (!mode) return res.status(400).json({ error: 'Payment mode is required' });
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date format' });
    if (!VALID_MODES.includes(mode)) return res.status(400).json({ error: 'Invalid payment mode' });
    if (!(await getActivePlanAmounts()).includes(Number(amount)))
        return res.status(400).json({ error: 'Invalid plan amount' });

    const db = getDB();
    const [[member]] = await db.execute('SELECT * FROM members WHERE Phone = ?', [phone.trim()]);
    if (!member) return res.status(404).json({ error: 'Member not found. Register first.' });

    await db.execute(
        'INSERT INTO payments (Name, Date, Phone, Mode, Money) VALUES (?, ?, ?, ?, ?)',
        [member.Name, date, phone.trim(), mode, Number(amount)]
    );

    res.status(201).json({ success: true, name: member.Name });
}));

// PUT /api/payments/:id
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
    const { amount, date, mode } = req.body;
    const db = getDB();
    const payId = Number(req.params.id);

    if (!Number.isInteger(payId) || payId <= 0)
        return res.status(400).json({ error: 'Invalid payment ID' });
    if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date format' });
    if (!mode || !VALID_MODES.includes(mode)) return res.status(400).json({ error: 'Invalid payment mode' });

    const [[pay]] = await db.execute('SELECT 1 FROM payments WHERE ID = ?', [payId]);
    if (!pay) return res.status(404).json({ error: 'Payment not found' });
    if (!(await getActivePlanAmounts()).includes(Number(amount)))
        return res.status(400).json({ error: 'Invalid plan amount' });

    await db.execute(
        'UPDATE payments SET Date = ?, Mode = ?, Money = ? WHERE ID = ?',
        [date, mode, Number(amount), payId]
    );

    res.json({ success: true });
}));

module.exports = router;
