DROP TABLE IF EXISTS users;
CREATE TABLE users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    company_name TEXT,
    email TEXT,
    role TEXT DEFAULT 'admin',
    crew_pin TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS customers;
CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    company_name TEXT, -- Linked to users.company_name or username
    name TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    phone TEXT,
    email TEXT,
    status TEXT DEFAULT 'Active',
    json_data TEXT -- Full JSON blob for compatibility
);

DROP TABLE IF EXISTS estimates;
CREATE TABLE estimates (
    id TEXT PRIMARY KEY,
    company_name TEXT,
    customer_id TEXT,
    date TEXT,
    total_value REAL,
    status TEXT,
    invoice_number TEXT,
    pdf_link TEXT,
    json_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS inventory;
CREATE TABLE inventory (
    id TEXT PRIMARY KEY,
    company_name TEXT,
    name TEXT,
    quantity REAL,
    unit TEXT,
    unit_cost REAL,
    json_data TEXT
);

DROP TABLE IF EXISTS equipment;
CREATE TABLE equipment (
    id TEXT PRIMARY KEY,
    company_name TEXT,
    name TEXT,
    status TEXT,
    json_data TEXT
);

DROP TABLE IF EXISTS settings;
CREATE TABLE settings (
    company_name TEXT,
    config_key TEXT,
    config_value TEXT,
    PRIMARY KEY (company_name, config_key)
);

DROP TABLE IF EXISTS logs;
CREATE TABLE logs (
    id TEXT PRIMARY KEY,
    company_name TEXT,
    date DATETIME,
    job_id TEXT,
    customer_name TEXT,
    material_name TEXT,
    quantity REAL,
    unit TEXT,
    logged_by TEXT,
    json_data TEXT
);
