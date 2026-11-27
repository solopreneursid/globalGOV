// Synthetic valid PDF for actual Poppler execution; no government PDF stored.
import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPdfText} from './recruitment-document.mjs';
import {extractRecruitmentEvidence} from './recruitment-evidence.mjs';
function tinyPdf(){
 const stream='BT /F1 12 Tf 50 750 Td (Post name: Test Engineer) Tj 0 -20 Td (Vacancies: 2) Tj ET';
 const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'];
 let pdf='%PDF-1.4\n';const offsets=[0];
 for(const [i,obj] of objs.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';}
 const start=Buffer.byteLength(pdf);pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
 return Buffer.from(pdf);
}
test('real PDF text extraction and field evidence round trip',()=>{
 const bytes=tinyPdf(),text=extractPdfText(bytes);
 const result=extractRecruitmentEvidence({sourceId:'india-sdsc-shar',sourceUrl:'https://apps.shar.gov.in/sdscshar/notice/test.pdf',documentBytes:bytes,text});
 assert.equal(result.fields.post.value,'Test Engineer');assert.equal(result.fields.vacancies.value,2);assert.equal(result.fields.post.page,1);
 assert.equal(result.provenance,'local_unverified');assert.equal(result.publicLaunchAuthorized,false);
});
