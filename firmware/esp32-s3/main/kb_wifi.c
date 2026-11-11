// WLAN als Station. Zugangsdaten kommen in M1 aus sdkconfig (nur Entwicklung).
#include "kb_wifi.h"

#include <string.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "sdkconfig.h"

#define KB_WIFI_CONNECTED_BIT BIT0
#define KB_WIFI_FAILED_BIT    BIT1

static const char *TAG = "kb_wifi";
static EventGroupHandle_t s_events;
static int s_retries;

static void on_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_retries < CONFIG_KB_WIFI_MAX_RETRY) {
            s_retries++;
            ESP_LOGW(TAG, "WLAN getrennt, Versuch %d von %d", s_retries, CONFIG_KB_WIFI_MAX_RETRY);
            esp_wifi_connect();
        } else {
            xEventGroupSetBits(s_events, KB_WIFI_FAILED_BIT);
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        const ip_event_got_ip_t *event = (const ip_event_got_ip_t *)data;
        ESP_LOGI(TAG, "IP-Adresse: " IPSTR, IP2STR(&event->ip_info.ip));
        s_retries = 0;
        xEventGroupSetBits(s_events, KB_WIFI_CONNECTED_BIT);
    }
}

esp_err_t kb_wifi_connect(void)
{
    if (strlen(CONFIG_KB_WIFI_SSID) == 0) {
        ESP_LOGE(TAG, "Kein WLAN-Name gesetzt (idf.py menuconfig, Menü \"Ritter Kunibert\")");
        return ESP_ERR_INVALID_ARG;
    }

    s_events = xEventGroupCreate();
    if (s_events == NULL) {
        return ESP_ERR_NO_MEM;
    }

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &on_event, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &on_event, NULL, NULL));

    wifi_config_t config = {0};
    strlcpy((char *)config.sta.ssid, CONFIG_KB_WIFI_SSID, sizeof(config.sta.ssid));
    strlcpy((char *)config.sta.password, CONFIG_KB_WIFI_PASSWORD, sizeof(config.sta.password));
    // Kein offenes oder WEP/WPA1-Netz annehmen, wenn ein Passwort gesetzt ist.
    config.sta.threshold.authmode = strlen(CONFIG_KB_WIFI_PASSWORD) > 0 ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &config));
    ESP_ERROR_CHECK(esp_wifi_start());

    EventBits_t bits = xEventGroupWaitBits(s_events, KB_WIFI_CONNECTED_BIT | KB_WIFI_FAILED_BIT,
                                           pdFALSE, pdFALSE, portMAX_DELAY);
    if (bits & KB_WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "WLAN verbunden");
        return ESP_OK;
    }
    ESP_LOGE(TAG, "WLAN-Verbindung gescheitert");
    return ESP_FAIL;
}
