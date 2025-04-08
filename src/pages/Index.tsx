
import { EmailProvider } from "@/context/EmailContext";
import { useState } from "react";
import LoginForm from "@/components/LoginForm";
import EmailDashboard from "@/components/EmailDashboard";

const Index = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return (
    <EmailProvider>
      {!isLoggedIn ? (
        <LoginForm onSuccess={() => setIsLoggedIn(true)} />
      ) : (
        <EmailDashboard />
      )}
    </EmailProvider>
  );
};

export default Index;
