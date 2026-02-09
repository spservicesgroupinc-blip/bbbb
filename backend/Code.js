
/**
 * RFE APP BACKEND - V8.7 (Lifetime Stats & Maintenance Tracking)
 */

// ... (Constants and Helpers remain the same, omitting for brevity) ...
// NOTE: Re-pasting critical sections with updates.

const CONSTANTS = {
    ROOT_FOLDER_NAME: "RFE App Data",
    MASTER_DB_NAME: "RFE Master Login DB",
    TAB_ESTIMATES: "Estimates_DB",
    TAB_CUSTOMERS: "Customers_DB",
    TAB_SETTINGS: "Settings_DB",
    TAB_INVENTORY: "Inventory_DB",
    TAB_EQUIPMENT: "Equipment_DB",
    TAB_PNL: "Profit_Loss_DB",
    TAB_LOGS: "Material_Log_DB",
    COL_JSON_ESTIMATE: 9,
    COL_JSON_CUSTOMER: 10,
    COL_JSON_INVENTORY: 6,
    COL_JSON_EQUIPMENT: 4
};

const safeParse = (str) => {
    if (!str || str === "") return null;
    try { return JSON.parse(str); } catch (e) { return null; }
};

const SECRET_SALT = "rfe_salt_v1";

function generateToken(username, role) {
    const expiry = new Date().getTime() + (1000 * 60 * 60 * 24 * 7);
    const data = `${username}:${role}:${expiry}`;
    const signature = Utilities.base64Encode(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, data, SECRET_SALT));
    return Utilities.base64Encode(`${data}::${signature}`);
}

function validateToken(token) {
    if (!token) return null;
    try {
        const decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
        const parts = decoded.split("::");
        if (parts.length !== 2) return null;
        const data = parts[0];
        const signature = parts[1];
        const expectedSig = Utilities.base64Encode(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, data, SECRET_SALT));
        if (signature !== expectedSig) return null;
        const [user, role, expiry] = data.split(":");
        if (new Date().getTime() > parseInt(expiry)) return null;
        return { username: user, role: role };
    } catch (e) { return null; }
}

function doPost(e) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(45000)) return sendResponse('error', 'Server busy. Please try again.');
    try {
        if (!e?.postData) throw new Error("No payload.");
        const req = JSON.parse(e.postData.contents);
        const { action, payload } = req;
        let result;
        if (action === 'LOGIN') result = handleLogin(payload);
        else if (action === 'SIGNUP') result = handleSignup(payload);
        else if (action === 'CREW_LOGIN') result = handleCrewLogin(payload);
        else if (action === 'SUBMIT_TRIAL') result = handleSubmitTrial(payload);
        else if (action === 'LOG_TIME') result = handleLogTime(payload);
        else if (action === 'UPDATE_PASSWORD') result = handleUpdatePassword(payload);
        else {
            if (!payload.spreadsheetId) throw new Error("Auth Error: Missing Sheet ID");
            const userSS = SpreadsheetApp.openById(payload.spreadsheetId);
            switch (action) {
                case 'SYNC_DOWN': result = handleSyncDown(userSS); break;
                case 'SYNC_UP': result = handleSyncUp(userSS, payload); break;
                case 'START_JOB': result = handleStartJob(userSS, payload); break;
                case 'COMPLETE_JOB': result = handleCompleteJob(userSS, payload); break;
                case 'MARK_JOB_PAID': result = handleMarkJobPaid(userSS, payload); break;
                case 'DELETE_ESTIMATE': result = handleDeleteEstimate(userSS, payload); break;
                case 'SAVE_PDF': result = handleSavePdf(userSS, payload); break;
                case 'UPLOAD_IMAGE': result = handleUploadImage(userSS, payload); break;
                case 'CREATE_WORK_ORDER': result = handleCreateWorkOrder(userSS, payload); break;
                default: throw new Error(`Unknown Action: ${action}`);
            }
        }
        return sendResponse('success', result);
    } catch (error) {
        console.error("API Error", error);
        return sendResponse('error', error.toString());
    } finally { lock.releaseLock(); }
}

function sendResponse(status, data) {
    return ContentService.createTextOutput(JSON.stringify({ status, [status === 'success' ? 'data' : 'message']: data })).setMimeType(ContentService.MimeType.JSON);
}

// ... Infrastructure functions (getRootFolder, getMasterSpreadsheet, ensureSheet, hashPassword, handleSignup, createCompanyResources, setupUserSheetSchema, handleLogin, handleCrewLogin, handleUpdatePassword) remain identical ...
// Assuming they are present as per previous file content. 
// Just ensuring `setupUserSheetSchema` includes `lifetime_usage` row if missing.

function getRootFolder() {
    const folders = DriveApp.getFoldersByName(CONSTANTS.ROOT_FOLDER_NAME);
    if (folders.hasNext()) return folders.next();
    return DriveApp.createFolder(CONSTANTS.ROOT_FOLDER_NAME);
}

