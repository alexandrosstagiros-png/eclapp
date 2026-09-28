# Оформление: контракт разработки

Все маршруты ниже имеют префикс `/api/v1`. Авторизованные запросы используют существующий Bearer. Ссылки кандидата: `/#onboarding=<token>`; токен только в fragment и POST body, не в query/localStorage. Новый модуль не добавляет паспортные данные в общие карточки кандидатов или журналы.

## Структуры

- Template: `{id,version,responsibilityScopeId,name,destination,employmentType,description,privacyNotice,active,fields,documents,createdAt,updatedAt}`. employmentType: `employee|ip|self_employed`. Field: `{id,label,type,required,options,ocrKey}`; type: `text|textarea|date|tel|select`; options массив строк, ocrKey необязательная строка. Document: `{id,label,type,required}`; type: `passport|passport_registration|driver_license_front|driver_license_back|vehicle_registration_front|vehicle_registration_back|snils|other`.
- Session: `{id,version,templateId,templateSnapshot,candidateId,candidateName,status,values,createdBy,createdAt,updatedAt,linkExpiresAt,linkActive,photos}`. status: `draft|submitted|verified`. values — объект строк по field.id. candidateId опционален; candidateName для списка, не передаётся публично. photos только метаданные, без base64/сырого OCR.
- Photo: `{id,sessionId,documentId,documentType,label,mimeType,byteSize,uploadedAt,expiresAt,reviewedAt,deletedAt,deletionReason,ocrStatus}`. ocrStatus: `pending|recognized|failed`. Исходники уничтожаются через 72 часа после загрузки вне зависимости от проверки. Отмеченные проверенными фото можно удалить сразу. Поля values сохраняются отдельно.

## Сотрудник

- GET `/recruitment/onboarding/context` -> `{templates,sessions,canManageTemplates,ocr,retentionHours:72,storageConfigured,cleanup,truncated}`. По умолчанию ocr `{configured,provider:'vk',...}`; configured означает наличие серверной настройки, а не проверку баланса или подключения. Только внутренние роли с доступом к ПД. Рекрутер видит свои оформления; manager/access_admin — компанию. Конструктор manager/access_admin. Список ограничен последними 1000 оформлениями; при усечении возвращается truncated.
- PUT `/recruitment/onboarding/templates` body Template (новый UUID,version:0) -> Template.
- POST `/recruitment/onboarding/sessions` body `{templateId,candidateId?}` -> Session. Снимок формы неизменяем.
- GET `/recruitment/onboarding/sessions/:id` -> Session.
- PUT `/recruitment/onboarding/sessions/:id` body `{version,values}` -> Session.
- POST `/recruitment/onboarding/sessions/:id/link` body `{}` -> `{token,expiresAt}`. Срок 7 дней, предыдущая ссылка отзывается.
- POST `/recruitment/onboarding/sessions/:id/revoke-link` body `{}` -> `{ok:true}`.
- POST `/recruitment/onboarding/sessions/:id/photos` body `{documentId,mimeType,base64}` -> Photo (JPEG/PNG <=10MiB).
- GET `/recruitment/onboarding/photos/:id/content` -> авторизованный binary no-store (UI через fetch Blob).
- POST `/recruitment/onboarding/photos/:id/recognize` body `{}` -> `{text,fields,model}`; ответ только сотруднику. VK возвращает поля основной страницы паспорта в общих ключах конструктора, для остальных документов — текст. Перенос через ocrKey требует ручной проверки; соответствие ключей описано в [VK_OCR.md](VK_OCR.md). Автоматического переключения между облаками нет.
- POST `/recruitment/onboarding/photos/:id/review` body `{}` -> Photo.
- POST `/recruitment/onboarding/sessions/:id/verify` body `{version,values}` -> Session; проверяет обязательные поля и наличие проверенных требуемых документов. Завершение отзывает публичную ссылку.
- POST `/recruitment/onboarding/photos/delete` body `{photoIds:[uuid...]}` -> `{deleted:number}`; только проверенные фото, транзакционная проверка всех прав.

## Кандидат (без сессии сотрудника)

- POST `/recruitment-onboarding/preview` body `{token}` -> `{template,expiresAt,retentionHours:72}`. Только форма, никаких ранее заполненных значений/фото.
- POST `/recruitment-onboarding/upload` body `{token,documentId,mimeType,base64}` -> Photo (без возможности просмотреть серверные фото).
- POST `/recruitment-onboarding/submit` body `{token,values}` -> `{ok:true}`. Проверяет обязательные поля/фото; одноразовая отправка отзывает ссылку. Кандидат вводит поля вручную, распознавание и проверку выполняет сотрудник после отправки.

Шаблоны берутся из доступных проектов `/recruitment/context`. Кандидата можно выбирать в существующем рекрутинге и передавать в оформление. UI: самостоятельный раздел «Оформление» в левом меню под «Рекрутингом» с подразделами «Анкеты», «Договоры», «Конструктор анкет», «Шаблоны договоров», «Фотографии». Камера использует существующий attachment-photos.js либо getUserMedia с запасным input capture; снимок показывается до загрузки. Публичная форма подключается в корне приложения до экрана входа.

Сохранение полей, загрузка и проверка фото сотрудником отзывают выданную ссылку. Отзыв прав выдавшего ссылку сотрудника закрывает публичный доступ. Для завершения оформления обязательный документ должен иметь проверку последнего загруженного снимка; после проверки снимок можно удалить, отметка сохранится. Фото закрываются для чтения через 72 часа от загрузки, физическое удаление выполняется каждые 60 секунд и при запуске сервера. Это правило относится к хранилищу приложения; срок у внешнего OCR-провайдера согласуется отдельно.

Контракты договоров и их снимки версий описаны отдельно в [RECRUITMENT_CONTRACTS.md](RECRUITMENT_CONTRACTS.md). Подписанные файлы договоров не относятся к временному хранилищу фотографий анкет.
