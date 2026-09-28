// SPDX-License-Identifier: MIT
'use strict';
const { PayloadTooLargeException } = require('@nestjs/common');
const { fail, uuid, string, choice, date, phone } = require('./recruitment-input');
const { fieldsOnly, object, version, MAX_BYTES } = require('./onboarding-input');
const RESERVED = ['contract_number','contract_date'];
function content(value, fields, required=true) {
  const text=string(value,100000,'текст договора',required);
  const allowed=new Set([...RESERVED,...fields.map(field=>field.id)]);
  const rest=text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_-]{0,79})\s*\}\}/g,(_,key)=>{
    if(!allowed.has(key))fail(`Добавьте поле «${key}» в конструктор или удалите его подстановку из текста.`);
    return '';
  });
  if(rest.includes('{{') || rest.includes('}}'))fail('Проверьте подстановки: используйте {{идентификатор_поля}}.');
  return text;
}
function template(body) {
  fieldsOnly(body,['id','version','responsibilityScopeId','name','employmentType','text','fields','state']);
  if(!Array.isArray(body.fields) || body.fields.length>80)fail('В шаблоне допустимо до 80 полей.');
  const fields=body.fields.map(field=>{
    fieldsOnly(field,['id','label','type','required','defaultValue','notBeforeContractDate']);
    if(typeof field.id!=='string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(field.id) || ['__proto__','constructor','prototype',...RESERVED].includes(field.id))fail('Недопустимый или зарезервированный идентификатор поля.');
    if(typeof field.required!=='boolean')fail('Укажите обязательность поля.');
    const result={id:field.id,label:string(field.label,160,'название поля',true),type:choice(field.type,['text','textarea','date','tel'],'тип поля'),required:field.required};
    if(field.defaultValue!==undefined)result.defaultValue=values({[field.id]:field.defaultValue},[result])[field.id];
    if(field.notBeforeContractDate!==undefined) {
      if(result.type!=='date' || typeof field.notBeforeContractDate!=='boolean')fail('Ограничение даты допустимо только для поля типа «Дата».');
      result.notBeforeContractDate=field.notBeforeContractDate;
    }
    return result;
  });
  if(new Set(fields.map(f=>f.id)).size!==fields.length)fail('Идентификаторы полей должны быть уникальными.');
  return {id:uuid(body.id),version:version(body.version),responsibilityScopeId:uuid(body.responsibilityScopeId),state:choice(body.state,['draft','published'],'состояние шаблона'),
    snapshot:{name:string(body.name,160,'название шаблона',true),employmentType:choice(body.employmentType,['employee','ip','self_employed','any'],'тип оформления'),text:content(body.text,fields,body.state==='published'),fields}};
}
function values(value,fields,complete=false) {
  object(value);
  if(Object.keys(value).some(key=>!fields.some(f=>f.id===key)))fail('В договоре есть поля из другой версии шаблона.');
  const result={};
  for(const field of fields) {
    const valueText=string(value[field.id],field.type==='textarea'?8000:1000,field.label,complete && field.required);
    if(valueText && field.type==='date')date(valueText,true);
    if(valueText && field.type==='tel')phone(valueText);
    result[field.id]=valueText;
  }
  return result;
}
function render(text,fields,number,documentDate,definitions=[]) {
  const substitutions={...fields,contract_number:number || '',contract_date:documentDate?documentDate.split('-').reverse().join('.'):''};
  for(const field of definitions)if(field.type==='date' && substitutions[field.id])substitutions[field.id]=substitutions[field.id].split('-').reverse().join('.');
  let size=text.length;
  const rendered=text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_-]{0,79})\s*\}\}/g,(match,key)=>{
    const value=substitutions[key] || '';size+=value.length-match.length;
    if(size>1000000)fail('Итоговый текст договора слишком большой. Сократите повторяющиеся подстановки.');
    return value;
  });
  return rendered;
}
function validateDates(values,fields,documentDate) {
  if(!documentDate)return;
  for(const field of fields)if(field.type==='date' && field.notBeforeContractDate && values[field.id] && values[field.id]<documentDate)fail(`Поле «${field.label}» не может быть раньше даты документа.`);
}
function packSelection(ids,required=true) {
  if(!Array.isArray(ids) || ids.length>(80) || (required && !ids.length))fail('Выберите от 1 до 80 документов комплекта.');
  const result=ids.map(id=>uuid(id,'шаблон'));
  if(new Set(result).size!==result.length)fail('Шаблон не должен повторяться в комплекте.');
  return result;
}
function pack(body) {
  fieldsOnly(body,['idempotencyKey','responsibilityScopeId','kind','templateIds','templateVersions','candidateId','onboardingSessionId','values','number','date']);
  const templateIds=packSelection(body.templateIds);
  object(body.templateVersions);object(body.values);
  if(Object.keys(body.templateVersions).length!==templateIds.length || Object.keys(body.templateVersions).some(id=>!templateIds.includes(id)))fail('Обновите версии выбранных шаблонов.');
  const templateVersions={};
  for(const id of templateIds) {
    const edition=version(body.templateVersions[id]);
    if(!edition)fail('Выберите опубликованные шаблоны.');
    templateVersions[id]=edition;
  }
  return {idempotencyKey:uuid(body.idempotencyKey),responsibilityScopeId:uuid(body.responsibilityScopeId),kind:choice(body.kind,['employee','carrier'],'тип комплекта'),templateIds,templateVersions,
    candidateId:body.candidateId?uuid(body.candidateId):null,onboardingSessionId:body.onboardingSessionId?uuid(body.onboardingSessionId):null,
    values:body.values,number:string(body.number,160,'номер договора'),date:date(body.date,true)};
}
function mergeFields(templates) {
  const definitions=new Map();
  for(const template of templates)for(const field of template.fields) {
    if(!definitions.has(field.id))definitions.set(field.id,[]);
    definitions.get(field.id).push({templateId:template.id,field});
  }
  if(definitions.size>400)fail('В комплекте слишком много различных полей. Разделите его на несколько комплектов.');
  const fields=[],conflicts=[];
  for(const [id,entries] of definitions) {
    const first=entries[0].field,types=[...new Set(entries.map(e=>e.field.type))],labels=[...new Set(entries.map(e=>e.field.label))];
    const defaults=[...new Set(entries.filter(e=>Object.hasOwn(e.field,'defaultValue')).map(e=>e.field.defaultValue))];
    const templateIds=entries.map(e=>e.templateId);
    const field={...first,required:entries.some(e=>e.field.required),templateIds};
    if(entries.some(e=>e.field.notBeforeContractDate))field.notBeforeContractDate=true;
    if(types.length>1)conflicts.push({fieldId:id,type:'type',templateIds,types});
    if(labels.length>1)conflicts.push({fieldId:id,type:'label',templateIds,labels});
    if(defaults.length>1) {delete field.defaultValue;conflicts.push({fieldId:id,type:'default',templateIds,values:defaults});}
    else if(defaults.length)field.defaultValue=defaults[0];
    fields.push(field);
  }
  return {fields,conflicts};
}
function signedFile(body) {
  const mimeType=choice(body.mimeType,['application/pdf','image/jpeg','image/png'],'формат подписанного файла');
  const fileName=string(body.fileName,200,'название файла',true);
  if(/[\r\n/\\]/.test(fileName))fail('Проверьте название файла.');
  if(typeof body.base64!=='string' || !body.base64.length)fail('Приложите подписанный договор.');
  if(body.base64.length>Math.ceil(MAX_BYTES/3)*4)throw new PayloadTooLargeException('Размер файла не должен превышать 10 МБ.');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64) || body.base64.length%4!==0)fail('Некорректный файл.');
  const buffer=Buffer.from(body.base64,'base64');
  if(!buffer.length || buffer.length>MAX_BYTES || buffer.toString('base64')!==body.base64)fail('Некорректный файл.');
  const valid=mimeType==='application/pdf' ? buffer.subarray(0,5).toString()==='%PDF-' && buffer.subarray(-1024).includes(Buffer.from('%%EOF'))
    : mimeType==='image/png' ? buffer.length>=24 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && buffer.subarray(12,16).toString()==='IHDR'
      : buffer.length>=4 && buffer[0]===255 && buffer[1]===216 && buffer[2]===255;
  if(!valid)fail('Содержимое файла не соответствует PDF, JPEG или PNG.');
  return {mimeType,fileName,buffer};
}
module.exports={template,content,values,render,signedFile,validateDates,pack,packSelection,mergeFields};