function getMasterSpreadsheet() {
    const root = getRootFolder();
    const files = root.getFilesByName(CONSTANTS.MASTER_DB_NAME);
    if (files.hasNext()) return SpreadsheetApp.open(files.next());
    const ss = SpreadsheetApp.create(CONSTANTS.MASTER_DB_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(root);
    ensureSheet(ss, "Users_DB", ["Username", "PasswordHash", "CompanyName", "SpreadsheetID", "FolderID", "CreatedAt", "CrewCode", "Email"]);
    ensureSheet(ss, "Trial_Memberships", ["Name", "Email", "Phone", "Timestamp"]);
    return ss;
}

function ensureSheet(ss, n, h) {
    let s = ss.getSheetByName(n);
    if (!s) {
        s = ss.insertSheet(n);
        s.appendRow(h);
        s.setFrozenRows(1);
        s.getRange(1, 1, 1, h.length).setFontWeight("bold");
    }
    return s;
}

function hashPassword(p) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p + "rfe_salt_v1")); }

function handleSignup(p) {
    const ss = getMasterSpreadsheet();
    const sh = ss.getSheetByName("Users_DB");
    const e = sh.getRange("A:A").createTextFinder(p.username.trim()).matchEntireCell(true).findNext();
    if (e) throw new Error("Username already taken.");
    const crewPin = Math.floor(1000 + Math.random() * 9000).toString();
    const r = createCompanyResources(p.companyName, p.username, crewPin, p.email);
    sh.appendRow([p.username.trim(), hashPassword(p.password), p.companyName, r.ssId, r.folderId, new Date(), crewPin, p.email]);
    return { username: p.username, companyName: p.companyName, spreadsheetId: r.ssId, folderId: r.folderId, role: 'admin', token: generateToken(p.username, 'admin'), crewPin: crewPin };
}

