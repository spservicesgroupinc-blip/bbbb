
import { Hono } from 'hono';
import { jwtVerify } from 'jose';

type Bindings = {
    DB: D1Database;
    JWT_SECRET: string;
};

type Variables = {
    user: { username: string; companyName: string };
};

const sync = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

sync.use('/*', authMiddleware);

sync.post('/down', async (c) => {
    const { companyName } = c.get('user');

    // Fetch all data for this company
    const customers = await c.env.DB.prepare('SELECT json_data FROM customers WHERE company_name = ?')
        .bind(companyName).all();
    const estimates = await c.env.DB.prepare('SELECT json_data FROM estimates WHERE company_name = ?')
        .bind(companyName).all();
    const inventory = await c.env.DB.prepare('SELECT json_data FROM inventory WHERE company_name = ?')
        .bind(companyName).all();
    const equipment = await c.env.DB.prepare('SELECT json_data FROM equipment WHERE company_name = ?')
        .bind(companyName).all();
    const settingsRows = await c.env.DB.prepare('SELECT config_key, config_value FROM settings WHERE company_name = ?')
        .bind(companyName).all();
    const logs = await c.env.DB.prepare('SELECT json_data FROM logs WHERE company_name = ?')
        .bind(companyName).all();

    const settings: Record<string, any> = {};
    for (const row of settingsRows.results || []) {
        try {
            // @ts-ignore
            settings[row.config_key] = JSON.parse(row.config_value);
        } catch { /* ignore */ }
    }

    const safeParse = (jsonStr: string) => { try { return JSON.parse(jsonStr); } catch { return null; } };

    const foamCounts = settings['warehouse_counts'] || { openCellSets: 0, closedCellSets: 0 };
    const lifetimeUsage = settings['lifetime_usage'] || { openCell: 0, closedCell: 0 };
    const inventoryItems = (inventory.results || []).map((r: any) => safeParse(r.json_data)).filter(Boolean);
    const equipmentItems = (equipment.results || []).map((r: any) => safeParse(r.json_data)).filter(Boolean);

    return c.json({
        status: 'success',
        data: {
            ...settings,
            warehouse: { ...foamCounts, items: inventoryItems },
            lifetimeUsage,
            equipment: equipmentItems,
            savedEstimates: (estimates.results || []).map((r: any) => safeParse(r.json_data)).filter(Boolean),
            customers: (customers.results || []).map((r: any) => safeParse(r.json_data)).filter(Boolean),
            materialLogs: (logs.results || []).map((r: any) => safeParse(r.json_data)).filter(Boolean),
        }
    });
});

sync.post('/up', async (c) => {
    const { companyName } = c.get('user');
    const { state } = await c.req.json();

    // Upsert Settings
    const settingsKeys = ['companyProfile', 'yields', 'costs', 'expenses', 'jobNotes', 'purchaseOrders', 'sqFtRates', 'pricingMode', 'lifetimeUsage'];
    for (const key of settingsKeys) {
        if (state[key] !== undefined) {
            await c.env.DB.prepare(
                'INSERT INTO settings (company_name, config_key, config_value) VALUES (?, ?, ?) ON CONFLICT(company_name, config_key) DO UPDATE SET config_value = excluded.config_value'
            ).bind(companyName, key, JSON.stringify(state[key])).run();
        }
    }

    // Upsert Warehouse Counts
    if (state.warehouse) {
        await c.env.DB.prepare(
            'INSERT INTO settings (company_name, config_key, config_value) VALUES (?, ?, ?) ON CONFLICT(company_name, config_key) DO UPDATE SET config_value = excluded.config_value'
        ).bind(companyName, 'warehouse_counts', JSON.stringify({ openCellSets: state.warehouse.openCellSets, closedCellSets: state.warehouse.closedCellSets })).run();

        // Upsert Inventory Items
        if (state.warehouse.items && Array.isArray(state.warehouse.items)) {
            await c.env.DB.prepare('DELETE FROM inventory WHERE company_name = ?').bind(companyName).run();
            for (const item of state.warehouse.items) {
                await c.env.DB.prepare(
                    'INSERT INTO inventory (id, company_name, name, quantity, unit, unit_cost, json_data) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).bind(item.id, companyName, item.name, item.quantity, item.unit, item.unitCost || 0, JSON.stringify(item)).run();
            }
        }
    }

    // Upsert Equipment
    if (state.equipment && Array.isArray(state.equipment)) {
        await c.env.DB.prepare('DELETE FROM equipment WHERE company_name = ?').bind(companyName).run();
        for (const eq of state.equipment) {
            await c.env.DB.prepare(
                'INSERT INTO equipment (id, company_name, name, status, json_data) VALUES (?, ?, ?, ?, ?)'
            ).bind(eq.id, companyName, eq.name, eq.status, JSON.stringify(eq)).run();
        }
    }

    // Upsert Customers
    if (state.customers && Array.isArray(state.customers)) {
        await c.env.DB.prepare('DELETE FROM customers WHERE company_name = ?').bind(companyName).run();
        for (const cust of state.customers) {
            await c.env.DB.prepare(
                'INSERT INTO customers (id, company_name, name, address, city, state, zip, phone, email, status, json_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(cust.id, companyName, cust.name, cust.address, cust.city, cust.state, cust.zip, cust.phone, cust.email, cust.status || 'Active', JSON.stringify(cust)).run();
        }
    }

    // Upsert Estimates
    if (state.savedEstimates && Array.isArray(state.savedEstimates)) {
        await c.env.DB.prepare('DELETE FROM estimates WHERE company_name = ?').bind(companyName).run();
        for (const est of state.savedEstimates) {
            await c.env.DB.prepare(
                'INSERT INTO estimates (id, company_name, customer_id, date, total_value, status, invoice_number, pdf_link, json_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(est.id, companyName, est.customer?.id, est.date, est.totalValue, est.status, est.invoiceNumber, est.pdfLink, JSON.stringify(est)).run();
        }
    }

    return c.json({ status: 'success', data: { synced: true } });
});

export const syncRouter = sync;
