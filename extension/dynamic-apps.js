/**
 * Configuration for dynamic web applications
 * These are applications where text extraction is difficult
 * and screenshots are more valuable for context
 */

export const DYNAMIC_APP_PATTERNS = [
  // Office & Productivity
  { domain: 'office.live.com', paths: ['/excel/', '/word/', '/powerpoint/'] },
  { domain: 'office365.com' },
  { domain: 'sharepoint.com' },
  { domain: 'onedrive.live.com' },
  { domain: 'onenote.com' },
  { domain: 'evernote.com' },
  { domain: 'notion.so' },
  { domain: 'clickup.com' },
  { domain: 'monday.com' },
  { domain: 'asana.com' },
  { domain: 'trello.com' },
  { domain: 'airtable.com' },
  { domain: 'coda.io' },
  
  // Google Workspace
  { domain: 'docs.google.com' },
  { domain: 'sheets.google.com' },
  { domain: 'slides.google.com' },
  { domain: 'drive.google.com' },
  { domain: 'jamboard.google.com' },
  
  // Email & Communication
  { domain: 'outlook.office.com' },
  { domain: 'outlook.live.com' },
  { domain: 'mail.google.com' },
  { domain: 'teams.microsoft.com' },
  { domain: 'slack.com' },
  { domain: 'discord.com' },
  { domain: 'zoom.us' },
  
  // Design & Creative
  { domain: 'figma.com' },
  { domain: 'miro.com' },
  { domain: 'sketch.com' },
  { domain: 'adobe.com' },
  { domain: 'canva.com' },
  { domain: 'invisionapp.com' },
  { domain: 'zeplin.io' },
  { domain: 'abstract.com' },
  
  // Development & Coding
  { domain: 'github.dev' },
  { domain: 'vscode.dev' },
  { domain: 'codesandbox.io' },
  { domain: 'replit.com' },
  { domain: 'codepen.io' },
  { domain: 'stackblitz.com' },
  { domain: 'gitlab.com' },
  { domain: 'bitbucket.org' },
  { domain: 'jupyter.org' },
  { domain: 'googlecolab.research.google.com' },
  
  // Marketing & Analytics
  { domain: 'analytics.google.com' },
  { domain: 'datastudio.google.com' },
  { domain: 'mixpanel.com' },
  { domain: 'amplitude.com' },
  { domain: 'segment.com' },
  { domain: 'hubspot.com' },
  { domain: 'salesforce.com' },
  { domain: 'tableau.com' },
  { domain: 'powerbi.microsoft.com' },
  { domain: 'metabase.com' },
  
  // Project Management & Diagrams
  { domain: 'lucidchart.com' },
  { domain: 'draw.io' },
  { domain: 'app.diagrams.net' },
  { domain: 'whimsical.com' },
  { domain: 'jira.com' },
  { domain: 'linear.app' },
  { domain: 'shortcut.com' },
  
  // Collaboration & Whiteboarding
  { domain: 'conceptboard.com' },
  { domain: 'stormboard.com' },
  { domain: 'mural.co' },
  { domain: 'witeboard.com' },
  { domain: 'awwapp.com' },
  
  // Financial & Spreadsheets
  { domain: 'smartsheet.com' },
  { domain: 'zoho.com' },
  { domain: 'quickbooks.intuit.com' },
  { domain: 'xero.com' },
  { domain: 'wave.com' }
];