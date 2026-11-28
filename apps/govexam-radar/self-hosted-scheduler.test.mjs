import test from "node:test";
import assert from "node:assert/strict";
import { scheduledSlot, runScheduledSlot } from "./self-hosted-scheduler.mjs";

test("maps UTC scheduler slots to the existing three source tasks", () => {
  const date = (hour, minute) => Date.UTC(2026, 10, 27, hour, minute, 45);
  assert.equal(scheduledSlot(date(0, 0)).task, "portals");
  assert.equal(scheduledSlot(date(0, 20)).task, "uk");
  assert.equal(scheduledSlot(date(0, 40)).task, "manitoba");
  assert.equal(scheduledSlot(date(1, 0)), null);
  assert.equal(scheduledSlot(date(0, 10)), null);
});

test("claims each schedule slot once and awaits Worker waitUntil work", async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            run: async () => {
              calls.push({ sql, values });
              return { meta: { changes: sql.startsWith("INSERT") ? 1 : 1 } };
            }
          };
        }
      };
    }
  };
  let completed = false;
  const slot = scheduledSlot(Date.UTC(2026, 10, 27, 0, 20, 0));
  const result = await runScheduledSlot({
    db,
    slot,
    now: Date.UTC(2026, 10, 27, 0, 20, 1),
    env: { DB: db },
    workerImpl: {
      async scheduled(controller, env, ctx) {
        assert.equal(controller.scheduledTime, slot.scheduledTime);
        ctx.waitUntil(Promise.resolve().then(() => { completed = true; }));
      }
    },
    logger: { info() {}, error() {} }
  });
  assert.equal(result.state, "ok");
  assert.equal(completed, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /ON CONFLICT\(slot\) DO NOTHING/);
  assert.match(calls[1].sql, /state='ok'/);
});

test("does not execute a slot already claimed by another scheduler", async () => {
  let invoked = false;
  const db = {
    prepare() {
      return { bind: () => ({ run: async () => ({ meta: { changes: 0 } }) }) };
    }
  };
  const slot = scheduledSlot(Date.UTC(2026, 10, 27, 0, 0, 0));
  const result = await runScheduledSlot({
    db, slot, env: { DB: db },
    workerImpl: { scheduled: async () => { invoked = true; } }
  });
  assert.equal(result.state, "already_claimed");
  assert.equal(invoked, false);
});

test("reported collector failure is persisted as a failed schedule slot",async()=>{
 const calls=[];
 const db={prepare(sql){return{bind(...values){return{run:async()=>{calls.push({sql,values});return{meta:{changes:1}};}};}};}};
 const slot=scheduledSlot(Date.UTC(2026,10,27,0,20,0));
 await assert.rejects(runScheduledSlot({db,slot,env:{DB:db},workerImpl:{async scheduled(c,e,ctx){ctx.waitUntil(Promise.resolve({state:"error"}));}},logger:{info(){},error(){}}}),/scheduled_source_failed/);
 assert.ok(calls.some(x=>x.sql.includes("state='error'")));
 assert.ok(!calls.some(x=>x.sql.includes("state='ok'")));
});
test("daily discovery runs only at the claimed midnight portal slot",async()=>{
 const db={prepare(){return{bind(){return{run:async()=>({meta:{changes:1}})};}};}};
 const slots=[];
 for(const hour of [0,3])await runScheduledSlot({db,slot:scheduledSlot(Date.UTC(2026,10,27,hour,0,0)),env:{DB:db},workerImpl:{async scheduled(){}},discovery:async s=>{slots.push(s);return[];},logger:{info(){},error(){}}});
 assert.equal(slots.length,1);assert.match(slots[0],/T00:00:00/);
});
