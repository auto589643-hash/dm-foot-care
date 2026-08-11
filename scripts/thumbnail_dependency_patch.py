from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise RuntimeError(f'{label}: expected block not found')
    p.write_text(s.replace(old, new, 1))


# The analysis workflow owns creation of examination_images references through
# the original Drive upload. Do not start thumbnail persistence before that
# dependency has completed.
app = Path('src/App.tsx')
s = app.read_text()
early = """      if (!thumbnailJobRef.current) {
        const thumbnailJob = thumbnailServiceRef.current.generateAndStore(examinationIdRef.current, images)
        thumbnailJobRef.current = thumbnailJob
        void thumbnailJob.then((prepared) => setThumbnails(prepared)).catch((error) => {
          thumbnailJobRef.current = null
          console.warn('Thumbnail preparation will be retried after review', error)
        })
      }

"""
if early not in s:
    raise RuntimeError('early thumbnail job block not found')
s = s.replace(early, '', 1)
old_tail = """        auditLogger: integrations.audit,
        actorId: profile.id,
      })
    }).then((analysis) => {
      if (cancelled) return
      setAiFindings(analysis.findings)
"""
new_tail = """        auditLogger: integrations.audit,
        actorId: profile.id,
      }).then((analysis) => ({ analysis, images }))
    }).then(({ analysis, images }) => {
      if (cancelled) return
      if (!thumbnailJobRef.current) {
        // runAnalysisWorkflow has completed the original Drive uploads and the
        // examination_images references before thumbnail persistence starts.
        const thumbnailJob = thumbnailServiceRef.current.generateAndStore(examinationIdRef.current, images)
        thumbnailJobRef.current = thumbnailJob
        void thumbnailJob.then((prepared) => setThumbnails(prepared)).catch((error) => {
          thumbnailJobRef.current = null
          console.warn('Thumbnail preparation will be retried after review', error)
        })
      }
      setAiFindings(analysis.findings)
"""
if old_tail not in s:
    raise RuntimeError('analysis workflow tail not found')
app.write_text(s.replace(old_tail, new_tail, 1))

# Defensive post-condition: a storage upload is not considered a successful
# thumbnail operation until the corresponding examination_images row is linked.
replace_once(
    'backend/api/v1/examinations/[id]/thumbnails.mjs',
    """      await supabaseRest(`/rest/v1/examination_images?examination_id=eq.${encodeURIComponent(examinationId)}&position=eq.${encodeURIComponent(position.replace('-', '_'))}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ thumbnail_path: path, thumbnail_metadata: { mimeType, generatedAt: new Date().toISOString() } }),
      })
      const signedUrl = await createStorageSignedUrl('dm-foot-thumbnails', path)
""",
    """      const linkedRows = await supabaseRest(`/rest/v1/examination_images?examination_id=eq.${encodeURIComponent(examinationId)}&position=eq.${encodeURIComponent(position.replace('-', '_'))}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ thumbnail_path: path, thumbnail_metadata: { mimeType, generatedAt: new Date().toISOString() } }),
      })
      if (!Array.isArray(linkedRows) || linkedRows.length !== 1) {
        throw new Error(`Thumbnail uploaded but image reference is missing for ${position}`)
      }
      const signedUrl = await createStorageSignedUrl('dm-foot-thumbnails', path)
""",
    'thumbnail post-condition',
)

# Source-control parity for the live production safety net. It links an already
# uploaded private thumbnail when the original image row arrives later.
Path('supabase/migrations/20260811102500_attach_precreated_thumbnail_on_image_insert.sql').write_text("""create or replace function private.attach_precreated_thumbnail_reference()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_user_id uuid;
  v_path text;
begin
  if new.thumbnail_path is not null then
    return new;
  end if;

  select e.user_id into v_user_id
  from public.examinations e
  where e.id = new.examination_id;

  if v_user_id is null then
    return new;
  end if;

  v_path := v_user_id::text || '/' || new.examination_id::text || '/' || replace(new.position::text, '_', '-') || '.webp';

  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'dm-foot-thumbnails' and o.name = v_path
  ) then
    new.thumbnail_path := v_path;
    new.thumbnail_metadata := coalesce(new.thumbnail_metadata, '{}'::jsonb)
      || jsonb_build_object('linkedAt', now(), 'source', 'precreated-private-thumbnail');
  end if;

  return new;
end;
$$;

drop trigger if exists examination_images_attach_precreated_thumbnail on public.examination_images;
create trigger examination_images_attach_precreated_thumbnail
before insert on public.examination_images
for each row
execute function private.attach_precreated_thumbnail_reference();
""")

