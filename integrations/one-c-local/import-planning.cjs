'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { readEntity } = require('./adapter.cjs');
const { ensureSource } = require('./manage.cjs');
const { recoverSnapshot } = require('./recovery.cjs');
const NAMESPACE_FILE = path.resolve(__dirname,'../../.local/local-app/one-c-namespace.json');
function localId(namespace, type, source) {
  const bytes = createHash('sha256').update(`${namespace}:${type}:${source}`).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|0x50; bytes[8]=(bytes[8]&63)|0x80;
  const hex=bytes.toString('hex'); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function readCatalogs({ signal } = {}) {
  const clients=await readEntity('Catalog_Клиенты','Ref_Key,Description',fetch,{signal});
  const projects=await readEntity('Catalog_ПроектыКлиентов','Ref_Key,Description,Owner_Key',fetch,{signal});
  const drivers=await readEntity('Catalog_Водители','Ref_Key,Description,Активен',fetch,{signal});
  const vehicles=await readEntity('Catalog_ТранспортныеСредства','Ref_Key,Description,ГосНомер,Активен',fetch,{signal});
  return {clients,projects,drivers,vehicles};
}
async function importCatalogs(pool,{adminId='10000000-0000-4000-8000-000000000005'}={}) {
  const catalog=await recoverSnapshot({ensureSource,readSnapshot:readCatalogs});
  await fs.mkdir(path.dirname(NAMESPACE_FILE),{recursive:true,mode:0o700});
  try { await fs.writeFile(NAMESPACE_FILE,JSON.stringify({namespace:randomUUID()}),{flag:'wx',mode:0o600}); } catch(error) { if(error.code!=='EEXIST') throw error; }
  const { namespace }=JSON.parse(await fs.readFile(NAMESPACE_FILE,'utf8'));
  const client=await pool.connect();
  const result={source:'Локальная 1С · InfoBase',drivers:catalog.drivers.length,vehicles:catalog.vehicles.length,scopes:[]};
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(917042028)');
    const legal=localId(namespace,'legal','InfoBase'),region=localId(namespace,'region','Europe/Moscow');
    await client.query('INSERT INTO legal_entities(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING',[legal,'Локальный тест · InfoBase']);
    await client.query('INSERT INTO regions(id,name,time_zone) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[region,'Локально · Москва','Europe/Moscow']);
    for(const source of catalog.projects) {
      if(!catalog.clients.some(c=>c.Ref_Key===source.Owner_Key)) throw new Error('Для проекта 1С не найден клиент-владелец. Справочники не обновлены.');
      const project=localId(namespace,'project',source.Ref_Key),scope=localId(namespace,'scope',source.Ref_Key);
      await client.query(`INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name`,[project,`Локальная 1С · ${source.Description}`,legal,region]);
      await client.query(`INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[scope,project,'Плановые смены · InfoBase']);
      await client.query(`INSERT INTO planning_one_c_scopes(responsibility_scope_id,source_namespace,client_ref,project_ref)
        VALUES($1,$2,$3,$4) ON CONFLICT(responsibility_scope_id) DO UPDATE SET client_ref=excluded.client_ref,project_ref=excluded.project_ref`,[scope,namespace,source.Owner_Key,source.Ref_Key]);
      await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
        VALUES($1,$2,$3,$4,$5,true) ON CONFLICT DO NOTHING`,[adminId,legal,region,project,scope]);
      await client.query(`UPDATE planning_one_c_resources SET active=false WHERE responsibility_scope_id=$1`,[scope]);
      for(const [kind,records] of [['driver',catalog.drivers],['vehicle',catalog.vehicles]]) for(const record of records) {
        const id=localId(namespace,kind,record.Ref_Key);
        if(kind==='driver') {
          await client.query(`INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,'driver',$3,true)
            ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,active=users.active AND excluded.active`,[id,record.Description,record.Активен===true]);
          await client.query(`INSERT INTO employee_directory(user_id,source_kind) VALUES($1,'existing') ON CONFLICT DO NOTHING`,[id]);
          await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
            VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[id,legal,region,project,scope]);
        }
        await client.query(`INSERT INTO planning_one_c_resources(responsibility_scope_id,kind,local_id,source_ref,label,registration,active)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(responsibility_scope_id,kind,local_id)
          DO UPDATE SET label=excluded.label,registration=excluded.registration,active=excluded.active`,[scope,kind,id,record.Ref_Key,record.Description,record.ГосНомер||'',record.Активен===true]);
      }
      result.scopes.push({id:scope,name:source.Description});
    }
    await client.query('COMMIT'); return result;
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
if(require.main===module) (async()=>{const {openAdminPool}=require('../local-app/runtime.cjs');const pool=await openAdminPool();try{console.log(JSON.stringify(await importCatalogs(pool),null,2));}finally{await pool.end();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={importCatalogs,localId};
