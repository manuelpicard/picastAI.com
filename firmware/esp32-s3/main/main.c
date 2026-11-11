// Ritter Kunibert – Firmware für das Endgerät (ESP32-S3).
// Stufen M1 bis M5 im Entwurf: WLAN, /health, Aufnahme, Frage, Geschichte, Abspielen,
// Tasten, LED, Zustandsautomat, Fehlerregeln. Ablauf wie pi-client/kunibert_client.py.
// Spezifikation: claude/firmware-spezifikation-esp32-s3.md (Projektdokument).
#include <string.h>

#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

#include "kb_api.h"
#include "kb_audio.h"
#include "kb_board.h"
#include "kb_state.h"
#include "kb_wav.h"
#include "kb_wifi.h"

#define KB_POLL_MS        20
#define KB_ERROR_SHOW_MS  1000
#define KB_RETRY_PAUSE_MS 1500

static const char *TAG = "kunibert";
static kb_state_t s_state = KB_STATE_BOOT;
static bool s_mic_off_seen;
static int64_t s_record_started_us;

static void go(kb_state_t to)
{
    kb_state_t from = s_state;
    if (!kb_state_transition(&s_state, to)) {
        ESP_LOGE(TAG, "Ungültiger Zustandswechsel %s -> %s", kb_state_name(from), kb_state_name(to));
    } else {
        ESP_LOGI(TAG, "Zustand: %s -> %s", kb_state_name(from), kb_state_name(to));
    }
    kb_board_set_led(kb_state_led_mode(s_state));
}

static uint32_t elapsed_ms(int64_t since_us)
{
    return (uint32_t)((esp_timer_get_time() - since_us) / 1000);
}

/** Zeigt den Fehler kurz an und geht zurück in den Ruhezustand. Kein Dauer-Retry. */
static void show_error_and_rest(void)
{
    if (s_state != KB_STATE_ERROR) {
        go(KB_STATE_ERROR);
    }
    vTaskDelay(pdMS_TO_TICKS(KB_ERROR_SHOW_MS));
    go(kb_board_mic_off() ? KB_STATE_MIC_OFF : KB_STATE_READY);
}

/** Läuft während der Aufnahme: Taste noch gedrückt, Schalter nicht umgelegt, Zeit nicht um. */
static bool keep_recording(void)
{
    if (kb_board_mic_off()) {
        s_mic_off_seen = true;
        return false;
    }
    return kb_board_speak_pressed() && elapsed_ms(s_record_started_us) < KB_RECORD_MAX_MS;
}

typedef esp_err_t (*turn_fn_t)(kb_api_turn_t *out, const uint8_t *pcm, size_t bytes);

static esp_err_t turn_question(kb_api_turn_t *out, const uint8_t *pcm, size_t bytes)
{
    return kb_api_question(pcm, bytes, out);
}

static esp_err_t turn_story(kb_api_turn_t *out, const uint8_t *pcm, size_t bytes)
{
    (void)pcm;
    (void)bytes;
    return kb_api_story(out);
}

/** Anfrage mit höchstens einer Wiederholung nach den Fehlerregeln, danach Abspielen. */
static void run_turn(turn_fn_t fn, const uint8_t *pcm, size_t bytes)
{
    static kb_api_turn_t turn;
    int64_t started = esp_timer_get_time();
    esp_err_t err = ESP_FAIL;
    for (int attempt = 1; attempt <= KB_MAX_ATTEMPTS; attempt++) {
        err = fn(&turn, pcm, bytes);
        if (err == ESP_OK) {
            break;
        }
        if (kb_retry_decide(turn.http_status, turn.has_retryable, turn.retryable, attempt,
                            elapsed_ms(started)) != KB_RETRY_ONCE) {
            break;
        }
        ESP_LOGW(TAG, "Wiederhole die Anfrage einmal");
        vTaskDelay(pdMS_TO_TICKS(KB_RETRY_PAUSE_MS));
    }
    // Die Aufnahme wird nach dem Senden nicht mehr gebraucht.
    kb_audio_discard_recording();
    if (err != ESP_OK) {
        show_error_and_rest();
        return;
    }
    go(KB_STATE_PLAYING);
    err = kb_api_play_audio(turn.audio_url);
    memset(&turn, 0, sizeof(turn));
    if (err != ESP_OK) {
        show_error_and_rest();
        return;
    }
    go(kb_board_mic_off() ? KB_STATE_MIC_OFF : KB_STATE_READY);
}

