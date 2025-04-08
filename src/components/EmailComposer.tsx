import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEmail } from "@/context/EmailContext";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, HelpCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EmailComposerProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'compose' | 'reply' | 'forward';
  originalEmail?: any;
}

const EmailComposer = ({ isOpen, onClose, mode, originalEmail }: EmailComposerProps) => {
  const { account, sendEmail, forwardEmail } = useEmail();
  const { toast } = useToast();
  const [to, setTo] = useState<string>('');
  const [cc, setCc] = useState<string>('');
  const [bcc, setBcc] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [showCcBcc, setShowCcBcc] = useState<boolean>(false);
  const [formInitialized, setFormInitialized] = useState<boolean>(false);

  // Reset form fields when dialog is closed
  useEffect(() => {
    if (!isOpen) {
      setFormInitialized(false);
    }
  }, [isOpen]);

  // Helper function to format recipient list
  const getFormattedRecipients = useCallback((recipients) => {
    if (!recipients || !Array.isArray(recipients)) return '';
    return recipients.map(r => r.name ? `${r.name} <${r.address}>` : r.address).join(', ');
  }, []);

  // Helper function to remove HTML tags from body
  const stripHtml = useCallback((html) => {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  }, []);

  // Initialize form fields based on mode
  useEffect(() => {
    // Only initialize when dialog is open and form hasn't been initialized yet
    if (isOpen && !formInitialized) {
      if (mode === 'reply' && originalEmail) {
        setTo(originalEmail.from.address);
        setSubject(`Re: ${originalEmail.subject.startsWith('Re:') ? originalEmail.subject.substring(3).trim() : originalEmail.subject}`);
        setBody(`\n\n\n-------- Original Message --------\nFrom: ${originalEmail.from.name || originalEmail.from.address}\nDate: ${new Date(originalEmail.date).toLocaleString()}\nSubject: ${originalEmail.subject}\n\n${stripHtml(originalEmail.body)}`);
      } else if (mode === 'forward' && originalEmail) {
        setSubject(`Fwd: ${originalEmail.subject.startsWith('Fwd:') ? originalEmail.subject.substring(4).trim() : originalEmail.subject}`);
        setBody(`\n\n\n-------- Forwarded Message --------\nFrom: ${originalEmail.from.name || originalEmail.from.address}\nDate: ${new Date(originalEmail.date).toLocaleString()}\nSubject: ${originalEmail.subject}\nTo: ${getFormattedRecipients(originalEmail.to)}\n\n${stripHtml(originalEmail.body)}`);
      } else {
        // Reset everything for new email
        setTo('');
        setCc('');
        setBcc('');
        setSubject('');
        setBody('');
      }
      
      // Mark that the form has been initialized
      setFormInitialized(true);
      
      // Focus on recipient field for compose mode
      if (mode === 'compose') {
        setTimeout(() => {
          const toInput = document.getElementById('to');
          if (toInput) {
            toInput.focus();
          }
        }, 100);
      }
    }
  }, [mode, originalEmail, isOpen, formInitialized, stripHtml, getFormattedRecipients]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!to.trim()) {
      toast({
        title: "Error",
        description: "Please specify at least one recipient.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      if (mode === 'forward' && originalEmail) {
        // Forward email
        await forwardEmail({
          originalEmailId: originalEmail.id,
          to: to.split(',').map(t => t.trim()),
          cc: cc ? cc.split(',').map(c => c.trim()) : [],
          bcc: bcc ? bcc.split(',').map(b => b.trim()) : [],
          additionalText: body,
        });
      } else {
        // Send new email or reply
        await sendEmail({
          to: to.split(',').map(t => t.trim()),
          cc: cc ? cc.split(',').map(c => c.trim()) : [],
          bcc: bcc ? bcc.split(',').map(b => b.trim()) : [],
          subject,
          text: body,
          html: `<div>${body.replace(/\n/g, '<br>')}</div>`
        });
      }

      toast({
        title: "Success",
        description: "Your email has been sent successfully.",
      });

      onClose();
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: "Error Sending",
        description: error instanceof Error ? error.message : "An error occurred while sending your email.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const getDialogTitle = () => {
    switch (mode) {
      case 'compose': return 'New Email';
      case 'reply': return 'Reply';
      case 'forward': return 'Forward';
      default: return 'Email';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>
            {account?.email ? `Sent from: ${account.email}` : 'Create your email'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          <div className="space-y-2 mb-2">
            <div className="flex items-center">
              <Label htmlFor="to" className="w-12">To:</Label>
              <Input 
                id="to" 
                value={to} 
                onChange={(e) => setTo(e.target.value)} 
                placeholder="recipient@example.com, ..."
                className="flex-1"
              />
            </div>
            
            {showCcBcc && (
              <>
                <div className="flex items-center">
                  <Label htmlFor="cc" className="w-12">CC:</Label>
                  <Input 
                    id="cc" 
                    value={cc} 
                    onChange={(e) => setCc(e.target.value)} 
                    placeholder="cc@example.com, ..."
                    className="flex-1"
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="ml-1 h-8 w-8">
                          <HelpCircle className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>CC (Carbon Copy): Recipients in this field will receive a copy of the email and all recipients will see who was CC'd.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center">
                  <Label htmlFor="bcc" className="w-12">BCC:</Label>
                  <Input 
                    id="bcc" 
                    value={bcc} 
                    onChange={(e) => setBcc(e.target.value)} 
                    placeholder="bcc@example.com, ..."
                    className="flex-1"
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="ml-1 h-8 w-8">
                          <HelpCircle className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>BCC (Blind Carbon Copy): Recipients in this field will receive a copy of the email, but other recipients won't see who was BCC'd.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </>
            )}
            
            {!showCcBcc && (
              <Button type="button" variant="link" className="text-xs p-0" onClick={() => setShowCcBcc(true)}>
                Show CC/BCC
              </Button>
            )}
            
            {mode !== 'forward' && (
              <div className="flex items-center">
                <Label htmlFor="subject" className="w-12">Subject:</Label>
                <Input 
                  id="subject" 
                  value={subject} 
                  onChange={(e) => setSubject(e.target.value)} 
                  placeholder="Your subject"
                  className="flex-1"
                />
              </div>
            )}
          </div>
          
          <Textarea 
            id="body" 
            value={body} 
            onChange={(e) => setBody(e.target.value)} 
            placeholder="Write your message here..."
            className="flex-1 resize-none min-h-[200px]"
          />
          
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSending}>
              {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EmailComposer;