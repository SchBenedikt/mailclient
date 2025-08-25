import React, { createContext, useContext, useState, ReactNode, useRef } from 'react';
import { EmailAccount, EmailMessage, Folder, WebDeServerConfig } from '@/types/email';
import { useToast } from '@/components/ui/use-toast';

interface EmailContextType {
  account: EmailAccount | null;
  emails: EmailMessage[];
  selectedEmail: EmailMessage | null;
  folders: Folder[];
  isLoading: boolean;
  fetchingEmailId: string | null;
  login: (email: string, password: string, serverConfig?: WebDeServerConfig) => Promise<string | false>;
  logout: () => void;
  selectEmail: (email: EmailMessage | null) => void;
  markAsRead: (id: string) => void;
  isConnecting: boolean;
  sessionId: string | null;
  currentFolder: string;
  setCurrentFolder: (folder: string) => void;
  fetchEmails: (folder?: string) => Promise<void>;
  fetchEmail: (id: string) => Promise<void>;
  sendEmail: (emailData: any) => Promise<void>;
  forwardEmail: (forwardData: any) => Promise<void>;
  deleteEmail: (id: string) => Promise<void>;
  restoreSession: (sessionId: string) => Promise<boolean>;
}

// Standard Konfiguration für Web.de als Fallback
const DEFAULT_CONFIG: WebDeServerConfig = {
  imap: {
    host: 'imap.web.de',
    port: 993,
    secure: true,
  },
  smtp: {
    host: 'smtp.web.de',
    port: 587,
    secure: false, // STARTTLS
  }
};

