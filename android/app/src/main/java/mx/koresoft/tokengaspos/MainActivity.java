package mx.koresoft.tokengaspos;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends BridgeActivity {

  private NfcAdapter nfcAdapter;
  private final AtomicBoolean nfcLock = new AtomicBoolean(false); // evita lecturas repetidas

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Mantener pantalla encendida y bloquear screenshots
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
   // getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);

    nfcAdapter = NfcAdapter.getDefaultAdapter(this);

    // ⬅️ Exponer API JS para rearmar y re-habilitar el lector desde Angular
    getBridge().getWebView().addJavascriptInterface(new NfcJsApi(), "NativeNfc");
  }

  @Override
  public void onResume() {
    super.onResume();
    enableReaderMode();
    nfcLock.set(false); // rearmar el candado al volver a primer plano
  }

  @Override
  public void onPause() {
    super.onPause();
    disableReaderMode();
  }

  private void enableReaderMode() {
    if (nfcAdapter == null) return;
    nfcLock.set(false); // rearmar por si venimos de reset

    int flags =
        NfcAdapter.FLAG_READER_NFC_A
      | NfcAdapter.FLAG_READER_NFC_B
      | NfcAdapter.FLAG_READER_NFC_F
      | NfcAdapter.FLAG_READER_NFC_V
      | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
      | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS; // ⬅️ sin beep/sistema

    nfcAdapter.enableReaderMode(this, this::onTagDiscovered, flags, null);
  }

  private void disableReaderMode() {
    if (nfcAdapter == null) return;
    try { nfcAdapter.disableReaderMode(this); } catch (Exception ignore) {}
  }

  private void onTagDiscovered(Tag tag) {
    // SOLO procesar la primera lectura hasta rearmar
    if (!nfcLock.compareAndSet(false, true)) return;

    try {
      // UID
      byte[] id = tag.getId();
      String uidHex = bytesToHex(id);

      // Tech list
      String[] techs = tag.getTechList();
      JSONArray techArr = new JSONArray();
      for (String t : techs) {
        int idx = t.lastIndexOf('.');
        techArr.put(idx >= 0 ? t.substring(idx + 1) : t);
      }

      // NDEF (si hay)
      JSONArray records = new JSONArray();
      try {
        Ndef ndef = Ndef.get(tag);
        if (ndef != null) {
          ndef.connect();
          NdefMessage msg = ndef.getNdefMessage();
          if (msg != null) {
            for (NdefRecord r : msg.getRecords()) {
              JSONObject rec = new JSONObject();
              rec.put("tnf", r.getTnf());
              rec.put("type", new String(r.getType()));
              rec.put("payloadHex", bytesToHex(r.getPayload()));
              String text = decodeNdefText(r);
              if (text != null) rec.put("payloadText", text);
              records.put(rec);
            }
          }
          try { ndef.close(); } catch (Exception ignore) {}
        }
      } catch (Exception ignore) {}

      // JSON final
      JSONObject detail = new JSONObject();
      detail.put("uid", uidHex);
      detail.put("tech", techArr);
      detail.put("records", records);

      // Emitir a la WebView (evento JS)
      String js = "window.dispatchEvent(new CustomEvent('nfc:tag', { detail: " +
                  detail.toString() + " }));";

      runOnUiThread(() ->
        getBridge().getWebView().evaluateJavascript(js, (ValueCallback<String>) null)
      );

      // IMPORTANTE: NO deshabilitar reader aquí. El lock ya bloquea repetidos
      // disableReaderMode(); // (déjalo comentado)

    } catch (Exception ignore) {}
  }

  private static String bytesToHex(byte[] bytes) {
    if (bytes == null) return "";
    StringBuilder sb = new StringBuilder();
    for (byte b : bytes) sb.append(String.format("%02X", b));
    return sb.toString();
  }

  private static String decodeNdefText(NdefRecord record) {
    try {
      short tnf = record.getTnf();
      byte[] type = record.getType();
      if (tnf == NdefRecord.TNF_WELL_KNOWN && java.util.Arrays.equals(type, NdefRecord.RTD_TEXT)) {
        byte[] payload = record.getPayload();
        if (payload == null || payload.length == 0) return null;
        int status = payload[0] & 0xFF;
        int langLen = status & 0x3F;
        int textStart = 1 + langLen;
        int textLen = payload.length - textStart;
        return new String(payload, textStart, textLen, java.nio.charset.StandardCharsets.UTF_8);
      }
    } catch (Exception ignore) {}
    return null;
  }

  // API expuesta a JS (Angular) para rearmar desde la UI
  private final class NfcJsApi {
    @JavascriptInterface
    public void reset() {
      nfcLock.set(false);
    }

    @JavascriptInterface
    public void restart() {
      runOnUiThread(() -> {
        nfcLock.set(false);
        enableReaderMode();
      });
    }
  }

  // Por si luego lo llamas desde un Plugin Capacitor
  public void resetNfcLock() { nfcLock.set(false); }
}
