#include "kb_settings.h"

#include <string.h>

#include "esp_log.h"
#include "nvs.h"
#include "sdkconfig.h"

#define KB_NVS_NAMESPACE "kunibert"

static const char *TAG = "kb_settings";

static char s_values[KB_SETTING_COUNT][KB_SETTING_VALUE_MAX + 1];
static bool s_from_nvs[KB_SETTING_COUNT];

static const char *fallback(kb_setting_id_t id)
{
    switch (id) {
    case KB_SETTING_WIFI_SSID:
        return CONFIG_KB_WIFI_SSID;
    case KB_SETTING_WIFI_PASSWORD:
        return CONFIG_KB_WIFI_PASSWORD;
    case KB_SETTING_API_BASE_URL:
        return CONFIG_KB_API_BASE_URL;
    case KB_SETTING_DEVICE_ID:
        return CONFIG_KB_DEVICE_ID;
    case KB_SETTING_DEVICE_TOKEN:
        return CONFIG_KB_DEVICE_TOKEN;
    default:
        return "";
    }
}

static void use_fallback(kb_setting_id_t id)
{
    strlcpy(s_values[id], fallback(id), sizeof(s_values[id]));
    s_from_nvs[id] = false;
}

esp_err_t kb_settings_load(void)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(KB_NVS_NAMESPACE, NVS_READONLY, &handle);
    bool have_nvs = err == ESP_OK;
    if (!have_nvs && err != ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGW(TAG, "Speicher nicht lesbar (%s), nutze sdkconfig", esp_err_to_name(err));
    }

    for (int i = 0; i < KB_SETTING_COUNT; i++) {
        const kb_setting_def_t *def = kb_settings_def((kb_setting_id_t)i);
        use_fallback((kb_setting_id_t)i);
        if (!have_nvs) {
            continue;
        }
        char buffer[KB_SETTING_VALUE_MAX + 1];
        size_t size = sizeof(buffer);
        if (nvs_get_str(handle, def->nvs_key, buffer, &size) == ESP_OK &&
            buffer[0] != '\0' && kb_settings_value_ok(def, buffer)) {
            strlcpy(s_values[i], buffer, sizeof(s_values[i]));
            s_from_nvs[i] = true;
        }
        memset(buffer, 0, sizeof(buffer));
    }
    if (have_nvs) {
        nvs_close(handle);
    }
    return ESP_OK;
}

const char *kb_settings_get(kb_setting_id_t id)
{
    if ((int)id < 0 || id >= KB_SETTING_COUNT) {
        return "";
    }
    return s_values[id];
}

bool kb_settings_from_nvs(kb_setting_id_t id)
{
    if ((int)id < 0 || id >= KB_SETTING_COUNT) {
        return false;
    }
    return s_from_nvs[id];
}

esp_err_t kb_settings_set(kb_setting_id_t id, const char *value)
{
    const kb_setting_def_t *def = kb_settings_def(id);
    if (!kb_settings_value_ok(def, value)) {
        return ESP_ERR_INVALID_ARG;
    }

    nvs_handle_t handle;
    esp_err_t err = nvs_open(KB_NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        return err;
    }
    if (value[0] == '\0') {
        err = nvs_erase_key(handle, def->nvs_key);
        if (err == ESP_ERR_NVS_NOT_FOUND) {
            err = ESP_OK;
        }
    } else {
        err = nvs_set_str(handle, def->nvs_key, value);
    }
    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }
    nvs_close(handle);
    if (err != ESP_OK) {
        return err;
    }

    // Die laufenden Werte bleiben bis zum Neustart, damit sich mitten in einer Anfrage nichts ändert.
    return ESP_OK;
}

esp_err_t kb_settings_erase_all(void)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(KB_NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        return err;
    }
    err = nvs_erase_all(handle);
    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }
    nvs_close(handle);
    return err;
}

bool kb_settings_complete(void)
{
    return s_values[KB_SETTING_WIFI_SSID][0] != '\0' && s_values[KB_SETTING_API_BASE_URL][0] != '\0' &&
           s_values[KB_SETTING_DEVICE_ID][0] != '\0' && s_values[KB_SETTING_DEVICE_TOKEN][0] != '\0';
}
