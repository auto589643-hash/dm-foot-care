-- Development seed only. Replace with doctor-approved master data before pilot.

insert into public.diseases (code, name, category, description, detection_criteria, care_instruction, recommendation, active, revision)
values
  ('D001', 'ผิวแห้ง', 'ผิวหนัง', 'ผิวบริเวณเท้าแห้ง ลอก หรือมีรอยแตกตื้น', '{"signals":["ผิวลอก","ความหยาบ","รอยแตก"]}', 'ทาครีมบำรุงหลังล้างเท้า หลีกเลี่ยงการทาระหว่างซอกนิ้ว', 'ติดตามอาการและตรวจเท้าทุกวัน', true, 1),
  ('D002', 'หนังด้าน', 'แรงกดทับ', 'ผิวหนังหนาตัวจากแรงกดหรือการเสียดสีซ้ำ', '{"signals":["ผิวหนา","สีเหลือง","ผิวแข็งเฉพาะจุด"]}', 'เลือกรองเท้าพอดีเท้า และไม่ตัดหนังด้านด้วยตนเอง', 'ตรวจรองเท้าและลดจุดกดทับ', true, 1),
  ('D003', 'แผลที่เท้า', 'บาดแผล', 'ผิวหนังเปิด มีน้ำเหลือง เลือด หรือสะเก็ดผิดปกติ', '{"signals":["ผิวหนังเปิด","น้ำเหลือง","เลือด","สะเก็ด"]}', 'ปิดแผลด้วยวัสดุสะอาด งดลงน้ำหนัก และติดต่อแพทย์', 'ควรได้รับการประเมินโดยแพทย์', true, 1),
  ('D004', 'เล็บขบ', 'เล็บ', 'ขอบเล็บกดเข้าเนื้อ อาจมีอาการแดง บวม หรือเจ็บ', '{"signals":["ขอบเล็บชิดร่องเล็บ","รอยแดง","บวม"]}', 'ไม่แคะมุมเล็บและตัดเล็บเป็นแนวตรง', 'ติดตามความเจ็บ บวม และรอยแดง', true, 1),
  ('D005', 'เชื้อราที่เล็บ', 'เล็บ', 'เล็บหนา เปลี่ยนสี หรือเปราะผิดปกติ', '{"signals":["เล็บสีเหลือง","เล็บหนา","เศษใต้เล็บ"]}', 'รักษาเท้าให้แห้งและรับการประเมินเพื่อเลือกยา', 'พบแพทย์เพื่อยืนยันก่อนเริ่มยา', false, 1)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  detection_criteria = excluded.detection_criteria,
  care_instruction = excluded.care_instruction,
  recommendation = excluded.recommendation,
  active = excluded.active,
  revision = excluded.revision,
  updated_at = now();

insert into public.disease_severity_levels (disease_id, label, rank, criteria)
select d.id, severity.label, severity.rank, severity.criteria
from public.diseases d
join (values
  ('D001','เล็กน้อย',1,'{"description":"ผิวแห้งเล็กน้อย ไม่มีรอยแตก"}'::jsonb),
  ('D001','ปานกลาง',2,'{"description":"ผิวลอกหรือมีรอยแตกตื้นหลายจุด"}'::jsonb),
  ('D001','รุนแรง',3,'{"description":"มีรอยแตกชัด เจ็บ หรือมีเลือดซึม"}'::jsonb),
  ('D002','เล็กน้อย',1,'{"description":"ผิวหนาเฉพาะจุด ไม่มีแผล"}'::jsonb),
  ('D002','ปานกลาง',2,'{"description":"หนังด้านกว้างหรือกดเจ็บ"}'::jsonb),
  ('D002','รุนแรง',3,'{"description":"มีรอยแตกหรือสงสัยแผลใต้หนังด้าน"}'::jsonb),
  ('D003','เล็กน้อย',1,'{"description":"รอยถลอกตื้น ไม่มีการติดเชื้อชัดเจน"}'::jsonb),
  ('D003','ปานกลาง',2,'{"description":"แผลเปิด มีน้ำเหลือง หรือแดงรอบแผล"}'::jsonb),
  ('D003','รุนแรง',3,'{"description":"แดงลาม บวม ร้อน มีหนอง หรือมีไข้"}'::jsonb),
  ('D004','เล็กน้อย',1,'{"description":"ขอบเล็บกดเล็กน้อย ไม่มีหนอง"}'::jsonb),
  ('D004','ปานกลาง',2,'{"description":"แดง บวม หรือเจ็บชัดเจน"}'::jsonb),
  ('D004','รุนแรง',3,'{"description":"มีหนอง แผล หรือการอักเสบลุกลาม"}'::jsonb),
  ('D005','เล็กน้อย',1,'{"description":"เล็บเปลี่ยนสีเล็กน้อย"}'::jsonb),
  ('D005','ปานกลาง',2,'{"description":"เล็บหนา เปราะ หรือมีเศษใต้เล็บ"}'::jsonb),
  ('D005','รุนแรง',3,'{"description":"มีการอักเสบหรือปวดร่วมด้วย"}'::jsonb)
) as severity(code, label, rank, criteria) on severity.code = d.code
on conflict (disease_id, label) do update set rank = excluded.rank, criteria = excluded.criteria;
