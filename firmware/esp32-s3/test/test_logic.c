// Rechner-Tests für die Teile der Firmware ohne ESP-IDF: Zustandsautomat, LED-Muster,
// WAV-Kopf, gleicher Ursprung, Wiederholungsregeln.
//   cc -Wall -Wextra -Werror -I main -o /tmp/kb_logic test/test_logic.c main/kb_state.c main/kb_wav.c main/kb_url.c main/kb_settings_rules.c && /tmp/kb_logic
#include <stdio.h>
#include <string.h>

#include "kb_settings_rules.h"
#include "kb_state.h"
#include "kb_url.h"
#include "kb_wav.h"

static int fails;
#define CHECK(cond)                                                    \
    do {                                                               \
        if (!(cond)) {                                                 \
            printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);     \
            fails++;                                                   \
        }                                                              \
    } while (0)

static void test_state(void)
{
    // Stichproben aus der Tabelle des Pi-Clients
    CHECK(kb_state_can_transition(KB_STATE_BOOT, KB_STATE_WIFI_CONNECTING));
    CHECK(kb_state_can_transition(KB_STATE_BOOT, KB_STATE_MIC_OFF));
    CHECK(!kb_state_can_transition(KB_STATE_BOOT, KB_STATE_READY));
    CHECK(kb_state_can_transition(KB_STATE_READY, KB_STATE_RECORDING));
    CHECK(kb_state_can_transition(KB_STATE_RECORDING, KB_STATE_MIC_OFF));
    CHECK(!kb_state_can_transition(KB_STATE_UPLOADING, KB_STATE_MIC_OFF));
    CHECK(!kb_state_can_transition(KB_STATE_MIC_OFF, KB_STATE_RECORDING));
    CHECK(!kb_state_can_transition(KB_STATE_MIC_OFF, KB_STATE_ERROR));
    CHECK(kb_state_can_transition(KB_STATE_ERROR, KB_STATE_READY));
    CHECK(!kb_state_can_transition(KB_STATE_READY, KB_STATE_PLAYING));
    CHECK(!kb_state_can_transition(KB_STATE_READY, KB_STATE_COUNT));
    CHECK(!kb_state_can_transition((kb_state_t)-1, KB_STATE_READY));

    // Aus SHUTDOWN geht nichts mehr; jeder Zustand außer SHUTDOWN darf nach SHUTDOWN.
    int allowed = 0;
    for (int from = 0; from < KB_STATE_COUNT; from++) {
        CHECK(!kb_state_can_transition(KB_STATE_SHUTDOWN, (kb_state_t)from));
        CHECK(!kb_state_can_transition((kb_state_t)from, (kb_state_t)from));
        if (from != KB_STATE_SHUTDOWN) {
            CHECK(kb_state_can_transition((kb_state_t)from, KB_STATE_SHUTDOWN));
        }
        for (int to = 0; to < KB_STATE_COUNT; to++) {
            allowed += kb_state_can_transition((kb_state_t)from, (kb_state_t)to) ? 1 : 0;
        }
    }
    // Zahl der erlaubten Wechsel im Pi-Client: 3+4+5+5+4+4+4+2+3+0
    CHECK(allowed == 34);

    // Üblicher Ablauf einer Frage
    kb_state_t state = KB_STATE_BOOT;
    CHECK(kb_state_transition(&state, KB_STATE_WIFI_CONNECTING));
    CHECK(kb_state_transition(&state, KB_STATE_READY));
    CHECK(kb_state_transition(&state, KB_STATE_RECORDING));
    CHECK(kb_state_transition(&state, KB_STATE_UPLOADING));
    CHECK(kb_state_transition(&state, KB_STATE_PLAYING));
    CHECK(kb_state_transition(&state, KB_STATE_READY));
    // Unerlaubter Wechsel führt zu ERROR, nicht zum Weitermachen
    CHECK(!kb_state_transition(&state, KB_STATE_PLAYING));
    CHECK(state == KB_STATE_ERROR);
    CHECK(kb_state_transition(&state, KB_STATE_READY));
    CHECK(kb_state_transition(&state, KB_STATE_SHUTDOWN));
    CHECK(!kb_state_transition(&state, KB_STATE_READY));
    CHECK(state == KB_STATE_SHUTDOWN);
    CHECK(!kb_state_transition(NULL, KB_STATE_READY));

    CHECK(strcmp(kb_state_name(KB_STATE_REQUESTING_STORY), "REQUESTING_STORY") == 0);
    CHECK(strcmp(kb_state_name(KB_STATE_COUNT), "?") == 0);
}

