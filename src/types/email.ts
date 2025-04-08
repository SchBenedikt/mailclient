export interface EmailAccount {
  email: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
}

export interface EmailMessage {
  id: string;
  uid?: string; // Unique Identifier für IMAP-Nachrichten
  subject: string;
  from: {
    name?: string;
    address: string;
  };
  to: {
    name?: string;
    address: string;
  }[];
  date: Date;
  body: string;
  isRead: boolean;
  hasAttachments: boolean;
}

export interface Folder {
  id: string;
  name: string;
  unread: number;
}

export interface WebDeServerConfig {
  imap: {
    host: string;
    port: number;
    secure: boolean;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
  };
}
