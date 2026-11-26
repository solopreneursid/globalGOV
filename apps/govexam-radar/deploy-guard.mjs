// Staging-only Cloudflare release guard. Never expose or download secret values.
// A Worker multipart upload REPLACES bindings unless explicitly inherited.
// Cloudflare's ?bindings_inherit=strict fails if a binding cannot be inherited.
export const STAGING_WORKER="hqventures-govexam-parity-preview";
export const STAGING_DB="b1f499a6-283b-47e8-8cd7-ef2b5f7245bc";
const ALLOWED=new Set(["DB","INGEST_HMAC_KEY"]);
function assertBindings(bindings,secrets){
 if(!Array.isArray(bindings)||!Array.isArray(secrets))throw Error("worker_settings_unavailable");
 const names=bindings.map(x=>x.name);
 if(names.length!==2||new Set(names).size!==2||names.some(x=>!ALLOWED.has(x)))
  throw Error("unexpected_worker_binding_inventory");
 const db=bindings.find(x=>x.name==="DB");
 if(db?.type!=="d1"||(db.database_id||db.id)!==STAGING_DB)
  throw Error("staging_db_binding_mismatch");
 const credential=bindings.find(x=>x.name==="INGEST_HMAC_KEY");
 if(credential?.type!=="secret_text"||typeof credential.text==="string")
  throw Error("encrypted_ingest_secret_missing");
 if(!secrets.some(x=>x.name==="INGEST_HMAC_KEY"&&x.type==="secret_text"))
  throw Error("secret_registry_mismatch");
}
export function deploymentPlan(worker,bindings,secrets){
 if(worker!==STAGING_WORKER)throw Error("refuse_non_staging_deploy");
 assertBindings(bindings,secrets);
 return {
  main_module:"worker.js",
  compatibility_date:"2026-11-16",
  bindings:[
   {type:"d1",name:"DB",database_id:STAGING_DB},
   {type:"inherit",name:"INGEST_HMAC_KEY"}
  ],
  observability:{enabled:true,traces:{enabled:true}}
 };
}
export function verifyDeployment(worker,bindings,secrets){
 if(worker!==STAGING_WORKER)throw Error("refuse_non_staging_deploy");
 assertBindings(bindings,secrets);
 return true;
}
