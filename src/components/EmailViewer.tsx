import { useEmail } from "@/context/EmailContext";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { ArrowLeft, Trash2, Reply, Forward, PenSquare, MoreHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useCallback } from "react";
import EmailComposer from "./EmailComposer";
import EmailSummarizer from "./EmailSummarizer";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const EmailViewer = () => {
  const { selectedEmail, selectEmail, deleteEmail } = useEmail();
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<'compose' | 'reply' | 'forward'>('compose');
  const [isDeleting, setIsDeleting] = useState(false);
  const isMobile = useIsMobile();

  const handleDelete = async () => {
    if (!selectedEmail) return;
    
    try {
      setIsDeleting(true);
      await deleteEmail(selectedEmail.id);
      // The EmailContext will handle removing the email from state
    } catch (error) {
      console.error("Failed to delete email:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Format the date properly, handling both Date objects and string dates
  const formatEmailDate = useCallback((date: Date | string) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    return format(dateObj, "MMMM dd, yyyy, HH:mm", { locale: enUS });
  }, []);

  // Safely extract "to" addresses
  const getToAddresses = useCallback(() => {
    if (!selectedEmail?.to || !Array.isArray(selectedEmail.to)) {
      return "";
    }
    return selectedEmail.to.map((to) => to.address || to).join(", ");
  }, [selectedEmail]);

  const handleReply = useCallback(() => {
    setComposerMode('reply');
    setComposerOpen(true);
  }, []);

  const handleForward = useCallback(() => {
    setComposerMode('forward');
    setComposerOpen(true);
  }, []);

  const handleCompose = useCallback(() => {
    setComposerMode('compose');
    setComposerOpen(true);
  }, []);

  const handleCloseComposer = useCallback(() => {
    setComposerOpen(false);
  }, []);

  if (!selectedEmail) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
          <Mail className="h-16 w-16 mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">No email selected</h3>
          <p className="text-center">
            Select an email from the list to view it here.
          </p>
          <Button 
            className="mt-6"
            onClick={handleCompose}
          >
            <PenSquare className="h-4 w-4 mr-2" /> Compose new email
          </Button>
          <EmailComposer 
            key="empty-view-composer"
            isOpen={composerOpen}
            onClose={handleCloseComposer}
            mode={composerMode}
            originalEmail={composerMode !== 'compose' ? selectedEmail : undefined}
          />
        </div>
      </div>
    );
  }

  // Mobile Action Buttons or Desktop Action Buttons
  const ActionButtons = isMobile ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleCompose}>
          <PenSquare className="h-4 w-4 mr-2" />
          New Email
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleReply}>
          <Reply className="h-4 w-4 mr-2" />
          Reply
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleForward}>
          <Forward className="h-4 w-4 mr-2" />
          Forward
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-red-500 focus:text-red-500"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <div className="flex space-x-2">
      <Button variant="ghost" size="icon" onClick={handleCompose} title="New Email">
        <PenSquare className="h-5 w-5" />
      </Button>
      <Button variant="ghost" size="icon" onClick={handleReply} title="Reply">
        <Reply className="h-5 w-5" />
      </Button>
      <Button variant="ghost" size="icon" onClick={handleForward} title="Forward">
        <Forward className="h-5 w-5" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={handleDelete} 
        disabled={isDeleting}
        title="Delete Email"
      >
        <Trash2 className="h-5 w-5" />
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header - Fixed */}
      <div className="shrink-0 border-b bg-white">
        <div className="p-4 flex items-center justify-between">
          <h2 className={`text-lg font-medium truncate flex-1`}>
            {selectedEmail.subject}
          </h2>
          {ActionButtons}
        </div>
        <div className="p-4 border-b">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
            <div>
              <div className="font-medium">
                {selectedEmail.from.name || selectedEmail.from.address}
              </div>
              <div className="text-sm text-gray-500">
                {selectedEmail.from.name ? `<${selectedEmail.from.address}>` : ""}
              </div>
            </div>
            <div className="text-sm text-gray-500 mt-1 sm:mt-0">
              {formatEmailDate(selectedEmail.date)}
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            <div className="font-medium inline-block">To:</div> {getToAddresses()}
          </div>
        </div>
      </div>
      
      {/* Content - Scrollable */}
      <ScrollArea className="flex-1 overflow-hidden pb-16">
        <div className="p-4">
          {/* AI Summary Button/Component */}
          <EmailSummarizer 
            emailContent={selectedEmail.body} 
            emailSubject={selectedEmail.subject} 
          />

          <div 
            className="prose max-w-none prose-img:mx-auto prose-img:max-w-full"
            dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
          />
        </div>
      </ScrollArea>

      {/* Mobile Action Bar - Fixed at bottom */}
      {isMobile && (
        <div className="fixed bottom-14 left-0 right-0 bg-white border-t p-2 flex justify-around z-10">
          <Button variant="ghost" size="sm" onClick={handleReply} title="Reply">
            <Reply className="h-4 w-4 mr-2" />
            Reply
          </Button>
          <Button variant="ghost" size="sm" onClick={handleForward} title="Forward">
            <Forward className="h-4 w-4 mr-2" />
            Forward
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleDelete} 
            disabled={isDeleting}
            title="Delete Email"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      )}

      {/* Email Composer Dialog */}
      <EmailComposer 
        key="email-view-composer"
        isOpen={composerOpen}
        onClose={handleCloseComposer}
        mode={composerMode}
        originalEmail={composerMode !== 'compose' ? selectedEmail : undefined}
      />
    </div>
  );
};

function Mail(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export default EmailViewer;
