#!/usr/bin/env node
// Generates external processing sources only; never connects to or starts 1C.
// API signatures: https://kb.1ci.com/1C_Enterprise_Platform/FAQ/Development/Integration/How_to_use_the_oData_protocol_when_publishing_an_infobase_to_web_server/
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const [outputDir, markerPath] = process.argv.slice(2);
if (!outputDir || !markerPath || process.argv.length !== 4 || !path.isAbsolute(outputDir) || !path.isAbsolute(markerPath) || /[\r\n\0]/u.test(markerPath)) {
  console.error('Usage: node build-setup-epf.mjs /absolute/output-directory /absolute/setup.marker');
  process.exit(1);
}

const processorName = 'LocalIntegrationODataSetup';
const formName = 'Form';
const xmlEscape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const bslString = (value) => `"${value.replaceAll('"', '""')}"`;
const declaration = '\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n';
const metadataNamespaces = 'xmlns="http://v8.1c.ru/8.3/MDClasses" xmlns:app="http://v8.1c.ru/8.2/managed-application/core" xmlns:cfg="http://v8.1c.ru/8.1/data/enterprise/current-config" xmlns:v8="http://v8.1c.ru/8.1/data/core" xmlns:xr="http://v8.1c.ru/8.3/xcf/readable" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="2.21"';
const formNamespaces = 'xmlns="http://v8.1c.ru/8.3/xcf/logform" xmlns:app="http://v8.1c.ru/8.2/managed-application/core" xmlns:cfg="http://v8.1c.ru/8.1/data/enterprise/current-config" xmlns:ent="http://v8.1c.ru/8.1/data/enterprise" xmlns:v8="http://v8.1c.ru/8.1/data/core" xmlns:v8ui="http://v8.1c.ru/8.1/data/ui" xmlns:xr="http://v8.1c.ru/8.3/xcf/readable" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="2.21"';
const synonym = (text) => `<Synonym><v8:item><v8:lang>ru</v8:lang><v8:content>${xmlEscape(text)}</v8:content></v8:item></Synonym>`;
const wrapMetadata = (content) => `${declaration}<MetaDataObject ${metadataNamespaces}>\n${content}\n</MetaDataObject>\n`;

// Explicit allowlist verified against .local/one-c-local/metadata.
const metadataObjects = [
  'Метаданные.Справочники.Водители',
  'Метаданные.Справочники.ТранспортныеСредства',
  'Метаданные.Справочники.Клиенты',
  'Метаданные.Справочники.ПроектыКлиентов',
  'Метаданные.Документы.СменаТранспорта',
  'Метаданные.Документы.ЗаявкаКлиента',
];

