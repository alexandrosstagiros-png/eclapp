// SPDX-License-Identifier: MIT
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { Injectable, Inject, Controller, Get, Put, Post, Body, Param, Req, Res, Header, HttpCode, UseGuards, GoneException, ServiceUnavailableException } = require('@nestjs/common');
const { Throttle } = require('@nestjs/throttler');
const { DatabaseService } = require('../../platform/database.service');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { AuditService } = require('../audit/application/audit.service');
const { uuid, fail, forbidden, conflict } = require('./recruitment-input');
const input = require('./onboarding-input');
const ocr = require('./onboarding-ocr');
const digest = value => createHash('sha256').update(value).digest('hex');
const MANAGERS = ['manager','access_admin'];
const TEMPLATE_COLUMNS = `id,version,responsibility_scope_id AS "responsibilityScopeId",name,destination,employment_type AS "employmentType",description,privacy_notice AS "privacyNotice",active,fields,documents,created_at AS "createdAt",updated_at AS "updatedAt"`;
const PHOTO_COLUMNS = `id,session_id AS "sessionId",document_id AS "documentId",document_type AS "documentType",label,mime_type AS "mimeType",byte_size AS "byteSize",uploaded_at AS "uploadedAt",expires_at AS "expiresAt",reviewed_at AS "reviewedAt",deleted_at AS "deletedAt",deletion_reason AS "deletionReason",ocr_status AS "ocrStatus"`;
const unavailable = () => { throw new GoneException({code:'RECRUITMENT_ONBOARDING_LINK_UNAVAILABLE',message:'Ссылка недоступна: она использована, отозвана или срок действия истёк. Обратитесь к рекрутеру.'}); };
const photoGone = () => { throw new GoneException({code:'RECRUITMENT_ONBOARDING_PHOTO_EXPIRED',message:'Фотография удалена или срок хранения истёк. При необходимости сделайте новый снимок.'}); };
function tokenHash(token) { if(typeof token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) unavailable(); return digest(token); }

