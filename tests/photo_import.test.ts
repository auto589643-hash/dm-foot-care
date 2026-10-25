import assert from 'node:assert/strict'
import { PHOTO_MAX_UPLOAD_BYTES, validateSelectedPhoto } from '../src/services/photoImport.ts'
assert.equal(validateSelectedPhoto({ name:'foot.HEIC', type:'image/heic', size:1024 }), null)
assert.equal(validateSelectedPhoto({ name:'foot.heif', type:'', size:1024 }), null)
assert.equal(validateSelectedPhoto({ name:'foot.jpg', type:'image/jpeg', size:1024 }), null)
assert.equal(validateSelectedPhoto({ name:'foot.webp', type:'image/webp', size:1024 }), null)
assert.match(validateSelectedPhoto({ name:'file.pdf', type:'application/pdf', size:1024 }) || '', /รูปภาพ/)
assert.match(validateSelectedPhoto({ name:'foot.jpg', type:'image/jpeg', size:0 }) || '', /ไม่มีข้อมูล/)
assert.match(validateSelectedPhoto({ name:'foot.jpg', type:'image/jpeg', size:PHOTO_MAX_UPLOAD_BYTES+1 }) || '', /20 MB/)
console.log('Mobile photo upload selection contract tests passed')
