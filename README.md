# Web.de Email Viewer

A modern web application for reading, managing, and sending emails for Web.de and other IMAP/SMTP-capable email providers.

## 🚀 Features

- **Secure Email Access**: Connect to Web.de and other email services via IMAP/SMTP
- **Intuitive Dashboard**: Modern and user-friendly interface
- **Real-time Updates**: Automatic inbox refresh
- **Email Management**: Read, reply, forward, and delete emails
- **Email Composer**: Create new emails with a rich text editor
- **Email Summarizer**: Compact overview of your most important emails
- **Responsive Design**: Optimized for desktop and mobile devices

## 📋 Requirements

- Node.js 18 or higher
- Bun (for faster development and package management)
- A Web.de email address or any other email account with IMAP/SMTP access

## 🔧 Installation

1. Clone the repository
   ```bash
   git clone <repository-url>
   cd webde-email-viewer
   ```

2. Install dependencies
   ```bash
   bun install
   ```

3. Configure environment variables
   Create a `.env` file in the root directory:
   ```
   PORT=3000
   CORS_ORIGIN=http://localhost:5173
   ```

## 🚀 Development

1. Start the server
   ```bash
   bun run server:dev
   ```

2. Start the frontend development server
   ```bash
   bun run dev
   ```

3. Open http://localhost:5173 in your browser

## 🏗️ Project Structure

```
webde-email-viewer/
├── public/                # Static files
├── server/                # Express.js backend
│   ├── server.js          # IMAP/SMTP server integration
│   └── start-server.js    # Server starter
├── src/
│   ├── components/        # React components
│   │   ├── EmailComposer.tsx    # Component for creating new emails
│   │   ├── EmailDashboard.tsx   # Main dashboard
│   │   ├── EmailList.tsx        # List of emails
│   │   ├── EmailSidebar.tsx     # Sidebar with folders
│   │   ├── EmailSummarizer.tsx  # Summary component
│   │   ├── EmailViewer.tsx      # Email view
│   │   ├── LoginForm.tsx        # Login form
│   │   └── ui/              # UI components (Shadcn/UI)
│   ├── context/            # React contexts
│   │   └── EmailContext.tsx    # Email state management
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Helper functions and configuration
│   ├── pages/              # Page components
│   └── types/              # TypeScript type definitions
│       └── email.ts        # Email-related type definitions
├── .env                    # Environment variables (not in repository)
├── package.json            # Project dependencies and scripts
└── vite.config.ts          # Vite configuration
```

## 🔐 Credentials and Security

The application stores email credentials **only temporarily** during the session and only on the server. No passwords are permanently stored.

Default configuration for Web.de:
- IMAP server: imap.web.de
- IMAP port: 993 (SSL/TLS)
- SMTP server: smtp.web.de
- SMTP port: 587 (STARTTLS)

## 🔄 IMAP/SMTP Integration

The application uses:
- **Imap library**: For connecting to the IMAP server and retrieving emails
- **Mailparser**: For parsing email contents
- **Nodemailer**: For sending emails via SMTP

## 🖥️ Frontend Technologies

- **React**: For the user interface
- **TypeScript**: For type-safe code
- **Vite**: As build tool and development server
- **Shadcn/UI**: For component design
- **TailwindCSS**: For styling

## 📱 Mobile Support

The application is fully responsive and offers an optimized experience on mobile devices through:
- Adaptive layouts
- Touch-friendly controls
- Adaptive components for different screen sizes

## 🌐 Deployment

1. Create a build
   ```bash
   bun run build
   ```

2. Start the server
   ```bash
   bun run start
   ```

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgements

- [Shadcn/UI](https://ui.shadcn.com/) for the component library
- [Imap](https://github.com/mscdex/node-imap) for IMAP integration
- [Nodemailer](https://nodemailer.com/) for SMTP integration
