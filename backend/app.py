import os
import uuid
import time
import json
import logging
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
import pandas as pd
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "app.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="CP Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Constants ─────────────────────────────────────────────────────────────────
LEETCODE_API_BASE = "https://alfa-leetcode-api.onrender.com"
CODECHEF_API_BASE = "https://codechef-api.vercel.app/handle"
REQUEST_TIMEOUT = 15  # seconds
MAX_RETRIES = 2
DELAY_BETWEEN_REQUESTS = 0.5  # rate-limit protection

# ── In-memory job store ───────────────────────────────────────────────────────
jobs: dict = {}


# ── Models ────────────────────────────────────────────────────────────────────
class StudentInput(BaseModel):
    student_name: str
    leetcode_username: Optional[str] = None
    codechef_username: Optional[str] = None


class ProcessRequest(BaseModel):
    students: list[StudentInput]


# ── Fetchers ──────────────────────────────────────────────────────────────────

async def fetch_leetcode(client: httpx.AsyncClient, username: str) -> dict:
    """Fetch LeetCode stats using the alfa-leetcode-api."""
    if not username or username.strip() == "":
        return {"error": "No username provided"}

    result: dict = {}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            # ── /solved endpoint ──
            solved_resp = await client.get(
                f"{LEETCODE_API_BASE}/{username}/solved",
                timeout=REQUEST_TIMEOUT,
            )
            if solved_resp.status_code != 200:
                raise Exception(f"solved endpoint returned {solved_resp.status_code}")

            solved = solved_resp.json()
            result["lc_total_solved"] = solved.get("solvedProblem", 0)
            result["lc_easy"] = solved.get("easySolved", 0)
            result["lc_medium"] = solved.get("mediumSolved", 0)
            result["lc_hard"] = solved.get("hardSolved", 0)

            # Acceptance rate from acSubmissionNum / totalSubmissionNum
            total_sub = solved.get("totalSubmissionNum", [])
            ac_sub = solved.get("acSubmissionNum", [])
            all_total = next((s["submissions"] for s in total_sub if s["difficulty"] == "All"), 0)
            all_ac = next((s["submissions"] for s in ac_sub if s["difficulty"] == "All"), 0)
            if all_total > 0:
                result["lc_acceptance_rate"] = round((all_ac / all_total) * 100, 2)
            else:
                result["lc_acceptance_rate"] = 0

            await asyncio.sleep(DELAY_BETWEEN_REQUESTS)

            # ── /{username} endpoint for ranking ──
            profile_resp = await client.get(
                f"{LEETCODE_API_BASE}/{username}",
                timeout=REQUEST_TIMEOUT,
            )
            if profile_resp.status_code == 200:
                profile = profile_resp.json()
                result["lc_ranking"] = profile.get("ranking", "-")

            await asyncio.sleep(DELAY_BETWEEN_REQUESTS)

            # ── /contest endpoint ──
            contest_resp = await client.get(
                f"{LEETCODE_API_BASE}/{username}/contest",
                timeout=REQUEST_TIMEOUT,
            )
            if contest_resp.status_code == 200:
                contest = contest_resp.json()
                result["lc_contest_rating"] = round(contest.get("contestRating", 0), 1)
                result["lc_contest_ranking"] = contest.get("contestGlobalRanking", "-")

            return result

        except Exception as e:
            logger.warning(f"LeetCode fetch attempt {attempt} failed for '{username}': {e}")
            if attempt < MAX_RETRIES:
                await asyncio.sleep(1)
            else:
                return {"error": str(e)}

    return {"error": "Max retries exceeded"}


async def fetch_codechef(client: httpx.AsyncClient, username: str) -> dict:
    """Fetch CodeChef stats by scraping the user profile."""
    if not username or username.strip() == "":
        return {"error": "No username provided"}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            # We scrape directly from CodeChef profile instead of using the broken vercel API
            url = f"https://www.codechef.com/users/{username}"
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            resp = await client.get(url, headers=headers, timeout=REQUEST_TIMEOUT, follow_redirects=True)
            
            if resp.status_code == 404:
                return {"error": "User not found"}
            elif resp.status_code != 200:
                raise Exception(f"CodeChef profile returned {resp.status_code}")

            soup = BeautifulSoup(resp.text, 'lxml')
            
            # Rating
            rating_div = soup.find('div', class_='rating-number')
            rating = rating_div.text.strip() if rating_div else "-"

            # Stars
            stars_span = soup.find('span', class_='rating')
            stars = stars_span.text.strip() if stars_span else "-"

            # Ranks
            ranks_div = soup.find('div', class_='rating-ranks')
            global_rank = "-"
            country_rank = "-"
            if ranks_div:
                items = ranks_div.find_all('strong')
                if len(items) > 0:
                    global_rank = items[0].text.strip()
                if len(items) > 1:
                    country_rank = items[1].text.strip()

            return {
                "cc_rating": rating,
                "cc_stars": stars,
                "cc_global_rank": global_rank,
                "cc_country_rank": country_rank,
            }

        except Exception as e:
            logger.warning(f"CodeChef fetch attempt {attempt} failed for '{username}': {e}")
            if attempt < MAX_RETRIES:
                await asyncio.sleep(1)
            else:
                return {"error": str(e)}

    return {"error": "Max retries exceeded"}


