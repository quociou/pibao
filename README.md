<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Pi Bao Health Tracker

A comprehensive health tracking application for your pet, built with React, Vite, and Firebase.

## 🚀 Features

- **Daily Dashboard**: Track calories, water intake, and daily activities.
- **History Records**: View historical data with a calendar interface.
- **Cloud Sync**: Securely store data using Firebase.
- **Responsive Design**: Mobile-friendly interface for tracking on the go.

## 🛠️ Tech Stack

- **Framework**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Charts**: [Recharts](https://recharts.org/)
- **Database**: [Firebase](https://firebase.google.com/)

## 🏃‍♂️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (comes with Node.js)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd pi-bao-health-tracker/pibao
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    - Create a `.env.local` file in the root directory.
    - Add your Gemini API Key (if applicable):
      ```env
      GEMINI_API_KEY=your_api_key_here
      ```

4.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to view the app.

## 📦 Building and Deployment

### Build for Production

To create a production-ready build:

```bash
npm run build
```

This generates a `dist` folder containing the optimized static assets.

### Deploy to GitHub Pages

This project uses GitHub Actions for automated deployment.

1.  **Push to Main**: The deployment workflow triggers automatically on push to the `main` branch.
2.  **Configuration**:
    - Go to **Settings > Pages** in your GitHub repository.
    - Set source to **GitHub Actions**.

The workflow is defined in `.github/workflows/deploy.yml`. it handles:
- Checking out code
- Installing dependencies
- Building the project
- Uploading artifacts
- Deploying to GitHub Pages

## 📂 Project Structure

```
pibao/
├── components/     # Reusable UI components
├── services/       # API and utility services
├── App.tsx         # Main application component
├── index.html      # Entry HTML file
├── index.tsx       # Entry JavaScript file
├── tailwind.config.js # Tailwind CSS configuration
└── vite.config.ts  # Vite configuration
```
