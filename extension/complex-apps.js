/**
 * Configuration for complex web applications
 * These are applications where text extraction is difficult
 * and screenshots are more valuable
 */

export const COMPLEX_APP_PATTERNS = [
  // Office Online applications
  { domain: 'office.live.com', paths: ['/excel/', '/word/', '/powerpoint/'] },
  { domain: 'office365.com' },
  { domain: 'sharepoint.com' },
  { domain: 'onedrive.live.com' },
  
  // Google Workspace applications
  { domain: 'docs.google.com' },
  { domain: 'sheets.google.com' },
  { domain: 'slides.google.com' },
  { domain: 'drive.google.com' },
  
  // Email clients
  { domain: 'outlook.office.com' },
  { domain: 'outlook.live.com' },
  { domain: 'mail.google.com' },
  
  // Other complex web apps
  { domain: 'figma.com' },
  { domain: 'miro.com' },
  { domain: 'notion.so' },
  { domain: 'airtable.com' }
];
