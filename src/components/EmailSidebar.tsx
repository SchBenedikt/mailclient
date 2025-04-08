import { useEmail } from "@/context/EmailContext";
import { cn } from "@/lib/utils";
import { Mail, Send, File, Trash2, AlertTriangle, Folder, PenSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useCallback } from "react";
import EmailComposer from "./EmailComposer";
import { useIsMobile } from "@/hooks/use-mobile";
import { SheetClose } from "@/components/ui/sheet";

interface EmailSidebarProps {
  onSelectFolder?: () => void;
}

const EmailSidebar = ({ onSelectFolder }: EmailSidebarProps) => {
  const { folders, fetchEmails, currentFolder } = useEmail();
  const [composerOpen, setComposerOpen] = useState(false);
  const isMobile = useIsMobile();

  const getIcon = (id: string) => {
    // Handle case-insensitive comparisons for standard folder names
    const lowerCaseId = id.toLowerCase();
    
    if (lowerCaseId.includes('inbox')) return <Mail className="h-4 w-4" />;
    if (lowerCaseId.includes('sent')) return <Send className="h-4 w-4" />;
    if (lowerCaseId.includes('draft')) return <File className="h-4 w-4" />;
    if (lowerCaseId.includes('trash') || lowerCaseId.includes('deleted')) return <Trash2 className="h-4 w-4" />;
    if (lowerCaseId.includes('spam') || lowerCaseId.includes('junk')) return <AlertTriangle className="h-4 w-4" />;
    return <Folder className="h-4 w-4" />;
  };

  const handleFolderClick = useCallback((folderId: string) => {
    fetchEmails(folderId);
    if (onSelectFolder) {
      onSelectFolder();
    }
  }, [fetchEmails, onSelectFolder]);

  // Improved handler for opening the email composer
  const handleComposeClick = useCallback(() => {
    // Short delay to ensure other dialog instances are closed
    setTimeout(() => {
      setComposerOpen(true);
    }, 50);
  }, []);

  // Improved handler for closing the email composer
  const handleCloseComposer = useCallback(() => {
    setComposerOpen(false);
  }, []);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header - Fixed */}
      <div className="p-4 border-b shrink-0 flex items-center justify-between">
        {isMobile && (
          <div className="text-lg font-semibold">Folders</div>
        )}
        
        {isMobile ? (
          <div className="flex items-center gap-2">
            <Button 
              variant="default" 
              size="sm"
              onClick={handleComposeClick}
              className="shrink-0"
            >
              <PenSquare className="h-4 w-4 mr-2" />
              New
            </Button>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <X className="h-5 w-5" />
              </Button>
            </SheetClose>
          </div>
        ) : (
          <Button 
            variant="outline" 
            className="w-full"
            onClick={handleComposeClick}
          >
            <PenSquare className="h-4 w-4 mr-2" />
            New Email
          </Button>
        )}
      </div>

      {/* Folders - Scrollable */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {folders.map((folder) => (
            <Button
              key={folder.id}
              variant="ghost"
              className={cn(
                "w-full justify-between font-normal",
                currentFolder === folder.id ? "bg-primary/10" : "",
                "active:bg-gray-200" // Better touch feedback for mobile
              )}
              onClick={() => handleFolderClick(folder.id)}
            >
              <div className="flex items-center">
                {getIcon(folder.id)}
                <span className="ml-2">{folder.name}</span>
              </div>
              {folder.unread > 0 && (
                <span className="bg-primary text-white text-xs rounded-full px-2 py-0.5">
                  {folder.unread}
                </span>
              )}
            </Button>
          ))}
        </div>
      </ScrollArea>

      {/* Email Composer Dialog with unique key */}
      <EmailComposer 
        key="sidebar-composer"
        isOpen={composerOpen}
        onClose={handleCloseComposer}
        mode="compose"
      />
    </div>
  );
};

export default EmailSidebar;
