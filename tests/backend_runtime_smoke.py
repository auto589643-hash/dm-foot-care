"""Browser smoke for the configured HTTP runtime (local fake backend).

This intentionally exercises the same browser fetches used in production mode:
session restore, username login, patient history, per-user Doctor history, and
doctor admin mutations.
It does not replace a deployment test against Supabase/Drive/AI services.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / ".test-deps"))
from playwright.sync_api import sync_playwright  # noqa: E402

APP_URL = "http://127.0.0.1:4517"
BACKEND_URL = "http://127.0.0.1:4300"


def profile(username: str, role: str) -> dict[str, Any]:
    return {
        "id": "profile-doctor" if role == "doctor" else "profile-patient",
        "username": username,
        "displayName": "พญ. มาลี" if role == "doctor" else "สมใจ",
        "dateOfBirth": "1963-04-12" if role == "doctor" else "1961-03-18",
        "age": 63 if role == "doctor" else 65,
        "generation": "รุ่นก่อนวัยเกษียณ",
        "occupation": "แพทย์" if role == "doctor" else "ค้าขาย",
        "role": role,
    }


class FakeBackend(BaseHTTPRequestHandler):
    events: list[tuple[str, str]] = []
    users = [{
        "id": "USR-001", "username": "DM009", "name": "ผู้ใช้จาก backend",
        "dateOfBirth": "1960-01-01", "age": 66, "occupation": "ค้าขาย",
        "pinConfigured": True, "status": "active", "lastExam": "ยังไม่มีประวัติ",
    }]
    diseases = [{
        "id": "D777", "name": "Remote disease", "category": "ผิวหนัง",
        "description": "ผิวแห้ง", "criteria": "ผิวลอก", "severityCriteria": "ตามเกณฑ์แพทย์",
        "severity": "ปานกลาง", "severityLevels": [{"label": "เล็กน้อย", "rank": 1, "criteria": "mild"}, {"label": "ปานกลาง", "rank": 2, "criteria": "moderate"}], "care": "ทาครีม", "recommendation": "ติดตาม", "active": True,
    }]
    articles = [{
        "id": "K001", "title": "ดูแลเท้า", "diseaseId": "D001", "category": "พื้นฐาน",
        "severity": "ทุกระดับ", "summary": "คำแนะนำ", "care": ["ล้าง", "เช็ด", "ทาครีม"],
        "treatment": "", "recommendation": "", "readTime": "อ่าน 3 นาที", "tone": "blue", "status": "published",
    }]

    def log_message(self, *_args: Any) -> None:
        return

    def _headers(self, status: int = 200, content_type: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", APP_URL)
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-dmfc-drive-folder, x-dmfc-image-position, x-dmfc-drive-filename")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.end_headers()

    def _json(self, status: int, payload: Any) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._headers(status)
        self.wfile.write(raw)

    def _body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def _authorized(self) -> bool:
        return self.headers.get("Authorization", "").startswith("Bearer token-")

    def _is_doctor(self) -> bool:
        return self.headers.get("Authorization") == "Bearer token-doctor"

    def do_OPTIONS(self) -> None:
        self._headers(204)

    def do_GET(self) -> None:
        self.events.append(("GET", self.path))
        if self.path == "/v1/auth/session":
            if not self._authorized():
                self._json(401, {"message": "No session"})
            else:
                role = "doctor" if self._is_doctor() else "patient"
                self._json(200, {"accessToken": "token-doctor" if role == "doctor" else "token-patient", "profile": profile("DMDR01" if role == "doctor" else "DM001", role)})
            return
        if not self._authorized():
            self._json(401, {"message": "Unauthorized"})
            return
        if self.path == "/v1/examinations":
            self._json(200, {"examinations": [{
                "id": "EX-BACKEND-001", "date": "2026-08-08", "displayDate": "8 สิงหาคม 2569",
                "time": "09:42", "status": "complete", "findings": [{
                    "diseaseId": "D001", "name": "ผิวแห้ง", "detected": True,
                    "severity": "ปานกลาง", "confidence": 91, "comparison": "คงที่",
                }], "thumbnails": {"left-dorsal": "https://backend.test/thumb-left.jpg"},
            }]})
            return
        if self.path == "/v1/knowledge":
            self._json(200, {
                "articles": [{"id": "K-PATIENT", "title": "Backend patient article", "diseaseId": "D009", "category": "พื้นฐาน", "severity": "ทุกระดับ", "summary": "เนื้อหาจาก backend", "care": ["ล้าง", "เช็ด", "ทาครีม"], "readTime": "อ่าน 2 นาที", "tone": "teal", "status": "published"}],
                "diseases": [{"id": "D009", "name": "Backend disease", "category": "ผิวหนัง", "description": "desc", "criteria": "criteria", "severityCriteria": "severity", "severity": "ปานกลาง", "severityLevels": [{"label": "เล็กน้อย", "rank": 1, "criteria": "mild"}, {"label": "ปานกลาง", "rank": 2, "criteria": "moderate"}], "care": "ทาครีมจาก Disease Master backend", "recommendation": "ติดตามกับทีมแพทย์ backend", "active": True}],
            })
            return
        if self.path.startswith("/v1/examinations/") and self.path.endswith("/images"):
            self._json(200, {"driveFolderId": None, "driveFileIds": {}})
            return
        if self._is_doctor() and self.path == "/v1/admin/users":
            self._json(200, {"users": self.users})
            return
        if self._is_doctor() and self.path == "/v1/admin/users/USR-001/examinations":
            self._json(200, {"examinations": [{
                "id": "EX-STAFF-001", "date": "2026-08-07", "displayDate": "7 สิงหาคม 2569",
                "time": "10:15", "status": "complete", "findings": [{
                    "diseaseId": "D777", "name": "Remote disease", "detected": True,
                    "severity": "ปานกลาง", "confidence": 88, "comparison": "คงที่",
                }], "thumbnails": {},
            }]})
            return
        if self._is_doctor() and self.path == "/v1/admin/diseases":
            self._json(200, {"diseases": self.diseases})
            return
        if self._is_doctor() and self.path == "/v1/admin/knowledge":
            self._json(200, {"articles": self.articles})
            return
        self._json(404, {"message": "Not found"})

    def do_POST(self) -> None:
        self.events.append(("POST", self.path))
        if self.headers.get("Content-Type", "").startswith("application/json"):
            body = self._body()
        else:
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            body = {}
        if self.path == "/v1/auth/username/sign-in":
            username = str(body.get("username", "")).upper()
            if str(body.get("pin")) != "1234" or username not in {"DM001", "DMDR01"}:
                self._json(401, {"message": "Invalid credentials"})
                return
            role = "doctor" if username == "DMDR01" else "patient"
            self._json(200, {"accessToken": "token-doctor" if role == "doctor" else "token-patient", "profile": profile(username, role)})
            return
        if self.path == "/v1/auth/sign-out":
            self._json(200, {})
            return
        if not self._authorized():
            self._json(401, {"message": "Unauthorized"})
            return
        if self.path == "/v1/examinations/drafts":
            self._json(200, {"id": "EX-BROWSER-001", "userId": "profile-patient", "status": "draft"})
            return
        if self.path == "/v1/original-images/folders":
            self._json(200, {"folderId": "drive-folder-browser"})
            return
        if self.path == "/v1/original-images":
            position = self.headers.get("x-dmfc-image-position", "unknown")
            self._json(200, {"fileId": f"drive-file-{position}"})
            return
        if self.path == "/v1/analysis":
            self._json(200, {
                "runId": "run-browser-001",
                "rawResult": {"findings": [{"diseaseId": "D009", "detected": True, "suggestedSeverity": "ปานกลาง", "confidence": 0.91, "imagePosition": "left-dorsal"}]},
                "validation": {"status": "accepted", "rawResult": {}, "findings": [], "rejectedItems": []},
                "findings": [{"diseaseId": "D009", "name": "Backend disease", "detected": True, "severity": "ปานกลาง", "confidence": 91, "comparison": "คงที่"}],
            })
            return
        if self.path == "/v1/audit-events":
            self._json(200, {})
            return
        if self.path.startswith("/v1/examinations/"):
            if self.path.endswith("/thumbnails"):
                self._json(200, {"thumbnails": {position: f"https://backend.test/thumb-{position}.webp" for position in ("left-dorsal", "left-sole", "right-dorsal", "right-sole")}})
            elif self.path.endswith("/images"):
                self._json(200, {"driveFolderId": None, "driveFileIds": {}})
            else:
                self._json(200, {})
            return
        if not self._is_doctor():
            self._json(403, {"message": "Doctor role required"})
            return
        if self.path == "/v1/admin/users":
            saved = {**body, "id": "USR-BROWSER-001", "lastExam": "ยังไม่มีประวัติ", "pinConfigured": bool(body.get("pin")), "pin": None}
            self.users.append(saved)
            self._json(200, {"user": saved})
            return
        if self.path == "/v1/admin/diseases":
            saved = {**body, "id": "D-BROWSER-001"}
            self.diseases.append(saved)
            self._json(200, {"disease": saved})
            return
        if self.path == "/v1/admin/knowledge":
            saved = {**body, "id": "K-BROWSER-001"}
            self.articles.append(saved)
            self._json(200, {"article": saved})
            return
        if self.path.endswith("/reset-pin"):
            self._json(200, {})
            return
        self._json(404, {"message": "Not found"})

    def do_PATCH(self) -> None:
        self.events.append(("PATCH", self.path))
        if not self._authorized():
            self._json(401, {"message": "Unauthorized"})
            return
        body = self._body()
        if self.path.startswith("/v1/examinations/"):
            self._json(200, {})
            return
        if not self._is_doctor():
            self._json(403, {"message": "Doctor role required"})
            return
        if self.path.endswith("/status"):
            self._json(200, {})
            return
        if "/admin/users/" in self.path:
            self._json(200, {"user": {**body, "id": self.path.split("/")[-1], "lastExam": "ยังไม่มีประวัติ"}})
            return
        if "/admin/diseases/" in self.path:
            self._json(200, {"disease": {**body, "id": self.path.split("/")[-1]}})
            return
        if "/admin/knowledge/" in self.path:
            self._json(200, {"article": {**body, "id": self.path.split("/")[-1]}})
            return
        self._json(404, {"message": "Not found"})


def wait_for(url: str, timeout: float = 20) -> None:
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError(f"Timed out waiting for {url}")


server = ThreadingHTTPServer(("127.0.0.1", 4300), FakeBackend)
threading.Thread(target=server.serve_forever, daemon=True).start()
env = os.environ.copy()
env["VITE_DMFC_API_BASE_URL"] = BACKEND_URL
vite = subprocess.Popen(["npm.cmd", "run", "dev", "--", "--host", "127.0.0.1", "--port", "4517"], cwd=PROJECT_ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try:
    wait_for(APP_URL)
    preflight_env = env.copy()
    preflight_env["DMFC_API_BASE_URL"] = BACKEND_URL
    preflight_env["DMFC_PREFLIGHT_ORIGIN"] = APP_URL
    preflight_env["DMFC_PREFLIGHT_ACCESS_TOKEN"] = "token-patient"
    subprocess.run(["node", "scripts/backend_preflight.mjs"], cwd=PROJECT_ROOT, env=preflight_env, check=True, capture_output=True, text=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe", args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.set_default_timeout(10000)
        page.goto(APP_URL, wait_until="domcontentloaded")
        page.get_by_role("heading", name="เข้าสู่ระบบ").wait_for(timeout=15000)
        page.get_by_label("ชื่อผู้ใช้").fill("DM001")
        page.get_by_label("PIN 4 หลัก").fill("1234")
        login_button = page.locator("form").get_by_role("button", name="เข้าสู่ระบบ", exact=True)
        login_button.click()
        page.wait_for_timeout(400)
        page.get_by_role("heading", name="สวัสดี คุณสมใจ").wait_for()
        page.get_by_role("button", name="ประวัติ").last.click()
        page.get_by_role("heading", name="ประวัติการตรวจ").wait_for()
        page.get_by_text("ตรวจแล้ว 1 ครั้ง", exact=True).wait_for()
        assert page.get_by_text("ผิวแห้ง · ปานกลาง", exact=True).is_visible()
        page.get_by_role("button", name="คลังความรู้").last.click()
        page.get_by_role("heading", name="คลังความรู้ดูแลเท้า").wait_for()
        page.get_by_role("heading", name="Backend patient article").wait_for()
        page.get_by_role("button", name="หน้าหลัก").last.click()
        page.get_by_role("heading", name="สวัสดี คุณสมใจ").wait_for()
        page.get_by_role("button", name="เริ่มตรวจเท้า").click()
        page.get_by_role("heading", name="เตรียมถ่ายภาพเท้า 4 มุม").wait_for()
        page.get_by_role("button", name="เปิดกล้องและเริ่มถ่าย").click()
        page.get_by_role("button", name="ถ่ายภาพ").wait_for()
        for index in range(4):
            page.get_by_role("button", name="ใช้ภาพตัวอย่างสำหรับทดลอง").click()
            if index < 3:
                page.get_by_role("button", name="ใช้ภาพนี้และถ่ายภาพต่อไป").click()
            else:
                page.get_by_role("button", name="ตรวจดูภาพทั้งหมด").click()
        page.get_by_role("heading", name="ภาพเท้าครบทั้ง 4 มุม").wait_for()
        page.get_by_role("button", name="ประเมินผล").click()
        page.get_by_role("heading", name="AI แนะนำ 1 รายการ").wait_for(timeout=15000)
        assert page.locator(".severity-select select option").all_text_contents() == ["เล็กน้อย", "ปานกลาง"]
        page.get_by_role("button", name="ยืนยันและส่งผลตรวจ").click()
        page.get_by_role("heading", name="ผลการตรวจเท้า").wait_for(timeout=15000)
        assert page.locator(".summary-photo-grid .summary-photo").count() == 4
        page.get_by_text("ทาครีมจาก Disease Master backend", exact=True).wait_for()
        page.get_by_role("button", name="กลับหน้าหลัก").click()
        page.get_by_role("button", name="ประวัติ").last.click()
        page.get_by_text("ตรวจแล้ว 2 ครั้ง", exact=True).wait_for()
        expected_pipeline_paths = {
            "/v1/examinations/drafts", "/v1/original-images/folders", "/v1/original-images",
            "/v1/analysis", "/v1/audit-events",
        }
        observed_paths = {path for _, path in FakeBackend.events}
        assert expected_pipeline_paths.issubset(observed_paths)
        page.locator(".profile-button").click()
        page.get_by_role("menuitem", name="ออกจากระบบ").click()
        page.get_by_role("heading", name="เข้าสู่ระบบ").wait_for()

        page.get_by_label("ชื่อผู้ใช้").fill("DMDR01")
        page.get_by_label("PIN 4 หลัก").fill("1234")
        page.get_by_role("button", name="เข้าสู่ระบบ").click()
        page.get_by_role("heading", name="สวัสดี พญ. มาลี").wait_for()
        page.get_by_role("button", name="ผู้ใช้งาน").last.click()
        page.wait_for_timeout(500)
        page.get_by_text("DM009", exact=False).wait_for()
        backend_user_row = page.locator("article").filter(has_text="DM009").first
        backend_user_row.get_by_role("button", name="ดูประวัติ").click()
        page.get_by_role("heading", name="ผู้ใช้จาก backend").wait_for()
        history_card = page.locator(".user-history-card").first
        history_card.wait_for()
        assert "Remote disease" in history_card.inner_text()
        assert "/v1/admin/users/USR-001/examinations" in {path for _, path in FakeBackend.events}
        page.get_by_role("button", name="ปิดประวัติ").click()
        page.get_by_role("button", name="เพิ่มผู้ใช้งาน").click()
        page.get_by_label("Username").fill("DM010")
        page.get_by_label("ชื่อ-นามสกุล").fill("Browser User")
        page.get_by_label("อาชีพ").fill("เกษตรกร")
        page.get_by_label("PIN เริ่มต้น (4 หลัก)").fill("1234")
        page.get_by_role("button", name="บันทึกข้อมูล").click()
        page.get_by_text("เพิ่มผู้ใช้ DM010 แล้ว", exact=True).wait_for()

        page.get_by_role("button", name="รายการภาวะ").last.click()
        page.get_by_role("button", name="เพิ่มรายการ").click()
        page.get_by_label("ชื่อภาวะ").fill("ตาปลา browser")
        page.get_by_label("คำอธิบาย").fill("คำอธิบาย")
        page.get_by_label("เกณฑ์ตรวจจับ").fill("เกณฑ์")
        page.locator("#disease-severity-1").fill("ระดับเล็กน้อย")
        page.locator("#disease-severity-2").fill("ระดับปานกลาง")
        page.locator("#disease-severity-3").fill("ระดับรุนแรง")
        page.get_by_label("คำแนะนำการดูแล").fill("ดูแล")
        page.get_by_label("การรักษา / คำแนะนำเพิ่มเติม").fill("ส่งต่อ")
        page.get_by_role("button", name="บันทึกเกณฑ์").click()
        page.get_by_text("เพิ่ม ตาปลา browser แล้ว", exact=True).wait_for()

        page.get_by_role("button", name="คลังความรู้").last.click()
        page.get_by_role("button", name="สร้างบทความ").click()
        assert page.locator("#knowledge-disease option[value='D777']").count() == 1
        page.get_by_label("ชื่อบทความ").fill("บทความ browser")
        page.get_by_label("สรุปสั้น").fill("สรุป")
        for index in range(1, 4):
            page.locator(f"#knowledge-care-{index}").fill(f"ขั้นตอน {index}")
        page.get_by_role("button", name="บันทึกบทความ").click()
        page.get_by_text("สร้างบทความ “บทความ browser” แล้ว", exact=True).wait_for()
        browser.close()
    print("Configured backend browser smoke test passed", flush=True)
finally:
    server.shutdown()
    vite.terminate()
    try:
        vite.wait(timeout=5)
    except subprocess.TimeoutExpired:
        vite.kill()