function createCompanyResources(companyName, username, crewPin, email) {
    const root = getRootFolder();
    const safeName = companyName.replace(/[^a-zA-Z0-9 ]/g, "").trim();
    const companyFolder = root.createFolder(`${safeName} Data`);
    const ss = SpreadsheetApp.create(`${companyName} - Master Data`);
    DriveApp.getFileById(ss.getId()).moveTo(companyFolder);
    const initialProfile = { companyName: companyName, crewAccessPin: crewPin, email: email || "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "", zip: "", website: "", logoUrl: "" };
    setupUserSheetSchema(ss, initialProfile);
    return { ssId: ss.getId(), folderId: companyFolder.getId() };
}

function setupUserSheetSchema(ss, initialProfile) {
    ensureSheet(ss, CONSTANTS.TAB_CUSTOMERS, ["ID", "Name", "Address", "City", "State", "Zip", "Phone", "Email", "Status", "JSON_DATA"]);
    ensureSheet(ss, CONSTANTS.TAB_ESTIMATES, ["ID", "Date", "Customer", "Total Value", "Status", "Invoice #", "Material Cost", "PDF Link", "JSON_DATA"]);
    ensureSheet(ss, CONSTANTS.TAB_INVENTORY, ["ID", "Name", "Quantity", "Unit", "Unit Cost", "JSON_DATA"]);
    ensureSheet(ss, CONSTANTS.TAB_EQUIPMENT, ["ID", "Name", "Status", "JSON_DATA"]);
    const settingsSheet = ensureSheet(ss, CONSTANTS.TAB_SETTINGS, ["Config_Key", "JSON_Value"]);
    if (initialProfile && settingsSheet.getLastRow() === 1) {
        settingsSheet.appendRow(['companyProfile', JSON.stringify(initialProfile)]);
        settingsSheet.appendRow(['warehouse_counts', JSON.stringify({ openCellSets: 0, closedCellSets: 0 })]);
        settingsSheet.appendRow(['lifetime_usage', JSON.stringify({ openCell: 0, closedCell: 0 })]);
        settingsSheet.appendRow(['costs', JSON.stringify({ openCell: 2000, closedCell: 2600, laborRate: 85 })]);
        // Updated Default Yields with Stroke Counts
        settingsSheet.appendRow(['yields', JSON.stringify({ openCell: 16000, closedCell: 4000, openCellStrokes: 6600, closedCellStrokes: 6600 })]);
    }
    ensureSheet(ss, CONSTANTS.TAB_PNL, ["Date Paid", "Job ID", "Customer", "Invoice #", "Revenue", "Chem Cost", "Labor Cost", "Inv Cost", "Misc Cost", "Total COGS", "Net Profit", "Margin %"]);
    ensureSheet(ss, CONSTANTS.TAB_LOGS, ["Date", "Job ID", "Customer", "Material Name", "Quantity", "Unit", "Logged By", "JSON_DATA"]);
    const sheet1 = ss.getSheetByName("Sheet1");
    if (sheet1) ss.deleteSheet(sheet1);
}

function handleLogin(p) {
    const ss = getMasterSpreadsheet();
    const sh = ss.getSheetByName("Users_DB");
    const f = sh.getRange("A:A").createTextFinder(p.username.trim()).matchEntireCell(true).findNext();
    if (!f) throw new Error("User not found.");
    const r = f.getRow();
    const d = sh.getRange(r, 1, 1, 7).getValues()[0];
    if (String(d[1]) !== hashPassword(p.password)) throw new Error("Incorrect password.");
    return { username: d[0], companyName: d[2], spreadsheetId: d[3], folderId: d[4], role: 'admin', token: generateToken(d[0], 'admin') };
}

function handleCrewLogin(p) {
    const ss = getMasterSpreadsheet();
    const sh = ss.getSheetByName("Users_DB");
    const f = sh.getRange("A:A").createTextFinder(p.username.trim()).matchEntireCell(true).findNext();
    if (!f) throw new Error("Company ID not found.");
    const r = f.getRow();
    const d = sh.getRange(r, 1, 1, 7).getValues()[0];
    if (String(d[6]).trim() !== String(p.pin).trim()) throw new Error("Invalid Crew PIN.");
    return { username: d[0], companyName: d[2], spreadsheetId: d[3], folderId: d[4], role: 'crew', token: generateToken(d[0], 'crew') };
}

function handleUpdatePassword(p) {
    const ss = getMasterSpreadsheet();
    const sh = ss.getSheetByName("Users_DB");
    const f = sh.getRange("A:A").createTextFinder(p.username.trim()).matchEntireCell(true).findNext();
    if (!f) throw new Error("User not found.");
    const r = f.getRow();
    const currentHash = sh.getRange(r, 2).getValue();
    if (String(currentHash) !== hashPassword(p.currentPassword)) throw new Error("Incorrect current password.");
    sh.getRange(r, 2).setValue(hashPassword(p.newPassword));
    return { success: true };
}

function handleSyncDown(ss) {
    setupUserSheetSchema(ss, null);
    const getSheetData = (name, jsonCol) => {
        const s = ss.getSheetByName(name);
        if (!s || s.getLastRow() <= 1) return [];
        const range = s.getRange(2, jsonCol, s.getLastRow() - 1, 1);
        const values = range.getValues();
        return values.map(r => safeParse(r[0])).filter(Boolean);
    };
    const settings = {};
    const setSheet = ss.getSheetByName(CONSTANTS.TAB_SETTINGS);
    if (setSheet && setSheet.getLastRow() > 1) {
        const data = setSheet.getRange(2, 1, setSheet.getLastRow() - 1, 2).getValues();
        data.forEach(row => { if (row[0] && row[1]) settings[row[0]] = safeParse(row[1]); });
    }
    const foamCounts = settings['warehouse_counts'] || settings['warehouse'] || { openCellSets: 0, closedCellSets: 0 };
    const lifetimeUsage = settings['lifetime_usage'] || { openCell: 0, closedCell: 0 };
    
    const inventoryItems = getSheetData(CONSTANTS.TAB_INVENTORY, CONSTANTS.COL_JSON_INVENTORY);
    const equipmentItems = getSheetData(CONSTANTS.TAB_EQUIPMENT, CONSTANTS.COL_JSON_EQUIPMENT);
    const assembledWarehouse = { openCellSets: foamCounts.openCellSets || 0, closedCellSets: foamCounts.closedCellSets || 0, items: inventoryItems || [] };
    const savedEstimates = getSheetData(CONSTANTS.TAB_ESTIMATES, CONSTANTS.COL_JSON_ESTIMATE);
    const customers = getSheetData(CONSTANTS.TAB_CUSTOMERS, CONSTANTS.COL_JSON_CUSTOMER);
    let materialLogs = [];
    const logSheet = ss.getSheetByName(CONSTANTS.TAB_LOGS);
    if (logSheet && logSheet.getLastRow() > 1) {
        const d = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 8).getValues();
        materialLogs = d.map(r => safeParse(r[7])).filter(Boolean);
    }
    return { ...settings, warehouse: assembledWarehouse, lifetimeUsage, equipment: equipmentItems, savedEstimates, customers, materialLogs };
}

