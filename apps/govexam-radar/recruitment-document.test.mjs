import test from "node:test";
import assert from "node:assert/strict";
import { fetchOfficialDocument, extractPdfText } from "./recruitment-document.mjs";

test("direct PDF fetch refuses to make a request without an explicit reviewed source policy", async () => {
  let requests = 0;
  await assert.rejects(fetchOfficialDocument(
    "india-sdsc-shar",
    "https://apps.shar.gov.in/sdscshar/advt_1_2026/notice.pdf",
    async () => { requests += 1; return new Response("%PDF-"); }
  ), /reviewed_source_policy_required/);
  assert.equal(requests, 0);
});

test("OCR is opt-in, bounded and never runs when native text exists",()=>{
 const pdf=Buffer.from("%PDF-1.7");
 const calls=[];
 const run=(cmd)=>{calls.push(cmd);if(cmd==="pdfinfo")return "Pages: 1";if(cmd==="pdftotext")return "native text";throw Error("unexpected OCR");};
 assert.equal(extractPdfText(pdf,{ocr:true,run}),"native text");
 assert.deepEqual(calls,["pdfinfo","pdftotext"]);
 const empty=(cmd)=>cmd==="pdfinfo"?"Pages: 6":"";
 assert.equal(extractPdfText(pdf,{ocr:false,run:empty}),"");
 assert.throws(()=>extractPdfText(pdf,{ocr:true,run:empty}),/ocr_page_limit/);
 const synthetic=(cmd)=>cmd==="pdfinfo"?"Pages: 1":cmd==="tesseract"?"synthetic extracted candidate":"";
 assert.equal(extractPdfText(pdf,{ocr:true,run:synthetic}),"synthetic extracted candidate");
});