// API URL - prefer VITE_API_URL, otherwise default to backend on port 3000
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_BASE}/api`;

const EmailContext = createContext<EmailContextType | undefined>(undefined);

export function EmailProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState('INBOX');
  const [folders, setFolders] = useState<Folder[]>([
    { id: 'INBOX', name: 'Inbox', unread: 0 },
    { id: 'Sent', name: 'Sent', unread: 0 },
    { id: 'Drafts', name: 'Drafts', unread: 0 },
    { id: 'Trash', name: 'Trash', unread: 0 },
    { id: 'Spam', name: 'Spam', unread: 0 },
  ]);
  const [fetchingEmailId, setFetchingEmailId] = useState<string | null>(null);
  const { toast } = useToast();

  const login = async (email: string, password: string, serverConfig?: WebDeServerConfig) => {
    // Verwende die übergebene Server-Konfiguration oder die Standardkonfiguration
    const config = serverConfig || DEFAULT_CONFIG;
    
    setIsLoading(true);
    setIsConnecting(true);
    
    try {
      // Verbindung zum IMAP-Server über unseren Backend herstellen
      const response = await fetch(`${API_URL}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          host: config.imap.host,
          port: config.imap.port,
          secure: config.imap.secure,
        }),
      });
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Not JSON, likely HTML error page
        const errorText = await response.text();
        console.error('Server returned non-JSON response:', errorText);
        throw new Error('Server returned an invalid response. Please check if the server is running correctly.');
      }
      
      // Prefer explicit handling based on status codes
      const data = await response.json();

      if (response.status === 401) {
        // Authentication failure
        throw new Error('Authentication failed: please check email, password, and provider requirements (app password / IMAP enabled).');
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Anmeldung fehlgeschlagen');
      }
      
      // Session-ID für zukünftige Anfragen speichern
      setSessionId(data.sessionId);
      
      const newAccount: EmailAccount = {
        email,
        password: '', // Aus Sicherheitsgründen speichern wir das Passwort nicht im Frontend
        host: config.imap.host,
        port: config.imap.port,
        secure: config.imap.secure,
        smtpHost: config.smtp.host,
        smtpPort: config.smtp.port,
        smtpSecure: config.smtp.secure,
      };
      
      setAccount(newAccount);
      
      // Ordner abrufen
      await fetchFolders(data.sessionId);
      
      // E-Mails aus dem Posteingang abrufen
      await fetchEmails('INBOX', data.sessionId);
      
      toast({
        title: "Logged in",
        description: `Successfully signed in to ${config.imap.host}.`,
      });
      
      return data.sessionId || false;
    } catch (error) {
      console.error('Login error:', error);

      // Network-level errors
      let message = error instanceof Error ? error.message : 'Beim Anmelden ist ein Fehler aufgetreten.';

      if (message.includes('ECONNREFUSED')) {
        message = 'Connection refused to IMAP server. Check host and port, and ensure the IMAP server accepts connections.';
      } else if (message.includes('ENOTFOUND')) {
        message = 'IMAP host not found. Verify the IMAP server hostname.';
      } else if (message.toLowerCase().includes('authentication')) {
        message = 'Authentication failed. Check your email/password and whether IMAP or an app-specific password is required.';
      }

      toast({
        title: "Login failed",
        description: message,
        variant: "destructive",
      });
  return false;
    } finally {
      setIsLoading(false);
      setIsConnecting(false);
    }
  };

  const restoreSession = async (sid: string) => {
    if (!sid) return false;
    setIsLoading(true);
    try {
      setSessionId(sid);
      // Try to fetch folders and emails using the provided session id
      await fetchFolders(sid);
      await fetchEmails('INBOX', sid);
      toast({ title: 'Session restored', description: 'Restored saved session.' });
      return true;
    } catch (err) {
      console.error('Failed to restore session', err);
      // Clear session id
      setSessionId(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFolders = async (sid: string = sessionId || '') => {
    if (!sid) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/folders?sessionId=${sid}`);
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Not JSON, likely HTML error page
        const errorText = await response.text();
        console.error('Server returned non-JSON response:', errorText);
        throw new Error('Server returned an invalid response. Please check if the server is running correctly.');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Fehler beim Abrufen der Ordner');
      }
      
      // Ordner sortieren, damit INBOX (Posteingang) immer an erster Stelle steht
      const sortedFolders = [...data.folders].sort((a, b) => {
        // Wenn ein Ordner INBOX ist, kommt er an erste Stelle
        if (a.id === 'INBOX') return -1;
        if (b.id === 'INBOX') return 1;
        
        // Ansonsten alphabetisch nach Namen sortieren
        return a.name.localeCompare(b.name);
      });
      
      setFolders(sortedFolders);
    } catch (error) {
      console.error('Error fetching folders:', error);
      toast({
        title: "Error",
        description: "An error occurred while fetching folders.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmails = async (folder: string = currentFolder, sid: string = sessionId || '') => {
    if (!sid) return;
    
    setIsLoading(true);
    setCurrentFolder(folder);
    
    try {
      const response = await fetch(`${API_URL}/emails?sessionId=${sid}&folder=${folder}`);
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Not JSON, likely HTML error page
        const errorText = await response.text();
        console.error('Server returned non-JSON response:', errorText);
        throw new Error('Server returned an invalid response. Please check if the server is running correctly.');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Fehler beim Abrufen der E-Mails');
      }
      
      setEmails(data.emails);
    } catch (error) {
      console.error('Error fetching emails:', error);
      toast({
        title: "Error",
        description: "An error occurred while fetching emails.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmail = async (id: string, sid: string = sessionId || '') => {
    if (!sid) return;
    
  setIsLoading(true);
  setFetchingEmailId(id);
    
    try {
      // Prevent duplicate simultaneous fetches for the same id
      const inFlightMap = (fetchEmail as any)._inFlight || new Map<string, Promise<any>>();
      (fetchEmail as any)._inFlight = inFlightMap;

      if (inFlightMap.has(id)) {
        // Wait for the existing fetch to finish and reuse its result
        await inFlightMap.get(id);
        setIsLoading(false);
        return;
      }

      const fetchPromise = (async () => {
        // Try multiple candidate IDs in parallel (original id and possible uid fallback)
        const candidates: string[] = [id];

        // If we have local info about uid, include it
        const local = emails.find(e => e.id === id || e.uid === id);
        if (local && local.uid && !candidates.includes(local.uid)) candidates.push(local.uid);

        // Also, if id looks like a uid (large number) and we have local mapping, try to include mapped id
        const mappedId = emails.find(e => e.uid === id)?.id;
        if (mappedId && !candidates.includes(mappedId)) candidates.push(mappedId);

        // Start parallel fetches and take the first successful response
        const controllers: AbortController[] = [];
        const fetchTasks = candidates.map(candidate => {
          const ac = new AbortController();
          controllers.push(ac);
          return (async () => {
            try {
              const resp = await fetch(`${API_URL}/email/${candidate}?sessionId=${sid}&folder=${currentFolder}`, { signal: ac.signal });
              const ct = resp.headers.get('content-type') || '';
              if (!ct.includes('application/json')) {
                const txt = await resp.text();
                throw new Error('Invalid server response');
              }
              const json = await resp.json();
              if (json.success) return json;
              throw new Error(json.error || 'E-Mail nicht gefunden');
            } catch (err) {
              throw err;
            }
          })();
        });

        try {
          // firstFulfilled: resolves with the first fulfilled promise
          const firstFulfilled = (proms: Promise<any>[]) => new Promise<any>((resolve, reject) => {
            let rejected = 0;
            const errors: any[] = [];
            proms.forEach((p, idx) => {
              Promise.resolve(p).then(res => resolve(res)).catch(err => {
                errors[idx] = err;
                rejected++;
                if (rejected === proms.length) reject(errors);
              });
            });
          });

          const result = await firstFulfilled(fetchTasks);
          // Cancel other fetches
          controllers.forEach(c => c.abort());
          return result;
        } catch (aggregateErr) {
          // All parallel attempts failed — fall back to sequential retries using existing logic
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              console.log(`Fallback sequential attempt ${attempt + 1} to fetch email ${id}`);
              // Optionally refresh the local email list on second attempt
              if (attempt === 1) {
                try {
                  await fetchEmails(currentFolder, sid);
                } catch (e) {
                  // ignore
                }
              }

              // Determine effectiveId for this attempt
              let effectiveId = id;
              if (attempt === 1 && parseInt(id) > 10000) {
                const found = emails.find(e => e.id === id || e.uid === id);
                if (found) effectiveId = found.id;
              }
              if (attempt === 2) {
                const uidFallback = emails.find(e => e.id.toString() === id)?.uid;
                if (uidFallback) effectiveId = uidFallback;
              }

              const resp = await fetch(`${API_URL}/email/${effectiveId}?sessionId=${sid}&folder=${currentFolder}`);
              const ct = resp.headers.get('content-type') || '';
              if (!ct.includes('application/json')) {
                const txt = await resp.text();
                throw new Error('Invalid server response');
              }
              const json = await resp.json();
              if (json.success) return json;
              // otherwise throw and continue
              throw new Error(json.error || 'E-Mail nicht gefunden');
            } catch (err) {
              // short backoff
              await new Promise(r => setTimeout(r, 250));
              if (attempt === 2) throw err;
            }
          }
        }
      })();

      inFlightMap.set(id, fetchPromise);

      let data;
      try {
        const result = await fetchPromise;
        data = result;
      } finally {
        inFlightMap.delete(id);
      }

      const emailData = data.email;
      
      // Stelle sicher, dass die ID und UID konsistent sind
      if (emailData) {
        // Aktualisiere die E-Mails-Liste mit der geladenen E-Mail,
        // um sicherzustellen, dass wir zukünftig die richtige ID verwenden
        setEmails(prevEmails => {
          const emailIndex = prevEmails.findIndex(e => e.id === id || e.uid === id);
          if (emailIndex >= 0) {
            const updatedEmails = [...prevEmails];
            updatedEmails[emailIndex] = {
              ...updatedEmails[emailIndex],
              body: emailData.body,
              isRead: true
            };
            return updatedEmails;
          }
          return prevEmails;
        });
        
        // Setze die ausgewählte E-Mail
        selectEmail(emailData);
      } else {
        throw new Error('Die E-Mail konnte nicht geladen werden');
      }
    } catch (error) {
      console.error('Error fetching email:', error);
      toast({
        title: "Error",
        description: "An error occurred while fetching the email. " + 
                    (error instanceof Error ? error.message : ""),
        variant: "destructive",
      });
    } finally {
  setIsLoading(false);
  setFetchingEmailId(null);
    }
  };

  const sendEmail = async (emailData: any) => {
    if (!sessionId || !account) {
      toast({
        title: "Error",
        description: "You are not logged in.",
        variant: "destructive",
      });
      throw new Error("Nicht angemeldet");
    }
    
    setIsLoading(true);
    
    try {
      // Bereite SMTP-Config vor
      const smtpConfig = {
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpSecure
      };
      
      const response = await fetch(`${API_URL}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          email: {
            ...emailData,
            smtpConfig
          }
        }),
      });
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Not JSON, likely HTML error page
        const errorText = await response.text();
        console.error('Server returned non-JSON response:', errorText);
        throw new Error('Server returned an invalid response. Please check if the server is running correctly.');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Fehler beim Senden der E-Mail');
      }
      
      toast({
        title: "Email sent",
        description: "Your email was sent successfully.",
      });
      
      // Aktualisiere die gesendeten E-Mails
      if (currentFolder.toLowerCase().includes('sent')) {
        await fetchEmails(currentFolder);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred while sending the email.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const forwardEmail = async (forwardData: any) => {
    if (!sessionId || !account) {
      toast({
        title: "Fehler",
        description: "Sie sind nicht angemeldet.",
        variant: "destructive",
      });
      throw new Error("Nicht angemeldet");
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/forward-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          originalEmailId: forwardData.originalEmailId,
          folder: currentFolder,
          to: forwardData.to,
          cc: forwardData.cc,
          bcc: forwardData.bcc,
          additionalText: forwardData.additionalText
        }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Fehler beim Weiterleiten der E-Mail');
      }
      
      toast({
        title: "Email forwarded",
        description: "The email was forwarded successfully.",
      });
      
      // Aktualisiere die gesendeten E-Mails
      if (currentFolder.toLowerCase().includes('sent')) {
        await fetchEmails(currentFolder);
      }
    } catch (error) {
      console.error('Error forwarding email:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred while forwarding the email.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    if (sessionId) {
      try {
        await fetch(`${API_URL}/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId }),
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    
    setAccount(null);
    setEmails([]);
    setSelectedEmail(null);
    setSessionId(null);
    toast({
      title: "Logged out",
      description: "You have been logged out.",
    });
  };

  const selectEmail = (email: EmailMessage | null) => {
    setSelectedEmail(email);
    if (email && !email.isRead) {
      markAsRead(email.id);
    }
  };

  const markAsRead = (id: string) => {
    setEmails(emails.map(email => 
      email.id === id ? { ...email, isRead: true } : email
    ));
  };

  const deleteEmail = async (id: string) => {
    if (!sessionId || !account) {
      toast({
        title: "Fehler",
        description: "Sie sind nicht angemeldet.",
        variant: "destructive",
      });
      throw new Error("Nicht angemeldet");
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/delete-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          emailId: id,
          folder: currentFolder
        }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Fehler beim Löschen der E-Mail');
      }
      
      // Remove the email from the current list
      setEmails(prevEmails => prevEmails.filter(email => email.id !== id));
      
      // If this was the selected email, deselect it
      if (selectedEmail && selectedEmail.id === id) {
        setSelectedEmail(null);
      }
      
      toast({
        title: "E-Mail gelöscht",
        description: "Die E-Mail wurde erfolgreich in den Papierkorb verschoben.",
      });
      
      // Refresh the emails in the current folder
      await fetchEmails(currentFolder);
      
    } catch (error) {
      console.error('Error deleting email:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Beim Löschen der E-Mail ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    account,
    emails,
    selectedEmail,
    folders,
    isLoading,
  fetchingEmailId,
    login,
  restoreSession,
    logout,
    selectEmail,
    markAsRead,
    deleteEmail,
    isConnecting,
    sessionId,
    currentFolder,
    setCurrentFolder,
    fetchEmails,
    fetchEmail,
    sendEmail,
    forwardEmail
  };

  return <EmailContext.Provider value={value}>{children}</EmailContext.Provider>;
}

export const useEmail = () => {
  const context = useContext(EmailContext);
  if (context === undefined) {
    throw new Error('useEmail must be used within an EmailProvider');
  }
  return context;
};