const moduleSource = `&НаСервере
Функция СоставСодержитОбъект(Состав, ОбъектМетаданных)
    Для Каждого ЭлементСостава Из Состав Цикл
        Если ЭлементСостава.ПолноеИмя() = ОбъектМетаданных.ПолноеИмя() Тогда
            Возврат Истина;
        КонецЕсли;
    КонецЦикла;
    Возврат Ложь;
КонецФункции

&НаСервере
Процедура ЗаписатьМаркерНаСервере(ТекстМаркера)
    Запись = Новый ЗаписьТекста(${bslString(markerPath)}, КодировкаТекста.UTF8);
    Запись.Записать(ТекстМаркера);
    Запись.Закрыть();
КонецПроцедуры

&НаСервере
Процедура НастроитьODataНаСервере()
    // Preserve the publication list. No catalog items or documents are written.
    ИсходныйСостав = ПолучитьСоставСтандартногоИнтерфейсаOData();
    НовыйСостав = Новый Массив;
    Для Каждого ОбъектМетаданных Из ИсходныйСостав Цикл
        НовыйСостав.Добавить(ОбъектМетаданных);
    КонецЦикла;
    ТребуемыеОбъекты = Новый Массив;
${metadataObjects.map((object) => `    ТребуемыеОбъекты.Добавить(${object});`).join('\n')}
    КоличествоДобавленных = 0;
    Для Каждого ОбъектМетаданных Из ТребуемыеОбъекты Цикл
        Если НЕ СоставСодержитОбъект(НовыйСостав, ОбъектМетаданных) Тогда
            НовыйСостав.Добавить(ОбъектМетаданных);
            КоличествоДобавленных = КоличествоДобавленных + 1;
        КонецЕсли;
    КонецЦикла;
    Если КоличествоДобавленных > 0 Тогда
        УстановитьСоставСтандартногоИнтерфейсаOData(НовыйСостав);
    КонецЕсли;
    ПроверенныйСостав = ПолучитьСоставСтандартногоИнтерфейсаOData();
    Для Каждого ОбъектМетаданных Из НовыйСостав Цикл
        Если НЕ СоставСодержитОбъект(ПроверенныйСостав, ОбъектМетаданных) Тогда
            ВызватьИсключение "OData publication verification failed: " + ОбъектМетаданных.ПолноеИмя();
        КонецЕсли;
    КонецЦикла;
    ТекстМаркера = "status=ok" + Символы.ПС
        + "before=" + Строка(ИсходныйСостав.Количество()) + Символы.ПС
        + "added=" + Строка(КоличествоДобавленных) + Символы.ПС
        + "after=" + Строка(ПроверенныйСостав.Количество()) + Символы.ПС;
    Для Каждого ОбъектМетаданных Из ТребуемыеОбъекты Цикл
        ТекстМаркера = ТекстМаркера + "verified=" + ОбъектМетаданных.ПолноеИмя() + Символы.ПС;
    КонецЦикла;
    ЗаписатьМаркерНаСервере(ТекстМаркера);
КонецПроцедуры

&НаКлиенте
Процедура ПриОткрытии(Отказ)
    Попытка
        НастроитьODataНаСервере();
    Исключение
        ТекстОшибки = ОписаниеОшибки();
        Попытка
            ЗаписатьМаркерНаСервере("status=error" + Символы.ПС + ТекстОшибки + Символы.ПС);
        Исключение
            Сообщить(ТекстОшибки);
            Сообщить(ОписаниеОшибки());
        КонецПопытки;
    КонецПопытки;
    ЗавершитьРаботуСистемы(Ложь);
КонецПроцедуры
`;

const files = new Map([
  [`${processorName}.xml`, wrapMetadata(`  <ExternalDataProcessor uuid="${randomUUID()}">
    <InternalInfo><xr:GeneratedType name="ExternalDataProcessorObject.${processorName}" category="Object"><xr:TypeId>${randomUUID()}</xr:TypeId><xr:ValueId>${randomUUID()}</xr:ValueId></xr:GeneratedType></InternalInfo>
    <Properties><Name>${processorName}</Name>${synonym('Настройка локального интерфейса OData')}<Comment/><DefaultForm>ExternalDataProcessor.${processorName}.Form.${formName}</DefaultForm><AuxiliaryForm/></Properties>
    <ChildObjects><Form>${formName}</Form></ChildObjects>
  </ExternalDataProcessor>`)],
  [`${processorName}/Ext/ObjectModule.bsl`, ''],
  [`${processorName}/Forms/${formName}.xml`, wrapMetadata(`  <Form uuid="${randomUUID()}">
    <Properties><Name>${formName}</Name>${synonym('Настройка OData')}<Comment/><FormType>Managed</FormType><IncludeHelpInContents>false</IncludeHelpInContents><UsePurposes><v8:Value xsi:type="app:ApplicationUsePurpose">PlatformApplication</v8:Value></UsePurposes><UseInInterfaceCompatibilityMode>Any</UseInInterfaceCompatibilityMode></Properties>
  </Form>`)],
  [`${processorName}/Forms/${formName}/Ext/Form.xml`, `${declaration}<Form ${formNamespaces}>
  <AutoCommandBar name="FormCommandBar" id="-1"/>
  <Events><Event name="OnOpen">ПриОткрытии</Event></Events>
  <Attributes/>
</Form>\n`],
  [`${processorName}/Forms/${formName}/Ext/Form/Module.bsl`, moduleSource],
]);

// Overwrite only these generated source files; never remove the output directory.
for (const [relativeName, content] of files) {
  const filename = path.join(outputDir, relativeName);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content, 'utf8');
}
console.log(path.join(outputDir, `${processorName}.xml`));
