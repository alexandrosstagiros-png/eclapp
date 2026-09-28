// SPDX-License-Identifier: MIT
'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { Injectable, Inject, Controller, Get, Put, Post, Body, Param, Query, Res, Header, HttpCode, UseGuards } = require('@nestjs/common');
const { DatabaseService } = require('../../platform/database.service');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { AuditService } = require('../audit/application/audit.service');
const { uuid, string, date, fail, forbidden, conflict } = require('./recruitment-input');
const { fieldsOnly, version } = require('./onboarding-input');
const input = require('./contracts-input');
const {attachPackMethods} = require('./recruitment-packs');
const MANAGERS=['manager','access_admin'];
const ORGANIZERS=['manager','access_admin','recruiter'];
function deletedQuery(query={}) {
  fieldsOnly(query,['deleted']);
  if(query.deleted!==undefined && !['true','false'].includes(query.deleted))fail('Проверьте выбор удалённых записей.');
  return query.deleted==='true';
}
const day=value=>value instanceof Date?value.toISOString().slice(0,10):value;
const DOCUMENT_SELECT=`d.*,to_char(d.document_date,'YYYY-MM-DD') AS document_date,to_char(d.signed_date,'YYYY-MM-DD') AS signed_date,
 c.full_name AS candidate_name,f.mime_type,f.file_name,f.byte_size,f.sha256,f.uploaded_at
 FROM recruitment_contract_documents d LEFT JOIN recruitment_candidates c ON c.id=d.candidate_id
 LEFT JOIN recruitment_contract_signed_files f ON f.document_id=d.id`;
const DOCUMENT_SUMMARY=DOCUMENT_SELECT.replace('d.*,',`d.id,d.version,d.responsibility_scope_id,d.legal_entity_id,d.template_id,d.candidate_id,d.onboarding_session_id,d.source_document_id,
 d.number,d.status,d.created_by,d.created_at,d.updated_at,d.issued_at,d.deleted_at,d.deleted_by,d.pack_id,d.pack_position,
 jsonb_build_object('name',d.template_snapshot->>'name','version',d.template_snapshot->'version') AS template_snapshot,`);
