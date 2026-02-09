
import { Hono } from 'hono';
import { jwtVerify } from 'jose';

type Bindings = {
    DB: D1Database;
    BUCKET: R2Bucket;
    JWT_SECRET: string;
};

type Variables = {
    user: { username: string; companyName: string };
};

const jobs = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// JWT Auth Middleware
const authMiddleware = async (c: any, next: any) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ status: 'error', message: 'Unauthorized' }, 401);
    }
    const token = authHeader.slice(7);
    try {
        const secret = new TextEncoder().encode(c.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        const user = await c.env.DB.prepare('SELECT username, company_name FROM users WHERE username = ?')
            .bind(payload.username).first();
        if (!user) return c.json({ status: 'error', message: 'User not found' }, 401);
        c.set('user', { username: user.username, companyName: user.company_name });
        await next();
    } catch (e) {
        return c.json({ status: 'error', message: 'Invalid token' }, 401);
    }
};

jobs.use('/*', authMiddleware);

const safeParse = (jsonStr: string | null) => { if (!jsonStr) return null; try { return JSON.parse(jsonStr); } catch { return null; } };

// Start Job
jobs.post('/start', async (c) => {
    const { companyName } = c.get('user');
    const { estimateId } = await c.req.json();

    const row = await c.env.DB.prepare('SELECT json_data FROM estimates WHERE id = ? AND company_name = ?')
        .bind(estimateId, companyName).first();

    if (!row) return c.json({ status: 'error', message: 'Estimate not found' }, 404);

    // @ts-ignore
    const est = safeParse(row.json_data);
    if (!est) return c.json({ status: 'error', message: 'Invalid estimate data' }, 500);

    est.executionStatus = 'In Progress';
    if (!est.actuals) est.actuals = {};
    est.actuals.lastStartedAt = new Date().toISOString();

    await c.env.DB.prepare('UPDATE estimates SET json_data = ? WHERE id = ? AND company_name = ?')
        .bind(JSON.stringify(est), estimateId, companyName).run();

    return c.json({ status: 'success', data: { status: 'In Progress' } });
});

