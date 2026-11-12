// Aufrufe an den Kunibert-Server. Schnittstelle: docs/picastAI-Pi-API.md.
// Regeln wie im Pi-Client: nur HTTPS, Zertifikat prüfen, keinen Weiterleitungen folgen,
// audio_url nur vom selben Ursprung, kein Text aus Antworten ins Log.
#include "kb_api.h"

#include <stdio.h>
#include <string.h>
#include <strings.h>

#include "cJSON.h"
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_random.h"
#include "sdkconfig.h"

#include "kb_settings.h"

#include "kb_audio.h"
#include "kb_wav.h"

#define KB_BODY_MAX          1024
#define KB_HEALTH_TIMEOUT_MS CONFIG_KB_HEALTH_TIMEOUT_MS
#define KB_AUDIO_TIMEOUT_MS  45000
#define KB_BOUNDARY          "----kunibert7f3a9c1e5b2d"

static const char *TAG = "kb_api";
static char s_session_id[33];

typedef struct {
    char data[KB_BODY_MAX + 1];
    int len;
    bool overflow;
    char content_type[48];
} kb_response_t;

static esp_err_t on_http_event(esp_http_client_event_t *event)
{
    kb_response_t *response = (kb_response_t *)event->user_data;
    if (response == NULL) {
        return ESP_OK;
    }
    if (event->event_id == HTTP_EVENT_ON_HEADER && event->header_key != NULL && event->header_value != NULL) {
        if (strcasecmp(event->header_key, "Content-Type") == 0) {
            strlcpy(response->content_type, event->header_value, sizeof(response->content_type));
        }
    } else if (event->event_id == HTTP_EVENT_ON_DATA) {
        // Nur für esp_http_client_perform (GET /health). Die anderen Aufrufe lesen selbst.
        int room = KB_BODY_MAX - response->len;
        int take = event->data_len < room ? event->data_len : room;
        if (take > 0) {
            memcpy(response->data + response->len, event->data, take);
            response->len += take;
            response->data[response->len] = '\0';
        }
        if (take < event->data_len) {
            response->overflow = true;
        }
    }
    return ESP_OK;
}

static esp_http_client_handle_t open_client(const char *url, esp_http_client_method_t method,
                                            int timeout_ms, kb_response_t *response, bool with_auth)
{
    esp_http_client_config_t config = {
        .url = url,
        .method = method,
        .timeout_ms = timeout_ms,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = on_http_event,
        .user_data = response,
        .disable_auto_redirect = true,
        .buffer_size = 2048,
        .buffer_size_tx = 1024,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client != NULL && with_auth) {
        char bearer[160];
        snprintf(bearer, sizeof(bearer), "Bearer %s", kb_settings_get(KB_SETTING_DEVICE_TOKEN));
        esp_http_client_set_header(client, "Authorization", bearer);
        esp_http_client_set_header(client, "X-Device-ID", kb_settings_get(KB_SETTING_DEVICE_ID));
        memset(bearer, 0, sizeof(bearer));
    }
    return client;
}

esp_err_t kb_api_health(const char *base_url)
{
    if (!kb_api_base_url_ok(base_url)) {
        ESP_LOGE(TAG, "Adresse des Servers ungültig (https:// ohne Schrägstrich am Ende)");
        return ESP_ERR_INVALID_ARG;
    }
    char url[KB_URL_MAX];
    snprintf(url, sizeof(url), "%s/health", base_url);

    static kb_response_t response;
    memset(&response, 0, sizeof(response));
    esp_http_client_handle_t client = open_client(url, HTTP_METHOD_GET, KB_HEALTH_TIMEOUT_MS, &response, false);
    if (client == NULL) {
        return ESP_ERR_NO_MEM;
    }
    esp_err_t err = esp_http_client_perform(client);
    int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "/health nicht erreichbar: %s", esp_err_to_name(err));
        return err;
    }
    if (status != 200 || response.overflow) {
        ESP_LOGE(TAG, "/health antwortet mit HTTP %d", status);
        return ESP_ERR_INVALID_RESPONSE;
    }
    bool ok = false;
    cJSON *json = cJSON_Parse(response.data);
    if (json != NULL) {
        const cJSON *value = cJSON_GetObjectItemCaseSensitive(json, "status");
        ok = cJSON_IsString(value) && value->valuestring != NULL && strcmp(value->valuestring, "ok") == 0;
        cJSON_Delete(json);
    }
    if (!ok) {
        ESP_LOGE(TAG, "/health: Antwort ohne status=ok");
        return ESP_ERR_INVALID_RESPONSE;
    }
    ESP_LOGI(TAG, "/health: ok");
    return ESP_OK;
}