function createOnboardingComponents(RecruitmentService) {
  class OnboardingService {
    constructor(database, recruitment, audit) {
      Object.assign(this,{database,recruitment,audit});
      this.directory = path.resolve(process.env.ONBOARDING_PHOTO_DIR || path.join(process.cwd(),'.local','onboarding-photos'));
      const relative=path.relative(process.cwd(),this.directory);
      if(process.env.NODE_ENV==='production' && (!process.env.ONBOARDING_PHOTO_DIR || (!relative.startsWith(`..${path.sep}`) && relative!=='..' && !path.isAbsolute(relative)))) this.directory=null;
      this.closing = false;
    }
    async onModuleInit() {
      // Existing installations can still run other modules before configuring
      // storage. Production must explicitly opt into a spool outside releases.
      if(!this.directory)return;
      await fs.mkdir(this.directory,{recursive:true,mode:0o700});
      await fs.chmod(this.directory,0o700);
      await this.cleanup().catch(()=>process.stderr.write('Onboarding temporary photo cleanup unavailable\n'));
      this.timer = setInterval(()=>{ if(!this.cleaning) this.cleanup().catch(()=>process.stderr.write('Onboarding temporary photo cleanup unavailable\n')); },60000);
      this.timer.unref();
    }
    async onModuleDestroy() { this.closing=true;clearInterval(this.timer);if(this.cleaning) await this.cleaning.catch(()=>{}); }
    photoPath(id) { return path.join(this.directory,`${uuid(id)}.bin`); }
    async removeFile(id) { await fs.rm(this.photoPath(id),{force:true}); }
    cleanup() {
      if(this.cleaning) return this.cleaning;
      this.cleaning = this.runCleanup().finally(()=>{this.cleaning=null;});
      return this.cleaning;
    }
    async runCleanup() {
      if(!this.directory)return;
      let failures=0;
      const expired=(await this.database.pool.query(`SELECT id FROM recruitment_onboarding_photos
        WHERE deleted_at IS NULL AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT 1000`)).rows;
      for(const item of expired) {
        if(this.closing)break;
        try {
          await this.database.transaction(async client=>{
            const row=(await client.query(`SELECT id,session_id FROM recruitment_onboarding_photos WHERE id=$1
              AND deleted_at IS NULL AND expires_at<=clock_timestamp() FOR UPDATE SKIP LOCKED`,[item.id])).rows[0];
            if(!row)return;
            await this.removeFile(row.id);
            await client.query("UPDATE recruitment_onboarding_photos SET deleted_at=clock_timestamp(),deletion_reason='expired' WHERE id=$1",[row.id]);
            await this.audit.append(client,{actorId:null,channel:'system',correlationId:randomUUID(),action:'recruitment.onboarding.photo.expired',entityType:'recruitment_onboarding_photo',entityId:row.id,metadata:{sessionId:row.session_id,reason:'expired'}});
          });
        } catch { failures++; }
      }
      // Remove orphaned files (e.g. a process stopped between file write and DB commit).
      // This spool is dedicated to onboarding; no user-supplied paths are accepted.
      for(const entry of await fs.readdir(this.directory,{withFileTypes:true})) {
        if(!entry.isFile() || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.bin$/.test(entry.name)) continue;
        const id=entry.name.slice(0,-4), file=this.photoPath(id);
        const stat=await fs.stat(file).catch(()=>null);
        if(!stat || stat.mtimeMs>Date.now()-3600000) continue;
        try {
          const result=await this.database.pool.query('SELECT deleted_at FROM recruitment_onboarding_photos WHERE id=$1',[id]);
          if(!result.rowCount || result.rows[0].deleted_at) await this.removeFile(id);
        } catch { failures++; }
      }
      this.cleanupStatus={lastRunAt:new Date().toISOString(),failed:failures>0};
      if(failures)process.stderr.write('Onboarding temporary photo cleanup requires retry\n');
    }
    async current(client,supplied) {
      const actor=await this.recruitment.current(client,supplied);
      if(actor.role==='external_recruiter' || !actor.grants.length) forbidden('Оформление доступно внутренним сотрудникам с правом работы с персональными данными.');
      return actor;
    }
    scope(actor,id) { return this.recruitment.scope(actor,id); }
    async append(client,actor,session,action,metadata={}) {
      await this.audit.append(client,{actorId:actor?.id || null,channel:actor?.channel || 'public_form',correlationId:randomUUID(),
        action:`recruitment.onboarding.${action}`,entityType:'recruitment_onboarding_session',entityId:session.id,
        scope:{legalEntityId:session.legal_entity_id,responsibilityScopeId:session.responsibility_scope_id},metadata});
    }
    async session(client,actor,id,lock=true) {
      const row=(await client.query(`SELECT s.*,c.full_name AS candidate_name FROM recruitment_onboarding_sessions s
        LEFT JOIN recruitment_candidates c ON c.id=s.candidate_id WHERE s.id=$1 ${lock?'FOR UPDATE OF s':''}`,[uuid(id)])).rows[0];
      if(!row) forbidden('Оформление недоступно.');
      this.scope(actor,row.responsibility_scope_id);
      if(!MANAGERS.includes(actor.role) && row.created_by!==actor.id) forbidden('Доступны только ваши оформления.');
      return row;
    }
    async publicSession(client,token) {
      const hash=tokenHash(token);
      const initial=(await client.query('SELECT link_issued_by FROM recruitment_onboarding_sessions WHERE token_hash=$1',[hash])).rows[0];
      if(!initial)unavailable();
      await this.recruitment.identity.lockUsers(client,[initial.link_issued_by]);
      const row=(await client.query(`SELECT * FROM recruitment_onboarding_sessions WHERE token_hash=$1
        AND link_expires_at>clock_timestamp() AND status<>'verified' FOR UPDATE`,[hash])).rows[0];
      if(!row) unavailable();
      // Disabling the issuing account or its personal-data access also revokes the capability.
      const issuer=await client.query(`SELECT 1 FROM users u JOIN access_grants g ON g.user_id=u.id
        WHERE u.id=$1 AND u.active AND u.approved AND u.role=ANY($2::text[]) AND g.personal_data_visible AND g.legal_entity_id=$3
        AND (u.role IN ('manager','access_admin') OR u.id=$4)`,
        [row.link_issued_by,['manager','dispatcher','recruiter','access_admin'],row.legal_entity_id,row.created_by]);
      if(!issuer.rowCount) unavailable();
      return row;
    }
    async serialize(client,row,includePhotos=true) {
      return {id:row.id,version:row.version,templateId:row.template_id,templateSnapshot:row.template_snapshot,candidateId:row.candidate_id,
        candidateName:row.candidate_name || '',status:row.status,values:row.field_values,createdBy:row.created_by,createdAt:row.created_at,updatedAt:row.updated_at,
        linkExpiresAt:row.link_expires_at,linkActive:!!row.token_hash && row.link_expires_at>new Date(),
        verifiedAt:row.verified_at,photos:Array.isArray(includePhotos)?includePhotos:includePhotos?(await client.query(`SELECT ${PHOTO_COLUMNS} FROM recruitment_onboarding_photos WHERE session_id=$1 ORDER BY uploaded_at,id`,[row.id])).rows:[]};
    }
    async context(supplied) {
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied), companies=[...new Set(actor.grants.map(g=>g.legalEntityId))];
        const canManageTemplates=MANAGERS.includes(actor.role);
        const templates=(await client.query(`SELECT ${TEMPLATE_COLUMNS} FROM recruitment_onboarding_templates WHERE legal_entity_id=ANY($1::uuid[]) ${canManageTemplates?'':'AND active'} ORDER BY destination,name,id LIMIT 1000`,[companies])).rows;
        const rows=(await client.query(`SELECT s.*,c.full_name AS candidate_name FROM recruitment_onboarding_sessions s
          LEFT JOIN recruitment_candidates c ON c.id=s.candidate_id WHERE s.legal_entity_id=ANY($1::uuid[]) AND ($2::boolean OR s.created_by=$3)
          ORDER BY s.updated_at DESC,s.id LIMIT 1001`,[companies,canManageTemplates,actor.id])).rows;
        const selected=rows.slice(0,1000),photos=(await client.query(`SELECT ${PHOTO_COLUMNS} FROM recruitment_onboarding_photos WHERE session_id=ANY($1::uuid[]) ORDER BY uploaded_at,id`,[selected.map(row=>row.id)])).rows;
        const grouped=new Map();for(const photo of photos){if(!grouped.has(photo.sessionId))grouped.set(photo.sessionId,[]);grouped.get(photo.sessionId).push(photo);}
        const sessions=[];for(const row of selected)sessions.push(await this.serialize(client,row,grouped.get(row.id)||[]));
        return {templates,sessions,canManageTemplates,ocr:ocr.getOcrStatus(),retentionHours:72,storageConfigured:!!this.directory,cleanup:this.cleanupStatus || {failed:!this.directory},truncated:rows.length>1000};
      });
    }
    async saveTemplate(supplied,body) {
      const data=input.templateInput(body);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);
        if(!MANAGERS.includes(actor.role)) forbidden('Конструктор форм доступен руководителю и администратору.');
        const scope=this.scope(actor,data.responsibilityScopeId);
        await this.recruitment.lockScope(client,scope);
        const previous=(await client.query('SELECT * FROM recruitment_onboarding_templates WHERE id=$1 FOR UPDATE',[data.id])).rows[0];
        if(previous) {
          this.scope(actor,previous.responsibility_scope_id);
          if(previous.responsibility_scope_id!==data.responsibilityScopeId) fail('Проект существующей формы нельзя изменить. Создайте копию.');
          if(previous.version!==data.version) conflict();
          await client.query(`UPDATE recruitment_onboarding_templates SET name=$2,destination=$3,employment_type=$4,description=$5,privacy_notice=$6,
            fields=$7,documents=$8,active=$9,version=version+1,updated_at=clock_timestamp() WHERE id=$1`,
            [data.id,data.name,data.destination,data.employmentType,data.description,data.privacyNotice,JSON.stringify(data.fields),JSON.stringify(data.documents),data.active]);
        } else {
          if(data.version!==0) conflict();
          await client.query(`INSERT INTO recruitment_onboarding_templates(id,responsibility_scope_id,legal_entity_id,name,destination,employment_type,description,privacy_notice,fields,documents,active,created_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[data.id,scope.responsibilityScopeId,scope.legalEntityId,data.name,data.destination,data.employmentType,data.description,data.privacyNotice,JSON.stringify(data.fields),JSON.stringify(data.documents),data.active,actor.id]);
        }
        await this.append(client,actor,{id:data.id,legal_entity_id:scope.legalEntityId,responsibility_scope_id:scope.responsibilityScopeId},'template.saved',{version:data.version+1,active:data.active});
        return (await client.query(`SELECT ${TEMPLATE_COLUMNS} FROM recruitment_onboarding_templates WHERE id=$1`,[data.id])).rows[0];
      });
    }
    async createSession(supplied,body) {
      input.fieldsOnly(body,['templateId','candidateId']);const templateId=uuid(body.templateId),candidateId=body.candidateId?uuid(body.candidateId):null;
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);
        const template=(await client.query(`SELECT ${TEMPLATE_COLUMNS},legal_entity_id FROM recruitment_onboarding_templates WHERE id=$1 AND active FOR SHARE`,[templateId])).rows[0];
        if(!template) fail('Выберите опубликованную форму.');
        this.scope(actor,template.responsibilityScopeId);
        if(candidateId && !(await client.query('SELECT 1 FROM recruitment_candidates WHERE id=$1 AND legal_entity_id=$2 AND NOT archived',[candidateId,template.legal_entity_id])).rowCount) fail('Выберите действующего кандидата этой компании.');
        const {legal_entity_id,...snapshot}=template;
        const id=randomUUID();
        await client.query(`INSERT INTO recruitment_onboarding_sessions(id,template_id,responsibility_scope_id,legal_entity_id,template_snapshot,candidate_id,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,template.id,template.responsibilityScopeId,legal_entity_id,JSON.stringify(snapshot),candidateId,actor.id]);
        const row=await this.session(client,actor,id);
        await this.append(client,actor,row,'created',{templateId});
        return this.serialize(client,row);
      });
    }
    async readSession(supplied,id) {return this.database.transaction(async client=>this.serialize(client,await this.session(client,await this.current(client,supplied),id)));}
    editable(row) {if(row.status==='verified') conflict('Оформление уже проверено. Для нового оформления создайте новую анкету.');}
    async saveSession(supplied,id,body,verify=false) {
      input.fieldsOnly(body,['version','values']);input.version(body.version);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),row=await this.session(client,actor,id);this.editable(row);
        if(row.version!==body.version) conflict();
        const values=input.valuesInput(body.values,row.template_snapshot,verify);
        if(verify) await this.requiredDocuments(client,row,true);
        await client.query(`UPDATE recruitment_onboarding_sessions SET field_values=$2,version=version+1,updated_at=clock_timestamp(),token_hash=NULL
          ${verify?",status='verified',verified_at=clock_timestamp(),verified_by=$3":''} WHERE id=$1`,[row.id,JSON.stringify(values),...(verify?[actor.id]:[])]);
        await this.append(client,actor,row,verify?'verified':'saved',{version:row.version+1});
        return this.serialize(client,await this.session(client,actor,row.id));
      });
    }
    async requiredDocuments(client,row,reviewed) {
      const found=(await client.query(`SELECT DISTINCT ON(document_id) document_id,reviewed_at,deleted_at,expires_at>clock_timestamp() AS live
        FROM recruitment_onboarding_photos WHERE session_id=$1 ORDER BY document_id,uploaded_at DESC,id DESC`,[row.id])).rows;
      for(const doc of row.template_snapshot.documents) if(doc.required && !found.some(p=>p.document_id===doc.id && (reviewed?p.reviewed_at:!p.deleted_at && p.live))) fail(`${reviewed?'Проверьте':'Загрузите'} документ «${doc.label}».`);
    }
    async issueLink(supplied,id) {
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),row=await this.session(client,actor,id);this.editable(row);
        const token=randomBytes(32).toString('base64url');
        const expiresAt=(await client.query("UPDATE recruitment_onboarding_sessions SET token_hash=$2,link_issued_by=$3,link_expires_at=clock_timestamp()+interval '7 days' WHERE id=$1 RETURNING link_expires_at",[row.id,digest(token),actor.id])).rows[0].link_expires_at;
        await this.append(client,actor,row,'link.created',{expiresAt});return {token,expiresAt};
      });
    }
    async revokeLink(supplied,id) {
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),row=await this.session(client,actor,id);
        await client.query('UPDATE recruitment_onboarding_sessions SET token_hash=NULL WHERE id=$1',[row.id]);
        await this.append(client,actor,row,'link.revoked');return {ok:true};
      });
    }
    async preview(body) {
      input.fieldsOnly(body,['token']);
      return this.database.transaction(async client=>{
        const row=await this.publicSession(client,body.token);
        const {id,name,destination,employmentType,description,privacyNotice,fields,documents}=row.template_snapshot;
        return {template:{id,name,destination,employmentType,description,privacyNotice,fields,documents},expiresAt:row.link_expires_at,retentionHours:72};
      });
    }
    async publicSubmit(body) {
      input.fieldsOnly(body,['token','values']);
      return this.database.transaction(async client=>{
        const row=await this.publicSession(client,body.token),values=input.valuesInput(body.values,row.template_snapshot,true);
        await this.requiredDocuments(client,row,false);
        await client.query("UPDATE recruitment_onboarding_sessions SET field_values=$2,status='submitted',token_hash=NULL,version=version+1,updated_at=clock_timestamp() WHERE id=$1",[row.id,JSON.stringify(values)]);
        await this.append(client,null,row,'submitted');return {ok:true};
      });
    }
    async upload(supplied,id,body,publicMode=false) {
      input.fieldsOnly(body,publicMode?['token','documentId','mimeType','base64']:['documentId','mimeType','base64']);
      const parsed=input.imageInput(body);const photoId=randomUUID();let written=false;
      try {
        return await this.database.transaction(async client=>{
          const actor=publicMode?null:await this.current(client,supplied),row=publicMode?await this.publicSession(client,body.token):await this.session(client,actor,id);this.editable(row);
          if(!this.directory)throw new ServiceUnavailableException({code:'ONBOARDING_OCR_STORAGE_UNAVAILABLE',message:'Хранилище фотографий ещё не настроено. Обратитесь к администратору.'});
          const doc=row.template_snapshot.documents.find(d=>d.id===parsed.documentId);if(!doc) fail('Документ не предусмотрен выбранной формой.');
          const counts=(await client.query(`SELECT count(*)::integer AS total,count(*) FILTER(WHERE document_id=$2 AND deleted_at IS NULL AND expires_at>clock_timestamp())::integer AS live FROM recruitment_onboarding_photos WHERE session_id=$1`,[row.id,doc.id])).rows[0];
          if(counts.total>=40 || counts.live>=3) fail('Достигнут лимит снимков. Проверьте и удалите лишние фотографии либо обратитесь к рекрутеру.');
          await fs.writeFile(this.photoPath(photoId),parsed.buffer,{flag:'wx',mode:0o600});written=true;
          const photo=(await client.query(`INSERT INTO recruitment_onboarding_photos(id,session_id,document_id,document_type,label,mime_type,byte_size,sha256)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${PHOTO_COLUMNS}`,[photoId,row.id,doc.id,doc.type,doc.label,parsed.mimeType,parsed.buffer.length,digest(parsed.buffer)])).rows[0];
          await client.query(`UPDATE recruitment_onboarding_sessions SET version=version+1,updated_at=clock_timestamp()${publicMode?'':',token_hash=NULL'} WHERE id=$1`,[row.id]);
          await this.append(client,actor,row,'photo.uploaded',{photoId,documentId:doc.id,byteSize:parsed.buffer.length});
          return photo;
        });
      } catch(error) { if(written) await this.removeFile(photoId).catch(()=>{});throw error; }
      finally {parsed.buffer.fill(0);}
    }
    async photo(client,actor,id,live=true) {
      const initial=(await client.query('SELECT session_id FROM recruitment_onboarding_photos WHERE id=$1',[uuid(id)])).rows[0];
      if(!initial) forbidden('Фотография недоступна.');
      const session=await this.session(client,actor,initial.session_id);
      const photo=(await client.query(`SELECT *,expires_at>clock_timestamp() AS live FROM recruitment_onboarding_photos WHERE id=$1 FOR UPDATE`,[id])).rows[0];
      if(live && (photo.deleted_at || !photo.live)) photoGone();
      return {session,photo};
    }
    async photoContent(supplied,id) {
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),{session,photo}=await this.photo(client,actor,id);
        let buffer;try{buffer=await fs.readFile(this.photoPath(photo.id));}catch(error){if(error.code==='ENOENT')photoGone();throw error;}
        await this.append(client,actor,session,'photo.viewed',{photoId:photo.id});
        return {buffer,mimeType:photo.mime_type};
      });
    }
    async recognize(supplied,id) {
      const data=await this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),{session,photo}=await this.photo(client,actor,id);this.editable(session);
        if(!ocr.getOcrStatus().configured) throw new ServiceUnavailableException({code:'ONBOARDING_OCR_NOT_CONFIGURED',message:'Сервис распознавания ещё не подключён. Можно заполнить поля вручную.'});
        if(photo.ocr_attempts>=5) fail('Достигнут лимит распознаваний этого снимка. Проверьте данные вручную.');
        let buffer;try{buffer=await fs.readFile(this.photoPath(photo.id));}catch(error){if(error.code==='ENOENT')photoGone();throw error;}
        await client.query('UPDATE recruitment_onboarding_photos SET ocr_attempts=ocr_attempts+1 WHERE id=$1',[photo.id]);
        await this.append(client,actor,session,'photo.ocr_requested',{photoId:photo.id});
        return {buffer,mimeType:photo.mime_type,documentType:photo.document_type};
      });
      try {
        const result=await ocr.recognizeDocument(data);
        await this.database.transaction(async client=>{
          const actor=await this.current(client,supplied),{session,photo}=await this.photo(client,actor,id);this.editable(session);
          await client.query("UPDATE recruitment_onboarding_photos SET ocr_status='recognized' WHERE id=$1",[photo.id]);
          await this.append(client,actor,session,'photo.recognized',{photoId:photo.id});
        });
        return result;
      } catch(error) {
        await this.database.pool.query("UPDATE recruitment_onboarding_photos SET ocr_status='failed' WHERE id=$1 AND deleted_at IS NULL",[id]).catch(()=>{});
        throw error;
      } finally{data.buffer.fill(0);}
    }
    async review(supplied,id) {
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),{session,photo}=await this.photo(client,actor,id);this.editable(session);
        // Viewing/OCR alone never counts as the employee's explicit confirmation.
        const result=(await client.query(`UPDATE recruitment_onboarding_photos SET reviewed_at=COALESCE(reviewed_at,clock_timestamp()),reviewed_by=COALESCE(reviewed_by,$2) WHERE id=$1 RETURNING ${PHOTO_COLUMNS}`,[photo.id,actor.id])).rows[0];
        if(!photo.reviewed_at)await client.query('UPDATE recruitment_onboarding_sessions SET version=version+1,updated_at=clock_timestamp(),token_hash=NULL WHERE id=$1',[session.id]);
        await this.append(client,actor,session,'photo.reviewed',{photoId:photo.id});return result;
      });
    }
    async deletePhotos(supplied,body) {
      input.fieldsOnly(body,['photoIds']);
      if(!Array.isArray(body.photoIds) || !body.photoIds.length || body.photoIds.length>100) fail('Выберите от 1 до 100 проверенных фотографий.');
      const ids=[...new Set(body.photoIds.map(id=>uuid(id)))].sort();
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied);
        const found=(await client.query('SELECT id,session_id FROM recruitment_onboarding_photos WHERE id=ANY($1::uuid[]) ORDER BY session_id,id',[ids])).rows;
        if(found.length!==ids.length) forbidden('Одна из фотографий недоступна.');
        const sessions=new Map();for(const sid of [...new Set(found.map(p=>p.session_id))]) sessions.set(sid,await this.session(client,actor,sid));
        const photos=(await client.query('SELECT * FROM recruitment_onboarding_photos WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[ids])).rows;
        if(photos.some(p=>!p.deleted_at && !p.reviewed_at)) fail('Сначала проверьте все выбранные фотографии.');
        let deleted=0;
        for(const photo of photos) {
          if(photo.deleted_at)continue;
          await this.removeFile(photo.id);
          await client.query("UPDATE recruitment_onboarding_photos SET deleted_at=clock_timestamp(),deleted_by=$2,deletion_reason='manual' WHERE id=$1",[photo.id,actor.id]);
          await this.append(client,actor,sessions.get(photo.session_id),'photo.deleted',{photoId:photo.id,reason:'manual'});deleted++;
        }
        return {deleted};
      });
    }
  }
  Injectable()(OnboardingService);
  Inject(DatabaseService)(OnboardingService,undefined,0);Inject(RecruitmentService)(OnboardingService,undefined,1);Inject(AuditService)(OnboardingService,undefined,2);
  class OnboardingController {
    constructor(service){this.service=service;}
    context(actor){return this.service.context(actor);}
    template(actor,body){return this.service.saveTemplate(actor,body);}
    create(actor,body){return this.service.createSession(actor,body);}
    read(actor,id){return this.service.readSession(actor,id);}
    save(actor,id,body){return this.service.saveSession(actor,id,body);}
    verify(actor,id,body){return this.service.saveSession(actor,id,body,true);}
    link(actor,id){return this.service.issueLink(actor,id);}
    revoke(actor,id){return this.service.revokeLink(actor,id);}
    upload(actor,id,body){return this.service.upload(actor,id,body);}
    async content(actor,id,res){const {buffer,mimeType}=await this.service.photoContent(actor,id);res.set({'Content-Type':mimeType,'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="document-photo"'});res.send(buffer);}
    recognize(actor,id){return this.service.recognize(actor,id);}
    review(actor,id){return this.service.review(actor,id);}
    remove(actor,body){return this.service.deletePhotos(actor,body);}
  }
  Inject(OnboardingService)(OnboardingController,undefined,0);Controller('recruitment/onboarding')(OnboardingController);UseGuards(AuthGuard)(OnboardingController);
  for(const [name,method,route,bodyIndex] of [
    ['context',Get,'context'],['template',Put,'templates',1],['create',Post,'sessions',1],['read',Get,'sessions/:id'],['save',Put,'sessions/:id',2],
    ['verify',Post,'sessions/:id/verify',2],['link',Post,'sessions/:id/link'],['revoke',Post,'sessions/:id/revoke-link'],['upload',Post,'sessions/:id/photos',2],
    ['content',Get,'photos/:id/content'],['recognize',Post,'photos/:id/recognize'],['review',Post,'photos/:id/review'],['remove',Post,'photos/delete',1]
  ]) {
    const d=Object.getOwnPropertyDescriptor(OnboardingController.prototype,name);method(route)(OnboardingController.prototype,name,d);
    Header('Cache-Control','no-store')(OnboardingController.prototype,name,d);HttpCode(200)(OnboardingController.prototype,name,d);CurrentActor()(OnboardingController.prototype,name,0);
    if(route.includes(':id'))Param('id')(OnboardingController.prototype,name,1);if(bodyIndex)Body()(OnboardingController.prototype,name,bodyIndex);
    if(name==='content')Res()(OnboardingController.prototype,name,2);
  }
  class PublicOnboardingController {
    constructor(service){this.service=service;}
    preview(body){return this.service.preview(body);}
    upload(body){return this.service.upload(null,null,body,true);}
    submit(body){return this.service.publicSubmit(body);}
  }
  Inject(OnboardingService)(PublicOnboardingController,undefined,0);Controller('recruitment-onboarding')(PublicOnboardingController);
  for(const name of ['preview','upload','submit']) {
    const d=Object.getOwnPropertyDescriptor(PublicOnboardingController.prototype,name);Post(name)(PublicOnboardingController.prototype,name,d);Body()(PublicOnboardingController.prototype,name,0);
    HttpCode(200)(PublicOnboardingController.prototype,name,d);Header('Cache-Control','no-store')(PublicOnboardingController.prototype,name,d);
    Throttle({default:{limit:process.env.NODE_ENV==='test'?1000:30,ttl:60000}})(PublicOnboardingController.prototype,name,d);
  }
  return {OnboardingService,OnboardingController,PublicOnboardingController};
}
module.exports={createOnboardingComponents};
