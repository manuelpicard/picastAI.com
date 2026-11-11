// Ritter Kunibert – Firmware für das Endgerät (ESP32-S3).
// Stufe M1: WLAN verbinden und den Server über HTTPS erreichen (GET /health).
// Spezifikation: claude/firmware-spezifikation-esp32-s3.md (Projektdokument).
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

#include "kb_api.h"
#include "kb_wifi.h"

static const char *TAG = "kunibert";

void app_main(void)
{
    ESP_LOGI(TAG, "Ritter Kunibert, Firmware Stufe M1");

    // NVS wird vom WLAN-Treiber gebraucht.
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    if (kb_wifi_connect() != ESP_OK) {
        ESP_LOGE(TAG, "M1 nicht bestanden: kein WLAN");
        return;
    }

    // Alle 30 s prüfen; so sieht man im Monitor auch Aussetzer.
    while (true) {
        err = kb_api_health(CONFIG_KB_API_BASE_URL);
        if (err == ESP_OK) {
            ESP_LOGI(TAG, "M1 bestanden: Server über HTTPS erreichbar");
        } else {
            ESP_LOGW(TAG, "M1: Server nicht erreichbar (%s)", esp_err_to_name(err));
        }
        vTaskDelay(pdMS_TO_TICKS(30000));
    }
}
