// SPDX-License-Identifier: MIT
'use strict';
const {uuid,string,choice,fail,forbidden}=require('./recruitment-input');
const SUMMARY_COLUMNS=`responsibility_scope_id AS "responsibilityScopeId",id,source_key AS "sourceKey",source_sheet AS sheet,source_row AS row,
  full_name AS "fullName",phone,city,source_label AS source,recruiter_label AS recruiter,
  location_label AS location,candidate_id AS "candidateId",status,issues`;
function positive(value,fallback,maximum) {
  if(value==null || value==='') return fallback;
  const parsed=Number(value);
  if(!Number.isSafeInteger(parsed) || parsed<1 || parsed>maximum) fail('Проверьте номер и размер страницы.');
  return parsed;
}
function createImportRowMethods({tuple,whereScope,whereRead,response}) {
  return {
    async importRows(supplied,query={}) {
      const scopeId=query.responsibilityScopeId;
      const page=positive(query.page,1,100000),pageSize=positive(query.pageSize,50,100);
      const status=choice(query.status || 'all',['all','imported','review','archive'],'состояние строки');
      const sheet=string(query.sheet,100,'лист'),recruiter=string(query.recruiter,400,'рекрутер'),search=string(query.search,200,'поиск');
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);
        if(actor.role==='external_recruiter') forbidden('Исходные данные импорта доступны сотрудникам компании.');
        const scope=this.selection(actor,scopeId);
        await this.lockScope(client,scope);
        const values=[...tuple(scope)],bind=value=>{values.push(value);return `$${values.length}`;};
        const conditions=[whereRead(scope)];
        if(sheet) conditions.push(`source_sheet=${bind(sheet)}`);
        if(recruiter) conditions.push(`recruiter_label=${bind(recruiter)}`);
        if(search) {
          const pattern=bind(`%${search.replace(/[\\%_]/g,'\\$&')}%`);
          conditions.push(`(full_name ILIKE ${pattern} OR phone ILIKE ${pattern} OR city ILIKE ${pattern} OR location_label ILIKE ${pattern})`);
        }
        const where=conditions.join(' AND ');
        const counts=(await client.query(`SELECT count(*)::integer AS all,
          count(*) FILTER(WHERE status='imported')::integer AS imported,
          count(*) FILTER(WHERE status='review')::integer AS review,
          count(*) FILTER(WHERE status='archive')::integer AS archive
          FROM recruitment_import_rows WHERE ${where}`,values)).rows[0];
        const statusFilter=status==='all'?'':` AND status=${bind(status)}`;
        const rows=(await client.query(`SELECT ${SUMMARY_COLUMNS} FROM recruitment_import_rows WHERE ${where}${statusFilter}
          ORDER BY source_sheet,source_row,id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,pageSize,(page-1)*pageSize])).rows;
        const metadata=(await client.query(`SELECT CASE WHEN count(DISTINCT file_name)>1 THEN 'Несколько файлов' ELSE min(file_name) END AS "fileName",
          min(created_at) AS "importedAt" FROM recruitment_import_rows WHERE ${whereRead(scope)}`,tuple(scope))).rows[0];
        const sheets=(await client.query(`SELECT DISTINCT source_sheet AS name FROM recruitment_import_rows WHERE ${whereRead(scope)} ORDER BY source_sheet`,tuple(scope))).rows.map(row=>row.name);
        const recruiters=(await client.query(`SELECT DISTINCT recruiter_label AS name FROM recruitment_import_rows WHERE ${whereRead(scope)} AND recruiter_label<>'' ORDER BY recruiter_label LIMIT 1001`,tuple(scope))).rows;
        if(recruiters.length>1000) fail('Слишком много исходных имён рекрутеров. Уточните область импорта.');
        return {items:rows.map(response),page,pageSize,total:counts[status],counts,sheets,recruiters:recruiters.map(row=>row.name),...response(metadata)};
      });
    },
    async importRow(supplied,query={}) {
      const scopeId=query.responsibilityScopeId,id=uuid(query.id);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);
        if(actor.role==='external_recruiter') forbidden('Исходные данные импорта доступны сотрудникам компании.');
        const scope=await this.recordScope(client,actor,'importRows',id,scopeId);
        await this.lockScope(client,scope);
        const row=(await client.query(`SELECT ${SUMMARY_COLUMNS},fields,file_name AS "fileName" FROM recruitment_import_rows
          WHERE ${whereScope()} AND id=$5`,[...tuple(scope),id])).rows[0];
        if(!row) fail('Строка импорта недоступна в выбранной области.');
        const {fields,fileName,...item}=response(row);
        return {item,fields,fileName};
      });
    },
  };
}
module.exports={createImportRowMethods};