void kb_api_new_session(void)
{
    uint8_t bytes[16];
    esp_fill_random(bytes, sizeof(bytes));
    for (size_t i = 0; i < sizeof(bytes); i++) {
        snprintf(s_session_id + i * 2, 3, "%02x", bytes[i]);
    }
}

static bool write_all(esp_http_client_handle_t client, const char *data, size_t len)
{
    size_t sent = 0;
    while (sent < len) {
        int n = esp_http_client_write(client, data + sent, (int)(len - sent));
        if (n <= 0) {
            return false;
        }
        sent += (size_t)n;
    }
    return true;
}

/** Liest Status und JSON-Body; füllt out. ESP_OK nur bei 200 mit gültiger audio_url. */
static esp_err_t read_turn_response(esp_http_client_handle_t client, kb_api_turn_t *out)
{
    if (esp_http_client_fetch_headers(client) < 0) {
        return ESP_FAIL;
    }
    out->http_status = esp_http_client_get_status_code(client);

    static char body[KB_BODY_MAX + 1];
    int len = esp_http_client_read_response(client, body, KB_BODY_MAX);
    if (len < 0) {
        len = 0;
    }
    body[len] = '\0';

    esp_err_t result = ESP_ERR_INVALID_RESPONSE;
    cJSON *json = cJSON_Parse(body);
    if (json != NULL) {
        const cJSON *retryable = cJSON_GetObjectItemCaseSensitive(json, "retryable");
        if (cJSON_IsBool(retryable)) {
            out->has_retryable = true;
            out->retryable = cJSON_IsTrue(retryable);
        }
        const cJSON *end = cJSON_GetObjectItemCaseSensitive(json, "session_end");
        out->session_end = cJSON_IsTrue(end);
        const cJSON *url = cJSON_GetObjectItemCaseSensitive(json, "audio_url");
        if (out->http_status == 200 && cJSON_IsString(url) && url->valuestring != NULL &&
            strlen(url->valuestring) < sizeof(out->audio_url)) {
            // Die Antwort darf nur auf den eigenen Server zeigen, sonst ginge das Token woandershin.
            if (kb_url_same_origin(kb_settings_get(KB_SETTING_API_BASE_URL), url->valuestring)) {
                strlcpy(out->audio_url, url->valuestring, sizeof(out->audio_url));
                result = ESP_OK;
            } else {
                ESP_LOGE(TAG, "audio_url gehört nicht zum Server, abgelehnt");
            }
        }
        cJSON_Delete(json);
    }
    memset(body, 0, sizeof(body));
    if (result != ESP_OK) {
        ESP_LOGW(TAG, "Anfrage abgelehnt oder gescheitert: HTTP %d", out->http_status);
    }
    return result;
}

