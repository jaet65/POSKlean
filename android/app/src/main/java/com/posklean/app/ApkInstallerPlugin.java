package com.posklean.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    private static final String TAG = "ApkInstaller";

    @PluginMethod
    public void canRequestPackageInstalls(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ret.put("canInstall", getContext().getPackageManager().canRequestPackageInstalls());
        } else {
            ret.put("canInstall", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("url");
        String fileName = call.getString("fileName", "POSKlean-update.apk");
        String token = call.getString("token", "");

        if (downloadUrl == null || downloadUrl.isEmpty()) {
            call.reject("URL de descarga no proporcionada");
            return;
        }

        // Ejecutar descarga en segundo plano
        new Thread(() -> {
            HttpURLConnection connection = null;
            InputStream input = null;
            FileOutputStream output = null;
            try {
                URL url = new URL(downloadUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "POSKlean-Updater");
                if (token != null && !token.isEmpty()) {
                    connection.setRequestProperty("Authorization", "Bearer " + token);
                    connection.setRequestProperty("Accept", "application/octet-stream");
                }
                connection.connect();

                // Manejar posibles redirecciones manuales (ej: de api.github.com hacia GitHub Releases S3)
                int status = connection.getResponseCode();
                if (status == HttpURLConnection.HTTP_MOVED_TEMP || status == HttpURLConnection.HTTP_MOVED_PERM || status == 307 || status == 308) {
                    String redirectUrl = connection.getHeaderField("Location");
                    if (redirectUrl != null) {
                        connection.disconnect();
                        url = new URL(redirectUrl);
                        connection = (HttpURLConnection) url.openConnection();
                        connection.setRequestProperty("User-Agent", "POSKlean-Updater");
                        // Si la redirección es a AWS S3 (pre-firmada por GitHub), NO enviar el header Authorization de GitHub
                        if (token != null && !token.isEmpty() && redirectUrl.contains("api.github.com")) {
                            connection.setRequestProperty("Authorization", "Bearer " + token);
                            connection.setRequestProperty("Accept", "application/octet-stream");
                        }
                        connection.connect();
                    }
                }

                int fileLength = connection.getContentLength();
                File targetDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (targetDir == null) {
                    targetDir = getContext().getCacheDir();
                }
                File apkFile = new File(targetDir, fileName);

                if (apkFile.exists()) {
                    apkFile.delete();
                }

                input = connection.getInputStream();
                output = new FileOutputStream(apkFile);

                byte[] data = new byte[8192];
                long total = 0;
                int count;
                long lastProgressTime = 0;

                while ((count = input.read(data)) != -1) {
                    total += count;
                    output.write(data, 0, count);

                    long now = System.currentTimeMillis();
                    if (fileLength > 0 && (now - lastProgressTime > 250)) {
                        lastProgressTime = now;
                        int percent = (int) ((total * 100) / fileLength);
                        JSObject progress = new JSObject();
                        progress.put("percent", percent);
                        progress.put("transferred", total);
                        progress.put("total", fileLength);
                        notifyListeners("downloadProgress", progress);
                    }
                }

                output.flush();

                // Notificar 100% de descarga completada
                JSObject progressDone = new JSObject();
                progressDone.put("percent", 100);
                progressDone.put("transferred", total);
                progressDone.put("total", total);
                notifyListeners("downloadProgress", progressDone);

                // Lanzar la instalación nativa
                launchInstaller(apkFile, call);

            } catch (Exception e) {
                Log.e(TAG, "Error al descargar APK", e);
                call.reject("Error durante la descarga: " + e.getMessage());
            } finally {
                try {
                    if (output != null) output.close();
                    if (input != null) input.close();
                    if (connection != null) connection.disconnect();
                } catch (Exception ignored) {}
            }
        }).start();
    }

    private void launchInstaller(File apkFile, PluginCall call) {
        try {
            Context context = getContext();
            Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apkFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            context.startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Instalador iniciado");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error al lanzar instalador", e);
            call.reject("No se pudo iniciar el instalador de Android: " + e.getMessage());
        }
    }
}
