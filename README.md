# 🍡 **Mochi Chat** - AI-Powered Web & PDF Assistant

<div align="center">
  <p><em>Chat with your PDFs and websites using AI</em></p>

  ![Version](https://img.shields.io/badge/version-1.7-blue?style=flat-square)
  ![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?style=flat-square&logo=google-chrome)
  ![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow?style=flat-square&logo=javascript)
  ![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?style=flat-square&logo=node.js)
</div>

<div align="center">
  <a href="https://www.youtube.com/watch?v=kmJeUQgmOLw" target="_blank">
    <img src="https://img.youtube.com/vi/kmJeUQgmOLw/maxresdefault.jpg" alt="Mochi Chat Demo Video" width="600">
  </a>
  <p><em>📺 Watch the demo: See Mochi Chat in action</em></p>
</div>

---

## 🚀 **What is Mochi Chat?**

Mochi Chat is a Chrome extension that enables seamless AI conversations with web content and PDF documents. Get instant insights from any webpage or PDF using OpenAI GPT-4o/GPT-4o-mini or Google Gemini, with real-time streaming responses.

### 🎯 **Key Highlights**
- **Multi-Provider AI**: Chat with OpenAI GPT-4o & Gemini models
- **Universal Content**: Works with PDFs and any website
- **Real-time Streaming**: Live response streaming with smooth UX
- **Visual Analysis**: Screenshot analysis with vision models
- **Keyboard Shortcuts**: Quick access via Ctrl+K (Cmd+K on Mac)
- **Conversation Memory**: Persistent chat history across sessions

---

## 🏗️ **Architecture & Tech Stack**

### **Backend**
- **Runtime**: Node.js with Vercel serverless functions
- **AI Providers**: OpenAI GPT-4o/4o-mini, Google Gemini 2.0 Flash
- **API**: RESTful endpoints with Server-Sent Events (SSE)
- **Deployment**: Vercel with automatic CORS handling

### **Extension**
- **Framework**: Vanilla JavaScript (ES6 modules)
- **Manifest**: Chrome Extension Manifest V3
- **PDF Processing**: PDF.js for document parsing
- **Rendering**: KaTeX + Marked.js for math and markdown
- **Storage**: Chrome local storage for conversation history

### **System Overview**
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Chrome        │    │   Vercel API     │    │   AI Providers  │
│   Extension     │◄──►│   Backend        │◄──►│   OpenAI/Gemini │
│                 │    │                  │    │                 │
│ • Content Script│    │ • Chat API       │    │ • GPT-4o        │
│ • Background    │    │ • Health Check   │    │ • GPT-4o-mini   │
│ • Popup         │    │ • Provider Logic │    │ • Gemini 2.0    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

---

## 🚀 **Quick Start**

### **Prerequisites**
- Chrome Browser (Manifest V3 support)
- OpenAI API Key and/or Gemini API Key
- Node.js 16+ (for backend development)

### **Installation**

```bash
# Clone the repository
git clone <repository-url>
cd MochiChat

# Install backend dependencies
cd backend
npm install

# Set up environment variables
cp .env.example .env.local
# Add your API keys

# Deploy backend (optional - already hosted)
npm run deploy
```

### **Install from Chrome Web Store (Recommended)**
[![Install from Chrome Web Store](https://img.shields.io/badge/Install%20from-Chrome%20Web%20Store-4285F4?style=for-the-badge&logo=google-chrome)](https://chromewebstore.google.com/detail/mochi-chat/dojhinffaciclilkppfdndeigeogkkak?authuser=1&hl=en)

1. Visit the [Chrome Web Store page](https://chromewebstore.google.com/detail/mochi-chat/dojhinffaciclilkppfdndeigeogkkak?authuser=1&hl=en)
2. Click "Add to Chrome"
3. Press `Ctrl+K` (or `Cmd+K` on Mac) on any webpage to start chatting!

### **Load Extension for Development**
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension/` directory
4. Press `Ctrl+K` (or `Cmd+K` on Mac) on any webpage to start chatting!

### **Environment Variables**
```env
# AI Provider API Keys
OPENAI_API_KEY=sk-your_openai_key
GEMINI_API_KEY=your_gemini_key

# Optional for development
NODE_ENV=development
VERCEL_ENV=development
```

---

## 🎨 **Features**

### **🤖 Multi-Provider AI Support**
- OpenAI GPT-4o and GPT-4o-mini models
- Google Gemini 2.0 Flash model
- Real-time streaming responses with optimized chunk processing
- Automatic model selection based on use case

### **📄 Universal Content Processing**
- **PDF Chat**: Extract and analyze PDF content using PDF.js
- **Website Integration**: Intelligent text extraction from any webpage
- **Screenshot Analysis**: Vision capabilities for visual page analysis
- **Dynamic Content**: Support for SPAs and dynamic websites

### **💬 Advanced Chat Interface**
- Real-time streaming with smooth user experience
- Persistent conversation history across sessions
- Multi-modal input (text + screenshots)
- Domain-specific show/hide functionality

### **⌨️ Developer Experience**
- Keyboard shortcuts for instant access
- Extension popup for settings and domain management
- Comprehensive logging for debugging
- Type-safe message validation system

---

## 🏭 **Project Structure**

```
MochiChat/
├── backend/                 # Serverless API backend
│   ├── api/
│   │   ├── chat.js         # Main chat API with streaming
│   │   └── health.js       # Health check endpoint
│   ├── lib/
│   │   ├── openai.js       # OpenAI integration
│   │   └── gemini.js       # Gemini integration
│   ├── types/
│   │   └── message.js      # Message type definitions
│   ├── package.json        # Backend dependencies
│   └── vercel.json         # Deployment configuration
├── extension/              # Chrome extension
│   ├── manifest.json       # Extension manifest (v3)
│   ├── background.js       # Service worker
│   ├── content.js          # Content script injection
│   ├── chat.js            # Chat logic & API communication
│   ├── conversation.js     # History management
│   ├── extract-text.js     # Content extraction utilities
│   └── styles.css         # UI styling
└── README.md              # This file
```

### **Key Components**
- **`backend/api/chat.js`**: Main API endpoint with multi-provider support and streaming
- **`extension/content.js`**: UI injection and text extraction logic
- **`extension/chat.js`**: AI communication and response handling
- **`backend/types/message.js`**: Type definitions for message validation

---

## 🔧 **Development**

### **Available Scripts**
```bash
# Backend development
cd backend
npm run dev        # Start local development server
npm run deploy     # Deploy to Vercel

# Extension development
# 1. Make changes to files in extension/
# 2. Go to chrome://extensions/
# 3. Click "Reload" on Mochi Chat extension
```

### **Usage Examples**

#### **Basic Web Chat**
1. Navigate to any webpage
2. Press `Ctrl+K` (or `Cmd+K` on Mac)
3. Type your question about the page content
4. Get AI-powered insights instantly

#### **PDF Analysis**
1. Open any PDF file in Chrome
2. Grant file access permission when prompted
3. Use `Ctrl+K` to chat with PDF content
4. Ask questions about specific sections or overall content

#### **Screenshot Analysis**
1. Enable screenshot option in chat interface
2. AI analyzes both text and visual elements
3. Get comprehensive insights about page layout and content

---

## 🚢 **Deployment**

### **Backend (Vercel)**
```bash
cd backend
npm install -g vercel
vercel login
vercel --prod
```

### **Extension Distribution**
- **Chrome Web Store**: Package for store submission
- **Enterprise**: Deploy via Chrome Enterprise policies
- **Development**: Direct loading via developer mode

---

## 🤝 **Contributing**

We welcome contributions! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Test with both AI providers
4. Submit a pull request with detailed description

### **Testing Requirements**
- Verify PDF and web content extraction
- Test conversation history persistence
- Check error handling scenarios
- Validate both OpenAI and Gemini providers

---

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

---

## 🔗 **Links**

- **🏪 Chrome Web Store**: [Install Mochi Chat](https://chromewebstore.google.com/detail/mochi-chat/dojhinffaciclilkppfdndeigeogkkak?authuser=1&hl=en)
- **📺 Demo Video**: [Watch on YouTube](https://www.youtube.com/watch?v=kmJeUQgmOLw)

---

<div align="left">
  <p><strong>Built with ❤️ by Team Mochi</strong></p>
  <p><em>Making AI conversations accessible everywhere on the web</em></p>
</div>
