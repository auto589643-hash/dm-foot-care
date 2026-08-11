# DM Foot Care

DM Foot Care ระบบติดตามสุขภาพเท้าแบบ mobile-first ที่เชื่อม Supabase, Google Drive, Gemini และ Vercel API สำหรับการใช้งานจริงในโครงการนำร่อง

## เริ่มใช้งาน

```bash
npm install
npm run dev
```

เปิด URL ที่ Vite แสดงใน Terminal

เอกสารหลัก: [แผนพัฒนา](IMPLEMENTATION_PLAN.md), [Requirement audit](REQUIREMENT_AUDIT.md), [Backend integration contract](BACKEND_INTEGRATION_CONTRACT.md), [Pilot QA checklist](PILOT_QA_CHECKLIST.md) และ [Supabase foundation](supabase/README.md)

## ความสามารถหลัก

- Patient: login, home, capture flow 4 มุมด้วยภาพตัวอย่าง/ไฟล์จากกล้อง, photo review, processing pipeline (mock private archive + mock AI), offline/online recovery, human review, post-confirmation thumbnail finalization, history, calendar, insight และ knowledge library
- Doctor: overview, user management (สร้างบัญชีพร้อม PIN เริ่มต้นแบบไม่เก็บค่า PIN ดิบ, แก้ไข/ปิดใช้งาน/reset PIN/ดูประวัติ), Disease Master ที่กำหนดเกณฑ์ Severity แยกต่อภาวะ และ knowledge management
- Production boundary: private Drive folder path is deterministic (`DM Foot Care/รูปเท้า/YYYY/Month/DD/Username_ExaminationID`) and is derived server-side/covered by contract tests; setting `VITE_DMFC_API_BASE_URL` switches auth, current-user history, published patient Knowledge/Disease labels (including Supabase-shaped Disease normalization), staff read data and typed admin mutation boundaries to the browser-safe HTTP adapters
- `npm run test:ai` ตรวจ AI output validator, mock provider, resumable/idempotent analysis workflow, thumbnail finalization/browser thumbnail service, draft storage, audit log, schema invariants, HTTP adapter contract, runtime adapter selection, HTTP pipeline end-to-end contract และ image-quality heuristics
- `npm run test:security` ตรวจไม่ให้ backend secret/private key/raw PIN หรือ sensitive client log หลุดเข้า source และ production bundle
- `npm run test:preflight` ตรวจ deployment preflight contract ด้วย fake backend (HTTPS-local exception, CORS และ response shape) โดยไม่ต้องใช้ credentials จริง
- `npm run verify` รัน lint, production build และ test suites ที่ตรวจได้ใน repository ต่อเนื่องกัน

## ขอบเขตสำคัญ

Browser runtime ไม่มี silent mock/demo fallback หาก Backend มีปัญหา ระบบจะแสดงสถานะว่างหรือข้อผิดพลาดแทนการใส่ข้อมูลตัวอย่าง ผู้ใช้งาน Production ต้องผ่าน Backend API และข้อมูลจริงเท่านั้น

## ตรวจสอบคุณภาพ

```bash
npm run lint
npm run build
npm run test:ai
npm run test:security
npm run verify
```

Smoke test อยู่ที่ `tests/e2e_smoke.py` และครอบคลุม patient golden path, Doctor Overview result drill-down, doctor workspace และการบันทึกเกณฑ์ Severity แยกต่อ Disease

เมื่อไม่มี Vite server เปิดอยู่ ให้ใช้ bundled helper จัดการ lifecycle ให้เอง:

```bash
<bundled-python> D:/Project/.agents/skills/webapp-testing/scripts/with_server.py --server "npm.cmd run dev -- --host 127.0.0.1 --port 4173" --port 4173 -- <bundled-python> tests/e2e_smoke.py
```

Accessibility smoke test อยู่ที่ `tests/accessibility_smoke.py` และตรวจ keyboard focus, profile-menu Escape และ reflow ที่เทียบเท่า 200% zoom

Configured-runtime smoke test อยู่ที่ `tests/backend_runtime_smoke.py` โดยเปิด Vite ด้วย `VITE_DMFC_API_BASE_URL` และ backend จำลอง เพื่อทดสอบ browser fetch จริงสำหรับ login, patient history, examination pipeline (draft/upload/AI/confirm/thumbnail/audit) และ Doctor admin read/mutation paths:

```bash
<bundled-python> tests/backend_runtime_smoke.py
```

ก่อนชี้ frontend ไปยัง staging จริง ใช้ `npm run preflight:backend` พร้อม `DMFC_API_BASE_URL`, `DMFC_PREFLIGHT_ORIGIN` และ (ถ้าต้องการตรวจ authenticated responses) `DMFC_PREFLIGHT_ACCESS_TOKEN`; script ตรวจ HTTPS, reachability และ CORS โดยไม่พิมพ์ token

ตัวอย่าง PowerShell:

```powershell
$env:DMFC_API_BASE_URL = 'https://api.example.test'
$env:DMFC_PREFLIGHT_ORIGIN = 'https://app.example.test'
$env:DMFC_PREFLIGHT_ACCESS_TOKEN = 'short-lived-token'
npm run preflight:backend
```

เมื่อมี Supabase staging แล้ว ใช้ `npm run preflight:supabase` พร้อม `SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, token ของ Patient A/B และ Doctor เพื่อตรวจ RLS isolation และยืนยันว่า patient เขียน `examinations` ตรงผ่าน Data API ไม่ได้; token จะไม่ถูกพิมพ์หรือเก็บไว้
