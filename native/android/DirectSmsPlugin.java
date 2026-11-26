package pk.timecraft.app;

import android.Manifest;
import android.content.ContentValues;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import java.io.OutputStream;
import java.util.Base64;
import android.telephony.SmsManager;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

@CapacitorPlugin(name = "DirectSms", permissions = {
    @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS })
})
public class DirectSmsPlugin extends Plugin {

    @PluginMethod
    public void savePdf(PluginCall call) {
        String name = call.getString("fileName", "TimeCraft-Report.pdf");
        String encoded = call.getString("base64", "");
        if (encoded.isEmpty()) {
            call.reject("PDF data is empty");
            return;
        }
        try {
            byte[] data = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/TimeCraft");
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            }
            android.net.Uri uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("Could not create the PDF in Downloads");
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                if (output == null) throw new IllegalStateException("Could not open the PDF output");
                output.write(data);
                output.flush();
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, done, null, null);
            }
            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not save PDF: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        String phone = call.getString("phone", "").trim();
        String message = call.getString("message", "").trim();
        if (phone.isEmpty() || message.isEmpty()) {
            call.reject("Phone number and message are required");
            return;
        }
        if (!hasPermission("sms")) {
            requestPermissionForAlias("sms", call, "smsPermissionCallback");
            return;
        }
        sendNow(call, phone, message);
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permission was not granted");
            return;
        }
        sendNow(call, call.getString("phone", "").trim(), call.getString("message", "").trim());
    }

    private void sendNow(PluginCall call, String phone, String message) {
        try {
            SmsManager manager = SmsManager.getDefault();
            ArrayList<String> parts = manager.divideMessage(message);
            if (parts.size() == 1) manager.sendTextMessage(phone, null, message, null, null);
            else manager.sendMultipartTextMessage(phone, null, parts, null, null);
            JSObject result = new JSObject();
            result.put("submitted", true);
            result.put("parts", parts.size());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Android could not submit this SMS: " + error.getMessage(), error);
        }
    }
}
