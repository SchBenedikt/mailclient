export type SavedServerConfig = {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
};

const SERVER_CONFIG_KEY = 'mailclient:serverConfig';
const SESSION_KEY = 'mailclient:session';

export const saveServerConfig = (cfg: SavedServerConfig) => {
  try {
    localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.warn('Failed to save server config', e);
  }
};

export const loadServerConfig = (): SavedServerConfig | null => {
  try {
    const raw = localStorage.getItem(SERVER_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load server config', e);
    return null;
  }
};

export const saveSession = (sessionId: string) => {
  try {
    localStorage.setItem(SESSION_KEY, sessionId);
  } catch (e) {
    console.warn('Failed to save session', e);
  }
};

export const loadSession = (): string | null => {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch (e) {
    console.warn('Failed to load session', e);
    return null;
  }
};

export const clearSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    console.warn('Failed to clear session', e);
  }
};
