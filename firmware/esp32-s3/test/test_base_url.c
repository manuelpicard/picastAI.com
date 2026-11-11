// Rechner-Test für kb_api_base_url_ok (ohne ESP-IDF):
//   cc -Wall -Wextra -I main -o /tmp/kb_test test/test_base_url.c main/kb_url.c && /tmp/kb_test
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "kb_url.h"

int main(void)
{
    assert(kb_api_base_url_ok("https://kunibert.example"));
    assert(kb_api_base_url_ok("https://kunibert.example:8443"));
    assert(!kb_api_base_url_ok(NULL));
    assert(!kb_api_base_url_ok(""));
    assert(!kb_api_base_url_ok("https://"));
    assert(!kb_api_base_url_ok("http://kunibert.example"));
    assert(!kb_api_base_url_ok("https://kunibert.example/"));
    assert(!kb_api_base_url_ok("https:///pfad"));
    assert(!kb_api_base_url_ok("https://kuni bert.example"));
    char lang[400];
    memset(lang, 'a', sizeof(lang) - 1);
    lang[sizeof(lang) - 1] = '\0';
    memcpy(lang, "https://", 8);
    assert(!kb_api_base_url_ok(lang));
    puts("ok");
    return 0;
}
