'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {moscowToday,nextBirthday,birthdayOccurrence,congratulationInput,birthdayDateInput}=require('../recovered/apps/api/src/modules/team/team-birthdays');
test('birthday calendar uses Moscow midnight and year boundaries',()=>{
  assert.equal(moscowToday(new Date('2026-12-31T20:59:59.999Z')),'2026-12-31');
  assert.equal(moscowToday(new Date('2026-12-31T21:00:00.000Z')),'2027-01-01');
  assert.equal(moscowToday(new Date('2026-06-01T21:00:00.000Z')),'2026-06-02');
  assert.deepEqual(nextBirthday('1990-01-01','2026-12-31'),{birthdayMonth:1,birthdayDay:1,nextBirthday:'2027-01-01',daysUntil:1});
  assert.equal(nextBirthday('1990-12-31','2026-12-31').daysUntil,0);
  assert.equal(nextBirthday('1990-12-30','2026-12-31').daysUntil,364);
});
test('29 February occurs on 28 February in non-leap years and on 29 February in leap years',()=>{
  assert.deepEqual(nextBirthday('2000-02-29','2027-02-28'),{birthdayMonth:2,birthdayDay:29,nextBirthday:'2027-02-28',daysUntil:0});
  assert.equal(nextBirthday('2000-02-29','2028-02-28').nextBirthday,'2028-02-29');
  assert.equal(nextBirthday('2000-02-29','2028-02-28').daysUntil,1);
  assert.equal(nextBirthday('2000-02-29','2027-03-01').daysUntil,365);
  assert.equal(nextBirthday('2000-02-29','2028-03-01').nextBirthday,'2029-02-28');
  assert.equal(birthdayOccurrence(2,29,2100),'2100-02-28');
  assert.equal(birthdayOccurrence(2,29,2400),'2400-02-29');
});
test('congratulation input requires an exact calendar date and explicit boolean',()=>{
  assert.deepEqual(congratulationInput({occurrenceDate:'2028-02-29',congratulated:false}),{occurrenceDate:'2028-02-29',congratulated:false});
  for(const body of [null,{}, {occurrenceDate:'2027-02-29',congratulated:true},{occurrenceDate:'2026-02-30',congratulated:true},{occurrenceDate:'2026-01-01T00:00:00Z',congratulated:true},{occurrenceDate:'2026-01-01',congratulated:'true'},{occurrenceDate:'2026-01-01',congratulated:true,userId:'forged'}])assert.throws(()=>congratulationInput(body));
});
test('administrator birth date updates validate actual past dates, null and optimistic versions',()=>{
  assert.deepEqual(birthdayDateInput({birthDate:null,version:0},'2026-09-25'),{birthDate:null,version:0});
  assert.deepEqual(birthdayDateInput({birthDate:'2000-02-29',version:3},'2026-09-25'),{birthDate:'2000-02-29',version:3});
  for(const body of [{version:0},{birthDate:'',version:0},{birthDate:'1900-02-29',version:0},{birthDate:'1899-12-31',version:0},{birthDate:'2026-09-26',version:0},{birthDate:'1990-01-01',version:-1},{birthDate:null,version:'1'},{birthDate:null,version:0,contacts:'forged'}])assert.throws(()=>birthdayDateInput(body,'2026-09-25'));
});
