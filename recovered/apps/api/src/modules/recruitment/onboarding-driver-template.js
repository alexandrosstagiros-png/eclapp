'use strict';
// Shared identifiers are also used by every driver document in contract-catalog.
// OCR suggestions remain editable and require the recruiter's existing review.
module.exports = {
  key: 'builtin-driver-tk-v1',
  name: 'Водитель · ТК', destination: 'Трудовой договор', employmentType: 'employee',
  description: 'Данные водителя для комплекта документов по ТК. Загрузите паспорт, распознайте и проверьте поля перед оформлением.',
  privacyNotice: 'Данные используются для подготовки документов оформления. Доступ имеют уполномоченные сотрудники. При запуске распознавания фотография передаётся сервису VK Cloud Vision. Фотографии анкеты автоматически удаляются через 72 часа; сведения анкеты и оформленные документы сохраняются.',
  active: true,
  fields: [
    {id:'full_name',label:'ФИО водителя',type:'text',required:true,ocrKey:'full_name'},
    {id:'birth_date',label:'Дата рождения',type:'date',required:true,ocrKey:'birth_date'},
    {id:'passport_series',label:'Серия паспорта',type:'text',required:false,ocrKey:'series'},
    {id:'passport_number',label:'Номер паспорта',type:'text',required:true,ocrKey:'document_number'},
    {id:'passport_issuer',label:'Кем выдан паспорт',type:'textarea',required:true,ocrKey:'issued_by'},
    {id:'passport_date',label:'Дата выдачи паспорта',type:'date',required:true,ocrKey:'issue_date'},
    {id:'passport_code',label:'Код подразделения',type:'text',required:false,ocrKey:'subdivision'},
    {id:'registration_address',label:'Адрес регистрации',type:'textarea',required:true,ocrKey:''},
    {id:'snils',label:'СНИЛС',type:'text',required:false,ocrKey:''},
    {id:'phone',label:'Телефон водителя',type:'tel',required:true,ocrKey:''},
    {id:'driver_license',label:'Номер водительского удостоверения',type:'text',required:false,ocrKey:''},
    {id:'citizenship',label:'Гражданство',type:'text',required:false,ocrKey:''},
  ].map(field => ({...field, options:[]})),
  documents: [
    {id:'passport_main',label:'Паспорт — основной разворот',type:'passport',required:true},
    {id:'passport_registration',label:'Паспорт — регистрация',type:'passport_registration',required:false},
    {id:'driver_license_front',label:'Водительское удостоверение',type:'driver_license_front',required:false},
    {id:'snils',label:'СНИЛС',type:'snils',required:false},
  ],
};
