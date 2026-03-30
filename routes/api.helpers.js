const { getDB } = require('../db/database');

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_MODES = ['Cash', 'UPI', 'Card', 'Online', 'Other'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return toDateStr(d);
}

function todayStr() {
    return toDateStr(new Date());
}

function nowTimeStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

async function getPlanDays(amount) {
    const [[plan]] = await getDB().execute(
        'SELECT duration_days FROM plans WHERE amount = ? AND is_active = 1',
        [Number(amount)]
    );
    return plan ? plan.duration_days : null;
}

async function getActivePlanAmounts() {
    const [rows] = await getDB().execute('SELECT amount FROM plans WHERE is_active = 1');
    return rows.map(r => r.amount);
}

module.exports = {
    asyncHandler,
    VALID_MODES,
    DATE_RE,
    toDateStr,
    addDays,
    todayStr,
    nowTimeStr,
    getPlanDays,
    getActivePlanAmounts,
};