static void handle_speak(void)
{
    const uint8_t *pcm = NULL;
    size_t bytes = 0;
    s_mic_off_seen = false;
    s_record_started_us = esp_timer_get_time();
    go(KB_STATE_RECORDING);
    esp_err_t err = kb_audio_record(keep_recording, &pcm, &bytes);
    uint32_t duration_ms = (uint32_t)(bytes / (KB_WAV_SAMPLE_RATE * 2u / 1000u));

    if (s_mic_off_seen) {
        // Schalter während der Aufnahme umgelegt: alles verwerfen, nichts senden.
        kb_audio_discard_recording();
        go(KB_STATE_MIC_OFF);
        return;
    }
    if (err != ESP_OK) {
        kb_audio_discard_recording();
        show_error_and_rest();
        return;
    }
    if (!kb_record_should_send(duration_ms, false)) {
        kb_audio_discard_recording();
        go(KB_STATE_READY);
        return;
    }
    go(KB_STATE_UPLOADING);
    run_turn(turn_question, pcm, bytes);
}

static void wait_release(bool (*pressed)(void))
{
    while (pressed()) {
        vTaskDelay(pdMS_TO_TICKS(KB_POLL_MS));
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "Ritter Kunibert, Firmware (Entwurf M1 bis M5)");

    // NVS wird vom WLAN-Treiber gebraucht.
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
    ESP_ERROR_CHECK(kb_board_init());
    ESP_ERROR_CHECK(kb_audio_init());
    kb_api_new_session();

    go(KB_STATE_WIFI_CONNECTING);
    // Ohne WLAN oder Server gibt es keinen Betrieb: Fehler zeigen und alle 30 s neu prüfen.
    bool wifi_up = kb_wifi_connect() == ESP_OK;
    while (!wifi_up || kb_api_health(CONFIG_KB_API_BASE_URL) != ESP_OK) {
        if (s_state != KB_STATE_ERROR) {
            go(KB_STATE_ERROR);
        }
        vTaskDelay(pdMS_TO_TICKS(30000));
        if (!wifi_up) {
            ESP_LOGE(TAG, "Kein WLAN. Bitte Zugangsdaten prüfen und neu starten.");
        }
    }
    go(kb_board_mic_off() ? KB_STATE_MIC_OFF : KB_STATE_READY);
    ESP_LOGI(TAG, "Kunibert bereit. Sprechtaste halten oder Erzähltaste drücken.");

    while (true) {
        // Mikrofon-Aus hat immer Vorrang.
        if (kb_board_mic_off()) {
            if (s_state == KB_STATE_READY) {
                go(KB_STATE_MIC_OFF);
            }
        } else if (s_state == KB_STATE_MIC_OFF) {
            go(KB_STATE_READY);
        }

        // Nach einem Programmfehler (ungültiger Wechsel) nicht hängen bleiben.
        if (s_state == KB_STATE_ERROR) {
            show_error_and_rest();
        }

        if (s_state == KB_STATE_READY) {
            if (kb_board_speak_pressed()) {
                handle_speak();
                wait_release(kb_board_speak_pressed);
            } else if (kb_board_story_pressed()) {
                go(KB_STATE_REQUESTING_STORY);
                run_turn(turn_story, NULL, 0);
                wait_release(kb_board_story_pressed);
            }
        }
        vTaskDelay(pdMS_TO_TICKS(KB_POLL_MS));
    }
}
