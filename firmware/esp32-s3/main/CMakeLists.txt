idf_component_register(
    SRCS "main.c" "kb_wifi.c" "kb_api.c" "kb_url.c" "kb_state.c" "kb_wav.c"
    INCLUDE_DIRS "."
    PRIV_REQUIRES esp_wifi esp_netif esp_event nvs_flash esp_http_client esp-tls mbedtls json
)
