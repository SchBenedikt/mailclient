import React, { useState } from 'react';
import { Sparkles, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';

interface EmailSummarizerProps {
  emailContent: string;
  emailSubject: string;
}

const EmailSummarizer: React.FC<EmailSummarizerProps> = ({ emailContent, emailSubject }) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Generate an email summary using the Gemini API
  const generateSummary = async () => {
    setIsLoading(true);
    setError(null);
    setIsVisible(true);

    try {
      // Strip HTML tags for plain text summary
      const plainTextContent = stripHtml(emailContent);
      
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': '' // Note: In production, this should be secured
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Summarize the following email in 3-5 bullet points using Markdown formatting. Make sure each bullet point starts with * and is properly formatted as Markdown.
              Subject: ${emailSubject}
              Email content: ${plainTextContent}`
            }]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const summaryText = data.candidates[0].content.parts[0].text;
      setSummary(summaryText);
    } catch (err) {
      console.error('Error generating summary:', err);
      setError('Failed to generate summary. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to strip HTML tags
  const stripHtml = (html: string): string => {
    const tempElement = document.createElement('div');
    tempElement.innerHTML = html;
    return tempElement.textContent || tempElement.innerText || '';
  };

  const closeSummary = () => {
    setIsVisible(false);
    // Reset after animation
    setTimeout(() => {
      setSummary(null);
      setError(null);
    }, 300);
  };

  // For the AI Summarize button
  if (!isVisible) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="my-2"
        onClick={generateSummary}
      >
        <Sparkles className="h-4 w-4 mr-2" /> AI Summary
      </Button>
    );
  }

  return (
    <Card className={`my-2 border-blue-200 bg-blue-50 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-medium flex items-center">
            <Sparkles className="h-4 w-4 mr-2 text-blue-500" /> 
            AI Email Summary
          </h3>
          <Button variant="ghost" size="sm" onClick={closeSummary} className="h-6 w-6 p-0">
            <XCircle className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />
            <span className="text-sm">Generating summary...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : summary ? (
          <ScrollArea className="max-h-40 rounded-md">
            <div className="text-sm prose prose-sm max-w-none">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          </ScrollArea>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default EmailSummarizer;