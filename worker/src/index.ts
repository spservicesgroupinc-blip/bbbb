
import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
    DB: D1Database;
    BUCKET?: R2Bucket; // Optional until R2 bucket is created
    JWT_SECRET: string;
    ALLOWED_ORIGIN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS Configuration
app.use('/*', cors({
    origin: (origin, c) => c.env.ALLOWED_ORIGIN || '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
}));

// Health Check
app.get('/', (c) => c.text('RFE Backend Worker Running'));

// Import Routers
import { authRouter } from './auth';
import { syncRouter } from './sync';
import { jobsRouter } from './jobs';

app.route('/auth', authRouter);
app.route('/sync', syncRouter);
app.route('/jobs', jobsRouter);

// Serve R2 Files (only if BUCKET is configured)
app.get('/files/*', async (c) => {
    if (!c.env.BUCKET) {
        return c.json({ status: 'error', message: 'R2 storage not configured' }, 503);
    }
    const key = c.req.path.replace('/files/', '');
    const object = await c.env.BUCKET.get(key);
    if (!object) return c.notFound();

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, { headers });
});

// Legacy API Adapter for "action" based requests from existing frontend
// This allows a gradual migration without changing frontend immediately
app.post('/', async (c) => {
    try {
        const body = await c.req.json();
        const { action, payload } = body;

        if (!action) return c.json({ status: 'error', message: 'No action provided' }, 400);

        // Get auth token from payload if present (legacy format)
        const token = payload?.token || c.req.header('Authorization')?.replace('Bearer ', '');

        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Create internal request based on action
        let internalPath = '';
        let method = 'POST';
        let internalPayload = payload;

        switch (action) {
            case 'LOGIN':
                internalPath = '/auth/login';
                break;
            case 'SIGNUP':
                internalPath = '/auth/signup';
                break;
            case 'CREW_LOGIN':
                internalPath = '/auth/crew-login';
                break;
            case 'SYNC_DOWN':
                internalPath = '/sync/down';
                break;
            case 'SYNC_UP':
                internalPath = '/sync/up';
                internalPayload = { state: payload.state };
                break;
            case 'START_JOB':
                internalPath = '/jobs/start';
                internalPayload = { estimateId: payload.estimateId };
                break;
            case 'COMPLETE_JOB':
                internalPath = '/jobs/complete';
                internalPayload = { estimateId: payload.estimateId, actuals: payload.actuals };
                break;
            case 'MARK_JOB_PAID':
                internalPath = '/jobs/paid';
                internalPayload = { estimateId: payload.estimateId };
                break;
            case 'DELETE_ESTIMATE':
                internalPath = '/jobs/delete';
                internalPayload = { estimateId: payload.estimateId };
                break;
            case 'UPLOAD_IMAGE':
                internalPath = '/jobs/upload-image';
                internalPayload = { base64Data: payload.base64Data, fileName: payload.fileName };
                break;
            case 'SAVE_PDF':
                internalPath = '/jobs/save-pdf';
                internalPayload = { base64Data: payload.base64Data, fileName: payload.fileName, estimateId: payload.estimateId };
                break;
            default:
                return c.json({ status: 'error', message: `Unknown Action: ${action}` }, 400);
        }

        // Make internal request
        const internalReq = new Request(`http://internal${internalPath}`, {
            method,
            headers,
            body: JSON.stringify(internalPayload)
        });

        return app.fetch(internalReq, c.env);

    } catch (e: any) {
        console.error('Legacy API Error:', e);
        return c.json({ status: 'error', message: e.message || 'Internal error' }, 500);
    }
});

export default app;
