import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useEmail } from "@/context/EmailContext";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchServerConfig, EmailProvider } from "@/lib/config";

interface LoginFormProps {
  onSuccess: () => void;
}

const LoginForm = ({ onSuccess }: LoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [emailProviders, setEmailProviders] = useState<EmailProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("WEB.DE");
  
  // Server settings with default values
  const [imapHost, setImapHost] = useState("imap.web.de");
  const [imapPort, setImapPort] = useState("993");
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState("smtp.web.de");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  
  const { login, isLoading, isConnecting } = useEmail();

  // Load server configurations on component mount
  useEffect(() => {
    const loadServerConfig = async () => {
      try {
        const config = await fetchServerConfig();
        setEmailProviders(config.emailProviders);
        
        // Set default values from the first provider
        if (config.emailProviders.length > 0) {
          const defaultProvider = config.emailProviders[0];
          setImapHost(defaultProvider.imapServer);
          setImapPort(defaultProvider.imapPort.toString());
          setImapSecure(defaultProvider.secure);
          setSmtpHost(defaultProvider.smtpServer);
          setSmtpPort(defaultProvider.smtpPort.toString());
          setSmtpSecure(defaultProvider.secure);
        }
      } catch (error) {
        console.error("Failed to load server configuration:", error);
      }
    };
    
    loadServerConfig();
  }, []);

  // Handle provider change
  const handleProviderChange = (value: string) => {
    setSelectedProvider(value);
    const provider = emailProviders.find(p => p.name === value);
    
    if (provider) {
      setImapHost(provider.imapServer);
      setImapPort(provider.imapPort.toString());
      setImapSecure(provider.secure);
      setSmtpHost(provider.smtpServer);
      setSmtpPort(provider.smtpPort.toString());
      setSmtpSecure(provider.secure);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prepare server config
    const serverConfig = {
      imap: {
        host: imapHost,
        port: parseInt(imapPort, 10),
        secure: imapSecure
      },
      smtp: {
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: smtpSecure
      }
    };
    
    const success = await login(email, password, serverConfig);
    if (success) {
      onSuccess();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-sky-100 to-white p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <div className="webde-logo text-3xl text-primary font-bold">EMAIL</div>
          </div>
          <CardTitle className="text-2xl text-center">Sign In</CardTitle>
          <CardDescription className="text-center">
            Enter your email login credentials
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider">Email Provider</Label>
              <Select
                value={selectedProvider}
                onValueChange={handleProviderChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select email provider" />
                </SelectTrigger>
                <SelectContent>
                  {emailProviders.map((provider) => (
                    <SelectItem key={provider.name} value={provider.name}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="password">Password</Label>
                <a href="#" className="text-xs text-primary hover:underline">
                  Forgot password?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full"
              />
            </div>
            
            {/* Server Settings Collapsible */}
            <Collapsible 
              open={showServerSettings} 
              onOpenChange={setShowServerSettings}
              className="border rounded-md p-2"
            >
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex w-full justify-between p-2">
                  <span>Server Settings</span>
                  {showServerSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">IMAP Settings</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="imapHost">IMAP Server</Label>
                      <Input
                        id="imapHost"
                        value={imapHost}
                        onChange={(e) => setImapHost(e.target.value)}
                        placeholder="imap.example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="imapPort">Port</Label>
                      <Input
                        id="imapPort"
                        value={imapPort}
                        onChange={(e) => setImapPort(e.target.value)}
                        placeholder="993"
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="imapSecure" 
                      checked={imapSecure}
                      onCheckedChange={(checked) => setImapSecure(checked === true)}
                    />
                    <Label htmlFor="imapSecure">Use SSL/TLS</Label>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">SMTP Settings</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="smtpHost">SMTP Server</Label>
                      <Input
                        id="smtpHost"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="smtp.example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="smtpPort">Port</Label>
                      <Input
                        id="smtpPort"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(e.target.value)}
                        placeholder="587"
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="smtpSecure" 
                      checked={smtpSecure}
                      onCheckedChange={(checked) => setSmtpSecure(checked === true)}
                    />
                    <Label htmlFor="smtpSecure">Use SSL/TLS</Label>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting to email server...
                    </>
                  ) : (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in
                    </>
                  )}
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <div className="text-xs text-center text-gray-500">
            This app uses a secure backend server for IMAP/SMTP connections to your email account.
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default LoginForm;