# Dashboard containment must not depend entirely on one mobile breakpoint,
# because Safari page zoom can alter the effective CSS viewport.
css = Path('src/legacy65925.css')
s = css.read_text()
anchor = """.app-shell { width: 100%; min-width: 0; max-width: 100%; overflow-x: clip; }
@media (max-width: 900px) {
"""
expanded = """.app-shell { width: 100%; min-width: 0; max-width: 100%; overflow-x: clip; }
.main-content,
.admin-dashboard-page,
.admin-dashboard-page .admin-stat-grid,
.admin-dashboard-page .admin-grid,
.admin-dashboard-page .admin-panel,
.admin-dashboard-page .followup-list,
.admin-dashboard-page .activity-chart,
.admin-dashboard-page .chart-legend,
.admin-dashboard-page .section-heading {
  min-width: 0;
  max-width: 100%;
}
.admin-dashboard-page,
.admin-dashboard-page .admin-stat-grid,
.admin-dashboard-page .admin-grid,
.admin-dashboard-page .admin-panel,
.admin-dashboard-page .followup-list,
.admin-dashboard-page .activity-chart { width: 100%; }
.admin-dashboard-page { overflow-x: clip; }
@media (max-width: 900px) {
"""
if anchor not in s:
    raise RuntimeError('dashboard containment anchor not found')
css.write_text(s.replace(anchor, expanded, 1))

# Regression contract: validate call order and post-condition, not only presence
# of a thumbnail service call.
Path('tests/thumbnail_dependency_contract.test.ts').write_text("""import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const processingStart = app.indexOf("if (stage !== 'processing') return")
const finalizeStart = app.indexOf('const finalize = async', processingStart)
assert.ok(processingStart >= 0 && finalizeStart > processingStart)
const processing = app.slice(processingStart, finalizeStart)
const analysisIndex = processing.indexOf('runAnalysisWorkflow({')
const thumbnailIndex = processing.indexOf('thumbnailServiceRef.current.generateAndStore')
assert.ok(analysisIndex >= 0 && thumbnailIndex > analysisIndex, 'thumbnail persistence must begin after analysis workflow/image references')

const endpoint = readFileSync(new URL('../backend/api/v1/examinations/[id]/thumbnails.mjs', import.meta.url), 'utf8')
assert.ok(endpoint.includes("Prefer: 'return=representation'"))
assert.ok(endpoint.includes('linkedRows.length !== 1'))
assert.ok(endpoint.includes('Thumbnail uploaded but image reference is missing'))

const migration = readFileSync(new URL('../supabase/migrations/20260811102500_attach_precreated_thumbnail_on_image_insert.sql', import.meta.url), 'utf8')
assert.ok(migration.includes('examination_images_attach_precreated_thumbnail'))
assert.ok(migration.includes("bucket_id = 'dm-foot-thumbnails'"))
console.log('Thumbnail dependency contract tests passed')
""")

package = Path('package.json')
s = package.read_text()
needle = 'node --experimental-strip-types tests/responsive_contract.test.ts && '
if needle not in s:
    raise RuntimeError('test command anchor not found')
package.write_text(s.replace(needle, needle + 'node --experimental-strip-types tests/thumbnail_dependency_contract.test.ts && ', 1))

contract = Path('REGRESSION_CONTRACT.md')
s = contract.read_text()
needle = '- Patient and Admin historical image viewing use thumbnails first; original Drive images are fetched only on explicit full-image open.\n'
addition = needle + '- A successful HTTP response is not sufficient for multi-system writes; verify the required storage/database post-condition before reporting success.\n- Thumbnail persistence must be linked to an existing examination image row; both early-thumbnail and normal ordering remain safe.\n'
if needle not in s:
    raise RuntimeError('regression contract anchor not found')
contract.write_text(s.replace(needle, addition, 1))

print('Thumbnail dependency patch applied')
