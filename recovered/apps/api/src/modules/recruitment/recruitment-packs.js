// SPDX-License-Identifier: MIT
'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {uuid,choice,fail,forbidden,conflict}=require('./recruitment-input');
const {fieldsOnly,object,version}=require('./onboarding-input');
const input=require('./contracts-input');
const MANAGERS=['manager','access_admin'];
const day=value=>value instanceof Date?value.toISOString().slice(0,10):value;
const canonical=value=>Array.isArray(value)?value.map(canonical):value && typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const catalog=()=>require('./contract-catalog.json').templates;
const settingField=id=>/^(company_|signer_)/.test(id) || id==='city';
function derivedValues(values,fields,kind) {
  if(fields.some(f=>f.id==='short_name') && !values.short_name && values.full_name) {
    const parts=values.full_name.trim().split(/\s+/);
    values.short_name=parts[0]+(parts.length>1?' '+parts.slice(1,3).map(part=>Array.from(part)[0]+'.').join(''):'');
  }
  if(kind==='employee' && fields.some(f=>f.id==='subject_status') && !values.subject_status)values.subject_status='Работник';
  return values;
}
const packSummary=row=>({id:row.id,kind:row.kind,responsibilityScopeId:row.responsibility_scope_id,candidateId:row.candidate_id,
  onboardingSessionId:row.onboarding_session_id,number:row.number,date:day(row.document_date),documentCount:row.document_count,createdBy:row.created_by,createdAt:row.created_at});