function handleSyncUp(ss, payload) {
    const { state } = payload;
    
    // --- SAFEGUARD: SANITIZE LARGE PAYLOADS ---
    // Google Sheets cells have a ~50k char limit.
    // If a logo is stored as a Base64 string in `companyProfile.logoUrl`, it might exceed this.
    // We check if the logoUrl is excessively large (likely Base64) and clear it if so to prevent sync crash.
    // The frontend should have uploaded it to Drive and sent a short URL, but this is a failsafe.
    if (state.companyProfile && state.companyProfile.logoUrl && state.companyProfile.logoUrl.length > 40000) {
        // Log this occurrence in execution transcript if debugging
        console.warn("Logo URL too long, sanitizing to prevent crash.");
        state.companyProfile.logoUrl = ""; 
    }
    // ------------------------------------------

    reconcileCompletedJobs(ss, state);
    setupUserSheetSchema(ss, null);
    
    // Save Settings
    const settingsKeys = ['companyProfile', 'yields', 'costs', 'expenses', 'jobNotes', 'purchaseOrders', 'sqFtRates', 'pricingMode', 'lifetimeUsage'];
    const sSheet = ss.getSheetByName(CONSTANTS.TAB_SETTINGS);
    const existingData = sSheet.getDataRange().getValues();
    const settingsMap = new Map();
    existingData.forEach(r => settingsMap.set(r[0], r[1]));
    settingsKeys.forEach(key => { if (state[key] !== undefined) settingsMap.set(key, JSON.stringify(state[key])); });
    
    if (state.warehouse) {
        settingsMap.set('warehouse_counts', JSON.stringify({ openCellSets: state.warehouse.openCellSets, closedCellSets: state.warehouse.closedCellSets }));
        if (state.warehouse.items && Array.isArray(state.warehouse.items)) {
            const iSheet = ss.getSheetByName(CONSTANTS.TAB_INVENTORY);
            if (iSheet.getLastRow() > 1) iSheet.getRange(2, 1, iSheet.getLastRow() - 1, iSheet.getLastColumn()).clearContent();
            const iRows = state.warehouse.items.map(i => [i.id, i.name, i.quantity, i.unit, i.unitCost || 0, JSON.stringify(i)]);
            if (iRows.length > 0) iSheet.getRange(2, 1, iRows.length, iRows[0].length).setValues(iRows);
        }
    }
    if (state.equipment && Array.isArray(state.equipment)) {
        const eSheet = ss.getSheetByName(CONSTANTS.TAB_EQUIPMENT);
        if (eSheet.getLastRow() > 1) eSheet.getRange(2, 1, eSheet.getLastRow() - 1, eSheet.getLastColumn()).clearContent();
        const eRows = state.equipment.map(e => [e.id, e.name, e.status, JSON.stringify(e)]);
        if (eRows.length > 0) eSheet.getRange(2, 1, eRows.length, eRows[0].length).setValues(eRows);
    }
    
    const outSettings = Array.from(settingsMap.entries()).filter(k => k[0] !== 'Config_Key');
    if (sSheet.getLastRow() > 1) sSheet.getRange(2, 1, sSheet.getLastRow() - 1, 2).clearContent();
    if (outSettings.length > 0) sSheet.getRange(2, 1, outSettings.length, 2).setValues(outSettings);
    
    if (state.customers && Array.isArray(state.customers) && state.customers.length > 0) {
        const cSheet = ss.getSheetByName(CONSTANTS.TAB_CUSTOMERS);
        if (cSheet.getLastRow() > 1) cSheet.getRange(2, 1, cSheet.getLastRow() - 1, cSheet.getLastColumn()).clearContent();
        const cRows = state.customers.map(c => [c.id || "", c.name || "", c.address || "", c.city || "", c.state || "", c.zip || "", c.phone || "", c.email || "", c.status || "Active", JSON.stringify(c)]);
        if (cRows.length) cSheet.getRange(2, 1, cRows.length, cRows[0].length).setValues(cRows);
    }
    if (state.savedEstimates && Array.isArray(state.savedEstimates) && state.savedEstimates.length > 0) {
        syncEstimatesWithLogic(ss, state.savedEstimates);
    }
    if (state.companyProfile?.crewAccessPin) {
        const master = getMasterSpreadsheet().getSheetByName("Users_DB");
        const finder = master.getRange("D:D").createTextFinder(ss.getId()).matchEntireCell(true).findNext();
        if (finder) master.getRange(finder.getRow(), 7).setValue(String(state.companyProfile.crewAccessPin));
    }
    return { synced: true };
}

