// A first-party capability boundary for the future UK-only public Worker.
// D1 has a read/write native binding, so this wrapper restricts the *runtime
// capabilities exposed to request handlers*. Production credentials must also
// follow least-privilege infrastructure controls; this is defense in depth.
export function readonlyOfficialNoticesDb(db){
 if(!db || typeof db.prepare!=="function")return null;
 return Object.freeze({
  prepare(sql){
   if(typeof sql!=="string"||
      !/^\s*SELECT\b/i.test(sql)||
      !/\bFROM\s+official_job_notices\b/i.test(sql)||
      /;|\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|ATTACH|DETACH|PRAGMA|REPLACE|VACUUM)\b/i.test(sql))
    throw Error("uk_public_query_not_allowed");
   let statement=db.prepare(sql);
   const wrapped={
    bind(...args){statement=statement.bind(...args);return wrapped;},
    first(){return statement.first();},
    all(){return statement.all();}
   };
   return Object.freeze(wrapped);
  }
 });
}
