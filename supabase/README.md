# Supabase foundation

ไฟล์ในโฟลเดอร์นี้เป็น production foundation ที่เตรียมจาก PRD แต่ยังไม่ได้ apply กับ Supabase project ใด เพราะ repository นี้ยังไม่มี project ref/credentials และเครื่องพัฒนาไม่มี Supabase CLI

ลำดับการใช้งานเมื่อมี project แล้ว:

1. ตรวจ migration และ seed กับแพทย์/ผู้ดูแลระบบ
2. ใช้ Supabase CLI สร้าง migration ตาม workflow ของทีม แล้วนำ SQL นี้เข้า migration ที่สร้าง
3. Apply migration ใน environment development ก่อน
4. รัน `verification/rls_invariants.sql` ด้วย privileged connection
5. รัน API integration tests ด้วยผู้ใช้ patient สองบัญชีและ doctor หนึ่งบัญชีตาม matrix ในไฟล์ verification
6. ตั้งค่า `dm-foot-thumbnails` เป็น private bucket และตรวจ policy ใน `storage.objects`
7. รัน `npm run preflight:supabase` เพื่อเก็บหลักฐาน Data API/RLS isolation แบบ repeatable โดยใช้ short-lived tokens เท่านั้น

จุดสำคัญของ schema:

- original foot images เก็บ Google Drive private เท่านั้น
- Supabase Storage เก็บ thumbnail ใน private bucket `dm-foot-thumbnails`; Disease reference และ Knowledge media อยู่ใน private buckets `dmfc-disease-reference`/`dmfc-knowledge-media` และให้ backend ออก signed URL ตามสิทธิ์
- `supabase/verification/rls_invariants.sql` ตรวจว่าทั้งสาม bucket มีอยู่และเป็น private พร้อม policy สำหรับ thumbnail, Disease reference และ Knowledge media ครบ
- `ai_analysis_runs`/`ai_findings` แยกจาก `confirmed_findings` และเก็บ raw result พร้อม validation errors
- `private.ai_accuracy_pairs` จับคู่ AI กับ human-confirmed result สำหรับ agreement/false-positive/false-negative/severity disagreement โดย revoke สิทธิ์ client roles อย่างชัดเจนและให้ backend/service role ใช้เท่านั้น
- `private.ai_accuracy_summary` สรุป agreement/false-positive/false-negative/severity disagreement แยกตาม Disease และ severity สำหรับ backend analytics โดย revoke สิทธิ์ client roles อย่างชัดเจนและให้ backend/service role ใช้เท่านั้น
- ทุก table ใน exposed `public` schema เปิด RLS
- สิทธิ์ staff ใช้ `private.is_staff()` และไม่อิง `user_metadata`
- `private.is_staff()` บังคับให้ UUID ที่ตรวจตรงกับ `auth.uid()` ปัจจุบัน ป้องกันการใช้ฟังก์ชันเป็น role oracle
- patient policies ตรวจ ownership ด้วย `auth.uid()`
- audit logs ไม่มี INSERT ให้ `authenticated`; ให้ backend/service role เป็นผู้เขียนเพื่อป้องกัน client ปลอมเหตุการณ์
- profile creation/edit, examination status/refs, confirmed findings และ thumbnail writes เป็น backend/service-only; `authenticated` ได้สิทธิ์อ่านตาม RLS ส่วน Doctor/Admin CRUD ของ Disease/Severity/Knowledge ใช้ staff RLS policies
- examination status มี trigger ตรวจ transition ที่อนุญาต และ Date of Birth ใช้ trigger ตรวจวันอนาคตแทน dynamic `CHECK` constraint เพื่อให้ dump/restore ปลอดภัย
- migration มี explicit schema/table GRANT สำหรับ `authenticated` ด้วย เพราะ Supabase รุ่นใหม่ไม่ expose ตารางใน `public` ผ่าน Data API โดยอัตโนมัติ; GRANT ไม่ได้แทน RLS และต้องใช้คู่กัน
- `verification/rls_invariants.sql` ตรวจทั้ง RLS shape และ explicit authenticated schema/table grants เพื่อจับกรณี Data API ไม่ expose ตารางที่ contract ต้องใช้

การ apply จริงต้องทำผ่าน backend/CI ที่ถือ secret เท่านั้น ห้ามนำ service-role key หรือ Google Drive credential ไปไว้ใน frontend
