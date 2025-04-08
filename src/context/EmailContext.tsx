import React, { createContext, useContext, useState, ReactNode } from 'react';
import { EmailAccount, EmailMessage, Folder, WebDeServerConfig } from '@/types/email';
import { useToast } from '@/components/ui/use-toast';

interface EmailContextType {
  account: EmailAccount | null;
  emails: EmailMessage[];
  selectedEmail: EmailMessage | null;
  folders: Folder[];
  isLoading: boolean;
  login: (email: string, password: string, serverConfig?: WebDeServerConfig) => Promise<boolean>;
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

// API URL
const API_URL = 'http://localhost:3001/api';

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
    { id: 'INBOX', name: 'Posteingang', unread: 0 },
    { id: 'Sent', name: 'Gesendet', unread: 0 },
    { id: 'Drafts', name: 'Entwürfe', unread: 0 },
    { id: 'Trash', name: 'Papierkorb', unread: 0 },
    { id: 'Spam', name: 'Spam', unread: 0 },
  ]);
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
      
      const data = await response.json();
      
      if (!data.success) {
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
        title: "Erfolgreich angemeldet",
        description: `Sie wurden erfolgreich bei ${config.imap.host} angemeldet.`,
      });
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Anmeldefehler",
        description: error instanceof Error ? error.message : "Beim Anmelden ist ein Fehler aufgetreten. Bitte überprüfen Sie Ihre Anmeldedaten und Servereinstellungen.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
      setIsConnecting(false);
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
        title: "Fehler",
        description: "Beim Abrufen der E-Mail-Ordner ist ein Fehler aufgetreten.",
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
        title: "Fehler",
        description: "Beim Abrufen der E-Mails ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmail = async (id: string, sid: string = sessionId || '') => {
    if (!sid) return;
    
    setIsLoading(true);
    
    try {
      let retryCount = 0;
      const maxRetries = 3;
      let success = false;
      let response;
      let data;
      
      // Versuche mit mehreren Retries, unterschiedliche IDs zu handhaben
      while (!success && retryCount < maxRetries) {
        try {
          console.log(`Versuche E-Mail mit ID ${id} abzurufen (Versuch ${retryCount + 1}/${maxRetries})`);
          
          // Beim ersten Versuch benutzen wir die Original-ID
          // Bei weiteren Versuchen können wir versuchen, die ID zu modifizieren
          let effectiveId = id;
          
          if (retryCount === 1) {
            // Zweiter Versuch: Prüfe, ob ID eine UID ist und konvertiere sie 
            // in eine normale Sequenznummer (wenn die ID hoch ist)
            if (parseInt(id) > 10000) {
              // Möglicherweise eine UID, versuche die neueste E-Mail im Ordner zu bekommen
              console.log("Versuche E-Mail über neueste E-Mails im Ordner zu finden");
              const emailsResponse = await fetch(`${API_URL}/emails?sessionId=${sid}&folder=${currentFolder}`);
              
              // Check if response is actually JSON
              const emailsContentType = emailsResponse.headers.get('content-type');
              if (!emailsContentType || !emailsContentType.includes('application/json')) {
                const errorText = await emailsResponse.text();
                console.error('Server returned non-JSON response:', errorText);
                throw new Error('Server returned an invalid response. Please check if the server is running correctly.');
              }
              
              const emailsData = await emailsResponse.json();
              
              if (emailsData.success && emailsData.emails.length > 0) {
                // Suche nach der E-Mail mit der UID
                const foundEmail = emailsData.emails.find((e: EmailMessage) => 
                  e.id === id || e.uid === id
                );
                
                if (foundEmail) {
                  console.log(`E-Mail mit ID ${id} in Liste gefunden, verwende ID ${foundEmail.id}`);
                  effectiveId = foundEmail.id;
                }
              }
            }
          } else if (retryCount === 2) {
            // Dritter Versuch: Verwende eventuell die UID, falls es eine Sequenznummer war
            const uidFallback = emails.find(e => e.id.toString() === id)?.uid;
            if (uidFallback) {
              console.log(`Versuche mit UID ${uidFallback} statt ID ${id}`);
              effectiveId = uidFallback;
            }
          }
          
          response = await fetch(`${API_URL}/email/${effectiveId}?sessionId=${sid}&folder=${currentFolder}`);
          
          // Check if response is actually JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const errorText = await response.text();
            console.error('Server returned non-JSON response:', errorText);
            throw new Error('Server returned an invalid response. Please check if the server is running correctly.');
          }
          
          data = await response.json();
          
          if (data.success) {
            success = true;
            break;
          } else {
            console.log(`Versuch ${retryCount + 1} fehlgeschlagen: ${data.error}`);
            retryCount++;
          }
        } catch (err) {
          console.error(`Fehler beim Abrufen der E-Mail (Versuch ${retryCount + 1}):`, err);
          retryCount++;
          // Kurze Pause vor dem nächsten Versuch
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (!success) {
        throw new Error(data?.error || 'Fehler beim Abrufen der E-Mail nach mehreren Versuchen');
      }
      
      // E-Mail aus den Daten extrahieren
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
        title: "Fehler",
        description: "Beim Abrufen der E-Mail ist ein Fehler aufgetreten. " + 
                    (error instanceof Error ? error.message : ""),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendEmail = async (emailData: any) => {
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
        title: "E-Mail gesendet",
        description: "Ihre E-Mail wurde erfolgreich gesendet.",
      });
      
      // Aktualisiere die gesendeten E-Mails
      if (currentFolder.toLowerCase().includes('sent')) {
        await fetchEmails(currentFolder);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Beim Senden der E-Mail ist ein Fehler aufgetreten.",
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
        title: "E-Mail weitergeleitet",
        description: "Die E-Mail wurde erfolgreich weitergeleitet.",
      });
      
      // Aktualisiere die gesendeten E-Mails
      if (currentFolder.toLowerCase().includes('sent')) {
        await fetchEmails(currentFolder);
      }
    } catch (error) {
      console.error('Error forwarding email:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Beim Weiterleiten der E-Mail ist ein Fehler aufgetreten.",
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
      title: "Abgemeldet",
      description: "Sie wurden erfolgreich abgemeldet.",
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
    login,
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
