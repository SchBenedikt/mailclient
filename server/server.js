#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Lade Umgebungsvariablen aus .env Datei
dotenv.config();

// Express-Anwendung erstellen
const app = express();
const PORT = process.env.PORT || 3000;

// CORS-Konfiguration mit Umgebungsvariablen
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// JSON-Parser für Anfragen mit großen Payloads aktivieren
app.use(express.json({ limit: '50mb' }));

// Aktive IMAP-Verbindungen
const activeConnections = new Map();

// IMAP-Verbindung erstellen
function createImapConnection(credentials) {
  return new Promise((resolve, reject) => {
    try {
      const imap = new Imap({
        user: credentials.email,
        password: credentials.password,
        host: credentials.host,
        port: credentials.port,
        tls: credentials.secure,
        tlsOptions: { rejectUnauthorized: false } // Warnung: In Produktion sollte dies true sein
      });

      imap.once('ready', () => {
        console.log(`IMAP-Verbindung hergestellt für ${credentials.email}`);
        resolve(imap);
      });

      imap.once('error', (err) => {
        console.error(`IMAP-Verbindungsfehler für ${credentials.email}:`, err);
        reject(err);
      });

      imap.connect();
    } catch (error) {
      console.error('Fehler beim Erstellen der IMAP-Verbindung:', error);
      reject(error);
    }
  });
}