static void test_led(void)
{
    CHECK(kb_state_led_mode(KB_STATE_BOOT) == KB_LED_OFF);
    CHECK(kb_state_led_mode(KB_STATE_SHUTDOWN) == KB_LED_OFF);
    CHECK(kb_state_led_mode(KB_STATE_READY) == KB_LED_READY);
    CHECK(kb_state_led_mode(KB_STATE_RECORDING) == KB_LED_RECORDING);
    CHECK(kb_state_led_mode(KB_STATE_WIFI_CONNECTING) == KB_LED_BUSY);
    CHECK(kb_state_led_mode(KB_STATE_UPLOADING) == KB_LED_BUSY);
    CHECK(kb_state_led_mode(KB_STATE_REQUESTING_STORY) == KB_LED_BUSY);
    CHECK(kb_state_led_mode(KB_STATE_PLAYING) == KB_LED_BUSY);
    CHECK(kb_state_led_mode(KB_STATE_MIC_OFF) == KB_LED_MIC_OFF);
    CHECK(kb_state_led_mode(KB_STATE_ERROR) == KB_LED_ERROR);

    CHECK(kb_led_pattern(KB_LED_READY)->steady_on && kb_led_pattern(KB_LED_READY)->count == 0);
    CHECK(!kb_led_pattern(KB_LED_OFF)->steady_on && kb_led_pattern(KB_LED_OFF)->count == 0);
    const kb_led_pattern_t *mic = kb_led_pattern(KB_LED_MIC_OFF);
    CHECK(mic->count == 4 && mic->ms[0] == 80 && mic->ms[1] == 120 && mic->ms[2] == 80 && mic->ms[3] == 1200);
    CHECK(kb_led_pattern(KB_LED_RECORDING)->ms[0] == 180 && kb_led_pattern(KB_LED_RECORDING)->ms[1] == 180);
    CHECK(kb_led_pattern(KB_LED_BUSY)->ms[0] == 700);
    CHECK(kb_led_pattern(KB_LED_ERROR)->ms[1] == 80);
    CHECK(kb_led_pattern(KB_LED_COUNT) == kb_led_pattern(KB_LED_OFF));
}

static void test_record(void)
{
    CHECK(!kb_record_should_send(349, false));
    CHECK(kb_record_should_send(350, false));
    CHECK(kb_record_should_send(15000, false));
    // Mikrofon-Aus während der Aufnahme: alles verwerfen
    CHECK(!kb_record_should_send(5000, true));
    // 15 s bei 16 kHz/16 Bit passen unter die 2-MB-Grenze des Servers
    CHECK(KB_WAV_HEADER_SIZE + (KB_RECORD_MAX_MS / 1000u) * KB_WAV_SAMPLE_RATE * 2u < KB_WAV_UPLOAD_MAX);
}

static void test_wav(void)
{
    uint8_t header[KB_WAV_HEADER_SIZE];
    uint32_t bytes = 0;
    kb_wav_write_header(header, 32000);
    CHECK(memcmp(header, "RIFF", 4) == 0 && memcmp(header + 8, "WAVEfmt ", 8) == 0);
    CHECK(header[4] == 0x24 && header[5] == 0x7d && header[6] == 0 && header[7] == 0); // 36 + 32000
    CHECK(header[24] == 0x80 && header[25] == 0x3e);                                   // 16000 Hz
    CHECK(header[28] == 0x00 && header[29] == 0x7d);                                   // 32000 Byte/s
    CHECK(kb_wav_check_header(header, sizeof(header), &bytes) == KB_WAV_OK && bytes == 32000);
    CHECK(kb_wav_check_header(header, sizeof(header), NULL) == KB_WAV_OK);
    CHECK(kb_wav_check_header(header, 43, &bytes) == KB_WAV_TOO_SHORT);
    CHECK(kb_wav_check_header(NULL, 44, &bytes) == KB_WAV_TOO_SHORT);

    uint8_t bad[KB_WAV_HEADER_SIZE];
    memcpy(bad, header, sizeof(bad));
    bad[0] = 'X';
    CHECK(kb_wav_check_header(bad, sizeof(bad), &bytes) == KB_WAV_NOT_WAV);
    memcpy(bad, header, sizeof(bad));
    bad[22] = 2; // stereo
    CHECK(kb_wav_check_header(bad, sizeof(bad), &bytes) == KB_WAV_WRONG_FORMAT);
    memcpy(bad, header, sizeof(bad));
    bad[24] = 0x22; bad[25] = 0x56; // 22050 Hz
    CHECK(kb_wav_check_header(bad, sizeof(bad), &bytes) == KB_WAV_WRONG_FORMAT);
    memcpy(bad, header, sizeof(bad));
    bad[34] = 8;
    CHECK(kb_wav_check_header(bad, sizeof(bad), &bytes) == KB_WAV_WRONG_FORMAT);
    memcpy(bad, header, sizeof(bad));
    bad[20] = 3; // nicht PCM
    CHECK(kb_wav_check_header(bad, sizeof(bad), &bytes) == KB_WAV_WRONG_FORMAT);
    kb_wav_write_header(bad, 0);
    CHECK(kb_wav_check_header(bad, sizeof(bad), &bytes) == KB_WAV_EMPTY);
}

