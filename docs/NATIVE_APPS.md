# Приложения ЕЦЛ для macOS, Windows, Android и iOS

`native/` — общий проект Tauri 2. Интерфейс ЕЦЛ входит в установочный пакет; сетевые запросы, проверку адреса сервера и TLS, настройки подключения, сессионные cookies и сохранение документов обрабатывает Rust. Сервер NestJS, PostgreSQL и интеграция с 1С остаются общими для веб-версии и приложений.

Это клиент существующего сервера. База данных, Node.js и 1С в установочные пакеты не включаются. Для работы с данными сервер должен быть доступен. Сборка под каждую платформу и проверка на устройстве — отдельные этапы: наличие исходников и workflow не означает, что все четыре приложения уже проверены на реальных устройствах.

## Сборки и обновления

Начиная с **0.1.1** клиент сам проверяет GitHub Releases при запуске, каждые 30 минут и при возврате в приложение. macOS и Windows скачивают подписанное обновление в фоне и подсвечивают кнопку «Перезапустить и обновить». Android скачивает проверенный APK и открывает системное подтверждение установки. iOS использует настроенную страницу App Store/TestFlight; прямой замены приложения из GitHub на iPhone нет.

Версию 0.1.0 нужно один раз заменить установщиком с новым механизмом. После этого ручное скачивание очередных пакетов не требуется. Публичный канал работает: [первый подписанный релиз 0.1.1](https://github.com/alexandrosstagiros-png/eclapp/releases/tag/v0.1.1). Инструкция по ключам, GitHub Actions и выпуску: [NATIVE_UPDATES.md](NATIVE_UPDATES.md).

## Проверенные результаты 0.1.1

| Платформа | Результат | Что проверено |
| --- | --- | --- |
| macOS Apple Silicon и Intel | [Universal DMG](https://github.com/alexandrosstagiros-png/eclapp/releases/download/v0.1.1/ECL_0.1.1_universal.dmg), приложение установлено в `~/Applications/ECL.app` | Подпись ad-hoc, целостность DMG, запуск на Apple Silicon, соединение с локальным сервером и публичным каналом обновлений |
| Windows x64 | [NSIS-установщик](https://github.com/alexandrosstagiros-png/eclapp/releases/download/v0.1.1/ECL_0.1.1_x64-setup.exe) | Кросс-компиляция и упаковка, формат PE, криптографическая подпись обновления и версия; на Windows не запускалось |
| Android arm64 | [APK, 10,8 МиБ](https://github.com/alexandrosstagiros-png/eclapp/releases/download/v0.1.1/ECL_0.1.1_arm64.apk), оптимизированная сборка с постоянной release-подписью | Подпись APK v2/v3, подпись обновления и версия, выравнивание 16 КБ, Kotlin updater и ограниченный FileProvider; на телефоне не запускалось |
| iOS Simulator | Приложение скомпилировано в GitHub Actions с полным Xcode | Локально полного Xcode нет; установка на iPhone и IPA требуют настройки Apple signing, App Store/TestFlight |

Проверки кода: 22 Rust-теста, 31 JS-тест нативного клиента и 318 тестов основного приложения прошли (1 необязательный тест пропущен). Проверена сборка web; общий GitHub CI прошёл API integration, inspection и onboarding. Интерфейс updater проверен в DOM на desktop и ширине 390 px: подтверждение/отмена перезапуска, повтор установки Android и обработка ошибок. Ранее отдельный тест с временным PostgreSQL и синтетическим аккаунтом проверил вход, получение профиля, обновление сессии и выход через настоящий Rust HTTP-клиент. Рабочие данные и пароль пользователя не использовались.

Локальные копии установщиков находятся в `native/artifacts/`; версии и контрольные суммы записаны в `build-info.json` и `SHA256SUMS.txt`. Все три пакета обновления подписаны одним ключом Tauri и проверены криптографически. Mac-сборка не нотариализована Apple, Windows-установщик не имеет Authenticode-подписи. Intel Mac, Windows и физические телефоны требуют отдельной проверки.

## Подключение к локальной версии на этом Mac

На первом запуске выбран адрес **http://127.0.0.1:18514**. Подтвердите его в настройке подключения и войдите обычным аккаунтом ЕЦЛ. При необходимости сервер запускается из корня репозитория:

```sh
node integrations/local-app/manage.cjs start
node integrations/local-app/manage.cjs status
```

Установленный клиент сам не запускает сервер. Управление сервером и местонахождение локальных данных описаны в [руководстве локального приложения](../integrations/local-app/README.md).

Для запуска сервера и приложения одной командой используйте `npm run start:local` из `native/` или файл `native/Открыть ЕЦЛ.command`. Он вызывает существующий менеджер локальной установки и открывает собранный `ECL.app`.

Установленная версия доступна в Finder → домашняя папка → Applications → ECL. Для подключения достаточно обычного аккаунта ЕЦЛ; приложение уже настроено на локальную версию этого Mac.

`127.0.0.1` всегда обозначает устройство, на котором открыто приложение. На Windows это Windows-компьютер, на Android — телефон, на iPhone — iPhone. Чтобы эти устройства работали с сервером на Mac, нужен доступный им адрес **HTTPS с действительным сертификатом**. Его можно задать на экране подключения. Существующий сервер остаётся доступным только на Mac: приложение не открывает его в локальную сеть и не создаёт туннель автоматически.

Для разработки на Android с подключённым USB-устройством можно явно пробросить loopback через ADB, не открывая сервер в сеть:

```sh
adb reverse tcp:18514 tcp:18514
```

После этого установленный Android-клиент может использовать `http://127.0.0.1:18514`, пока ADB-соединение активно. iOS Simulator на этом Mac может обращаться к loopback Mac; физический iPhone требует отдельного доступного HTTPS-адреса.

Установленные в ходе этой работы Android-инструменты находятся только в `.local/native-tools/`. На этом Mac их окружение включается командой `source .local/native-tools/env.sh` из корня проекта; после этого доступны `adb` и команды сборки. Локальная кросс-компиляция Windows использует `source .local/native-tools/windows/env.sh`. Эти каталоги с SDK и кэшем не входят в Git.

## Что перенесено в Rust

- `native/crates/ecl-native-core` проверяет адрес сервера, разрешает HTTP только на loopback, выполняет запросы только к `/api/v1/` выбранного сервера и ограничивает объём передаваемых данных. Проверка TLS не отключается, сетевые перенаправления не используются для обхода выбранного сервера.
- `native/src-tauri` создаёт окно, предоставляет ограниченные команды интерфейсу, открывает внешние ссылки в системных приложениях и сохраняет скачанные документы через системный выбор файла.
- `native/frontend` связывает обычные запросы интерфейса с Rust, показывает настройку подключения и состояние сети. Общие экраны ЕЦЛ берутся из текущих исходников веб-приложения.

В файле настроек сохраняется адрес сервера. Пароль и сессионные cookies не записываются в этот файл; сессия хранится в памяти процесса, поэтому после полного закрытия приложения требуется повторный вход. Смена сервера завершает сессию и очищает локальные данные интерфейса, чтобы не смешивать данные разных серверов. В этой версии нет фонового GPS, системных push-уведомлений и полноценной синхронизации всех операций без сети.

## Общие требования

Нужны Node.js 22, npm и Rust через rustup. Перед первой платформенной сборкой установите также зависимости общего веб-проекта: `npm ci --prefix recovered` из корня репозитория. Для платформенных зависимостей см. [официальные требования Tauri](https://v2.tauri.app/start/prerequisites/). Установка npm-зависимостей из корня репозитория:

```sh
npm ci --prefix recovered
cd native
npm ci
npm test
cargo test --locked -p ecl-native-core
```

Версии npm и Cargo зафиксированы lock-файлами. `npm run prepare:web` создаёт `native/dist` из исходников ЕЦЛ; Tauri вызывает его перед сборкой автоматически. Секреты и база из `.local/` в интерфейс не копируются.

## macOS

Для настольной сборки нужны Xcode Command Line Tools. Полный Xcode нужен дополнительно для iOS.

Минимальная поддерживаемая macOS — **12.3**, iOS — **15.4**: установочный экран использует системный WebKit с поддержкой HTML dialog.

```sh
cd native
npm ci
npm run build -- --bundles app,dmg
```

Результат сборки для архитектуры текущего Mac:

- `native/target/release/bundle/macos/ECL.app`
- `native/target/release/bundle/dmg/*.dmg`

Для Intel и Apple Silicon в одном установщике:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run build -- --target universal-apple-darwin --bundles app,dmg
```

Эти файлы находятся в `native/target/universal-apple-darwin/release/bundle/`. CI использует ad-hoc подпись для тестирования. Для распространения с проверкой издателя нужны сертификат Developer ID, подпись и нотариализация Apple; см. [подпись macOS](https://v2.tauri.app/distribute/sign/macos/).

## Windows

Собирайте на Windows с Visual Studio Build Tools, компонентом Desktop development with C++, Rust MSVC и WebView2 согласно требованиям Tauri.

```powershell
cd native
npm ci
npm run build -- --target x86_64-pc-windows-msvc --bundles nsis
```

Установщик: `native/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe`. Тестовая сборка не имеет сертификата издателя. Для коммерческого распространения настройте [подпись Windows](https://v2.tauri.app/distribute/sign/windows/) своим сертификатом. Обновления подписываются отдельным ключом Tauri и устанавливаются кнопкой внутри приложения.

## Android

Нужны Android SDK Platform 36, Build-Tools 36.0.0, Platform-Tools, Command-line Tools, NDK и JDK. CI использует **JDK 21** и **NDK 27.2.12479018**. Пример переменных для macOS с Android Studio:

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.2.12479018"
rustup target add aarch64-linux-android
cd native
npm ci
npm run android:init -- --ci --skip-targets-install
npm run android:build -- --ci --debug --apk --target aarch64
```

Готовый debug APK находится в `native/src-tauri/gen/android/app/build/outputs/apk/` во вложенном каталоге выбранного варианта. Его можно установить через `adb install -r <путь-к-apk>`. Он подписан тестовым ключом Android, пригоден для проверки и не является выпуском Google Play. Для эмулятора x86_64 дополнительно установите Rust target `x86_64-linux-android` и используйте `--target x86_64`.

В этой поставке `native/artifacts/ECL-Android-arm64.apk` — оптимизированный **release APK 0.1.1**, подписанный постоянным ключом для GitHub-обновлений. Он занимает 10,8 МиБ, не включает флаг `debuggable` и требует Android 7.0 или новее. Это не выпуск Google Play. Предыдущий локальный APK 0.1.0 имел другой тестовый ключ; переход с него требует однократной замены, если он был установлен. Начиная с 0.1.1 сохраняйте application ID и release keystore для установки обновлений поверх приложения.

`mobile.cjs` добавляет разрешения камеры и микрофона для фото, голосовых сообщений и видеозаписи; камера необязательна для установки. Android запрашивает доступ при использовании соответствующей функции. Выбор существующего файла выполняется системным диалогом без доступа ко всему хранилищу. Геолокация и фоновые разрешения не запрашиваются. Политика Android запрещает обычный HTTP вне loopback; Rust применяет ту же проверку для запросов к серверу.

На этом Mac стандартный Google Maven вернул HTTP 404 для `androidx.lifecycle:lifecycle-viewmodel:2.6.2`. Успешная сборка использовала тот же артефакт с альтернативного официального адреса `https://dl.google.com/android/maven2/` в сгенерированных Gradle-репозиториях. Версии зависимостей не менялись. Эта локальная настройка не переносится после удаления `src-tauri/gen/android`; при повторении такой ошибки потребуется снова выбрать этот адрес Google Maven.

Android-библиотека собирается с выравниванием 16 КБ через `build.rs`, чтобы поддерживать устройства с размером страницы памяти 16 КБ при использовании NDK r27. Проверка артефакта: `llvm-readelf -lW libecl_native_lib.so` должна показывать `Align 0x4000` для сегментов `LOAD`, а `zipalign -c -P 16 -v 4 app.apk` — успешную проверку APK. См. [требования Android](https://developer.android.com/guide/practices/page-sizes).

Для выпуска AAB нужно настроить upload key и подпись Gradle по [инструкции Tauri](https://v2.tauri.app/distribute/sign/android/), затем собрать `npm run android:build -- --aab --target aarch64`. Ключи и пароли не добавляйте в Git. Application ID публичного APK — `ru.ecl.workspace`; его изменение создаст отдельное приложение и нарушит обновление существующих установок. Публикация через Play Console здесь не выполняется.

## iOS

Нужны macOS, **полный Xcode с iOS SDK**, CocoaPods и Rust targets. Одних Xcode Command Line Tools недостаточно.

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
cd native
npm ci
npm run ios:init -- --ci --skip-targets-install
npm run ios:build -- --ci --debug --no-sign --target aarch64-sim
```

На Intel Mac для симулятора используется `--target x86_64`. Сборка симулятора находится в `native/src-tauri/gen/apple/build/arm64/ECL.app` или `build/x86_64/ECL.app`. Для установки в запущенный симулятор:

```sh
xcrun simctl install booted src-tauri/gen/apple/build/arm64/ECL.app
xcrun simctl launch booted ru.ecl.workspace
```

Симулятор не заменяет проверку камеры и микрофона на физическом iPhone. Описания доступа задаются в `native/src-tauri/Info.plist`; сетевые исключения для недоверенных сертификатов не добавляются.

Для физического iPhone настройте Apple Team, signing identity и provisioning profile в созданном Xcode-проекте либо через настройки Tauri, затем используйте `npm run ios:build -- --target aarch64`. Для TestFlight/App Store требуются соответствующая учётная запись, сертификаты, профили, регистрация bundle ID и проверка Apple. Подробности: [подпись iOS](https://v2.tauri.app/distribute/sign/ios/) и [App Store](https://v2.tauri.app/distribute/app-store/). CI создаёт только приложение симулятора, его нельзя установить на физический iPhone.

## Сборка в GitHub Actions

Workflow [Native applications](../.github/workflows/native-build.yml) запускается вручную через Actions → Run workflow и при PR с изменением нативного клиента или его веб-исходников. Он готовит:

| Артефакт | Назначение |
| --- | --- |
| `ECL-macOS-universal` | DMG и архив `.app` для Intel и Apple Silicon, ad-hoc подпись |
| `ECL-Windows-x64` | NSIS-установщик без сертификата издателя |
| `ECL-Android-arm64-debug` | Тестовый APK для Android arm64 |
| `ECL-iOS-simulator` | Архив `.app` для симулятора архитектуры CI runner |

Артефакты сохраняются на 14 дней. Workflow ничего не публикует в магазинах и не создаёт GitHub Release. Он не использует сертификаты, пароли сервера или локальную базу. Успешный запуск CI подтверждает сборку соответствующей платформы; функциональные проверки входа, документов и камеры на физических устройствах выполняются отдельно.

`src-tauri/gen/android` и `src-tauri/gen/apple` генерируются локально и исключены из Git. Используйте `android:init`, `android:build`, `ios:init`, `ios:build` вместо прямого вызова Tauri: эти команды проверяют инструменты и применяют настройки разрешений. Повторный `init` сохраняет существующий проект и повторяет только настройки ЕЦЛ. После обновления CLI сохраните собственные изменения сгенерированного проекта, переместите соответствующий каталог `gen/` и выполните `init` заново. Платформенные изменения, которые должны пережить генерацию, вносите в конфигурацию Tauri или `native/scripts/mobile.cjs`.
