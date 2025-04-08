import { useEmail } from "@/context/EmailContext";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { Paperclip, Search, Filter } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCallback, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

interface EmailListProps {
  onSelectEmail?: () => void;
}

const EmailList = ({ onSelectEmail }: EmailListProps) => {
  const { emails, selectedEmail, currentFolder, fetchEmail } = useEmail();
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState("");

  // Memoize the unread email count to avoid recalculation on each render
  const unreadCount = useMemo(() => 
    emails.filter(e => !e.isRead).length, 
    [emails]
  );

  // Filter emails based on search term
  const filteredEmails = useMemo(() => {
    if (!searchTerm.trim()) return emails;
    
    const term = searchTerm.toLowerCase();
    return emails.filter(email => 
      (email.subject && email.subject.toLowerCase().includes(term)) ||
      (email.from.name && email.from.name.toLowerCase().includes(term)) ||
      (email.from.address && email.from.address.toLowerCase().includes(term)) ||
      (typeof email.body === 'string' && email.body.toLowerCase().includes(term))
    );
  }, [emails, searchTerm]);

  const formatDate = useCallback((date: Date) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (date >= today) {
      return format(date, "HH:mm", { locale: enUS });
    } else if (date >= new Date(today.getTime() - 86400000)) {
      return "Yesterday";
    } else if (date >= new Date(today.getFullYear(), today.getMonth(), 1)) {
      return format(date, "MMM dd", { locale: enUS });
    } else {
      return format(date, "MM/dd/yy", { locale: enUS });
    }
  }, []);

  // Get the human-readable folder name
  const getFolderDisplayName = useCallback(() => {
    switch (currentFolder.toLowerCase()) {
      case 'inbox': return 'Inbox';
      case 'sent': return 'Sent';
      case 'drafts': return 'Drafts';
      case 'trash': return 'Trash';
      case 'spam': return 'Spam';
      default: return currentFolder;
    }
  }, [currentFolder]);

  const handleEmailClick = useCallback((email) => {
    fetchEmail(email.id);
    // Callback for mobile view
    if (onSelectEmail) {
      onSelectEmail();
    }
  }, [fetchEmail, onSelectEmail]);

  // Function to safely strip HTML and create a preview
  const createPreview = useCallback((body: string | undefined): string => {
    if (!body || typeof body !== 'string') return 'No preview available';
    return body.replace(/<[^>]*>?/gm, '').substring(0, 60) + '...';
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b font-semibold flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">{getFolderDisplayName()}</h2>
          {unreadCount > 0 && (
            <span className="ml-2 text-xs bg-primary text-white rounded-full px-2 py-0.5">
              {unreadCount} unread
            </span>
          )}
        </div>
        
        {/* Search bar for mobile and desktop view */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search emails..."
              className="pl-8 pr-4 h-9 text-sm"
            />
          </div>
          {isMobile && (
            <Button variant="outline" size="icon" className="shrink-0 h-9 w-9">
              <Filter className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full pb-14">
          {filteredEmails.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {searchTerm ? "No emails found" : "No emails available"}
            </div>
          ) : (
            <div className="divide-y">
              {filteredEmails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => handleEmailClick(email)}
                  className={cn(
                    "p-3 cursor-pointer hover:bg-gray-100 transition-colors",
                    selectedEmail?.id === email.id && "bg-primary/10",
                    !email.isRead && "font-semibold",
                    "active:bg-gray-200", // Better touch feedback for mobile
                  )}
                >
                  <div className="flex justify-between mb-1">
                    <span className={cn("truncate max-w-[70%]", !email.isRead && "font-bold")}>
                      {email.from.name || email.from.address}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {formatDate(new Date(email.date))}
                    </span>
                  </div>
                  <div className="text-sm truncate">{email.subject}</div>
                  <div className="flex items-center mt-1">
                    <div className="text-xs text-gray-500 truncate">
                      {createPreview(email.body)}
                    </div>
                    {email.hasAttachments && (
                      <Paperclip className="h-3 w-3 ml-1 text-gray-400 shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

export default EmailList;