static void test_origin(void)
{
    const char *base = "https://picastAI.com";
    CHECK(kb_url_same_origin(base, "https://picastai.com/v1/device/audio/abc"));
    CHECK(kb_url_same_origin(base, "https://PICASTAI.COM:443/v1/device/audio/abc"));
    CHECK(kb_url_same_origin("https://k.example:8443", "https://k.example:8443/x?y=1"));
    CHECK(!kb_url_same_origin(base, "http://picastai.com/v1/device/audio/abc"));
    CHECK(!kb_url_same_origin(base, "https://picastai.com:8443/v1/device/audio/abc"));
    CHECK(!kb_url_same_origin(base, "https://picastai.com.evil.example/v1/device/audio/abc"));
    CHECK(!kb_url_same_origin(base, "https://evil.example/picastai.com"));
    CHECK(!kb_url_same_origin(base, "https://picastai.com@evil.example/abc"));
    CHECK(!kb_url_same_origin(base, "https://user:pw@picastai.com/abc"));
    CHECK(!kb_url_same_origin(base, "https://picastai.com:0/abc"));
    CHECK(!kb_url_same_origin(base, "https://picastai.com:99999/abc"));
    CHECK(!kb_url_same_origin(base, "https://picastai.com:44a/abc"));
    CHECK(!kb_url_same_origin(base, "https://picastai.com:/abc"));
    CHECK(!kb_url_same_origin(base, "https:///abc"));
    CHECK(!kb_url_same_origin(base, "/v1/device/audio/abc"));
    CHECK(!kb_url_same_origin(base, ""));
    CHECK(!kb_url_same_origin(base, NULL));
    CHECK(!kb_url_same_origin(NULL, base));
}

static void test_retry(void)
{
    // nicht wiederholen: 400, 401, 413, 415, 429
    int final_codes[] = {400, 401, 413, 415, 429, 404, 200, 302};
    for (size_t i = 0; i < sizeof(final_codes) / sizeof(final_codes[0]); i++) {
        CHECK(kb_retry_decide(final_codes[i], false, false, 1, 1000) == KB_RETRY_NONE);
    }
    CHECK(kb_retry_decide(503, true, true, 1, 1000) == KB_RETRY_ONCE);
    CHECK(kb_retry_decide(502, true, false, 1, 1000) == KB_RETRY_NONE);
    CHECK(kb_retry_decide(500, false, false, 1, 1000) == KB_RETRY_ONCE);
    CHECK(kb_retry_decide(504, false, false, 1, 1000) == KB_RETRY_ONCE);
    CHECK(kb_retry_decide(0, false, false, 1, 1000) == KB_RETRY_ONCE);
    // höchstens ein Wiederholungsversuch
    CHECK(kb_retry_decide(503, true, true, 2, 1000) == KB_RETRY_NONE);
    // keiner, wenn die 140 s schon um sind
    CHECK(kb_retry_decide(0, false, false, 1, 140000) == KB_RETRY_NONE);
    CHECK(kb_retry_decide(503, true, true, 1, 139999) == KB_RETRY_ONCE);
}

