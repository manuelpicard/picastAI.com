#include "kb_settings_rules.h"

#include <string.h>

#include "kb_url.h"

static const kb_setting_def_t DEFS[KB_SETTING_COUNT] = {
    {KB_SETTING_WIFI_SSID, "wlan", "wifi_ssid", 32, false},
    {KB_SETTING_WIFI_PASSWORD, "wlan-passwort", "wifi_pass", 63, true},
    {KB_SETTING_API_BASE_URL, "server", "api_url", KB_SETTING_VALUE_MAX, false},
    {KB_SETTING_DEVICE_ID, "geraet", "dev_id", 64, false},
    {KB_SETTING_DEVICE_TOKEN, "token", "dev_token", 128, true},
};

const kb_setting_def_t *kb_settings_def(kb_setting_id_t id)
{
    if ((int)id < 0 || id >= KB_SETTING_COUNT) {
        return NULL;
    }
    return &DEFS[id];
}

const kb_setting_def_t *kb_settings_find(const char *name)
{
    if (name == NULL) {
        return NULL;
    }
    for (int i = 0; i < KB_SETTING_COUNT; i++) {
        if (strcmp(DEFS[i].name, name) == 0) {
            return &DEFS[i];
        }
    }
    return NULL;
}

bool kb_settings_value_ok(const kb_setting_def_t *def, const char *value)
{
    if (def == NULL || value == NULL) {
        return false;
    }
    size_t len = strlen(value);
    if (len > def->max_len) {
        return false;
    }
    if (len == 0) {
        return true;
    }
    bool no_spaces = def->id == KB_SETTING_DEVICE_ID || def->id == KB_SETTING_DEVICE_TOKEN;
    for (size_t i = 0; i < len; i++) {
        unsigned char c = (unsigned char)value[i];
        if (c < 0x20 || c == 0x7f) {
            return false;
        }
        if (no_spaces && c == ' ') {
            return false;
        }
    }
    if (def->id == KB_SETTING_API_BASE_URL && !kb_api_base_url_ok(value)) {
        return false;
    }
    return true;
}