// Complete Job
jobs.post('/complete', async (c) => {
    const { companyName, username } = c.get('user');
    const { estimateId, actuals } = await c.req.json();

    const row = await c.env.DB.prepare('SELECT json_data FROM estimates WHERE id = ? AND company_name = ?')
        .bind(estimateId, companyName).first();

    if (!row) return c.json({ status: 'error', message: 'Estimate not found' }, 404);

    // @ts-ignore
    const est = safeParse(row.json_data);
    if (!est) return c.json({ status: 'error', message: 'Invalid estimate data' }, 500);

    if (est.executionStatus === 'Completed' && est.inventoryProcessed) {
        return c.json({ status: 'success', data: { message: 'Already completed' } });
    }

    // 1. Update Warehouse Counts
    const countsRow = await c.env.DB.prepare('SELECT config_value FROM settings WHERE company_name = ? AND config_key = ?')
        .bind(companyName, 'warehouse_counts').first();
    // @ts-ignore
    let counts = countsRow ? safeParse(countsRow.config_value) : { openCellSets: 0, closedCellSets: 0 };

    const lifeRow = await c.env.DB.prepare('SELECT config_value FROM settings WHERE company_name = ? AND config_key = ?')
        .bind(companyName, 'lifetime_usage').first();
    // @ts-ignore
    let lifeStats = lifeRow ? safeParse(lifeRow.config_value) : { openCell: 0, closedCell: 0 };

    const ocUsed = Number(actuals.openCellSets) || 0;
    const ccUsed = Number(actuals.closedCellSets) || 0;

    counts.openCellSets = (counts.openCellSets || 0) - ocUsed;
    counts.closedCellSets = (counts.closedCellSets || 0) - ccUsed;
    lifeStats.openCell = (lifeStats.openCell || 0) + ocUsed;
    lifeStats.closedCell = (lifeStats.closedCell || 0) + ccUsed;

    await c.env.DB.prepare('INSERT INTO settings (company_name, config_key, config_value) VALUES (?, ?, ?) ON CONFLICT(company_name, config_key) DO UPDATE SET config_value = excluded.config_value')
        .bind(companyName, 'warehouse_counts', JSON.stringify(counts)).run();
    await c.env.DB.prepare('INSERT INTO settings (company_name, config_key, config_value) VALUES (?, ?, ?) ON CONFLICT(company_name, config_key) DO UPDATE SET config_value = excluded.config_value')
        .bind(companyName, 'lifetime_usage', JSON.stringify(lifeStats)).run();

    // 2. Deduct Inventory
    if (actuals.inventory && actuals.inventory.length > 0) {
        for (const actItem of actuals.inventory) {
            const invRow = await c.env.DB.prepare('SELECT json_data FROM inventory WHERE id = ? AND company_name = ?')
                .bind(actItem.id, companyName).first();
            if (invRow) {
                // @ts-ignore
                const invData = safeParse(invRow.json_data);
                if (invData) {
                    invData.quantity = (invData.quantity || 0) - (Number(actItem.quantity) || 0);
                    await c.env.DB.prepare('UPDATE inventory SET quantity = ?, json_data = ? WHERE id = ? AND company_name = ?')
                        .bind(invData.quantity, JSON.stringify(invData), actItem.id, companyName).run();
                }
            }
        }
    }

    // 3. Log Materials
    const completionDate = actuals.completionDate || new Date().toISOString();
    const custName = est.customer?.name || 'Unknown';
    const tech = actuals.completedBy || username;

    const addLog = async (name: string, qty: number, unit: string) => {
        if (qty > 0) {
            const logId = crypto.randomUUID();
            const entry = { id: logId, date: completionDate, jobId: estimateId, customerName: custName, materialName: name, quantity: qty, unit, loggedBy: tech };
            await c.env.DB.prepare('INSERT INTO logs (id, company_name, date, job_id, customer_name, material_name, quantity, unit, logged_by, json_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .bind(logId, companyName, completionDate, estimateId, custName, name, qty, unit, tech, JSON.stringify(entry)).run();
        }
    };
    await addLog('Open Cell Foam', ocUsed, 'Sets');
    await addLog('Closed Cell Foam', ccUsed, 'Sets');
    if (actuals.inventory) {
        for (const i of actuals.inventory) await addLog(i.name, Number(i.quantity) || 0, i.unit);
    }

    // 4. Update Estimate
    est.executionStatus = 'Completed';
    est.actuals = actuals;
    est.inventoryProcessed = true;
    est.lastModified = new Date().toISOString();

    await c.env.DB.prepare('UPDATE estimates SET json_data = ?, status = ? WHERE id = ? AND company_name = ?')
        .bind(JSON.stringify(est), est.status, estimateId, companyName).run();

    return c.json({ status: 'success', data: { message: 'Job completed' } });
});

// Mark Paid
jobs.post('/paid', async (c) => {
    const { companyName } = c.get('user');
    const { estimateId } = await c.req.json();

    const row = await c.env.DB.prepare('SELECT json_data FROM estimates WHERE id = ? AND company_name = ?')
        .bind(estimateId, companyName).first();

    if (!row) return c.json({ status: 'error', message: 'Estimate not found' }, 404);

    // @ts-ignore
    const est = safeParse(row.json_data);
    if (!est) return c.json({ status: 'error', message: 'Invalid estimate data' }, 500);

    // Get costs from settings
    const costsRow = await c.env.DB.prepare('SELECT config_value FROM settings WHERE company_name = ? AND config_key = ?')
        .bind(companyName, 'costs').first();
    // @ts-ignore
    const costs = costsRow ? safeParse(costsRow.config_value) : { openCell: 0, closedCell: 0, laborRate: 0 };

    const act = est.actuals || est.materials || {};
    const oc = Number(act.openCellSets || 0);
    const cc = Number(act.closedCellSets || 0);
    const chemCost = (oc * costs.openCell) + (cc * costs.closedCell);
    const labHrs = Number(act.laborHours || est.expenses?.manHours || 0);
    const labCost = labHrs * (est.expenses?.laborRate || costs.laborRate || 0);
    let invCost = 0;
    (act.inventory || est.materials?.inventory || []).forEach((i: any) => invCost += (Number(i.quantity) * Number(i.unitCost || 0)));
    const misc = (est.expenses?.tripCharge || 0) + (est.expenses?.fuelSurcharge || 0);
    const revenue = Number(est.totalValue) || 0;
    const totalCOGS = chemCost + labCost + invCost + misc;

    est.status = 'Paid';
    est.financials = {
        revenue,
        chemicalCost: chemCost,
        laborCost: labCost,
        inventoryCost: invCost,
        miscCost: misc,
        totalCOGS,
        netProfit: revenue - totalCOGS,
        margin: revenue ? (revenue - totalCOGS) / revenue : 0
    };

    await c.env.DB.prepare('UPDATE estimates SET json_data = ?, status = ? WHERE id = ? AND company_name = ?')
        .bind(JSON.stringify(est), 'Paid', estimateId, companyName).run();

    return c.json({ status: 'success', data: { estimate: est } });
});

// Delete Estimate
jobs.post('/delete', async (c) => {
    const { companyName } = c.get('user');
    const { estimateId } = await c.req.json();

    await c.env.DB.prepare('DELETE FROM estimates WHERE id = ? AND company_name = ?')
        .bind(estimateId, companyName).run();

    return c.json({ status: 'success', data: { message: 'Deleted' } });
});

// Upload Image to R2
jobs.post('/upload-image', async (c) => {
    const { companyName } = c.get('user');
    const { base64Data, fileName } = await c.req.json();

    const encoded = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const decoded = Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0));

    const key = `${companyName}/photos/${fileName || `photo_${Date.now()}.jpg`}`;
    await c.env.BUCKET.put(key, decoded, { httpMetadata: { contentType: 'image/jpeg' } });

    // Return a public URL (requires R2 public access or a worker URL)
    // For now, return the key. Frontend can construct the URL.
    return c.json({ status: 'success', data: { key, url: `/files/${key}` } });
});

// Save PDF to R2
jobs.post('/save-pdf', async (c) => {
    const { companyName } = c.get('user');
    const { base64Data, fileName, estimateId } = await c.req.json();

    const encoded = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const decoded = Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0));

    const key = `${companyName}/pdfs/${fileName}`;
    await c.env.BUCKET.put(key, decoded, { httpMetadata: { contentType: 'application/pdf' } });

    // Update estimate with PDF link if provided
    if (estimateId) {
        const row = await c.env.DB.prepare('SELECT json_data FROM estimates WHERE id = ? AND company_name = ?')
            .bind(estimateId, companyName).first();
        if (row) {
            // @ts-ignore
            const est = safeParse(row.json_data);
            if (est) {
                est.pdfLink = `/files/${key}`;
                await c.env.DB.prepare('UPDATE estimates SET pdf_link = ?, json_data = ? WHERE id = ? AND company_name = ?')
                    .bind(est.pdfLink, JSON.stringify(est), estimateId, companyName).run();
            }
        }
    }

    return c.json({ status: 'success', data: { url: `/files/${key}` } });
});

export const jobsRouter = jobs;
