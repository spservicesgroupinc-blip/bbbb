
import { API_BASE_URL } from '../constants';
import { CalculatorState, EstimateRecord, UserSession } from '../types';

interface ApiResponse {
  status: 'success' | 'error';
  data?: any;
  message?: string;
}

// Get stored auth token
const getAuthToken = (): string | null => {
  try {
    const session = localStorage.getItem('userSession');
    if (session) {
      const parsed = JSON.parse(session);
      return parsed.token || null;
    }
  } catch { /* ignore */ }
  return null;
};

/**
 * Helper for making fetch requests to Cloudflare Worker
 * Includes retry logic for network issues
 */
const apiRequest = async (endpoint: string, payload: any, retries = 2, requiresAuth = true): Promise<ApiResponse> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (requiresAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: `HTTP Error: ${response.status}` }));
      throw new Error(errorData.message || `HTTP Error: ${response.status}`);
    }

    const result: ApiResponse = await response.json();
    return result;
  } catch (error: any) {
    if (retries > 0) {
      console.warn(`API Request Failed, retrying... (${retries} left)`);
      await new Promise(res => setTimeout(res, 1000));
      return apiRequest(endpoint, payload, retries - 1, requiresAuth);
    }
    console.error("API Request Failed:", error);
    return { status: 'error', message: error.message || "Network request failed" };
  }
};

/**
 * Legacy API request using action-based payload (for gradual migration)
 */
const legacyApiRequest = async (action: string, payload: any): Promise<ApiResponse> => {
  const token = getAuthToken();
  return apiRequest('/', { action, payload: { ...payload, token } }, 2, false);
};

/**
 * Fetches the full application state from the backend
 */
export const syncDown = async (spreadsheetId?: string): Promise<Partial<CalculatorState> | null> => {
  const result = await apiRequest('/sync/down', {});

  if (result.status === 'success') {
    return result.data;
  } else {
    console.error("Sync Down Error:", result.message);
    return null;
  }
};

/**
 * Pushes the full application state to the backend
 */
export const syncUp = async (state: CalculatorState, spreadsheetId?: string): Promise<boolean> => {
  const result = await apiRequest('/sync/up', { state });
  return result.status === 'success';
};

/**
 * Marks job as paid and triggers P&L calculation on backend
 */
export const markJobPaid = async (estimateId: string, spreadsheetId?: string): Promise<{ success: boolean, estimate?: EstimateRecord }> => {
  const result = await apiRequest('/jobs/paid', { estimateId });
  return { success: result.status === 'success', estimate: result.data?.estimate };
};

/**
 * Creates a standalone Work Order (placeholder - may need different implementation)
 */
export const createWorkOrderSheet = async (estimateData: EstimateRecord, folderId: string | undefined, spreadsheetId?: string): Promise<string | null> => {
  // Work orders will be handled differently in Cloudflare - could generate a PDF instead
  console.warn("createWorkOrderSheet: Not implemented in Cloudflare backend");
  return null;
};

/**
 * Logs crew time (placeholder)
 */
export const logCrewTime = async (workOrderUrl: string, startTime: string, endTime: string | null, user: string): Promise<boolean> => {
  console.warn("logCrewTime: Not implemented in Cloudflare backend");
  return false;
};

/**
 * Marks job as complete and syncs inventory
 */
export const completeJob = async (estimateId: string, actuals: any, spreadsheetId?: string): Promise<boolean> => {
  const result = await apiRequest('/jobs/complete', { estimateId, actuals });
  return result.status === 'success';
};

/**
 * Starts a job
 */
export const startJob = async (estimateId: string, spreadsheetId?: string): Promise<boolean> => {
  const result = await apiRequest('/jobs/start', { estimateId });
  return result.status === 'success';
};

/**
 * Deletes an estimate
 */
export const deleteEstimate = async (estimateId: string, spreadsheetId?: string): Promise<boolean> => {
  const result = await apiRequest('/jobs/delete', { estimateId });
  return result.status === 'success';
};

/**
 * Uploads a PDF to storage
 */
export const savePdfToDrive = async (fileName: string, base64Data: string, estimateId: string | undefined, spreadsheetId?: string, folderId?: string) => {
  const result = await apiRequest('/jobs/save-pdf', { fileName, base64Data, estimateId });
  return result.status === 'success' ? `${API_BASE_URL}${result.data.url}` : null;
};

/**
 * Uploads an image to storage and returns the direct link
 */
export const uploadImage = async (base64Data: string, spreadsheetId?: string, fileName: string = 'image.jpg'): Promise<string | null> => {
  const result = await apiRequest('/jobs/upload-image', { base64Data, fileName });
  return result.status === 'success' ? `${API_BASE_URL}${result.data.url}` : null;
};

/**
 * Authenticates user against backend
 */
export const loginUser = async (username: string, password: string): Promise<UserSession | null> => {
  const result = await apiRequest('/auth/login', { username, password }, 2, false);
  if (result.status === 'success') return result.data;
  throw new Error(result.message || "Login failed");
};

/**
 * Authenticates crew member using PIN (placeholder)
 */
export const loginCrew = async (username: string, pin: string): Promise<UserSession | null> => {
  // TODO: Implement crew login in Cloudflare backend
  throw new Error("Crew login not yet implemented");
};

/**
 * Creates a new company account
 */
export const signupUser = async (username: string, password: string, companyName: string, email?: string): Promise<UserSession | null> => {
  const result = await apiRequest('/auth/signup', { username, password, companyName, email }, 2, false);
  if (result.status === 'success') return result.data;
  throw new Error(result.message || "Signup failed");
};

/**
 * Submits lead for trial access (placeholder)
 */
export const submitTrial = async (name: string, email: string, phone: string): Promise<boolean> => {
  // TODO: Implement trial submission
  console.warn("submitTrial: Not implemented in Cloudflare backend");
  return false;
};
