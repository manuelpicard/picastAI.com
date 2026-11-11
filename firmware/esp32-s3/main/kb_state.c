// Zustandsautomat und LED-Muster. Ohne ESP-IDF, auf dem Rechner getestet (test/test_logic.c).
#include "kb_state.h"

#include <stddef.h>

#define BIT_OF(state) (1u << (state))

static const uint16_t ALLOWED[KB_STATE_COUNT] = {
    [KB_STATE_BOOT] = BIT_OF(KB_STATE_WIFI_CONNECTING) | BIT_OF(KB_STATE_MIC_OFF) | BIT_OF(KB_STATE_SHUTDOWN),
    [KB_STATE_WIFI_CONNECTING] = BIT_OF(KB_STATE_READY) | BIT_OF(KB_STATE_ERROR) | BIT_OF(KB_STATE_MIC_OFF) | BIT_OF(KB_STATE_SHUTDOWN),
    [KB_STATE_READY] = BIT_OF(KB_STATE_RECORDING) | BIT_OF(KB_STATE_REQUESTING_STORY) | BIT_OF(KB_STATE_MIC_OFF) | BIT_OF(KB_STATE_ERROR) | BIT_OF(KB_STATE_SHUTDOWN),
    [KB_STATE_RECORDING] = BIT_OF(KB_STATE_UPLOADING) | BIT_OF(KB_STATE_READY) | BIT_OF(KB_STATE_MIC_OFF) | BIT_OF(KB_STATE_ERROR) | BIT_OF(KB_STATE_SHUTDOWN),
    [KB_STATE_UPLOADING] = BIT_OF(KB_STATE_PLAYING) | BIT_OF(KB_STATE_READY) | BIT_OF(KB_STATE_ERROR) | BIT_OF(KB_STATE_SHUTDOWN),
    [KB_STATE_REQUESTING_STORY] = BIT_OF(KB_STATE_PLAYING) | BIT_OF(KB_STATE_READY) | BIT_OF(KB_STATE_ERROR) | BIT_OF(KB_STATE_SHUTDOWN),
    [KB_STATE_PLAYING] = BIT_OF(KB_STATE_READY) | BIT_OF(KB_STATE_MIC_OFF) | BIT_OF(KB_STATE_ERROR) | BIT_OF(KB_STATE_SHUTDOWN),
    [KB_STATE_MIC_OFF] = BIT_OF(KB_STATE_READY) | BIT_OF(KB_STATE_SHUTDOWN),
    [KB_STATE_ERROR] = BIT_OF(KB_STATE_READY) | BIT_OF(KB_STATE_MIC_OFF) | BIT_OF(KB_STATE_SHUTDOWN),
    [KB_STATE_SHUTDOWN] = 0,
};

static const kb_led_pattern_t PATTERNS[KB_LED_COUNT] = {
    [KB_LED_OFF] = {.steady_on = false, .count = 0},
    [KB_LED_READY] = {.steady_on = true, .count = 0},
    [KB_LED_RECORDING] = {.count = 2, .ms = {180, 180}},
    [KB_LED_BUSY] = {.count = 2, .ms = {700, 700}},
    [KB_LED_MIC_OFF] = {.count = 4, .ms = {80, 120, 80, 1200}},
    [KB_LED_ERROR] = {.count = 2, .ms = {80, 80}},
};

static const char *const NAMES[KB_STATE_COUNT] = {
    "BOOT", "WIFI_CONNECTING", "READY", "RECORDING", "UPLOADING",
    "REQUESTING_STORY", "PLAYING", "MIC_OFF", "ERROR", "SHUTDOWN",
};

static bool valid(kb_state_t state)
{
    return (int)state >= 0 && state < KB_STATE_COUNT;
}

bool kb_state_can_transition(kb_state_t from, kb_state_t to)
{
    if (!valid(from) || !valid(to)) {
        return false;
    }
    return (ALLOWED[from] & BIT_OF(to)) != 0;
}

bool kb_state_transition(kb_state_t *state, kb_state_t to)
{
    if (state == NULL) {
        return false;
    }
    if (kb_state_can_transition(*state, to)) {
        *state = to;
        return true;
    }
    if (*state != KB_STATE_SHUTDOWN) {
        *state = KB_STATE_ERROR;
    }
    return false;
}

kb_led_mode_t kb_state_led_mode(kb_state_t state)
{
    switch (state) {
    case KB_STATE_READY:
        return KB_LED_READY;
    case KB_STATE_RECORDING:
        return KB_LED_RECORDING;
    case KB_STATE_UPLOADING:
    case KB_STATE_REQUESTING_STORY:
    case KB_STATE_PLAYING:
    case KB_STATE_WIFI_CONNECTING:
        return KB_LED_BUSY;
    case KB_STATE_MIC_OFF:
        return KB_LED_MIC_OFF;
    case KB_STATE_ERROR:
        return KB_LED_ERROR;
    default:
        return KB_LED_OFF;
    }
}

const kb_led_pattern_t *kb_led_pattern(kb_led_mode_t mode)
{
    if ((int)mode < 0 || mode >= KB_LED_COUNT) {
        return &PATTERNS[KB_LED_OFF];
    }
    return &PATTERNS[mode];
}

const char *kb_state_name(kb_state_t state)
{
    return valid(state) ? NAMES[state] : "?";
}

bool kb_record_should_send(uint32_t duration_ms, bool mic_off_seen)
{
    if (mic_off_seen) {
        return false;
    }
    return duration_ms >= KB_RECORD_MIN_MS;
}
