# CP Dashboard

A full-stack web application for tracking student competitive programming profiles from **LeetCode** and **CodeChef**.  
Built for placement coordinators and faculty members who need a simple way to collect and compare student coding statistics.

---

## Features

- **Excel Upload** — Upload a `.xlsx` file with student names and usernames
- **Automated Data Fetching** — Pulls stats from LeetCode (via [alfa-leetcode-api](https://github.com/alfaarghya/alfa-leetcode-api)) and CodeChef
- **Live Progress** — Real-time progress bar with success/failure counts
- **Sortable Table** — Click any column header to sort ascending/descending
- **Search** — Filter students by name or username instantly
- **Error Logs** — Collapsible panel showing failed fetches with details
- **Excel Export** — Download a comprehensive report with all statistics

## Data Collected

| Platform | Fields |
|----------|--------|
| LeetCode | Total Solved, Easy, Medium, Hard, Acceptance Rate, Ranking, Contest Rating, Contest Ranking |
| CodeChef | Rating, Stars, Global Rank, Country Rank |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript, Vite, Tailwind CSS v3, shadcn/ui |
| Backend | Python, FastAPI, httpx (async HTTP), pandas, openpyxl |
| APIs | [alfa-leetcode-api](https://alfa-leetcode-api.onrender.com), CodeChef API |

---

## Project Structure

```
project/
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Main dashboard component
│   │   ├── components/ui/       # shadcn/ui components
│   │   └── lib/utils.ts         # Utility functions
│   ├── index.html
│   ├── tailwind.config.js
│   └── package.json
├── backend/
│   ├── app.py                   # FastAPI server
│   ├── requirements.txt
│   ├── input/
│   ├── output/                  # Generated reports saved here
│   └── logs/                    # Application logs
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`

### 2. Backend

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

API runs at `http://localhost:8000`

### 3. Usage

1. Prepare an Excel file (`.xlsx`) with columns: **Student Name**, **LeetCode Username**, **CodeChef Username**
2. Open the dashboard at `http://localhost:5173`
3. Click **Upload Excel** and select your file
4. Click **Fetch Data** — watch the progress bar
5. Once complete, click **Export** to download the report

---

## Excel Template

| Student Name | LeetCode Username | CodeChef Username |
|--------------|-------------------|-------------------|
| Alice        | alice_lc          | alice_cc          |
| Bob          | bob123            | bob_coder         |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/process` | Submit student data to start fetching |
| `GET` | `/api/status/{job_id}` | Poll for job progress |
| `GET` | `/api/download/{job_id}` | Download the generated Excel report |
| `GET` | `/api/health` | Health check |

---

## Reliability

- **Retry logic** — Failed API requests are retried up to 2 times
- **Timeout handling** — 15-second timeout per request
- **Rate limiting** — 0.5s delay between requests to avoid being blocked
- **Error isolation** — One student's failure doesn't block others
- **Detailed logging** — All errors logged to `backend/logs/app.log`

---

## Future Roadmap

- [ ] Codeforces support
- [ ] Weekly automated fetching (cron/scheduler)
- [ ] Student ranking analytics & charts
- [ ] Department-wise filtering
- [ ] Contest tracking
- [ ] Database persistence (SQLite/PostgreSQL)
