// Prüfung der Server-Adresse. Bewusst ohne ESP-IDF, damit sie auf dem Rechner testbar ist.
#include "kb_url.h"

#include <stddef.h>
#include <string.h>

bool kb_api_base_url_ok(const char *base_url)
{
    static const char prefix[] = "https://";
    if (base_url == NULL) {
        return false;
    }
    size_t len = strlen(base_url);
    size_t prefix_len = sizeof(prefix) - 1;
    if (len <= prefix_len || len >= KB_URL_MAX - 16) {
        return false;
    }
    if (strncmp(base_url, prefix, prefix_len) != 0) {
        return false;
    }
    if (base_url[len - 1] == '/') {
        return false;
    }
    // Hostname darf nicht leer sein und keine Leerzeichen enthalten.
    const char *host = base_url + prefix_len;
    if (host[0] == '/' || host[0] == ':' || strchr(host, ' ') != NULL) {
        return false;
    }
    return true;
}

typedef struct {
    const char *host;
    size_t host_len;
    long port;
} kb_origin_t;

static char lower(char c)
{
    return (c >= 'A' && c <= 'Z') ? (char)(c - 'A' + 'a') : c;
}

static bool parse_origin(const char *url, kb_origin_t *out)
{
    static const char prefix[] = "https://";
    size_t prefix_len = sizeof(prefix) - 1;
    if (url == NULL) {
        return false;
    }
    for (size_t i = 0; i < prefix_len; i++) {
        if (lower(url[i]) != prefix[i]) {
            return false;
        }
    }
    const char *authority = url + prefix_len;
    size_t authority_len = strcspn(authority, "/?#");
    if (authority_len == 0 || memchr(authority, '@', authority_len) != NULL ||
        memchr(authority, ' ', authority_len) != NULL) {
        return false;
    }
    const char *colon = memchr(authority, ':', authority_len);
    out->host = authority;
    out->host_len = colon != NULL ? (size_t)(colon - authority) : authority_len;
    out->port = 443;
    if (out->host_len == 0) {
        return false;
    }
    if (colon != NULL) {
        const char *p = colon + 1;
        const char *end = authority + authority_len;
        if (p == end || end - p > 5) {
            return false;
        }
        long port = 0;
        for (; p < end; p++) {
            if (*p < '0' || *p > '9') {
                return false;
            }
            port = port * 10 + (*p - '0');
        }
        if (port < 1 || port > 65535) {
            return false;
        }
        out->port = port;
    }
    return true;
}

bool kb_url_same_origin(const char *first, const char *second)
{
    kb_origin_t a;
    kb_origin_t b;
    if (!parse_origin(first, &a) || !parse_origin(second, &b)) {
        return false;
    }
    if (a.port != b.port || a.host_len != b.host_len) {
        return false;
    }
    for (size_t i = 0; i < a.host_len; i++) {
        if (lower(a.host[i]) != lower(b.host[i])) {
            return false;
        }
    }
    return true;
}

kb_retry_t kb_retry_decide(int http_status, bool has_retryable, bool retryable,
                           int attempts_done, unsigned long elapsed_ms)
{
    if (attempts_done >= KB_MAX_ATTEMPTS || elapsed_ms >= KB_PIPELINE_TIMEOUT_MS) {
        return KB_RETRY_NONE;
    }
    if (has_retryable && !retryable) {
        return KB_RETRY_NONE;
    }
    if (http_status == 0) {
        return KB_RETRY_ONCE; // Netzfehler oder Zeitüberschreitung
    }
    if (http_status >= 500 && http_status <= 599) {
        return KB_RETRY_ONCE;
    }
    return KB_RETRY_NONE; // 2xx, 3xx (keine Weiterleitungen folgen), 4xx
}
