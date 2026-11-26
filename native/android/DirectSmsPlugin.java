package pk.timecraft.app;

import android.Manifest;
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
