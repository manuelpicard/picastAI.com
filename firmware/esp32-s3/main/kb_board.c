// Tasten, Mikrofon-Aus-Schalter und Status-LED für den allgemeinen Aufbau (Pins aus menuconfig).
#include "kb_board.h"

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

static volatile kb_led_mode_t s_led_mode = KB_LED_OFF;

static void led_task(void *arg)
{
    (void)arg;
    while (true) {
        kb_led_mode_t mode = s_led_mode;
        const kb_led_pattern_t *pattern = kb_led_pattern(mode);
        if (pattern->count == 0) {
            gpio_set_level(CONFIG_KB_PIN_LED, pattern->steady_on ? 1 : 0);
            vTaskDelay(pdMS_TO_TICKS(50));
            continue;
        }
        for (int i = 0; i < pattern->count && s_led_mode == mode; i++) {
            gpio_set_level(CONFIG_KB_PIN_LED, (i % 2) == 0 ? 1 : 0);
            // In kleinen Schritten warten, damit ein neues Muster schnell greift.
            int left = pattern->ms[i];
            while (left > 0 && s_led_mode == mode) {
                int step = left > 20 ? 20 : left;
                vTaskDelay(pdMS_TO_TICKS(step));
                left -= step;
            }
        }
    }
}

static esp_err_t input_pullup(int pin)
{
    gpio_config_t config = {
        .pin_bit_mask = 1ULL << pin,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    return gpio_config(&config);
}

esp_err_t kb_board_init(void)
{
    esp_err_t err = input_pullup(CONFIG_KB_PIN_BTN_SPEAK);
    if (err == ESP_OK) {
        err = input_pullup(CONFIG_KB_PIN_BTN_STORY);
    }
#if CONFIG_KB_PIN_MIC_OFF >= 0
    if (err == ESP_OK) {
        err = input_pullup(CONFIG_KB_PIN_MIC_OFF);
    }
#endif
    if (err != ESP_OK) {
        return err;
    }

    gpio_config_t led = {
        .pin_bit_mask = 1ULL << CONFIG_KB_PIN_LED,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    err = gpio_config(&led);
    if (err != ESP_OK) {
        return err;
    }
    gpio_set_level(CONFIG_KB_PIN_LED, 0);

    if (xTaskCreate(led_task, "kb_led", 2048, NULL, 3, NULL) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}

bool kb_board_speak_pressed(void)
{
    return gpio_get_level(CONFIG_KB_PIN_BTN_SPEAK) == 0;
}

bool kb_board_story_pressed(void)
{
    return gpio_get_level(CONFIG_KB_PIN_BTN_STORY) == 0;
}

bool kb_board_mic_off(void)
{
#if CONFIG_KB_PIN_MIC_OFF >= 0
    return gpio_get_level(CONFIG_KB_PIN_MIC_OFF) == 0;
#else
    return false;
#endif
}

void kb_board_set_led(kb_led_mode_t mode)
{
    s_led_mode = mode;
}
