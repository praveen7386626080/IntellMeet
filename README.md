## Day 15 – Live Audio Transcription Setup

This feature converts meeting audio into text using the Whisper transcription service.

### Prerequisites

Install the following:
- Node.js and npm
- Python 3.10 or a compatible version supported by the project's dependencies
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

### 3. Start the Whisper transcription service

Open a separate terminal from the project root:

```bash
cd backend/whisper-service
python -m venv whisper-env
```

Activate the virtual environment.

**Windows PowerShell:**

```powershell
.\whisper-env\Scripts\Activate.ps1
```

Install the dependencies:

```bash
pip install -r requirements.txt
```

Start the service using the command supported by the Python file:

```bash
python app.py
```

The service should run on `http://localhost:5001`. On first startup, the Whisper model may take time to download and load.

### 4. Configure and start the frontend

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

### 5. Test live transcription

1. Log in to IntellMeet.
2. Create or join a meeting.
3. Allow microphone access.
4. Speak into the microphone and check whether transcript text appears.

### Troubleshooting

- **Failed to fetch:** Check that the backend is running and the frontend API URL is correct.
- **CORS error:** Ensure `CLIENT_URL` matches the frontend URL, including its port.
- **Transcription unavailable:** Check that the Whisper service is running on port 5001.
- **MongoDB error:** Verify your connection string and database access settings.
- **Port already in use:** Stop the other process or configure an available port consistently across the relevant services.

Keep `.env`, passwords, API keys, and other secrets out of GitHub.