function matchesKind(row,snapshot,kind) {
  return row.pack_kind?row.pack_kind===kind:snapshot.employmentType==='any' || (kind==='employee'?snapshot.employmentType==='employee':['ip','self_employed'].includes(snapshot.employmentType));
}
function templateJson(row) {
  return {id:row.id,version:row.published_version,publishedVersion:row.published_version,...row.snapshot,
    catalogKey:row.catalog_key || null,kind:row.pack_kind || null,category:row.pack_metadata?.category || 'optional',
    defaultSelected:row.pack_metadata?.defaultSelected===true,source:row.pack_metadata?.source || null,notes:row.pack_metadata?.notes || []};
}
function attachPackMethods(Service,{DOCUMENT_SELECT}) {
  Object.assign(Service.prototype,{
    async nextPackNumber(client,scopeId,kind,documentDate) {
      const year=Number(documentDate.slice(0,4));
      for(let attempt=0;attempt<10000;attempt++) {
        const serial=(await client.query(`INSERT INTO recruitment_contract_pack_sequences(responsibility_scope_id,kind,year,next_number) VALUES($1,$2,$3,1)
          ON CONFLICT(responsibility_scope_id,kind,year) DO UPDATE SET next_number=recruitment_contract_pack_sequences.next_number+1 RETURNING next_number`,[scopeId,kind,year])).rows[0].next_number;
        const number=`${kind==='employee'?'ТК':'ПР'}-${year}-${String(serial).padStart(5,'0')}`;
        const taken=(await client.query('SELECT 1 FROM recruitment_contract_documents WHERE responsibility_scope_id=$1 AND number=$2 LIMIT 1',[scopeId,number])).rowCount;
        if(!taken)return number;
      }
      fail('Не удалось подобрать следующий номер. Укажите номер договора вручную.');
    },
    async installDriverOnboarding(client,actor,scope) {
      const builtin=require('./onboarding-driver-template');
      const existing=(await client.query('SELECT id FROM recruitment_onboarding_templates WHERE responsibility_scope_id=$1 AND source_catalog_key=$2',[scope.responsibilityScopeId,builtin.key])).rows[0];
      if(existing)return existing.id;
      const id=randomUUID(),data=require('./onboarding-input').templateInput({...builtin,id,version:0,responsibilityScopeId:scope.responsibilityScopeId});
      await client.query(`INSERT INTO recruitment_onboarding_templates(id,responsibility_scope_id,legal_entity_id,name,destination,employment_type,description,privacy_notice,fields,documents,active,created_by,source_catalog_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,scope.responsibilityScopeId,scope.legalEntityId,data.name,data.destination,data.employmentType,data.description,data.privacyNotice,JSON.stringify(data.fields),JSON.stringify(data.documents),data.active,actor.id,builtin.key]);
      await this.audit.append(client,{actorId:actor.id,channel:actor.channel,correlationId:randomUUID(),action:'recruitment.onboarding.template.saved',entityType:'recruitment_onboarding_template',entityId:id,
        scope:{legalEntityId:scope.legalEntityId,responsibilityScopeId:scope.responsibilityScopeId},metadata:{version:1,active:true,sourceCatalogKey:builtin.key}});
      return id;
    },
    async packSettings(client,scopeId) {
      const row=(await client.query('SELECT field_values,version FROM recruitment_contract_pack_settings WHERE responsibility_scope_id=$1',[scopeId])).rows[0];
      return row?{version:row.version,values:row.field_values}:{version:0,values:{}};
    },
    async savePackSettings(supplied,body) {
      fieldsOnly(body,['responsibilityScopeId','version','values']);
      const scopeId=uuid(body.responsibilityScopeId),requestedVersion=version(body.version);object(body.values);
      if(Object.keys(body.values).some(id=>!settingField(id)))fail('В настройках организации допустимы только её реквизиты, подписант и город.');
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);this.manage(actor);
        const scope=this.scope(actor,scopeId);await this.recruitment.lockScope(client,scope);
        const before=await this.packSettings(client,scopeId);
        if(before.version!==requestedVersion)conflict();
        const templates=(await client.query(`SELECT t.id,v.snapshot FROM recruitment_contract_templates t
          JOIN recruitment_contract_template_versions v ON v.template_id=t.id AND v.edition=t.published_version
          WHERE t.responsibility_scope_id=$1 AND t.deleted_at IS NULL`,[scopeId])).rows.map(row=>({id:row.id,fields:row.snapshot.fields.filter(field=>Object.hasOwn(body.values,field.id))}));
        const merged=input.mergeFields(templates);
        if(merged.conflicts.some(c=>c.type==='type'))fail('Для реквизитов организации заданы разные типы полей. Исправьте шаблоны.');
        const values={...before.values,...input.values(body.values,merged.fields)};
        await client.query(`INSERT INTO recruitment_contract_pack_settings(responsibility_scope_id,legal_entity_id,field_values,updated_by)
          VALUES($1,$2,$3,$4) ON CONFLICT(responsibility_scope_id) DO UPDATE SET field_values=EXCLUDED.field_values,version=recruitment_contract_pack_settings.version+1,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp()`,[scopeId,scope.legalEntityId,JSON.stringify(values),actor.id]);
        await this.audit.append(client,{actorId:actor.id,channel:actor.channel,correlationId:randomUUID(),action:'recruitment.contract.pack.settings.saved',entityType:'recruitment_contract_pack_settings',entityId:scopeId,
          scope:{legalEntityId:scope.legalEntityId,responsibilityScopeId:scopeId},metadata:{version:before.version+1,fieldCount:Object.keys(values).length}});
        return {responsibilityScopeId:scopeId,...await this.packSettings(client,scopeId)};
      });
    },
    async packSource(client,actor,scope,candidateId,sessionId) {
      let sourceValues={};
      if(sessionId) {
        const session=(await client.query('SELECT * FROM recruitment_onboarding_sessions WHERE id=$1 FOR SHARE',[sessionId])).rows[0];
        if(!session || session.legal_entity_id!==scope.legalEntityId)forbidden('Анкета недоступна в компании комплекта.');
        this.scope(actor,session.responsibility_scope_id);
        if(!MANAGERS.includes(actor.role) && session.created_by!==actor.id)forbidden('Можно использовать только свои анкеты.');
        if(candidateId && session.candidate_id && candidateId!==session.candidate_id)fail('Анкета принадлежит другому кандидату.');
        candidateId=candidateId || session.candidate_id;
        sourceValues=session.field_values || {};
      }
      if(candidateId) {
        const candidate=(await client.query('SELECT full_name,phone,city FROM recruitment_candidates WHERE id=$1 AND legal_entity_id=$2 AND NOT archived FOR SHARE',[candidateId,scope.legalEntityId])).rows[0];
        if(!candidate)fail('Выберите действующего кандидата компании комплекта.');
        sourceValues={full_name:candidate.full_name,phone:candidate.phone,city:candidate.city,...sourceValues};
      }
      return {candidateId,sourceValues:{...sourceValues,company_name:scope.legalEntityName || ''}};
    },
    packPrefill(fields,sourceValues,kind=null) {
      const values={};
      for(const field of fields) {
        try {values[field.id]=input.values({[field.id]:Object.hasOwn(sourceValues,field.id)?sourceValues[field.id]:field.defaultValue},[field])[field.id];}
        catch {values[field.id]='';}
      }
      return derivedValues(values,fields,kind);
    },
    async packCatalog(supplied,query={}) {
      fieldsOnly(query,['responsibilityScopeId','kind','candidateId','onboardingSessionId','templateIds']);
      const scopeId=uuid(query.responsibilityScopeId),kind=choice(query.kind,['employee','carrier'],'тип комплекта');
      const candidateId=query.candidateId?uuid(query.candidateId):null,sessionId=query.onboardingSessionId?uuid(query.onboardingSessionId):null;
      if(query.templateIds!==undefined && typeof query.templateIds!=='string')fail('Проверьте выбранные шаблоны.');
      const requested=query.templateIds===undefined?null:input.packSelection(query.templateIds?query.templateIds.split(','):[],false);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),scope=this.scope(actor,scopeId);
        const rows=(await client.query(`SELECT t.*,v.snapshot FROM recruitment_contract_templates t
          JOIN recruitment_contract_template_versions v ON v.template_id=t.id AND v.edition=t.published_version
          WHERE t.responsibility_scope_id=$1 AND t.deleted_at IS NULL ORDER BY t.created_at,t.id LIMIT 1001`,[scopeId])).rows;
        if(rows.length>1000)fail('В области слишком много шаблонов для одного комплекта.');
        const templates=rows.filter(row=>matchesKind(row,row.snapshot,kind)).map(templateJson);
        const selectedTemplateIds=requested || templates.filter(t=>t.defaultSelected).map(t=>t.id);
        if(selectedTemplateIds.some(id=>!templates.some(t=>t.id===id)))fail('Один из выбранных шаблонов больше недоступен. Обновите комплект.');
        const {fields,conflicts}=input.mergeFields(selectedTemplateIds.map(id=>templates.find(t=>t.id===id)));
        const source=await this.packSource(client,actor,scope,candidateId,sessionId);
        const settings=await this.packSettings(client,scopeId),available=catalog().filter(t=>t.kind===kind);
        const installed=(await client.query('SELECT catalog_key FROM recruitment_contract_templates WHERE responsibility_scope_id=$1 AND pack_kind=$2 AND catalog_key IS NOT NULL',[scopeId,kind])).rows;
        return {responsibilityScopeId:scopeId,kind,templates,selectedTemplateIds,fields,conflicts,values:this.packPrefill(fields,{...source.sourceValues,...settings.values},kind),settings,
          candidateId:source.candidateId,onboardingSessionId:sessionId,canInstall:MANAGERS.includes(actor.role),canManageSettings:MANAGERS.includes(actor.role),installedCount:installed.length,availableCount:available.length};
      });
    },
    async installPackCatalog(supplied,body) {
      fieldsOnly(body,['responsibilityScopeId','kind']);
      const scopeId=uuid(body.responsibilityScopeId),kind=body.kind===undefined?null:choice(body.kind,['employee','carrier'],'тип комплекта');
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);this.manage(actor);
        const scope=this.scope(actor,scopeId);await this.recruitment.lockScope(client,scope);
        const entries=catalog().filter(t=>!kind || t.kind===kind),inserted=[];
        for(const entry of entries) {
          const existing=(await client.query('SELECT id FROM recruitment_contract_templates WHERE responsibility_scope_id=$1 AND catalog_key=$2',[scopeId,entry.key])).rows[0];
          if(existing)continue;
          const id=randomUUID(),parsed=input.template({id,version:0,responsibilityScopeId:scopeId,state:'published',name:entry.name,employmentType:entry.employmentType,text:entry.text,fields:entry.fields});
          const metadata={category:entry.category,defaultSelected:entry.defaultSelected===true,source:entry.source,notes:entry.notes || []};
          const snapshot={...parsed.snapshot,catalogKey:entry.key,kind:entry.kind,...metadata};
          await client.query(`INSERT INTO recruitment_contract_templates(id,responsibility_scope_id,legal_entity_id,draft,created_by,catalog_key,pack_kind,pack_metadata)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,scopeId,scope.legalEntityId,JSON.stringify(snapshot),actor.id,entry.key,entry.kind,JSON.stringify(metadata)]);
          const row=await this.templateRow(client,actor,id,true);
          await this.publish(client,actor,row,snapshot);
          inserted.push(id);
        }
        const onboardingTemplateId=!kind || kind==='employee'?await this.installDriverOnboarding(client,actor,scope):null;
        return {responsibilityScopeId:scopeId,kind,installedCount:inserted.length,existingCount:entries.length-inserted.length,templateIds:inserted,onboardingTemplateId};
      });
    },
    async packJson(client,actor,row) {
      const documents=(await client.query(`SELECT ${DOCUMENT_SELECT} WHERE d.pack_id=$1 AND d.deleted_at IS NULL ORDER BY d.pack_position`,[row.id])).rows;
      return {...packSummary(row),deletedDocumentCount:row.document_count-documents.length,documents:documents.map(document=>this.documentJson(document,true,actor))};
    },
    async packRow(client,actor,id) {
      const row=(await client.query("SELECT *,to_char(document_date,'YYYY-MM-DD') AS document_date FROM recruitment_contract_packs WHERE id=$1",[uuid(id)])).rows[0];
      if(!row)forbidden('Комплект недоступен.');
      this.scope(actor,row.responsibility_scope_id);
      if(!MANAGERS.includes(actor.role) && row.created_by!==actor.id)forbidden('Доступны только ваши комплекты.');
      return row;
    },
    async readPack(supplied,id) {
      return this.database.transaction(async client=>{const actor=await this.current(client,supplied);return this.packJson(client,actor,await this.packRow(client,actor,id));});
    },
    async listPacks(client,actor) {
      const rows=(await client.query(`SELECT *,to_char(document_date,'YYYY-MM-DD') AS document_date FROM recruitment_contract_packs
        WHERE legal_entity_id=ANY($1::uuid[]) AND ($2 OR created_by=$3) ORDER BY created_at DESC,id LIMIT 1001`,[[...new Set(actor.grants.map(g=>g.legalEntityId))],MANAGERS.includes(actor.role),actor.id])).rows;
      return {packs:rows.slice(0,1000).map(packSummary),packsTruncated:rows.length>1000};
    },
    async createPack(supplied,body) {
      const data=input.pack(body),requestHash=createHash('sha256').update(JSON.stringify(canonical(data))).digest('hex');
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),scope=this.scope(actor,data.responsibilityScopeId);
        // Serialize same-key requests before checking their committed result.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042025))',[`contract-pack:${actor.id}:${data.idempotencyKey}`]);
        const existing=(await client.query('SELECT id,request_hash FROM recruitment_contract_packs WHERE created_by=$1 AND idempotency_key=$2',[actor.id,data.idempotencyKey])).rows[0];
        if(existing) {
          if(existing.request_hash!==requestHash)conflict('Этот ключ выпуска уже использован для другого комплекта. Обновите форму.');
          return this.packJson(client,actor,await this.packRow(client,actor,existing.id));
        }
        await this.recruitment.lockScope(client,scope);
        const selected=new Map();
        for(const id of [...data.templateIds].sort()) {
          const row=await this.templateRow(client,actor,id,true);
          if(row.responsibility_scope_id!==scope.responsibilityScopeId)fail('Все шаблоны комплекта должны относиться к выбранной области.');
          if(!row.published_version)fail('Опубликуйте все шаблоны перед выпуском комплекта.');
          if(row.published_version!==data.templateVersions[id])conflict('Один из шаблонов переиздан. Обновите комплект и проверьте текст перед выпуском.');
          const snapshot=(await client.query('SELECT snapshot FROM recruitment_contract_template_versions WHERE template_id=$1 AND edition=$2',[id,row.published_version])).rows[0].snapshot;
          if(!matchesKind(row,snapshot,data.kind))fail('Шаблон относится к другому типу оформления.');
          selected.set(id,{row,snapshot});
        }
        const templates=data.templateIds.map(id=>({id,...selected.get(id).snapshot})),merged=input.mergeFields(templates);
        if(merged.conflicts.some(c=>c.type==='type'))fail('В выбранных шаблонах разные типы одного поля. Исправьте шаблоны в конструкторе.');
        if(merged.conflicts.some(c=>c.type==='default' && !Object.hasOwn(data.values,c.fieldId)))fail('Уточните поля с разными значениями по умолчанию.');
        const source=await this.packSource(client,actor,scope,data.candidateId,data.onboardingSessionId);
        const settings=await this.packSettings(client,scope.responsibilityScopeId);
        const proposed=input.values({...this.packPrefill(merged.fields,{...source.sourceValues,...settings.values},data.kind),...data.values},merged.fields);
        const values=input.values(derivedValues(proposed,merged.fields,data.kind),merged.fields,true);
        input.validateDates(values,merged.fields,data.date);
        const number=data.number || await this.nextPackNumber(client,scope.responsibilityScopeId,data.kind,data.date);
        if((await client.query('SELECT 1 FROM recruitment_contract_packs WHERE responsibility_scope_id=$1 AND kind=$2 AND number=$3',[scope.responsibilityScopeId,data.kind,number])).rowCount)conflict('Комплект с таким номером договора уже выпущен. Укажите другой номер или оставьте поле пустым для автоматической нумерации.');
        // Validate every document before inserting any. The transaction also
        // rolls back the entire pack if persistence or audit append later fails.
        const documents=templates.map(template=>{
          const text=input.content(template.text,template.fields);
          const documentValues=input.values(Object.fromEntries(template.fields.map(field=>[field.id,values[field.id]])),template.fields,true);
          input.validateDates(documentValues,template.fields,data.date);
          return {template,text,values:documentValues,rendered:input.render(text,documentValues,number,data.date,template.fields)};
        });
        const id=randomUUID();
        await client.query(`INSERT INTO recruitment_contract_packs(id,responsibility_scope_id,legal_entity_id,kind,candidate_id,onboarding_session_id,number,document_date,document_count,idempotency_key,request_hash,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,scope.responsibilityScopeId,scope.legalEntityId,data.kind,source.candidateId,data.onboardingSessionId,number,data.date,documents.length,data.idempotencyKey,requestHash,actor.id]);
        for(const [index,document] of documents.entries()) {
          const documentId=randomUUID();
          await client.query(`INSERT INTO recruitment_contract_documents(id,template_id,responsibility_scope_id,legal_entity_id,template_snapshot,candidate_id,onboarding_session_id,content_text,field_values,number,document_date,rendered_text,status,issued_at,issued_by,created_by,pack_id,pack_position)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'issued',clock_timestamp(),$13,$13,$14,$15)`,
          [documentId,document.template.id,scope.responsibilityScopeId,scope.legalEntityId,JSON.stringify(document.template),source.candidateId,data.onboardingSessionId,document.text,JSON.stringify(document.values),number,data.date,document.rendered,actor.id,id,index+1]);
          await this.append(client,actor,{id:documentId,responsibility_scope_id:scope.responsibilityScopeId,legal_entity_id:scope.legalEntityId},'issued',{packId:id,templateId:document.template.id,templateVersion:document.template.version,version:1});
        }
        await this.audit.append(client,{actorId:actor.id,channel:actor.channel,correlationId:randomUUID(),action:'recruitment.contract.pack.issued',entityType:'recruitment_contract_pack',entityId:id,
          scope:{legalEntityId:scope.legalEntityId,responsibilityScopeId:scope.responsibilityScopeId},metadata:{kind:data.kind,documentCount:documents.length}});
        return this.packJson(client,actor,await this.packRow(client,actor,id));
      });
    }
  });
}
module.exports={attachPackMethods};
