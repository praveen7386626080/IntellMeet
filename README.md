## Day 15 – Live Audio Transcription Setup

Live meeting transcription uses the browser's Speech Recognition API, and transcripts are saved by the MERN backend.

### Prerequisites

Install the following:
- Node.js and npm
- MongoDB Atlas account or a local MongoDB instance
- Git

### 1. Get the latest project code

```bash
git clone https://github.com/praveen7386626080/IntellMeet.git
cd IntellMeet
```

If you already cloned the repository, update it:

```bash
git pull origin main
```

### 2. Configure the backend

Open a terminal:

```bash
cd backend
npm install
```

Create a local `.env` file inside the `backend` folder. Configure the required environment variables:

```env
MONGODB_URI=your_mongodb_connection_string
PORT=5000
CLIENT_URL=http://localhost:5173
```

Replace the MongoDB placeholder with your own connection string. Do not commit `.env` or share credentials.

Start the backend:

```bash
npm run dev
```

### 3. Configure and start the frontend

Open another terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env.local` with the backend API URL:

```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend:

```bash
npm run dev
```

Open the local URL printed by Vite in your browser. Make sure the backend's `CLIENT_URL` matches the actual frontend origin.

### 4. Test live transcription

1. Log in to IntellMeet.
2. Create or join a meeting.
3. Allow microphone access.
4. Speak into the microphone and check whether transcript text appears.

Live transcription is supported in browsers that provide the Speech Recognition API, such as Google Chrome and Microsoft Edge.

### Troubleshooting

- **Failed to fetch:** Check that the backend is running and the frontend API URL is correct.
- **CORS error:** Ensure `CLIENT_URL` matches the frontend URL, including its port.
- **Speech recognition unavailable:** Use a browser that supports the Speech Recognition API, such as Google Chrome or Microsoft Edge.
- **MongoDB error:** Verify your connection string and database access settings.
- **Port already in use:** Stop the other process or configure an available port consistently across the relevant services.

Keep `.env`, passwords, API keys, and other secrets out of GitHub.
