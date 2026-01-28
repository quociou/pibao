<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Pi-Bao Health Tracker

A modern health tracking application built with React, Vite, and TypeScript.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher recommended)
- npm

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up environment variables:
   - Copy `.env.example` to `.env` (if available) or create `.env.local`.
   - Add your `GEMINI_API_KEY` if required.

3. Start the development server:
   ```bash
   npm run dev
   ```

## 🛠 Scripts

- `npm run dev`: Starts the development server.
- `npm run build`: Builds the app for production to the `dist` folder.
- `npm run preview`: Locally preview the production build.
- `npm run lint`: Run ESLint.

## 📦 Deployment

This project is configured to deploy automatically to **GitHub Pages** using GitHub Actions.

1. Push your changes to the `main` branch.
2. The `Deploy to GitHub Pages` workflow will trigger automatically.
3. Your app will be live at `https://<your-username>.github.io/pibao/`.

> **Note:** Ensure your repository name matches the `base` path in `vite.config.ts` if it differs from `pibao`.
