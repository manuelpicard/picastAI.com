// Serielle Konsole zum Einrichten des Geräts ohne neuen Build.
// Wer das USB-Kabel anschließen kann, kann Einstellungen setzen, aber Passwort und
// Token nicht auslesen (sie werden nie angezeigt).
#include "kb_console.h"

#include <stdio.h>
#include <string.h>

#include "esp_console.h"
#include "esp_system.h"
#include "sdkconfig.h"

#include "kb_settings.h"

static int cmd_show(int argc, char **argv)
{
    (void)argc;
    (void)argv;
    for (int i = 0; i < KB_SETTING_COUNT; i++) {
        const kb_setting_def_t *def = kb_settings_def((kb_setting_id_t)i);
        const char *value = kb_settings_get(def->id);
        const char *source = value[0] == '\0' ? "" : (kb_settings_from_nvs(def->id) ? " (Gerät)" : " (sdkconfig)");
        if (value[0] == '\0') {
            printf("%-14s nicht gesetzt\n", def->name);
        } else if (def->secret) {
            printf("%-14s gesetzt%s\n", def->name, source);
        } else {
            printf("%-14s %s%s\n", def->name, value, source);
        }
    }
    printf("Angezeigt sind die Werte seit dem letzten Start.\n");
    printf("%s\n", kb_settings_complete() ? "Alles Nötige ist gesetzt." : "Es fehlt noch etwas (wlan, server, geraet, token).");
    return 0;
}

static int cmd_set(int argc, char **argv)
{
    if (argc < 2 || argc > 3) {
        printf("Aufruf: setze <name> <wert>   (Wert mit Leerzeichen in \"Anführungszeichen\"; ohne Wert: löschen)\n");
        return 1;
    }
    const kb_setting_def_t *def = kb_settings_find(argv[1]);
    if (def == NULL) {
        printf("Unbekannt: %s. Erlaubt: wlan, wlan-passwort, server, geraet, token\n", argv[1]);
        return 1;
    }
    const char *value = argc == 3 ? argv[2] : "";
    if (!kb_settings_value_ok(def, value)) {
        printf("Wert nicht erlaubt (zu lang, Steuerzeichen, oder Adresse nicht https:// ohne Schrägstrich am Ende).\n");
        return 1;
    }
    esp_err_t err = kb_settings_set(def->id, value);
    if (err != ESP_OK) {
        printf("Speichern gescheitert: %s\n", esp_err_to_name(err));
        return 1;
    }
    printf("%s %s. Gilt nach \"neustart\".\n", def->name, value[0] == '\0' ? "gelöscht" : "gespeichert");
    return 0;
}

static int cmd_erase(int argc, char **argv)
{
    (void)argc;
    (void)argv;
    esp_err_t err = kb_settings_erase_all();
    if (err != ESP_OK) {
        printf("Löschen gescheitert: %s\n", esp_err_to_name(err));
        return 1;
    }
    printf("Alle gespeicherten Einstellungen gelöscht. Gilt nach \"neustart\".\n");
    return 0;
}

static int cmd_restart(int argc, char **argv)
{
    (void)argc;
    (void)argv;
    printf("Neustart ...\n");
    fflush(stdout);
    esp_restart();
    return 0;
}

esp_err_t kb_console_start(void)
{
    esp_console_repl_t *repl = NULL;
    esp_console_repl_config_t repl_config = ESP_CONSOLE_REPL_CONFIG_DEFAULT();
    repl_config.prompt = "kunibert>";
    // Keine Befehlsgeschichte: Passwort und Token sollen nicht im Speicher der Konsole bleiben.
    repl_config.history_save_path = NULL;
    repl_config.max_history_len = 1;

    esp_err_t err = ESP_ERR_NOT_SUPPORTED;
#if defined(CONFIG_ESP_CONSOLE_UART_DEFAULT) || defined(CONFIG_ESP_CONSOLE_UART_CUSTOM)
    esp_console_dev_uart_config_t hw_config = ESP_CONSOLE_DEV_UART_CONFIG_DEFAULT();
    err = esp_console_new_repl_uart(&hw_config, &repl_config, &repl);
#elif defined(CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG)
    esp_console_dev_usb_serial_jtag_config_t hw_config = ESP_CONSOLE_DEV_USB_SERIAL_JTAG_CONFIG_DEFAULT();
    err = esp_console_new_repl_usb_serial_jtag(&hw_config, &repl_config, &repl);
#elif defined(CONFIG_ESP_CONSOLE_USB_CDC)
    esp_console_dev_usb_cdc_config_t hw_config = ESP_CONSOLE_DEV_CDC_CONFIG_DEFAULT();
    err = esp_console_new_repl_usb_cdc(&hw_config, &repl_config, &repl);
#endif
    if (err != ESP_OK) {
        return err;
    }

    const esp_console_cmd_t commands[] = {
        {.command = "zeige", .help = "Einstellungen anzeigen (Passwort und Token nie im Klartext)", .func = &cmd_show},
        {.command = "setze", .help = "setze <name> <wert>: wlan, wlan-passwort, server, geraet, token", .func = &cmd_set},
        {.command = "loesche", .help = "alle gespeicherten Einstellungen löschen", .func = &cmd_erase},
        {.command = "neustart", .help = "Gerät neu starten", .func = &cmd_restart},
    };
    for (size_t i = 0; i < sizeof(commands) / sizeof(commands[0]); i++) {
        err = esp_console_cmd_register(&commands[i]);
        if (err != ESP_OK) {
            return err;
        }
    }
    esp_console_register_help_command();
    return esp_console_start_repl(repl);
}
