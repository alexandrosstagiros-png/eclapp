package ru.ecl.workspace.updates

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class InstallUpdateArgs {
    lateinit var path: String
}

// A separate provider keeps update APK sharing limited to cache/updates/.
class UpdateFileProvider : FileProvider()

@TauriPlugin
class UpdatesPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun installUpdate(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(InstallUpdateArgs::class.java)
            val apk = File(args.path).canonicalFile
            val expected = File(activity.cacheDir, "updates/ECL-update.apk").canonicalFile
            require(apk == expected && apk.isFile && apk.length() > 0) {
                "Файл обновления не найден. Проверьте обновления ещё раз."
            }

            // Rust verifies the downloaded update signature. Android still checks
            // the package, increasing version code and installed app signing key.
            val manager = activity.packageManager
            val candidate = manager.getPackageArchiveInfo(apk.path, 0)
                ?: throw IllegalArgumentException("Не удалось прочитать APK обновления.")
            require(candidate.packageName == activity.packageName) {
                "Обновление предназначено для другого приложения."
            }
            val installed = manager.getPackageInfo(activity.packageName, 0)
            val candidateVersion = if (Build.VERSION.SDK_INT >= 28) candidate.longVersionCode else candidate.versionCode.toLong()
            val installedVersion = if (Build.VERSION.SDK_INT >= 28) installed.longVersionCode else installed.versionCode.toLong()
            require(candidateVersion > installedVersion) {
                "Версия обновления должна быть новее установленной."
            }

            activity.runOnUiThread {
                try {
                    if (Build.VERSION.SDK_INT >= 26 && !manager.canRequestPackageInstalls()) {
                        activity.startActivity(Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:${activity.packageName}")
                        ))
                        invoke.resolve(JSObject().put("status", "permissionRequired"))
                    } else {
                        val uri = FileProvider.getUriForFile(
                            activity,
                            "${activity.packageName}.ecl.updates",
                            apk
                        )
                        val intent = Intent(Intent.ACTION_VIEW)
                            .setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        activity.startActivity(intent)
                        // Opening the system installer is not a successful install.
                        invoke.resolve(JSObject().put("status", "installerOpened"))
                    }
                } catch (error: Exception) {
                    invoke.reject(error.message ?: "Не удалось открыть установщик Android.")
                }
            }
        } catch (error: Exception) {
            invoke.reject(error.message ?: "Не удалось подготовить обновление Android.")
        }
    }
}