function syncEstimatesWithLogic(ss, payloadEstimates) {
    const sheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const data = sheet.getDataRange().getValues();
    const dbMap = new Map();
    for (let i = 1; i < data.length; i++) {
        const jsonColIndex = CONSTANTS.COL_JSON_ESTIMATE - 1;
        if (data[i].length <= jsonColIndex) continue;
        const json = data[i][jsonColIndex];
        if (!json) continue;
        const obj = safeParse(json);
        if (obj && obj.id) dbMap.set(obj.id, obj);
    }
    payloadEstimates.forEach(incoming => {
        const existing = dbMap.get(incoming.id);
        if (existing) {
            if (existing.executionStatus === 'Completed' && incoming.executionStatus !== 'Completed') {
                incoming.executionStatus = 'Completed';
                incoming.actuals = existing.actuals;
            }
            if (existing.executionStatus === 'Completed' && incoming.executionStatus === 'Completed') {
                const existingDate = new Date(existing.actuals?.completionDate || 0).getTime();
                const incomingDate = new Date(incoming.actuals?.completionDate || 0).getTime();
                if (existingDate > incomingDate) incoming.actuals = existing.actuals;
            }
            if (existing.executionStatus === 'In Progress' && incoming.executionStatus === 'Not Started') incoming.executionStatus = 'In Progress';
            if (existing.status === 'Paid' && incoming.status !== 'Paid') incoming.status = 'Paid';
            if (existing.pdfLink && !incoming.pdfLink) incoming.pdfLink = existing.pdfLink;
            if (existing.workOrderSheetUrl && !incoming.workOrderSheetUrl) incoming.workOrderSheetUrl = existing.workOrderSheetUrl;
            if (existing.sitePhotos && existing.sitePhotos.length > 0) {
                if (!incoming.sitePhotos || incoming.sitePhotos.length === 0) incoming.sitePhotos = existing.sitePhotos;
            }
        }
        dbMap.set(incoming.id, incoming);
    });
    const output = [];
    dbMap.forEach(e => {
        output.push([e.id, e.date, e.customer?.name || "Unknown", e.totalValue || 0, e.status || "Draft", e.invoiceNumber || "", e.results?.materialCost || 0, e.pdfLink || "", JSON.stringify(e)]);
    });
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    if (output.length > 0) sheet.getRange(2, 1, output.length, output[0].length).setValues(output);
}

