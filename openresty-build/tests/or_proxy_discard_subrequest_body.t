#!/usr/bin/perl

# Local test for the OpenResty interaction of nginx 148c75678 ("Proxy: use
# zero Content-Length while discarding request body"): a subrequest inherits
# r->discard_body from its parent, and ngx.location.capture{body=...} gives it
# its own body; the proxied subrequest must announce that body's length,
# not "Content-Length: 0" followed by the body bytes.
# Not part of nginx-tests; written for the OpenResty 1.31.8.1 backport.

###############################################################################

use warnings;
use strict;

use Test::More;

BEGIN { use FindBin; chdir($FindBin::Bin); }

use lib 'lib';
use Test::Nginx;

###############################################################################

select STDERR; $| = 1;
select STDOUT; $| = 1;

my $t = Test::Nginx->new()->has(qw/http proxy/)->plan(3)
	->write_file_expand('nginx.conf', <<'EOF');

%%TEST_GLOBALS%%

daemon off;

events {
}

http {
    %%TEST_GLOBALS_HTTP%%

    lingering_time 1s;
    lingering_timeout 1s;

    upstream u {
        server 127.0.0.1:8081;
        keepalive 4;
    }

    server {
        listen       127.0.0.1:8080;
        server_name  localhost;

        location /t {
            content_by_lua_block {
                ngx.req.discard_body()
                local res = ngx.location.capture("/up",
                    { method = ngx.HTTP_POST, body = "hello" })
                local res2 = ngx.location.capture("/up2")
                ngx.say(res.body, " | ", res2.body)
            }
        }

        location /up {
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_pass http://u/echo;
        }

        location /up2 {
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_pass http://u/second;
        }
    }

    server {
        listen       127.0.0.1:8081;
        server_name  localhost;

        location / {
            content_by_lua_block {
                ngx.req.read_body()
                ngx.print(ngx.var.request_method, " ", ngx.var.uri,
                          " cl=", ngx.var.http_content_length or "-",
                          " body=", ngx.req.get_body_data() or "")
            }
        }
    }
}

EOF

$t->run();

###############################################################################

# the client announces 100 body bytes and sends 10, so the main request is
# still discarding its body when the subrequests run

my $r = http(<<EOF, sleep => 0.2);
POST /t HTTP/1.1
Host: localhost
Connection: close
Content-Length: 100

0123456789
EOF

like($r, qr/POST \/echo cl=5 body=hello/, 'capture body length announced');
like($r, qr/GET \/second cl=(-|0) body=\s*$/m, 'next upstream request intact');
unlike($r, qr/POST \/echo cl=0/, 'no zero Content-Length with a body');

###############################################################################