// Verbindung zum IMAP-Server herstellen
app.post('/api/connect', async (req, res) => {
  const { email, password, host, port, secure } = req.body;
  
  console.log(`Verbindungsversuch zu ${host}:${port} für ${email}`);
  
  try {
    const imap = await createImapConnection({ email, password, host, port, secure });
    
    // Session-ID generieren
    const sessionId = Math.random().toString(36).substring(2, 15);
    activeConnections.set(sessionId, imap);
    
    console.log(`Verbindung erfolgreich für ${email}, Session-ID: ${sessionId}`);
    res.json({ success: true, sessionId });
  } catch (error) {
    console.error('Verbindungsfehler:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Alle Ordner abrufen
app.get('/api/folders', async (req, res) => {
  const { sessionId } = req.query;
  
  console.log(`Ordner abrufen für Session: ${sessionId}`);
  
  if (!sessionId || !activeConnections.has(sessionId)) {
    return res.status(401).json({ success: false, error: 'Ungültige Session' });
  }
  
  const imap = activeConnections.get(sessionId);
  
  try {
    imap.getBoxes((err, boxes) => {
      if (err) {
        console.error('Fehler beim Abrufen der Postfächer:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
      
      const folders = [];
      
      // Postfächer verarbeiten
      const processBoxes = (boxObj, path = '') => {
        Object.keys(boxObj).forEach(box => {
          const fullPath = path ? `${path}${box}` : box;
          folders.push({
            id: fullPath,
            name: box,
            path: fullPath,
            unread: 0 // Wird später aktualisiert
          });
          
          if (boxObj[box].children) {
            processBoxes(boxObj[box].children, `${fullPath}/`);
          }
        });
      };
      
      processBoxes(boxes);
      console.log(`${folders.length} Ordner gefunden`);
      
      res.json({ success: true, folders });
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Ordner:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// E-Mails aus einem bestimmten Ordner abrufen
app.get('/api/emails', async (req, res) => {
  const { sessionId, folder = 'INBOX' } = req.query;
  
  console.log(`E-Mails abrufen aus "${folder}" für Session: ${sessionId}`);
  
  if (!sessionId || !activeConnections.has(sessionId)) {
    return res.status(401).json({ success: false, error: 'Ungültige Session' });
  }
  
  const imap = activeConnections.get(sessionId);
  
  try {
    imap.openBox(folder, false, (err, box) => {
      if (err) {
        console.error('Fehler beim Öffnen des Postfachs:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
      
      console.log(`Postfach geöffnet: ${folder}, Anzahl Nachrichten: ${box.messages.total}`);
      
      // Wenn keine Nachrichten vorhanden sind, leeres Array zurückgeben
      if (box.messages.total === 0) {
        return res.json({ success: true, emails: [] });
      }
      
      // Die neuesten 30 Nachrichten abrufen (oder weniger, falls nicht so viele vorhanden)
      const lastCount = Math.min(30, box.messages.total);
      const start = Math.max(1, box.messages.total - lastCount + 1);
      const range = `${start}:${box.messages.total}`;
      
      console.log(`Abrufen der Nachrichten im Bereich: ${range}`);
      
      // Tracking-Variablen für Timeout und Abschluss
      let hasResponded = false;
      const emails = [];
      
      // Timeout für den Fall, dass die Anfrage hängen bleibt
      const timeout = setTimeout(() => {
        if (!hasResponded) {
          console.error('Timeout beim Abrufen der E-Mails');
          hasResponded = true;
          if (emails.length > 0) {
            console.log(`Sende ${emails.length} E-Mails trotz Timeout`);
            res.json({ success: true, emails, partial: true });
          } else {
            res.status(500).json({ 
              success: false, 
              error: 'Zeitüberschreitung beim Abrufen der E-Mails' 
            });
          }
        }
      }, 30000); // 30 Sekunden Timeout
      
      // Wir versuchen es mit imap.seq.fetch statt imap.fetch für mehr Zuverlässigkeit
      const fetch = imap.seq.fetch(range, {
        bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'],
        struct: true,
        envelope: true
      });
      
      fetch.on('message', (msg, seqno) => {
        const email = {
          id: seqno.toString(), // Sequenznummer als Fallback
          uid: null, // Wird mit der tatsächlichen UID aktualisiert
          subject: '',
          from: { name: '', address: '' },
          to: [{ name: '', address: '' }],
          date: new Date(),
          body: '',
          isRead: true,
          hasAttachments: false
        };
        
        msg.once('attributes', (attrs) => {
          // UID aus den Attributen holen
          if (attrs.uid) {
            email.uid = attrs.uid.toString();
            email.id = attrs.uid.toString(); // ID mit UID überschreiben
          }
          
          // Lies-Status
          email.isRead = (attrs.flags || []).includes('\\Seen');
          
          // Anhänge prüfen
          if (attrs.struct) {
            let attachments = [];
            
            // Rekursive Funktion, um alle Anhänge zu finden
            const findAttachmentParts = function(struct, attachments) {
              if (Array.isArray(struct)) {
                struct.forEach((item) => {
                  findAttachmentParts(item, attachments);
                });
                return;
              }
              
              if (struct.disposition && 
                  ['attachment', 'inline'].includes(struct.disposition.type.toLowerCase())) {
                attachments.push(struct);
              }
              
              if (struct.params && struct.params.name) {
                attachments.push(struct);
              }
              
              if (struct.parts) {
                struct.parts.forEach((part) => {
                  findAttachmentParts(part, attachments);
                });
              }
            };
            
            findAttachmentParts(attrs.struct, attachments);
            email.hasAttachments = attachments.length > 0;
          }
        });
        
        msg.on('body', (stream, info) => {
          let buffer = '';
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
          
          stream.on('end', () => {
            // Header-Informationen parsen
            const header = Imap.parseHeader(buffer);
            
            // Betreff
            if (header.subject && header.subject[0]) {
              email.subject = header.subject[0];
            }
            
            // Absender
            if (header.from && header.from[0]) {
              const fromMatch = header.from[0].match(/(.*?)\s*<(.*)>/);
              if (fromMatch) {
                email.from.name = fromMatch[1].trim().replace(/["']/g, '');
                email.from.address = fromMatch[2];
              } else {
                email.from.address = header.from[0];
              }
            }
            
            // Empfänger
            if (header.to && header.to[0]) {
              email.to = header.to.map(to => {
                const toMatch = to.match(/(.*?)\s*<(.*)>/);
                if (toMatch) {
                  return {
                    name: toMatch[1].trim().replace(/["']/g, ''),
                    address: toMatch[2]
                  };
                }
                return { name: '', address: to };
              });
            }
            
            // Datum
            if (header.date && header.date[0]) {
              try {
                email.date = new Date(header.date[0]);
                // Prüfen, ob das Datum gültig ist
                if (isNaN(email.date.getTime())) {
                  email.date = new Date(); // Fallback auf aktuelles Datum
                }
              } catch (e) {
                console.error('Fehler beim Parsen des Datums:', e);
                email.date = new Date(); // Fallback auf aktuelles Datum
              }
            }
          });
        });
        
        msg.once('end', () => {
          emails.push(email);
          console.log(`E-Mail ${email.id} hinzugefügt (${emails.length} von ${lastCount})`);
        });
      });
      
      fetch.once('error', (err) => {
        console.error('Fehler beim Abrufen der E-Mails:', err);
        if (!hasResponded) {
          clearTimeout(timeout);
          hasResponded = true;
          if (emails.length > 0) {
            console.log(`Sende ${emails.length} E-Mails trotz Fehler`);
            res.json({ success: true, emails, partial: true });
          } else {
            res.status(500).json({ success: false, error: err.message });
          }
        }
      });
      
      fetch.once('end', () => {
        clearTimeout(timeout);
        
        if (!hasResponded) {
          hasResponded = true;
          
          // E-Mails nach Datum sortieren (neueste zuerst)
          emails.sort((a, b) => {
            // Versuche, nach Datum zu sortieren, Fallback auf Sequenznummer
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            
            if (isNaN(dateA) || isNaN(dateB)) {
              // Wenn Datum ungültig ist, nach ID sortieren
              return parseInt(b.id) - parseInt(a.id);
            }
            
            return dateB - dateA;
          });
          
          console.log(`${emails.length} E-Mails aus ${folder} erfolgreich abgerufen`);
          res.json({ success: true, emails });
        }
      });
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der E-Mails:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eine bestimmte E-Mail abrufen
app.get('/api/email/:id', async (req, res) => {
  const { sessionId, folder = 'INBOX' } = req.query;
  const { id } = req.params;
  
  console.log(`E-Mail ${id} aus "${folder}" für Session: ${sessionId} abrufen`);
  
  if (!sessionId || !activeConnections.has(sessionId)) {
    return res.status(401).json({ success: false, error: 'Ungültige Session' });
  }
  
  const imap = activeConnections.get(sessionId);
  
  try {
    imap.openBox(folder, false, async (err, box) => {
      if (err) {
        console.error('Fehler beim Öffnen des Postfachs:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
      
      // Timeout für die Anfrage einrichten (3 Minuten für große E-Mails)
      const timeout = setTimeout(() => {
        console.error(`Timeout beim Abrufen von E-Mail ${id}`);
        return res.status(504).json({ 
          success: false, 
          error: 'Zeitüberschreitung beim Laden der E-Mail. Die E-Mail könnte zu groß sein.'
        });
      }, 180000);
      
      // Prüfen, ob die E-Mail-ID gültig ist
      if (!id) {
        clearTimeout(timeout);
        return res.status(400).json({ success: false, error: 'Ungültige E-Mail-ID' });
      }
      
      let hasResponded = false;
      let fetchCompleted = false;
      let fetchStarted = false;
      
      // Versuche zuerst UID-basiertes Abrufen
      try {
        fetchStarted = true;
        console.log(`Abrufen von E-Mail mit UID ${id}`);
        
        const fetch = imap.fetch(id, {
          bodies: [''],
          struct: true,
          size: true
        });
        
        let emailData = null;
        
        fetch.on('message', (msg, seqno) => {
          let size = 0;
          let buffer = Buffer.alloc(0);
          
          msg.once('attributes', (attrs) => {
            if (attrs.size) {
              size = attrs.size;
              console.log(`E-Mail ${id} Größe: ${size} Bytes`);
              
              // Prüfe, ob die E-Mail sehr groß ist (größer als 10MB)
              if (size > 10 * 1024 * 1024) {
                console.log(`E-Mail ${id} ist sehr groß (${(size/1024/1024).toFixed(2)}MB), setze längeres Timeout`);
              }
            }
          });
          
          msg.on('body', (stream, info) => {
            const chunks = [];
            let downloadedBytes = 0;
            
            stream.on('data', (chunk) => {
              chunks.push(chunk);
              downloadedBytes += chunk.length;
              
              // Log alle 1MB für große E-Mails
              if (size > 1024 * 1024 && chunks.length % 10 === 0) {
                console.log(`E-Mail ${id} Download: ${(downloadedBytes/size*100).toFixed(2)}% (${(downloadedBytes/1024/1024).toFixed(2)}MB / ${(size/1024/1024).toFixed(2)}MB)`);
              }
            });
            
            stream.on('end', () => {
              try {
                buffer = Buffer.concat(chunks);
                console.log(`E-Mail ${id} Stream abgeschlossen, ${buffer.length} Bytes geladen`);
                
                // Parsen mit erhöhtem Timeout und Limits
                const parserOptions = {
                  maxHtmlLengthToParse: 20 * 1024 * 1024, // 20MB
                  skipHtmlToText: size > 5 * 1024 * 1024, // Skip HTML zu Text Konversion für große E-Mails
                  skipTextToHtml: size > 5 * 1024 * 1024, // Skip Text zu HTML Konversion für große E-Mails
                  skipTextLinks: size > 1024 * 1024 // Skip Link Erkennung für große E-Mails
                };
                
                console.log(`Beginne Parsen von E-Mail ${id}`);
                simpleParser(buffer, parserOptions)
                  .then(parsed => {
                    if (fetchCompleted) return;
                    fetchCompleted = true;
                    
                    // Sanitize HTML-Inhalt, um mögliche Probleme zu vermeiden
                    let sanitizedHtml = '';
                    
                    if (parsed.html) {
                      try {
                        sanitizedHtml = parsed.html
                          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Entferne Scripts
                          .replace(/on\w+="[^"]*"/g, '') // Entferne Event-Handler
                          .replace(/on\w+='[^']*'/g, ''); // Entferne Event-Handler (single quotes)
                      } catch (error) {
                        console.error(`Fehler beim Sanitizen von HTML für E-Mail ${id}:`, error);
                        sanitizedHtml = parsed.textAsHtml || '<p>Diese E-Mail enthält nicht unterstützten HTML-Inhalt</p>';
                      }
                    } else if (parsed.textAsHtml) {
                      sanitizedHtml = parsed.textAsHtml;
                    } else if (parsed.text) {
                      sanitizedHtml = `<pre>${parsed.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
                    } else {
                      sanitizedHtml = '<p>Diese E-Mail enthält keinen Inhalt</p>';
                    }
                    
                    emailData = {
                      id: id.toString(),
                      subject: parsed.subject || 'Kein Betreff',
                      from: parsed.from ? {
                        name: parsed.from.value[0]?.name || '',
                        address: parsed.from.value[0]?.address || ''
                      } : { name: '', address: '' },
                      to: parsed.to ? parsed.to.value.map(to => ({
                        name: to.name || '',
                        address: to.address || ''
                      })) : [],
                      date: parsed.date || new Date(),
                      body: sanitizedHtml,
                      isRead: true,
                      hasAttachments: parsed.attachments && parsed.attachments.length > 0
                    };
                    
                    // Als gelesen markieren
                    imap.setFlags(id, ['\\Seen'], (err) => {
                      if (err) console.error(`Fehler beim Markieren von E-Mail ${id} als gelesen:`, err);
                    });
                    
                    console.log(`E-Mail ${id} erfolgreich abgerufen und geparst`);
                    
                    if (!hasResponded) {
                      hasResponded = true;
                      clearTimeout(timeout);
                      res.json({ success: true, email: emailData });
                    }
                  })
                  .catch(err => {
                    console.error(`Fehler beim Parsen von E-Mail ${id}:`, err);
                    
                    // Fallback für nicht-parsierbare E-Mails
                    if (!hasResponded && !fetchCompleted) {
                      fetchCompleted = true;
                      
                      // Einfaches Objekt mit verfügbaren Informationen zurückgeben
                      const fallbackEmail = {
                        id: id.toString(),
                        subject: 'Fehler beim Parsen der E-Mail',
                        from: { name: '', address: '' },
                        to: [],
                        date: new Date(),
                        body: `<div class="error-message">
                                <h3>Diese E-Mail konnte nicht vollständig geladen werden</h3>
                                <p>Die E-Mail ist möglicherweise zu groß oder enthält nicht unterstützte Inhalte.</p>
                                <p>Technische Details: ${err.message}</p>
                              </div>`,
                        isRead: true,
                        hasAttachments: false
                      };
                      
                      hasResponded = true;
                      clearTimeout(timeout);
                      return res.json({ success: true, email: fallbackEmail, partial: true });
                    }
                  });
              } catch (error) {
                console.error(`Fehler beim Verarbeiten des Streams für E-Mail ${id}:`, error);
                if (!hasResponded) {
                  hasResponded = true;
                  clearTimeout(timeout);
                  return res.status(500).json({ success: false, error: error.message });
                }
              }
            });
          });
        });
        
        fetch.once('error', (err) => {
          console.error(`Fehler beim Abrufen von E-Mail ${id} mit UID:`, err);
          // Nur wenn keine Antwort gesendet wurde, versuche es mit Sequenznummer
          if (!hasResponded && !fetchCompleted) {
            console.log(`Suchen nach E-Mail mit Sequenznummer ${id} statt UID`);
            
            // Fallback auf Sequenznummer
            try {
              const seqFetch = imap.seq.fetch(id, { bodies: [''], struct: true });
              
              // gleiche Verarbeitung wie oben
              // ...
              
              seqFetch.once('error', (seqErr) => {
                console.error(`Fehler beim Abrufen mit Sequenznummer für E-Mail ${id}:`, seqErr);
                if (!hasResponded) {
                  hasResponded = true;
                  clearTimeout(timeout);
                  res.status(500).json({ success: false, error: seqErr.message });
                }
              });
              
              seqFetch.once('end', () => {
                if (!hasResponded && !fetchCompleted) {
                  console.log(`Keine E-Mail mit ID ${id} gefunden`);
                  hasResponded = true;
                  clearTimeout(timeout);
                  res.status(404).json({ success: false, error: 'E-Mail nicht gefunden' });
                }
              });
            } catch (seqError) {
              console.error(`Fehler beim Erstellen des Sequenzfetches für E-Mail ${id}:`, seqError);
              if (!hasResponded) {
                hasResponded = true;
                clearTimeout(timeout);
                res.status(500).json({ success: false, error: seqError.message });
              }
            }
          }
        });
        
        fetch.once('end', () => {
          console.log(`Fetch für E-Mail ${id} abgeschlossen`);
          
          // Wenn wir bis hier kommen und keine E-Mail gefunden haben und noch nicht geantwortet haben
          if (!hasResponded && !fetchCompleted && fetchStarted) {
            console.log(`Keine E-Mail mit UID ${id} gefunden, versuche mit Sequenznummer`);
            
            try {
              const seqFetch = imap.seq.fetch(id, { bodies: [''], struct: true });
              
              // Verarbeitung für Sequenznummer (gleicher Code wie oben)
              // ... 
              
              seqFetch.once('end', () => {
                if (!hasResponded && !fetchCompleted) {
                  console.log(`Keine E-Mail mit ID ${id} gefunden (weder UID noch Sequenznummer)`);
                  hasResponded = true;
                  clearTimeout(timeout);
                  res.status(404).json({ success: false, error: 'E-Mail nicht gefunden' });
                }
              });
            } catch (error) {
              console.error(`Fehler beim Erstellen des Sequenz-Fetches für E-Mail ${id}:`, error);
              if (!hasResponded) {
                hasResponded = true;
                clearTimeout(timeout);
                res.status(500).json({ success: false, error: error.message });
              }
            }
          }
        });
      } catch (error) {
        console.error(`Allgemeiner Fehler beim Abrufen von E-Mail ${id}:`, error);
        if (!hasResponded) {
          hasResponded = true;
          clearTimeout(timeout);
          res.status(500).json({ success: false, error: error.message });
        }
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der E-Mail:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// E-Mail senden
app.post('/api/send-email', async (req, res) => {
  console.log('E-Mail-Sendenanfrage erhalten');
  const { sessionId, email } = req.body;
  
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  if (!sessionId || !activeConnections.has(sessionId)) {
    console.log(`Ungültige Session: ${sessionId}`);
    return res.status(401).json({ success: false, error: 'Ungültige Session' });
  }
  
  const imap = activeConnections.get(sessionId);
  
  try {
    // E-Mail-Account-Informationen abrufen
    const user = imap._config.user;
    const password = imap._config.password;
    const host = imap._config.host;
    
    // SMTP-Informationen aus der Anfrage extrahieren
    const { to, cc, bcc, subject, text, html, smtpConfig } = email;
    
    // SMTP-Server von imap.example.com zu smtp.example.com konvertieren
    const smtpHost = smtpConfig?.host || host.replace('imap.', 'smtp.');
    const smtpPort = smtpConfig?.port || 587;
    const smtpSecure = smtpConfig?.secure || false;
    
    console.log(`SMTP-Transport mit Host ${smtpHost} einrichten`);
    
    // SMTP-Transporter konfigurieren
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user,
        pass: password
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    // E-Mail-Optionen vorbereiten
    const mailOptions = {
      from: user,
      to: Array.isArray(to) ? to.join(',') : to,
      cc: cc ? (Array.isArray(cc) ? cc.join(',') : cc) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc.join(',') : bcc) : undefined,
      subject,
      text,
      html
    };
    
    console.log(`E-Mail mit Betreff "${subject}" senden an: ${mailOptions.to}`);
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`E-Mail gesendet: ${info.messageId}`);
    
    return res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Fehler beim Senden der E-Mail:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// E-Mail weiterleiten
app.post('/api/forward-email', async (req, res) => {
  console.log('Anfrage zum Weiterleiten einer E-Mail erhalten');
  const { sessionId, originalEmailId, folder, to, cc, bcc, additionalText } = req.body;
  
  console.log(`E-Mail ${originalEmailId} aus "${folder}" für Session ${sessionId} weiterleiten`);
  
  if (!sessionId || !activeConnections.has(sessionId)) {
    console.log(`Ungültige Session: ${sessionId}`);
    return res.status(401).json({ success: false, error: 'Ungültige Session' });
  }
  
  const imap = activeConnections.get(sessionId);
  
  try {
    // Original-E-Mail abrufen
    let originalEmail;
    
    await new Promise((resolve, reject) => {
      imap.openBox(folder, false, (err, box) => {
        if (err) {
          console.error('Fehler beim Öffnen des Postfachs zum Weiterleiten:', err);
          return reject(err);
        }
        
        const fetch = imap.fetch(originalEmailId, { bodies: [''] });
        
        fetch.on('message', (msg) => {
          msg.on('body', (stream) => {
            simpleParser(stream, (err, parsed) => {
              if (err) {
                console.error('Fehler beim Parsen der E-Mail zum Weiterleiten:', err);
                return reject(err);
              }
              
              originalEmail = parsed;
              resolve();
            });
          });
        });
        
        fetch.once('error', (err) => {
          console.error('Fehler beim Abrufen zum Weiterleiten:', err);
          reject(err);
        });
        
        // Wenn keine Nachricht gefunden wurde, Timeout-Auflösung
        fetch.once('end', () => {
          if (!originalEmail) {
            console.log('Keine Nachricht gefunden, leere E-Mail erstellen');
            originalEmail = {
              subject: 'Unbekannter Betreff',
              from: { text: 'Unbekannt' },
              to: { text: 'Unbekannt' },
              date: new Date(),
              text: '',
              html: ''
            };
          }
          resolve();
        });
      });
    });
    
    // SMTP-Informationen und Account-Details
    const user = imap._config.user;
    const password = imap._config.password;
    const host = imap._config.host;
    
    // SMTP-Host aus IMAP-Host ableiten
    const smtpHost = host.replace('imap.', 'smtp.');
    
    console.log(`SMTP-Transport für Weiterleitung mit Host ${smtpHost} einrichten`);
    
    // SMTP-Transporter konfigurieren
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: 587,
      secure: false,
      auth: {
        user,
        pass: password
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    // "Fwd:" zum Betreff hinzufügen, falls nicht bereits vorhanden
    const subject = originalEmail.subject?.startsWith('Fwd:') 
      ? originalEmail.subject 
      : `Fwd: ${originalEmail.subject || 'Kein Betreff'}`;
    
    // Weitergeleitete Nachricht formatieren
    let forwardedText = additionalText ? additionalText + '\n\n---------- Weitergeleitete Nachricht ----------\n\n' : '---------- Weitergeleitete Nachricht ----------\n\n';
    forwardedText += `Von: ${originalEmail.from?.text || 'Unbekannt'}\n`;
    forwardedText += `Datum: ${originalEmail.date?.toLocaleString() || new Date().toLocaleString()}\n`;
    forwardedText += `Betreff: ${originalEmail.subject || 'Kein Betreff'}\n`;
    forwardedText += `An: ${originalEmail.to?.text || 'Unbekannt'}\n\n`;
    forwardedText += originalEmail.text || '';
    
    // HTML-Version wenn vorhanden
    let forwardedHtml = '';
    if (originalEmail.html) {
      forwardedHtml = additionalText ? `<p>${additionalText.replace(/\n/g, '<br>')}</p><hr><div style="margin-top:10px;"><p><b>---------- Weitergeleitete Nachricht ----------</b></p>` : '<hr><div><p><b>---------- Weitergeleitete Nachricht ----------</b></p>';
      forwardedHtml += `<p><b>Von:</b> ${originalEmail.from?.text || 'Unbekannt'}</p>`;
      forwardedHtml += `<p><b>Datum:</b> ${originalEmail.date?.toLocaleString() || new Date().toLocaleString()}</p>`;
      forwardedHtml += `<p><b>Betreff:</b> ${originalEmail.subject || 'Kein Betreff'}</p>`;
      forwardedHtml += `<p><b>An:</b> ${originalEmail.to?.text || 'Unbekannt'}</p></div>`;
      forwardedHtml += `<div style="margin-top:10px;">${originalEmail.html}</div>`;
    }
    
    // E-Mail-Anhänge übernehmen
    const attachments = originalEmail.attachments || [];
    
    // E-Mail-Empfänger vorbereiten
    const toAddresses = Array.isArray(to) ? to.join(',') : to;
    const ccAddresses = cc ? (Array.isArray(cc) ? cc.join(',') : cc) : undefined;
    const bccAddresses = bcc ? (Array.isArray(bcc) ? bcc.join(',') : bcc) : undefined;
    
    // E-Mail versenden
    const mailOptions = {
      from: user,
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject,
      text: forwardedText,
      html: forwardedHtml,
      attachments
    };
    
    console.log(`E-Mail mit Betreff "${subject}" weiterleiten an: ${toAddresses}`);
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`Weitergeleitete E-Mail gesendet: ${info.messageId}`);
    
    return res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Fehler beim Weiterleiten der E-Mail:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Abmelden und Verbindung schließen
app.post('/api/logout', (req, res) => {
  const { sessionId } = req.body;
  
  console.log(`Session ${sessionId} abmelden`);
  
  if (sessionId && activeConnections.has(sessionId)) {
    const imap = activeConnections.get(sessionId);
    imap.end();
    activeConnections.delete(sessionId);
    console.log(`Session ${sessionId} erfolgreich abgemeldet`);
  }
  
  res.json({ success: true });
});

// Gesundheitscheck-Endpunkt
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route to provide default server configuration
app.get('/config', (req, res) => {
  res.json({
    imap: {
      host: process.env.DEFAULT_IMAP_HOST || 'imap.web.de',
      port: parseInt(process.env.DEFAULT_IMAP_PORT || '993', 10),
      secure: process.env.DEFAULT_IMAP_SECURE === 'false' ? false : true
    },
    smtp: {
      host: process.env.DEFAULT_SMTP_HOST || 'smtp.web.de',
      port: parseInt(process.env.DEFAULT_SMTP_PORT || '587', 10),
      secure: process.env.DEFAULT_SMTP_SECURE === 'true' ? true : false
    }
  });
});

// Config endpoint to provide server configuration to frontend
app.get('/api/config', (req, res) => {
  res.json({
    emailProviders: [
      {
        name: 'WEB.DE',
        imapServer: process.env.WEBDE_IMAP_SERVER || 'imap.web.de',
        imapPort: parseInt(process.env.WEBDE_IMAP_PORT || '993'),
        smtpServer: process.env.WEBDE_SMTP_SERVER || 'smtp.web.de',
        smtpPort: parseInt(process.env.WEBDE_SMTP_PORT || '587'),
        secure: process.env.WEBDE_SECURE !== 'false' // Default to true
      },
      {
        name: 'GMX',
        imapServer: process.env.GMX_IMAP_SERVER || 'imap.gmx.net',
        imapPort: parseInt(process.env.GMX_IMAP_PORT || '993'),
        smtpServer: process.env.GMX_SMTP_SERVER || 'smtp.gmx.net',
        smtpPort: parseInt(process.env.GMX_SMTP_PORT || '587'),
        secure: process.env.GMX_SECURE !== 'false' // Default to true
      },
      {
        name: 'Custom',
        imapServer: process.env.DEFAULT_IMAP_SERVER || '',
        imapPort: parseInt(process.env.DEFAULT_IMAP_PORT || '993'),
        smtpServer: process.env.DEFAULT_SMTP_SERVER || '',
        smtpPort: parseInt(process.env.DEFAULT_SMTP_PORT || '587'),
        secure: process.env.DEFAULT_SECURE !== 'false' // Default to true
      }
    ],
    apiKeys: {
      openAiApiKey: process.env.OPENAI_API_KEY || ''
    }
  });
});

// Server starten
const server = app.listen(PORT, () => {
  console.log(`E-Mail-Server läuft auf http://localhost:${PORT}`);
  console.log(`Gesundheitscheck verfügbar unter http://localhost:${PORT}/api/health`);
});

// Ordnungsgemäßes Herunterfahren
process.on('SIGINT', () => {
  console.log('Server wird heruntergefahren...');
  
  // Alle aktiven IMAP-Verbindungen schließen
  for (const [sessionId, imap] of activeConnections.entries()) {
    console.log(`IMAP-Verbindung für Session ${sessionId} schließen`);
    imap.end();
  }
  
  server.close(() => {
    console.log('Server erfolgreich heruntergefahren');
    process.exit(0);
  });
});

export default app;