const express = require('express');
const { getDB } = require('../db/database');
const { asyncHandler } = require('./api.helpers');
const { requireAuth } = require('./api.middleware');

const router = express.Router();

// GET /api/plans
router.get('/', requireAuth, asyncHandler(async (_req, res) => {
    const db = getDB();
    const [plans] = await db.execute('SELECT * FROM plans ORDER BY category, amount');
    res.json(plans);
}));

// GET /api/plans/:id
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
    const db = getDB();
    const [[plan]] = await db.execute('SELECT * FROM plans WHERE ID = ?', [Number(req.params.id)]);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
}));

// POST /api/plans
router.post('/', requireAuth, asyncHandler(async (req, res) => {
    const { label, amount, duration_days, category } = req.body;

    if (!label?.trim()) return res.status(400).json({ error: 'Label is required' });
    if (label.trim().length > 100) return res.status(400).json({ error: 'Label is too long' });
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
        return res.status(400).json({ error: 'Valid amount (₹) is required' });
    if (Number(amount) > 1000000) return res.status(400).json({ error: 'Amount exceeds maximum allowed value' });
    if (!duration_days || isNaN(Number(duration_days)) || Number(duration_days) <= 0)
        return res.status(400).json({ error: 'Valid duration (days) is required' });
    if (Number(duration_days) > 3650) return res.status(400).json({ error: 'Duration cannot exceed 3650 days' });
    if ((category || '').trim().length > 100) return res.status(400).json({ error: 'Category is too long' });

    const db = getDB();
    const [result] = await db.execute(
        'INSERT INTO plans (label, amount, duration_days, category, is_active) VALUES (?, ?, ?, ?, 1)',
        [label.trim(), Number(amount), Number(duration_days), (category || 'General').trim()]
    );

    res.status(201).json({ success: true, id: result.insertId });
}));

// PUT /api/plans/:id
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
    const { label, amount, duration_days, category, is_active } = req.body;
    const planId = Number(req.params.id);

    if (!Number.isInteger(planId) || planId <= 0) return res.status(400).json({ error: 'Invalid plan ID' });
    if (!label?.trim()) return res.status(400).json({ error: 'Label is required' });
    if (label.trim().length > 100) return res.status(400).json({ error: 'Label is too long' });
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
        return res.status(400).json({ error: 'Valid amount (₹) is required' });
    if (Number(amount) > 1000000) return res.status(400).json({ error: 'Amount exceeds maximum allowed value' });
    if (!duration_days || isNaN(Number(duration_days)) || Number(duration_days) <= 0)
        return res.status(400).json({ error: 'Valid duration (days) is required' });
    if (Number(duration_days) > 3650) return res.status(400).json({ error: 'Duration cannot exceed 3650 days' });
    if ((category || '').trim().length > 100) return res.status(400).json({ error: 'Category is too long' });

    const db = getDB();
    const [[plan]] = await db.execute('SELECT * FROM plans WHERE ID = ?', [planId]);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const oldAmount = plan.amount;
    const newAmount = Number(amount);

    const con = await db.getConnection();
    try {
        await con.beginTransaction();
        await con.execute(
            'UPDATE plans SET label = ?, amount = ?, duration_days = ?, category = ?, is_active = ? WHERE ID = ?',
            [label.trim(), newAmount, Number(duration_days), (category || 'General').trim(), is_active ? 1 : 0, planId]
        );
        if (oldAmount !== newAmount) {
            await con.execute('UPDATE payments SET Money = ? WHERE Money = ?', [newAmount, oldAmount]);
        }
        await con.commit();
    } catch (err) {
        await con.rollback();
        throw err;
    } finally {
        con.release();
    }

    res.json({ success: true });
}));

// DELETE /api/plans/:id
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
    const planId = Number(req.params.id);
    if (!Number.isInteger(planId) || planId <= 0)
        return res.status(400).json({ error: 'Invalid plan ID' });
    const db = getDB();
    const [[plan]] = await db.execute('SELECT 1 FROM plans WHERE ID = ?', [planId]);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    await db.execute('DELETE FROM plans WHERE ID = ?', [planId]);
    res.json({ success: true });
}));

module.exports = router;
