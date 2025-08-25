// Config service to handle configuration and environment variables
// Use VITE_API_URL if provided, otherwise default to the backend server on port 3000
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Email provider configuration interface
export interface EmailProvider {
  name: string;
  imapServer: string;
  imapPort: number;
  smtpServer: string;
  smtpPort: number;
  secure: boolean;
}

// API keys interface
export interface ApiKeys {
  openAiApiKey: string;
}

// Server configuration interface
export interface ServerConfig {
  emailProviders: EmailProvider[];
  apiKeys: ApiKeys;
}

// Fetch server configuration from backend
export const fetchServerConfig = async (): Promise<ServerConfig> => {
  try {
    const response = await fetch(`${API_URL}/api/config`);
    if (!response.ok) {
      throw new Error('Failed to fetch server configuration');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching server configuration:', error);
    // Return default values if the server request fails
    return {
      emailProviders: [
        {
          name: 'WEB.DE',
          imapServer: 'imap.web.de',
          imapPort: 993,
          smtpServer: 'smtp.web.de',
          smtpPort: 587,
          secure: true
        },
        {
          name: 'GMX',
          imapServer: 'imap.gmx.net',
          imapPort: 993,
          smtpServer: 'smtp.gmx.net',
          smtpPort: 587,
          secure: true
        },
        {
          name: 'Custom',
          imapServer: '',
          imapPort: 993,
          smtpServer: '',
          smtpPort: 587,
          secure: true
        }
      ],
      apiKeys: {
        openAiApiKey: ''
      }
    };
  }
};

// Get a specific email provider configuration by name
export const getEmailProviderConfig = async (providerName: string): Promise<EmailProvider | undefined> => {
  const config = await fetchServerConfig();
  return config.emailProviders.find(provider => 
    provider.name.toLowerCase() === providerName.toLowerCase()
  );
};