// ... handleStartTimer, handleUploadImage, handleSavePdf, handleCreateWorkOrder, etc. remain the same ...
function handleStartJob(ss, payload) {
    const { estimateId } = payload;
    const sheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const finder = sheet.getRange("A:A").createTextFinder(estimateId).matchEntireCell(true).findNext();
    if (finder) {
        const row = finder.getRow();
        const jsonCell = sheet.getRange(row, CONSTANTS.COL_JSON_ESTIMATE);
        const est = safeParse(jsonCell.getValue());
        if (est) {
            est.executionStatus = 'In Progress';
            if (!est.actuals) est.actuals = {};
            est.actuals.lastStartedAt = new Date().toISOString();
            jsonCell.setValue(JSON.stringify(est));
            return { success: true, status: 'In Progress' };
        }
    }
    return { success: false, message: 'Estimate not found' };
}
function handleUploadImage(ss, payload) {
    const { base64Data, folderId, fileName } = payload;
    let targetFolder;
    if (folderId) { try { targetFolder = DriveApp.getFolderById(folderId); } catch (e) { console.error("Invalid Folder ID", e); } }
    if (!targetFolder) { try { const ssFile = DriveApp.getFileById(ss.getId()); const parents = ssFile.getParents(); if (parents.hasNext()) targetFolder = parents.next(); } catch (e) { console.error("Could not find parent folder", e); } }
    if (!targetFolder) targetFolder = DriveApp.getRootFolder();
    const photoFolderName = "Job Photos";
    const subFolders = targetFolder.getFoldersByName(photoFolderName);
    let photoFolder = subFolders.hasNext() ? subFolders.next() : targetFolder.createFolder(photoFolderName);
    const encoded = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const decoded = Utilities.base64Decode(encoded);
    const blob = Utilities.newBlob(decoded, MimeType.JPEG, fileName || `photo_${new Date().getTime()}.jpg`);
    const file = photoFolder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
    const fileId = file.getId();
    const directUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    return { url: directUrl, fileId: fileId };
}
function handleSavePdf(ss, p) {
    const parentFolder = p.folderId ? DriveApp.getFolderById(p.folderId) : DriveApp.getRootFolder();
    const blob = Utilities.newBlob(Utilities.base64Decode(p.base64Data.split(',')[1]), MimeType.PDF, p.fileName);
    const file = parentFolder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
    const url = file.getUrl();
    if (p.estimateId) {
        const s = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
        const fd = s.getRange("A:A").createTextFinder(p.estimateId).matchEntireCell(true).findNext();
        if (fd) {
            s.getRange(fd.getRow(), 8).setValue(url);
            try {
                const j = safeParse(s.getRange(fd.getRow(), CONSTANTS.COL_JSON_ESTIMATE).getValue());
                if (j) { j.pdfLink = url; s.getRange(fd.getRow(), CONSTANTS.COL_JSON_ESTIMATE).setValue(JSON.stringify(j)); }
            } catch (e) { }
        }
    }
    return { success: true, url: url };
}
function handleCreateWorkOrder(ss, p) {
    let parentFolder;
    try { parentFolder = p.folderId ? DriveApp.getFolderById(p.folderId) : DriveApp.getRootFolder(); } catch (e) { parentFolder = DriveApp.getRootFolder(); }
    const est = p.estimateData;
    const safeName = est.customer?.name ? est.customer.name.replace(/[^a-zA-Z0-9 ]/g, "") : "Unknown";
    const name = `WO-${est.id.slice(0, 8).toUpperCase()} - ${safeName}`;
    const newSheet = SpreadsheetApp.create(name);
    try { DriveApp.getFileById(newSheet.getId()).moveTo(parentFolder); } catch (e) { }
    try {
        const logTab = newSheet.insertSheet("Daily Crew Log");
        logTab.appendRow(["Date", "Tech Name", "Start Time", "End Time", "Duration (Hrs)", "Sets Sprayed", "Notes"]);
        logTab.setFrozenRows(1);
        const infoSheet = newSheet.insertSheet("Job Details");
        if (newSheet.getSheetByName("Sheet1")) newSheet.deleteSheet(newSheet.getSheetByName("Sheet1"));
        const cust = est.customer || {};
        infoSheet.getRange("A1").setValue("CUSTOMER INFO").setFontWeight("bold").setBackground("#E30613").setFontColor("white");
        infoSheet.getRange("A2").setValue("Name:"); infoSheet.getRange("B2").setValue(cust.name || "");
        infoSheet.getRange("A3").setValue("Address:"); infoSheet.getRange("B3").setValue(`${cust.address || ""}, ${cust.city || ""} ${cust.state || ""} ${cust.zip || ""}`);
        infoSheet.getRange("A4").setValue("Phone:"); infoSheet.getRange("B4").setValue(cust.phone || "");
        infoSheet.getRange("A7").setValue("JOB SCOPE").setFontWeight("bold").setBackground("#E30613").setFontColor("white");
        let row = 8;
        if (est.results?.totalWallArea > 0) { infoSheet.getRange(row, 1).setValue("Walls:"); infoSheet.getRange(row, 2).setValue(`${est.wallSettings?.type || "Foam"} (${est.wallSettings?.thickness || 0}")`); infoSheet.getRange(row, 3).setValue(`${Math.round(est.results.totalWallArea)} sqft`); row++; }
        if (est.results?.totalRoofArea > 0) { infoSheet.getRange(row, 1).setValue("Roof:"); infoSheet.getRange(row, 2).setValue(`${est.roofSettings?.type || "Foam"} (${est.roofSettings?.thickness || 0}")`); infoSheet.getRange(row, 3).setValue(`${Math.round(est.results.totalRoofArea)} sqft`); row++; }
        row++; infoSheet.getRange(row, 1).setValue("MATERIALS LOAD LIST").setFontWeight("bold").setBackground("#E30613").setFontColor("white"); row++;
        if (est.materials?.openCellSets > 0) { infoSheet.getRange(row, 1).setValue("Open Cell Sets:"); infoSheet.getRange(row, 2).setValue(Number(est.materials.openCellSets).toFixed(2)); row++; }
        if (est.materials?.closedCellSets > 0) { infoSheet.getRange(row, 1).setValue("Closed Cell Sets:"); infoSheet.getRange(row, 2).setValue(Number(est.materials.closedCellSets).toFixed(2)); row++; }
        if (est.materials?.inventory && Array.isArray(est.materials.inventory)) { est.materials.inventory.forEach(i => { infoSheet.getRange(row, 1).setValue(i.name || "Item"); infoSheet.getRange(row, 2).setValue(`${i.quantity || 0} ${i.unit || ""}`); row++; }); }
        if (est.materials?.equipment && Array.isArray(est.materials.equipment)) { row++; infoSheet.getRange(row, 1).setValue("EQUIPMENT ASSIGNED").setFontWeight("bold").setBackground("#E30613").setFontColor("white"); row++; est.materials.equipment.forEach(e => { infoSheet.getRange(row, 1).setValue(e.name || "Tool"); infoSheet.getRange(row, 2).setValue("Assigned"); row++; }); }
        row++; infoSheet.getRange(row, 1).setValue("JOB NOTES").setFontWeight("bold").setBackground("#E30613").setFontColor("white"); row++; infoSheet.getRange(row, 1).setValue(est.notes || "No notes.");
        infoSheet.autoResizeColumns(1, 3);
    } catch (err) { console.error("Error populating work order sheet: " + err.toString()); }
    return { url: newSheet.getUrl() };
}

