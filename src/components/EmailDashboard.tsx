import { useEmail } from "@/context/EmailContext";
import EmailSidebar from "./EmailSidebar";
import EmailList from "./EmailList";
import EmailViewer from "./EmailViewer";
import { useIsMobile } from "@/hooks/use-mobile";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, Mail, Inbox, ArrowLeft } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const EmailDashboard = () => {
  const { selectedEmail, logout, selectEmail } = useEmail();
  const isMobile = useIsMobile();
  const [sidebarSize, setSidebarSize] = useState(15); // 15% of width
  const [emailListSize, setEmailListSize] = useState(30); // 30% of width
  const [mobileView, setMobileView] = useState<'sidebar' | 'list' | 'viewer'>(
    selectedEmail ? 'viewer' : 'list'
  );

  // Update mobile view when selectedEmail changes
  useEffect(() => {
    if (isMobile) {
      setMobileView(selectedEmail ? 'viewer' : 'list');
    }
  }, [selectedEmail, isMobile]);

  // Extract Header component to avoid code duplication
  const Header = useMemo(() => {
    const mobileSidebarButton = isMobile && mobileView !== 'sidebar' && (
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="mr-2">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
    );
    
    const mobileBackButton = isMobile && mobileView === 'viewer' && (
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={() => {
          selectEmail(null);
          setMobileView('list');
        }}
        className="mr-2"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
    );

    return (
      <header className="h-14 border-b bg-white flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center">
          {mobileSidebarButton}
          {mobileBackButton}
          <div className="text-xl font-bold text-primary flex items-center">
            <Mail className="h-5 w-5 mr-2 hidden xs:inline-block" />
            EMAILS
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline-block">Logout</span>
        </Button>
      </header>
    );
  }, [logout, isMobile, mobileView, selectEmail, selectedEmail]);

  // Callbacks for size changes
  const handleSidebarResize = useCallback((size: number) => {
    setSidebarSize(size);
  }, []);

  const handleEmailListResize = useCallback((size: number) => {
    setEmailListSize(size);
  }, []);

  // Mobile view
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-gray-50">
        <Sheet>
          {Header}
          <div className="flex-1 overflow-hidden">
            {mobileView === 'list' && <EmailList onSelectEmail={() => setMobileView('viewer')} />}
            {mobileView === 'viewer' && selectedEmail && <EmailViewer />}
          </div>
          
          {/* Mobile Navigation Footer */}
          <div className="h-14 border-t bg-white flex items-center justify-around px-4 shrink-0 fixed bottom-0 left-0 right-0 z-10">
            <Button 
              variant={mobileView === 'list' ? "default" : "ghost"} 
              size="sm" 
              onClick={() => {
                setMobileView('list');
                selectEmail(null);
              }}
              className="flex-1"
            >
              <Inbox className="h-5 w-5 mr-2" />
              Emails
            </Button>
          </div>
          
          {/* Mobile Sidebar as drawer */}
          <SheetContent side="left" className="w-4/5 max-w-xs p-0">
            <div className="h-full">
              <EmailSidebar 
                onSelectFolder={() => {
                  setMobileView('list');
                  selectEmail(null);
                }} 
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // Desktop view
  return (
    <div className="flex flex-col h-screen">
      {Header}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Sidebar */}
          <ResizablePanel 
            defaultSize={sidebarSize} 
            minSize={10} 
            maxSize={25}
            onResize={handleSidebarResize}
            className="md:overflow-hidden"
          >
            <EmailSidebar />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          {/* Email List */}
          <ResizablePanel 
            defaultSize={emailListSize} 
            minSize={20} 
            maxSize={50}
            onResize={handleEmailListResize}
            className="overflow-hidden"
          >
            <EmailList />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          {/* Email View */}
          <ResizablePanel className="overflow-hidden">
            {selectedEmail ? (
              <EmailViewer />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">Select an email to view it</p>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default EmailDashboard;
