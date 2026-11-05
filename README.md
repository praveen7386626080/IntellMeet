# IntellMeet – Smart Meeting & Collaboration Platform

IntellMeet is a full-stack web-based meeting and collaboration platform designed to help teams communicate, organize work, and collaborate efficiently. It combines real-time meetings, workspace management, participant interaction, and AI-powered meeting assistance in one platform.

## Live Application

- **Frontend:** https://intell-meet-l8ws.vercel.app
- **Backend API:** https://intellmeet-backend-hsrt.onrender.com
- **GitHub Repository:** https://github.com/praveen7386626080/IntellMeet

## Features

### Authentication & User Profile
- User registration and login using email and password.
- Secure JWT-based authentication.
- User profile management.
- Profile photo upload using Cloudinary.

### Meetings & Collaboration
- Create and schedule meetings.
- Join live meeting rooms.
- Real-time participant updates.
- Audio and video communication.
- Microphone and camera controls.
- Real-time meeting chat.
- Raise Hand functionality.
- Host-controlled meeting termination.

### Workspace Management
- Create and manage projects.
- Create and assign tasks.
- Track task status.
- Invite existing IntellMeet users to workspaces.
- Share workspace messages.
- View workspace analytics.

### AI Meeting Assistance
- Browser-based speech transcription.
- Save meeting transcripts.
- Generate AI-powered meeting summaries.
- Extract key decisions and action items.
- Ollama Cloud integration for AI-powered summaries.

## Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express.js, TypeScript |
| Real-time Communication | Socket.IO, WebRTC |
| Database | MongoDB, Mongoose |
| Authentication | JWT, bcryptjs |
| Profile Image Storage | Cloudinary |
| AI Summaries | Ollama Cloud |
| Deployment | Vercel, Render |

## Requirements

- Node.js and npm
- MongoDB Atlas or local MongoDB
- Google Chrome or Microsoft Edge
- Ollama Cloud API key for AI meeting summaries

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/praveen7386626080/IntellMeet.git
cd IntellMeet
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` directory and configure the required environment variables:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_secret
PORT=5002
CLIENT_URL=http://localhost:5173

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

OLLAMA_BASE_URL=https://ollama.com
OLLAMA_MODEL=gemma4:31b
OLLAMA_PROXY_TOKEN=your_ollama_cloud_api_key
```

Use your own credentials. Never upload your `.env` file or expose private keys.

Start the backend:

```bash
npm run dev
```

The local backend runs at:

`http://localhost:5002`

### 3. Frontend Setup

Open another terminal from the project root:

```bash
cd frontend
npm install
```

Create a `.env` file inside the `frontend` directory:

```env
VITE_API_URL=http://localhost:5002/api
```

Start the frontend:

```bash
npm run dev
```

Open the local URL printed by Vite. By default:

`http://localhost:5173`

### 4. AI Meeting Summaries

IntellMeet uses Ollama Cloud for AI-powered meeting summaries.

Configure the following backend environment variables:

```env
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_MODEL=gemma4:31b
OLLAMA_PROXY_TOKEN=your_ollama_cloud_api_key
```

Use a supported Ollama Cloud model and a valid API key. Keep the API key secure and do not expose it in frontend code.

## Build

### Backend

```bash
cd backend
npm run build
```

### Frontend

```bash
cd frontend
npm run build
```

## Deployment

The application is deployed using:

- **Frontend:** Vercel
- **Backend:** Render
- **Database:** MongoDB Atlas
- **AI Service:** Ollama Cloud

The deployed frontend communicates with the backend through the `VITE_API_URL` environment variable.

## Important Notes

- Email/password authentication is used in the current version.
- Google and GitHub OAuth sign-in options are not included in the current login interface.
- Profile photo uploads require valid Cloudinary credentials.
- Speech recognition depends on browser support and microphone permissions.
- AI meeting summaries require valid Ollama Cloud configuration.
- The backend uses environment variables for database connections, authentication, and external service credentials.
- Never commit `.env` files, API keys, passwords, or private credentials to GitHub.

## Application Screenshots

### Login Page

[IntellMeet Login](https://github.com/praveen7386626080/IntellMeet/blob/main/screenshots/login.png)

### Dashboard

[IntellMeet Dashboard](https://github.com/praveen7386626080/IntellMeet/blob/main/screenshots/dashboard.png)

### User Profile

[IntellMeet Profile](https://github.com/praveen7386626080/IntellMeet/blob/main/screenshots/profile.png)

### Live Meeting Room

[IntellMeet Meeting Room](https://github.com/praveen7386626080/IntellMeet/blob/main/screenshots/meeting.png)

---

**IntellMeet – Meet Smarter. Work Better.**