// Updated handleCompleteJob with Lifetime Stats
function handleCompleteJob(ss, payload) {
    const { estimateId, actuals } = payload;
    const estSheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const finder = estSheet.getRange("A:A").createTextFinder(estimateId).matchEntireCell(true).findNext();
    if (!finder) throw new Error("Estimate not found");
    const row = finder.getRow();
    const est = safeParse(estSheet.getRange(row, CONSTANTS.COL_JSON_ESTIMATE).getValue());
    
    if (est.executionStatus === 'Completed' && est.inventoryProcessed) { return { success: true, message: "Already completed" }; }

    // 1. UPDATE WAREHOUSE & LIFETIME COUNTS (Settings DB)
    const setSheet = ss.getSheetByName(CONSTANTS.TAB_SETTINGS);
    const setRows = setSheet.getDataRange().getValues();
    
    let countRow = -1;
    let counts = { openCellSets: 0, closedCellSets: 0 };
    let lifeRow = -1;
    let lifeStats = { openCell: 0, closedCell: 0 }; // Default to 0

    for (let i = 0; i < setRows.length; i++) {
        if (setRows[i][0] === 'warehouse_counts' || setRows[i][0] === 'warehouse') {
            counts = safeParse(setRows[i][1]) || counts;
            countRow = i + 1;
        }
        if (setRows[i][0] === 'lifetime_usage') {
            lifeStats = safeParse(setRows[i][1]) || lifeStats;
            lifeRow = i + 1;
        }
    }

    const ocUsed = Number(actuals.openCellSets) || 0;
    const ccUsed = Number(actuals.closedCellSets) || 0;

    // Deduct Warehouse
    if (countRow !== -1) {
        counts.openCellSets = (counts.openCellSets || 0) - ocUsed;
        counts.closedCellSets = (counts.closedCellSets || 0) - ccUsed;
        setSheet.getRange(countRow, 2).setValue(JSON.stringify(counts));
    }

    // Increment Lifetime
    lifeStats.openCell = (lifeStats.openCell || 0) + ocUsed;
    lifeStats.closedCell = (lifeStats.closedCell || 0) + ccUsed;
    
    if (lifeRow !== -1) {
        setSheet.getRange(lifeRow, 2).setValue(JSON.stringify(lifeStats));
    } else {
        setSheet.appendRow(['lifetime_usage', JSON.stringify(lifeStats)]);
    }

    // 2. UPDATE INVENTORY ITEMS (Inventory DB)
    if (actuals.inventory && actuals.inventory.length > 0) {
        const invSheet = ss.getSheetByName(CONSTANTS.TAB_INVENTORY);
        const invData = invSheet.getDataRange().getValues();
        const invMap = new Map();
        for (let i = 1; i < invData.length; i++) { invMap.set(invData[i][0], i + 1); }
        actuals.inventory.forEach(actItem => {
            let rowIdx = invMap.get(actItem.id);
            if (rowIdx) {
                const currentJson = safeParse(invSheet.getRange(rowIdx, CONSTANTS.COL_JSON_INVENTORY).getValue());
                if (currentJson) {
                    const actQty = Number(actItem.quantity) || 0;
                    currentJson.quantity = (currentJson.quantity || 0) - actQty;
                    invSheet.getRange(rowIdx, 3).setValue(currentJson.quantity);
                    invSheet.getRange(rowIdx, CONSTANTS.COL_JSON_INVENTORY).setValue(JSON.stringify(currentJson));
                }
            }
        });
    }

    // 3. UPDATE EQUIPMENT LOGS (Equipment DB)
    const equipmentUsed = est.materials?.equipment || [];
    if (equipmentUsed.length > 0) {
        const eqSheet = ss.getSheetByName(CONSTANTS.TAB_EQUIPMENT);
        if (eqSheet && eqSheet.getLastRow() > 1) {
            const eqData = eqSheet.getDataRange().getValues();
            const eqMap = new Map();
            for (let i = 1; i < eqData.length; i++) { eqMap.set(eqData[i][0], i + 1); }
            equipmentUsed.forEach(eqItem => {
                let rowIdx = eqMap.get(eqItem.id);
                if (rowIdx) {
                    const currentJson = safeParse(eqSheet.getRange(rowIdx, CONSTANTS.COL_JSON_EQUIPMENT).getValue());
                    if (currentJson) {
                        currentJson.lastSeen = { jobId: estimateId, customerName: est.customer?.name || "Unknown", date: actuals.completionDate || new Date().toISOString(), crewMember: actuals.completedBy || "Crew" };
                        currentJson.status = 'Available';
                        eqSheet.getRange(rowIdx, 3).setValue('Available');
                        eqSheet.getRange(rowIdx, CONSTANTS.COL_JSON_EQUIPMENT).setValue(JSON.stringify(currentJson));
                    }
                }
            });
        }
    }

    // 4. ADD TO MATERIAL LOGS (Logs DB)
    const logSheet = ss.getSheetByName(CONSTANTS.TAB_LOGS);
    if (logSheet) {
        const newLogs = [];
        const date = actuals.completionDate || new Date().toISOString();
        const custName = est.customer?.name || "Unknown";
        const tech = actuals.completedBy || "Crew";
        const addLog = (name, qty, unit) => {
            if (Number(qty) > 0) {
                const entry = { id: Utilities.getUuid(), date, jobId: estimateId, customerName: custName, materialName: name, quantity: Number(qty), unit, loggedBy: tech };
                newLogs.push([new Date(date), estimateId, custName, name, Number(qty), unit, tech, JSON.stringify(entry)]);
            }
        };
        addLog("Open Cell Foam", actuals.openCellSets, "Sets");
        addLog("Closed Cell Foam", actuals.closedCellSets, "Sets");
        if (actuals.inventory) { actuals.inventory.forEach(i => addLog(i.name, i.quantity, i.unit)); }
        if (newLogs.length > 0) { logSheet.getRange(logSheet.getLastRow() + 1, 1, newLogs.length, newLogs[0].length).setValues(newLogs); }
    }

    // 5. UPDATE ESTIMATE RECORD
    est.executionStatus = 'Completed';
    est.actuals = actuals;
    est.inventoryProcessed = true; 
    est.lastModified = new Date().toISOString();
    estSheet.getRange(row, CONSTANTS.COL_JSON_ESTIMATE).setValue(JSON.stringify(est));
    SpreadsheetApp.flush();
    return { success: true };
}