esp_err_t kb_api_question(const uint8_t *pcm, size_t pcm_bytes, kb_api_turn_t *out)
{
    if (out == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(out, 0, sizeof(*out));
    if (pcm == NULL || pcm_bytes == 0 || pcm_bytes + KB_WAV_HEADER_SIZE > KB_WAV_UPLOAD_MAX ||
        !kb_api_base_url_ok(kb_settings_get(KB_SETTING_API_BASE_URL))) {
        return ESP_ERR_INVALID_ARG;
    }

    char url[KB_URL_MAX];
    snprintf(url, sizeof(url), "%s/v1/device/question", kb_settings_get(KB_SETTING_API_BASE_URL));

    static char head[512];
    int head_len = snprintf(head, sizeof(head),
                            "--" KB_BOUNDARY "\r\nContent-Disposition: form-data; name=\"locale\"\r\n\r\nde-DE\r\n"
                            "--" KB_BOUNDARY "\r\nContent-Disposition: form-data; name=\"age_band\"\r\n\r\n6-10\r\n"
                            "--" KB_BOUNDARY "\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n%s\r\n"
                            "--" KB_BOUNDARY "\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"frage.wav\"\r\n"
                            "Content-Type: audio/wav\r\n\r\n",
                            s_session_id);
    static const char tail[] = "\r\n--" KB_BOUNDARY "--\r\n";
    if (head_len <= 0 || head_len >= (int)sizeof(head)) {
        return ESP_ERR_INVALID_SIZE;
    }
    uint8_t wav_header[KB_WAV_HEADER_SIZE];
    kb_wav_write_header(wav_header, (uint32_t)pcm_bytes);
    int total = head_len + KB_WAV_HEADER_SIZE + (int)pcm_bytes + (int)(sizeof(tail) - 1);

    esp_http_client_handle_t client = open_client(url, HTTP_METHOD_POST, (int)KB_PIPELINE_TIMEOUT_MS, NULL, true);
    if (client == NULL) {
        return ESP_ERR_NO_MEM;
    }
    esp_http_client_set_header(client, "Content-Type", "multipart/form-data; boundary=" KB_BOUNDARY);

    esp_err_t err = esp_http_client_open(client, total);
    if (err == ESP_OK) {
        bool sent = write_all(client, head, (size_t)head_len) &&
                    write_all(client, (const char *)wav_header, sizeof(wav_header)) &&
                    write_all(client, (const char *)pcm, pcm_bytes) &&
                    write_all(client, tail, sizeof(tail) - 1);
        err = sent ? read_turn_response(client, out) : ESP_FAIL;
    }
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return err;
}

esp_err_t kb_api_story(kb_api_turn_t *out)
{
    if (out == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(out, 0, sizeof(*out));
    if (!kb_api_base_url_ok(kb_settings_get(KB_SETTING_API_BASE_URL))) {
        return ESP_ERR_INVALID_ARG;
    }
    char url[KB_URL_MAX];
    snprintf(url, sizeof(url), "%s/v1/device/kunibert-story", kb_settings_get(KB_SETTING_API_BASE_URL));
    char body[160];
    int body_len = snprintf(body, sizeof(body),
                            "{\"locale\":\"de-DE\",\"age_band\":\"6-10\",\"length\":\"short\",\"session_id\":\"%s\"}",
                            s_session_id);

    esp_http_client_handle_t client = open_client(url, HTTP_METHOD_POST, (int)KB_PIPELINE_TIMEOUT_MS, NULL, true);
    if (client == NULL) {
        return ESP_ERR_NO_MEM;
    }
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_err_t err = esp_http_client_open(client, body_len);
    if (err == ESP_OK) {
        err = write_all(client, body, (size_t)body_len) ? read_turn_response(client, out) : ESP_FAIL;
    }
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return err;
}

esp_err_t kb_api_play_audio(const char *audio_url)
{
    if (audio_url == NULL || !kb_url_same_origin(kb_settings_get(KB_SETTING_API_BASE_URL), audio_url)) {
        return ESP_ERR_INVALID_ARG;
    }
    static kb_response_t response;
    memset(&response, 0, sizeof(response));
    esp_http_client_handle_t client = open_client(audio_url, HTTP_METHOD_GET, KB_AUDIO_TIMEOUT_MS, &response, true);
    if (client == NULL) {
        return ESP_ERR_NO_MEM;
    }

    static uint8_t block[2048];
    esp_err_t err = esp_http_client_open(client, 0);
    bool playing = false;
    if (err == ESP_OK) {
        if (esp_http_client_fetch_headers(client) < 0) {
            err = ESP_FAIL;
        } else if (esp_http_client_get_status_code(client) != 200) {
            ESP_LOGW(TAG, "Audio: HTTP %d", esp_http_client_get_status_code(client));
            err = ESP_ERR_INVALID_RESPONSE;
        } else if (strncasecmp(response.content_type, "audio/wav", 9) != 0) {
            ESP_LOGW(TAG, "Audio: falscher Content-Type");
            err = ESP_ERR_INVALID_RESPONSE;
        }
    }
    if (err == ESP_OK) {
        // Erst den Kopf ganz lesen und prüfen, dann erst Ton ausgeben.
        int have = 0;
        while (have < KB_WAV_HEADER_SIZE) {
            int n = esp_http_client_read(client, (char *)block + have, KB_WAV_HEADER_SIZE - have);
            if (n <= 0) {
                break;
            }
            have += n;
        }
        uint32_t data_bytes = 0;
        if (kb_wav_check_header(block, (size_t)have, &data_bytes) != KB_WAV_OK) {
            ESP_LOGW(TAG, "Audio: kein gültiges WAV (mono, 16 Bit, 16 kHz)");
            err = ESP_ERR_INVALID_RESPONSE;
        } else {
            err = kb_audio_play_begin();
            playing = err == ESP_OK;
            uint32_t left = data_bytes;
            size_t carry = 0; // ein einzelnes Byte, wenn ein Block mitten in einem Sample endet
            while (err == ESP_OK && left > 0) {
                size_t want = sizeof(block) - carry;
                if (want > left) {
                    want = left;
                }
                int n = esp_http_client_read(client, (char *)block + carry, (int)want);
                if (n <= 0) {
                    // Die Datei gibt es nur einmal: nicht neu laden, sondern Fehler melden.
                    err = ESP_FAIL;
                    break;
                }
                left -= (uint32_t)n;
                size_t have_bytes = carry + (size_t)n;
                size_t even = have_bytes & ~(size_t)1;
                err = kb_audio_play_write(block, even);
                carry = have_bytes - even;
                if (carry == 1) {
                    block[0] = block[even];
                }
            }
        }
    }
    if (playing) {
        kb_audio_play_end();
    }
    memset(block, 0, sizeof(block));
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return err;
}
