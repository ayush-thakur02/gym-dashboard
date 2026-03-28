process.env.TZ = 'Asia/Kolkata';
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDB } = require('./db/database');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 7860;

// Trust the first proxy (required for HuggingFace Spaces and similar reverse-proxy environments)
app.set('trust proxy', 1);

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable must be set');
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'admin123')
    console.warn('[SECURITY] ADMIN_PASSWORD is not set or is using the default value. Set a strong password in .env');

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'"],
            },
        },
        crossOriginEmbedderPolicy: false,
    })
);

// Rate limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many login attempts, please try again later.' },
});

const checkinLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Too many check-in attempts, please slow down.' },
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/checkin', checkinLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRouter);

function requirePageAuth(req, res, next) {
    const token = req.cookies?.gym_token;
    if (!token) return res.redirect('/admin');
    try {
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.clearCookie('gym_token');
        res.redirect('/admin');
    }
}

app.get('/', (_req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
);
app.get('/admin', (_req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'))
);

app.get('/dashboard', requirePageAuth, (_req, res) =>
    res.redirect('/dashboard/overview')
);

const dashPages = ['overview', 'members', 'payments', 'entry', 'member-form', 'payment-form', 'monthly-detail', 'data-issues', 'settings', 'plan-form'];
dashPages.forEach((page) => {
    app.get(`/dashboard/${page}`, requirePageAuth, (_req, res) =>
        res.sendFile(path.join(__dirname, 'public', 'dashboard', `${page}.html`))
    );
});

app.use((_req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

async function initDBWithRetry(retries = 10, delayMs = 3000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await initDB();
            return;
        } catch (err) {
            console.error(`[DB] Connection attempt ${attempt}/${retries} failed: ${err.message}`);
            if (attempt === retries) {
                console.error('[DB] All retries exhausted. Exiting.');
                process.exit(1);
            }
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
}

async function start() {
    // Listen immediately so HuggingFace / the proxy detects the container as running
    await new Promise(resolve =>
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🏋️  44 Fitness Center running → http://localhost:${PORT}`);
            resolve();
        })
    );

    // Initialise DB after the server is already accepting connections
    await initDBWithRetry();
}

start().catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
});
