// Ton für den allgemeinen Aufbau: I2S-Mikrofon (z. B. INMP441) und I2S-Verstärker (z. B. MAX98357A).
// Ein Board mit Codec-Chips (ESP32-S3-BOX-3: ES7210/ES8311) braucht eine eigene Fassung dieser Datei.
#include "kb_audio.h"

#include <string.h>

#include "driver/i2s_std.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "sdkconfig.h"

#include "kb_state.h"
#include "kb_wav.h"

#define KB_BYTES_PER_SECOND (KB_WAV_SAMPLE_RATE * 2u)
#define KB_READ_SAMPLES     256

static const char *TAG = "kb_audio";
static i2s_chan_handle_t s_rx;
static i2s_chan_handle_t s_tx;
static uint8_t *s_record;
static size_t s_record_capacity;
static size_t s_record_used;

esp_err_t kb_audio_init(void)
{
    // Mikrofon: 32-Bit-Rahmen (das INMP441 liefert 24 Bit linksbündig), linker Kanal.
    i2s_chan_config_t rx_chan = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    esp_err_t err = i2s_new_channel(&rx_chan, NULL, &s_rx);
    if (err != ESP_OK) {
        return err;
    }
    i2s_std_config_t rx_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(KB_WAV_SAMPLE_RATE),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = CONFIG_KB_PIN_MIC_BCLK,
            .ws = CONFIG_KB_PIN_MIC_WS,
            .dout = I2S_GPIO_UNUSED,
            .din = CONFIG_KB_PIN_MIC_DIN,
        },
    };
    rx_cfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;
    err = i2s_channel_init_std_mode(s_rx, &rx_cfg);
    if (err != ESP_OK) {
        return err;
    }

    // Verstärker: 16 Bit, mono.
    i2s_chan_config_t tx_chan = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
    tx_chan.auto_clear = true; // Stille statt Wiederholung, wenn keine Daten nachkommen
    err = i2s_new_channel(&tx_chan, &s_tx, NULL);
    if (err != ESP_OK) {
        return err;
    }
    i2s_std_config_t tx_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(KB_WAV_SAMPLE_RATE),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = CONFIG_KB_PIN_SPK_BCLK,
            .ws = CONFIG_KB_PIN_SPK_WS,
            .dout = CONFIG_KB_PIN_SPK_DOUT,
            .din = I2S_GPIO_UNUSED,
        },
    };
    err = i2s_channel_init_std_mode(s_tx, &tx_cfg);
    if (err != ESP_OK) {
        return err;
    }

    // Aufnahmepuffer: 15 s im PSRAM; ohne PSRAM 4 s im internen Speicher.
    s_record_capacity = (KB_RECORD_MAX_MS / 1000u) * KB_BYTES_PER_SECOND;
    s_record = heap_caps_malloc(s_record_capacity, MALLOC_CAP_SPIRAM);
    if (s_record == NULL) {
        s_record_capacity = 4u * KB_BYTES_PER_SECOND;
        s_record = heap_caps_malloc(s_record_capacity, MALLOC_CAP_DEFAULT);
        ESP_LOGW(TAG, "Kein PSRAM: Aufnahme auf 4 s begrenzt");
    }
    if (s_record == NULL) {
        s_record_capacity = 0;
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}

size_t kb_audio_record_capacity(void)
{
    return s_record_capacity;
}

static int16_t to_16bit(int32_t sample)
{
    int32_t value = sample >> CONFIG_KB_MIC_SHIFT;
    if (value > INT16_MAX) {
        value = INT16_MAX;
    } else if (value < INT16_MIN) {
        value = INT16_MIN;
    }
    return (int16_t)value;
}

esp_err_t kb_audio_record(bool (*keep_going)(void), const uint8_t **pcm, size_t *bytes)
{
    if (s_record == NULL || keep_going == NULL || pcm == NULL || bytes == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    static int32_t raw[KB_READ_SAMPLES];
    s_record_used = 0;

    esp_err_t err = i2s_channel_enable(s_rx);
    if (err != ESP_OK) {
        return err;
    }
    while (keep_going() && s_record_used + KB_READ_SAMPLES * 2 <= s_record_capacity) {
        size_t got = 0;
        err = i2s_channel_read(s_rx, raw, sizeof(raw), &got, pdMS_TO_TICKS(200));
        if (err != ESP_OK) {
            break;
        }
        size_t samples = got / sizeof(raw[0]);
        for (size_t i = 0; i < samples; i++) {
            int16_t value = to_16bit(raw[i]);
            s_record[s_record_used++] = (uint8_t)(value & 0xff);
            s_record[s_record_used++] = (uint8_t)((value >> 8) & 0xff);
        }
    }
    i2s_channel_disable(s_rx);
    memset(raw, 0, sizeof(raw));

    *pcm = s_record;
    *bytes = s_record_used;
    return err;
}

void kb_audio_discard_recording(void)
{
    if (s_record != NULL) {
        memset(s_record, 0, s_record_capacity);
    }
    s_record_used = 0;
}

esp_err_t kb_audio_play_begin(void)
{
    return i2s_channel_enable(s_tx);
}

esp_err_t kb_audio_play_write(const uint8_t *pcm, size_t bytes)
{
    size_t written = 0;
    return i2s_channel_write(s_tx, pcm, bytes, &written, pdMS_TO_TICKS(2000));
}

void kb_audio_play_end(void)
{
    // Kurz Stille nachschieben, damit der letzte Block ausgespielt ist.
    static const uint8_t silence[640] = {0};
    size_t written = 0;
    i2s_channel_write(s_tx, silence, sizeof(silence), &written, pdMS_TO_TICKS(500));
    i2s_channel_disable(s_tx);
}
