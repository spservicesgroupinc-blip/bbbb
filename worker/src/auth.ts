
import { Hono } from 'hono';
import * as bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

type Bindings = {
    DB: D1Database;
    JWT_SECRET: string;
};

const auth = new Hono<{ Bindings: Bindings }>();

// Helper to generate Token
const generateToken = async (username: string, role: string, secret: string) => {
    const secretKey = new TextEncoder().encode(secret);
    return await new SignJWT({ username, role })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(secretKey);
};

auth.post('/login', async (c) => {
    const { username, password } = await c.req.json();

    const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();

    if (!user) {
        return c.json({ status: 'error', message: 'User not found' }, 401);
    }

    // @ts-ignore
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        return c.json({ status: 'error', message: 'Invalid password' }, 401);
    }

    // @ts-ignore
    const token = await generateToken(user.username, user.role, c.env.JWT_SECRET);

    return c.json({
        status: 'success',
        data: {
            // @ts-ignore
            username: user.username,
            // @ts-ignore
            companyName: user.company_name,
            role: 'admin',
            token
        }
    });
});

auth.post('/signup', async (c) => {
    const { username, password, companyName, email } = await c.req.json();

    // Check if exists
    const exists = await c.env.DB.prepare('SELECT username FROM users WHERE username = ?').bind(username).first();
    if (exists) {
        return c.json({ status: 'error', message: 'Username already taken' }, 400);
    }

    const hash = await bcrypt.hash(password, 10);
    const crewPin = Math.floor(1000 + Math.random() * 9000).toString();

    try {
        await c.env.DB.prepare(
            'INSERT INTO users (username, password_hash, company_name, email, crew_pin) VALUES (?, ?, ?, ?, ?)'
        ).bind(username, hash, companyName, email, crewPin).run();

        const token = await generateToken(username, 'admin', c.env.JWT_SECRET);

        return c.json({
            status: 'success',
            data: {
                username,
                companyName,
                role: 'admin',
                token,
                crewPin
            }
        });

    } catch (e: any) {
        return c.json({ status: 'error', message: e.message }, 500);
    }
});

export const authRouter = auth;