function handleSubmitTrial(p) { getMasterSpreadsheet().getSheetByName("Trial_Memberships").appendRow([p.name, p.email, p.phone, new Date()]); return { success: true }; }
function handleLogTime(p) { const ss = SpreadsheetApp.openByUrl(p.workOrderUrl); const s = ss.getSheetByName("Daily Crew Log"); s.appendRow([new Date().toLocaleDateString(), p.user, new Date(p.startTime).toLocaleTimeString(), p.endTime ? new Date(p.endTime).toLocaleTimeString() : "", "", "", ""]); return { success: true }; }
function handleDeleteEstimate(ss, p) { const s = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES); const f = s.getRange("A:A").createTextFinder(p.estimateId).matchEntireCell(true).findNext(); if (f) s.deleteRow(f.getRow()); return { success: true }; }
function handleMarkJobPaid(ss, payload) {
    const { estimateId } = payload;
    const estSheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const finder = estSheet.getRange("A:A").createTextFinder(estimateId).matchEntireCell(true).findNext();
    if (!finder) throw new Error("Estimate ID not found");
    const row = finder.getRow();
    const est = safeParse(estSheet.getRange(row, CONSTANTS.COL_JSON_ESTIMATE).getValue());
    const setSheet = ss.getSheetByName(CONSTANTS.TAB_SETTINGS);
    let costs = { openCell: 0, closedCell: 0, laborRate: 0 };
    setSheet.getDataRange().getValues().forEach(r => { if (r[0] === 'costs') costs = safeParse(r[1]) || costs; });
    const act = est.actuals || est.materials || {};
    const oc = Number(act.openCellSets || 0); const cc = Number(act.closedCellSets || 0); const chemCost = (oc * costs.openCell) + (cc * costs.closedCell);
    const labHrs = Number(act.laborHours || est.expenses.manHours || 0); const labCost = labHrs * (est.expenses.laborRate || costs.laborRate || 0);
    let invCost = 0; (act.inventory || est.materials.inventory || []).forEach(i => invCost += (Number(i.quantity) * Number(i.unitCost || 0)));
    const misc = (est.expenses.tripCharge || 0) + (est.expenses.fuelSurcharge || 0);
    const revenue = Number(est.totalValue) || 0; const totalCOGS = chemCost + labCost + invCost + misc;
    est.status = 'Paid';
    est.financials = { revenue, chemicalCost: chemCost, laborCost: labCost, inventoryCost: invCost, miscCost: misc, totalCOGS, netProfit: revenue - totalCOGS, margin: revenue ? (revenue - totalCOGS) / revenue : 0 };
    estSheet.getRange(row, 5).setValue('Paid'); estSheet.getRange(row, CONSTANTS.COL_JSON_ESTIMATE).setValue(JSON.stringify(est));
    ss.getSheetByName(CONSTANTS.TAB_PNL).appendRow([new Date(), est.id, est.customer?.name, est.invoiceNumber, revenue, chemCost, labCost, invCost, misc, totalCOGS, est.financials.netProfit, est.financials.margin]);
    return { success: true, estimate: est };
}
function reconcileCompletedJobs(ss, incomingState) {
    if (!incomingState.savedEstimates) return;
    const sheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const data = sheet.getDataRange().getValues();
    const dbMap = new Map();
    for (let i = 1; i < data.length; i++) {
        const jsonColIndex = CONSTANTS.COL_JSON_ESTIMATE - 1;
        if (data[i].length <= jsonColIndex) continue;
        const json = data[i][jsonColIndex];
        if (!json || json === "") continue;
        const obj = safeParse(json);
        if (obj && obj.id) dbMap.set(obj.id, obj);
    }
    incomingState.savedEstimates.forEach((incomingEst, idx) => {
        const dbEst = dbMap.get(incomingEst.id);
        if (dbEst) {
            if (dbEst.executionStatus === 'Completed' && incomingEst.executionStatus !== 'Completed') {
                incomingState.savedEstimates[idx] = dbEst;
            }
        }
    });
}
