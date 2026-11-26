// Human-only moderation. This endpoint is inert until founder supplies a secret binding.
// Never grant this secret to YorpHives HQ agents; HQ only monitors/recommends.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY"}});
async function constantTimeMatch(entered,expected){
 if(typeof entered!=="string"||typeof expected!=="string"||entered.length<32||entered.length>256||expected.length<32)return false;
 const hash=async s=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
 const [left,right]=await Promise.all([hash(entered),hash(expected)]);
 let diff=0;for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
 return diff===0;
}
function safeJson(request){
 if(!request.headers.get("content-type")?.toLowerCase().includes("application/json"))throw Error("JSON required");
 if(Number(request.headers.get("content-length")||0)>1000)throw Error("Request too large");
 return request.text().then(s=>{
  if(s.length>1000)throw Error("Request too large");
  const body=JSON.parse(s);
  if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid JSON object");
  return body;
 });
}
export async function handleModeration(request,env,url){
 if(!env?.DB)return json({error:"database_unavailable"},503);
 if(!env?.MODERATOR_TOKEN||typeof env.MODERATOR_TOKEN!=="string"||env.MODERATOR_TOKEN.length<32)
  return json({error:"moderation_not_configured",message:"Founder moderator secret has not been installed."},503);
 const cred=request.headers.get("X-GovRadar-Moderator");
 if(!await constantTimeMatch(cred,env.MODERATOR_TOKEN))return json({error:"unauthorized"},401);
 if(request.method==="POST"){
  const origin=request.headers.get("Origin");
  if(origin && origin!==url.origin)return json({error:"forbidden_origin"},403);
 }
 try{
  if(url.pathname==="/api/moderation/reports" && request.method==="GET"){
   const reports=await env.DB.prepare(
     "SELECT r.id,r.target_type as targetType,r.target_id as targetId,r.reason,r.created_at as createdAt,m.handle as reporter,"+
     "CASE WHEN r.target_type='post' THEN (SELECT content FROM posts WHERE id=r.target_id) ELSE (SELECT content FROM replies WHERE id=r.target_id) END AS content,"+
     "CASE WHEN r.target_type='post' THEN (SELECT handle FROM members WHERE id=(SELECT member_id FROM posts WHERE id=r.target_id)) ELSE (SELECT handle FROM members WHERE id=(SELECT member_id FROM replies WHERE id=r.target_id)) END AS author "+
     "FROM reports r JOIN members m ON m.id=r.reporter_id ORDER BY r.created_at ASC LIMIT 80").all();
   const counts=await env.DB.prepare("SELECT COUNT(*) AS total FROM reports").first();
   return json({reports:reports.results||[],pending:counts?.total||0,notice:"Founder-operated reports queue. No automatic deletion or hidden actions are performed on behalf of agents."});
  }
  if(url.pathname==="/api/moderation/hidden" && request.method==="GET"){
   const posts=await env.DB.prepare("SELECT p.id,p.content,p.created_at as createdAt,m.handle as author,'post' as targetType FROM posts p JOIN members m ON m.id=p.member_id WHERE p.hidden=1 ORDER BY p.created_at DESC LIMIT 25").all();
   const replies=await env.DB.prepare("SELECT r.id,r.content,r.created_at as createdAt,m.handle as author,'reply' as targetType FROM replies r JOIN members m ON m.id=r.member_id WHERE r.hidden=1 ORDER BY r.created_at DESC LIMIT 25").all();
   return json({items:(posts.results||[]).concat(replies.results||[]).sort((a,b)=>b.createdAt-a.createdAt).slice(0,40)});
  }
  if(url.pathname==="/api/moderation/decide" && request.method==="POST"){
   const body=await safeJson(request);
   if(typeof body.reportId!=="string"||!/^[a-f0-9-]{36}$/i.test(body.reportId))return json({error:"invalid_report"},422);
   if(!["hide","dismiss"].includes(body.action))return json({error:"invalid_action"},422);
   const report=await env.DB.prepare("SELECT id,target_type as targetType,target_id as targetId FROM reports WHERE id=?").bind(body.reportId).first();
   if(!report)return json({error:"report_not_found"},404);
   const table=report.targetType==="post"?"posts":"replies";
   const record=await env.DB.prepare("SELECT id FROM "+table+" WHERE id=?").bind(report.targetId).first();
   if(!record&&body.action==="hide")return json({error:"target_missing"},404);
   const statements=[];
   if(body.action==="hide")
    statements.push(env.DB.prepare("UPDATE "+table+" SET hidden=1 WHERE id=?").bind(report.targetId));
   statements.push(env.DB.prepare("INSERT INTO moderation_actions(id,target_type,target_id,action,reason,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),report.targetType,report.targetId,body.action,"reviewed_report:"+body.reportId,Date.now()));
   // Resolve all duplicate reports against the same target after a founder decision.
   statements.push(env.DB.prepare("DELETE FROM reports WHERE target_type=? AND target_id=?").bind(report.targetType,report.targetId));
   await env.DB.batch(statements);
   return json({status:"reviewed",action:body.action,affectedType:report.targetType});
  }
  if(url.pathname==="/api/moderation/restore" && request.method==="POST"){
   const body=await safeJson(request);
   if(!["post","reply"].includes(body.targetType)||typeof body.targetId!=="string"||!/^[a-f0-9-]{36}$/i.test(body.targetId))return json({error:"invalid_target"},422);
   const table=body.targetType==="post"?"posts":"replies";
   const hidden=await env.DB.prepare("SELECT id FROM "+table+" WHERE id=? AND hidden=1").bind(body.targetId).first();
   if(!hidden)return json({error:"not_hidden"},404);
   await env.DB.batch([
    env.DB.prepare("UPDATE "+table+" SET hidden=0 WHERE id=?").bind(body.targetId),
    env.DB.prepare("INSERT INTO moderation_actions(id,target_type,target_id,action,reason,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),body.targetType,body.targetId,"restore","founder_review",Date.now())
   ]);
   return json({status:"restored",targetType:body.targetType});
  }
  return json({error:"not_found"},404);
 }catch(e){
  if(e instanceof SyntaxError||/JSON required|Request too large|Invalid JSON/.test(String(e?.message)))return json({error:"invalid_request"},400);
  console.error(JSON.stringify({event:"moderation_error",error:String(e?.message||e)}));
  return json({error:"service_unavailable"},503);
 }
}
