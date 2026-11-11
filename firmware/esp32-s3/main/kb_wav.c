// WAV-Kopf schreiben und prüfen. Ohne ESP-IDF, auf dem Rechner getestet (test/test_logic.c).
#include "kb_wav.h"

#include <string.h>

static void put_u16(uint8_t *p, uint16_t v)
{
    p[0] = (uint8_t)(v & 0xff);
    p[1] = (uint8_t)(v >> 8);
}

static void put_u32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)(v & 0xff);
    p[1] = (uint8_t)((v >> 8) & 0xff);
    p[2] = (uint8_t)((v >> 16) & 0xff);
    p[3] = (uint8_t)(v >> 24);
}

static uint16_t get_u16(const uint8_t *p)
{
    return (uint16_t)(p[0] | (p[1] << 8));
}

static uint32_t get_u32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

void kb_wav_write_header(uint8_t out[KB_WAV_HEADER_SIZE], uint32_t data_bytes)
{
    const uint16_t block_align = KB_WAV_CHANNELS * (KB_WAV_BITS / 8);
    memcpy(out, "RIFF", 4);
    put_u32(out + 4, 36u + data_bytes);
    memcpy(out + 8, "WAVE", 4);
    memcpy(out + 12, "fmt ", 4);
    put_u32(out + 16, 16);
    put_u16(out + 20, 1); // PCM
    put_u16(out + 22, KB_WAV_CHANNELS);
    put_u32(out + 24, KB_WAV_SAMPLE_RATE);
    put_u32(out + 28, (uint32_t)KB_WAV_SAMPLE_RATE * block_align);
    put_u16(out + 32, block_align);
    put_u16(out + 34, KB_WAV_BITS);
    memcpy(out + 36, "data", 4);
    put_u32(out + 40, data_bytes);
}

kb_wav_result_t kb_wav_check_header(const uint8_t *data, size_t len, uint32_t *data_bytes)
{
    if (data == NULL || len < KB_WAV_HEADER_SIZE) {
        return KB_WAV_TOO_SHORT;
    }
    if (memcmp(data, "RIFF", 4) != 0 || memcmp(data + 8, "WAVE", 4) != 0 ||
        memcmp(data + 12, "fmt ", 4) != 0 || get_u32(data + 16) != 16 ||
        memcmp(data + 36, "data", 4) != 0) {
        return KB_WAV_NOT_WAV;
    }
    if (get_u16(data + 20) != 1 || get_u16(data + 22) != KB_WAV_CHANNELS ||
        get_u32(data + 24) != KB_WAV_SAMPLE_RATE || get_u16(data + 34) != KB_WAV_BITS) {
        return KB_WAV_WRONG_FORMAT;
    }
    uint32_t bytes = get_u32(data + 40);
    if (bytes == 0) {
        return KB_WAV_EMPTY;
    }
    if (data_bytes != NULL) {
        *data_bytes = bytes;
    }
    return KB_WAV_OK;
}
