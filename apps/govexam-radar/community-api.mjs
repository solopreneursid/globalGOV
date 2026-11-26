// HQventures community backend — D1 SQLite, no third-party authentication provider.
// Device-bound identities cannot be impersonated with a username alone.
// Restrict public launch until moderation, reporting, and privacy review are complete.
const TAGS = new Set([
 '#Syllabus & Strategy','#PYQs & Mock Tests','#Technical Subject Prep',
 '#Books & Free Notes','#Admit Card & Exam Center','#Interview & Cutoff'
]);
const response = (payload,status=200) => new Response(JSON.stringify(payload),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'none'}
});
const validHandle = h => typeof h==='string' && /^[A-Za-z][A-Za-z0-9_-]{2,23}$/.test(h) && !/(admin|official|govradar|moderator|support|staff|verified|system|_bot$)/i.test(h);
const validRoom = id => typeof id==='string' && /^[a-z0-9-]{3,96}$/i.test(id);
const validContent = (s,max) => typeof s==='string' && s.trim().length>=3 && s.trim().length<=max && !/(https?:\/\/|www\.|@|<|>|\b(?:bit\.ly|t\.me|wa\.me)\b)/i.test(s);
async function hashToken(token) {
 if(typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token))return null;
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
async function auth(request,db) {
 const hash=await hashToken(request.headers.get('X-GovRadar-Token'));
 return hash ? await db.prepare('SELECT id,handle,last_post_at,last_reply_at FROM members WHERE token_hash=?').bind(hash).first() : null;
}
async function parseBody(request){
 if(Number(request.headers.get('Content-Length')||0)>4096)throw Error('Request too large');
 if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error('JSON required');
 const text=await request.text(); if(text.length>4096)throw Error('Request too large');
 const body=JSON.parse(text);
 if(!body || typeof body!=='object' || Array.isArray(body))throw Error('Invalid JSON object');
 return body;
}
export async function handleCommunity(request,env,path,url){
 const db=env.DB;
 if(!db)return response({error:'community_unavailable',message:'Community storage is not configured.'},503);
 if(request.method!=='GET'&&request.method!=='POST')return response({error:'method_not_allowed'},405);
 if(request.method==='POST'){
   const origin=request.headers.get('Origin');
   if(origin && origin!==url.origin)return response({error:'origin_rejected'},403);
 }
 try{
   const now=Date.now();
   if(path==='/api/community/register' && request.method==='POST'){
     const body=await parseBody(request);
     const handle=body.handle?.trim();
     if(!validHandle(handle))return response({error:'invalid_handle',message:'Choose a 3–24 character username without reserved government or staff labels.'},422);
     const hashed=await hashToken(body.token);
     if(!hashed)return response({error:'invalid_token',message:'Secure browser device credential required.'},422);
     const taken=await db.prepare('SELECT id,handle,token_hash FROM members WHERE handle=? COLLATE NOCASE').bind(handle).first();
     if(taken){
       if(taken.token_hash!==hashed)return response({error:'handle_taken',message:'This username is taken. Choose another name on this browser.'},409);
       return response({handle:taken.handle,identity:'device_bound'});
     }
     const count=await db.prepare('SELECT COUNT(*) as count FROM members WHERE created_at >= ?').bind(now-86400000).first();
     if(Number(count?.count||0)>=250)return response({error:'registration_limited',message:'New community registrations are temporarily limited.'},429);
     try{
       await db.prepare('INSERT INTO members(id,handle,token_hash,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),handle,hashed,now).run();
     } catch(e) {
       if(String(e).includes('UNIQUE'))return response({error:'handle_taken',message:'This username is taken. Choose another name.'},409);
       throw e;
     }
     return response({handle,identity:'device_bound'},201);
   }
   if(path==='/api/community/posts' && request.method==='GET'){
     const room=url.searchParams.get('examId')||'';
     if(!validRoom(room))return response({error:'invalid_exam'},422);
     const member=await auth(request,db);
     const rows=await db.prepare(
       'SELECT p.id,p.exam_id as examId,p.tag,p.content,p.created_at as createdAt,m.handle as username,'+
       '(SELECT COUNT(*) FROM votes v WHERE v.post_id=p.id) as upvotes,'+
       'EXISTS(SELECT 1 FROM votes v WHERE v.post_id=p.id AND v.member_id=?) as upvotedByMe '+
       'FROM posts p JOIN members m ON p.member_id=m.id WHERE p.exam_id=? AND p.hidden=0 ORDER BY p.created_at DESC LIMIT 40'
     ).bind(member?.id||'',room).all();
     const posts=rows.results||[];
     if(posts.length){
       const qs=posts.map(()=>'?').join(',');
       const replies=await db.prepare(
         'SELECT r.id,r.post_id as postId,r.content as text,r.created_at as createdAt,m.handle as username '+
         'FROM replies r JOIN members m ON r.member_id=m.id WHERE r.hidden=0 AND r.post_id IN ('+qs+') ORDER BY r.created_at ASC LIMIT 250'
       ).bind(...posts.map(p=>p.id)).all();
       const replyById=new Map();
       for(const r of replies.results||[]){
         if(!replyById.has(r.postId))replyById.set(r.postId,[]);
         replyById.get(r.postId).push({id:r.id,username:r.username,text:r.text,timestamp:new Date(r.createdAt).toLocaleString('en-GB')});
       }
       return response({posts:posts.map(p=>({
         id:p.id,examId:p.examId,username:p.username,roleBadge:'Community member',tag:p.tag,
         timestamp:new Date(p.createdAt).toLocaleString('en-GB'),content:p.content,
         upvotes:p.upvotes,upvotedByMe:Boolean(p.upvotedByMe),replies:(replyById.get(p.id)||[]).slice(0,25)
       }))});
     }
     return response({posts:[]});
   }
   if(path==='/api/community/export' && request.method==='GET'){
     const member=await auth(request,db);
     if(!member)return response({error:'not_authenticated',message:'Sign in on this device to export your community data.'},401);
     const posts=await db.prepare('SELECT id,exam_id as examId,tag,content,created_at as createdAt FROM posts WHERE member_id=? ORDER BY created_at DESC LIMIT 1000').bind(member.id).all();
     const replies=await db.prepare('SELECT id,post_id as postId,content,created_at as createdAt FROM replies WHERE member_id=? ORDER BY created_at DESC LIMIT 1000').bind(member.id).all();
     return response({handle:member.handle,exportedAt:new Date().toISOString(),posts:posts.results||[],replies:replies.results||[],
       notice:'Export contains only your own records. You may erase your account from the community controls.'});
   }
   if(!['/api/community/post','/api/community/reply','/api/community/vote','/api/community/report','/api/community/delete-post','/api/community/delete-account'].includes(path)||request.method!=='POST')return response({error:'not_found'},404);
   const member=await auth(request,db);
   if(!member)return response({error:'not_authenticated',message:'Join the community with a device-bound username first.'},401);
   const body=await parseBody(request);
   if(path==='/api/community/report'){
     const {targetType,targetId,reason}=body;
     if(!['post','reply'].includes(targetType)||typeof targetId!=='string'||!/^[a-f0-9-]{36}$/i.test(targetId)||!['spam','harassment','personal_information','misinformation','other'].includes(reason))
       return response({error:'invalid_report',message:'Choose a valid report reason.'},422);
     const table=targetType==='post'?'posts':'replies';
     const existing=await db.prepare('SELECT member_id FROM '+table+' WHERE id=? AND hidden=0').bind(targetId).first();
     if(!existing)return response({error:'content_not_found'},404);
     if(existing.member_id===member.id)return response({error:'own_content',message:'You cannot report your own content.'},422);
     const count=await db.prepare('SELECT COUNT(*) as count FROM reports WHERE reporter_id=? AND created_at>?').bind(member.id,now-86400000).first();
     if(Number(count?.count||0)>=8)return response({error:'rate_limited',message:'Reporting limit reached. Try again tomorrow.'},429);
     const row=await db.prepare('INSERT OR IGNORE INTO reports(id,target_type,target_id,reporter_id,reason,created_at) VALUES(?,?,?,?,?,?)')
       .bind(crypto.randomUUID(),targetType,targetId,member.id,reason,now).run();
     return response({status:row.meta?.changes?'submitted':'already_reported',notice:'Reports are queued for founder review; submission does not automatically remove content.'},200);
   }
   if(path==='/api/community/delete-post'){
     const id=body.postId;
     if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))return response({error:'invalid_post'},422);
     const mine=await db.prepare('SELECT id FROM posts WHERE id=? AND member_id=?').bind(id,member.id).first();
     if(!mine)return response({error:'not_authorized',message:'Only the post author can delete it.'},403);
     await db.batch([
       db.prepare("DELETE FROM reports WHERE (target_type='post' AND target_id=?) OR (target_type='reply' AND target_id IN(SELECT id FROM replies WHERE post_id=?))").bind(id,id),
       db.prepare('DELETE FROM votes WHERE post_id=?').bind(id),
       db.prepare('DELETE FROM replies WHERE post_id=?').bind(id),
       db.prepare('DELETE FROM posts WHERE id=? AND member_id=?').bind(id,member.id)
     ]);
     return response({status:'deleted',notice:'Post and its discussion thread permanently deleted.'});
   }
   if(path==='/api/community/delete-account'){
     if(body.confirm!=='DELETE')return response({error:'confirmation_required',message:'Confirm account deletion explicitly.'},422);
     // Child records first. Remove posts and their replies, then delete the member credential.
     await db.batch([
       db.prepare("DELETE FROM reports WHERE reporter_id=? OR (target_type='post' AND target_id IN(SELECT id FROM posts WHERE member_id=?)) OR (target_type='reply' AND target_id IN(SELECT id FROM replies WHERE member_id=? OR post_id IN(SELECT id FROM posts WHERE member_id=?)))")
         .bind(member.id,member.id,member.id,member.id),
       db.prepare('DELETE FROM votes WHERE member_id=? OR post_id IN(SELECT id FROM posts WHERE member_id=?)').bind(member.id,member.id),
       db.prepare('DELETE FROM replies WHERE member_id=? OR post_id IN(SELECT id FROM posts WHERE member_id=?)').bind(member.id,member.id),
       db.prepare('DELETE FROM posts WHERE member_id=?').bind(member.id),
       db.prepare('DELETE FROM members WHERE id=?').bind(member.id)
     ]);
     return response({status:'deleted',notice:'Community account and posts deleted. Replies under your posts are also removed.'});
   }
   if(path==='/api/community/post'){
     if(!validRoom(body.examId))return response({error:'invalid_exam',message:'Select a valid exam room.'},422);
     if(!TAGS.has(body.tag))return response({error:'invalid_topic',message:'Select a study topic.'},422);
     if(!validContent(body.content,1200))return response({error:'invalid_content',message:'Use 3–1200 characters; links, email addresses, and HTML are not allowed.'},422);
     const guard=await db.prepare('UPDATE members SET last_post_at=? WHERE id=? AND last_post_at<?').bind(now,member.id,now-45000).run();
     if(!guard.meta?.changes)return response({error:'rate_limited',message:'Please leave at least 45 seconds between posts.'},429);
     const id=crypto.randomUUID();
     await db.prepare('INSERT INTO posts(id,exam_id,member_id,tag,content,created_at) VALUES(?,?,?,?,?,?)').bind(id,body.examId,member.id,body.tag,body.content.trim(),now).run();
     return response({id,status:'posted'},201);
   }
   if(path==='/api/community/reply'){
     if(typeof body.postId!=='string'||body.postId.length>80 ||!validContent(body.content,500))return response({error:'invalid_reply',message:'Reply must be 3–500 characters without links or email addresses.'},422);
     const post=await db.prepare('SELECT id FROM posts WHERE id=? AND hidden=0').bind(body.postId).first();
     if(!post)return response({error:'post_not_found'},404);
     const guard=await db.prepare('UPDATE members SET last_reply_at=? WHERE id=? AND last_reply_at<?').bind(now,member.id,now-20000).run();
     if(!guard.meta?.changes)return response({error:'rate_limited',message:'Please leave at least 20 seconds between replies.'},429);
     const id=crypto.randomUUID();
     await db.prepare('INSERT INTO replies(id,post_id,member_id,content,created_at) VALUES(?,?,?,?,?)').bind(id,body.postId,member.id,body.content.trim(),now).run();
     return response({id,status:'posted'},201);
   }
   if(path==='/api/community/vote'){
     if(typeof body.postId!=='string'||body.postId.length>80)return response({error:'invalid_post'},422);
     const post=await db.prepare('SELECT id FROM posts WHERE id=? AND hidden=0').bind(body.postId).first();
     if(!post)return response({error:'post_not_found'},404);
     const existing=await db.prepare('SELECT post_id FROM votes WHERE post_id=? AND member_id=?').bind(body.postId,member.id).first();
     if(existing){
       await db.prepare('DELETE FROM votes WHERE post_id=? AND member_id=?').bind(body.postId,member.id).run();
       return response({voted:false});
     }
     await db.prepare('INSERT OR IGNORE INTO votes(post_id,member_id,created_at) VALUES(?,?,?)').bind(body.postId,member.id,now).run();
     return response({voted:true});
   }
 } catch(e){
   if(e instanceof SyntaxError)return response({error:'invalid_json',message:'Valid JSON is required.'},400);
   if(/Invalid JSON|JSON required|Request too large/.test(String(e?.message)))return response({error:'invalid_request',message:String(e.message)},400);
   console.error(JSON.stringify({event:'community_error',path,error:String(e?.message||e)}));
   return response({error:'temporarily_unavailable',message:'The community service is temporarily unavailable.'},503);
 }
 return response({error:'not_found'},404);
}