# ── Background processor ─────────────────────────────────────────────────────

async def process_students(job_id: str, students: list[StudentInput]):
    job = jobs[job_id]
    job["status"] = "processing"

    async with httpx.AsyncClient() as client:
        for i, student in enumerate(students):
            row: dict = {
                "Student Name": student.student_name,
                "LeetCode Username": student.leetcode_username or "",
                "CodeChef Username": student.codechef_username or "",
            }

            lc_ok = True
            cc_ok = True

            # Fetch LeetCode
            if student.leetcode_username:
                lc = await fetch_leetcode(client, student.leetcode_username.strip())
                if "error" in lc:
                    lc_ok = False
                    job["errors"].append({
                        "student": student.student_name,
                        "platform": "LeetCode",
                        "username": student.leetcode_username,
                        "error": lc["error"],
                    })
                else:
                    row.update(lc)

            await asyncio.sleep(DELAY_BETWEEN_REQUESTS)

            # Fetch CodeChef
            if student.codechef_username:
                cc = await fetch_codechef(client, student.codechef_username.strip())
                if "error" in cc:
                    cc_ok = False
                    job["errors"].append({
                        "student": student.student_name,
                        "platform": "CodeChef",
                        "username": student.codechef_username,
                        "error": cc["error"],
                    })
                else:
                    row.update(cc)

            row["_status"] = "success" if (lc_ok and cc_ok) else "partial" if (lc_ok or cc_ok) else "failed"

            job["results"].append(row)
            job["processed"] += 1
            if lc_ok and cc_ok:
                job["successful"] += 1
            else:
                job["failed"] += 1

            logger.info(f"[{job_id}] {i+1}/{len(students)} - {student.student_name} -> {row['_status']}")

    job["status"] = "completed"
    job["completed_at"] = datetime.utcnow().isoformat()

    # Generate Excel output
    try:
        df = pd.DataFrame(job["results"])
        col_order = [
            "Student Name",
            "LeetCode Username", "lc_total_solved", "lc_easy", "lc_medium", "lc_hard",
            "lc_acceptance_rate", "lc_ranking", "lc_contest_rating", "lc_contest_ranking",
            "CodeChef Username", "cc_rating", "cc_stars", "cc_global_rank", "cc_country_rank",
            "_status",
        ]
        existing = [c for c in col_order if c in df.columns]
        df = df[existing]

        rename_map = {
            "lc_total_solved": "LC Total Solved",
            "lc_easy": "LC Easy",
            "lc_medium": "LC Medium",
            "lc_hard": "LC Hard",
            "lc_acceptance_rate": "LC Acceptance %",
            "lc_ranking": "LC Ranking",
            "lc_contest_rating": "LC Contest Rating",
            "lc_contest_ranking": "LC Contest Ranking",
            "cc_rating": "CC Rating",
            "cc_stars": "CC Stars",
            "cc_global_rank": "CC Global Rank",
            "cc_country_rank": "CC Country Rank",
            "_status": "Status",
        }
        df.rename(columns=rename_map, inplace=True)
        df["Last Updated"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

        filepath = OUTPUT_DIR / f"report_{job_id}.xlsx"
        df.to_excel(filepath, index=False, engine="openpyxl")
        job["report_path"] = str(filepath)
        logger.info(f"[{job_id}] Report saved to {filepath}")
    except Exception as e:
        logger.error(f"[{job_id}] Failed to generate report: {e}")


# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.post("/api/process")
async def start_processing(req: ProcessRequest):
    """Accept parsed student data and kick off background fetching."""
    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {
        "status": "queued",
        "total": len(req.students),
        "processed": 0,
        "successful": 0,
        "failed": 0,
        "results": [],
        "errors": [],
        "report_path": None,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
    }

    asyncio.create_task(process_students(job_id, req.students))
    return {"job_id": job_id}


@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    """Poll for job progress."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    return {
        "status": job["status"],
        "total": job["total"],
        "processed": job["processed"],
        "successful": job["successful"],
        "failed": job["failed"],
        "results": job["results"],
        "errors": job["errors"],
    }


@app.get("/api/download/{job_id}")
async def download_report(job_id: str):
    """Download the generated Excel report."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if not job.get("report_path"):
        raise HTTPException(status_code=400, detail="Report not ready yet")

    filepath = Path(job["report_path"])
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Report file not found")

    return FileResponse(
        path=str(filepath),
        filename=f"cp_dashboard_report_{job_id}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}
