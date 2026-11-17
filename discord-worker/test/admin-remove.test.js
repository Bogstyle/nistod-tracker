import test from 'node:test';
import assert from 'node:assert/strict';
import {removeActiveTod} from '../src/index.js';

test('Retrait admin invalide uniquement le ToD du NM ciblé, via transaction', async()=>{
  const executed=[];
  const i={member:{user:{id:'123456789012345678',global_name:'Admin'},permissions:'32'}};
  const db={
    prepare(sql){
      const o={bind(...args){return {
        async first(){
          if(sql.includes('FROM nm_catalog'))return {slug:'argus',name:'Argus',aliases:'[]'};
          if(sql.includes('SELECT event_id FROM current_tods'))return executed.length?null:{event_id:3};
          return null;
        },
        async run(){executed.push({sql,args});return {meta:{changes:1}};}
      }},async all(){return {results:[{slug:'argus',name:'Argus',aliases:'[]'}]}}};
      return o;
    },
    async batch(statements){
      for(const x of statements)await x.run();
    }
  };
  const out=await removeActiveTod({DB:db},i,'argus','test incorrect');
  assert.match(out.data.content,/ToD de.*Argus.*invalidé/);
  assert.equal(executed.length,2);
  assert.match(executed[0].sql,/UPDATE tod_events SET state='invalidated'/);
  assert.equal(executed[0].args[0],'123456789012345678');
  assert.match(executed[1].sql,/DELETE FROM current_tods/);
  assert.deepEqual(executed[1].args,['argus',3]);
});
