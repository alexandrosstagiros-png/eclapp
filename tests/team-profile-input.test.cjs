'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {profileInput,jpegPhoto,MAX_AVATAR_BYTES}=require('../recovered/apps/api/src/modules/team/team-profile');
const {jpeg,paddedJpeg}=require('./team-profile-fixture.cjs');
const base=()=>({operationId:randomUUID(),version:0}),bad=fn=>assert.throws(fn,e=>e.getStatus?.()===400);
test('profile contact edits normalize blanks, preserve omissions, validate dates and fingerprint canonical values',()=>{
  const original={...base(),email:' person@example.test ',phone:'+7 (900) 123-45-67',contacts:' Telegram: test\nВнутренний: 42 ',birthDate:'1990-02-28'};
  const parsed=profileInput(original);assert.equal(parsed.email,'person@example.test');assert.equal(parsed.birthDate,'1990-02-28');assert.equal(parsed.contacts,'Telegram: test\nВнутренний: 42');
  assert.equal(profileInput({...original,email:parsed.email}).payloadSha256,parsed.payloadSha256);
  assert.equal(profileInput({...base(),birthDate:''}).birthDate,null);assert.equal('photo'in profileInput(base()),false);assert.equal(profileInput({...base(),photo:null}).photo,null);
  for(const patch of [{version:-1},{version:'1'},{version:2147483646},{operationId:'bad'},{userId:randomUUID()},{email:'a@b'},{email:'x\n@y.test'},{phone:'javascript:bad'},{phone:'123'},{contacts:'x'.repeat(2001)},{birthDate:'1990-02-30'},{birthDate:'2999-01-01'},{birthDate:'1800-01-01'},{birthDate:'1990-1-1'}])bad(()=>profileInput({...base(),...patch}));
});
test('JPEG avatar validation bounds bytes, canonical base64, scan structure and actual frame dimensions',()=>{
  assert.equal(jpegPhoto({contentBase64:jpeg.toString('base64')}).width,2);assert.equal(jpegPhoto({contentBase64:paddedJpeg().toString('base64')}).content.length,paddedJpeg().length);
  for(const bytes of [Buffer.from('not jpeg'),jpeg.subarray(0,jpeg.length-2),Buffer.concat([jpeg,Buffer.from('trailing')]),Buffer.alloc(MAX_AVATAR_BYTES+1)])bad(()=>jpegPhoto({contentBase64:bytes.toString('base64')}));
  bad(()=>jpegPhoto({contentBase64:jpeg.toString('base64')+'\n'}));bad(()=>jpegPhoto({contentBase64:jpeg.toString('base64'),filename:'x.jpg'}));
  const oversized=Buffer.from(jpeg);let sof=-1;for(let i=0;i<oversized.length-1;i++)if(oversized[i]===0xff&&oversized[i+1]===0xc0){sof=i;break;}assert.ok(sof>0);oversized.writeUInt16BE(513,sof+7);bad(()=>jpegPhoto({contentBase64:oversized.toString('base64')}));
  const photo=profileInput({...base(),photo:{contentBase64:jpeg.toString('base64')}});assert.equal(photo.photo.content.length,jpeg.length);assert.match(photo.photo.sha256,/^[a-f0-9]{64}$/);
});
