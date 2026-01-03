package mx.koresoft.tokengaspos;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.util.UUID;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

@CapacitorPlugin(name = "AppKeys")
public class AppKeysPlugin extends Plugin {

  private static final String KEYSTORE = "AndroidKeyStore";
  private static final String KEY_ALIAS = "tokengas_app_signing_key";
  private static final String PREFS = "tokengas_appkeys";
  private static final String PREF_KID = "kid";

  @PluginMethod
  public void ensure(PluginCall call) {
    try {
      ensureKeyPair();
      ensureKid();
      JSObject out = new JSObject();
      out.put("ok", true);
      call.resolve(out);
    } catch (Exception e) {
      call.reject("ENSURE_FAILED: " + e.getMessage(), e);
    }
  }

  @PluginMethod
  public void getKid(PluginCall call) {
    try {
      String kid = ensureKid();
      JSObject out = new JSObject();
      out.put("kid", kid);
      call.resolve(out);
    } catch (Exception e) {
      call.reject("GET_KID_FAILED: " + e.getMessage(), e);
    }
  }

  @PluginMethod
  public void sign(PluginCall call) {
    String payload = call.getString("payload");
    if (payload == null || payload.isEmpty()) {
      call.reject("MISSING_PAYLOAD");
      return;
    }

    try {
      ensureKeyPair();
      String kid = ensureKid();

      KeyStore ks = KeyStore.getInstance(KEYSTORE);
      ks.load(null);
      KeyStore.Entry entry = ks.getEntry(KEY_ALIAS, null);
      KeyStore.PrivateKeyEntry pkEntry = (KeyStore.PrivateKeyEntry) entry;

      Signature sig = Signature.getInstance("SHA256withECDSA");
      sig.initSign(pkEntry.getPrivateKey());
      sig.update(payload.getBytes(StandardCharsets.UTF_8));
      byte[] der = sig.sign();

      JSObject out = new JSObject();
      out.put("kid", kid);
      out.put("signature", base64Url(der));
      call.resolve(out);

    } catch (Exception e) {
      call.reject("SIGN_FAILED: " + e.getMessage(), e);
    }
  }

  private void ensureKeyPair() throws Exception {
    KeyStore ks = KeyStore.getInstance(KEYSTORE);
    ks.load(null);
    if (ks.containsAlias(KEY_ALIAS)) return;

    KeyPairGenerator kpg = KeyPairGenerator.getInstance(
      KeyProperties.KEY_ALGORITHM_EC,
      KEYSTORE
    );

    KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY
    )
      .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1")) // P-256
      .setDigests(KeyProperties.DIGEST_SHA256)
      .setUserAuthenticationRequired(false)
      .build();

    kpg.initialize(spec);
    kpg.generateKeyPair();
  }

  private String ensureKid() {
    Context ctx = getContext();
    SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String existing = prefs.getString(PREF_KID, null);
    if (existing != null && !existing.isEmpty()) return existing;

    String kid = "KID_" + UUID.randomUUID().toString().replace("-", "");
    prefs.edit().putString(PREF_KID, kid).apply();
    return kid;
  }

  private static String base64Url(byte[] bytes) {
    String b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
    return b64.replace("+", "-").replace("/", "_").replace("=", "");
  }
}