static void test_settings_rules(void)
{
    const kb_setting_def_t *wlan = kb_settings_find("wlan");
    const kb_setting_def_t *pass = kb_settings_find("wlan-passwort");
    const kb_setting_def_t *server = kb_settings_find("server");
    const kb_setting_def_t *device = kb_settings_find("geraet");
    const kb_setting_def_t *token = kb_settings_find("token");
    CHECK(wlan && pass && server && device && token);
    CHECK(kb_settings_find("Token") == NULL);
    CHECK(kb_settings_find("") == NULL);
    CHECK(kb_settings_find(NULL) == NULL);
    CHECK(kb_settings_def(KB_SETTING_COUNT) == NULL);
    if (!(wlan && pass && server && device && token)) {
        return;
    }
    // Geheimnisse sind als solche markiert, alles andere nicht.
    CHECK(pass->secret && token->secret);
    CHECK(!wlan->secret && !server->secret && !device->secret);
    // Schlüssel im Speicher: höchstens 15 Zeichen, alle verschieden.
    for (int i = 0; i < KB_SETTING_COUNT; i++) {
        const kb_setting_def_t *a = kb_settings_def((kb_setting_id_t)i);
        CHECK(a != NULL && a->id == (kb_setting_id_t)i);
        CHECK(strlen(a->nvs_key) > 0 && strlen(a->nvs_key) <= 15);
        CHECK(a->max_len <= KB_SETTING_VALUE_MAX);
        for (int j = i + 1; j < KB_SETTING_COUNT; j++) {
            CHECK(strcmp(a->nvs_key, kb_settings_def((kb_setting_id_t)j)->nvs_key) != 0);
        }
    }
    // Werte
    CHECK(kb_settings_value_ok(wlan, "Mein WLAN 5G"));
    CHECK(kb_settings_value_ok(wlan, ""));
    CHECK(!kb_settings_value_ok(wlan, NULL));
    CHECK(!kb_settings_value_ok(NULL, "x"));
    CHECK(!kb_settings_value_ok(wlan, "123456789012345678901234567890123")); // 33 Zeichen
    CHECK(kb_settings_value_ok(wlan, "12345678901234567890123456789012"));   // 32 Zeichen
    CHECK(!kb_settings_value_ok(wlan, "a\nb"));
    CHECK(kb_settings_value_ok(pass, "geheim mit Leerzeichen"));
    CHECK(kb_settings_value_ok(server, "https://kunibert.example"));
    CHECK(!kb_settings_value_ok(server, "http://kunibert.example"));
    CHECK(!kb_settings_value_ok(server, "https://kunibert.example/"));
    CHECK(kb_settings_value_ok(device, "esp-001"));
    CHECK(!kb_settings_value_ok(device, "esp 001"));
    CHECK(kb_settings_value_ok(token, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"));
    CHECK(!kb_settings_value_ok(token, "abc def"));
    CHECK(!kb_settings_value_ok(token, "abc\x7f"));
}

static void test_press_watch(void)
{
    kb_press_watch_t watch;
    // Nichts gedrückt beim Beginn: der erste Druck zählt.
    kb_press_watch_begin(&watch, false, false);
    CHECK(!kb_press_watch_update(&watch, false, false));
    CHECK(kb_press_watch_update(&watch, true, false));
    kb_press_watch_begin(&watch, false, false);
    CHECK(kb_press_watch_update(&watch, false, true));

    // Erzähltaste beim Beginn noch gehalten: zählt erst nach dem Loslassen.
    kb_press_watch_begin(&watch, false, true);
    CHECK(!kb_press_watch_update(&watch, false, true));
    CHECK(!kb_press_watch_update(&watch, false, false));
    CHECK(kb_press_watch_update(&watch, false, true));

    // Die andere Taste zählt, während eine gehalten wird.
    kb_press_watch_begin(&watch, false, true);
    CHECK(kb_press_watch_update(&watch, true, true));

    // Beide gehalten, nie losgelassen: kein Stopp.
    kb_press_watch_begin(&watch, true, true);
    CHECK(!kb_press_watch_update(&watch, true, true));
    CHECK(!kb_press_watch_update(&watch, true, true));
    CHECK(!kb_press_watch_update(NULL, true, true));
}

int main(void)
{
    test_settings_rules();
    test_state();
    test_led();
    test_record();
    test_wav();
    test_origin();
    test_retry();
    test_press_watch();
    if (fails > 0) {
        printf("%d Prüfung(en) fehlgeschlagen\n", fails);
        return 1;
    }
    puts("ok");
    return 0;
}
