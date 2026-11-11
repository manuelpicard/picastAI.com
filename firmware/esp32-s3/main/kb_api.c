// Aufrufe an den Kunibert-Server. M1: nur /health. Schnittstelle: docs/picastAI-Pi-API.md.
#include "kb_api.h"

#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "sdkconfig.h"

#include "kb_url.h"

#define KB_HEALTH_BODY_MAX 512

static const char *TAG = "kb_api";

typedef struct {
    char data[KB_HEALTH_BODY_MAX + 1];
    int len;
    bool overflow;
} kb_body_t;

static esp_err_t on_http_event(esp_http_client_event_t *event)
{
    kb_body_t *body = (kb_body_t *)event->user_data;
    if (event->event_id == HTTP_EVENT_ON_DATA && body != NULL) {
        int room = KB_HEALTH_BODY_MAX - body->len;
        int take = event->data_len < room ? event->data_len : room;
        if (take > 0) {
            memcpy(body->data + body->len, event->data, take);
            body->len += take;
            body->data[body->len] = '\0';
        }
        if (take < event->data_len) {
            body->overflow = true;
        }
    }
    return ESP_OK;
}

esp_err_t kb_api_health(const char *base_url)
{
    if (!kb_api_base_url_ok(base_url)) {
        ESP_LOGE(TAG, "Adresse des Servers ungültig (https:// ohne Schrägstrich am Ende)");
        return ESP_ERR_INVALID_ARG;
    }

    char url[KB_URL_MAX];
    snprintf(url, sizeof(url), "%s/health", base_url);

    kb_body_t body = {0};
    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = CONFIG_KB_HEALTH_TIMEOUT_MS,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = on_http_event,
        .user_data = &body,
        .disable_auto_redirect = true,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
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
    if (status != 200 || body.overflow) {
        ESP_LOGE(TAG, "/health antwortet mit HTTP %d", status);
        return ESP_ERR_INVALID_RESPONSE;
    }

    bool ok = false;
    cJSON *json = cJSON_Parse(body.data);
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