function createContractComponents(RecruitmentService) {
  class ContractService {
    constructor(database,recruitment,audit){Object.assign(this,{database,recruitment,audit});}
    async current(client,supplied) {
      const actor=await this.recruitment.current(client,supplied);
      if(actor.role==='external_recruiter' || !actor.grants.length)forbidden('Договоры доступны внутренним сотрудникам с доступом к персональным данным.');
      return actor;
    }
    scope(actor,id){return this.recruitment.scope(actor,id);}
    manage(actor){if(!MANAGERS.includes(actor.role))forbidden('Шаблоны договоров редактирует руководитель или администратор.');}
    canEditTemplate(actor,row){return MANAGERS.includes(actor.role) || (actor.role==='recruiter' && row.created_by===actor.id);}
    organize(actor){if(!ORGANIZERS.includes(actor.role))forbidden('Удаление и восстановление доступны рекрутеру, руководителю и администратору.');}
    templateCapabilities(actor,row) {
      const capable=ORGANIZERS.includes(actor.role);
      return {createdBy:row.created_by,deletedAt:row.deleted_at,deletedBy:row.deleted_by,canEdit:!row.deleted_at && this.canEditTemplate(actor,row),canDelete:!row.deleted_at && capable,canRestore:!!row.deleted_at && capable};
    }
    async append(client,actor,row,action,metadata={}) {
      await this.audit.append(client,{actorId:actor.id,channel:actor.channel,correlationId:randomUUID(),action:`recruitment.contract.${action}`,
        entityType:action.startsWith('template.')?'recruitment_contract_template':'recruitment_contract_document',entityId:row.id,
        scope:{legalEntityId:row.legal_entity_id,responsibilityScopeId:row.responsibility_scope_id},metadata});
    }
    async templateRow(client,actor,id,lock=false,includeDeleted=false) {
      const row=(await client.query(`SELECT * FROM recruitment_contract_templates WHERE id=$1 ${lock?'FOR UPDATE':''}`,[uuid(id)])).rows[0];
      if(!row)forbidden('Шаблон недоступен.');
      this.scope(actor,row.responsibility_scope_id);
      if(!this.canEditTemplate(actor,row) && !row.published_version)forbidden('Шаблон ещё не опубликован.');
      if(row.deleted_at && !includeDeleted)forbidden('Шаблон удалён. Сначала восстановите его из корзины.');
      return row;
    }
    async templateJson(client,actor,row) {
      const versions=(await client.query('SELECT edition AS version,snapshot,published_at AS "publishedAt" FROM recruitment_contract_template_versions WHERE template_id=$1 ORDER BY edition DESC',[row.id])).rows.map(v=>({...v.snapshot,version:v.version,publishedAt:v.publishedAt}));
      const published=versions.find(v=>v.version===row.published_version)||null;
      const draft=this.canEditTemplate(actor,row)?row.draft:null;
      const current=draft || published;
      return {id:row.id,version:row.version,responsibilityScopeId:row.responsibility_scope_id,name:current?.name || '',employmentType:current?.employmentType || '',
        hasDraft:!!draft,publishedVersion:row.published_version,draft,published,versions,createdAt:row.created_at,updatedAt:row.updated_at,
        catalogKey:row.catalog_key || null,kind:row.pack_kind || null,packMetadata:row.pack_metadata || {},...this.templateCapabilities(actor,row)};
    }
    async documentRow(client,actor,id,lock=false,includeDeleted=false) {
      const row=(await client.query(`SELECT ${DOCUMENT_SELECT} WHERE d.id=$1 ${lock?'FOR UPDATE OF d':''}`,[uuid(id)])).rows[0];
      if(!row)forbidden('Договор недоступен.');
      this.scope(actor,row.responsibility_scope_id);
      if(!MANAGERS.includes(actor.role) && row.created_by!==actor.id)forbidden('Доступны только ваши договоры.');
      if(row.deleted_at && !includeDeleted)forbidden('Договор удалён. Сначала восстановите его из корзины.');
      return row;
    }
    documentJson(row,detail=true,actor=null) {
      const result={id:row.id,version:row.version,responsibilityScopeId:row.responsibility_scope_id,templateId:row.template_id,
        templateName:row.template_snapshot.name,templateVersion:row.template_snapshot.version,candidateId:row.candidate_id,candidateName:row.candidate_name || '',
        onboardingSessionId:row.onboarding_session_id,sourceDocumentId:row.source_document_id,packId:row.pack_id || null,packPosition:row.pack_position || null,number:row.number,date:day(row.document_date),status:row.status,
        createdBy:row.created_by,createdAt:row.created_at,updatedAt:row.updated_at,issuedAt:row.issued_at,signedDate:day(row.signed_date),
        signedFile:row.mime_type?{mimeType:row.mime_type,fileName:row.file_name,byteSize:row.byte_size,sha256:row.sha256,uploadedAt:row.uploaded_at}:null,
        deletedAt:row.deleted_at,deletedBy:row.deleted_by,canEdit:!row.deleted_at && row.status==='draft',
        canDelete:!row.deleted_at && !!actor && ORGANIZERS.includes(actor.role),canRestore:!!row.deleted_at && !!actor && ORGANIZERS.includes(actor.role),
        canRestoreTemplate:!row.deleted_at && !!actor && ORGANIZERS.includes(actor.role)};
      if(detail)Object.assign(result,{text:row.content_text,values:row.field_values,templateSnapshot:row.template_snapshot,
        renderedText:row.status==='draft'?input.render(row.content_text,row.field_values,row.number,day(row.document_date),row.template_snapshot.fields):row.rendered_text});
      return result;
    }
    async context(supplied,query={}) {
      const deleted=deletedQuery(query);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),manager=MANAGERS.includes(actor.role),companies=[...new Set(actor.grants.map(g=>g.legalEntityId))];
        const rows=(await client.query(`SELECT t.id,t.version,t.responsibility_scope_id AS "responsibilityScopeId",t.published_version AS "publishedVersion",
          t.created_by AS "createdBy",t.deleted_at AS "deletedAt",t.deleted_by AS "deletedBy",
          (NOT $4 AND ($2 OR ($5 AND t.created_by=$3))) AS "canEdit",(NOT $4 AND $6) AS "canDelete",($4 AND $6) AS "canRestore",
          (CASE WHEN $2 OR ($5 AND t.created_by=$3) THEN t.draft ELSE NULL END IS NOT NULL) AS "hasDraft",
          v.snapshot->>'name' AS "publishedName",v.snapshot->>'employmentType' AS "publishedEmploymentType",
          COALESCE(CASE WHEN $2 OR ($5 AND t.created_by=$3) THEN t.draft->>'name' END,v.snapshot->>'name','') AS name,
          COALESCE(CASE WHEN $2 OR ($5 AND t.created_by=$3) THEN t.draft->>'employmentType' END,v.snapshot->>'employmentType','') AS "employmentType",t.updated_at AS "updatedAt"
          FROM recruitment_contract_templates t LEFT JOIN recruitment_contract_template_versions v ON v.template_id=t.id AND v.edition=t.published_version
          WHERE t.legal_entity_id=ANY($1::uuid[]) AND ($2 OR t.published_version>0 OR ($5 AND t.created_by=$3)) AND (t.deleted_at IS NOT NULL)=$4
          ORDER BY t.updated_at DESC,t.id LIMIT 1001`,[companies,manager,actor.id,deleted,actor.role==='recruiter',ORGANIZERS.includes(actor.role)])).rows;
        const documents=(await client.query(`SELECT ${DOCUMENT_SUMMARY} WHERE d.legal_entity_id=ANY($1::uuid[]) AND ($2 OR d.created_by=$3)
          AND (d.deleted_at IS NOT NULL)=$4 ORDER BY d.updated_at DESC,d.id LIMIT 1001`,[companies,manager,actor.id,deleted])).rows;
        const packs=deleted?{packs:[],packsTruncated:false}:await this.listPacks(client,actor);
        return {templates:rows.slice(0,1000),documents:documents.slice(0,1000).map(row=>this.documentJson(row,false,actor)),...packs,canManageTemplates:manager,canAccessTemplates:ORGANIZERS.includes(actor.role),deleted,truncated:rows.length>1000 || documents.length>1000 || packs.packsTruncated};
      });
    }
    async readTemplate(supplied,id,query={}){const deleted=deletedQuery(query);return this.database.transaction(async client=>{const actor=await this.current(client,supplied);return this.templateJson(client,actor,await this.templateRow(client,actor,id,false,deleted));});}
    async publish(client,actor,row,snapshot) {
      if(!snapshot)fail('Сначала сохраните изменения в черновике шаблона.');
      input.content(snapshot.text,snapshot.fields);
      const edition=row.published_version+1;
      const saved={...snapshot,id:row.id,version:edition,responsibilityScopeId:row.responsibility_scope_id};
      await client.query('INSERT INTO recruitment_contract_template_versions(template_id,edition,snapshot,published_by) VALUES($1,$2,$3,$4)',[row.id,edition,JSON.stringify(saved),actor.id]);
      await client.query('UPDATE recruitment_contract_templates SET draft=NULL,published_version=$2 WHERE id=$1',[row.id,edition]);
      await this.append(client,actor,row,'template.published',{edition});
    }
    async saveTemplate(supplied,body) {
      const data=input.template(body);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);
        const scope=this.scope(actor,data.responsibilityScopeId);await this.recruitment.lockScope(client,scope);
        let row=(await client.query('SELECT * FROM recruitment_contract_templates WHERE id=$1 FOR UPDATE',[data.id])).rows[0];
        if(row) {
          this.scope(actor,row.responsibility_scope_id);
          if(!this.canEditTemplate(actor,row))forbidden('Можно редактировать только собственные восстановленные шаблоны.');
          if(row.deleted_at)conflict('Сначала восстановите шаблон из корзины.');
          if(row.responsibility_scope_id!==data.responsibilityScopeId)fail('Область существующего шаблона нельзя изменить. Создайте новый шаблон.');
          if(row.version!==data.version)conflict();
          if(row.catalog_key)Object.assign(data.snapshot,{catalogKey:row.catalog_key,kind:row.pack_kind,...row.pack_metadata});
          await client.query('UPDATE recruitment_contract_templates SET draft=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[row.id,JSON.stringify(data.snapshot)]);
        } else {
          this.manage(actor);
          if(data.version!==0)conflict();
          await client.query('INSERT INTO recruitment_contract_templates(id,responsibility_scope_id,legal_entity_id,draft,created_by) VALUES($1,$2,$3,$4,$5)',[data.id,scope.responsibilityScopeId,scope.legalEntityId,JSON.stringify(data.snapshot),actor.id]);
          row=await this.templateRow(client,actor,data.id,true);
        }
        if(data.state==='published')await this.publish(client,actor,row,data.snapshot);
        else await this.append(client,actor,row,'template.saved',{version:data.version+1});
        return this.templateJson(client,actor,await this.templateRow(client,actor,data.id));
      });
    }
    async publishTemplate(supplied,id,body) {
      fieldsOnly(body,['version']);version(body.version);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);
        const row=await this.templateRow(client,actor,id,true);
        if(!this.canEditTemplate(actor,row))forbidden('Можно публиковать только собственные восстановленные шаблоны.');
        if(row.version!==body.version)conflict();
        await this.publish(client,actor,row,row.draft);
        await client.query('UPDATE recruitment_contract_templates SET version=version+1,updated_at=clock_timestamp() WHERE id=$1',[row.id]);
        return this.templateJson(client,actor,await this.templateRow(client,actor,id));
      });
    }
    async createDocument(supplied,body) {
      fieldsOnly(body,['templateId','candidateId','onboardingSessionId','sourceDocumentId']);
      if(body.sourceDocumentId && (body.templateId || body.candidateId || body.onboardingSessionId))fail('Для копии договора передайте только исходный договор.');
      const sourceId=body.sourceDocumentId?uuid(body.sourceDocumentId):null;
      const templateId=sourceId?null:uuid(body.templateId);
      const sessionId=body.onboardingSessionId?uuid(body.onboardingSessionId):null;
      let candidateId=body.candidateId?uuid(body.candidateId):null;
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);let template,snapshot,scope,source=null,text,values={};
        if(sourceId) {
          source=await this.documentRow(client,actor,sourceId);
          scope=this.scope(actor,source.responsibility_scope_id);snapshot=source.template_snapshot;text=source.content_text;values=source.field_values;candidateId=source.candidate_id;
          template={id:source.template_id};
        } else {
          template=await this.templateRow(client,actor,templateId);
          scope=this.scope(actor,template.responsibility_scope_id);
          await this.recruitment.lockScope(client,scope);
          template=await this.templateRow(client,actor,templateId,true);
          if(!template.published_version)fail('Опубликуйте шаблон перед созданием договора.');
          snapshot=(await client.query('SELECT snapshot FROM recruitment_contract_template_versions WHERE template_id=$1 AND edition=$2',[template.id,template.published_version])).rows[0].snapshot;
          text=snapshot.text;
        }
        if(source)await this.recruitment.lockScope(client,scope);
        if(!source) {
          let sourceValues={};
          if(sessionId) {
            const session=(await client.query('SELECT * FROM recruitment_onboarding_sessions WHERE id=$1 FOR SHARE',[sessionId])).rows[0];
            if(!session || session.legal_entity_id!==scope.legalEntityId)forbidden('Анкета недоступна в компании выбранного шаблона.');
            this.scope(actor,session.responsibility_scope_id);
            if(!MANAGERS.includes(actor.role) && session.created_by!==actor.id)forbidden('Можно использовать только свои анкеты.');
            if(candidateId && session.candidate_id && candidateId!==session.candidate_id)fail('Анкета принадлежит другому кандидату.');
            candidateId=candidateId || session.candidate_id;
            sourceValues=session.field_values;
          }
          if(candidateId) {
            const candidate=(await client.query('SELECT full_name,phone,city FROM recruitment_candidates WHERE id=$1 AND legal_entity_id=$2 AND NOT archived FOR SHARE',[candidateId,scope.legalEntityId])).rows[0];
            if(!candidate)fail('Выберите действующего кандидата компании шаблона.');
            sourceValues={full_name:candidate.full_name,phone:candidate.phone,city:candidate.city,...sourceValues};
          }
          sourceValues.company_name=scope.legalEntityName || '';
          // Prefill only declared fields; malformed historical values remain empty
          // and can be corrected explicitly in the draft editor.
          for(const field of snapshot.fields) {
            try {values[field.id]=input.values({[field.id]:Object.hasOwn(sourceValues,field.id)?sourceValues[field.id]:field.defaultValue},[field])[field.id];}
            catch {values[field.id]='';}
          }
        }
        const id=randomUUID();
        await client.query(`INSERT INTO recruitment_contract_documents(id,template_id,responsibility_scope_id,legal_entity_id,template_snapshot,candidate_id,onboarding_session_id,source_document_id,content_text,field_values,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,template.id,scope.responsibilityScopeId,scope.legalEntityId,JSON.stringify(snapshot),candidateId,source?source.onboarding_session_id:sessionId,sourceId,text,JSON.stringify(values),actor.id]);
        const row=await this.documentRow(client,actor,id);
        await this.append(client,actor,row,'created',{templateId:template.id,templateVersion:snapshot.version,sourceDocumentId:sourceId});
        return this.documentJson(row,true,actor);
      });
    }
    async readDocument(supplied,id,query={}){const deleted=deletedQuery(query);return this.database.transaction(async client=>{const actor=await this.current(client,supplied);return this.documentJson(await this.documentRow(client,actor,id,false,deleted),true,actor);});}
    editable(row,requestedVersion) {
      if(row.version!==requestedVersion)conflict();
      if(row.status!=='draft')conflict('Выпущенный договор нельзя изменять. Создайте новый черновик по его копии.');
    }
    async saveDocument(supplied,id,body) {
      fieldsOnly(body,['version','text','values','number','date']);version(body.version);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),row=await this.documentRow(client,actor,id,true);this.editable(row,body.version);
        const text=input.content(body.text,row.template_snapshot.fields),values=input.values(body.values,row.template_snapshot.fields),number=string(body.number,160,'номер договора'),documentDate=date(body.date);
        input.validateDates(values,row.template_snapshot.fields,documentDate);
        input.render(text,values,number,documentDate,row.template_snapshot.fields);
        await client.query('UPDATE recruitment_contract_documents SET content_text=$2,field_values=$3,number=$4,document_date=$5,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[row.id,text,JSON.stringify(values),number,documentDate]);
        await this.append(client,actor,row,'saved',{version:row.version+1});
        return this.documentJson(await this.documentRow(client,actor,id),true,actor);
      });
    }
    async issueDocument(supplied,id,body) {
      fieldsOnly(body,['version']);version(body.version);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),row=await this.documentRow(client,actor,id,true);this.editable(row,body.version);
        const text=input.content(row.content_text,row.template_snapshot.fields),values=input.values(row.field_values,row.template_snapshot.fields,true);
        string(row.number,160,'номер договора',true);date(day(row.document_date),true);
        input.validateDates(values,row.template_snapshot.fields,day(row.document_date));
        const rendered=input.render(text,values,row.number,day(row.document_date),row.template_snapshot.fields);
        await client.query("UPDATE recruitment_contract_documents SET rendered_text=$2,status='issued',issued_at=clock_timestamp(),issued_by=$3,version=version+1,updated_at=clock_timestamp() WHERE id=$1",[row.id,rendered,actor.id]);
        await this.append(client,actor,row,'issued',{version:row.version+1,templateVersion:row.template_snapshot.version});
        return this.documentJson(await this.documentRow(client,actor,id),true,actor);
      });
    }
    async signDocument(supplied,id,body) {
      fieldsOnly(body,['version','signedDate','mimeType','base64','fileName']);version(body.version);
      const signedDate=date(body.signedDate,true),file=input.signedFile(body);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),row=await this.documentRow(client,actor,id,true);
        if(row.version!==body.version)conflict();
        if(row.status!=='issued')conflict('Подписанный файл можно добавить только к выпущенному договору.');
        if(signedDate<day(row.document_date))fail('Дата подписания не может быть раньше даты договора.');
        const hash=createHash('sha256').update(file.buffer).digest('hex');
        await client.query('INSERT INTO recruitment_contract_signed_files(document_id,mime_type,file_name,byte_size,sha256,content,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.id,file.mimeType,file.fileName,file.buffer.length,hash,file.buffer,actor.id]);
        await client.query("UPDATE recruitment_contract_documents SET status='signed',signed_date=$2,signed_by=$3,version=version+1,updated_at=clock_timestamp() WHERE id=$1",[row.id,signedDate,actor.id]);
        await this.append(client,actor,row,'signed',{version:row.version+1,byteSize:file.buffer.length,mimeType:file.mimeType});
        return this.documentJson(await this.documentRow(client,actor,id),true,actor);
      });
    }
    async trash(supplied,id,body,kind,restore=false) {
      fieldsOnly(body,['version']);version(body.version);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);this.organize(actor);
        const isTemplate=kind==='template';
        const row=isTemplate?await this.templateRow(client,actor,id,true,true):await this.documentRow(client,actor,id,true,true);
        if(row.version!==body.version)conflict();
        if(restore?!row.deleted_at:!!row.deleted_at)conflict(restore?'Запись уже восстановлена.':'Запись уже удалена.');
        const table=isTemplate?'recruitment_contract_templates':'recruitment_contract_documents';
        await client.query(`UPDATE ${table} SET deleted_at=${restore?'NULL':'clock_timestamp()'},deleted_by=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1`,[row.id,restore?null:actor.id]);
        await this.append(client,actor,row,`${isTemplate?'template.':''}${restore?'restored':'deleted'}`,{version:row.version+1});
        return isTemplate?this.templateJson(client,actor,await this.templateRow(client,actor,id,false,true)):this.documentJson(await this.documentRow(client,actor,id,false,true),true,actor);
      });
    }
    async restoreTemplate(supplied,id,body) {
      fieldsOnly(body,['version','name']);version(body.version);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);this.organize(actor);
        const initial=await this.documentRow(client,actor,id);
        const scope=this.scope(actor,initial.responsibility_scope_id);
        await this.recruitment.lockScope(client,scope);
        const row=await this.documentRow(client,actor,id,true);
        if(row.version!==body.version)conflict();
        const snapshot=row.template_snapshot,newId=randomUUID();
        // Recover the original unfilled template, never a personalized contract.
        // Running the normal parser also excludes arbitrary snapshot metadata.
        const parsed=input.template({id:newId,version:0,responsibilityScopeId:row.responsibility_scope_id,state:'draft',
          name:body.name===undefined?`${snapshot.name.slice(0,140)} — восстановлен`:body.name,
          employmentType:snapshot.employmentType,text:snapshot.text,fields:snapshot.fields});
        await client.query('INSERT INTO recruitment_contract_templates(id,responsibility_scope_id,legal_entity_id,draft,created_by) VALUES($1,$2,$3,$4,$5)',[newId,row.responsibility_scope_id,row.legal_entity_id,JSON.stringify(parsed.snapshot),actor.id]);
        const recovered=await this.templateRow(client,actor,newId);
        await this.append(client,actor,recovered,'template.recovered',{sourceDocumentId:row.id,sourceTemplateId:row.template_id,sourceTemplateVersion:snapshot.version});
        return this.templateJson(client,actor,recovered);
      });
    }
    async signedFile(supplied,id) {
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),row=await this.documentRow(client,actor,id);
        if(row.status!=='signed')fail('Подписанный файл ещё не добавлен.');
        const file=(await client.query('SELECT content,mime_type,file_name FROM recruitment_contract_signed_files WHERE document_id=$1',[row.id])).rows[0];
        await this.append(client,actor,row,'file.downloaded');
        return file;
      });
    }
  }
  attachPackMethods(ContractService,{DOCUMENT_SELECT});
  Injectable()(ContractService);Inject(DatabaseService)(ContractService,undefined,0);Inject(RecruitmentService)(ContractService,undefined,1);Inject(AuditService)(ContractService,undefined,2);
  class ContractController {
    constructor(service){this.service=service;}
    context(actor,query){return this.service.context(actor,query);}
    packCatalog(actor,query){return this.service.packCatalog(actor,query);}
    installPackCatalog(actor,body){return this.service.installPackCatalog(actor,body);}
    savePackSettings(actor,body){return this.service.savePackSettings(actor,body);}
    createPack(actor,body){return this.service.createPack(actor,body);}
    readPack(actor,id){return this.service.readPack(actor,id);}
    template(actor,id,query){return this.service.readTemplate(actor,id,query);}
    saveTemplate(actor,body){return this.service.saveTemplate(actor,body);}
    publish(actor,id,body){return this.service.publishTemplate(actor,id,body);}
    create(actor,body){return this.service.createDocument(actor,body);}
    read(actor,id,query){return this.service.readDocument(actor,id,query);}
    save(actor,id,body){return this.service.saveDocument(actor,id,body);}
    issue(actor,id,body){return this.service.issueDocument(actor,id,body);}
    sign(actor,id,body){return this.service.signDocument(actor,id,body);}
    deleteTemplate(actor,id,body){return this.service.trash(actor,id,body,'template');}
    restoreDeletedTemplate(actor,id,body){return this.service.trash(actor,id,body,'template',true);}
    deleteDocument(actor,id,body){return this.service.trash(actor,id,body,'document');}
    restoreDocument(actor,id,body){return this.service.trash(actor,id,body,'document',true);}
    restoreTemplate(actor,id,body){return this.service.restoreTemplate(actor,id,body);}
    async file(actor,id,res) {
      const file=await this.service.signedFile(actor,id),extension={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[file.mime_type];
      res.set({'Content-Type':file.mime_type,'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff',
        'Content-Disposition':`attachment; filename="signed-contract.${extension}"; filename*=UTF-8''${encodeURIComponent(file.file_name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`});
      res.send(file.content);
    }
  }
  Inject(ContractService)(ContractController,undefined,0);Controller('recruitment/contracts')(ContractController);UseGuards(AuthGuard)(ContractController);
  for(const [name,method,route,bodyIndex] of [
    ['packCatalog',Get,'packs/catalog'],['installPackCatalog',Post,'packs/install',1],['savePackSettings',Put,'packs/settings',1],['createPack',Post,'packs',1],['readPack',Get,'packs/:id'],
    ['context',Get,'context'],['template',Get,'templates/:id'],['saveTemplate',Put,'templates',1],['publish',Post,'templates/:id/publish',2],
    ['create',Post,'documents',1],['read',Get,'documents/:id'],['save',Put,'documents/:id',2],['issue',Post,'documents/:id/issue',2],['sign',Post,'documents/:id/sign',2],['file',Get,'documents/:id/signed-file'],
    ['deleteTemplate',Post,'templates/:id/delete',2],['restoreDeletedTemplate',Post,'templates/:id/restore',2],
    ['deleteDocument',Post,'documents/:id/delete',2],['restoreDocument',Post,'documents/:id/restore',2],['restoreTemplate',Post,'documents/:id/restore-template',2]
  ]) {
    const d=Object.getOwnPropertyDescriptor(ContractController.prototype,name);method(route)(ContractController.prototype,name,d);
    Header('Cache-Control','no-store')(ContractController.prototype,name,d);HttpCode(200)(ContractController.prototype,name,d);CurrentActor()(ContractController.prototype,name,0);
    if(route.includes(':id'))Param('id')(ContractController.prototype,name,1);if(bodyIndex)Body()(ContractController.prototype,name,bodyIndex);
    if(name==='file')Res()(ContractController.prototype,name,2);
    if(['context','packCatalog'].includes(name))Query()(ContractController.prototype,name,1);
    if(['template','read'].includes(name))Query()(ContractController.prototype,name,2);
  }
  return {ContractService,ContractController};
}
module.exports={createContractComponents};
